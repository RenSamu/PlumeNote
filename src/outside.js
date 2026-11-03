// Dehors : météo du jour (Open-Meteo, sans clé) et prochains départs de trains (transport.opendata.ch, sans clé).
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { h, toast, promptDialog } from './ui.js';
import { icon } from './icons.js';
import { ctx } from './ctx.js';
import { state, setSetting } from './store.js';
import { empty } from './datanote.js';

const DEFAULT_CITY = { name: 'Sion', lat: 46.2293, lon: 7.3586 };
const DEFAULT_ROUTES = [{ from: 'Sion', to: 'Martigny' }, { from: 'Martigny', to: 'Sion' }];
const TTL = 20 * 60 * 1000;
const cache = new Map(); // url → { at, data }

export async function getJSON(url) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  let data;
  if (globalThis.__PLUME_HTTP__) data = JSON.parse(await globalThis.__PLUME_HTTP__(url));
  else if (Capacitor.isNativePlatform()) {
    const r = await CapacitorHttp.get({ url, connectTimeout: 6000, readTimeout: 9000, responseType: 'json' });
    data = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
  } else {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    try { data = await (await fetch(url, { signal: ctl.signal })).json(); } finally { clearTimeout(t); }
  }
  cache.set(url, { at: Date.now(), data });
  try { localStorage.setItem('plume.http:' + url, JSON.stringify({ at: Date.now(), data })); } catch {}
  return data;
}
function stale(url) { try { return JSON.parse(localStorage.getItem('plume.http:' + url))?.data || null; } catch { return null; } }

export const city = () => state.settings.city || DEFAULT_CITY;
export const routes = () => state.settings.routes || DEFAULT_ROUTES;

const WMO = [
  [[0], '☀️', 'Dégagé'], [[1, 2], '🌤️', 'Peu nuageux'], [[3], '☁️', 'Couvert'], [[45, 48], '🌫️', 'Brouillard'],
  [[51, 53, 55, 56, 57], '🌦️', 'Bruine'], [[61, 63, 65, 66, 67], '🌧️', 'Pluie'], [[71, 73, 75, 77, 85, 86], '🌨️', 'Neige'],
  [[80, 81, 82], '🌦️', 'Averses'], [[95, 96, 99], '⛈️', 'Orage'],
];
export const wmo = (c) => WMO.find(([codes]) => codes.includes(c)) || [[], '🌡️', '—'];

const dayName = (iso, i) => (i === 0 ? "Aujourd'hui" : i === 1 ? 'Demain' : new Date(iso + 'T12:00').toLocaleDateString('fr-CH', { weekday: 'long' }));

function weatherUrl(c) {
  return `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m`
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=4';
}

function weatherCard() {
  const c = city();
  const url = weatherUrl(c);
  const card = h('div', { class: 'ot-card' }, h('p', { class: 'ot-loading' }, 'Chargement de la météo…'));
  getJSON(url).then((d) => draw(d, false), () => { const s = stale(url); if (s) draw(s, true); else card.replaceChildren(h('p', { class: 'ot-err' }, 'Météo indisponible : pas de connexion.')); });
  function draw(d, old) {
    const cur = d.current, dl = d.daily;
    const [, ic, label] = wmo(cur.weather_code);
    card.replaceChildren(...[
      h('div', { class: 'ot-now' },
        h('span', { class: 'ot-ic' }, ic),
        h('div', {}, h('b', { class: 'ot-temp' }, `${Math.round(cur.temperature_2m)}°`), h('span', { class: 'ot-lab' }, `${label} · ressenti ${Math.round(cur.apparent_temperature)}° · vent ${Math.round(cur.wind_speed_10m)} km/h`)),
        h('button', { class: 'chip-btn ot-city', type: 'button', onclick: changeCity }, c.name)),
      h('div', { class: 'ot-days' }, ...dl.time.map((t, i) => h('div', { class: 'ot-day' },
        h('span', { class: 'ot-dn' }, dayName(t, i)), h('span', { class: 'ot-di' }, wmo(dl.weather_code[i])[1]),
        h('span', { class: 'ot-dt' }, `${Math.round(dl.temperature_2m_max[i])}° / ${Math.round(dl.temperature_2m_min[i])}°`),
        h('span', { class: 'ot-dp' }, dl.precipitation_probability_max[i] != null ? `💧 ${dl.precipitation_probability_max[i]} %` : '')))),
      old ? h('p', { class: 'ot-err' }, 'Données enregistrées : pas de connexion.') : null].filter(Boolean));
  }
  return card;
}

