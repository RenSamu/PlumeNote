// Budget : une note par mois (kind « budget »), une ligne par mouvement.
//   # Budget 2026-11
//   plafond:: 2500
//   2026-11-02 | -12.50 | Alimentation | Migros
//   2026-11-05 | 3200 | Salaire |
import { h } from './ui.js';
import { icon } from './icons.js';
import { ctx } from './ctx.js';
import { getNote, createNoteTitled, setBody } from './store.js';
import { ymd } from './md.js';
import { notesOfKind, appendLine, replaceLine, undoToast, parseNum, fmtNum, empty } from './datanote.js';
import { promptDialog, toast } from './ui.js';

export const CATEGORIES = ['Alimentation', 'Logement', 'Transport', 'Loisirs', 'Santé', 'Abonnements', 'Autre'];
const ENTRY_RE = /^(\d{4}-\d{2}-\d{2})\s*\|\s*(-?\d+(?:\.\d+)?)\s*\|\s*([^|]*)\|?\s*(.*)$/;
let month = ymd(new Date()).slice(0, 7);
let kindSel = 'dep'; // dep | rev

export const monthNote = (m) => notesOfKind('budget').find((n) => n.title === `Budget ${m}`) || null;

export function parseEntries(body) {
  const out = [];
  body.split('\n').forEach((raw, line) => {
    const m = ENTRY_RE.exec(raw.trim());
    if (m) out.push({ line, date: m[1], amount: +m[2], cat: m[3].trim() || 'Autre', label: m[4].trim() });
  });
  return out;
}

export function summarize(entries) {
  let dep = 0, rev = 0;
  const byCat = new Map();
  for (const e of entries) {
    if (e.amount < 0) { dep += -e.amount; byCat.set(e.cat, (byCat.get(e.cat) || 0) + -e.amount); } else rev += e.amount;
  }
  return { dep, rev, solde: rev - dep, byCat: [...byCat.entries()].sort((a, b) => b[1] - a[1]) };
}

export function addEntry({ date, amount, cat, label }) {
  const m = date.slice(0, 7);
  const note = monthNote(m) || createNoteTitled(`Budget ${m}`, { kind: 'budget' });
  appendLine(note.id, `${date} | ${amount.toFixed(2)} | ${cat || 'Autre'} | ${label || ''}`.trimEnd());
}

