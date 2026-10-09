// Navigation par hash : #/c/<collection>[/<arg>][/n/<noteId>][?line=N]
//   collections : all, journal, tasks, folder/<id>, tag/<nom>, trash
// Commandes : #/new, #/today (créent ou ouvrent, puis remplacent le hash)

export function parseHash(hash = location.hash) {
  const raw = hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const seg = path.split('/').filter(Boolean).map(decodeURIComponent);
  const route = { c: 'all', arg: null, note: null, line: null, cmd: null };
  if (seg[0] === 'new' || seg[0] === 'today') { route.cmd = seg[0]; return route; }
  if (seg[0] === 'tasks') { route.c = 'tasks'; return route; }
  if (seg[0] === 'c') {
    route.c = seg[1] || 'all';
    let i = 2;
    if (route.c === 'folder' || route.c === 'tag') route.arg = seg[i++] || null;
    if (seg[i] === 'n') route.note = seg[i + 1] || null;
  }
  if (qs) { const m = /line=(\d+)/.exec(qs); if (m) route.line = +m[1]; }
  return route;
}

export function hashFor(r) {
  let h = `#/c/${r.c}`;
  if (r.arg) h += '/' + encodeURIComponent(r.arg);
  if (r.note) h += '/n/' + r.note;
  if (r.line != null) h += `?line=${r.line}`;
  return h;
}

export function go(route, { replace = false } = {}) {
  const h = hashFor(route);
  if (replace) history.replaceState({ depth: route.note ? 1 : 0 }, '', h);
  else history.pushState({ depth: route.note ? 1 : 0 }, '', h);
  window.dispatchEvent(new Event('plume:route'));
}
