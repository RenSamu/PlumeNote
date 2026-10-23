// Fiches de personnes : une note par personne, avec coordonnées (☎ ✉), tâches liées et mentions.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { h, openSheet, toast, promptDialog } from './ui.js';
import { icon } from './icons.js';
import { ctx } from './ctx.js';
import {
  createDraft, getNote, setBody, resolveTitle, tasksMentioning, toggleTaskLine, appendTaskToToday, subscribe,
} from './store.js';
import { dueLabel, dueState, normKey } from './md.js';

const Native = registerPlugin('PlumeNative');
// `__PLUME_NATIVE__` : faux module natif pour les tests automatiques.
const bridge = () => globalThis.__PLUME_NATIVE__ || (Capacitor.isNativePlatform() ? Native : null);

export const contactsSupported = () => !!bridge();

/** Coordonnées d'une fiche : lignes « ☎ … » et « ✉ … ». */
export function parseContact(body) {
  const phones = [], emails = [];
  for (const raw of String(body || '').split('\n')) {
    const m = /^\s*(☎|✉)\s*(.*)$/.exec(raw);
    if (!m) continue;
    for (const part of m[2].split(/\s*[;,·]\s*/)) {
      const v = part.trim();
      if (!v) continue;
      (m[1] === '☎' ? phones : emails).push(v);
    }
  }
  return { phones, emails };
}

const telHref = (p) => 'tel:' + p.replace(/[^\d+]/g, '');

export function personBody({ name = '', phones = [], emails = [] } = {}) {
  const lines = [`# ${name}`];
  lines.push(`☎ ${phones.join(' · ')}`.trimEnd());
  lines.push(`✉ ${emails.join(' · ')}`.trimEnd());
  return lines.join('\n') + '\n\n';
}

/** Nouvelle fiche vide (ou pré-remplie) ; l'ouvre dans l'éditeur. */
export function newPerson(data = {}) {
  const existing = data.name ? resolveTitle(data.name) : null;
  if (existing) { ctx.openNote(existing.id); return existing; }
  const body = personBody(data);
  const d = createDraft({ kind: 'person', body: data.name ? '' : body });
  if (data.name) setBody(d.id, body, 'people');
  ctx.openNote(d.id);
  return d;
}

// ——— Carte en haut de la fiche ———

export function createPersonCard() {
  const el = h('div', { class: 'person-card', hidden: true });
  let note = null;
  let unsub = null;

  function render() {
    el.replaceChildren();
    if (!note || note.kind !== 'person' || note.deletedAt) { el.hidden = true; return; }
    el.hidden = false;
    const { phones, emails } = parseContact(note.body);
    const actions = h('div', { class: 'pc-actions' });
    const first = (note.title || '').split(/\s+/)[0] || 'cette personne';
    if (phones[0]) {
      actions.append(
        h('a', { class: 'btn btn-primary sm', href: telHref(phones[0]) }, h('span', { html: icon('phone', 16) }), 'Appeler'),
        h('a', { class: 'btn sm', href: 'sms:' + phones[0].replace(/[^\d+]/g, '') }, 'Message'));
    }
    if (emails[0]) actions.append(h('a', { class: 'btn sm', href: 'mailto:' + emails[0] }, 'Écrire'));
    actions.append(h('button', { class: 'btn sm', type: 'button', onclick: async () => {
      const t = await promptDialog({ title: `Tâche pour ${first}`, label: 'Que faut-il faire ?', confirm: 'Ajouter', placeholder: 'ex. rappeler demain 10h' });
      if (t) { appendTaskToToday(`${t.trim()} [[${note.title}]]`); toast('Ajoutée au journal du jour'); }
    } }, '+ Tâche'));
    el.append(actions);
    const tasks = tasksMentioning(note.id);
    if (tasks.length) {
      el.append(h('div', { class: 'pc-label' }, `À faire (${tasks.length})`),
        ...tasks.slice(0, 5).map((t) => h('div', { class: 'ag-row ag-task' },
          h('button', { class: 'check', type: 'button', role: 'checkbox', 'aria-checked': 'false', 'aria-label': 'Terminer la tâche', onclick: () => { toggleTaskLine(t.noteId, t.line); } }),
          h('button', { class: 'ag-main', type: 'button', onclick: () => ctx.openNote(t.noteId, { line: t.line }) },
            h('span', { class: 'ag-title' }, t.text, h('span', { class: 'ag-sub' }, t.noteTitle || 'Note sans titre')),
            t.due ? h('span', { class: 'chip chip-' + (dueState(t.due, false) || 'plain') }, dueLabel(t.due)) : null))));
    }
  }

  return {
    el,
    show(n) {
      note = n;
      unsub?.();
      unsub = subscribe((e) => { if (e.type === 'body' || e.type === 'notes') { clearTimeout(render.t); render.t = setTimeout(render, 300); } });
      render();
    },
    hide() { note = null; unsub?.(); unsub = null; el.hidden = true; },
  };
}

// ——— Import depuis les contacts du téléphone ———

export function openContactPicker() {
  openSheet({
    title: 'Importer un contact',
    wide: true,
    className: 'contacts',
    content: (body, close) => {
      const search = h('input', { class: 'field', type: 'search', placeholder: 'Rechercher un nom', 'aria-label': 'Rechercher un contact', autocomplete: 'off' });
      const list = h('div', { class: 'ct-list', role: 'list' }, h('p', { class: 'set-desc' }, 'Chargement…'));
      let all = [];
      const draw = () => {
        const k = normKey(search.value);
        const items = all.filter((c) => !k || normKey(c.name).includes(k)).slice(0, 150);
        list.replaceChildren(...(items.length ? items.map((c) => h('button', { class: 'ct-item', type: 'button', onclick: () => { close(); newPerson({ name: c.name, phones: c.phones, emails: c.emails }); } },
          h('span', { class: 'ct-name' }, c.name),
          h('span', { class: 'ct-sub' }, [c.phones[0], c.emails[0]].filter(Boolean).join(' · ')))) : [h('p', { class: 'set-desc' }, all.length ? 'Aucun contact ne correspond.' : 'Aucun contact trouvé.')]));
      };
      search.addEventListener('input', draw);
      (async () => {
        try {
          const r = await bridge().listContacts();
          all = (r.contacts || []).filter((c) => c.name).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
          draw();
        } catch (e) {
          list.replaceChildren(h('p', { class: 'set-desc' }, /permission/i.test(e?.code || e?.message || '') ? 'Accès aux contacts refusé. Autorisez-le dans les réglages du téléphone.' : 'Impossible de lire les contacts.'));
        }
      })();
      return h('div', { class: 'ct' }, search, list);
    },
  });
}
