// Versions d'une note (enregistrées sur l'appareil) : liste, restauration, copie.
import { h, openSheet, toast } from './ui.js';
import { listVersions, saveVersion, getNote, setBody } from './store.js';

const fmt = new Intl.DateTimeFormat('fr-CH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function openVersions(noteId, { onRestore = () => {} } = {}) {
  openSheet({
    title: 'Versions',
    wide: true,
    className: 'versions',
    content: (body, close) => {
      const list = h('div', { class: 'vs-list' }, h('p', { class: 'set-desc' }, 'Chargement…'));
      async function load() {
        const vs = await listVersions(noteId);
        if (!vs.length) {
          list.replaceChildren(h('p', { class: 'set-desc' }, 'Aucune version enregistrée. Dans le mode écriture, « Enregistrer une version » garde une copie du texte à cet instant ; une copie est aussi faite en quittant le mode.'));
          return;
        }
        list.replaceChildren(...vs.map((v) => {
          const lines = v.body.split('\n').filter((l) => l.trim());
          const words = v.body.trim().split(/\s+/).filter(Boolean).length;
          return h('div', { class: 'vs-row' },
            h('div', { class: 'vs-head' }, h('span', { class: 'vs-date' }, fmt.format(new Date(v.at))), v.label ? h('span', { class: 'vs-label' }, v.label) : null,
              h('span', { class: 'vs-meta' }, `${Math.max(0, lines.length - 1)} ligne${lines.length > 2 ? 's' : ''} · ${words} mots`)),
            h('pre', { class: 'vs-text' }, lines.slice(1, 5).join('\n') || lines[0] || ''),
            h('div', { class: 'vs-acts' },
              h('button', { class: 'btn btn-primary sm', type: 'button', onclick: async () => {
                await saveVersion(noteId, 'Avant restauration');
                setBody(noteId, v.body, 'restore');
                onRestore(getNote(noteId));
                toast('Version restaurée');
                close();
              } }, 'Restaurer'),
              h('button', { class: 'btn sm', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(v.body); toast('Version copiée'); } catch { toast('Copie impossible ici.'); } } }, 'Copier')));
        }));
      }
      load();
      return list;
    },
  });
}
