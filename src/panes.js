// Barre latérale, liste des notes, vue des tâches.
import { h } from './ui.js';
import { icon } from './icons.js';
import { ctx } from './ctx.js';
import {
  state, query, counts, taskStats, foldersList, allTasks, toggleTaskLine, appendTaskToToday,
  restoreNote, deleteForever, emptyTrash, createFolder, renameFolder, deleteFolder, dailyFor, setSetting, getNote,
} from './store.js';
import { openMenu, confirmDialog, promptDialog, toast, longPress } from './ui.js';
import {
  relTime, ymd, parseYmd, addDays, startOfDay, dueLabel, dueState, dueDate, weekdayAbbr, normalizeDates,
} from './md.js';

// ——— Barre latérale ———

function sbItem(ic, label, { active, count, accent, onClick, onMenu }) {
  const el = h('button', { class: 'sb-item' + (active ? ' active' : ''), type: 'button', 'aria-current': active ? 'page' : null, onclick: onClick },
    h('span', { class: 'sb-ic', html: icon(ic, 18) }),
    h('span', { class: 'sb-label' }, label),
    count ? h('span', { class: 'sb-count' + (accent ? ' accent' : '') }, String(count)) : null);
  if (onMenu) longPress(el, () => onMenu(el));
  return el;
}

export function renderSidebar(el) {
  const c = counts();
  const ts = taskStats();
  const r = ctx.route;
  const folders = foldersList();
  const tags = [...c.byTag.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 40);
  const nav = (fn) => () => { ctx.closeDrawer(); fn(); };

  el.replaceChildren(
    h('div', { class: 'sb-head' },
      h('div', { class: 'brand' }, h('span', { class: 'brand-mark', html: icon('nib', 22) }), h('span', { class: 'brand-name' }, 'Plume')),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Nouvelle note', title: 'Nouvelle note (Alt+N)', onclick: nav(() => ctx.newNote()), html: icon('plus', 20) })),
    h('button', { class: 'sb-search', type: 'button', onclick: nav(() => ctx.openPalette()) },
      h('span', { html: icon('search', 17) }), h('span', { class: 'sb-search-label' }, 'Rechercher'), h('kbd', {}, 'Ctrl K')),
    h('nav', { class: 'sb-nav', 'aria-label': 'Navigation' },
      sbItem('file', 'Notes', { active: r.c === 'all', count: c.all, onClick: nav(() => ctx.openCollection({ c: 'all' })) }),
      sbItem('sun', "Aujourd'hui", { active: r.c === 'journal', onClick: nav(() => ctx.openToday()) }),
      sbItem('tasks', 'Tâches', {
        active: r.c === 'tasks', count: ts.overdue || ts.open, accent: ts.overdue > 0,
        onClick: nav(() => ctx.openCollection({ c: 'tasks' })),
      }),
      h('div', { class: 'sb-section' },
        h('span', {}, 'Dossiers'),
        h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Nouveau dossier', onclick: async () => {
          const name = await promptDialog({ title: 'Nouveau dossier', label: 'Nom du dossier', confirm: 'Créer' });
          if (name) { const f = createFolder(name); ctx.closeDrawer(); ctx.openCollection({ c: 'folder', arg: f.id }); }
        }, html: icon('plus', 16) })),
      folders.length ? folders.map((f) => sbItem('folder', f.name, {
        active: r.c === 'folder' && r.arg === f.id, count: c.byFolder.get(f.id) || 0,
        onClick: nav(() => ctx.openCollection({ c: 'folder', arg: f.id })),
        onMenu: (anchor) => folderMenu(anchor, f),
      })) : h('p', { class: 'sb-hint' }, 'Aucun dossier. Les étiquettes #mot suffisent souvent.'),
      tags.length ? h('div', { class: 'sb-section' }, h('span', {}, 'Étiquettes')) : null,
      tags.map(([t, n]) => sbItem('hash', t, { active: r.c === 'tag' && r.arg === t, count: n, onClick: nav(() => ctx.openCollection({ c: 'tag', arg: t })) }))),
    h('div', { class: 'sb-foot' },
      sbItem('trash', 'Corbeille', { active: r.c === 'trash', count: c.trash, onClick: nav(() => ctx.openCollection({ c: 'trash' })) }),
      sbItem('settings', 'Réglages', { onClick: nav(() => ctx.openSettings()) })));
}

