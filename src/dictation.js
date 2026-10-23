// Dictée vocale : reconnaissance de la parole du téléphone (module natif Android) ou du navigateur.
import { Capacitor, registerPlugin } from '@capacitor/core';

const Native = registerPlugin('PlumeNative');
const LANG = 'fr-FR';

// `__PLUME_DICT__` : fausse reconnaissance vocale pour les tests automatiques.
const fake = () => globalThis.__PLUME_DICT__ || null;
const webApi = () => globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition || null;

export function supported() {
  return !!fake() || Capacitor.isNativePlatform() || !!webApi();
}

/** Met en forme le texte reconnu : ponctuation dite à voix haute, majuscule initiale. */
export function tidy(raw) {
  let t = ` ${String(raw || '').trim()} `;
  const rules = [
    [/\s+(?:à la ligne|nouvelle ligne|retour à la ligne)\s+/gi, '\n'],
    [/\s+point d['’]interrogation\b/gi, ' ?'],
    [/\s+point d['’]exclamation\b/gi, ' !'],
    [/\s+points? de suspension\b/gi, '…'],
    [/\s+deux[- ]points\b/gi, ' :'],
    [/\s+point[- ]virgule\b/gi, ' ;'],
    [/\s+point final\b/gi, '.'],
    [/\s+virgule\b/gi, ','],
    [/\s+ouvrez? la parenthèse\s+/gi, ' ('],
    [/\s+fermez? la parenthèse\b/gi, ')'],
  ];
  for (const [re, to] of rules) t = t.replace(re, to);
  t = t.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\( /g, '(').trim();
  return t.replace(/(^|[.!?…]\s+|\n)(\p{Ll})/gu, (m, a, b) => a + b.toUpperCase());
}

/**
 * Démarre l'écoute. Retourne { done, stop, cancel } :
 * `done` donne le texte final (déjà mis en forme), `stop` termine proprement, `cancel` abandonne.
 */
export function listen({ onPartial = () => {} } = {}) {
  let ctl;
  const done = new Promise((resolve, reject) => {
    if (fake()) { ctl = fake().start(onPartial, (t) => resolve(tidy(t)), reject); return; }
    if (Capacitor.isNativePlatform()) {
      let sub = null;
      const finish = (fn, v) => { try { sub?.remove?.(); } catch {} fn(v); };
      Native.addListener('partial', (e) => onPartial(tidy(e?.text))).then((s) => { sub = s; });
      Native.listen({ lang: LANG })
        .then((r) => finish(resolve, tidy(r?.text)))
        .catch((e) => finish(reject, e));
      ctl = { stop: () => Native.stop().catch(() => {}), cancel: () => Native.cancel().catch(() => {}) };
      return;
    }
    const API = webApi();
    if (!API) { reject(Object.assign(new Error('unavailable'), { code: 'unavailable' })); return; }
    const r = new API();
    r.lang = LANG; r.interimResults = true; r.continuous = true;
    let text = '';
    let cancelled = false;
    r.onresult = (e) => {
      let s = '';
      for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript + ' ';
      text = s.trim();
      onPartial(tidy(text));
    };
    r.onerror = (e) => { if (!cancelled) reject(Object.assign(new Error(e.error), { code: e.error === 'not-allowed' ? 'permission' : e.error })); };
    r.onend = () => { if (cancelled) reject(Object.assign(new Error('cancelled'), { code: 'cancelled' })); else resolve(tidy(text)); };
    r.start();
    ctl = { stop: () => r.stop(), cancel: () => { cancelled = true; r.abort(); } };
  });
  return { done, stop: () => ctl?.stop?.(), cancel: () => ctl?.cancel?.() };
}

/** Message lisible pour une erreur de dictée. */
export function errorText(e) {
  const c = e?.code || e?.message || '';
  if (/permission|not-allowed/i.test(c)) return 'Micro refusé. Autorisez-le dans les réglages du téléphone.';
  if (/unavailable|service-not-allowed/i.test(c)) return 'La dictée n’est pas disponible sur cet appareil.';
  if (/network/i.test(c)) return 'La dictée a besoin d’une connexion Internet sur cet appareil.';
  if (/no.?match|no-speech|speech_timeout/i.test(c)) return 'Je n’ai rien entendu.';
  return 'La dictée a échoué.';
}
