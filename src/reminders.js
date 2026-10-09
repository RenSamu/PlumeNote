// Rappels de tâches : notifications locales (APK) ou minuteries tant que l'app est ouverte (web).
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { state, allTasks } from './store.js';
import { dueDate } from './md.js';

const native = () => Capacitor.isNativePlatform();
const MAX_SCHEDULED = 120;
let webTimers = [];
let onOpenNote = () => {};
let onFallback = () => {};

function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return Math.abs(h) % 2147483000 + 1;
}

export function setHandlers({ openNote, fallback }) {
  onOpenNote = openNote; onFallback = fallback;
  if (native()) {
    LocalNotifications.addListener('localNotificationActionPerformed', (e) => {
      const id = e.notification?.extra?.noteId;
      if (id) onOpenNote(id);
    });
  }
}

export async function permissionState() {
  if (native()) {
    try { return (await LocalNotifications.checkPermissions()).display; } catch { return 'denied'; }
  }
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission === 'default' ? 'prompt' : Notification.permission;
}

export async function requestPermission() {
  if (native()) {
    try { return (await LocalNotifications.requestPermissions()).display; } catch { return 'denied'; }
  }
  if (!('Notification' in window)) return 'unsupported';
  const r = await Notification.requestPermission();
  return r === 'default' ? 'prompt' : r;
}

function upcoming() {
  const now = Date.now();
  const def = state.settings.reminderTime || '09:00';
  const out = [];
  for (const t of allTasks()) {
    if (t.done || !t.due) continue;
    const at = dueDate(t.due, def);
    if (at.getTime() > now + 2000) out.push({ ...t, at });
  }
  return out.sort((a, b) => a.at - b.at);
}

let pending = null;
export function reschedule() {
  clearTimeout(pending);
  pending = setTimeout(doReschedule, 1200);
}

async function doReschedule() {
  const tasks = upcoming();
  if (native()) {
    try {
      const perm = await LocalNotifications.checkPermissions();
      const queue = await LocalNotifications.getPending();
      if (queue.notifications.length) await LocalNotifications.cancel({ notifications: queue.notifications.map((n) => ({ id: n.id })) });
      if (perm.display !== 'granted') return;
      const notifications = tasks.slice(0, MAX_SCHEDULED).map((t) => ({
        id: hash(`${t.noteId}|${t.line}|${t.text}`),
        title: t.noteTitle || 'Plume',
        body: t.text,
        schedule: { at: t.at, allowWhileIdle: true },
        extra: { noteId: t.noteId },
        smallIcon: 'ic_stat_plume',
        iconColor: '#F2A33A',
      }));
      if (notifications.length) await LocalNotifications.schedule({ notifications });
    } catch (e) { console.warn('Rappels indisponibles', e); }
    return;
  }
  webTimers.forEach(clearTimeout);
  webTimers = [];
  const horizon = Date.now() + 24 * 3600 * 1000;
  for (const t of tasks) {
    const delay = t.at.getTime() - Date.now();
    if (t.at.getTime() > horizon || delay > 2147000000) break;
    webTimers.push(setTimeout(() => fire(t), delay));
  }
}

function fire(t) {
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      const n = new Notification(t.noteTitle || 'Plume', { body: t.text, tag: `${t.noteId}-${t.line}` });
      n.onclick = () => { window.focus(); onOpenNote(t.noteId); n.close(); };
      return;
    } catch {}
  }
  onFallback(t);
}
