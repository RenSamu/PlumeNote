// Habitudes : une note par habitude (kind « habit »). Les validations sont des lignes « ✓ AAAA-MM-JJ ».
//   # Sport
//   ⟳ 3/semaine        (ou « ⟳ chaque jour »)
//   ⏰ 19:00           (rappel facultatif)
//   ✓ 2026-10-20
import { h, toast } from './ui.js';
import { icon } from './icons.js';
import { ctx } from './ctx.js';
import { query, createDraft, setBody, getNote } from './store.js';
import { ymd, parseYmd, addDays, startOfDay, weekdayAbbr } from './md.js';

const MARK_RE = /^\s*✓\s*(\d{4}-\d{2}-\d{2})\s*$/;

/** Lit une note d'habitude : { id, name, perWeek, reminder, days:Set }. */
export function parseHabit(n) {
  let perWeek = 7, reminder = null;
  const days = new Set();
  for (const raw of n.body.split('\n')) {
    let m = MARK_RE.exec(raw);
    if (m) { days.add(m[1]); continue; }
    m = /^\s*⟳\s*(.+)$/.exec(raw);
    if (m) {
      const f = /(\d)\s*(?:x|fois)?\s*\/\s*(?:par\s*)?sem/i.exec(m[1]) || /(\d)\s*(?:x|fois)\s*(?:par\s*)?semaine/i.exec(m[1]);
      perWeek = f ? Math.min(7, Math.max(1, +f[1])) : 7;
      continue;
    }
    m = /^\s*⏰\s*(\d{1,2}:\d{2})/.exec(raw);
    if (m) reminder = m[1].padStart(5, '0');
  }
  return { id: n.id, name: n.title || 'Habitude', perWeek, reminder, days };
}

export const habits = () => query({ view: 'habits' }).map(parseHabit).sort((a, b) => a.name.localeCompare(b.name, 'fr'));

const monday = (d) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));
const weekKeys = (d) => Array.from({ length: 7 }, (_, i) => ymd(addDays(monday(d), i)));

export const weekCount = (hb, d = new Date()) => weekKeys(d).filter((k) => hb.days.has(k)).length;

/** Série en cours : jours consécutifs (habitude quotidienne) ou semaines tenues (N par semaine). */
export function streak(hb, now = new Date()) {
  if (hb.perWeek === 7) {
    let d = startOfDay(now);
    if (!hb.days.has(ymd(d))) d = addDays(d, -1);
    let n = 0;
    while (hb.days.has(ymd(d))) { n++; d = addDays(d, -1); }
    return { n, unit: 'j' };
  }
  let d = monday(now);
  let n = 0;
  if (weekCount(hb, d) >= hb.perWeek) n++;
  d = addDays(d, -7);
  for (let i = 0; i < 520 && weekCount(hb, d) >= hb.perWeek; i++) { n++; d = addDays(d, -7); }
  return { n, unit: 'sem.' };
}

/** À faire aujourd'hui : pas encore validée aujourd'hui et objectif de la semaine pas atteint. */
export function pendingToday(now = new Date()) {
  const today = ymd(now);
  return habits().filter((hb) => !hb.days.has(today) && (hb.perWeek === 7 || weekCount(hb, now) < hb.perWeek));
}

/** Valide ou annule un jour. Retourne true si le jour est maintenant validé. */
export function toggleHabitDay(id, key) {
  const n = getNote(id);
  if (!n) return false;
  const lines = n.body.split('\n');
  const idx = lines.findIndex((l) => { const m = MARK_RE.exec(l); return m && m[1] === key; });
  let done;
  if (idx >= 0) { lines.splice(idx, 1); done = false; }
  else {
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
    lines.push(`✓ ${key}`, '');
    done = true;
  }
  setBody(id, lines.join('\n'), 'habit');
  return done;
}

