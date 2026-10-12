// Synchronisation avec Supabase (REST direct, sans bibliothèque).
// Connexion par code à 6 chiffres envoyé par e-mail ; la modification la plus récente l'emporte.
import { db } from './db.js';
import {
  subscribe, collectChanges, markPushed, applyRemote, putRemoteAttachment, removeLocalAttachments,
  attachmentBlob, setSyncEnabled, resetSyncState, state,
} from './store.js';
import { SUPABASE } from './config.js';

const JSON_H = { 'Content-Type': 'application/json' };
let session = null;
let running = false;
let again = false;
let timer = null;
let refreshing = null;

// ——— État observable ———
export const status = { state: 'off', last: null, error: null, email: null };
const listeners = new Set();
export function onStatus(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function setStatus(patch) { Object.assign(status, patch); listeners.forEach((fn) => fn(status)); }
export const isSignedIn = () => !!session;

// ——— Erreurs lisibles ———
class SyncError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}
const MESSAGES = {
  over_email_send_rate_limit: 'Trop de demandes d’e-mail. Réessayez dans quelques minutes.',
  over_request_rate_limit: 'Trop de tentatives. Réessayez dans quelques minutes.',
  otp_expired: 'Code invalide ou expiré.',
  validation_failed: 'Adresse e-mail invalide.',
  email_address_invalid: 'Adresse e-mail invalide.',
  signup_disabled: 'Les inscriptions sont désactivées sur ce projet.',
};
async function toError(res) {
  let j = {};
  try { j = await res.json(); } catch {}
  const code = j.error_code || j.code || '';
  const raw = j.msg || j.message || j.error_description || j.error || `Erreur ${res.status}`;
  let msg = MESSAGES[code] || raw;
  if (/token has expired|invalid/i.test(raw) && !MESSAGES[code]) msg = 'Code invalide ou expiré.';
  if (res.status === 429) msg = MESSAGES.over_email_send_rate_limit;
  const e = new SyncError(msg, res.status === 401 ? 'auth' : 'http');
  e.status = res.status;
  return e;
}