const shift = (m, d) => { const [y, mo] = m.split('-').map(Number); const x = new Date(y, mo - 1 + d, 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`; };
const monthLabel = (m) => { const [y, mo] = m.split('-').map(Number); const s = new Date(y, mo - 1, 1).toLocaleDateString('fr-CH', { month: 'long', year: 'numeric' }); return s.charAt(0).toUpperCase() + s.slice(1); };

function buildForm() {
  const amount = h('input', { class: 'field bd-amount', type: 'text', inputMode: 'decimal', placeholder: '0.00', 'aria-label': 'Montant en francs' });
  const label = h('input', { class: 'field', type: 'text', placeholder: 'Libellé (facultatif)', 'aria-label': 'Libellé', autocomplete: 'off' });
  const cat = h('select', { class: 'field', 'aria-label': 'Catégorie' }, ...CATEGORIES.map((c) => h('option', { value: c }, c)));
  const seg = h('div', { class: 'bd-seg', role: 'group' });
  const drawSeg = () => seg.replaceChildren(
    h('button', { class: 'chip-btn' + (kindSel === 'dep' ? ' on' : ''), type: 'button', onclick: () => { kindSel = 'dep'; drawSeg(); } }, 'Dépense'),
    h('button', { class: 'chip-btn' + (kindSel === 'rev' ? ' on' : ''), type: 'button', onclick: () => { kindSel = 'rev'; drawSeg(); } }, 'Revenu'));
  drawSeg();
  const submit = () => {
    const v = parseNum(amount.value);
    if (!(v > 0)) { amount.focus(); return; }
    const today = ymd(new Date());
    const date = today.slice(0, 7) === month ? today : month + '-01';
    addEntry({ date, amount: kindSel === 'dep' ? -v : v, cat: kindSel === 'rev' ? 'Revenu' : cat.value, label: label.value.trim() });
    amount.value = ''; label.value = '';
    toast(`${kindSel === 'dep' ? 'Dépense' : 'Revenu'} de CHF ${fmtNum(v)} ajouté`);
  };
  [amount, label].forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }));
  return h('div', { class: 'bd-form' }, seg,
    h('div', { class: 'bd-row' }, h('span', { class: 'bd-chf' }, 'CHF'), amount, cat),
    h('div', { class: 'bd-row' }, label, h('button', { class: 'btn btn-primary sm', type: 'button', onclick: submit }, 'Ajouter')));
}

export function renderBudget(extra, body, countEl) {
  countEl.textContent = '';
  if (!extra.querySelector('.bd-form')) extra.replaceChildren(buildForm());
  const note = monthNote(month);
  const entries = note ? parseEntries(note.body) : [];
  const s = summarize(entries);
  const plafond = note?.props?.plafond ? parseNum(note.props.plafond) : NaN;

  body.replaceChildren();
  body.appendChild(h('div', { class: 'bd-nav' },
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Mois précédent', onclick: () => { month = shift(month, -1); ctx.refreshList(); }, html: icon('back', 20) }),
    h('strong', {}, monthLabel(month)),
    h('button', { class: 'icon-btn bd-next', type: 'button', 'aria-label': 'Mois suivant', onclick: () => { month = shift(month, 1); ctx.refreshList(); }, html: icon('back', 20) })));

  if (!entries.length) {
    body.appendChild(empty(icon('wallet', 40), 'Rien ce mois-ci', 'Saisissez une dépense ou un revenu ci-dessus. Tout reste sur votre compte Plume, sans lien avec votre banque.'));
    return;
  }
  body.appendChild(h('div', { class: 'bd-sum' },
    h('div', {}, h('span', { class: 'bd-k' }, 'Dépenses'), h('b', {}, fmtNum(s.dep))),
    h('div', {}, h('span', { class: 'bd-k' }, 'Revenus'), h('b', {}, fmtNum(s.rev))),
    h('div', { class: s.solde < 0 ? 'neg' : 'pos' }, h('span', { class: 'bd-k' }, 'Solde'), h('b', {}, fmtNum(s.solde)))));

  if (plafond > 0) {
    const pct = Math.min(100, Math.round((s.dep / plafond) * 100));
    body.appendChild(h('div', { class: 'bd-cap' + (s.dep > plafond ? ' over' : '') },
      h('div', { class: 'bd-bar' }, h('i', { style: `width:${pct}%` })),
      h('span', {}, s.dep > plafond ? `Plafond dépassé de CHF ${fmtNum(s.dep - plafond)}` : `Reste CHF ${fmtNum(plafond - s.dep)} sur ${fmtNum(plafond, 0)}`)));
  }
  if (s.byCat.length) {
    body.appendChild(h('div', { class: 'group' }, 'Par catégorie'));
    const max = s.byCat[0][1];
    body.appendChild(h('div', { class: 'bd-cats' }, ...s.byCat.map(([c, v]) =>
      h('div', { class: 'bd-cat' }, h('span', { class: 'bd-cn' }, c), h('div', { class: 'bd-bar' }, h('i', { style: `width:${Math.max(3, (v / max) * 100)}%` })), h('span', { class: 'bd-cv' }, fmtNum(v))))));
  }
  body.appendChild(h('div', { class: 'group' }, 'Mouvements'));
  [...entries].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.line - a.line)).forEach((e) => {
    body.appendChild(h('div', { class: 'bd-entry' },
      h('span', { class: 'bd-d' }, e.date.slice(8) + '.' + e.date.slice(5, 7)),
      h('span', { class: 'bd-l' }, h('b', {}, e.label || e.cat), e.label ? h('small', {}, e.cat) : null),
      h('span', { class: 'bd-a ' + (e.amount < 0 ? 'neg' : 'pos') }, fmtNum(e.amount)),
      h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Supprimer ce mouvement', onclick: () => {
        const before = getNote(note.id).body;
        replaceLine(note.id, e.line, null);
        undoToast('Mouvement supprimé', () => setBody(note.id, before));
      }, html: icon('x', 16) })));
  });
  body.appendChild(h('div', { class: 'sh-foot' },
    h('button', { class: 'btn btn-quiet sm', type: 'button', onclick: async () => {
      const v = await promptDialog({ title: 'Plafond du mois', label: 'Montant maximal de dépenses (CHF)', value: plafond > 0 ? String(plafond) : '', confirm: 'Enregistrer' });
      if (v === null || v === undefined) return;
      const n = parseNum(v);
      const cur = getNote(note.id).body.split('\n').filter((l) => !/^plafond::/i.test(l));
      if (n > 0) cur.splice(1, 0, `plafond:: ${n}`);
      setBody(note.id, cur.join('\n'));
    } }, plafond > 0 ? 'Changer le plafond' : 'Fixer un plafond'),
    h('button', { class: 'btn btn-quiet sm', type: 'button', onclick: async () => {
      const csv = 'date;montant;catégorie;libellé\n' + entries.map((e) => `${e.date};${e.amount.toFixed(2)};${e.cat};${e.label.replace(/;/g, ',')}`).join('\n');
      try { await navigator.clipboard.writeText(csv); toast('CSV copié'); } catch { toast('Copie impossible'); }
    } }, 'Copier en CSV')));
}
