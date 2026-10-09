// Construit l'application web dans www/ (PWA + source de Capacitor).
//   node build.mjs            → www/
//   node build.mjs --watch    → reconstruit à chaque changement
//   node build.mjs --serve    → www/ servi sur http://localhost:5173
//   node build.mjs --single   → en plus : dist/plume-web.html (fichier unique, polices incluses)
import { build, context } from 'esbuild';
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, extname } from 'node:path';
import http from 'node:http';

const args = new Set(process.argv.slice(2));
const watch = args.has('--watch');
const serve = args.has('--serve');
const single = args.has('--single');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

function copyStatic() {
  cpSync('src/index.html', 'www/index.html');
  cpSync('src/manifest.webmanifest', 'www/manifest.webmanifest');
  if (existsSync('assets/web-icons')) cpSync('assets/web-icons', 'www/icons', { recursive: true });
}

function writeServiceWorker() {
  const files = walk('www').map((p) => relative('www', p).replaceAll('\\', '/')).filter((f) => f !== 'sw.js');
  const hash = createHash('sha1');
  files.forEach((f) => hash.update(f).update(readFileSync(join('www', f))));
  const version = hash.digest('hex').slice(0, 10);
  const sw = `// Généré par build.mjs — ne pas modifier.
const CACHE = 'plume-${version}';
const FILES = ${JSON.stringify(['./', ...files], null, 0)};
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).catch(() => caches.match('./index.html'))));
});
`;
  writeFileSync('www/sw.js', sw);
}

const options = {
  entryPoints: { app: 'src/main.js', styles: 'src/styles.css' },
  bundle: true,
  outdir: 'www',
  format: 'iife',
  target: ['chrome100', 'safari15'],
  minify: !watch,
  sourcemap: watch,
  loader: { '.woff2': 'file' },
  assetNames: 'fonts/[name]-[hash]',
  logLevel: 'info',
  define: { __VERSION__: JSON.stringify(pkg.version) },
  legalComments: 'none',
};

function makeSingle() {
  mkdirSync('dist', { recursive: true });
  let html = readFileSync('www/index.html', 'utf8');
  let css = readFileSync('www/styles.css', 'utf8');
  css = css.replace(/url\((?:"|')?(fonts\/[^)"']+)(?:"|')?\)/g, (_, f) => `url(data:font/woff2;base64,${readFileSync(join('www', f)).toString('base64')})`);
  const js = readFileSync('www/app.js', 'utf8').replace(/<\/script/gi, '<\\/script');
  html = html
    .replace(/<link rel="manifest"[^>]*>\s*/, '')
    .replace(/<link rel="apple-touch-icon"[^>]*>\s*/, '')
    .replace(/<link rel="icon"[^>]*>/, '<link rel="icon" href="data:image/svg+xml,' + encodeURIComponent(readFileSync('assets/web-icons/icon.svg', 'utf8')) + '">')
    .replace(/<link rel="stylesheet" href="styles.css">/, () => `<style>${css}</style>`)
    .replace(/<script src="app.js"><\/script>/, () => `<script>window.__PLUME_SINGLE__=true;</script><script>${js}</script>`);
  writeFileSync('dist/plume-web.html', html);
  console.log(`dist/plume-web.html : ${(html.length / 1024).toFixed(0)} Ko`);
}

async function once() {
  rmSync('www', { recursive: true, force: true });
  mkdirSync('www', { recursive: true });
  await build(options);
  copyStatic();
  writeServiceWorker();
  if (single) makeSingle();
}

if (watch || serve) {
  rmSync('www', { recursive: true, force: true });
  mkdirSync('www', { recursive: true });
  const ctx = await context({ ...options, minify: false, sourcemap: true, plugins: [{ name: 'static', setup(b) { b.onEnd(() => { copyStatic(); }); } }] });
  await ctx.rebuild();
  if (watch) await ctx.watch();
  if (serve) {
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
    http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const f = join('www', p);
      if (!existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); return res.end('404'); }
      res.writeHead(200, { 'Content-Type': types[extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(readFileSync(f));
    }).listen(5173, () => console.log('http://localhost:5173'));
  }
} else {
  await once();
}
