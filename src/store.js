// État de l'application en mémoire + persistance IndexedDB.
import { db } from './db.js';
import {
  titleOf, snippetOf, plainText, extractTags, parseTasks, ymd, longDay, parseYmd, dueDate,
} from './md.js';

const TRASH_DAYS = 30;
const DEFAULT_SETTINGS = {
  openOnNew: true,
  reminderTime: '09:00',
  sort: 'updated',
};

export const state = {
  notes: new Map(),
  folders: new Map(),
  atts: new Map(),
  drafts: new Map(),
  settings: { ...DEFAULT_SETTINGS },
  deviceId: null,
  ready: false,
};

// ——— Événements ———
const subs = new Set();
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
function emit(evt) { subs.forEach((fn) => fn(evt)); }

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// ——— Dérivation ———
function derive(n) {
  n.title = titleOf(n.body);
  n.snippet = snippetOf(n.body);
  n.tags = extractTags(n.body);
  n._s = (n.title + '\n' + plainText(n.body)).toLowerCase();
  n._tasks = null;
}

function serialize(n) {
  const { id, body, title, snippet, tags, folderId, pinned, kind, date, createdAt, updatedAt, deletedAt } = n;
  return { id, body, title, snippet, tags, folderId, pinned, kind, date, createdAt, updatedAt, deletedAt };
}

// ——— Initialisation ———
export async function init() {
  const [notes, folders, atts, meta] = await Promise.all([
    db.getAll('notes'), db.getAll('folders'), db.getAll('attachments'), db.getAll('meta'),
  ]);
  const metaMap = new Map(meta.map((m) => [m.key, m.value]));
  state.deviceId = metaMap.get('deviceId');
  if (!state.deviceId) { state.deviceId = uid(); await db.put('meta', { key: 'deviceId', value: state.deviceId }); }
  state.settings = { ...DEFAULT_SETTINGS, ...(metaMap.get('settings') || {}) };

  folders.forEach((f) => state.folders.set(f.id, f));
  atts.forEach((a) => state.atts.set(a.id, a));

  const limit = Date.now() - TRASH_DAYS * 86400000;
  const purge = [];
  for (const n of notes) {
    if (n.deletedAt && n.deletedAt < limit) { purge.push(n.id); continue; }
    derive(n);
    state.notes.set(n.id, n);
  }
  if (purge.length) await purgeIds(purge);
  state.ready = true;
  emit({ type: 'ready' });
}

async function purgeIds(ids) {
  const attIds = [...state.atts.values()].filter((a) => ids.includes(a.noteId)).map((a) => a.id);
  await db.delMany('notes', ids);
  if (attIds.length) { await db.deleteAttachments(attIds); attIds.forEach((i) => { state.atts.delete(i); revoke(i); }); }
  ids.forEach((i) => state.notes.delete(i));
}

// ——— Réglages ———
export function setSetting(key, value) {
  state.settings[key] = value;
  db.put('meta', { key: 'settings', value: { ...state.settings } });
  emit({ type: 'settings' });
}

// ——— Notes ———
const timers = new Map();

function persistSoon(note) {
  clearTimeout(timers.get(note.id));
  timers.set(note.id, setTimeout(() => { timers.delete(note.id); db.put('notes', serialize(note)); }, 350));
}

export function flush() {
  for (const [id, t] of timers) {
    clearTimeout(t);
    const n = state.notes.get(id);
    if (n) db.put('notes', serialize(n));
  }
  timers.clear();
}

export function getNote(id) { return state.notes.get(id) || state.drafts.get(id) || null; }

export function createDraft({ folderId = null, body = '', kind = 'note', date = null } = {}) {
  const now = Date.now();
  const n = { id: uid(), body, folderId, pinned: false, kind, date, createdAt: now, updatedAt: now, deletedAt: null };
  derive(n);
  state.drafts.set(n.id, n);
  return n;
}

export function discardIfEmpty(id) {
  const d = state.drafts.get(id);
  if (d && !d.body.trim()) state.drafts.delete(id);
}

/** source : 'editor' (frappe) ou autre (ex. case cochée depuis la vue Tâches). */
export function setBody(id, body, source = 'editor') {
  const n = getNote(id);
  if (!n || n.body === body) return;
  n.body = body;
  n.updatedAt = Date.now();
  derive(n);
  if (state.drafts.has(id)) {
    if (!body.trim()) return;
    state.drafts.delete(id);
    state.notes.set(id, n);
    db.put('notes', serialize(n));
    emit({ type: 'notes', id, source });
    return;
  }
  persistSoon(n);
  emit({ type: 'body', id, source });
}

function touch(n, patch) {
  Object.assign(n, patch, { updatedAt: Date.now() });
  if (!state.drafts.has(n.id)) db.put('notes', serialize(n));
}

