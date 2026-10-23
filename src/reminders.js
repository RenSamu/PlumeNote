// Rappels de tâches : notifications locales (APK) ou minuteries tant que l'app est ouverte (web).
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { App as CapApp } from '@capacitor/app';
import { state, allTasks, applyTaskAction, flush, getNote } from './store.js';
import { dueDate, ymd, addDays, startOfDay } from './md.js';
import * as cal from './calendar.js';
import { habits, weekCount, toggleHabitDay, streak, parseHabit } from './habits.js';

// `__PLUME_LN__` : faux plugin de notifications utilisé par les tests automatiques.
const LN = () => globalThis.__PLUME_LN__ || LocalNotifications;
const native = () => !!globalThis.__PLUME_LN__ || Capacitor.isNativePlatform();
const MAX_SCHEDULED = 120;
const MORNING_BASE = 2147483100; // identifiants réservés au point du matin (7 jours)
const MORNING_DAYS = 7;
const REVIEW_BASE = 2147483120; // identifiants réservés à la revue du dimanche (4 semaines)
const ACTION_TYPE = 'plume-task';
const HABIT_TYPE = 'plume-habit';
const HABIT_BASE = 2147483200; // 7 identifiants par habitude
let webTimers = [];
let onOpenNote = () => {};
let onOpenToday = () => {};
let onOpenReview = () => {};
let onFallback = () => {};
let onNotice = () => {};

function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return Math.abs(h) % 2147483000 + 1;
}

export function setHandlers({ openNote, openToday, openReview, fallback, notice }) {
  onOpenNote = openNote; onFallback = fallback;
  if (openReview) onOpenReview = openReview;
  if (openToday) onOpenToday = openToday;
  if (notice) onNotice = notice;
  if (native()) {
    try {
      LN().registerActionTypes({ types: [
        { id: ACTION_TYPE, actions: [
          { id: 'done', title: 'Fait' },
          { id: 'hour', title: 'Dans 1 h' },
          { id: 'tomorrow', title: 'Demain' },
        ] },
        { id: HABIT_TYPE, actions: [{ id: 'done', title: 'Fait' }] },
      ] });
    } catch (e) { console.warn('Actions de rappel indisponibles', e); }
    LN().addListener('localNotificationActionPerformed', (e) => handleAction(e.actionId, e.notification?.extra || {}));
  }
}

/** Réagit à un appui sur une notification ou l'un de ses boutons. */
export function handleAction(actionId, extra) {
  if (extra.habit) {
    if (actionId === 'done') {
      const n = getNote(extra.habit);
      if (n) {
        const hb = parseHabit(n);
        const key = extra.day || ymd(new Date());
        if (!hb.days.has(key)) toggleHabitDay(hb.id, key);
        const st = streak(parseHabit(getNote(hb.id)));
        flush();
        onNotice(`${hb.name} : fait${st.n >= 2 ? ` · série de ${st.n} ${st.unit}` : ''}`);
        reschedule();
        if (Capacitor.isNativePlatform()) setTimeout(() => { Promise.resolve(CapApp.minimizeApp()).catch(() => {}); }, 1800);
      }
      return;
    }
    onOpenNote(extra.habit);
    return;
  }
  if (extra.review) { onOpenReview(); return; }
  if (extra.today) { onOpenToday(); return; }
  if (extra.noteId && (actionId === 'done' || actionId === 'hour' || actionId === 'tomorrow')) {
    const r = applyTaskAction(extra.noteId, { text: extra.text, line: extra.line }, actionId);
    flush();
    onNotice(r ? `${r.label} : ${r.text}` : 'Cette tâche n’existe plus');
    reschedule();
    // Sur Android, un bouton de notification ouvre l'application : on la referme aussitôt.
    if (Capacitor.isNativePlatform()) setTimeout(() => { Promise.resolve(CapApp.minimizeApp()).catch(() => {}); }, 1800);
    return;
  }
  if (extra.noteId) onOpenNote(extra.noteId);
}

export async function permissionState() {
  if (native()) {
    try { return (await LN().checkPermissions()).display; } catch { return 'denied'; }
  }
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission === 'default' ? 'prompt' : Notification.permission;
}

export async function requestPermission() {
  if (native()) {
    try { return (await LN().requestPermissions()).display; } catch { return 'denied'; }
  }
  if (!('Notification' in window)) return 'unsupported';
  const r = await Notification.requestPermission();
  return r === 'default' ? 'prompt' : r;
}

function upcoming() {
  const now = Date.now();
  const def = state.settings.reminderTime || '09:00';
  const out = [];
  for (const t of allTasks()) {
    if (t.done || !t.due) continue;
    const at = dueDate(t.due, def);
    if (at.getTime() > now + 2000) out.push({ ...t, at });
  }
  return out.sort((a, b) => a.at - b.at);
}

let pending = null;
export function reschedule() {
  clearTimeout(pending);
  pending = setTimeout(doReschedule, 1200);
}

const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

