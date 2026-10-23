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

// ——— Liens entre notes : [[Titre]] ou [[Titre|texte affiché]] ———
export const WIKI_SRC = '\\[\\[([^\\[\\]\\n|]{1,80})(?:\\|([^\\[\\]\\n]{1,80}))?\\]\\]';

/** Clé de comparaison d'un titre : sans accents, minuscules, espaces simples. */
export function normKey(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Liens [[…]] d'une ligne : [{ from, to, title, label }]. */
export function wikiSpans(text) {
  const re = new RegExp(WIKI_SRC, 'g');
  const out = [];
  let m;
  while ((m = re.exec(text))) out.push({ from: m.index, to: m.index + m[0].length, title: m[1].trim(), label: (m[2] || m[1]).trim() });
  return out;
}

/** Clés des titres liés dans un texte (hors blocs de code). */
export function extractLinks(body) {
  const keys = new Set();
  let fence = false;
  for (const raw of body.split('\n')) {
    if (FENCE_RE.test(raw)) { fence = !fence; continue; }
    if (fence || !raw.includes('[[')) continue;
    for (const w of wikiSpans(raw.replace(/`[^`]*`/g, (m) => ' '.repeat(m.length)))) keys.add(normKey(w.title));
  }
  return [...keys];
}

export function stripInline(s) {
  return s
    .replace(new RegExp(WIKI_SRC, 'g'), (m, t, a) => (a || t))
    .replace(/!\[[^\]]*\]\(att:[^)]*\)/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|~~|`)/g, '')
    .replace(/(^|\s)[*_]([^*_\n]+)[*_](?=\s|$|[.,;:!?])/g, '$1$2')
    .replace(/^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+\[[ xX]\]\s?|[-*+]\s+|\d+[.)]\s+)/, '')
    .replace(/@\d{4}-\d{2}-\d{2}(?:[ T]\d{1,2}:\d{2})?/g, '')
    .replace(/\s*↻(?:\d{1,2})?(?:jours?|semaines?|mois|ans?|ouvr[ée]s?)(?![a-zà-ÿ])/giu, '')
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
    const rec = parseRec(raw);
    const text = stripRec(raw.replace(new RegExp(DUE_RE.source, 'g'), '')).replace(new RegExp(WIKI_SRC, 'g'), (mm, t, a) => (a || t)).replace(/\s{2,}/g, ' ').trim();
    tasks.push({ line: i, done: m[2] !== ' ', text, due, rec, raw });
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

// ——— Heures et dates écrites en clair ———

// Heure : « 14h », « 14h30 », « 14:30 », « à 14 h », « à 14 heures 30 » (formes de la dictée vocale comprises).
const TIME_SRC = '(?:(?:[àa]\\s+)?(?:(\\d{1,2})h(\\d{2})?|(\\d{1,2}):(\\d{2}))|[àa]\\s+(\\d{1,2})\\s*(?:h|heures?)\\s*(\\d{2})?)';
function timeOf(g) {
  let h, m;
  if (g[0] !== undefined) { h = +g[0]; m = +(g[1] || 0); }
  else if (g[2] !== undefined) { h = +g[2]; m = +g[3]; }
  else if (g[4] !== undefined) { h = +g[4]; m = +(g[5] || 0); }
  else return null;
  return h <= 23 && m <= 59 ? { h, m } : null;
}
const hhmm = (t) => `${pad(t.h)}:${pad(t.m)}`;
export const timeStr = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const END = '(?=\\s|$|[.,;:!?)])';

// Jour + heure : « demain 14h », « le mardi à 9h30 », « 15/10 14:00 ». Heure obligatoire.
const NAT_RE = new RegExp(
  "(^|\\s)(?:le\\s+)?(apr[eè]s-?demain|demain|aujourd['’]?hui|dimanche|lundi|mardi|mercredi|jeudi|vendredi|samedi|\\d{1,2}\\/\\d{1,2}(?:\\/\\d{2,4})?)\\s+" + TIME_SRC + END,
  'giu'
);
const TIME_ONLY_RE = new RegExp('(^|\\s)' + TIME_SRC + END, 'iu');

/** Vrai si la ligne peut contenir une date ou une récurrence à normaliser (test rapide avant le vrai travail). */
export const maybeDated = (line) =>
  line.includes('@') || /\d\s*h|\d:\d/i.test(line) || /chaque|tous\s+les|toutes\s+les|quotidien|hebdo|mensuel|annuel|en\s+semaine/i.test(line);

// ——— Récurrence : « chaque lundi », « tous les 2 jours », « chaque mois le 15 »… ———

const DAYS_SRC = 'lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche';
const REC_PHRASE = new RegExp(
  '(^|\\s)(?:(?:chaque|tous\\s+les|toutes\\s+les)\\s+(?:(\\d{1,2})\\s+)?(jours?\\s+ouvr[ée]s?|jours?|semaines?|mois|ann[ée]es?|ans?|(?:' + DAYS_SRC + ')s?)' +
    '|(quotidien(?:ne)?|hebdo(?:madaire)?|mensuel(?:le)?|annuel(?:le)?|en\\s+semaine))' +
    '(?:\\s+le\\s+(\\d{1,2})(?:er)?)?' + END,
  'iu'
);
const WEEKDAY_NUM = { dimanche: 0, lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6 };

// Jeton écrit dans la ligne : ↻jour, ↻3jours, ↻semaine, ↻2semaines, ↻mois, ↻an, ↻ouvré
const REC_SRC = '↻(\\d{1,2})?(jours?|semaines?|mois|ans?|ouvr[ée]s?)(?![a-zà-ÿ])';
const unitKey = (u) => (/^j/.test(u) ? 'j' : /^s/.test(u) ? 'sem' : /^m/.test(u) ? 'mois' : /^a/.test(u) ? 'an' : 'ouv');

export function parseRec(raw) {
  const m = new RegExp(REC_SRC, 'iu').exec(raw);
  if (!m) return null;
  const unit = unitKey(m[2].toLowerCase());
  return { n: unit === 'ouv' ? 1 : m[1] ? Math.max(1, +m[1]) : 1, unit };
}
export function recSpans(text) {
  const re = new RegExp(REC_SRC, 'giu');
  const out = [];
  let m;
  while ((m = re.exec(text))) out.push([m.index, m.index + m[0].length]);
  return out;
}
export const stripRec = (s) => s.replace(new RegExp('\\s*' + REC_SRC, 'giu'), '');

const REC_WORDS = { j: ['jour', 'jours'], sem: ['semaine', 'semaines'], mois: ['mois', 'mois'], an: ['an', 'ans'], ouv: ['ouvré', 'ouvrés'] };
export function recToken({ n, unit }) {
  const w = REC_WORDS[unit];
  return '↻' + (n > 1 && unit !== 'ouv' ? n + w[1] : w[0]);
}
export function recLabel({ n, unit }) {
  if (unit === 'ouv') return 'chaque jour ouvré';
  if (unit === 'j') return n > 1 ? `tous les ${n} jours` : 'chaque jour';
  if (unit === 'sem') return n > 1 ? `toutes les ${n} semaines` : 'chaque semaine';
  if (unit === 'mois') return n > 1 ? `tous les ${n} mois` : 'chaque mois';
  return n > 1 ? `tous les ${n} ans` : 'chaque année';
}

const DAY_MS = 86400000;
const dayDiff = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS);
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
function addMonths(d, k, anchor = d.getDate()) {
  const t = d.getFullYear() * 12 + d.getMonth() + k;
  const y = Math.floor(t / 12), mo = t % 12;
  return new Date(y, mo, Math.min(anchor, daysInMonth(y, mo)));
}
const isWeekend = (d) => d.getDay() === 0 || d.getDay() === 6;

