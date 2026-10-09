// Éditeur Markdown « live » : les marqueurs disparaissent sauf sur la ligne en cours d'édition.
import { EditorState, StateField, StateEffect, Annotation, Prec } from '@codemirror/state';
import { EditorView, Decoration, WidgetType, keymap, placeholder, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab, undo, redo } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { syntaxTree, ensureSyntaxTree } from '@codemirror/language';
import { icon } from './icons.js';
import { normalizeDates, parseTasks, dueState, fmtDuration, humanSize } from './md.js';

// Points d'accès fournis par l'application (pièces jointes, aperçu image…)
export const hooks = {
  meta: () => null,
  url: async () => null,
  open: () => {},
  lightbox: () => {},
};

const external = Annotation.define();
const setFocus = StateEffect.define();
const focusField = StateField.define({
  create: () => false,
  update(v, tr) { for (const e of tr.effects) if (e.is(setFocus)) return e.value; return v; },
});

// ——— Widgets ———

class CheckWidget extends WidgetType {
  constructor(done) { super(); this.done = done; }
  eq(o) { return o.done === this.done; }
  toDOM(view) {
    const el = document.createElement('span');
    el.className = 'cm-check' + (this.done ? ' on' : '');
    el.setAttribute('role', 'checkbox');
    el.setAttribute('aria-checked', String(this.done));
    el.innerHTML = this.done ? icon('check', 14) : '';
    el.addEventListener('mousedown', (e) => e.preventDefault());
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const pos = view.posAtDOM(el);
      const line = view.state.doc.lineAt(pos);
      const idx = line.text.search(/\[[ xX]\]/);
      if (idx < 0) return;
      const done = line.text[idx + 1] !== ' ';
      view.dispatch({ changes: { from: line.from + idx + 1, to: line.from + idx + 2, insert: done ? ' ' : 'x' } });
    });
    return el;
  }
  ignoreEvent() { return true; }
}

class BulletWidget extends WidgetType {
  eq() { return true; }
  toDOM() { const s = document.createElement('span'); s.className = 'cm-bullet'; s.textContent = '•'; return s; }
}

class RuleWidget extends WidgetType {
  eq() { return true; }
  toDOM() { const s = document.createElement('span'); s.className = 'cm-hr'; return s; }
}

class LinkOutWidget extends WidgetType {
  constructor(href) { super(); this.href = href; }
  eq(o) { return o.href === this.href; }
  toDOM() {
    const b = document.createElement('span');
    b.className = 'cm-linkout';
    b.setAttribute('role', 'link');
    b.setAttribute('aria-label', 'Ouvrir le lien');
    b.innerHTML = icon('ext', 13);
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', (e) => {
      e.preventDefault();
      let h = this.href;
      if (!/^[a-z][a-z0-9+.-]*:/i.test(h)) h = 'https://' + h;
      window.open(h, '_blank', 'noopener');
    });
    return b;
  }
  ignoreEvent() { return true; }
}