/** Un point du matin par jour des 7 prochains jours (les jours sans rien de prévu sont ignorés). */
export async function morningBriefs(now = new Date()) {
  if (state.settings.morningOn === false) return [];
  const time = state.settings.morningTime || '07:30';
  const today = ymd(now);
  let events = {};
  try {
    if ((await cal.permission()) === 'granted') events = await cal.eventsByDay(today, MORNING_DAYS);
  } catch {}
  const tasks = allTasks().filter((t) => !t.done && t.due);
  const out = [];
  for (let i = 0; i < MORNING_DAYS; i++) {
    const day = addDays(startOfDay(now), i);
    const key = ymd(day);
    const at = dueDate({ date: key, time: null }, time);
    if (at.getTime() <= now.getTime() + 2000) continue;
    const evs = events[key] || [];
    const dayTasks = tasks
      .filter((t) => (i === 0 ? t.due.date <= key : t.due.date === key))
      .sort((a, b) => (a.due.time || '99').localeCompare(b.due.time || '99'));
    if (!evs.length && !dayTasks.length) continue;
    const parts = [];
    if (evs.length) parts.push(plural(evs.length, 'rendez-vous', 'rendez-vous'));
    if (dayTasks.length) parts.push(plural(dayTasks.length, 'tâche', 'tâches'));
    const hnames = habits().map((x) => x.name).slice(0, 4);
    const lines = [
      ...evs.map((e) => `${e.allDay ? 'Journée' : hhmm(new Date(e.start))}  ${e.title}`),
      ...dayTasks.map((t) => `☐ ${t.due.time ? t.due.time + '  ' : ''}${t.text}`),
      ...(hnames.length ? [`↻ Habitudes : ${hnames.join(', ')}`] : []),
    ];
    out.push({
      id: MORNING_BASE + i,
      title: day.toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long' }),
      body: parts.join(' · '),
      largeBody: lines.slice(0, 12).join('\n'),
      summaryText: 'Plume',
      schedule: { at, allowWhileIdle: true },
      extra: { today: true },
      smallIcon: 'ic_stat_plume',
      iconColor: '#F2A33A',
    });
  }
  return out;
}

/** Rappels d'habitudes (7 prochains jours), sauf les jours déjà validés ou l'objectif de la semaine atteint. */
export function habitReminders(now = new Date()) {
  const out = [];
  habits().forEach((hb, hi) => {
    if (!hb.reminder) return;
    const st = streak(hb, now);
    for (let i = 0; i < 7; i++) {
      const day = addDays(startOfDay(now), i);
      const key = ymd(day);
      const at = dueDate({ date: key, time: null }, hb.reminder);
      if (at.getTime() <= now.getTime() + 2000) continue;
      if (hb.days.has(key)) continue;
      if (hb.perWeek < 7 && weekCount(hb, day) >= hb.perWeek) continue;
      out.push({
        id: HABIT_BASE + hi * 7 + i,
        title: hb.name,
        body: st.n >= 1 ? `Série en cours : ${st.n} ${st.unit}` : 'C’est le moment.',
        schedule: { at, allowWhileIdle: true },
        actionTypeId: HABIT_TYPE,
        extra: { habit: hb.id, day: key },
        smallIcon: 'ic_stat_plume',
        iconColor: '#F2A33A',
      });
    }
  });
  return out;
}

/** Rappel du dimanche soir pour la revue de la semaine (4 prochains dimanches). */
export function reviewReminders(now = new Date()) {
  if (state.settings.reviewOn === false) return [];
  const time = state.settings.reviewTime || '18:00';
  const out = [];
  const first = startOfDay(now);
  first.setDate(first.getDate() + ((7 - first.getDay()) % 7)); // prochain dimanche (aujourd'hui compris)
  for (let i = 0; i < 4; i++) {
    const day = addDays(first, i * 7);
    const at = dueDate({ date: ymd(day), time: null }, time);
    if (at.getTime() <= now.getTime() + 2000) continue;
    out.push({
      id: REVIEW_BASE + i,
      title: 'Revue de la semaine',
      body: 'Cinq minutes pour faire le point : retards, semaine à venir, boîte de réception.',
      schedule: { at, allowWhileIdle: true },
      extra: { review: true },
      smallIcon: 'ic_stat_plume',
      iconColor: '#F2A33A',
    });
  }
  return out;
}

async function doReschedule() {
  const tasks = upcoming();
  if (native()) {
    try {
      const perm = await LN().checkPermissions();
      const queue = await LN().getPending();
      if (queue.notifications.length) await LN().cancel({ notifications: queue.notifications.map((n) => ({ id: n.id })) });
      if (perm.display !== 'granted') return;
      const notifications = tasks.slice(0, MAX_SCHEDULED).map((t) => ({
        id: hash(`${t.noteId}|${t.line}|${t.text}`),
        title: t.noteTitle || 'Plume',
        body: (t.rec ? '↻ ' : '') + t.text,
        schedule: { at: t.at, allowWhileIdle: true },
        actionTypeId: ACTION_TYPE,
        extra: { noteId: t.noteId, line: t.line, text: t.text },
        smallIcon: 'ic_stat_plume',
        iconColor: '#F2A33A',
      }));
      notifications.push(...(await morningBriefs()));
      notifications.push(...reviewReminders());
      notifications.push(...habitReminders());
      if (notifications.length) await LN().schedule({ notifications });
    } catch (e) { console.warn('Rappels indisponibles', e); }
    return;
  }
  webTimers.forEach(clearTimeout);
  webTimers = [];
  const horizon = Date.now() + 24 * 3600 * 1000;
  for (const t of tasks) {
    const delay = t.at.getTime() - Date.now();
    if (t.at.getTime() > horizon || delay > 2147000000) break;
    webTimers.push(setTimeout(() => fire(t), delay));
  }
}

function fire(t) {
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      const n = new Notification(t.noteTitle || 'Plume', { body: t.text, tag: `${t.noteId}-${t.line}` });
      n.onclick = () => { window.focus(); onOpenNote(t.noteId); n.close(); };
      return;
    } catch {}
  }
  onFallback(t);
}