export function togglePin(id) { const n = getNote(id); if (n) { touch(n, { pinned: !n.pinned }); emit({ type: 'notes', id }); } }
export function moveToFolder(id, folderId) { const n = getNote(id); if (n) { touch(n, { folderId }); emit({ type: 'notes', id }); } }

export function trashNote(id) {
  const n = state.notes.get(id);
  if (!n) { state.drafts.delete(id); emit({ type: 'notes', id }); return; }
  touch(n, { deletedAt: Date.now() });
  emit({ type: 'notes', id });
}
export function restoreNote(id) { const n = state.notes.get(id); if (n) { touch(n, { deletedAt: null }); emit({ type: 'notes', id }); } }
export async function deleteForever(id) { await purgeIds([id]); emit({ type: 'notes', id }); }
export async function emptyTrash() {
  const ids = [...state.notes.values()].filter((n) => n.deletedAt).map((n) => n.id);
  await purgeIds(ids);
  emit({ type: 'notes' });
}

export function dailyFor(dateStr, { create = true } = {}) {
  for (const n of state.notes.values()) if (!n.deletedAt && n.kind === 'daily' && n.date === dateStr) return n;
  for (const n of state.drafts.values()) if (n.kind === 'daily' && n.date === dateStr) return n;
  if (!create) return null;
  const d = createDraft({ kind: 'daily', date: dateStr, body: `# ${longDay(parseYmd(dateStr))}\n\n` });
  return d;
}

/** Tâches ouvertes de la veille (ou du dernier journal précédent). */
export function openTasksBefore(dateStr) {
  const prev = [...state.notes.values()]
    .filter((n) => !n.deletedAt && n.kind === 'daily' && n.date < dateStr)
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  if (!prev) return null;
  const tasks = tasksOf(prev).filter((t) => !t.done);
  return tasks.length ? { note: prev, tasks } : null;
}

// ——— Dossiers ———
export function createFolder(name) {
  const f = { id: uid(), name: name.trim() || 'Sans titre', createdAt: Date.now(), updatedAt: Date.now(), deletedAt: null };
  state.folders.set(f.id, f);
  db.put('folders', f);
  emit({ type: 'folders' });
  return f;
}
export function renameFolder(id, name) {
  const f = state.folders.get(id); if (!f || !name.trim()) return;
  f.name = name.trim(); f.updatedAt = Date.now(); db.put('folders', f); emit({ type: 'folders' });
}
export function deleteFolder(id) {
  const f = state.folders.get(id); if (!f) return;
  for (const n of state.notes.values()) if (n.folderId === id) touch(n, { folderId: null });
  state.folders.delete(id);
  db.del('folders', id);
  emit({ type: 'folders' }); emit({ type: 'notes' });
}
export const foldersList = () => [...state.folders.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));

// ——— Requêtes ———
export function liveNotes() { return [...state.notes.values()].filter((n) => !n.deletedAt); }

export function query({ view = 'all', folderId = null, tag = null, text = '' } = {}) {
  let list;
  if (view === 'trash') list = [...state.notes.values()].filter((n) => n.deletedAt);
  else if (view === 'journal') list = liveNotes().filter((n) => n.kind === 'daily');
  else {
    list = liveNotes();
    if (view === 'folder') list = list.filter((n) => n.folderId === folderId);
    if (view === 'tag') list = list.filter((n) => n.tags.includes(tag));
  }
  const terms = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length) list = list.filter((n) => terms.every((t) => n._s.includes(t)));
  const sort = state.settings.sort;
  const cmp = {
    updated: (a, b) => b.updatedAt - a.updatedAt,
    created: (a, b) => b.createdAt - a.createdAt,
    title: (a, b) => a.title.localeCompare(b.title, 'fr'),
  }[sort] || ((a, b) => b.updatedAt - a.updatedAt);
  if (view === 'journal') list.sort((a, b) => (a.date < b.date ? 1 : -1));
  else if (view === 'trash') list.sort((a, b) => b.deletedAt - a.deletedAt);
  else list.sort((a, b) => (b.pinned - a.pinned) || cmp(a, b));
  return list;
}

export function searchAll(text, limit = 12) {
  const terms = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const scored = [];
  for (const n of liveNotes()) {
    if (!terms.every((t) => n._s.includes(t))) continue;
    const t = n.title.toLowerCase();
    let score = 0;
    for (const term of terms) { if (t.startsWith(term)) score += 4; else if (t.includes(term)) score += 3; else score += 1; }
    scored.push([score + (n.pinned ? 0.5 : 0) + n.updatedAt / 1e14, n]);
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, limit).map((x) => x[1]);
}

