// Petites briques d'interface : DOM, menus, feuilles, toasts, boîtes de dialogue.
import { icon } from './icons.js';

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k in el && !k.includes('-')) { try { el[k] = v; } catch { el.setAttribute(k, v); } }
    else el.setAttribute(k, v === true ? '' : v);
  }
  const add = (k) => {
    if (k == null || k === false) return;
    if (Array.isArray(k)) return k.forEach(add);
    el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
  };
  kids.forEach(add);
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const isWide = () => window.matchMedia('(min-width: 720px)').matches;

// ——— Pile de calques (menus, feuilles, palette) : sert aussi au bouton retour d'Android ———
const stack = [];
export function closeTopLayer() {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.close();
  return true;
}
export const hasLayer = () => stack.length > 0;

function mountLayer({ className, build, anchor, onClose, modal = true }) {
  const prevFocus = document.activeElement;
  const root = h('div', { class: `layer ${className}` });
  const scrim = h('div', { class: 'scrim', onclick: () => close() });
  const panel = h('div', { class: 'panel', role: modal ? 'dialog' : 'menu', 'aria-modal': modal ? 'true' : null, tabindex: '-1' });
  root.append(scrim, panel);
  let closed = false;
  const entry = { close };
  function close() {
    if (closed) return;
    closed = true;
    const i = stack.indexOf(entry);
    if (i >= 0) stack.splice(i, 1);
    root.classList.add('leaving');
    setTimeout(() => root.remove(), 140);
    document.removeEventListener('keydown', onKey, true);
    onClose?.();
    if (prevFocus && prevFocus.focus && document.contains(prevFocus) && !prevFocus.closest?.('.cm-editor')) prevFocus.focus({ preventScroll: true });
  }
  function onKey(e) {
    if (stack[stack.length - 1] !== entry) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  }
  document.addEventListener('keydown', onKey, true);
  build(panel, close);
  document.body.appendChild(root);
  stack.push(entry);
  if (anchor && isWide()) {
    const r = anchor.getBoundingClientRect();
    panel.style.visibility = 'hidden';
    requestAnimationFrame(() => {
      const pw = panel.offsetWidth, ph = panel.offsetHeight;
      let left = Math.min(Math.max(8, r.right - pw), window.innerWidth - pw - 8);
      let top = r.bottom + 6;
      if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
      panel.style.left = left + 'px';
      panel.style.top = top + 'px';
      panel.style.visibility = '';
    });
  }
  requestAnimationFrame(() => root.classList.add('shown'));
  if (modal) setTimeout(() => (panel.querySelector('[autofocus]') || panel).focus({ preventScroll: true }), 30);
  return close;
}

/** items : { label, icon, sub, danger, active, onClick, separator, header } */
export function openMenu(anchor, items) {
  return mountLayer({
    className: 'menu-layer',
    anchor,
    modal: false,
    build(panel, close) {
      items.forEach((it) => {
        if (it.separator) return panel.appendChild(h('div', { class: 'menu-sep', role: 'separator' }));
        if (it.header) return panel.appendChild(h('div', { class: 'menu-head' }, it.header));
        panel.appendChild(h('button', {
          class: 'menu-item' + (it.danger ? ' danger' : '') + (it.active ? ' active' : ''),
          type: 'button', role: 'menuitem',
          onclick: () => { close(); setTimeout(() => it.onClick?.(), 0); },
        },
          it.icon ? h('span', { class: 'mi-ic', html: icon(it.icon, 18) }) : h('span', { class: 'mi-ic' }),
          h('span', { class: 'mi-label' }, it.label, it.sub ? h('small', {}, it.sub) : null),
          it.active ? h('span', { class: 'mi-check', html: icon('check', 16) }) : null,
        ));
      });
    },
  });
}

export function openSheet({ title, content, wide = false, onClose, className = '' }) {
  return mountLayer({
    className: `sheet-layer ${wide ? 'wide' : ''} ${className}`,
    onClose,
    build(panel, close) {
      panel.append(
        h('div', { class: 'sheet-grab', 'aria-hidden': 'true' }),
        h('div', { class: 'sheet-head' },
          h('h2', {}, title),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Fermer', onclick: () => close(), html: icon('x', 20) })
        )
      );
      const body = h('div', { class: 'sheet-body' });
      panel.appendChild(body);
      const c = typeof content === 'function' ? content(body, close) : content;
      if (c) body.appendChild(c);
    },
  });
}

