// Plume — démarrage, routage, actions.
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { h, toast, closeTopLayer, hasLayer, frame } from './ui.js';
import { icon } from './icons.js';
import { ctx } from './ctx.js';
import { parseHash, hashFor, go } from './nav.js';
import {
  init, subscribe, state, createDraft, dailyFor, setBody, togglePin, flush, setSetting, getNote, query, uid,
} from './store.js';
import { renderSidebar, renderList, sortMenu, collectionTitle } from './panes.js';
import { createNotePane } from './notepane.js';
import { openPalette, openSettings } from './overlays.js';
import { setHandlers, reschedule } from './reminders.js';
import { ymd, parseYmd, normalizeDates } from './md.js';

const native = Capacitor.isNativePlatform();

const WELCOME = `# Bienvenue dans Plume

La première ligne d'une note en est le titre. Le reste, c'est à vous.

## Premiers pas
- [x] Ouvrir Plume : la note est déjà prête à recevoir vos mots
- [ ] Cocher cette case d'un seul geste
- [ ] Tester un rappel @demain 9h
- [ ] Ajouter une photo, une note vocale ou un PDF depuis la barre du bas

Classez avec des étiquettes comme #idées ou #travail, ou avec des dossiers.
Toutes les cases à cocher de toutes vos notes se retrouvent dans **Tâches**.
**Aujourd'hui** ouvre la note du jour, une par jour.
`;

function buildShell(root) {
  const sidebar = h('aside', { class: 'sidebar', id: 'sidebar', 'aria-label': 'Menu' });
  const drawerScrim = h('div', { class: 'drawer-scrim', onclick: () => ctx.closeDrawer() });

  const menuBtn = h('button', { class: 'icon-btn lp-menu', type: 'button', 'aria-label': 'Ouvrir le menu', onclick: () => ctx.openDrawer(), html: icon('menu', 22) });
  const title = h('h1', { class: 'lp-title' });
  const count = h('span', { class: 'lp-count' });
  const sortBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Trier', title: 'Trier', onclick: (e) => sortMenu(e.currentTarget), html: icon('sort', 20) });
  const searchBtn = h('button', { class: 'icon-btn lp-searchbtn', type: 'button', 'aria-label': 'Rechercher partout', onclick: () => openPalette(), html: icon('search', 20) });
  const newBtn = h('button', { class: 'icon-btn lp-new', type: 'button', 'aria-label': 'Nouvelle note', title: 'Nouvelle note (Alt+N)', onclick: () => ctx.newNote(), html: icon('plus', 22) });
  const searchInput = h('input', { class: 'lp-input', type: 'search', placeholder: 'Filtrer cette liste', 'aria-label': 'Filtrer cette liste', enterKeyHint: 'search', autocomplete: 'off' });
  const extra = h('div', { class: 'lp-extra' });
  const body = h('div', { class: 'lp-body', role: 'list' });
  const fab = h('button', { class: 'fab', type: 'button', 'aria-label': 'Nouvelle note', onclick: () => ctx.newNote(), html: icon('plus', 26) });

  const listpane = h('section', { class: 'listpane', 'aria-label': 'Liste' },
    h('header', { class: 'lp-head' },
      menuBtn,
      h('div', { class: 'lp-titles' }, title, count),
      sortBtn, searchBtn, newBtn),
    h('div', { class: 'lp-search' }, h('span', { html: icon('search', 17) }), searchInput),
    extra, body, fab);

  const notepaneEl = h('main', { class: 'notepane', id: 'notepane', 'aria-label': 'Note' });
  const shell = h('div', { class: 'app', id: 'shell' }, sidebar, drawerScrim, listpane, notepaneEl);
  root.replaceChildren(shell);
  return { shell, sidebar, listEls: { title, count, extra, body, search: searchInput, sort: sortBtn, fab }, searchInput, notepaneEl };
}

