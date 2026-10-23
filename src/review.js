// Revue de la semaine : ce qui est en retard, ce qui arrive, ce qui n'a pas de date, ce qui reste à trier.
import { h, openSheet, toast } from './ui.js';
import { icon } from './icons.js';
import { ctx } from './ctx.js';
import { state, allTasks, applyTaskAction, flush, setSetting, liveNotes, query } from './store.js';
import { ymd, addDays, startOfDay, parseYmd, dueLabel, weekdayName, longDay } from './md.js';
import * as cal from './calendar.js';
import { openTriage } from './inbox.js';
import { reschedule } from './reminders.js';

const hhmm = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

export function openReview() {
  openSheet({
    title: 'Revue de la semaine',
    wide: true,
    className: 'review',
    content: (body, close) => {
      const root = h('div', { class: 'rv' });
      let events = {};
      let calOk = false;

      const act = (t, action) => {
        const r = applyTaskAction(t.noteId, { text: t.text, line: t.line }, action);
        flush(); reschedule();
        if (r) toast(`${r.label} : ${r.text}`.slice(0, 90));
        render();
      };

      const taskRow = (t, actions) => h('div', { class: 'rv-task' },
        h('button', { class: 'rv-main', type: 'button', onclick: () => { close(); ctx.openNote(t.noteId, { line: t.line }); } },
          h('span', { class: 'rv-text' }, (t.rec ? '↻ ' : '') + t.text),
          h('span', { class: 'rv-sub' }, [t.noteTitle || 'Note sans titre', t.due ? dueLabel(t.due) : ''].filter(Boolean).join(' · '))),
        h('div', { class: 'rv-acts' }, ...actions.map(([label, a, primary]) =>
          h('button', { class: 'btn sm' + (primary ? ' btn-primary' : ''), type: 'button', onclick: () => act(t, a) }, label))));

      function section(title, count, ...rows) {
        return h('section', { class: 'rv-sec' }, h('h3', {}, title, count != null ? h('span', { class: 'rv-n' }, String(count)) : null), ...rows);
      }

      function render() {
        const now = new Date();
        const today = ymd(now);
        const tasks = allTasks().filter((t) => !t.done);
        const late = tasks.filter((t) => t.due && t.due.date < today).sort((a, b) => (a.due.date < b.due.date ? -1 : 1));
        const undated = tasks.filter((t) => !t.due);
        const inbox = query({ view: 'inbox' }).length;
        const weekAgo = Date.now() - 7 * 86400000;
        const written = liveNotes().filter((n) => n.kind !== 'daily' && n.createdAt >= weekAgo).length;

        const parts = [];
        parts.push(h('p', { class: 'rv-intro' }, `${longDay(now)}. ${state.settings.lastReview ? 'Dernière revue : ' + longDay(parseYmd(state.settings.lastReview)) + '.' : 'Votre première revue.'}`));

        if (late.length) {
          parts.push(section('En retard', late.length, ...late.slice(0, 12).map((t) => taskRow(t, [
            ['Fait', 'done', true], ['Demain', 'tomorrow'], ['Lundi', 'monday'], ...(t.rec ? [] : [['Sans date', 'clear']]),
          ]))));
          if (late.length > 12) parts.push(h('p', { class: 'rv-more' }, `+ ${late.length - 12} autres dans Tâches`));
        }

        // 7 jours à venir
        const days = [];
        for (let i = 1; i <= 7; i++) {
          const key = ymd(addDays(startOfDay(now), i));
          const evs = (events[key] || []).map((e) => ({ s: e.allDay ? '' : hhmm(e.start), t: e.title, ev: true }));
          const ts = tasks.filter((t) => t.due && t.due.date === key).map((t) => ({ s: t.due.time || '', t: t.text, task: t }));
          const rows = [...evs, ...ts].sort((a, b) => (a.s < b.s ? -1 : a.s > b.s ? 1 : 0));
          if (rows.length) days.push(h('div', { class: 'rv-day' },
            h('div', { class: 'rv-day-name' }, i === 1 ? 'Demain' : weekdayName(parseYmd(key))),
            ...rows.map((r) => h('div', { class: 'rv-row' + (r.ev ? ' ev' : '') }, h('span', { class: 'rv-time' }, r.s || (r.ev ? 'Jour' : '☐')), h('span', {}, r.t)))));
        }
        parts.push(section('Les 7 prochains jours', null, ...(days.length ? days : [h('p', { class: 'rv-empty' }, calOk ? 'Rien de prévu.' : 'Rien de daté. (Autorisez le calendrier dans l’Agenda pour y voir vos rendez-vous.)')])));

        if (undated.length) {
          parts.push(section('Sans date', undated.length, ...undated.slice(0, 8).map((t) => taskRow(t, [['Aujourd’hui', 'today'], ['Demain', 'tomorrow'], ['Lundi', 'monday']]))));
          if (undated.length > 8) parts.push(h('p', { class: 'rv-more' }, `+ ${undated.length - 8} autres dans Tâches`));
        }

        if (inbox) parts.push(section('Boîte de réception', inbox, h('div', { class: 'rv-inbox' },
          h('span', {}, `${inbox} élément${inbox > 1 ? 's' : ''} à trier`),
          h('button', { class: 'btn btn-primary sm', type: 'button', onclick: () => { close(); openTriage(); } }, 'Trier'))));

        parts.push(h('p', { class: 'rv-foot-note' }, `${written} note${written > 1 ? 's' : ''} écrite${written > 1 ? 's' : ''} ces 7 derniers jours.`));
        parts.push(h('div', { class: 'dialog-actions' },
          h('button', { class: 'btn btn-primary', type: 'button', onclick: () => { setSetting('lastReview', today); toast('Revue terminée'); close(); } }, 'Terminer la revue')));
        root.replaceChildren(...parts);
      }

      render();
      (async () => {
        try {
          if ((await cal.permission()) === 'granted') {
            calOk = true;
            events = await cal.eventsByDay(ymd(addDays(startOfDay(new Date()), 1)), 7);
            render();
          }
        } catch {}
      })();
      return root;
    },
  });
}