export function folderMenu(anchor, f) {
  openMenu(anchor, [
    { header: f.name },
    { label: 'Renommer', icon: 'settings', onClick: async () => { const n = await promptDialog({ title: 'Renommer le dossier', label: 'Nom', value: f.name }); if (n) renameFolder(f.id, n); } },
    { label: 'Supprimer le dossier', icon: 'trash', danger: true, onClick: async () => {
      if (await confirmDialog({ title: 'Supprimer ce dossier ?', message: 'Les notes ne sont pas supprimées : elles retournent dans « Notes ».', confirm: 'Supprimer', danger: true })) {
        const wasHere = ctx.route.c === 'folder' && ctx.route.arg === f.id;
        deleteFolder(f.id);
        if (wasHere) ctx.openCollection({ c: 'all' }, { replace: true });
      }
    } },
  ]);
}

// ——— Liste ———

export function collectionTitle(r = ctx.route) {
  switch (r.c) {
    case 'all': return 'Notes';
    case 'journal': return 'Journal';
    case 'tasks': return 'Tâches';
    case 'trash': return 'Corbeille';
    case 'folder': return state.folders.get(r.arg)?.name || 'Dossier';
    case 'tag': return `#${r.arg}`;
    default: return 'Notes';
  }
}

function bucket(ts, now) {
  const d = Math.round((startOfDay(now) - startOfDay(new Date(ts))) / 86400000);
  if (d <= 0) return "Aujourd'hui";
  if (d === 1) return 'Hier';
  if (d < 7) return 'Cette semaine';
  if (d < 31) return 'Ce mois-ci';
  return 'Plus ancien';
}

function noteRow(n, active) {
  const folder = n.folderId ? state.folders.get(n.folderId) : null;
  const showFolder = folder && ctx.route.c !== 'folder';
  const meta = [];
  if (showFolder) meta.push(h('span', { class: 'row-chip' }, h('span', { html: icon('folder', 12) }), folder.name));
  n.tags.slice(0, 3).forEach((t) => meta.push(h('span', { class: 'row-tag' }, '#' + t)));
  const open = ctx.route.c === 'trash' ? n.deletedAt : n.updatedAt;
  const row = h('div', { class: 'row' + (active ? ' active' : '') + (n.deletedAt ? ' trashed' : '') },
    h('button', { class: 'row-main', type: 'button', onclick: () => ctx.openNote(n.id), 'aria-current': active ? 'true' : null },
      h('span', { class: 'row-line' },
        h('span', { class: 'row-title' }, n.title || 'Note vide'),
        n.pinned ? h('span', { class: 'row-pin', html: icon('pin', 13), 'aria-label': 'Épinglée' }) : null,
        h('span', { class: 'row-date' }, relTime(open))),
      n.snippet ? h('span', { class: 'row-snip' }, n.snippet) : null,
      meta.length ? h('span', { class: 'row-meta' }, meta) : null),
    n.deletedAt ? h('span', { class: 'row-actions' },
      h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Restaurer', title: 'Restaurer', onclick: () => { restoreNote(n.id); toast('Note restaurée'); }, html: icon('restore', 18) }),
      h('button', { class: 'icon-btn sm danger', type: 'button', 'aria-label': 'Supprimer définitivement', title: 'Supprimer définitivement', onclick: async () => {
        if (await confirmDialog({ title: 'Supprimer définitivement ?', message: 'Cette note et ses pièces jointes seront effacées de cet appareil.', confirm: 'Supprimer', danger: true })) deleteForever(n.id);
      }, html: icon('x', 18) })) : null);
  return row;
}

function emptyState({ title, text, action }) {
  return h('div', { class: 'empty' },
    h('div', { class: 'empty-ill', html: icon('nib', 40) }),
    h('h3', {}, title),
    text ? h('p', {}, text) : null,
    action ? h('button', { class: 'btn btn-primary', type: 'button', onclick: action.onClick }, action.label) : null);
}