class AttachmentWidget extends WidgetType {
  constructor(id, alt, block) { super(); this.id = id; this.alt = alt; this.block = block; }
  eq(o) { return o.id === this.id && o.alt === this.alt && o.block === this.block; }
  get estimatedHeight() { const m = hooks.meta(this.id); return this.block ? (m?.kind === 'image' ? 240 : 60) : -1; }
  ignoreEvent() { return true; }
  toDOM(view) {
    const meta = hooks.meta(this.id);
    const wrap = document.createElement(this.block ? 'div' : 'span');
    wrap.className = 'att' + (this.block ? ' att-block' : ' att-inline');
    if (!meta) {
      wrap.classList.add('att-missing');
      wrap.innerHTML = `${icon('file', 16)}<span>Fichier absent de cet appareil</span>`;
      return wrap;
    }
    if (meta.kind === 'image') {
      wrap.classList.add('att-image');
      const img = document.createElement('img');
      img.alt = this.alt || meta.name;
      img.decoding = 'async';
      img.addEventListener('load', () => view.requestMeasure());
      hooks.url(meta.id).then((u) => { if (u) img.src = u; });
      wrap.appendChild(img);
      wrap.addEventListener('click', () => hooks.lightbox(meta));
    } else if (meta.kind === 'audio') {
      wrap.classList.add('att-audio');
      const audio = document.createElement('audio');
      audio.preload = 'none';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'att-play';
      btn.setAttribute('aria-label', 'Lire la note vocale');
      btn.innerHTML = icon('play', 18);
      const track = document.createElement('span'); track.className = 'att-track';
      const bar = document.createElement('span'); bar.className = 'att-bar'; track.appendChild(bar);
      const time = document.createElement('span'); time.className = 'att-time';
      time.textContent = fmtDuration(meta.duration || 0);
      const label = document.createElement('span'); label.className = 'att-name'; label.textContent = this.alt || 'Note vocale';
      const mid = document.createElement('span'); mid.className = 'att-mid';
      mid.append(label, track);
      wrap.append(btn, mid, time, audio);
      let loaded = false;
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (!loaded) { const u = await hooks.url(meta.id); if (!u) return; audio.src = u; loaded = true; }
        if (audio.paused) audio.play(); else audio.pause();
      });
      audio.addEventListener('play', () => { btn.innerHTML = icon('pause', 18); wrap.classList.add('playing'); });
      audio.addEventListener('pause', () => { btn.innerHTML = icon('play', 18); wrap.classList.remove('playing'); });
      audio.addEventListener('ended', () => { bar.style.width = '0%'; time.textContent = fmtDuration(meta.duration || audio.duration); });
      audio.addEventListener('timeupdate', () => {
        const d = audio.duration && isFinite(audio.duration) ? audio.duration : meta.duration || 0;
        if (d) bar.style.width = `${Math.min(100, (audio.currentTime / d) * 100)}%`;
        time.textContent = fmtDuration(audio.currentTime);
      });
      track.addEventListener('click', (e) => {
        const d = audio.duration && isFinite(audio.duration) ? audio.duration : 0;
        if (!d) return;
        const r = track.getBoundingClientRect();
        audio.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * d;
      });
    } else {
      wrap.classList.add('att-file');
      wrap.setAttribute('role', 'button');
      wrap.tabIndex = 0;
      wrap.innerHTML = `${icon('file', 20)}<span class="att-mid"><span class="att-name"></span><span class="att-sub"></span></span>${icon('ext', 15)}`;
      wrap.querySelector('.att-name').textContent = meta.name;
      wrap.querySelector('.att-sub').textContent = `${(meta.type.split('/')[1] || 'fichier').toUpperCase()} · ${humanSize(meta.size)}`;
      const go = () => hooks.open(meta);
      wrap.addEventListener('click', go);
      wrap.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    }
    return wrap;
  }
}

// ——— Décorations ———

const mark = (cls, attrs) => Decoration.mark({ class: cls, attributes: attrs });
const hide = Decoration.replace({});
const dim = mark('cm-dim');
const lineDeco = (cls, style) => Decoration.line({ attributes: style ? { class: cls, style } : { class: cls } });

