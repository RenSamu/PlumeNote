// Prépare le projet Android : ajoute la plateforme Capacitor, applique les fichiers natifs
// (widget, tuile, partage, icônes, permissions) et synchronise le site web.
// Usage : node scripts/prepare-android.mjs   (idempotent)
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
process.chdir(root);
const run = (cmd) => { console.log('›', cmd); execSync(cmd, { stdio: 'inherit' }); };

const PKG = 'app.plume.notes';
const MARK = '<!-- plume-native -->';

run('node build.mjs');
if (!fs.existsSync('android')) run('npx cap add android');

const main = 'android/app/src/main';
const copyDir = (from, to) => {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, e.name), d = path.join(to, e.name);
    e.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
};

// Java : MainActivity, widget, tuile
copyDir('native/java', path.join(main, 'java', ...PKG.split('.')));
// Ressources : layout, drawable, xml
copyDir('native/res', path.join(main, 'res'));

// Manifeste
const mf = path.join(main, 'AndroidManifest.xml');
let xml = fs.readFileSync(mf, 'utf8');
if (!xml.includes(MARK)) {
  const filters = `${MARK}
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="plume" />
            </intent-filter>
            <intent-filter>
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="text/plain" />
            </intent-filter>
            <meta-data android:name="android.app.shortcuts" android:resource="@xml/shortcuts" />
        `;
  xml = xml.replace(/(<\/activity>)/, `${filters}$1`);

  const components = `
        <receiver android:name=".PlumeWidget" android:exported="true" android:label="Plume">
            <intent-filter><action android:name="android.appwidget.action.APPWIDGET_UPDATE" /></intent-filter>
            <meta-data android:name="android.appwidget.provider" android:resource="@xml/plume_widget_info" />
        </receiver>
        <service android:name=".NewNoteTileService" android:exported="true"
            android:label="Nouvelle note" android:icon="@drawable/ic_tile_plume"
            android:permission="android.permission.BIND_QUICK_SETTINGS_TILE">
            <intent-filter><action android:name="android.service.quicksettings.action.QS_TILE" /></intent-filter>
        </service>
    `;
  xml = xml.replace(/(<\/application>)/, `${components}$1`);

  const perms = `
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
`;
  xml = xml.replace(/(<\/manifest>)/, `${perms}$1`);
  fs.writeFileSync(mf, xml);
}

// Raccourcis d'icône (appui long) — mêmes liens plume://
fs.writeFileSync(path.join(main, 'res/xml/shortcuts.xml'), `<?xml version="1.0" encoding="utf-8"?>
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
    <shortcut android:shortcutId="new" android:enabled="true" android:icon="@drawable/ic_tile_plume"
        android:shortcutShortLabel="@string/sc_new" android:shortcutLongLabel="@string/sc_new">
        <intent android:action="android.intent.action.VIEW" android:data="plume://new"
            android:targetPackage="${PKG}" android:targetClass="${PKG}.MainActivity" />
    </shortcut>
    <shortcut android:shortcutId="today" android:enabled="true" android:icon="@drawable/ic_tile_plume"
        android:shortcutShortLabel="@string/sc_today" android:shortcutLongLabel="@string/sc_today">
        <intent android:action="android.intent.action.VIEW" android:data="plume://today"
            android:targetPackage="${PKG}" android:targetClass="${PKG}.MainActivity" />
    </shortcut>
</shortcuts>
`);
const strings = path.join(main, 'res/values/strings.xml');
let s = fs.readFileSync(strings, 'utf8');
if (!s.includes('sc_new')) {
  s = s.replace('</resources>', '    <string name="sc_new">Nouvelle note</string>\n    <string name="sc_today">Aujourd’hui</string>\n</resources>');
  fs.writeFileSync(strings, s);
}

// Couleurs de fond (évite le flash blanc au démarrage)
for (const f of ['res/values/styles.xml']) {
  const p = path.join(main, f);
  if (fs.existsSync(p)) {
    let t = fs.readFileSync(p, 'utf8');
    if (!t.includes('plume-bg')) {
      t = t.replace(/<style name="AppTheme.NoActionBar"([^>]*)>/, `<style name="AppTheme.NoActionBar"$1>\n        <item name="android:windowBackground">#141311</item><!-- plume-bg -->\n        <item name="android:navigationBarColor">#141311</item>\n        <item name="android:statusBarColor">#141311</item>`);
      fs.writeFileSync(p, t);
    }
  }
}

// Version depuis package.json
const ver = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
const gradle = 'android/app/build.gradle';
let g = fs.readFileSync(gradle, 'utf8');
const code = process.env.PLUME_VERSION_CODE || String(Math.floor(Date.now() / 60000));
g = g.replace(/versionCode \d+/, `versionCode ${code}`).replace(/versionName "[^"]*"/, `versionName "${ver}"`);

// Signature release (facultative) via variables d'environnement
if (process.env.PLUME_KEYSTORE && !g.includes('plumeRelease')) {
  g = g.replace(/android \{/, `android {
    signingConfigs {
        plumeRelease {
            storeFile file(System.getenv("PLUME_KEYSTORE"))
            storePassword System.getenv("PLUME_KEYSTORE_PASSWORD")
            keyAlias System.getenv("PLUME_KEY_ALIAS")
            keyPassword System.getenv("PLUME_KEY_PASSWORD")
        }
    }`);
  g = g.replace(/buildTypes \{\s*release \{/, 'buildTypes {\n        release {\n            signingConfig signingConfigs.plumeRelease');
}
fs.writeFileSync(gradle, g);

// Icônes et écrans de démarrage
try { run('npx capacitor-assets generate --android --assetPath assets'); } catch { console.warn('Génération des icônes ignorée'); }

run('npx cap sync android');
console.log('\nProjet Android prêt dans ./android');
