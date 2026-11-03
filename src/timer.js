// Minuteur : chrono libre ou pomodoro. À l'arrêt, la durée est ajoutée au journal du jour (« temps: 25min [[Client]] »),
// donc elle compte dans « Temps passé ». L'état est mémorisé : on peut quitter l'app, le temps continue.
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { h, toast } from './ui.js';
import { icon } from './icons.js';
import { ctx } from './ctx.js';
import { dailyFor, setBody, query } from './store.js';
import { ymd } from './md.js';
import { appendLine } from './datanote.js';

const KEY = 'plume.timer';
const NOTIF_ID = 2147483300;
const LN = () => globalThis.__PLUME_LN__ || LocalNotifications;
const native = () => !!globalThis.__PLUME_LN__ || Capacitor.isNativePlatform();
const DEF = { target: 0, label: '', running: false, startedAt: 0, acc: 0, brk: false, notified: false };
let st = load();
let tick = null;

function load() { try { return { ...DEF, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEF }; } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch {} }

export const elapsedMs = (now = Date.now()) => st.acc + (st.running ? now - st.startedAt : 0);
export const isRunning = () => st.running;
export const timerState = () => ({ ...st });

export function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  const p = (v) => String(v).padStart(2, '0');
  return (hh ? hh + ':' : '') + p(mm) + ':' + p(ss);
}
export function fmtDurLine(min) {
  return min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}` : `${min}min`;
}

async function cancelNotif() { if (native()) { try { await LN().cancel({ notifications: [{ id: NOTIF_ID }] }); } catch {} } }
async function scheduleNotif() {
  if (!native() || !st.target || !st.running) return;
  const at = new Date(st.startedAt + (st.target - st.acc));
  try {
    await LN().cancel({ notifications: [{ id: NOTIF_ID }] });
    await LN().schedule({ notifications: [{
      id: NOTIF_ID, title: st.brk ? 'Pause terminée' : 'Minuteur terminé',
      body: st.brk ? 'On s’y remet ?' : (st.label ? `${st.label} : c’est l’heure de faire une pause.` : 'C’est l’heure de faire une pause.'),
      schedule: { at, allowWhileIdle: true }, smallIcon: 'ic_stat_plume',
    }] });
  } catch (e) { console.warn('Notification du minuteur impossible', e); }
}

export function start() {
  if (st.running) return;
  st.running = true; st.startedAt = Date.now(); st.notified = false;
  save(); scheduleNotif();
}
export function pause() {
  if (!st.running) return;
  st.acc = elapsedMs(); st.running = false; st.startedAt = 0;
  save(); cancelNotif();
}
export function reset() { st = { ...DEF, target: st.target, label: st.label }; save(); cancelNotif(); }
export function setTarget(min, brk = false) {
  if (st.running || st.acc) reset();
  st.target = min * 60000; st.brk = brk; save();
}
export function setLabel(v) { st.label = v; save(); }

/** Ajoute la durée écoulée au journal du jour et remet à zéro. Retourne les minutes, ou 0. */
export function stopAndLog() {
  const ms = elapsedMs();
  if (st.running) { st.acc = ms; st.running = false; }
  const min = Math.max(1, Math.round(ms / 60000));
  if (st.brk || ms < 15000) { reset(); return 0; }
  const client = st.label.trim();
  const who = client ? (/\[\[/.test(client) ? client : `[[${client}]]`) : '';
  appendLine(dailyFor(ymd(new Date())).id, `temps: ${fmtDurLine(min)}${who ? ' ' + who : ''}`);
  reset();
  return min;
}

/** Passe la durée cible atteinte : fige le chrono et prévient. */
function checkDone() {
  if (st.running && st.target && elapsedMs() >= st.target) {
    st.acc = st.target; st.running = false; st.startedAt = 0; st.notified = true; save();
    try { if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.([200, 100, 200]); } catch {}
    toast(st.brk ? 'Pause terminée' : 'Minuteur terminé — enregistrez le temps ou prenez une pause');
    return true;
  }
  return false;
}

function clients() {
  const names = new Set(query({ view: 'people' }).map((n) => n.title));
  return [...names].filter(Boolean).sort((a, b) => a.localeCompare(b, 'fr'));
}

const PRESETS = [[0, 'Chrono'], [25, '25 min'], [50, '50 min']];

export function renderTimer(extra, body, countEl) {
  countEl.textContent = '';
  clearInterval(tick); tick = null;
  checkDone();
  const remaining = st.target ? Math.max(0, st.target - elapsedMs()) : 0;
  const shown = st.target ? remaining : elapsedMs();
  const finished = st.target && elapsedMs() >= st.target;

  extra.replaceChildren();
  const clock = h('div', { class: 'tm-clock' + (st.running ? ' run' : '') + (finished ? ' done' : ''), role: 'timer', 'aria-live': 'off' }, fmtClock(shown));
  const label = h('input', { class: 'field', type: 'text', list: 'tm-clients', placeholder: 'Pour qui ? (client ou sujet)', 'aria-label': 'Client ou sujet', value: st.label, autocomplete: 'off' });
  label.addEventListener('input', () => setLabel(label.value));
  const dl = h('datalist', { id: 'tm-clients' }, ...clients().map((c) => h('option', { value: c })));

  const presets = h('div', { class: 'status-bar tm-presets', role: 'group', 'aria-label': 'Durée' },
    ...PRESETS.map(([m, t]) => h('button', {
      class: 'chip-btn' + (!st.brk && st.target === m * 60000 ? ' on' : ''), type: 'button', disabled: st.running,
      onclick: () => { setTarget(m); ctx.refreshList(); },
    }, t)));

  const hasTime = st.running || elapsedMs() >= 1000;
  const main = !st.running
    ? h('button', { class: 'btn btn-primary tm-main', type: 'button', disabled: finished, onclick: () => { start(); ctx.refreshList(); } }, hasTime ? 'Reprendre' : 'Démarrer')
    : h('button', { class: 'btn btn-primary tm-main', type: 'button', onclick: () => { pause(); ctx.refreshList(); } }, 'Pause');
  const stop = hasTime && !st.brk
    ? h('button', { class: 'btn tm-stop', type: 'button', onclick: () => {
      const m = stopAndLog();
      toast(m ? `${fmtDurLine(m)} ajouté au journal` : 'Trop court : rien enregistré');
      ctx.refreshList();
    } }, 'Arrêter et enregistrer')
    : null;
  const brk = finished && !st.brk
    ? h('button', { class: 'btn btn-quiet', type: 'button', onclick: () => { stopAndLog(); setTarget(5, true); start(); ctx.refreshList(); } }, 'Enregistrer, puis pause 5 min')
    : null;
  const discard = hasTime ? h('button', { class: 'btn btn-quiet sm', type: 'button', onclick: () => { reset(); ctx.refreshList(); } }, 'Annuler') : null;

  body.replaceChildren(
    h('div', { class: 'tm-wrap' },
      st.brk ? h('div', { class: 'tm-tag' }, 'Pause') : null,
      clock, presets, st.brk ? null : label, dl,
      h('div', { class: 'tm-actions' }, main, stop, brk, discard),
      h('p', { class: 'tm-hint' }, 'Le temps enregistré est ajouté au journal du jour et compté dans « Temps passé ». Il continue de tourner si vous quittez l’appli.')));

  if (st.running) {
    tick = setInterval(() => {
      if (!document.body.contains(clock)) { clearInterval(tick); tick = null; return; }
      if (checkDone()) { clearInterval(tick); tick = null; ctx.refreshList(); return; }
      clock.textContent = fmtClock(st.target ? Math.max(0, st.target - elapsedMs()) : elapsedMs());
    }, 500);
  }
}
