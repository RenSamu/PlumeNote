// Santé : poids et séances de sport, dans une seule note (kind « health »).
//   # Santé
//   objectif:: 85
//   2026-11-02 poids 78,5
//   2026-11-02 séance Push 60min
import { h, toast } from './ui.js';
import { icon } from './icons.js';
import { ctx } from './ctx.js';
import { getNote, setBody } from './store.js';
import { ymd, parseYmd, addDays, startOfDay } from './md.js';
import { singleton, appendLine, replaceLine, undoToast, parseNum, fmtNum, empty } from './datanote.js';
import { createNoteTitled } from './store.js';

const W_RE = /^(\d{4}-\d{2}-\d{2})\s+poids\s+(\d+(?:[.,]\d+)?)\s*(?:kg)?\s*$/i;
const S_RE = /^(\d{4}-\d{2}-\d{2})\s+s[ée]ance\s*(.*?)\s*(?:(\d{1,3})\s*min)?\s*$/i;

export const healthNote = () => singleton('health', 'Santé');

export function parseHealth(body) {
  const weights = [], sessions = [];
  body.split('\n').forEach((raw, line) => {
    let m = W_RE.exec(raw.trim());
    if (m) { weights.push({ line, date: m[1], kg: parseFloat(m[2].replace(',', '.')) }); return; }
    m = S_RE.exec(raw.trim());
    if (m) sessions.push({ line, date: m[1], name: m[2] || 'Séance', min: m[3] ? +m[3] : 0 });
  });
  weights.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.line - b.line));
  return { weights, sessions };
}

const noteForWrite = () => healthNote() || createNoteTitled('Santé', { kind: 'health' });

export function logWeight(kg, date = ymd(new Date())) {
  const n = noteForWrite();
  const lines = n.body.split('\n').filter((l) => { const m = W_RE.exec(l.trim()); return !(m && m[1] === date); });
  setBody(n.id, lines.join('\n'));
  appendLine(n.id, `${date} poids ${Number(kg).toFixed(1).replace('.', ',')}`);
}
export function logSession(name, min, date = ymd(new Date())) {
  appendLine(noteForWrite().id, `${date} séance ${name || ''} ${min ? min + 'min' : ''}`.replace(/\s+/g, ' ').trim());
}

const monday = (d) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));
export const sessionsThisWeek = (sessions, now = new Date()) => {
  const a = ymd(monday(now)), b = ymd(addDays(monday(now), 7));
  return sessions.filter((s) => s.date >= a && s.date < b).length;
};

function chart(weights, goal) {
  const pts = weights.slice(-60);
  if (pts.length < 2) return null;
  const W = 320, H = 110, P = 8;
  const t0 = parseYmd(pts[0].date).getTime(), t1 = parseYmd(pts.at(-1).date).getTime() || t0 + 1;
  const vals = pts.map((p) => p.kg).concat(goal > 0 ? [goal] : []);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < 1) { hi += 0.5; lo -= 0.5; }
  const x = (d) => P + ((parseYmd(d).getTime() - t0) / Math.max(1, t1 - t0)) * (W - 2 * P);
  const y = (v) => H - P - ((v - lo) / (hi - lo)) * (H - 2 * P);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)} ${y(p.kg).toFixed(1)}`).join('');
  const last = pts.at(-1);
  const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Courbe de poids">
    ${goal > 0 ? `<line x1="${P}" x2="${W - P}" y1="${y(goal)}" y2="${y(goal)}" class="hl-goal"/>` : ''}
    <path d="${path}" class="hl-line"/>
    ${pts.map((p) => `<circle cx="${x(p.date).toFixed(1)}" cy="${y(p.kg).toFixed(1)}" r="2.6" class="hl-dot"/>`).join('')}
    <circle cx="${x(last.date).toFixed(1)}" cy="${y(last.kg).toFixed(1)}" r="4.4" class="hl-last"/></svg>`;
  return h('div', { class: 'hl-chart', html: svg });
}

