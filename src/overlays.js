// Calques : sélecteur d'échéance, palette de commandes, réglages.
import { h, openLayer, openSheet, toast } from './ui.js';
import { icon } from './icons.js';
import { ctx } from './ctx.js';
import { state, searchAll, liveNotes, setSetting, storageStats, exportAll, importAll } from './store.js';
import { saveBlob, pickFiles } from './files.js';
import { permissionState, requestPermission, reschedule } from './reminders.js';
import { ymd, addDays, startOfDay, dueToken, humanSize, weekdayName, longDay } from './md.js';

const VERSION = typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'dev';

// ——— Échéance ———
export function openDatePicker(onPick) {
  openSheet({
    title: 'Échéance',
    className: 'dialog datepicker',
    content: (body, close) => {
      const today = startOfDay(new Date());
      const sat = addDays(today, ((6 - today.getDay() + 7) % 7) || 7);
      const mon = addDays(today, ((8 - today.getDay()) % 7) || 7);
      const time = h('input', { class: 'field', type: 'time', 'aria-label': 'Heure (facultatif)', step: 300 });
      const fmt = new Intl.DateTimeFormat('fr-CH', { weekday: 'short', day: 'numeric', month: 'short' });
      const pick = (d) => { close(); onPick(dueToken(ymd(d), time.value || null)); };
      const opt = (label, d) => h('button', { class: 'dp-opt', type: 'button', onclick: () => pick(d) },
        h('span', {}, label), h('small', {}, fmt.format(d).replace('.', '')));
      const date = h('input', { class: 'field', type: 'date', min: ymd(today), value: ymd(addDays(today, 1)), 'aria-label': 'Date précise' });
      const setTime = (v) => { time.value = v; };
      return h('div', { class: 'dp' },
        h('div', { class: 'dp-opts' },
          opt("Aujourd'hui", today), opt('Demain', addDays(today, 1)), opt('Ce week-end', sat), opt('Lundi prochain', mon), opt('Dans une semaine', addDays(today, 7))),
        h('div', { class: 'dp-row' },
          h('label', { class: 'field-label' }, 'Heure (facultatif)'),
          h('div', { class: 'dp-time' },
            h('button', { class: 'chip-btn', type: 'button', onclick: () => setTime('09:00') }, 'Matin'),
            h('button', { class: 'chip-btn', type: 'button', onclick: () => setTime('12:30') }, 'Midi'),
            h('button', { class: 'chip-btn', type: 'button', onclick: () => setTime('18:00') }, 'Soir'),
            time)),
        h('div', { class: 'dp-row' },
          h('label', { class: 'field-label' }, 'Autre date'),
          h('div', { class: 'dp-custom' }, date,
            h('button', { class: 'btn btn-primary', type: 'button', onclick: () => { if (date.value) { const [y, m, d] = date.value.split('-').map(Number); pick(new Date(y, m - 1, d)); } } }, 'Choisir'))));
    },
  });
}

// ——— Palette ———
function mark(text, terms) {
  if (!terms.length) return text;
  const re = new RegExp('(' + terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'ig');
  const frag = document.createDocumentFragment();
  text.split(re).forEach((part, i) => { frag.appendChild(i % 2 ? h('mark', {}, part) : document.createTextNode(part)); });
  return frag;
}

