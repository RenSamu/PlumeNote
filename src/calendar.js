// Calendrier du téléphone (Android) : lecture des rendez-vous et création d'événements.
// Sur le web il n'y a pas de calendrier local : seules les tâches de Plume sont affichées.
import { Capacitor } from '@capacitor/core';
import { CapacitorCalendar } from '@ebarooni/capacitor-calendar';
import { ymd, parseYmd, startOfDay, addDays } from './md.js';

// Les tests branchent ici un faux calendrier (jamais défini en production).
const fake = () => globalThis.__PLUME_CAL__ || null;
const native = () => Capacitor.isNativePlatform();

export const supported = () => !!fake() || native();

/** 'granted' | 'denied' | 'prompt' | 'unsupported' */
export async function permission() {
  if (fake()) return fake().permission();
  if (!native()) return 'unsupported';
  try {
    const r = await CapacitorCalendar.checkPermission({ scope: 'readCalendar' });
    return r.result === 'granted' ? 'granted' : r.result === 'denied' ? 'denied' : 'prompt';
  } catch { return 'prompt'; }
}

export async function requestAccess() {
  if (fake()) return fake().request();
  if (!native()) return 'unsupported';
  try {
    const r = await CapacitorCalendar.requestFullCalendarAccess();
    return r.result === 'granted' ? 'granted' : 'denied';
  } catch { return 'denied'; }
}

// Un événement « toute la journée » est stocké à minuit UTC : on le rattache au jour affiché, sans décalage.
const utcDay = (ts) => {
  const d = new Date(ts);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

function normalize(e) {
  const allDay = !!e.isAllDay;
  return {
    id: String(e.id ?? `${e.title}-${e.startDate}`),
    title: (e.title || '').trim() || 'Sans titre',
    allDay,
    start: allDay ? utcDay(e.startDate) : new Date(e.startDate),
    end: allDay ? utcDay(e.endDate) : new Date(e.endDate),
    location: e.location || '',
  };
}

/** Jours (AAAA-MM-JJ) couverts par un événement normalisé, bornés à ceux qui nous intéressent. */
function daysOf(ev, keys) {
  const out = [];
  const last = ev.allDay ? (ev.end > ev.start ? addDays(ev.end, -1) : ev.start) : new Date(Math.max(ev.start, ev.end - 1));
  for (let d = startOfDay(ev.start); d <= last; d = addDays(d, 1)) {
    const k = ymd(d);
    if (keys.has(k)) out.push(k);
    if (out.length > 31) break;
  }
  return out.length ? out : [];
}

/**
 * Rendez-vous des `count` jours à partir de `fromDay` (AAAA-MM-JJ).
 * Retourne { 'AAAA-MM-JJ': [événements triés] }.
 */
export async function eventsByDay(fromDay, count = 1) {
  const first = parseYmd(fromDay);
  const keys = new Set(Array.from({ length: count }, (_, i) => ymd(addDays(first, i))));
  const from = first.getTime() - 86400000; // marge pour les événements « toute la journée » (UTC)
  const to = addDays(first, count).getTime() + 86400000;
  let raw;
  if (fake()) raw = await fake().list(from, to);
  else {
    const r = await CapacitorCalendar.listEventsInRange({ from, to });
    raw = r.result || [];
  }
  const out = {};
  for (const k of keys) out[k] = [];
  const seen = new Set();
  for (const e of raw.map(normalize)) {
    for (const k of daysOf(e, keys)) {
      const sig = `${e.id}|${k}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      out[k].push(e);
    }
  }
  for (const k of keys) out[k].sort((a, b) => (a.allDay === b.allDay ? a.start - b.start : a.allDay ? -1 : 1));
  return out;
}

/** Crée un événement d'une heure (par défaut) à la date et l'heure données. Retourne son identifiant. */
export async function addEvent({ title, date, time, minutes = 60, notes = '' }) {
  const start = parseYmd(date, time).getTime();
  const opts = { title, startDate: start, endDate: start + minutes * 60000, description: notes || undefined };
  if (fake()) return fake().create(opts);
  const r = await CapacitorCalendar.createEvent(opts);
  return r?.id ?? null;
}