async function changeCity() {
  const q = await promptDialog({ title: 'Ville pour la météo', label: 'Nom de la ville', value: city().name, confirm: 'Chercher' });
  if (!q) return;
  try {
    const d = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=fr`);
    const r = d.results?.[0];
    if (!r) { toast('Ville introuvable'); return; }
    setSetting('city', { name: r.name, lat: r.latitude, lon: r.longitude });
  } catch { toast('Recherche impossible hors connexion'); }
}

const hhmm = (iso) => (iso ? new Date(iso).toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' }) : '');
const dur = (s) => { const m = /^(\d+)d(\d\d):(\d\d):/.exec(s || ''); return m ? (+m[1] * 24 + +m[2]) * 60 + +m[3] : 0; };
const fmtDur = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`);

function routeCard(r, i) {
  const url = `https://transport.opendata.ch/v1/connections?from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}&limit=4`;
  const list = h('div', { class: 'ot-conns' }, h('p', { class: 'ot-loading' }, '…'));
  const render = (d, old) => {
    const cs = d.connections || [];
    list.replaceChildren(...(cs.length ? cs.map((c) => {
      const f = c.from, delay = f.delay || 0;
      return h('div', { class: 'ot-conn' },
        h('b', { class: 'ot-dep' }, hhmm(f.departure)),
        delay > 0 ? h('span', { class: 'ot-late' }, `+${delay}`) : null,
        h('span', { class: 'ot-mid' }, `${fmtDur(dur(c.duration))}${c.transfers ? ` · ${c.transfers} corresp.` : ' · direct'}`),
        f.platform ? h('span', { class: 'ot-pf' }, `voie ${f.platform}`) : null);
    }) : [h('p', { class: 'ot-err' }, 'Aucun départ trouvé.')]),
    ...(old ? [h('p', { class: 'ot-err' }, 'Horaires enregistrés : pas de connexion.')] : []));
  };
  getJSON(url).then((d) => render(d, false), () => { const s = stale(url); if (s) render(s, true); else list.replaceChildren(h('p', { class: 'ot-err' }, 'Horaires indisponibles : pas de connexion.')); });
  return h('div', { class: 'ot-card' },
    h('div', { class: 'ot-rh' }, h('b', {}, `${r.from} → ${r.to}`),
      h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': `Retirer le trajet ${r.from} vers ${r.to}`, onclick: () => setSetting('routes', routes().filter((_, k) => k !== i)), html: icon('x', 16) })),
    list);
}

async function addRoute() {
  const from = await promptDialog({ title: 'Nouveau trajet', label: 'Départ (gare ou arrêt)', confirm: 'Suivant' });
  if (!from) return;
  const to = await promptDialog({ title: 'Nouveau trajet', label: 'Arrivée', confirm: 'Ajouter' });
  if (!to) return;
  setSetting('routes', [...routes(), { from: from.trim(), to: to.trim() }]);
}

export function renderOutside(extra, body, countEl) {
  countEl.textContent = '';
  extra.replaceChildren();
  body.replaceChildren(
    h('div', { class: 'group' }, 'Météo'),
    weatherCard(),
    h('div', { class: 'group' }, 'Prochains trains'),
    ...routes().map(routeCard),
    h('div', { class: 'sh-foot' }, h('button', { class: 'btn btn-quiet sm', type: 'button', onclick: addRoute }, '+ Ajouter un trajet'),
      h('button', { class: 'btn btn-quiet sm', type: 'button', onclick: () => { cache.clear(); ctx.refreshList(); } }, 'Actualiser')));
}
