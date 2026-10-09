// Utilitaires Markdown, tâches et dates (locale française).

const pad = (n) => String(n).padStart(2, '0');

export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function parseYmd(s, time) {
  const [y, m, d] = s.split('-').map(Number);
  const [hh, mm] = time ? time.split(':').map(Number) : [0, 0];
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

export const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());

const longDate = new Intl.DateTimeFormat('fr-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const shortDate = new Intl.DateTimeFormat('fr-CH', { day: 'numeric', month: 'short' });
const shortDateYear = new Intl.DateTimeFormat('fr-CH', { day: 'numeric', month: 'short', year: 'numeric' });
const weekdayShort = new Intl.DateTimeFormat('fr-CH', { weekday: 'short' });
const weekdayLong = new Intl.DateTimeFormat('fr-CH', { weekday: 'long' });
const timeFmt = new Intl.DateTimeFormat('fr-CH', { hour: '2-digit', minute: '2-digit' });

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const longDay = (d) => cap(longDate.format(d).replace(',', ''));
export const weekdayName = (d) => cap(weekdayLong.format(d));
export const weekdayAbbr = (d) => weekdayShort.format(d).replace('.', '');

export function relTime(ts, now = new Date()) {
  const d = new Date(ts);
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (days === 0) return timeFmt.format(d);
  if (days === 1) return 'Hier';
  if (days > 1 && days < 7) return weekdayShort.format(d);
  return d.getFullYear() === now.getFullYear() ? shortDate.format(d) : shortDateYear.format(d);
}

// ——— Texte ———

const TASK_RE = /^(\s*)[-*+] \[( |x|X)\] ?(.*)$/;
const FENCE_RE = /^\s*(```|~~~)/;
const DUE_RE = /@(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}:\d{2}))?/;

export function stripInline(s) {
  return s
    .replace(/!\[[^\]]*\]\(att:[^)]*\)/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|~~|`)/g, '')
    .replace(/(^|\s)[*_]([^*_\n]+)[*_](?=\s|$|[.,;:!?])/g, '$1$2')
    .replace(/^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+\[[ xX]\]\s?|[-*+]\s+|\d+[.)]\s+)/, '')
    .replace(/@\d{4}-\d{2}-\d{2}(?:[ T]\d{1,2}:\d{2})?/g, '')
    .trim();
}

export function titleOf(body) {
  for (const raw of body.split('\n')) {
    const t = stripInline(raw);
    if (t) return t.slice(0, 140);
  }
  return '';
}

export function snippetOf(body) {
  const lines = body.split('\n');
  let seenTitle = false;
  const out = [];
  let fence = false;
  for (const raw of lines) {
    if (FENCE_RE.test(raw)) { fence = !fence; continue; }
    const t = stripInline(raw);
    if (!t) continue;
    if (!seenTitle) { seenTitle = true; continue; }
    out.push(t);
    if (out.join(' ').length > 160) break;
  }
  return out.join(' ').slice(0, 180);
}

export function plainText(body) {
  const out = [];
  let fence = false;
  for (const raw of body.split('\n')) {
    if (FENCE_RE.test(raw)) { fence = !fence; continue; }
    out.push(fence ? raw : stripInline(raw));
  }
  return out.join('\n');
}