/** « Sport 3/semaine », « Méditer chaque jour », « Lecture 5x par semaine »… */
export function addHabit(text, now = new Date()) {
  let name = text.trim();
  let freq = 'chaque jour';
  const f = /\b(\d)\s*(?:x|fois)?\s*(?:\/|par)\s*semaine\b/i.exec(name) || /\b(\d)\s*(?:x|fois)\b/i.exec(name);
  if (f) { freq = `${Math.min(7, Math.max(1, +f[1]))}/semaine`; name = name.replace(f[0], ''); }
  name = name.replace(/\b(chaque jour|tous les jours|quotidien(?:ne)?)\b/i, '').replace(/\s{2,}/g, ' ').trim();
  if (!name) return null;
  const d = createDraft({ kind: 'habit', body: '' });
  setBody(d.id, `# ${name}\n⟳ ${freq}\n\n`, 'habit');
  return d;
}

// ——— Vue ———

function habitCard(hb, now) {
  const today = ymd(now);
  const wk = weekCount(hb, now);
  const st = streak(hb, now);
  const keys = weekKeys(now);
  const goal = hb.perWeek === 7 ? 'chaque jour' : `${hb.perWeek}/semaine`;
  const dots = h('div', { class: 'hb-days', role: 'group', 'aria-label': 'Cette semaine' },
    ...keys.map((k) => {
      const d = parseYmd(k);
      const done = hb.days.has(k);
      const future = k > today;
      return h('button', {
        class: 'hb-day' + (done ? ' on' : '') + (k === today ? ' today' : ''), type: 'button', disabled: future,
        'aria-pressed': String(done), 'aria-label': `${weekdayAbbr(d)} ${d.getDate()}${done ? ', fait' : ''}`,
        onclick: () => {
          const now2 = toggleHabitDay(hb.id, k);
          if (now2 && k === today) {
            const s = streak(parseHabit(getNote(hb.id)));
            if (s.n >= 2) toast(`${hb.name} : série de ${s.n} ${s.unit}`);
          }
        },
      }, h('span', { class: 'hb-dn' }, weekdayAbbr(d).slice(0, 1).toUpperCase()), h('span', { class: 'hb-dd' }, String(d.getDate())));
    }));
  return h('div', { class: 'hb-card' },
    h('div', { class: 'hb-head' },
      h('button', { class: 'hb-name', type: 'button', onclick: () => ctx.openNote(hb.id) }, hb.name),
      st.n ? h('span', { class: 'hb-streak', title: 'Série en cours' }, `${st.n} ${st.unit}`) : null),
    h('div', { class: 'hb-sub' }, `${wk}/${hb.perWeek} cette semaine · ${goal}${hb.reminder ? ' · rappel ' + hb.reminder : ''}`),
    dots);
}

export function renderHabits(extra, body, countEl) {
  const now = new Date();
  const list = habits();
  countEl.textContent = list.length ? String(list.length) : '';
  if (!extra.querySelector('.quick-add')) {
    const input = h('input', { class: 'quick-input', type: 'text', placeholder: 'Nouvelle habitude, ex. Sport 3/semaine', 'aria-label': 'Nouvelle habitude', enterKeyHint: 'done', autocomplete: 'off' });
    const submit = () => {
      const v = input.value.trim();
      if (!v) return;
      if (addHabit(v)) { input.value = ''; toast('Habitude ajoutée'); }
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    extra.replaceChildren(h('div', { class: 'quick-add' }, h('span', { html: icon('plus', 18) }), input,
      h('button', { class: 'btn btn-primary sm', type: 'button', onclick: submit }, 'Ajouter')));
  }
  body.replaceChildren();
  if (!list.length) {
    body.appendChild(h('div', { class: 'empty' },
      h('div', { class: 'empty-ill', html: icon('check', 40) }),
      h('h3', {}, 'Aucune habitude pour l’instant'),
      h('p', {}, 'Ajoutez-en une ci-dessus : « Sport 3/semaine », « Boire de l’eau chaque jour »… Chaque jour validé s’inscrit d’un appui.')));
    return;
  }
  const pend = pendingToday(now);
  if (pend.length) body.appendChild(h('div', { class: 'group' }, `Aujourd’hui : ${pend.length} à faire`));
  list.forEach((hb) => body.appendChild(habitCard(hb, now)));
}