export function openPalette() {
  const actions = [
    { icon: 'plus', label: 'Nouvelle note', kbd: 'Alt N', run: () => ctx.newNote() },
    { icon: 'sun', label: "Ouvrir la note d'aujourd'hui", kbd: 'Alt J', run: () => ctx.openToday() },
    { icon: 'tasks', label: 'Voir toutes les tâches', kbd: 'Alt T', run: () => ctx.openCollection({ c: 'tasks' }) },
    { icon: 'file', label: 'Toutes les notes', run: () => ctx.openCollection({ c: 'all' }) },
    { icon: 'trash', label: 'Corbeille', run: () => ctx.openCollection({ c: 'trash' }) },
    { icon: 'settings', label: 'Réglages', run: () => ctx.openSettings() },
  ];
  openLayer({
    className: 'palette-layer',
    build(panel, close) {
      const input = h('input', { class: 'pal-input', type: 'text', placeholder: 'Chercher une note ou une action', 'aria-label': 'Rechercher', autocomplete: 'off', spellcheck: false, autofocus: true, role: 'combobox', 'aria-expanded': 'true' });
      const list = h('div', { class: 'pal-list', role: 'listbox' });
      panel.append(h('div', { class: 'pal-head' }, h('span', { html: icon('search', 18) }), input,
        h('button', { class: 'icon-btn sm pal-close', type: 'button', 'aria-label': 'Fermer', onclick: () => close(), html: icon('x', 18) })), list);
      let items = [], sel = 0;
      const run = (it) => { close(); setTimeout(it.run, 0); };

      function render() {
        const q = input.value.trim();
        const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
        items = [];
        if (!q) {
          actions.forEach((a) => items.push({ ...a, group: 'Actions' }));
          liveNotes().sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6).forEach((n) => items.push({ note: n, group: 'Récentes', run: () => ctx.openNote(n.id) }));
        } else {
          actions.filter((a) => terms.every((t) => a.label.toLowerCase().includes(t))).slice(0, 3).forEach((a) => items.push({ ...a, group: 'Actions' }));
          searchAll(q, 12).forEach((n) => items.push({ note: n, group: 'Notes', run: () => ctx.openNote(n.id) }));
        }
        sel = Math.min(sel, Math.max(0, items.length - 1));
        list.replaceChildren();
        if (!items.length) { list.appendChild(h('div', { class: 'pal-empty' }, `Aucun résultat pour « ${q} »`)); return; }
        let last = null;
        items.forEach((it, i) => {
          if (it.group !== last) { list.appendChild(h('div', { class: 'pal-group' }, it.group)); last = it.group; }
          const row = it.note
            ? h('button', { class: 'pal-item', type: 'button', role: 'option', 'aria-selected': String(i === sel) },
                h('span', { class: 'pal-ic', html: icon(it.note.kind === 'daily' ? 'sun' : 'file', 18) }),
                h('span', { class: 'pal-main' }, h('span', { class: 'pal-title' }, mark(it.note.title || 'Note vide', terms)),
                  it.note.snippet ? h('span', { class: 'pal-sub' }, it.note.snippet) : null))
            : h('button', { class: 'pal-item', type: 'button', role: 'option', 'aria-selected': String(i === sel) },
                h('span', { class: 'pal-ic', html: icon(it.icon, 18) }),
                h('span', { class: 'pal-main' }, h('span', { class: 'pal-title' }, mark(it.label, terms))),
                it.kbd ? h('kbd', {}, it.kbd) : null);
          row.addEventListener('click', () => run(it));
          row.addEventListener('mousemove', () => { if (sel !== i) { sel = i; updateSel(); } });
          list.appendChild(row);
        });
      }
      function updateSel() {
        [...list.querySelectorAll('.pal-item')].forEach((el, i) => {
          el.setAttribute('aria-selected', String(i === sel));
          if (i === sel) el.scrollIntoView({ block: 'nearest' });
        });
      }
      input.addEventListener('input', () => { sel = 0; render(); });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); updateSel(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); updateSel(); }
        else if (e.key === 'Enter') { e.preventDefault(); if (items[sel]) run(items[sel]); }
      });
      render();
    },
  });
}

// ——— Réglages ———
function toggle(label, desc, value, onChange) {
  const btn = h('button', { class: 'switch' + (value ? ' on' : ''), type: 'button', role: 'switch', 'aria-checked': String(!!value), 'aria-label': label,
    onclick: () => { value = !value; btn.classList.toggle('on', value); btn.setAttribute('aria-checked', String(value)); onChange(value); } }, h('span', { class: 'knob' }));
  return h('div', { class: 'set-row' }, h('div', { class: 'set-text' }, h('div', { class: 'set-label' }, label), desc ? h('div', { class: 'set-desc' }, desc) : null), btn);
}

