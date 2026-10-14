// Bloc « Agenda » affiché en haut des notes du jour : rendez-vous du téléphone, tâches à faire, semaine à venir.
import { h } from './ui.js';
import { icon } from './icons.js';
import { ctx } from './ctx.js';
import { state, allTasks, toggleTaskLine, setSetting, subscribe } from './store.js';
import { ymd, parseYmd, addDays, dueLabel, dueState, dueDate, weekdayAbbr, weekdayName } from './md.js';
import * as cal from './calendar.js';

const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
const MAX_TASKS = 6;
const WEEK = 7;

export function createAgenda() {
  const el = h('section', { class: 'agenda', hidden: true, 'aria-label': 'Agenda' });
  let note = null;
  let seq = 0;
  let cache = null; // { key, at, events }
  let access = 'unsupported';

  const open = () => state.settings.agendaOpen !== false;

  async function loadEvents(date, count, force) {
    const key = `${date}|${count}`;
    if (!force && cache && cache.key === key && Date.now() - cache.at < 30000) return cache.events;
    const events = await cal.eventsByDay(date, count);
    cache = { key, at: Date.now(), events };
    return events;
  }

  function tasksFor(date, isToday) {
    const out = [];
    for (const t of allTasks()) {
      if (t.done || !t.due || t.noteId === note.id) continue;
      if (isToday ? t.due.date <= date : t.due.date === date) out.push(t);
    }
    return out.sort((a, b) => dueDate(a.due, '23:59') - dueDate(b.due, '23:59'));
  }

  function weekTasks(date) {
    const map = {};
    for (let i = 1; i < WEEK; i++) map[ymd(addDays(parseYmd(date), i))] = [];
    for (const t of allTasks()) if (!t.done && t.due && map[t.due.date]) map[t.due.date].push(t);
    return map;
  }

  const eventRow = (e) => h('div', { class: 'ag-row' },
    h('span', { class: 'ag-time' }, e.allDay ? 'Journée' : hhmm(e.start)),
    h('span', { class: 'ag-title' }, e.title,
      e.location ? h('span', { class: 'ag-sub' }, e.location) : null));

  const taskItem = (t) => h('div', { class: 'ag-row ag-task' },
    h('button', { class: 'check', type: 'button', role: 'checkbox', 'aria-checked': 'false', 'aria-label': 'Terminer la tâche',
      onclick: () => { toggleTaskLine(t.noteId, t.line); } }),
    h('button', { class: 'ag-main', type: 'button', onclick: () => ctx.openNote(t.noteId, { line: t.line }) },
      h('span', { class: 'ag-title' }, t.text || 'Tâche sans titre', h('span', { class: 'ag-sub' }, t.noteTitle || 'Note sans titre')),
      h('span', { class: 'chip chip-' + (dueState(t.due, false) || 'plain') }, dueLabel(t.due))));

  function block(label, count, ...rows) {
    return h('div', { class: 'ag-block' }, h('div', { class: 'ag-label' }, label, count != null ? h('span', { class: 'ag-n' }, String(count)) : null), ...rows);
  }

  async function render() {
    const my = ++seq;
    if (!note || note.kind !== 'daily' || note.deletedAt) { el.hidden = true; return; }
    const date = note.date;
    const isToday = date === ymd(new Date());
    el.hidden = false;

    access = await cal.permission();
    if (my !== seq) return;

    let events = null; // { jour: [événements] } ou null si indisponible
    let message = null; // texte explicatif à la place des rendez-vous
    let action = null;
    if (access === 'granted') {
      try { events = await loadEvents(date, isToday ? WEEK : 1, false); }
      catch (e) { message = 'Le calendrier du téléphone ne répond pas.'; }
    } else if (access === 'unsupported') {
      message = 'Vos rendez-vous du téléphone s’affichent ici dans l’application Android.';
    } else {
      message = access === 'denied'
        ? 'L’accès au calendrier est refusé. Autorisez-le dans les réglages du téléphone, puis réessayez.'
        : 'Plume peut afficher vos rendez-vous du jour. Elle ne les modifie jamais sans votre accord.';
      action = h('button', { class: 'btn btn-primary sm', type: 'button', onclick: async () => {
        const r = await cal.requestAccess();
        cache = null;
        if (r === 'granted') render(); else { access = 'denied'; render(); }
      } }, access === 'denied' ? 'Réessayer' : 'Afficher mes rendez-vous');
    }
    if (my !== seq) return;

    const todayEvents = events ? events[date] || [] : [];
    const tasks = tasksFor(date, isToday);
    const week = isToday ? weekTasks(date) : null;

    // En-tête
    const bits = [];
    if (events) bits.push(plural(todayEvents.length, 'rendez-vous', 'rendez-vous'));
    bits.push(plural(tasks.length, 'tâche', 'tâches'));
    const head = h('button', { class: 'ag-head', type: 'button', 'aria-expanded': String(open()),
      onclick: () => setSetting('agendaOpen', !open()) },
      h('span', { class: 'ag-ic', html: icon('calendar', 18) }),
      h('span', { class: 'ag-name' }, 'Agenda'),
      h('span', { class: 'ag-summary' }, bits.join(' · ')),
      h('span', { class: 'ag-chev', html: icon(open() ? 'down' : 'chevron', 16) }));

    const body = h('div', { class: 'ag-body', hidden: !open() });

    // Rendez-vous
    if (events) {
      body.appendChild(todayEvents.length
        ? block('Rendez-vous', todayEvents.length, ...todayEvents.map(eventRow))
        : block('Rendez-vous', null, h('div', { class: 'ag-empty' }, isToday ? 'Rien de prévu aujourd’hui.' : 'Rien de prévu ce jour-là.')));
    } else if (message) {
      body.appendChild(h('div', { class: 'ag-note' }, h('span', {}, message), action));
    }

    // Tâches
    if (tasks.length) {
      const shown = tasks.slice(0, MAX_TASKS);
      body.appendChild(block(isToday ? 'À faire' : 'Prévu ce jour-là', tasks.length, ...shown.map(taskItem),
        tasks.length > shown.length ? h('button', { class: 'ag-more', type: 'button', onclick: () => ctx.openCollection({ c: 'tasks' }) }, `+ ${tasks.length - shown.length} autres dans Tâches`) : null));
    }

    // Semaine
    if (week) {
      const rows = [];
      for (let i = 1; i < WEEK; i++) {
        const d = addDays(parseYmd(date), i);
        const k = ymd(d);
        const evs = events ? events[k] || [] : [];
        const tks = week[k] || [];
        if (!evs.length && !tks.length) continue;
        const items = [
          ...evs.map((e) => (e.allDay ? e.title : `${hhmm(e.start)} ${e.title}`)),
          ...tks.map((t) => (t.due.time ? `${t.due.time} ${t.text}` : t.text)),
        ];
        rows.push(h('div', { class: 'ag-day' },
          h('span', { class: 'ag-dname', title: weekdayName(d) }, `${weekdayAbbr(d)} ${d.getDate()}`),
          h('span', { class: 'ag-ditems' }, items.slice(0, 3).join(' · ') + (items.length > 3 ? ` · +${items.length - 3}` : ''))));
      }
      body.appendChild(block('Cette semaine', null, ...(rows.length ? rows : [h('div', { class: 'ag-empty' }, 'Rien de prévu les six prochains jours.')])));
    }

    el.replaceChildren(head, body);
  }

  subscribe((e) => {
    if (!note || el.hidden && e.type !== 'settings') return;
    if (e.type === 'settings' || e.source === 'tasks' || e.source === 'sync' || e.type === 'notes') refresh();
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && note) refresh({ force: true }); });

  let timer = null;
  function refresh({ force = false } = {}) {
    if (force) cache = null;
    clearTimeout(timer);
    timer = setTimeout(render, 120);
  }

  return {
    el,
    show(n) { note = n; refresh(); },
    hide() { note = null; seq++; el.hidden = true; },
    refresh,
  };
}
