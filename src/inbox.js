// Boîte de réception : tout ce qui est partagé vers Plume arrive ici, puis se trie d'un geste.
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { h, openSheet, openMenu, toast } from './ui.js';
import { icon } from './icons.js';
import {
  createDraft, setBody, getNote, setKind, trashNote, moveToFolder, foldersList, appendTaskToToday, query,
} from './store.js';
import { relTime } from './md.js';
import { ctx } from './ctx.js';

const URL_RE = /https?:\/\/[^\s<>"')\]]+/i;
export const urlOf = (text) => (URL_RE.exec(text || '') || [null])[0];

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#x27': "'" };
const decode = (s) => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
  if (ENT[e.toLowerCase()]) return ENT[e.toLowerCase()];
  const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : e[0] === '#' ? parseInt(e.slice(1), 10) : NaN;
  return Number.isFinite(n) ? String.fromCodePoint(n) : m;
});

/** Titre d'une page web à partir de son HTML (og:title de préférence, sinon <title>). */
export function titleFromHtml(html) {
  const head = String(html || '').slice(0, 200000);
  const og = /<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i.exec(head)
    || /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:title["']/i.exec(head);
  const t = og ? og[1] : (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(head) || [])[1];
  return t ? decode(t).replace(/\s+/g, ' ').trim().slice(0, 140) : '';
}

/** Récupère le titre d'une page ; chaîne vide si impossible (hors ligne, site fermé, navigateur sans accès). */
export async function fetchTitle(url) {
  try {
    if (globalThis.__PLUME_HTTP__) return titleFromHtml(await globalThis.__PLUME_HTTP__(url));
    if (Capacitor.isNativePlatform()) {
      const r = await CapacitorHttp.get({
        url, connectTimeout: 5000, readTimeout: 8000,
        headers: { 'Accept-Language': 'fr,en;q=0.7', 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36' },
        responseType: 'text',
      });
      return typeof r.data === 'string' ? titleFromHtml(r.data) : '';
    }
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 6000);
    const r = await fetch(url, { signal: ctl.signal });
    clearTimeout(t);
    return titleFromHtml(await r.text());
  } catch { return ''; }
}

const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };

/** Dépose un texte ou un lien partagé dans la boîte de réception. Retourne la note créée. */
export function captureToInbox(text) {
  const raw = (text || '').trim();
  const url = urlOf(raw);
  const onlyUrl = url && raw.replace(url, '').trim() === '';
  const d = createDraft({ body: '', kind: 'inbox' });
  const body = onlyUrl ? `# ${host(url)}\n\n${url}\n` : raw + '\n';
  setBody(d.id, body, 'share');
  if (onlyUrl) {
    fetchTitle(url).then((title) => {
      const n = getNote(d.id);
      if (title && n && n.body === body) setBody(d.id, `# ${title}\n\n${url}\n`, 'share');
    });
  }
  return d;
}

export function inboxItems() { return query({ view: 'inbox' }); }

// ——— Tri ———

export function openTriage() {
  let skipped = new Set();
  let done = 0;
  const start = inboxItems().length;
  openSheet({
    title: 'Trier la boîte de réception',
    wide: true,
    className: 'triage',
    content: (body, close) => {
      const wrap = h('div', { class: 'tri' });
      const next = () => inboxItems().find((n) => !skipped.has(n.id)) || null;

      function render() {
        const n = next();
        wrap.replaceChildren();
        if (!n) {
          wrap.appendChild(h('div', { class: 'tri-done' },
            h('div', { class: 'empty-ill', html: icon('check', 40) }),
            h('h3', {}, skipped.size ? 'Le reste attendra' : 'Boîte vide'),
            h('p', {}, skipped.size ? `${skipped.size} élément${skipped.size > 1 ? 's' : ''} laissé${skipped.size > 1 ? 's' : ''} pour plus tard.` : (done ? `${done} élément${done > 1 ? 's' : ''} classé${done > 1 ? 's' : ''}.` : 'Rien à trier.')),
            h('button', { class: 'btn btn-primary', type: 'button', onclick: () => close() }, 'Fermer')));
          return;
        }
        const url = (/https?:\/\/\S+/.exec(n.body) || [])[0];
        const pos = Math.min(start, done + skipped.size + 1);
        wrap.append(
          h('div', { class: 'tri-count' }, `${pos} sur ${Math.max(start, pos)}`),
          h('div', { class: 'tri-card' },
            h('div', { class: 'tri-title' }, n.title || 'Sans titre'),
            n.snippet ? h('div', { class: 'tri-snip' }, n.snippet.replace(url || '\u0000', '').trim() || (url ? host(url) : '')) : null,
            h('div', { class: 'tri-meta' }, 'Reçu ' + relTime(n.createdAt)),
            h('div', { class: 'tri-links' },
              h('button', { class: 'btn btn-quiet sm', type: 'button', onclick: () => { close(); ctx.openNote(n.id); } }, 'Ouvrir la note'),
              url ? h('a', { class: 'btn btn-quiet sm', href: url, target: '_blank', rel: 'noopener' }, 'Ouvrir le lien') : null)),
          h('div', { class: 'tri-actions' },
            h('button', { class: 'btn btn-primary', type: 'button', onclick: () => { setKind(n.id, 'note'); done++; render(); } }, 'Garder en note'),
            h('button', { class: 'btn', type: 'button', onclick: (e) => folderPick(e.currentTarget, n) }, 'Dans un dossier…'),
            h('button', { class: 'btn', type: 'button', onclick: () => {
              appendTaskToToday(((n.title || '') + (url && !(n.title || '').includes(url) ? ' ' + url : '')).trim());
              trashNote(n.id); done++; toast('Tâche ajoutée au journal du jour'); render();
            } }, 'En faire une tâche'),
            h('button', { class: 'btn', type: 'button', onclick: () => { skipped.add(n.id); render(); } }, 'Plus tard'),
            h('button', { class: 'btn btn-danger', type: 'button', onclick: () => { trashNote(n.id); done++; render(); } }, 'Corbeille')));
      }

      function folderPick(anchor, n) {
        const fs = foldersList();
        if (!fs.length) { toast('Aucun dossier : créez-en un depuis le menu.'); return; }
        openMenu(anchor, fs.map((f) => ({ label: f.name, icon: 'folder', onClick: () => { moveToFolder(n.id, f.id); setKind(n.id, 'note'); done++; render(); } })));
      }

      render();
      return wrap;
    },
  });
}

