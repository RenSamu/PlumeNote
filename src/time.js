// Temps passé : additionne les durées « ⏱ 1h30 » écrites dans les notes, par période et par client.
import { h, toast } from './ui.js';
import { icon } from './icons.js';
import { ctx } from './ctx.js';
import { liveNotes } from './store.js';
import { ymd, parseYmd, addDays, startOfDay, parseDurations, fmtMinutes, wikiSpans, relTime } from './md.js';

const PERIODS = [
  ['week', 'Cette semaine'],
  ['lastweek', 'Semaine dernière'],
  ['month', 'Ce mois'],
  ['lastmonth', 'Mois dernier'],
];

export function periodRange(id, now = new Date()) {
  const today = startOfDay(now);
  const monday = addDays(today, -((today.getDay() + 6) % 7));
  if (id === 'week') return [monday, addDays(monday, 7)];
  if (id === 'lastweek') return [addDays(monday, -7), monday];
  const m0 = new Date(today.getFullYear(), today.getMonth(), 1);
  if (id === 'month') return [m0, new Date(today.getFullYear(), today.getMonth() + 1, 1)];
  return [new Date(today.getFullYear(), today.getMonth() - 1, 1), m0];
}

/** Entrées de temps : [{ date, minutes, client, note }], limitées à [from, to[. */
export function timeEntries(from, to) {
  const a = ymd(from), b = ymd(to);
  const out = [];
  for (const n of liveNotes()) {
    if (n.kind === 'template' || !n.body.includes('⏱')) continue;
    const date = n.kind === 'daily' && n.date ? n.date : ymd(new Date(n.createdAt));
    if (date < a || date >= b) continue;
    const noteClient = (wikiSpans(n.body)[0] || {}).title || null;
    for (const line of n.body.split('\n')) {
      if (!line.includes('⏱')) continue;
      const links = wikiSpans(line);
      for (const d of parseDurations(line)) {
        out.push({ date, minutes: d.minutes, client: (links[0] && links[0].title) || noteClient || 'Sans client', note: n });
      }
    }
  }
  return out.sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0));
}

export function summarize(entries) {
  const total = entries.reduce((s, e) => s + e.minutes, 0);
  const byClient = new Map();
  for (const e of entries) byClient.set(e.client, (byClient.get(e.client) || 0) + e.minutes);
  return { total, byClient: [...byClient.entries()].sort((p, q) => q[1] - p[1]) };
}

const shortDate = (k) => { const d = parseYmd(k); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`; };

export function summaryText(label, entries) {
  const { total, byClient } = summarize(entries);
  const lines = [`Temps passé : ${label}`, `Total : ${fmtMinutes(total)}`, ''];
  for (const [c, m] of byClient) lines.push(`${c} : ${fmtMinutes(m)}`);
  lines.push('', 'Détail');
  for (const e of entries) lines.push(`${shortDate(e.date)} · ${e.client} · ${e.note.title || 'Note'} · ${fmtMinutes(e.minutes)}`);
  return lines.join('\n');
}

let period = 'week';

export function renderTime(extra, body, countEl) {
  countEl.textContent = '';
  extra.replaceChildren(h('div', { class: 'tm-tabs', role: 'tablist' }, ...PERIODS.map(([id, label]) =>
    h('button', { class: 'tm-tab' + (id === period ? ' on' : ''), type: 'button', role: 'tab', 'aria-selected': String(id === period), onclick: () => { period = id; ctx.refreshList(); } }, label))));
  const [from, to] = periodRange(period);
  const entries = timeEntries(from, to);
  const { total, byClient } = summarize(entries);
  const label = PERIODS.find((p) => p[0] === period)[1];
  body.replaceChildren();
  if (!entries.length) {
    body.appendChild(h('div', { class: 'empty' },
      h('div', { class: 'empty-ill', html: icon('clock', 40) }),
      h('h3', {}, 'Aucun temps noté sur cette période'),
      h('p', {}, 'Écrivez « ⏱ 1h30 » (ou « ⏱ 45min ») dans une note, par exemple avec le modèle Intervention client. Mettez [[le nom du client]] sur la même ligne pour le total par client.')));
    return;
  }
  const max = byClient[0][1];
  body.appendChild(h('div', { class: 'tm-total' }, h('span', { class: 'tm-big' }, fmtMinutes(total)), h('span', { class: 'tm-sub' }, `${entries.length} entrée${entries.length > 1 ? 's' : ''}`),
    h('button', { class: 'btn btn-quiet sm', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(summaryText(label, entries)); toast('Résumé copié'); } catch { toast('Copie impossible ici.'); } } }, 'Copier le résumé')));
  body.appendChild(h('div', { class: 'group' }, 'Par client'));
  byClient.forEach(([c, m]) => body.appendChild(h('div', { class: 'tm-client' },
    h('div', { class: 'tm-cl-head' }, h('span', {}, c), h('span', { class: 'tm-cl-t' }, fmtMinutes(m))),
    h('div', { class: 'tm-bar' }, h('span', { style: `width:${Math.max(4, Math.round((m / max) * 100))}%` })))));
  body.appendChild(h('div', { class: 'group' }, 'Détail'));
  entries.forEach((e) => body.appendChild(h('button', { class: 'tm-row', type: 'button', onclick: () => ctx.openNote(e.note.id) },
    h('span', { class: 'tm-date' }, shortDate(e.date)),
    h('span', { class: 'tm-main' }, h('span', { class: 'tm-title' }, e.note.title || 'Note'), h('span', { class: 'tm-cli' }, e.client)),
    h('span', { class: 'tm-dur' }, fmtMinutes(e.minutes)))));
  void relTime;
}
