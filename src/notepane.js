// Panneau d'édition d'une note.
import { dictateSheet, supported as dictSupported } from './dictate-ui.js';
import { h, openMenu, toast, lightbox, confirmDialog, promptDialog, hasLayer } from './ui.js';
import { icon } from './icons.js';
import { ctx } from './ctx.js';
import { createEditor, hooks } from './editor.js';
import {
  state, getNote, setBody, togglePin, moveToFolder, trashNote, restoreNote, deleteForever, discardIfEmpty,
  foldersList, createFolder, addAttachment, attachmentUrl, openTasksBefore, flush, subscribe,
  resolveTitle, backlinks, linkSuggestions, createNoteTitled, setKind, saveVersion,
} from './store.js';
import { prepareImage, pickFiles, startRecording, recorderSupported, openAttachment, saveTextFile } from './files.js';
import { openDatePicker } from './overlays.js';
import { reschedule, requestPermission, permissionState } from './reminders.js';
import { countWords, plainText, stripInline, fmtDuration, ymd, longDay, parseYmd, calendarCandidates, CAL_MARK } from './md.js';
import { createAgenda } from './agenda.js';
import { createPersonCard } from './people.js';
import { openTriage } from './inbox.js';
import { openVersions } from './versions.js';
import { saveAsTemplate } from './templates.js';
import { lineSyllables } from './poetry.js';
import * as cal from './calendar.js';

const dismissedCarry = new Set();