export function renderList(els) {
  const r = ctx.route;
  const { title, count, extra, body, search, sort, fab } = els;
  title.textContent = collectionTitle();
  const isTasks = r.c === 'tasks';
  search.parentElement.hidden = isTasks;
  fab.hidden = r.c === 'trash' || isTasks;
  sort.hidden = isTasks || r.c === 'journal' || r.c === 'trash';

  if (isTasks) { count.textContent = ''; renderTasks(extra, body, count); return; }

  const view = r.c === 'folder' ? 'folder' : r.c === 'tag' ? 'tag' : r.c;
  let list = query({ view, folderId: r.arg, tag: r.arg, text: ctx.query });
  count.textContent = list.length ? `${list.length}` : '';

  // Bandeau d'en-tête spécifique
  extra.replaceChildren();
  if (r.c === 'journal') extra.appendChild(weekStrip());
  if (r.c === 'trash' && list.length) {
    extra.appendChild(h('div', { class: 'trash-bar' },
      h('span', {}, 'Effacées automatiquement après 30 jours.'),
      h('button', { class: 'btn btn-quiet', type: 'button', onclick: async () => {
        if (await confirmDialog({ title: 'Vider la corbeille ?', message: `${list.length} note(s) seront effacées définitivement.`, confirm: 'Vider', danger: true })) emptyTrash();
      } }, 'Vider')));
  }

  body.replaceChildren();
  if (!list.length) {
    if (ctx.query) body.appendChild(emptyState({ title: 'Aucun résultat', text: `Rien ne correspond à « ${ctx.query} ».` }));
    else if (r.c === 'trash') body.appendChild(emptyState({ title: 'La corbeille est vide', text: 'Les notes supprimées restent ici 30 jours.' }));
    else if (r.c === 'journal') body.appendChild(emptyState({ title: 'Pas encore de journal', text: 'Une note par jour, créée au moment où vous l\'ouvrez.', action: { label: "Ouvrir aujourd'hui", onClick: () => ctx.openToday() } }));
    else if (r.c === 'tag') body.appendChild(emptyState({ title: `Aucune note avec #${r.arg}`, text: 'Tapez #' + r.arg + ' dans une note pour la retrouver ici.' }));
    else if (r.c === 'folder') body.appendChild(emptyState({ title: 'Dossier vide', text: 'Les nouvelles notes créées ici y seront classées.', action: { label: 'Écrire une note', onClick: () => ctx.newNote() } }));
    else body.appendChild(emptyState({ title: 'Aucune note pour l\'instant', text: 'Écrivez la première. Elle reste sur cet appareil.', action: { label: 'Écrire une note', onClick: () => ctx.newNote() } }));
    return;
  }

  const grouped = state.settings.sort === 'updated' && !ctx.query && (r.c === 'all' || r.c === 'folder' || r.c === 'tag');
  const shown = list.slice(0, ctx.limit);
  const now = new Date();
  let last = null;
  shown.forEach((n) => {
    if (grouped) {
      const g = n.pinned ? 'Épinglées' : bucket(n.updatedAt, now);
      if (g !== last) { body.appendChild(h('div', { class: 'group' }, g)); last = g; }
    }
    body.appendChild(noteRow(n, n.id === r.note));
  });
  if (list.length > shown.length) {
    body.appendChild(h('button', { class: 'btn btn-quiet more', type: 'button', onclick: () => { ctx.limit += 200; ctx.refreshList(); } }, `Afficher plus (${list.length - shown.length})`));
  }
}

function weekStrip() {
  const today = startOfDay(new Date());
  const mondayOffset = (today.getDay() + 6) % 7;
  const monday = addDays(today, -mondayOffset);
  const strip = h('div', { class: 'week', role: 'group', 'aria-label': 'Semaine en cours' });
  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, i);
    const key = ymd(d);
    const existing = dailyFor(key, { create: false });
    const isToday = key === ymd(today);
    strip.appendChild(h('button', {
      class: 'day' + (isToday ? ' today' : '') + (existing ? ' has' : ''), type: 'button',
      'aria-label': `${weekdayAbbr(d)} ${d.getDate()}`,
      onclick: () => ctx.openDay(key),
    }, h('span', { class: 'day-n' }, weekdayAbbr(d).slice(0, 3)), h('span', { class: 'day-d' }, String(d.getDate())), h('span', { class: 'day-dot' })));
  }
  return strip;
}

// ——— Tâches ———