export function confirmDialog({ title, message, confirm = 'Confirmer', danger = false }) {
  return new Promise((resolve) => {
    let result = false;
    openSheet({
      title,
      className: 'dialog',
      onClose: () => resolve(result),
      content: (body, close) => h('div', { class: 'dialog-body' },
        message ? h('p', {}, message) : null,
        h('div', { class: 'dialog-actions' },
          h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Annuler'),
          h('button', { class: 'btn ' + (danger ? 'btn-danger' : 'btn-primary'), type: 'button', autofocus: true, onclick: () => { result = true; close(); } }, confirm)
        )),
    });
  });
}

export function promptDialog({ title, label, value = '', confirm = 'Enregistrer', placeholder = '' }) {
  return new Promise((resolve) => {
    let result = null;
    openSheet({
      title,
      className: 'dialog',
      onClose: () => resolve(result),
      content: (body, close) => {
        const input = h('input', { class: 'field', type: 'text', value, placeholder, autofocus: true, 'aria-label': label || title, maxLength: 80 });
        const submit = () => { const v = input.value.trim(); if (v) { result = v; close(); } };
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
        return h('div', { class: 'dialog-body' },
          label ? h('label', { class: 'field-label' }, label) : null,
          input,
          h('div', { class: 'dialog-actions' },
            h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Annuler'),
            h('button', { class: 'btn btn-primary', type: 'button', onclick: submit }, confirm)));
      },
    });
  });
}

// ——— Toasts ———
let toastHost;
export function toast(message, { action, duration = 4200 } = {}) {
  if (!toastHost) { toastHost = h('div', { class: 'toasts', 'aria-live': 'polite' }); document.body.appendChild(toastHost); }
  const t = h('div', { class: 'toast', role: 'status' },
    h('span', {}, message),
    action ? h('button', { class: 'toast-action', type: 'button', onclick: () => { action.onClick(); remove(); } }, action.label) : null);
  toastHost.appendChild(t);
  requestAnimationFrame(() => t.classList.add('shown'));
  const remove = () => { t.classList.remove('shown'); setTimeout(() => t.remove(), 200); };
  setTimeout(remove, duration);
  return remove;
}

// ——— Visionneuse d'image ———
export function lightbox(src, { title, onOpenExternal } = {}) {
  mountLayer({
    className: 'lightbox-layer',
    build(panel, close) {
      panel.append(
        h('img', { src, alt: title || '', onclick: () => close() }),
        h('div', { class: 'lb-bar' },
          h('span', { class: 'lb-title' }, title || ''),
          onOpenExternal ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Partager ou ouvrir', onclick: onOpenExternal, html: icon('ext', 20) }) : null,
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Fermer', onclick: () => close(), html: icon('x', 20) }))
      );
    },
  });
}

export function longPress(el, handler, ms = 480) {
  let timer = null, fired = false, sx = 0, sy = 0;
  el.addEventListener('touchstart', (e) => {
    fired = false; sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    timer = setTimeout(() => { fired = true; handler(e); }, ms);
  }, { passive: true });
  const cancel = () => clearTimeout(timer);
  el.addEventListener('touchmove', (e) => { if (Math.abs(e.touches[0].clientX - sx) > 8 || Math.abs(e.touches[0].clientY - sy) > 8) cancel(); }, { passive: true });
  el.addEventListener('touchend', cancel);
  el.addEventListener('touchcancel', cancel);
  el.addEventListener('click', (e) => { if (fired) { e.preventDefault(); e.stopImmediatePropagation(); fired = false; } }, true);
  el.addEventListener('contextmenu', (e) => { e.preventDefault(); handler(e); });
}

export const frame = (fn) => { let q = false; return () => { if (q) return; q = true; requestAnimationFrame(() => { q = false; fn(); }); }; };

export { mountLayer as openLayer };