export function createNotePane(root) {
  const backBtn = h('button', { class: 'icon-btn np-back', type: 'button', 'aria-label': 'Retour à la liste', onclick: () => ctx.closeNote(), html: icon('back', 22) });
  const folderBtn = h('button', { class: 'np-folder', type: 'button', onclick: (e) => moveMenu(e.currentTarget) });
  const status = h('span', { class: 'np-status', 'aria-live': 'polite' });
  const pinBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Épingler', onclick: () => current && togglePin(current.id) });
  const moreBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Plus d\'actions', onclick: (e) => moreMenu(e.currentTarget), html: icon('more', 22) });
  const bar = h('header', { class: 'np-bar' }, backBtn, folderBtn, h('span', { class: 'spacer' }), status, pinBtn, moreBtn);
  const banner = h('div', { class: 'np-banner-wrap' });
  const agenda = createAgenda();
  const personCard = createPersonCard();
  const host = h('div', { class: 'editor-host' });
  const links = h('div', { class: 'np-links', hidden: true });
  const toolbar = h('div', { class: 'np-toolbar', role: 'toolbar', 'aria-label': 'Mise en forme' });
  const empty = h('div', { class: 'np-empty' },
    h('div', { class: 'empty-ill', html: icon('nib', 44) }),
    h('p', {}, 'Choisissez une note, ou écrivez-en une nouvelle.'),
    h('button', { class: 'btn btn-primary', type: 'button', onclick: () => ctx.newNote() }, 'Nouvelle note'));
  const focusCount = h('span', { class: 'fb-count' });
  const sylBtn = h('button', { class: 'btn sm fb-syl', type: 'button', 'aria-pressed': 'false', onclick: () => { editor.setSyllables(!editor.syllables); updateFocusBar(); } }, 'Syllabes');
  const focusBar = h('div', { class: 'focus-bar', hidden: true },
    h('button', { class: 'btn sm', type: 'button', onclick: () => exitFocus() }, 'Quitter'),
    focusCount, h('span', { class: 'spacer' }), sylBtn,
    h('button', { class: 'btn sm', type: 'button', onclick: async () => { if (current) { await saveVersion(current.id, 'Version enregistrée'); toast('Version enregistrée'); } } }, 'Enregistrer une version'),
    h('button', { class: 'btn sm', type: 'button', onclick: () => current && openVersions(current.id, { onRestore: (n) => editor.replaceExternal(n.body) }) }, 'Versions'));
  const inner = h('div', { class: 'np-inner' }, bar, banner, personCard.el, agenda.el, host, links, toolbar);
  root.append(inner, empty, focusBar);

  let current = null;
  let statusTimer = null;
  let focusing = false;

  function updateFocusBar() {
    if (!current) return;
    const lines = current.body.split('\n').filter((l) => l.trim());
    const verses = Math.max(0, lines.length - 1);
    focusCount.textContent = `${verses} ligne${verses > 1 ? 's' : ''} · ${countWords(current.body)} mots`;
    sylBtn.setAttribute('aria-pressed', String(editor.syllables));
    sylBtn.classList.toggle('btn-primary', editor.syllables);
  }
  function enterFocus() {
    if (!current || current.deletedAt) return;
    focusing = true;
    root.classList.add('focus');
    focusBar.hidden = false;
    editor.setSyllables(current.tags.includes('poème') || current.tags.includes('poeme'));
    updateFocusBar();
    editor.focus(true);
  }
  function exitFocus() {
    if (!focusing) return;
    focusing = false;
    root.classList.remove('focus');
    focusBar.hidden = true;
    editor.setSyllables(false);
    if (current) saveVersion(current.id, 'Fin de séance');
  }
  document.addEventListener('keydown', (e) => { if (focusing && e.key === 'Escape' && !hasLayer()) { e.preventDefault(); exitFocus(); } });

  // Pièces jointes : points d'accès pour l'éditeur
  hooks.meta = (id) => state.atts.get(id) || null;
  hooks.url = (id) => attachmentUrl(id);
  hooks.notice = (t) => toast(t);
  hooks.linkExists = (t) => !!resolveTitle(t);
  hooks.suggest = (t) => linkSuggestions(t, { except: current?.id }).map((n) => n.title);
  hooks.openLink = (t) => {
    const found = resolveTitle(t, { except: current?.id });
    if (found) { ctx.openNote(found.id); return; }
    if (resolveTitle(t)) return; // la note liée est la note courante
    const d = createNoteTitled(t.trim());
    toast(`Note « ${t.trim()} » créée`);
    ctx.openNote(d.id);
  };
  hooks.open = (m) => openAttachment(m).catch((e) => toast(e.message || 'Impossible d\'ouvrir ce fichier.'));
  hooks.lightbox = async (m) => {
    const u = await attachmentUrl(m.id);
    if (u) lightbox(u, { title: m.name, onOpenExternal: () => openAttachment(m).catch(() => {}) });
  };

  const editor = createEditor(host, {
    onChange(text) {
      if (!current) return;
      setBody(current.id, text, 'editor');
      flashStatus();
      if (focusing) updateFocusBar();
      reschedule();
      proposeEventsSoon();
      if (current.kind === 'daily') renderBanner();
    },
    onFiles: (files) => attachFiles(files),
    onBlur: () => { flush(); },
  });

  function flashStatus() {
    status.textContent = 'Enregistré';
    status.classList.add('on');
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => status.classList.remove('on'), 1800);
  }

  // ——— Barre d'outils ———
  const tb = (ic, label, fn, extra = '') => h('button', {
    class: 'tb-btn ' + extra, type: 'button', 'aria-label': label, title: label,
    onpointerdown: (e) => e.preventDefault(), onmousedown: (e) => e.preventDefault(),
    onclick: fn, html: icon(ic, 20),
  });
  const sep = () => h('span', { class: 'tb-sep', 'aria-hidden': 'true' });

  function buildToolbar() {
    toolbar.replaceChildren(
      tb('tasks', 'Case à cocher', () => editor.run('task')),
      tb('list', 'Liste à puces', () => editor.run('bullet')),
      tb('heading', 'Titre de section', () => editor.run('heading')),
      tb('bold', 'Gras', () => editor.run('bold'), 'wide-only'),
      tb('italic', 'Italique', () => editor.run('italic'), 'wide-only'),
      sep(),
      tb('calendar', 'Échéance et rappel', () => openDatePicker((token) => { editor.setDue(token); maybeAskNotifications(); })),
      tb('hash', 'Étiquette', () => editor.run('tag')),
      sep(),
      tb('image', 'Ajouter une image', () => addImages()),
      ...(dictSupported() ? [tb('speech', 'Dicter du texte', () => dictate())] : []),
      tb('mic', 'Enregistrer une note vocale', () => startVoice(), 'mic'),
      tb('clip', 'Joindre un fichier', () => addFiles()),
      sep(),
      tb('more', 'Autres mises en forme', (e) => formatMenu(e.currentTarget)),
    );
  }
  buildToolbar();

  function formatMenu(anchor) {
    openMenu(anchor, [
      { label: 'Gras', icon: 'bold', onClick: () => editor.run('bold') },
      { label: 'Italique', icon: 'italic', onClick: () => editor.run('italic') },
      { label: 'Lien', icon: 'link', onClick: () => editor.run('link') },
      { label: 'Citation', icon: 'quote', onClick: () => editor.run('quote') },
      { label: 'Code', icon: 'code', onClick: () => editor.run('code') },
      { separator: true },
      { label: 'Annuler', icon: 'restore', onClick: () => editor.run('undo') },
      { label: 'Rétablir', icon: 'restore', onClick: () => editor.run('redo') },
    ]);
  }

  async function maybeAskNotifications() {
    const p = await permissionState();
    if (p === 'prompt' || p === 'prompt-with-rationale') {
      toast('Autoriser les notifications pour être prévenu à l\'échéance ?', {
        duration: 8000,
        action: { label: 'Autoriser', onClick: async () => { await requestPermission(); reschedule(); } },
      });
    }
  }

  // ——— Calendrier du téléphone : proposer d'ajouter une tâche datée et horodatée ———
  const proposed = new Set();
  let proposeTimer = null;
  const clip = (s, n = 40) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

  function proposeEventsSoon() {
    clearTimeout(proposeTimer);
    if (cal.supported()) proposeTimer = setTimeout(proposeEvents, 2500);
  }

  function proposeEvents() {
    if (!current || current.deletedAt) return;
    const noteId = current.id;
    const typing = editor.cursorLine(); // on ne propose rien pour la ligne en cours de frappe
    const next = calendarCandidates(current.body).find((c) => c.line !== typing && !proposed.has(`${noteId}|${c.title}|${c.date}|${c.time}`));
    if (!next) return;
    proposed.add(`${noteId}|${next.title}|${next.date}|${next.time}`);
    toast(`Ajouter « ${clip(next.title || 'Tâche')} » au calendrier ?`, {
      duration: 9000,
      action: { label: 'Ajouter', onClick: () => addToCalendar(noteId, next) },
    });
  }

  async function addToCalendar(noteId, c) {
    let access = await cal.permission();
    if (access !== 'granted') access = await cal.requestAccess();
    if (access !== 'granted') { toast('Accès au calendrier refusé. Autorisez-le dans les réglages du téléphone.'); return; }
    try { await cal.addEvent({ title: c.title || 'Tâche', date: c.date, time: c.time }); }
    catch (e) { toast('Ajout impossible : ' + (e?.message || e)); return; }
    // La ligne reçoit un repère : l'événement ne sera plus proposé deux fois, même depuis un autre appareil.
    const n = getNote(noteId);
    const line = n && calendarCandidates(n.body).find((x) => x.title === c.title && x.date === c.date && x.time === c.time)?.line;
    if (line != null) {
      const lines = n.body.split('\n');
      lines[line] = `${lines[line].trimEnd()} ${CAL_MARK}`;
      const body = lines.join('\n');
      setBody(noteId, body, 'calendar');
      if (current && current.id === noteId) editor.replaceExternal(body);
    }
    toast('Ajouté au calendrier');
    agenda.refresh({ force: true });
  }

  // ——— Pièces jointes ———
  function safeName(n) { return (n || 'fichier').replace(/[\[\]()\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'fichier'; }

  async function attachFiles(files) {
    if (!current || current.deletedAt) return;
    for (const f of files) {
      try {
        const blob = f.type.startsWith('image/') ? await prepareImage(f) : f;
        const name = safeName(f.name);
        const meta = await addAttachment(blob, { name, noteId: current.id });
        editor.insertBlock(`![${name}](att:${meta.id})`);
      } catch (e) {
        toast('Impossible d\'ajouter ' + (f.name || 'ce fichier') + '.');
      }
    }
  }
  async function addImages() { const f = await pickFiles({ accept: 'image/*' }); if (f.length) attachFiles(f); }
  async function addFiles() { const f = await pickFiles({ accept: '' }); if (f.length) attachFiles(f); }

  // ——— Voix ———
  let rec = null, recTimer = null;
  async function dictate() {
    const t = await dictateSheet({ title: 'Dictée' });
    if (!t || !current) return;
    editor.focus();
    editor.insertInline(t.replace(/\n/g, '\n'));
  }

  async function startVoice() {
    if (!recorderSupported()) { toast('L\'enregistrement audio n\'est pas disponible ici.'); return; }
    if (rec) return;
    try { rec = await startRecording(); }
    catch (e) {
      rec = null;
      toast(e?.name === 'NotAllowedError' ? 'Micro refusé. Autorisez-le dans les réglages du téléphone.' : 'Micro indisponible.');
      return;
    }
    const time = h('span', { class: 'rec-time' }, '0:00');
    const stop = async () => {
      const r = rec; rec = null; clearInterval(recTimer);
      buildToolbar();
      const { blob, duration } = await r.stop();
      if (!current || blob.size < 800) return;
      const name = 'Note vocale ' + new Intl.DateTimeFormat('fr-CH', { hour: '2-digit', minute: '2-digit' }).format(new Date());
      const meta = await addAttachment(blob, { name, noteId: current.id, duration });
      editor.insertBlock(`![${name}](att:${meta.id})`);
    };
    const cancel = () => { const r = rec; rec = null; clearInterval(recTimer); r.cancel(); buildToolbar(); };
    toolbar.replaceChildren(
      h('span', { class: 'rec-dot', 'aria-hidden': 'true' }),
      h('span', { class: 'rec-label' }, 'Enregistrement'), time, h('span', { class: 'spacer' }),
      h('button', { class: 'btn', type: 'button', onclick: cancel }, 'Annuler'),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: stop, autofocus: true }, 'Terminer'));
    recTimer = setInterval(() => {
      const s = (Date.now() - rec.startedAt) / 1000;
      time.textContent = fmtDuration(s);
      if (s > 600) stop();
    }, 250);
  }

  // ——— Menus ———
  function moveMenu(anchor) {
    if (!current) return;
    const items = [{ header: 'Déplacer vers' }, { label: 'Sans dossier', icon: 'file', active: !current.folderId, onClick: () => moveToFolder(current.id, null) }];
    foldersList().forEach((f) => items.push({ label: f.name, icon: 'folder', active: current.folderId === f.id, onClick: () => moveToFolder(current.id, f.id) }));
    items.push({ separator: true }, { label: 'Nouveau dossier…', icon: 'plus', onClick: async () => {
      const name = await promptDialog({ title: 'Nouveau dossier', label: 'Nom du dossier', confirm: 'Créer' });
      if (name) moveToFolder(current.id, createFolder(name).id);
    } });
    openMenu(anchor, items);
  }

  function noteAsMarkdown() {
    return current.body.replace(/!\[([^\]]*)\]\(att:[^)]*\)/g, '[Pièce jointe : $1]');
  }

  function moreMenu(anchor) {
    if (!current) return;
    const n = current;
    const words = countWords(n.body);
    const created = new Intl.DateTimeFormat('fr-CH', { dateStyle: 'long' }).format(new Date(n.createdAt));
    openMenu(anchor, [
      { header: `${words} mot${words > 1 ? 's' : ''} · créée le ${created}` },
      { label: n.pinned ? 'Désépingler' : 'Épingler en haut', icon: 'pin', onClick: () => togglePin(n.id) },
      { label: 'Déplacer vers…', icon: 'folder', onClick: () => moveMenu(folderBtn) },
      { label: 'Copier le texte', icon: 'copy', onClick: async () => { try { await navigator.clipboard.writeText(noteAsMarkdown()); toast('Texte copié'); } catch { toast('Copie impossible ici.'); } } },
      { label: 'Exporter en Markdown', icon: 'download', onClick: () => saveTextFile(((n.title || 'note').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) || 'note') + '.md', noteAsMarkdown()) },
      { label: 'Copier en texte brut', icon: 'copy', onClick: async () => { try { await navigator.clipboard.writeText(plainText(n.body).replace(/\n{3,}/g, '\n\n').trim()); toast('Texte brut copié'); } catch { toast('Copie impossible ici.'); } } },
      { separator: true },
      { label: 'Mode écriture', icon: 'nib', onClick: () => enterFocus() },
      { label: 'Versions', icon: 'restore', onClick: () => openVersions(n.id, { onRestore: (m) => editor.replaceExternal(m.body) }) },
      ...(n.kind === 'note' || n.kind === 'daily' ? [{ label: 'Enregistrer comme modèle', icon: 'file', onClick: () => saveAsTemplate(n) }] : []),
      { separator: true },
      { label: 'Mettre à la corbeille', icon: 'trash', danger: true, onClick: () => removeCurrent() },
    ]);
  }

  function removeCurrent() {
    if (!current) return;
    const id = current.id;
    const isDraft = state.drafts.has(id);
    trashNote(id);
    ctx.closeNote({ replace: true });
    if (!isDraft) toast('Note mise à la corbeille', { action: { label: 'Annuler', onClick: () => restoreNote(id) } });
  }

  // ——— Bandeaux ———
  function renderBanner() {
    banner.replaceChildren();
    if (!current) return;
    const n = current;
    if (n.deletedAt) {
      banner.appendChild(h('div', { class: 'np-banner' },
        h('span', {}, 'Cette note est dans la corbeille.'),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn btn-primary sm', type: 'button', onclick: () => { restoreNote(n.id); toast('Note restaurée'); } }, 'Restaurer'),
        h('button', { class: 'btn btn-danger sm', type: 'button', onclick: async () => {
          if (await confirmDialog({ title: 'Supprimer définitivement ?', message: 'Cette note sera effacée de cet appareil.', confirm: 'Supprimer', danger: true })) { await deleteForever(n.id); ctx.closeNote({ replace: true }); }
        } }, 'Supprimer')));
      return;
    }
    if (n.kind === 'inbox') {
      banner.appendChild(h('div', { class: 'np-banner' },
        h('span', { html: icon('inbox', 18) }),
        h('span', {}, 'Dans la boîte de réception'),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn btn-quiet sm', type: 'button', onclick: () => openTriage() }, 'Trier'),
        h('button', { class: 'btn btn-primary sm', type: 'button', onclick: () => { setKind(n.id, 'note'); toast('Gardée dans Notes'); } }, 'Garder')));
    }
    if (n.kind === 'daily' && n.date === ymd(new Date()) && !dismissedCarry.has(n.id)) {
      const carry = openTasksBefore(n.date);
      if (carry) {
        const fresh = carry.tasks.filter((t) => !n.body.includes(t.text));
        if (fresh.length) {
          banner.appendChild(h('div', { class: 'np-banner' },
            h('span', { html: icon('tasks', 18) }),
            h('span', {}, `${fresh.length} tâche${fresh.length > 1 ? 's' : ''} ouverte${fresh.length > 1 ? 's' : ''} dans votre dernier journal`),
            h('span', { class: 'spacer' }),
            h('button', { class: 'btn btn-quiet sm', type: 'button', onclick: () => { dismissedCarry.add(n.id); renderBanner(); } }, 'Ignorer'),
            h('button', { class: 'btn btn-primary sm', type: 'button', onclick: () => {
              const add = fresh.map((t) => `- [ ] ${t.text}${t.due ? ' @' + t.due.date + (t.due.time ? ' ' + t.due.time : '') : ''}`).join('\n');
              const body = n.body.replace(/\s*$/, '') + '\n\n' + add + '\n';
              setBody(n.id, body, 'banner');
              editor.replaceExternal(body);
              dismissedCarry.add(n.id);
              renderBanner();
              reschedule();
            } }, 'Reporter ici')));
        }
      }
    }
  }

  let linksOpen = true;
  function renderLinks() {
    links.replaceChildren();
    if (!current || current.deletedAt) { links.hidden = true; return; }
    const bl = backlinks(current.id);
    links.hidden = bl.length === 0;
    if (!bl.length) return;
    links.appendChild(h('button', { class: 'np-links-head', type: 'button', 'aria-expanded': String(linksOpen), onclick: () => { linksOpen = !linksOpen; renderLinks(); } },
      h('span', { html: icon(linksOpen ? 'down' : 'chevron', 14) }),
      h('span', {}, `Mentionnée dans ${bl.length} note${bl.length > 1 ? 's' : ''}`)));
    if (!linksOpen) return;
    for (const { note, line } of bl.slice(0, 20)) {
      links.appendChild(h('button', { class: 'np-link', type: 'button', onclick: () => ctx.openNote(note.id) },
        h('span', { class: 'np-link-title' }, note.title || 'Note vide'),
        line ? h('span', { class: 'np-link-line' }, line) : null));
    }
  }
  let linksTimer = null;
  const renderLinksSoon = () => { clearTimeout(linksTimer); linksTimer = setTimeout(renderLinks, 250); };

  function renderBar() {
    if (!current) return;
    const f = current.folderId ? state.folders.get(current.folderId) : null;
    const k = current.kind;
    const fixed = k === 'daily' || k === 'inbox' || k === 'person' || k === 'habit' || k === 'template';
    const [fic, flabel] = k === 'daily' ? ['sun', 'Journal'] : k === 'inbox' ? ['inbox', 'Boîte de réception'] : k === 'person' ? ['people', 'Personne'] : k === 'habit' ? ['habit', 'Habitude'] : k === 'template' ? ['file', 'Modèle'] : ['folder', f ? f.name : 'Notes'];
    folderBtn.replaceChildren(...[h('span', { html: icon(fic, 15) }), h('span', {}, flabel), fixed ? null : h('span', { html: icon('down', 14) })].filter(Boolean));
    folderBtn.disabled = fixed || !!current.deletedAt;
    pinBtn.innerHTML = icon('pin', 20);
    pinBtn.classList.toggle('active', !!current.pinned);
    pinBtn.setAttribute('aria-pressed', String(!!current.pinned));
    pinBtn.setAttribute('aria-label', current.pinned ? 'Désépingler' : 'Épingler');
    pinBtn.hidden = !!current.deletedAt;
    toolbar.hidden = !!current.deletedAt;
  }

  // ——— API ———
  function show(id, { line = null, focus = false } = {}) {
    if (current && current.id !== id) leave();
    const n = getNote(id);
    if (!n) { current = null; inner.hidden = true; empty.hidden = false; return false; }
    const same = current && current.id === id;
    current = n;
    inner.hidden = false; empty.hidden = true;
    if (!same) {
      editor.setDoc(n.body, { readOnly: !!n.deletedAt });
      const fresh = !n.body.trim() || (n.kind === 'daily' && n.body.trim().split('\n').length <= 1 && state.drafts.has(n.id));
      if (!n.deletedAt && (focus || fresh)) editor.focus(true);
      else if (line != null) editor.focusLine(line);
    } else if (line != null) editor.focusLine(line);
    status.classList.remove('on');
    renderBar(); renderBanner(); renderLinks();
    agenda.show(n);
    personCard.show(n);
    return true;
  }

  function leave() {
    if (!current) return;
    exitFocus();
    clearTimeout(proposeTimer);
    agenda.hide();
    personCard.hide();
    if (!current.deletedAt) editor.normalize();
    flush();
    discardIfEmpty(current.id);
    if (rec) { rec.cancel(); rec = null; clearInterval(recTimer); buildToolbar(); }
    current = null;
  }

  function hide() { leave(); inner.hidden = true; empty.hidden = false; }

  subscribe((e) => {
    if (!current) return;
    if (e.type === 'body' || e.type === 'notes') renderLinksSoon();
    if (e.type === 'body' && e.id === current.id && e.source !== 'editor') editor.replaceExternal(current.body);
    if (e.type === 'notes' || e.type === 'folders') {
      const n = getNote(current.id);
      if (!n) return;
      const wasDeleted = !!current.deletedAt;
      current = n;
      if (wasDeleted !== !!n.deletedAt) editor.setDoc(n.body, { readOnly: !!n.deletedAt });
      renderBar(); renderBanner();
    }
  });

  return {
    show, hide, leave,
    get currentId() { return current?.id || null; },
    focus: () => editor.focus(true),
    attach: attachFiles,
  };
}