export function counts() {
  const live = liveNotes();
  const byFolder = new Map(); const byTag = new Map();
  for (const n of live) {
    if (n.folderId) byFolder.set(n.folderId, (byFolder.get(n.folderId) || 0) + 1);
    for (const t of n.tags) byTag.set(t, (byTag.get(t) || 0) + 1);
  }
  const trash = [...state.notes.values()].filter((n) => n.deletedAt).length;
  return { all: live.length, byFolder, byTag, trash };
}

// ——— Tâches ———
export function tasksOf(n) { return (n._tasks ??= parseTasks(n.body)); }

export function allTasks() {
  const out = [];
  for (const n of liveNotes()) for (const t of tasksOf(n)) out.push({ ...t, noteId: n.id, noteTitle: n.title });
  return out;
}

export function toggleTaskLine(noteId, line) {
  const n = getNote(noteId); if (!n) return;
  const lines = n.body.split('\n');
  const l = lines[line]; if (l === undefined) return;
  lines[line] = /\[ \]/.test(l) ? l.replace('[ ]', '[x]') : l.replace(/\[[xX]\]/, '[ ]');
  setBody(noteId, lines.join('\n'), 'tasks');
}

export function appendTaskToToday(text) {
  const today = ymd(new Date());
  const n = dailyFor(today);
  const body = n.body.replace(/\s*$/, '') + `\n- [ ] ${text.trim()}\n`;
  setBody(n.id, body, 'tasks');
  return n;
}

export function taskStats() {
  const now = new Date();
  let open = 0, overdue = 0;
  for (const t of allTasks()) {
    if (t.done) continue;
    open++;
    if (t.due && dueDate(t.due, '23:59') < now && t.due.date !== ymd(now)) overdue++;
  }
  return { open, overdue };
}

// ——— Pièces jointes ———
const urlCache = new Map();
function revoke(id) { const u = urlCache.get(id); if (u) { URL.revokeObjectURL(u); urlCache.delete(id); } }

export async function addAttachment(blob, { name, noteId, duration = null }) {
  const type = blob.type || 'application/octet-stream';
  const kind = type.startsWith('image/') ? 'image' : type.startsWith('audio/') ? 'audio' : 'file';
  const meta = { id: uid(), noteId, name, type, size: blob.size, kind, duration, createdAt: Date.now(), updatedAt: Date.now(), deletedAt: null };
  await db.putAttachment(meta, blob);
  state.atts.set(meta.id, meta);
  return meta;
}
export async function attachmentUrl(id) {
  if (urlCache.has(id)) return urlCache.get(id);
  const blob = await db.getBlob(id);
  if (!blob) return null;
  const u = URL.createObjectURL(blob);
  urlCache.set(id, u);
  return u;
}
export const attachmentBlob = (id) => db.getBlob(id);

export function storageStats() {
  let bytes = 0;
  for (const a of state.atts.values()) bytes += a.size;
  return { notes: liveNotes().length, attachments: state.atts.size, attachmentBytes: bytes };
}

// ——— Export / import ———
const toB64 = (blob) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1] || '');
  r.onerror = () => rej(r.error);
  r.readAsDataURL(blob);
});
const fromB64 = (b64, type) => {
  const bin = atob(b64); const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
};

export async function exportAll() {
  flush();
  const attachments = [];
  for (const a of state.atts.values()) {
    const blob = await db.getBlob(a.id);
    if (blob) attachments.push({ ...a, data: await toB64(blob) });
  }
  const payload = {
    app: 'plume', version: 1, exportedAt: new Date().toISOString(), deviceId: state.deviceId,
    notes: [...state.notes.values()].map(serialize),
    folders: [...state.folders.values()],
    attachments,
  };
  return new Blob([JSON.stringify(payload)], { type: 'application/json' });
}

export async function importAll(text) {
  const data = JSON.parse(text);
  if (data.app !== 'plume') throw new Error("Ce fichier n'est pas une sauvegarde Plume.");
  let added = 0;
  for (const f of data.folders || []) if (!state.folders.has(f.id)) { state.folders.set(f.id, f); await db.put('folders', f); }
  for (const n of data.notes || []) {
    const cur = state.notes.get(n.id);
    if (cur && cur.updatedAt >= n.updatedAt) continue;
    derive(n); state.notes.set(n.id, n); await db.put('notes', serialize(n)); added++;
  }
  for (const a of data.attachments || []) {
    if (state.atts.has(a.id)) continue;
    const { data: b64, ...meta } = a;
    await db.putAttachment(meta, fromB64(b64, meta.type));
    state.atts.set(meta.id, meta);
  }
  emit({ type: 'notes' }); emit({ type: 'folders' });
  return added;
}