const TAG_RE = /(^|[\s(])(#[\p{L}][\p{L}\p{N}_\/-]*)/gu;
const DUE_RE = /@\d{4}-\d{2}-\d{2}(?:[ T]\d{1,2}:\d{2})?/g;

function build(state) {
  const doc = state.doc;
  const focused = state.field(focusField, false);
  const sel = state.selection.ranges;
  const touches = focused ? (a, b) => sel.some((r) => r.from <= b && r.to >= a) : () => false;
  const lineTouched = (pos) => { const l = doc.lineAt(pos); return touches(l.from, l.to); };
  const tree = ensureSyntaxTree(state, doc.length, 200) || syntaxTree(state);
  const all = [];
  const atomic = [];
  const code = [];
  const rep = (from, to, deco) => { if (to > from || deco.spec.widget) { const r = deco.range(from, to); all.push(r); atomic.push(r); } };
  const put = (from, to, deco) => all.push(deco.range(from, to));
  const lineAt = (pos, deco) => put(doc.lineAt(pos).from, doc.lineAt(pos).from, deco);

  // Première ligne non vide = titre de la note
  for (let i = 1; i <= doc.lines; i++) {
    const l = doc.line(i);
    if (l.text.trim()) { lineAt(l.from, lineDeco('cm-title')); break; }
  }

  tree.iterate({
    enter(node) {
      const name = node.name;
      let m;
      if ((m = /^ATXHeading(\d)$/.exec(name))) {
        lineAt(node.from, lineDeco(`cm-h cm-h${m[1]}`));
      } else if (name === 'HeaderMark' && /^ATXHeading/.test(node.node.parent?.name || '')) {
        if (lineTouched(node.from)) put(node.from, node.to, dim);
        else rep(node.from, Math.min(doc.lineAt(node.from).to, node.to + 1), hide);
      } else if (name === 'StrongEmphasis') put(node.from, node.to, mark('cm-strong'));
      else if (name === 'Emphasis') put(node.from, node.to, mark('cm-em'));
      else if (name === 'Strikethrough') put(node.from, node.to, mark('cm-strike'));
      else if (name === 'EmphasisMark' || name === 'StrikethroughMark') {
        const p = node.node.parent;
        if (touches(p.from, p.to)) put(node.from, node.to, dim); else rep(node.from, node.to, hide);
      } else if (name === 'InlineCode') {
        put(node.from, node.to, mark('cm-icode'));
        code.push([node.from, node.to]);
      } else if (name === 'CodeMark' && node.node.parent?.name === 'InlineCode') {
        const p = node.node.parent;
        if (touches(p.from, p.to)) put(node.from, node.to, dim); else rep(node.from, node.to, hide);
      } else if (name === 'FencedCode') {
        code.push([node.from, node.to]);
        const a = doc.lineAt(node.from).number, b = doc.lineAt(node.to).number;
        for (let i = a; i <= b; i++) {
          const cls = 'cm-codeblock' + (i === a ? ' cm-cb-first' : '') + (i === b ? ' cm-cb-last' : '');
          put(doc.line(i).from, doc.line(i).from, lineDeco(cls));
        }
      } else if ((name === 'CodeMark' || name === 'CodeInfo') && node.node.parent?.name === 'FencedCode') {
        put(node.from, node.to, dim);
      } else if (name === 'Blockquote') {
        const a = doc.lineAt(node.from).number, b = doc.lineAt(node.to).number;
        for (let i = a; i <= b; i++) put(doc.line(i).from, doc.line(i).from, lineDeco('cm-quote'));
      } else if (name === 'QuoteMark') {
        if (lineTouched(node.from)) put(node.from, node.to, dim);
        else rep(node.from, Math.min(doc.lineAt(node.from).to, node.to + 1), hide);
      } else if (name === 'HorizontalRule') {
        if (lineTouched(node.from)) put(node.from, node.to, dim);
        else rep(node.from, node.to, Decoration.replace({ widget: new RuleWidget() }));
      } else if (name === 'Link') {
        const n = node.node;
        const urlNode = n.getChild('URL');
        const active = touches(node.from, node.to);
        const marks = n.getChildren('LinkMark');
        if (marks.length >= 2) {
          put(marks[0].to, marks[1].from, mark('cm-link'));
          if (!active) {
            rep(marks[0].from, marks[0].to, hide);
            rep(marks[1].from, node.to, hide);
            if (urlNode) put(node.to, node.to, Decoration.widget({ widget: new LinkOutWidget(doc.sliceString(urlNode.from, urlNode.to)), side: 1 }));
          } else {
            marks.forEach((k) => put(k.from, k.to, dim));
            if (urlNode) put(urlNode.from, urlNode.to, dim);
          }
        }
        return false;
      } else if (name === 'Image') {
        const urlNode = node.node.getChild('URL');
        const url = urlNode ? doc.sliceString(urlNode.from, urlNode.to) : '';
        if (url.startsWith('att:')) {
          const marks = node.node.getChildren('LinkMark');
          const alt = marks.length >= 2 ? doc.sliceString(marks[0].to, marks[1].from) : '';
          const line = doc.lineAt(node.from);
          const block = line.text.trim() === doc.sliceString(node.from, node.to).trim() && node.from === line.from + (line.text.length - line.text.trimStart().length);
          if (block) rep(line.from, line.to, Decoration.replace({ widget: new AttachmentWidget(url.slice(4), alt, true), block: true }));
          else rep(node.from, node.to, Decoration.replace({ widget: new AttachmentWidget(url.slice(4), alt, false) }));
        }
        return false;
      } else if (name === 'ListItem') {
        const n = node.node;
        const lm = n.getChild('ListMark');
        if (!lm) return;
        const line = doc.lineAt(lm.from);
        const spaces = lm.from - line.from;
        const task = n.getChild('Task');
        const marker = task ? task.getChild('TaskMarker') : null;
        const parentName = n.parent?.name;
        if (marker && parentName === 'BulletList') {
          const done = /[xX]/.test(doc.sliceString(marker.from, marker.to));
          const to = doc.sliceString(marker.to, marker.to + 1) === ' ' ? marker.to + 1 : marker.to;
          rep(lm.from, to, Decoration.replace({ widget: new CheckWidget(done) }));
          put(line.from, line.from, lineDeco('cm-li' + (done ? ' cm-task-done' : ''), `--pad:${(spaces * 0.26 + 1.55).toFixed(2)}em`));
        } else if (parentName === 'BulletList') {
          if (lineTouched(lm.from)) put(lm.from, lm.to, dim);
          else rep(lm.from, Math.min(line.to, lm.to + 1), Decoration.replace({ widget: new BulletWidget() }));
          put(line.from, line.from, lineDeco('cm-li', `--pad:${(spaces * 0.26 + 1.45).toFixed(2)}em`));
        } else if (parentName === 'OrderedList') {
          put(lm.from, lm.to, mark('cm-olmark'));
          put(line.from, line.from, lineDeco('cm-li', `--pad:${(spaces * 0.26 + 1.7).toFixed(2)}em`));
        }
      }
    },
  });

  // Étiquettes #tag et échéances @date (hors blocs de code)
  const inCode = (pos) => code.some(([a, b]) => pos >= a && pos <= b);
  for (let i = 1; i <= doc.lines; i++) {
    const l = doc.line(i);
    if (!l.text.includes('#') && !l.text.includes('@')) continue;
    if (inCode(l.from)) continue;
    let m;
    TAG_RE.lastIndex = 0;
    while ((m = TAG_RE.exec(l.text))) {
      const from = l.from + m.index + m[1].length;
      if (!inCode(from)) put(from, from + m[2].length, mark('cm-tag'));
    }
    if (l.text.includes('@')) {
      const task = parseTasks(l.text)[0];
      DUE_RE.lastIndex = 0;
      while ((m = DUE_RE.exec(l.text))) {
        const from = l.from + m.index;
        if (inCode(from)) continue;
        const st = task ? (task.done ? 'done' : dueState(task.due, false)) : '';
        put(from, from + m[0].length, mark('cm-due' + (st ? ' cm-due-' + st : '')));
      }
    }
  }

  return { all: Decoration.set(all, true), atomic: Decoration.set(atomic, true) };
}

const livePreview = StateField.define({
  create: (state) => build(state),
  update(value, tr) {
    if (tr.docChanged || tr.selection || tr.effects.some((e) => e.is(setFocus)) || syntaxTree(tr.state) !== syntaxTree(tr.startState)) {
      return build(tr.state);
    }
    return value;
  },
  provide: (f) => [
    EditorView.decorations.from(f, (v) => v.all),
    EditorView.atomicRanges.of((view) => view.state.field(f).atomic),
  ],
});

// ——— Commandes de mise en forme ———

function selectedLines(view) {
  const { state } = view;
  const set = new Map();
  for (const r of state.selection.ranges) {
    const a = state.doc.lineAt(r.from).number, b = state.doc.lineAt(r.to).number;
    for (let i = a; i <= b; i++) set.set(i, state.doc.line(i));
  }
  return [...set.values()];
}

function toggleTask(view) {
  const lines = selectedLines(view);
  const allTasks = lines.every((l) => /^\s*[-*+] \[[ xX]\] ?/.test(l.text));
  const changes = lines.map((l) => {
    if (allTasks) { const m = /^(\s*)[-*+] \[[ xX]\] ?/.exec(l.text); return { from: l.from + m[1].length, to: l.from + m[0].length, insert: '' }; }
    const b = /^(\s*)[-*+] (?!\[[ xX]\])/.exec(l.text);
    if (b) return { from: l.from + b[1].length, to: l.from + b[0].length, insert: '- [ ] ' };
    const lead = /^\s*/.exec(l.text)[0].length;
    return { from: l.from + lead, to: l.from + lead, insert: '- [ ] ' };
  });
  view.dispatch({ changes, scrollIntoView: true });
}

function toggleBullet(view) {
  const lines = selectedLines(view);
  const all = lines.every((l) => /^\s*[-*+] /.test(l.text) && !/^\s*[-*+] \[[ xX]\]/.test(l.text));
  const changes = lines.map((l) => {
    if (all) { const m = /^(\s*)[-*+] /.exec(l.text); return { from: l.from + m[1].length, to: l.from + m[0].length, insert: '' }; }
    const t = /^(\s*)[-*+] \[[ xX]\] ?/.exec(l.text);
    if (t) return { from: l.from + t[1].length, to: l.from + t[0].length, insert: '- ' };
    const lead = /^\s*/.exec(l.text)[0].length;
    return { from: l.from + lead, to: l.from + lead, insert: '- ' };
  });
  view.dispatch({ changes, scrollIntoView: true });
}

function cycleHeading(view) {
  const lines = selectedLines(view);
  const first = /^(#{1,6}) /.exec(lines[0].text);
  const level = first ? first[1].length : 0;
  const next = level === 0 ? 2 : level === 2 ? 3 : level === 3 ? 0 : 2;
  const changes = lines.map((l) => {
    const m = /^#{1,6} /.exec(l.text);
    return { from: l.from, to: l.from + (m ? m[0].length : 0), insert: next ? '#'.repeat(next) + ' ' : '' };
  });
  view.dispatch({ changes, scrollIntoView: true });
}

function toggleQuote(view) {
  const lines = selectedLines(view);
  const all = lines.every((l) => /^>\s?/.test(l.text));
  const changes = lines.map((l) => {
    if (all) { const m = /^>\s?/.exec(l.text); return { from: l.from, to: l.from + m[0].length, insert: '' }; }
    return { from: l.from, to: l.from, insert: '> ' };
  });
  view.dispatch({ changes, scrollIntoView: true });
}

function wrap(view, mark) {
  const { state } = view;
  const tr = state.changeByRange((r) => {
    const doc = state.doc;
    const before = doc.sliceString(Math.max(0, r.from - mark.length), r.from);
    const after = doc.sliceString(r.to, Math.min(doc.length, r.to + mark.length));
    if (before === mark && after === mark) {
      return { changes: [{ from: r.from - mark.length, to: r.from }, { from: r.to, to: r.to + mark.length }], range: { anchor: r.from - mark.length, head: r.to - mark.length } };
    }
    if (r.empty) return { changes: { from: r.from, insert: mark + mark }, range: { anchor: r.from + mark.length } };
    return { changes: [{ from: r.from, insert: mark }, { from: r.to, insert: mark }], range: { anchor: r.from + mark.length, head: r.to + mark.length } };
  });
  view.dispatch(state.update(tr, { scrollIntoView: true }));
}

function insertLink(view) {
  const { state } = view;
  const r = state.selection.main;
  const text = r.empty ? 'texte' : state.doc.sliceString(r.from, r.to);
  const insert = `[${text}](https://)`;
  const urlStart = r.from + text.length + 3;
  view.dispatch({ changes: { from: r.from, to: r.to, insert }, selection: { anchor: urlStart + 8 }, scrollIntoView: true });
}

function insertTag(view) {
  const { state } = view;
  const r = state.selection.main;
  const prev = r.from > 0 ? state.doc.sliceString(r.from - 1, r.from) : ' ';
  const insert = /\s/.test(prev) || r.from === 0 ? '#' : ' #';
  view.dispatch({ changes: { from: r.from, to: r.to, insert }, selection: { anchor: r.from + insert.length }, scrollIntoView: true });
}

function insertInline(view, text) {
  const r = view.state.selection.main;
  const prev = r.from > 0 ? view.state.doc.sliceString(r.from - 1, r.from) : ' ';
  const insert = (/\s/.test(prev) || r.from === 0 ? '' : ' ') + text + ' ';
  view.dispatch({ changes: { from: r.from, to: r.to, insert }, selection: { anchor: r.from + insert.length }, scrollIntoView: true });
}

function insertBlock(view, text) {
  const { state } = view;
  const line = state.doc.lineAt(state.selection.main.head);
  const empty = line.text.trim() === '';
  const from = empty ? line.from : line.to;
  const to = empty ? line.to : line.to;
  const insert = (empty ? '' : '\n') + text + '\n';
  view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + insert.length }, scrollIntoView: true });
}