export function extractTags(body) {
  const tags = new Set();
  let fence = false;
  for (const raw of body.split('\n')) {
    if (FENCE_RE.test(raw)) { fence = !fence; continue; }
    if (fence) continue;
    const line = raw.replace(/`[^`]*`/g, '');
    const re = /(^|[\s(])#([\p{L}][\p{L}\p{N}_\/-]*)/gu;
    let m;
    while ((m = re.exec(line))) tags.add(m[2].toLowerCase());
  }
  return [...tags];
}

export function parseTasks(body) {
  const tasks = [];
  const lines = body.split('\n');
  let fence = false;
  for (let i = 0; i < lines.length; i++) {
    if (FENCE_RE.test(lines[i])) { fence = !fence; continue; }
    if (fence) continue;
    const m = TASK_RE.exec(lines[i]);
    if (!m) continue;
    const raw = m[3];
    const dm = DUE_RE.exec(raw);
    const due = dm ? { date: dm[1], time: dm[2] ? dm[2].padStart(5, '0') : null } : null;
    const text = raw.replace(new RegExp(DUE_RE.source, 'g'), '').replace(/\s{2,}/g, ' ').trim();
    tasks.push({ line: i, done: m[2] !== ' ', text, due, raw });
  }
  return tasks;
}

export function dueDate(due, defaultTime = '09:00') {
  if (!due) return null;
  return parseYmd(due.date, due.time || defaultTime);
}

export function dueLabel(due, now = new Date()) {
  if (!due) return '';
  const d = parseYmd(due.date);
  const days = Math.round((d - startOfDay(now)) / 86400000);
  let day;
  if (days === 0) day = "Aujourd'hui";
  else if (days === 1) day = 'Demain';
  else if (days === -1) day = 'Hier';
  else if (days > 1 && days < 7) day = cap(weekdayShort.format(d)).replace('.', '') + '.';
  else day = d.getFullYear() === now.getFullYear() ? shortDate.format(d) : shortDateYear.format(d);
  return due.time ? `${day} ${due.time}` : day;
}

export function dueState(due, done, now = new Date()) {
  if (!due || done) return '';
  const dt = dueDate(due, '23:59');
  const today = ymd(now);
  if (due.date === today) return due.time && parseYmd(due.date, due.time) < now ? 'late' : 'today';
  return dt < now ? 'late' : '';
}

// ——— Dates relatives → absolues (dans les lignes de tâche) ———

const WEEKDAYS = { dim: 0, lun: 1, mar: 2, mer: 3, jeu: 4, ven: 5, sam: 6 };
const NORM_RE = new RegExp(
  "(^|\\s)@(aujourd['’]?hui|auj|ajd|apr[eè]s-?demain|demain|dimanche|lundi|mardi|mercredi|jeudi|vendredi|samedi|dim|lun|mar|mer|jeu|ven|sam|\\+\\d{1,3}j|\\+\\d{1,2}sem|\\d{1,2}\\/\\d{1,2}(?:\\/\\d{2,4})?)" +
    "(?:\\s+(?:[àa]\\s+)?(\\d{1,2})(?:[:h](\\d{2})?))?(?=\\s|$|[.,;:!?)])",
  'giu'
);

function resolveToken(tok, now) {
  const t = tok.toLowerCase().replace('’', "'");
  const base = startOfDay(now);
  if (/^(aujourd'?hui|auj|ajd)$/.test(t)) return base;
  if (t === 'demain') return addDays(base, 1);
  if (/^apr[eè]s-?demain$/.test(t)) return addDays(base, 2);
  let m;
  if ((m = /^\+(\d+)j$/.exec(t))) return addDays(base, +m[1]);
  if ((m = /^\+(\d+)sem$/.exec(t))) return addDays(base, 7 * +m[1]);
  if ((m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(t))) {
    let y = m[3] ? +m[3] : base.getFullYear();
    if (y < 100) y += 2000;
    let d = new Date(y, +m[2] - 1, +m[1]);
    if (!m[3] && d < base) d = new Date(y + 1, +m[2] - 1, +m[1]);
    return d;
  }
  const wd = WEEKDAYS[t.slice(0, 3)];
  if (wd !== undefined) {
    let diff = (wd - base.getDay() + 7) % 7;
    if (diff === 0) diff = 7;
    return addDays(base, diff);
  }
  return null;
}

/** Remplace @demain 14h, @lun, @+3j, @12/10… par @AAAA-MM-JJ [HH:MM] sur les lignes de tâche. */
export function normalizeDates(text, now = new Date()) {
  let changed = false;
  const lines = text.split('\n').map((line) => {
    if (!TASK_RE.test(line) || !line.includes('@')) return line;
    return line.replace(NORM_RE, (all, pre, tok, hh, mm) => {
      const d = resolveToken(tok, now);
      if (!d) return all;
      changed = true;
      let out = `${pre}@${ymd(d)}`;
      if (hh !== undefined) {
        const h = Math.min(23, +hh);
        out += ` ${pad(h)}:${pad(Math.min(59, +(mm || 0)))}`;
      }
      return out;
    });
  });
  return changed ? lines.join('\n') : text;
}

export function dueToken(dateStr, timeStr) {
  return `@${dateStr}${timeStr ? ' ' + timeStr : ''}`;
}

export function countWords(body) {
  const t = plainText(body).trim();
  return t ? t.split(/\s+/).length : 0;
}

export function humanSize(n) {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} Ko`;
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
}

export function fmtDuration(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  return `${Math.floor(sec / 60)}:${pad(sec % 60)}`;
}
