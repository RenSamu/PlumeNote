// Modèles de notes : modèles intégrés + modèles personnels (notes de type « template »).
import { h, openSheet, toast } from './ui.js';
import { icon } from './icons.js';
import { ctx } from './ctx.js';
import { query, createDraft, setBody } from './store.js';
import { longDay, ymd } from './md.js';

export const BUILTIN = [
  { id: 'intervention', name: 'Intervention client', hint: 'Problème, actions, durée, suite',
    body: '# Intervention {{iso}}\n#intervention\nClient : [[Nom du client]]\nDate : {{date}} à {{heure}}\n\n## Problème\n{{curseur}}\n\n## Actions\n- \n\n## Matériel\n- \n\ntemps: 0h30\n\n## À suivre\n- [ ] \n' },
  { id: 'reunion', name: 'Compte rendu de réunion', hint: 'Participants, décisions, actions',
    body: '# Réunion {{iso}}\n#réunion\nDate : {{date}} à {{heure}}\nParticipants : \n\n## Points abordés\n{{curseur}}\n\n## Décisions\n- \n\n## Actions\n- [ ] \n' },
  { id: 'poeme', name: 'Poème', hint: 'Page blanche, étiquette #poème',
    body: '# Sans titre\n#poème\n\n{{curseur}}\n' },
  { id: 'lecture', name: 'Fiche de lecture', hint: 'Auteur, statut, note',
    body: '# {{curseur}}\n#lecture\nauteur:: \nstatut:: à lire\nnote:: \n\n## Notes\n' },
  { id: 'film', name: 'Fiche de film', hint: 'Réalisateur, statut, note',
    body: '# {{curseur}}\n#film\nréalisateur:: \nstatut:: à voir\nnote:: \n\n## Notes\n' },
  { id: 'idee', name: 'Idée de projet', hint: 'Statut et effort estimé',
    body: '# {{curseur}}\n#idée\nstatut:: idée\neffort:: \n\n## Pourquoi\n\n## Première étape\n- [ ] \n' },
];

const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** Remplace {{date}}, {{iso}}, {{heure}} ; retourne { body, line } où line = ligne du curseur ({{curseur}}). */
export function expandTemplate(src, now = new Date()) {
  let body = src
    .replace(/\{\{date\}\}/g, longDay(now))
    .replace(/\{\{iso\}\}/g, ymd(now))
    .replace(/\{\{heure\}\}/g, hhmm(now));
  let line = null;
  const i = body.indexOf('{{curseur}}');
  if (i >= 0) { line = body.slice(0, i).split('\n').length - 1; body = body.replace('{{curseur}}', ''); }
  return { body, line };
}

export function createFromTemplate(src, { folderId = null } = {}) {
  const { body, line } = expandTemplate(src);
  const d = createDraft({ body: '', folderId });
  setBody(d.id, body, 'template');
  ctx.openNote(d.id, { line });
  return d;
}

/** Enregistre une note comme modèle personnel (copie : la note d'origine ne change pas). */
export function saveAsTemplate(note) {
  const lines = note.body.split('\n');
  const first = lines.findIndex((l) => l.trim());
  const rest = first >= 0 ? lines.slice(first + 1).join('\n') : '';
  const t = createDraft({ kind: 'template', body: '' });
  setBody(t.id, `# Modèle : ${note.title || 'sans titre'}\n${rest}`, 'template');
  toast('Modèle enregistré');
  return t;
}

export function openTemplatePicker() {
  openSheet({
    title: 'Nouvelle note depuis un modèle',
    wide: true,
    className: 'templates',
    content: (body, close) => {
      const mine = query({ view: 'templates' });
      const item = (name, hint, onClick, edit) => h('div', { class: 'tp-row' },
        h('button', { class: 'tp-main', type: 'button', onclick: onClick },
          h('span', { class: 'tp-name' }, name), hint ? h('span', { class: 'tp-hint' }, hint) : null),
        edit ? h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Modifier ce modèle', title: 'Modifier ce modèle', onclick: edit, html: icon('settings', 17) }) : null);
      const base = ctx.route.c === 'folder' ? ctx.route.arg : null;
      return h('div', { class: 'tp' },
        ...BUILTIN.map((t) => item(t.name, t.hint, () => { close(); createFromTemplate(t.body, { folderId: base }); })),
        mine.length ? h('div', { class: 'tp-sep' }, 'Mes modèles') : null,
        ...mine.map((n) => item((n.title || 'Modèle').replace(/^Modèle : /, ''), '', () => {
          close();
          createFromTemplate(n.body.replace(/^(\s*)#\s*Modèle : ?/, '$1# '), { folderId: base });
        }, () => { close(); ctx.openNote(n.id); })),
        h('p', { class: 'tp-note' }, 'Astuce : le menu ⋯ d’une note propose « Enregistrer comme modèle ». Dans un modèle, {{date}}, {{heure}} et {{iso}} sont remplacés à la création.'));
    },
  });
}
