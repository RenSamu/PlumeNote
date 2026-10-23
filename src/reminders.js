// Rappels de tâches : notifications locales (APK) ou minuteries tant que l'app est ouverte (web).
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { App as CapApp } from '@capacitor/app';
import { state, allTasks, applyTaskAction, flush } from './store.js';
import { dueDate, ymd, addDays, startOfDay } from './md.js';
import * as cal from './calendar.js';

// `__PLUME_LN__` : faux plugin de notifications utilisé par les tests automatiques.
const LN = () => globalThis.__PLUME_LN__ || LocalNotifications;
const native = () => !!globalThis.__PLUME_LN__ || Capacitor.isNativePlatform();
const MAX_SCHEDULED = 120;
const MORNING_BASE = 2147483100; // identifiants réservés au point du matin (7 jours)
const MORNING_DAYS = 7;
const ACTION_TYPE = 'plume-task';
let webTimers = [];
let onOpenNote = () => {};
let onOpenToday = () => {};
let onFallback = () => {};
let onNotice = () => {};

function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return Math.abs(h) % 2147483000 + 1;
}

export function setHandlers({ openNote, openToday, fallback, notice }) {
  onOpenNote = openNote; onFallback = fallback;
  if (openToday) onOpenToday = openToday;
  if (notice) onNotice = notice;
  if (native()) {
    try {
      LN().registerActionTypes({ types: [{ id: ACTION_TYPE, actions: [
        { id: 'done', title: 'Fait' },
        { id: 'hour', title: 'Dans 1 h' },
        { id: 'tomorrow', title: 'Demain' },
      ] }] });
    } catch (e) { console.warn('Actions de rappel indisponibles', e); }
    LN().addListener('localNotificationActionPerformed', (e) => handleAction(e.actionId, e.notification?.extra || {}));
  }
}

/** Réagit à un appui sur une notification ou l'un de ses boutons. */
export function handleAction(actionId, extra) {
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
    const lines = [
      ...evs.map((e) => `${e.allDay ? 'Journée' : hhmm(new Date(e.start))}  ${e.title}`),
      ...dayTasks.map((t) => `☐ ${t.due.time ? t.due.time + '  ' : ''}${t.text}`),
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
