// Outils partagés par les vues « données » (courses, budget, santé) : chaque vue s'appuie sur une note ordinaire,
// lisible et modifiable à la main, synchronisée comme les autres.
import { liveNotes, createNoteTitled, setBody, getNote } from './store.js';
import { h, toast } from './ui.js';

export const DATA_KINDS = ['shopping', 'budget', 'health'];

export const notesOfKind = (kind) => liveNotes().filter((n) => n.kind === kind).sort((a, b) => a.createdAt - b.createdAt);

/** La note du type donné (la plus ancienne), créée seulement si `create` est vrai. */
export function singleton(kind, title, create = false, extra = '') {
  return notesOfKind(kind)[0] || (create ? createNoteTitled(title, { kind, extra }) : null);
}

export function appendLine(id, line) {
  const n = getNote(id);
  setBody(id, n.body.replace(/\s*$/, '') + '\n' + line + '\n');
}

/** Remplace la ligne d'index `i` (ou la supprime si `text` est null). */
export function replaceLine(id, i, text) {
  const n = getNote(id);
  const lines = n.body.split('\n');
  if (text === null) lines.splice(i, 1); else lines[i] = text;
  setBody(id, lines.join('\n'));
}

export const undoToast = (message, undo) => toast(message, { action: { label: 'Annuler', onClick: undo } });

/** Nombre saisi (« 12,5 », « 1 234.50 ») → Number, ou NaN. */
export const parseNum = (s) => parseFloat(String(s).replace(/[\s’' ]/g, '').replace(',', '.'));

/** 1’234.50 (format suisse) ; `dec` décimales. */
export function fmtNum(v, dec = 2) {
  const [i, d] = Math.abs(v).toFixed(dec).split('.');
  return (v < 0 ? '−' : '') + i.replace(/\B(?=(\d{3})+$)/g, '’') + (d ? '.' + d : '');
}

/** Champ + bouton « Ajouter » : { el, input }. */
export function quickAdd({ placeholder, label, onSubmit, icon: ic = '' }) {
  const input = h('input', { class: 'quick-input', type: 'text', placeholder, 'aria-label': label, enterKeyHint: 'done', autocomplete: 'off' });
  const submit = () => { const v = input.value.trim(); if (v && onSubmit(v) !== false) input.value = ''; };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  const el = h('div', { class: 'quick-add' }, ic ? h('span', { html: ic }) : null, input,
    h('button', { class: 'btn btn-primary sm', type: 'button', onclick: submit }, 'Ajouter'));
  return { el, input };
}

export const empty = (ic, title, text) => h('div', { class: 'empty' },
  h('div', { class: 'empty-ill', html: ic }), h('h3', {}, title), h('p', {}, text));