// ——— Session ———
async function saveSession(s) {
  session = s;
  await db.put('meta', { key: 'session', value: s });
}
function fromTokens(j, prev = {}) {
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: Date.now() + (j.expires_in || 3600) * 1000,
    email: j.user?.email || prev.email,
    userId: j.user?.id || prev.userId,
  };
}
async function refresh() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const res = await fetch(`${SUPABASE.url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST', headers: { ...JSON_H, apikey: SUPABASE.key },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    if (!res.ok) {
      const err = await toError(res);
      if (res.status === 400 || res.status === 401 || res.status === 403) { err.code = 'auth'; await expire(); }
      throw err;
    }
    await saveSession(fromTokens(await res.json(), session));
  })().finally(() => { refreshing = null; });
  return refreshing;
}
async function expire() {
  setStatus({ state: 'expired', error: 'Session expirée : reconnectez-vous.' });
}

async function api(path, { method = 'GET', headers = {}, body, auth = true } = {}) {
  const h = { apikey: SUPABASE.key, ...headers };
  const send = () => {
    h.Authorization = 'Bearer ' + (auth ? session.access_token : SUPABASE.key);
    return fetch(SUPABASE.url + path, { method, headers: h, body });
  };
  if (auth && session.expires_at - Date.now() < 60000) await refresh();
  let res;
  try { res = await send(); } catch { throw new SyncError('Hors connexion.', 'offline'); }
  if (res.status === 401 && auth) { await refresh(); try { res = await send(); } catch { throw new SyncError('Hors connexion.', 'offline'); } }
  if (!res.ok) throw await toError(res);
  return res;
}

// ——— Connexion ———
export async function requestCode(email) {
  await api('/auth/v1/otp', { method: 'POST', auth: false, headers: JSON_H, body: JSON.stringify({ email: email.trim(), create_user: true }) });
}

export async function verifyCode(email, token) {
  const res = await api('/auth/v1/verify', {
    method: 'POST', auth: false, headers: JSON_H,
    body: JSON.stringify({ type: 'email', email: email.trim(), token: token.trim() }),
  });
  const s = fromTokens(await res.json());
  const prev = (await db.get('meta', 'syncUser'))?.value;
  if (prev && prev !== s.userId) {
    await resetSyncState();
    for (const t of TABLES) await db.del('meta', 'pull:' + t);
  }
  await db.put('meta', { key: 'syncUser', value: s.userId });
  await saveSession(s);
  setSyncEnabled(true);
  setStatus({ state: 'idle', email: s.email, error: null });
  syncNow();
}

export async function signOut() {
  session = null;
  await db.del('meta', 'session');
  setSyncEnabled(false);
  setStatus({ state: 'off', email: null, error: null });
}

// ——— Conversion local ⇄ distant ———
const TABLES = ['folders', 'notes', 'attachments'];
const dev = () => state.deviceId;

const noteRow = (n) => ({
  id: n.id, body: n.body, folder_id: n.folderId ?? null, pinned: !!n.pinned, kind: n.kind || 'note', date: n.date ?? null,
  created_at: n.createdAt ?? null, updated_at: n.updatedAt, deleted_at: n.deletedAt ?? null, device_id: dev(), purged: false,
});
const folderRow = (f) => ({
  id: f.id, name: f.name, created_at: f.createdAt ?? null, updated_at: f.updatedAt, deleted_at: f.deletedAt ?? null, device_id: dev(), purged: false,
});
const attRow = (a, uid) => ({
  id: a.id, note_id: a.noteId ?? null, name: a.name, type: a.type, size: a.size, kind: a.kind, duration: a.duration ?? null,
  storage_path: `${uid}/${a.id}`, created_at: a.createdAt ?? null, updated_at: a.updatedAt, deleted_at: a.deletedAt ?? null, device_id: dev(), purged: false,
});
const purgedNote = (id, now) => ({ ...noteRow({ id, body: '', updatedAt: now, deletedAt: now }), purged: true });
const purgedAtt = (id, now) => ({ ...attRow({ id, name: '', updatedAt: now, deletedAt: now }, session.userId), purged: true });

const noteFrom = (r) => ({
  id: r.id, body: r.body, folderId: r.folder_id, pinned: r.pinned, kind: r.kind, date: r.date,
  createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: r.deleted_at, purged: r.purged,
});
const folderFrom = (r) => ({ id: r.id, name: r.name, createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: r.deleted_at, purged: r.purged });

// ——— Envoi ———
async function upsert(table, rows) {
  for (let i = 0; i < rows.length; i += 100) {
    await api(`/rest/v1/${table}?on_conflict=id`, {
      method: 'POST', headers: { ...JSON_H, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows.slice(i, i + 100)),
    });
  }
}

async function push() {
  const ch = await collectChanges();
  const uid = session.userId;
  const now = Date.now();

  // Fichiers d'abord : une ligne ne doit pas référencer un fichier absent.
  const toUpload = ch.atts.filter((a) => !a.deletedAt && !a.up);
  for (const a of toUpload) {
    const blob = await attachmentBlob(a.id);
    if (!blob) continue;
    await api(`/storage/v1/object/attachments/${uid}/${a.id}`, {
      method: 'POST', headers: { 'Content-Type': a.type || 'application/octet-stream', 'x-upsert': 'true' }, body: blob,
    });
  }

  if (ch.folders.length) await upsert('folders', ch.folders.map(folderRow));
  if (ch.notes.length) await upsert('notes', ch.notes.map(noteRow));
  if (ch.atts.length) await upsert('attachments', ch.atts.map((a) => attRow(a, uid)));

  const pn = ch.purged.filter((p) => p.t === 'notes').map((p) => purgedNote(p.id, now));
  const pa = ch.purged.filter((p) => p.t === 'attachments');
  if (pn.length) await upsert('notes', pn);
  if (pa.length) {
    await upsert('attachments', pa.map((p) => purgedAtt(p.id, now)));
    for (const p of pa) { try { await api(`/storage/v1/object/attachments/${uid}/${p.id}`, { method: 'DELETE' }); } catch {} }
  }

  await markPushed({
    notes: ch.notes.map((n) => ({ id: n.id, u: n.updatedAt })),
    folders: ch.folders.map((f) => ({ id: f.id, u: f.updatedAt })),
    atts: ch.atts.map((a) => ({ id: a.id, u: a.updatedAt })),
    purgedCount: ch.purged.length,
  });
  return ch.notes.length + ch.folders.length + ch.atts.length + ch.purged.length;
}

// ——— Réception ———
async function pullTable(table, handle) {
  const key = 'pull:' + table;
  let since = (await db.get('meta', key))?.value || '1970-01-01T00:00:00Z';
  for (;;) {
    const res = await api(`/rest/v1/${table}?select=*&synced_at=gt.${encodeURIComponent(since)}&order=synced_at.asc&limit=500`);
    const rows = await res.json();
    if (!rows.length) break;
    await handle(rows);
    since = rows[rows.length - 1].synced_at;
    await db.put('meta', { key, value: since });
    if (rows.length < 500) break;
  }
}

async function pull() {
  let n = 0;
  await pullTable('folders', async (rows) => { n += await applyRemote({ folders: rows.map(folderFrom) }); });
  await pullTable('notes', async (rows) => { n += await applyRemote({ notes: rows.map(noteFrom) }); });
  await pullTable('attachments', async (rows) => {
    const drop = [];
    for (const r of rows) {
      const cur = state.atts.get(r.id);
      if (r.purged || r.deleted_at) { drop.push(r.id); continue; }
      if (cur) continue;
      const res = await api(`/storage/v1/object/authenticated/attachments/${r.storage_path || session.userId + '/' + r.id}`);
      const blob = await res.blob();
      await putRemoteAttachment({
        id: r.id, noteId: r.note_id, name: r.name, type: r.type, size: r.size, kind: r.kind, duration: r.duration,
        createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: null, rv: r.updated_at, up: true,
      }, blob.type ? blob : new Blob([blob], { type: r.type }));
      n++;
    }
    if (drop.length) await removeLocalAttachments(drop);
  });
  return n;
}

// ——— Cycle de synchronisation ———
export async function syncNow() {
  if (!session) return;
  if (status.state === 'expired') return;
  if (running) { again = true; return; }
  running = true;
  setStatus({ state: 'syncing', error: null });
  try {
    await pull();
    await push();
    setStatus({ state: 'idle', last: Date.now(), error: null });
  } catch (e) {
    if (e.code === 'auth') await expire();
    else setStatus({ state: 'error', error: e.code === 'offline' ? 'Hors connexion : nouvelle tentative au retour du réseau.' : (e.message || String(e)) });
  } finally {
    running = false;
    if (again) { again = false; schedule(500); }
  }
}

function schedule(ms) {
  clearTimeout(timer);
  timer = setTimeout(() => syncNow(), ms);
}

export async function startSync() {
  const saved = (await db.get('meta', 'session'))?.value;
  if (saved) {
    session = saved;
    setSyncEnabled(true);
    setStatus({ state: 'idle', email: saved.email });
  }
  subscribe((e) => {
    if (!session || e.source === 'sync') return;
    if (e.type === 'body' || e.type === 'notes' || e.type === 'folders') schedule(4000);
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') schedule(300); });
  window.addEventListener('online', () => schedule(300));
  setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 60000);
  if (session) syncNow();
}