async function boot() {
  const root = document.getElementById('app');
  await init();
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});

  const { shell, sidebar, listEls, searchInput, notepaneEl } = buildShell(root);
  const pane = createNotePane(notepaneEl);
  let lastKey = '';

  // ——— Rendu ———
  const renderAll = frame(() => {
    renderSidebar(sidebar);
    renderList(listEls);
    document.title = ctx.route.note ? (getNote(ctx.route.note)?.title || 'Plume') + ' · Plume' : collectionTitle() + ' · Plume';
  });
  ctx.refreshList = renderAll;
  subscribe((e) => {
    if (e.type === 'ready') return;
    renderAll();
    if (e.type === 'body' || e.type === 'notes') reschedule();
  });

  // ——— Actions ———
  const baseRoute = () => {
    const c = ctx.route.c;
    return c === 'tasks' || c === 'trash' || c === 'journal' ? { c: 'all', arg: null } : { c, arg: ctx.route.arg };
  };
  ctx.openNote = (id, { line = null } = {}) => go({ ...ctx.route, note: id, line });
  ctx.closeNote = ({ replace = false } = {}) => {
    if (!ctx.route.note) return;
    if (!replace && history.state?.depth === 1) history.back();
    else go({ ...ctx.route, note: null, line: null }, { replace: true });
  };
  ctx.newNote = () => {
    const base = baseRoute();
    const d = createDraft({ folderId: base.c === 'folder' ? base.arg : null });
    ctx.closeDrawer();
    go({ ...base, note: d.id, line: null });
  };
  ctx.openToday = ({ replace = false } = {}) => {
    ctx.closeDrawer();
    ctx.openDay(ymd(new Date()), { replace });
  };
  ctx.openDay = (key, { replace = false } = {}) => {
    const n = dailyFor(key);
    go({ c: 'journal', arg: null, note: n.id, line: null }, { replace });
  };
  ctx.openCollection = (r, { replace = false } = {}) => go({ c: r.c, arg: r.arg || null, note: null, line: null }, { replace });
  ctx.openPalette = openPalette;
  ctx.openSettings = openSettings;
  ctx.openDrawer = () => { shell.dataset.drawer = 'open'; };
  ctx.closeDrawer = () => { delete shell.dataset.drawer; };

  // ——— Routage ———
  function applyRoute() {
    const r = parseHash();
    if (r.cmd === 'new') { history.replaceState({ depth: 0 }, '', hashFor({ c: 'all' })); ctx.route = parseHash(); ctx.newNote(); return; }
    if (r.cmd === 'today') { history.replaceState({ depth: 0 }, '', hashFor({ c: 'journal' })); ctx.route = parseHash(); ctx.openToday(); return; }
    ctx.route = r;
    const key = `${r.c}/${r.arg || ''}`;
    if (key !== lastKey) {
      lastKey = key; ctx.query = ''; searchInput.value = ''; ctx.limit = 200; ctx.showDone = false;
      listEls.extra.replaceChildren();
    }
    ctx.closeDrawer();
    shell.dataset.pane = r.note ? 'note' : 'list';
    if (r.note) {
      const ok = pane.show(r.note, { line: r.line });
      if (!ok) { go({ ...r, note: null, line: null }, { replace: true }); return; }
    } else pane.hide();
    renderAll();
  }
  window.addEventListener('plume:route', applyRoute);
  window.addEventListener('popstate', applyRoute);
  window.addEventListener('hashchange', () => { if (parseHash().note !== ctx.route.note || parseHash().c !== ctx.route.c) applyRoute(); });

  // ——— Recherche dans la liste ———
  searchInput.addEventListener('input', () => { ctx.query = searchInput.value.trim(); ctx.limit = 200; renderAll(); });
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const r = ctx.route;
      const first = query({ view: r.c === 'folder' ? 'folder' : r.c === 'tag' ? 'tag' : r.c, folderId: r.arg, tag: r.arg, text: ctx.query })[0];
      if (first) { searchInput.blur(); ctx.openNote(first.id); }
    }
  });

  // ——— Raccourcis ———
  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.code === 'KeyK') { e.preventDefault(); hasLayer() || openPalette(); return; }
    if (e.altKey && !mod && !e.shiftKey) {
      if (e.code === 'KeyN') { e.preventDefault(); ctx.newNote(); }
      else if (e.code === 'KeyJ') { e.preventDefault(); ctx.openToday(); }
      else if (e.code === 'KeyT') { e.preventDefault(); ctx.openCollection({ c: 'tasks' }); }
    }
  });

  // ——— Persistance et cycle de vie ———
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  window.addEventListener('pagehide', flush);

  // ——— Rappels ———
  setHandlers({
    openNote: (id) => { if (getNote(id)) ctx.openNote(id); },
    fallback: (t) => toast(`Rappel : ${t.text}`, { duration: 9000, action: { label: 'Ouvrir', onClick: () => ctx.openNote(t.noteId, { line: t.line }) } }),
  });

  // ——— Application native (APK) ———
  async function handleLink(url) {
    const cmd = (url || '').replace(/^[a-z]+:\/\//i, '').replace(/^\/+/, '').split(/[/?#]/)[0];
    if (cmd === 'share') {
      let text = '';
      try { text = new URL(url).searchParams.get('text') || ''; } catch {}
      const d = createDraft();
      if (text) setBody(d.id, text, 'share');
      ctx.closeDrawer();
      go({ c: 'all', arg: null, note: d.id, line: null });
      toast('Ajouté à une nouvelle note');
    } else if (cmd === 'new') ctx.newNote();
    else if (cmd === 'today') ctx.openToday();
    else if (cmd === 'tasks') ctx.openCollection({ c: 'tasks' });
  }
  let launchedFromLink = false;
  if (native) {
    try { SystemBars.setStyle({ style: SystemBarsStyle.Dark }); } catch {}
    CapApp.addListener('appUrlOpen', ({ url }) => handleLink(url));
    CapApp.addListener('backButton', () => {
      if (closeTopLayer()) return;
      if (shell.dataset.drawer === 'open') { ctx.closeDrawer(); return; }
      if (ctx.route.note) { ctx.closeNote(); return; }
      if (ctx.route.c !== 'all' || ctx.query) { ctx.openCollection({ c: 'all' }); return; }
      CapApp.exitApp();
    });
    CapApp.addListener('pause', () => flush());
    try {
      const l = await CapApp.getLaunchUrl();
      if (l?.url) launchedFromLink = true;
      history.replaceState({ depth: 0 }, '', hashFor({ c: 'all' }));
      ctx.route = parseHash();
      if (l?.url) handleLink(l.url);
    } catch {}
  }

  // ——— Premier lancement et capture instantanée ———
  let first = false;
  if (!state.settings.welcomed && state.notes.size === 0) {
    const n = createDraft();
    setBody(n.id, normalizeDates(WELCOME), 'init');
    togglePin(n.id);
    setSetting('welcomed', true);
    first = n.id;
  } else if (!state.settings.welcomed) setSetting('welcomed', true);

  const fresh = !location.hash || location.hash === '#/' || location.hash === '#';
  if (fresh && !launchedFromLink) {
    history.replaceState({ depth: 0 }, '', hashFor({ c: 'all' }));
    ctx.route = parseHash();
    applyRoute();
    if (first) ctx.openNote(first);
    else if (state.settings.openOnNew) ctx.newNote();
  } else if (!fresh) {
    applyRoute();
  } else {
    ctx.route = parseHash();
    applyRoute();
  }
  reschedule();

  if ('serviceWorker' in navigator && !native && location.protocol.startsWith('http') && !window.__PLUME_SINGLE__) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

boot().catch((e) => {
  console.error(e);
  const root = document.getElementById('app');
  root.replaceChildren(h('div', { class: 'boot-error' }, h('h1', {}, 'Plume ne peut pas démarrer'), h('p', {}, 'Le stockage local est indisponible (navigation privée ou stockage bloqué ?).'), h('pre', {}, String(e?.message || e))));
});
