// Courses : des listes (kind « shopping »), une case à cocher par article.
//   # Courses
//   - [ ] lait
//   - [x] pain
import { h } from './ui.js';
import { icon } from './icons.js';
import { ctx } from './ctx.js';
import { getNote, setBody, createNoteTitled } from './store.js';
import { notesOfKind, appendLine, replaceLine, undoToast, quickAdd, empty } from './datanote.js';

const ITEM_RE = /^(\s*[-*]\s+\[)([ xX])(\]\s+)(.*)$/;
let current = null; // liste affichée

export const lists = () => notesOfKind('shopping');
export function parseItems(body) {
  const out = [];
  body.split('\n').forEach((raw, line) => {
    const m = ITEM_RE.exec(raw);
    if (m) out.push({ line, done: m[2] !== ' ', text: m[4].trim() });
  });
  return out;
}
export const openCount = () => lists().reduce((s, n) => s + parseItems(n.body).filter((i) => !i.done).length, 0);

export function addItems(listId, text) {
  const parts = text.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
  const id = listId || (lists()[0] || createNoteTitled('Courses', { kind: 'shopping' })).id;
  for (const p of parts) appendLine(id, `- [ ] ${p}`);
  return id;
}

function toggle(id, line) {
  const n = getNote(id);
  const lines = n.body.split('\n');
  const m = ITEM_RE.exec(lines[line]);
  if (!m) return;
  lines[line] = m[1] + (m[2] === ' ' ? 'x' : ' ') + m[3] + m[4];
  setBody(id, lines.join('\n'));
}

function clearDone(id) {
  const n = getNote(id);
  const before = n.body;
  const kept = n.body.split('\n').filter((l) => { const m = ITEM_RE.exec(l); return !(m && m[2] !== ' '); });
  setBody(id, kept.join('\n'));
  undoToast('Articles cochés retirés', () => setBody(id, before));
}

export function renderShopping(extra, body, countEl) {
  const all = lists();
  if (!current || !all.some((n) => n.id === current)) current = all[0]?.id || null;
  const note = current ? getNote(current) : null;
  const items = note ? parseItems(note.body) : [];
  const open = items.filter((i) => !i.done);
  countEl.textContent = open.length ? String(open.length) : '';

  if (!extra.querySelector('.quick-add')) {
    const qa = quickAdd({
      placeholder: 'Ajouter : lait, pain, œufs…', label: 'Ajouter des articles', icon: icon('plus', 18),
      onSubmit: (v) => { current = addItems(current, v); },
    });
    extra.replaceChildren(qa.el, h('div', { class: 'status-bar sh-lists' }));
  }
  const tabs = extra.querySelector('.sh-lists');
  tabs.replaceChildren(
    ...(all.length > 1 ? all.map((n) => h('button', { class: 'chip-btn' + (n.id === current ? ' on' : ''), type: 'button', onclick: () => { current = n.id; ctx.refreshList(); } }, n.title)) : []),
    h('button', { class: 'chip-btn', type: 'button', onclick: async () => {
      const { promptDialog } = await import('./ui.js');
      const name = await promptDialog({ title: 'Nouvelle liste', label: 'Nom (ex. Pharmacie, Bricolage)', confirm: 'Créer' });
      if (name) { current = createNoteTitled(name, { kind: 'shopping' }).id; }
    } }, '+ Liste'));
  tabs.hidden = !all.length;

  body.replaceChildren();
  if (!items.length) {
    body.appendChild(empty(icon('list', 40), 'Liste vide', 'Ajoutez vos articles ci-dessus, séparés par des virgules. Cochez-les au magasin.'));
    return;
  }
  const row = (it) => h('button', { class: 'sh-item' + (it.done ? ' done' : ''), type: 'button', 'aria-pressed': String(it.done), onclick: () => toggle(note.id, it.line) },
    h('span', { class: 'sh-box', html: it.done ? icon('check', 16) : '' }),
    h('span', { class: 'sh-text' }, it.text));
  open.forEach((it) => body.appendChild(row(it)));
  const done = items.filter((i) => i.done);
  if (done.length) {
    body.appendChild(h('div', { class: 'group' }, `Dans le panier (${done.length})`,
      h('button', { class: 'btn btn-quiet sm sh-clear', type: 'button', onclick: () => clearDone(note.id) }, 'Vider')));
    done.forEach((it) => body.appendChild(row(it)));
  }
  body.appendChild(h('div', { class: 'sh-foot' },
    h('button', { class: 'btn btn-quiet sm', type: 'button', onclick: () => ctx.openNote(note.id) }, 'Modifier comme note')));
}