function buildForm() {
  const kg = h('input', { class: 'field', type: 'text', inputMode: 'decimal', placeholder: 'Poids (kg)', 'aria-label': 'Poids en kilos' });
  const saveW = () => {
    const v = parseNum(kg.value);
    if (!(v > 20 && v < 400)) { kg.focus(); return; }
    logWeight(Math.round(v * 10) / 10);
    kg.value = '';
    toast(`Poids enregistré : ${fmtNum(v, 1)} kg`);
  };
  kg.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); saveW(); } });
  const sName = h('input', { class: 'field', type: 'text', placeholder: 'Séance (ex. Pecs-triceps)', 'aria-label': 'Nom de la séance', autocomplete: 'off' });
  const sMin = h('input', { class: 'field narrow', type: 'text', inputMode: 'numeric', placeholder: 'min', 'aria-label': 'Durée en minutes' });
  const saveS = () => {
    logSession(sName.value.trim(), parseInt(sMin.value, 10) || 0);
    sName.value = ''; sMin.value = '';
    toast('Séance enregistrée');
  };
  [sName, sMin].forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); saveS(); } }));
  return h('div', { class: 'hl-form' },
    h('div', { class: 'bd-row' }, kg, h('button', { class: 'btn btn-primary sm', type: 'button', onclick: saveW }, 'Peser')),
    h('div', { class: 'bd-row' }, sName, sMin, h('button', { class: 'btn btn-primary sm', type: 'button', onclick: saveS }, 'Séance')));
}

export function renderHealth(extra, body, countEl) {
  countEl.textContent = '';
  if (!extra.querySelector('.hl-form')) extra.replaceChildren(buildForm());
  const note = healthNote();
  const { weights, sessions } = note ? parseHealth(note.body) : { weights: [], sessions: [] };
  body.replaceChildren();
  if (!weights.length && !sessions.length) {
    body.appendChild(empty(icon('heart', 40), 'Pas encore de suivi', 'Entrez votre poids ou une séance ci-dessus. La courbe apparaît dès deux pesées.'));
    return;
  }
  const goal = note?.props?.objectif ? parseNum(note.props.objectif) : NaN;
  if (weights.length) {
    const last = weights.at(-1);
    const ref = weights.filter((w) => w.date <= ymd(addDays(new Date(), -30))).at(-1) || weights[0];
    const diff = last.kg - ref.kg;
    body.appendChild(h('div', { class: 'bd-sum' },
      h('div', {}, h('span', { class: 'bd-k' }, 'Poids'), h('b', {}, fmtNum(last.kg, 1) + ' kg')),
      h('div', {}, h('span', { class: 'bd-k' }, weights.length > 1 ? (ref === weights[0] && ref.date > ymd(addDays(new Date(), -30)) ? 'Depuis le début' : '30 jours') : 'Variation'), h('b', {}, weights.length > 1 ? (diff > 0 ? '+' : '') + fmtNum(diff, 1) : '—')),
      h('div', {}, h('span', { class: 'bd-k' }, 'Objectif'), h('b', {}, goal > 0 ? fmtNum(goal, 1) : '—'))));
    const c = chart(weights, goal);
    if (c) body.appendChild(c);
  }
  const wk = sessionsThisWeek(sessions);
  body.appendChild(h('div', { class: 'group' }, `Séances : ${wk} cette semaine`));
  [...sessions].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.line - a.line)).slice(0, 12).forEach((s) => {
    body.appendChild(h('div', { class: 'bd-entry' },
      h('span', { class: 'bd-d' }, s.date.slice(8) + '.' + s.date.slice(5, 7)),
      h('span', { class: 'bd-l' }, h('b', {}, s.name)),
      h('span', { class: 'bd-a' }, s.min ? s.min + ' min' : ''),
      h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Supprimer cette séance', onclick: () => {
        const before = getNote(note.id).body;
        replaceLine(note.id, s.line, null);
        undoToast('Séance supprimée', () => setBody(note.id, before));
      }, html: icon('x', 16) })));
  });
  body.appendChild(h('div', { class: 'sh-foot' },
    h('button', { class: 'btn btn-quiet sm', type: 'button', onclick: () => ctx.openNote(note.id) }, 'Modifier comme note (objectif:: 85)')));
}