/** Première occurrence strictement après `base` d'une série qui part de `from`. */
function occurrenceAfter(from, rec, base) {
  from = startOfDay(from); base = startOfDay(base);
  if (rec.unit === 'ouv') {
    let r = addDays(base, 1);
    while (isWeekend(r)) r = addDays(r, 1);
    return startOfDay(r);
  }
  if (rec.unit === 'j' || rec.unit === 'sem') {
    const step = rec.n * (rec.unit === 'sem' ? 7 : 1);
    const k = Math.floor(dayDiff(from, base) / step) + 1;
    return startOfDay(addDays(from, Math.max(1, k) * step));
  }
  const months = rec.unit === 'mois' ? rec.n : rec.n * 12;
  const anchor = from.getDate();
  let r = from, guard = 0;
  do { r = addMonths(r, months, anchor); } while (r <= base && ++guard < 1200);
  return r;
}

/** Première échéance d'une série tapée à la main (« chaque lundi 16h ») : aujourd'hui ou le jour voulu, sinon la suivante. */
function firstDue(spec, time, now) {
  const today = startOfDay(now);
  let d = today;
  if (spec.weekday != null) d = addDays(today, (spec.weekday - today.getDay() + 7) % 7);
  else if (spec.unit === 'mois' && spec.dom) {
    d = new Date(today.getFullYear(), today.getMonth(), Math.min(spec.dom, daysInMonth(today.getFullYear(), today.getMonth())));
    if (d < today) d = addMonths(today, 1, spec.dom);
  }
  if (spec.unit === 'ouv') while (isWeekend(d)) d = addDays(d, 1);
  const passed = time && new Date(d.getFullYear(), d.getMonth(), d.getDate(), time.h, time.m) <= now;
  if (passed) d = occurrenceAfter(d, spec, d);
  return startOfDay(d);
}