const DUE_STRIP = /\s*@\d{4}-\d{2}-\d{2}(?:[ T]\d{1,2}:\d{2})?/g;
function setDue(view, token) {
  const { state } = view;
  const line = state.doc.lineAt(state.selection.main.head);
  const lead = /^\s*/.exec(line.text)[0];
  let rest = line.text.slice(lead.length);
  if (!/^[-*+] \[[ xX]\]/.test(rest)) rest = '- [ ] ' + rest.replace(/^[-*+] /, '');
  rest = rest.replace(DUE_STRIP, '').trimEnd();
  let insert, cursor;
  if (rest === '- [ ]') { insert = `${lead}- [ ]  ${token}`; cursor = line.from + lead.length + 6; }
  else { insert = `${lead}${rest} ${token}`; cursor = line.from + insert.length; }
  view.dispatch({ changes: { from: line.from, to: line.to, insert }, selection: { anchor: cursor }, scrollIntoView: true });
  view.focus();
}

export function normalizeLine(view) {
  const doc = view.state.doc;
  const changes = [];
  for (let i = 1; i <= doc.lines; i++) {
    const l = doc.line(i);
    if (!l.text.includes('@')) continue;
    const n = normalizeDates(l.text);
    if (n !== l.text) changes.push({ from: l.from, to: l.to, insert: n });
  }
  if (changes.length) view.dispatch({ changes });
}