function taskRow(t) {
  const st = dueState(t.due, t.done);
  return h('div', { class: 'task' + (t.done ? ' done' : '') },
    h('button', { class: 'check' + (t.done ? ' on' : ''), type: 'button', role: 'checkbox', 'aria-checked': String(t.done), 'aria-label': t.done ? 'Rouvrir la tâche' : 'Terminer la tâche',
      onclick: () => toggleTaskLine(t.noteId, t.line), html: t.done ? icon('check', 15) : '' }),
    h('button', { class: 'task-main', type: 'button', onclick: () => ctx.openNote(t.noteId, { line: t.line }) },
      h('span', { class: 'task-text' }, t.text || 'Tâche sans titre'),
      h('span', { class: 'task-sub' }, t.noteTitle || 'Note sans titre')),
    t.due ? h('span', { class: 'chip chip-' + (st || 'plain') }, dueLabel(t.due)) : null);
}

function renderTasks(extra, body, countEl) {
  // saisie rapide (conservée entre les rendus)
  if (!extra.querySelector('.quick-add')) {
    const input = h('input', { class: 'quick-input', type: 'text', placeholder: 'Nouvelle tâche, ex. @demain', 'aria-label': 'Nouvelle tâche', enterKeyHint: 'done', autocomplete: 'off' });
    const submit = () => {
      const v = input.value.trim();
      if (!v) return;
      const text = normalizeDates('- [ ] ' + v).replace(/^- \[ \] /, '');
      appendTaskToToday(text);
      input.value = '';
      toast('Ajoutée au journal du jour');
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    extra.replaceChildren(h('div', { class: 'quick-add' }, h('span', { html: icon('plus', 18) }), input,
      h('button', { class: 'btn btn-primary sm', type: 'button', onclick: submit }, 'Ajouter')));
  }

  const now = new Date();
  const today = ymd(now);
  const tasks = allTasks();
  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);
  const stamp = (t) => (t.due ? dueDate(t.due, '09:00').getTime() : Infinity);
  const late = [], todayL = [], soon = [], none = [];
  for (const t of open) {
    if (!t.due) none.push(t);
    else if (t.due.date === today) (dueState(t.due, false) === 'late' ? late : todayL).push(t);
    else if (t.due.date < today) late.push(t);
    else soon.push(t);
  }
  const byDue = (a, b) => stamp(a) - stamp(b);
  [late, todayL, soon].forEach((l) => l.sort(byDue));
  const upd = (t) => getNote(t.noteId)?.updatedAt || 0;
  none.sort((a, b) => upd(b) - upd(a));
  done.sort((a, b) => upd(b) - upd(a));

  countEl.textContent = open.length ? `${open.length} à faire` : '';
  body.replaceChildren();
  const section = (label, items, cls = '') => {
    if (!items.length) return;
    body.appendChild(h('div', { class: 'group ' + cls }, label, h('span', { class: 'group-n' }, String(items.length))));
    items.forEach((t) => body.appendChild(taskRow(t)));
  };
  section('En retard', late, 'late');
  section("Aujourd'hui", todayL);
  section('À venir', soon);
  section('Sans échéance', none);
  if (!open.length) {
    body.appendChild(emptyState({
      title: tasks.length ? 'Tout est fait' : 'Aucune tâche',
      text: tasks.length ? 'Aucune tâche ouverte dans vos notes.' : 'Une ligne qui commence par - [ ] devient une tâche. Elle apparaît ici, quelle que soit la note.',
    }));
  }
  if (done.length) {
    body.appendChild(h('button', { class: 'group toggle', type: 'button', 'aria-expanded': String(ctx.showDone), onclick: () => { ctx.showDone = !ctx.showDone; ctx.refreshList(); } },
      h('span', { html: icon(ctx.showDone ? 'down' : 'chevron', 14) }), `Terminées`, h('span', { class: 'group-n' }, String(done.length))));
    if (ctx.showDone) done.slice(0, 40).forEach((t) => body.appendChild(taskRow(t)));
  }
}

export function sortMenu(anchor) {
  const cur = state.settings.sort;
  const opt = (v, label) => ({ label, active: cur === v, onClick: () => setSetting('sort', v) });
  openMenu(anchor, [{ header: 'Trier par' }, opt('updated', 'Dernière modification'), opt('created', 'Date de création'), opt('title', 'Titre')]);
}