function specFromPhrase(m) {
  const word = (m[3] || m[4] || '').toLowerCase().replace(/\s+/g, ' ');
  const n = m[2] ? Math.max(1, +m[2]) : 1;
  let spec;
  if (/^jours? ouvr|^en semaine/.test(word)) spec = { n: 1, unit: 'ouv' };
  else if (/^jour|^quotidien/.test(word)) spec = { n, unit: 'j' };
  else if (/^semaine|^hebdo/.test(word)) spec = { n, unit: 'sem' };
  else if (/^mois|^mensuel/.test(word)) spec = { n, unit: 'mois', dom: m[5] ? Math.min(31, +m[5]) : null };
  else if (/^an|^annuel/.test(word)) spec = { n, unit: 'an' };
  else {
    const wd = WEEKDAY_NUM[word.replace(/s$/, '')];
    if (wd === undefined) return null;
    spec = { n: 1, unit: 'sem', weekday: wd };
  }
  return spec;
}

/** « Rapport chaque vendredi 16h » → « Rapport @2026-10-16 16:00 ↻semaine ». */
function recurrenceLine(line, now) {
  const m = REC_PHRASE.exec(line);
  if (!m) return line;
  const spec = specFromPhrase(m);
  if (!spec) return line;
  let rest = line.slice(0, m.index) + m[1] + line.slice(m.index + m[0].length);
  rest = stripRec(rest);
  let due = DUE_RE.exec(rest);
  if (!due) {
    const tm = TIME_ONLY_RE.exec(rest);
    const time = tm ? timeOf(tm.slice(2, 8)) : null;
    if (tm && time) rest = rest.slice(0, tm.index) + tm[1] + rest.slice(tm.index + tm[0].length);
    const d = firstDue(spec, time, now);
    rest = rest.replace(/(\S)\s{2,}(?=\S)/g, '$1 ').trimEnd() + ` @${ymd(d)}${time ? ' ' + hhmm(time) : ''}`;
  } else rest = rest.replace(/(\S)\s{2,}(?=\S)/g, '$1 ').trimEnd();
  return `${rest} ${recToken(spec)}`;
}

/** Remplace @demain 14h, @lun, @+3j, @12/10… par @AAAA-MM-JJ [HH:MM], et « demain 14h » / « chaque lundi » sur les lignes de tâche. */
export function normalizeDates(text, now = new Date()) {
  let changed = false;
  const lines = text.split('\n').map((line) => {
    if (!TASK_RE.test(line)) return line;
    let out = line;
    if (out.includes('@')) {
      out = out.replace(NORM_RE, (all, pre, tok, hh, mm) => {
        const d = resolveToken(tok, now);
        if (!d) return all;
        let r = `${pre}@${ymd(d)}`;
        if (hh !== undefined) {
          const h = Math.min(23, +hh);
          r += ` ${pad(h)}:${pad(Math.min(59, +(mm || 0)))}`;
        }
        return r;
      });
    }
    if (/chaque|tous\s+les|toutes\s+les|quotidien|hebdo|mensuel|annuel|en\s+semaine/i.test(out)) out = recurrenceLine(out, now);
    if (!DUE_RE.test(out) && /\d\s*h|\d:\d/i.test(out)) {
      out = out.replace(NAT_RE, (all, pre, tok, ...g) => {
        const d = resolveToken(tok, now);
        const t = timeOf(g.slice(0, 6));
        return d && t ? `${pre}@${ymd(d)} ${hhmm(t)}` : all;
      });
    }
    if (out !== line) changed = true;
    return out;
  });
  return changed ? lines.join('\n') : text;
}