// ——— Création ———

export function createEditor(parent, { onChange = () => {}, onFiles = () => {}, onBlur = () => {} } = {}) {
  let readOnly = false;
  const exts = () => [
    EditorView.editable.of(!readOnly),
    EditorState.readOnly.of(readOnly),
    history(),
    drawSelection(),
    EditorView.lineWrapping,
    EditorState.allowMultipleSelections.of(false),
    markdown({ base: markdownLanguage }),
    focusField,
    livePreview,
    placeholder('Écrivez ici. Une case à cocher ? Tapez - [ ] puis votre tâche.'),
    EditorView.contentAttributes.of({ spellcheck: 'true', autocapitalize: 'sentences', autocorrect: 'on', lang: 'fr', 'aria-label': 'Contenu de la note' }),
    Prec.highest(keymap.of([
      { key: 'Enter', run: (v) => { normalizeLine(v); return false; } },
    ])),
    // Taper « - [ ] » sur une ligne déjà préfixée par la continuation de liste : pas de doublon.
    EditorView.inputHandler.of((v, from, to, text) => {
      if (text !== ' ' || from !== to) return false;
      const line = v.state.doc.lineAt(from);
      const before = line.text.slice(0, from - line.from);
      const m = /^(\s*)(?:[-*+]|\d+[.)]) (?:\[[ xX]\] )?([-*+] \[[ xX]\])$/.exec(before);
      if (!m) return false;
      const ins = `${m[1]}${m[2]} `;
      v.dispatch({ changes: { from: line.from, to: from, insert: ins }, selection: { anchor: line.from + ins.length }, userEvent: 'input.type' });
      return true;
    }),
    keymap.of([indentWithTab, ...historyKeymap, ...defaultKeymap]),
    EditorView.domEventHandlers({
      focus: (e, v) => { v.dispatch({ effects: setFocus.of(true) }); },
      blur: (e, v) => { v.dispatch({ effects: setFocus.of(false) }); normalizeLine(v); onBlur(); },
      paste: (e) => {
        const files = [...(e.clipboardData?.files || [])];
        if (files.length) { e.preventDefault(); onFiles(files); return true; }
        return false;
      },
      drop: (e) => {
        const files = [...(e.dataTransfer?.files || [])];
        if (files.length) { e.preventDefault(); onFiles(files); return true; }
        return false;
      },
    }),
    EditorView.updateListener.of((u) => {
      if (u.docChanged && !u.transactions.some((t) => t.annotation(external))) onChange(u.state.doc.toString());
    }),
  ];

  const view = new EditorView({ parent, state: EditorState.create({ doc: '', extensions: exts() }) });
  if (window.__PLUME_TEST__) window.__plumeView = view;

  return {
    view,
    setDoc(text, opts = {}) {
      readOnly = !!opts.readOnly;
      view.setState(EditorState.create({ doc: text, extensions: exts() }));
      if (view.hasFocus) view.dispatch({ effects: setFocus.of(true) });
    },
    getDoc: () => view.state.doc.toString(),
    replaceExternal(text) {
      const cur = view.state.doc.toString();
      if (cur === text) return;
      view.dispatch({ changes: { from: 0, to: cur.length, insert: text }, annotations: external.of(true) });
    },
    focus(end = false) {
      view.focus();
      if (end) view.dispatch({ selection: { anchor: view.state.doc.length }, scrollIntoView: true });
    },
    focusLine(n) {
      const l = view.state.doc.line(Math.min(Math.max(1, n + 1), view.state.doc.lines));
      view.dispatch({ selection: { anchor: l.to }, effects: EditorView.scrollIntoView(l.to, { y: 'center' }) });
    },
    get focused() { return view.hasFocus; },
    insertBlock: (t) => insertBlock(view, t),
    insertInline: (t) => insertInline(view, t),
    setDue: (token) => setDue(view, token),
    normalize: () => normalizeLine(view),
    run(cmd) {
      switch (cmd) {
        case 'task': toggleTask(view); break;
        case 'bullet': toggleBullet(view); break;
        case 'heading': cycleHeading(view); break;
        case 'quote': toggleQuote(view); break;
        case 'bold': wrap(view, '**'); break;
        case 'italic': wrap(view, '*'); break;
        case 'code': wrap(view, '`'); break;
        case 'link': insertLink(view); break;
        case 'tag': insertTag(view); break;
        case 'undo': undo(view); break;
        case 'redo': redo(view); break;
        default: return;
      }
      view.focus();
    },
    destroy: () => view.destroy(),
  };
}
