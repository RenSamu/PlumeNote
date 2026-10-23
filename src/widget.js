// Widget Agenda de l'écran d'accueil : Android ne peut pas lire la base de l'application,
// on lui dépose donc un instantané (7 jours de rendez-vous et de tâches) à chaque changement.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { state, allTasks } from './store.js';
import { ymd, addDays, startOfDay } from './md.js';
import * as cal from './calendar.js';

const Native = registerPlugin('PlumeNative');
const DAYS = 7;
const MAX_ROWS = 8;
// `__PLUME_NATIVE__` : faux module natif pour les tests automatiques.
const bridge = () => globalThis.__PLUME_NATIVE__ || (Capacitor.isNativePlatform() ? Native : null);

const hhmm = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

export async function buildSnapshot(now = new Date()) {
  const today = ymd(now);
  let events = {};
  try { if ((await cal.permission()) === 'granted') events = await cal.eventsByDay(today, DAYS); } catch {}
  const tasks = allTasks().filter((t) => !t.done && t.due);
  const days = {};
  for (let i = 0; i < DAYS; i++) {
    const key = ymd(addDays(startOfDay(now), i));
    const rows = [];
    for (const e of events[key] || []) rows.push({ s: e.allDay ? '' : hhmm(e.start), t: e.title, k: 'e' });
    for (const t of tasks) {
      if (i === 0 ? t.due.date <= key : t.due.date === key) rows.push({ s: t.due.time || '', t: t.text, k: 't', late: i === 0 && t.due.date < key });
    }
    // Journée entière d'abord, puis par heure, puis les tâches sans heure.
    rows.sort((a, b) => {
      const ka = a.s || (a.k === 'e' ? '' : '~'), kb = b.s || (b.k === 'e' ? '' : '~');
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
    days[key] = { rows: rows.slice(0, MAX_ROWS), more: Math.max(0, rows.length - MAX_ROWS) };
  }
  return { updated: Date.now(), days };
}

let timer = null;
export function refreshWidget(delay = 1500) {
  if (!bridge()) return;
  clearTimeout(timer);
  timer = setTimeout(async () => {
    try { await bridge().setAgenda({ json: JSON.stringify(await buildSnapshot()) }); }
    catch (e) { console.warn('Widget indisponible', e); }
  }, delay);
}