/** Remplace (ou ajoute) l'échéance d'une ligne de tâche. */
export function setDueOnLine(line, dateStr, timeStr) {
  const tok = `@${dateStr}${timeStr ? ' ' + timeStr : ''}`;
  if (DUE_RE.test(line)) return line.replace(DUE_RE, tok);
  const i = line.search(new RegExp(REC_SRC, 'iu'));
  if (i >= 0) return `${line.slice(0, i).trimEnd()} ${tok} ${line.slice(i)}`;
  return `${line.trimEnd()} ${tok}`;
}

/** Retire l'échéance (@date heure) d'une ligne de tâche. */
export function clearDueOnLine(line) {
  return line.replace(new RegExp('\\s*' + DUE_RE.source, 'g'), '').replace(/\s*📅/g, '');
}

/** Tâche récurrente cochée : la ligne reste ouverte et passe à la prochaine échéance. Retourne null si la ligne n'est pas récurrente. */
export function advanceLine(line, now = new Date()) {
  if (!TASK_RE.test(line)) return null;
  const rec = parseRec(line);
  if (!rec) return null;
  const dm = DUE_RE.exec(line);
  const from = dm ? parseYmd(dm[1]) : startOfDay(now);
  const time = dm && dm[2] ? dm[2].padStart(5, '0') : null;
  const base = new Date(Math.max(from.getTime(), startOfDay(now).getTime()));
  const next = occurrenceAfter(from, rec, base);
  const out = setDueOnLine(line, ymd(next), time).replace(/\s*📅/g, '');
  return { line: out, date: ymd(next), time };
}

// ——— Calendrier du téléphone ———

/** Repère ajouté en fin de ligne une fois l'événement créé : évite d'en proposer un second. */
export const CAL_MARK = '📅';
export const hasCalMark = (s) => s.includes(CAL_MARK);

/** Tâches ouvertes datées ET horodatées qui n'ont pas encore d'événement. */
export function calendarCandidates(body) {
  return parseTasks(body)
    .filter((t) => !t.done && t.due && t.due.time && !hasCalMark(t.raw))
    .map((t) => ({ line: t.line, title: t.text, date: t.due.date, time: t.due.time }));
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

// ——— Propriétés « clé:: valeur » (collections) ———
const PROP_RE = /^([\p{L}][\p{L}\p{N} _-]{0,24})::[ \t]*(.*)$/u;

export function parseProps(body) {
  const props = {};
  let fence = false;
  for (const raw of String(body).split('\n')) {
    if (FENCE_RE.test(raw)) { fence = !fence; continue; }
    if (fence) continue;
    const m = PROP_RE.exec(raw.trim());
    if (!m) continue;
    const k = m[1].trim().toLowerCase();
    const v = m[2].trim();
    if (!(k in props)) props[k] = v;
  }
  return props;
}
export const isPropLine = (text) => PROP_RE.test(text.trim());

// ——— Durées « ⏱ 1h30 » (temps passé) ———
const MARK = '(?:⏱|(?<![\\p{L}])(?:temps|durée|duree|tps)\\s*[:=])';
export const hasDuration = (line) => new RegExp(MARK, 'iu').test(line);
const DUR_RE = new RegExp(MARK + String.raw`\s*(?:(\d{1,2})\s*h\s*(\d{1,2})?|(\d+(?:[.,]\d+)?)\s*h(?![a-zà-ÿ])|(\d{1,3})\s*(?:min|mn|m)(?![a-zà-ÿ]))`, 'giu');

/** Durées d'un texte, en minutes : [{ minutes, index }]. */
export function parseDurations(body) {
  const out = [];
  let fence = false;
  let offset = 0;
  for (const raw of String(body).split('\n')) {
    if (FENCE_RE.test(raw)) fence = !fence;
    else if (!fence && hasDuration(raw)) {
      DUR_RE.lastIndex = 0;
      let m;
      while ((m = DUR_RE.exec(raw))) {
        let minutes;
        if (m[1] !== undefined) minutes = (+m[1]) * 60 + (m[2] ? +m[2] : 0);
        else if (m[3] !== undefined) minutes = Math.round(parseFloat(m[3].replace(',', '.')) * 60);
        else minutes = +m[4];
        out.push({ minutes, index: offset + m.index });
      }
    }
    offset += raw.length + 1;
  }
  return out;
}

export function fmtMinutes(min) {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${String(r).padStart(2, '0')}` : `${h} h`;
}