export function openSettings() {
  openSheet({
    title: 'Réglages',
    wide: true,
    className: 'settings',
    content: (body) => {
      const permText = h('span', { class: 'set-value' }, '…');
      const permBtn = h('button', { class: 'btn sm', type: 'button', hidden: true, onclick: async () => { await requestPermission(); await refreshPerm(); reschedule(); } }, 'Autoriser');
      async function refreshPerm() {
        const p = await permissionState();
        permText.textContent = p === 'granted' ? 'Autorisées' : p === 'denied' ? 'Refusées (à changer dans les réglages du téléphone)' : p === 'unsupported' ? 'Non prises en charge ici' : 'Pas encore autorisées';
        permBtn.hidden = !(p === 'prompt' || p === 'prompt-with-rationale');
      }
      refreshPerm();
      const stats = storageStats();
      const time = h('input', { class: 'field narrow', type: 'time', value: state.settings.reminderTime, 'aria-label': 'Heure des rappels par défaut',
        onchange: (e) => { if (e.target.value) { setSetting('reminderTime', e.target.value); reschedule(); } } });

      return h('div', { class: 'settings-body' },
        h('section', {},
          h('h3', {}, 'Capture'),
          toggle('Ouvrir sur une nouvelle note', "L'application se lance prête à écrire, sans passer par la liste.", state.settings.openOnNew, (v) => setSetting('openOnNew', v))),
        h('section', {},
          h('h3', {}, 'Rappels'),
          h('div', { class: 'set-row' }, h('div', { class: 'set-text' }, h('div', { class: 'set-label' }, 'Notifications'), permText), permBtn),
          h('div', { class: 'set-row' }, h('div', { class: 'set-text' }, h('div', { class: 'set-label' }, 'Heure par défaut'), h('div', { class: 'set-desc' }, "Pour une échéance sans heure précise.")), time)),
        h('section', {},
          h('h3', {}, 'Données'),
          h('p', { class: 'set-desc flat' }, `${stats.notes} note${stats.notes > 1 ? 's' : ''}, ${stats.attachments} pièce${stats.attachments > 1 ? 's' : ''} jointe${stats.attachments > 1 ? 's' : ''} (${humanSize(stats.attachmentBytes)}), stockées sur cet appareil.`),
          h('div', { class: 'set-actions' },
            h('button', { class: 'btn', type: 'button', onclick: async () => {
              try { const blob = await exportAll(); await saveBlob(`plume-sauvegarde-${ymd(new Date())}.json`, blob); toast('Sauvegarde prête'); } catch (e) { toast('Export impossible : ' + (e.message || e)); }
            } }, h('span', { html: icon('download', 17) }), 'Exporter une sauvegarde'),
            h('button', { class: 'btn', type: 'button', onclick: async () => {
              const [f] = await pickFiles({ accept: '.json,application/json', multiple: false });
              if (!f) return;
              try { const n = await importAll(await f.text()); toast(n ? `${n} note${n > 1 ? 's' : ''} importée${n > 1 ? 's' : ''}` : 'Rien de nouveau à importer'); }
              catch (e) { toast(e.message || 'Fichier illisible.'); }
            } }, h('span', { html: icon('upload', 17) }), 'Importer'))),
        h('section', {},
          h('h3', {}, 'Synchronisation'),
          h('div', { class: 'sync-card' }, h('span', { html: icon('cloud', 20) }),
            h('div', {}, h('div', { class: 'set-label' }, 'Pas encore activée'),
              h('div', { class: 'set-desc' }, 'Vos notes restent sur cet appareil. Exportez une sauvegarde pour les mettre à l\'abri en attendant la synchronisation.')))),
        h('section', {},
          h('h3', {}, 'Raccourcis'),
          h('dl', { class: 'keys' },
            ...[['Ctrl K', 'Palette de commandes'], ['Alt N', 'Nouvelle note'], ['Alt J', "Note d'aujourd'hui"], ['Alt T', 'Tâches'], ['Échap', 'Fermer / retour']].flatMap(([k, d]) => [h('dt', {}, h('kbd', {}, k)), h('dd', {}, d)]))),
        h('p', { class: 'about' }, `Plume ${VERSION} · fait pour aller vite`));
    },
  });
}
