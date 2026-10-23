// Comptage approximatif des syllabes d'un vers français (e muet, élisions, synérèse courante).
// C'est une aide à l'écriture : le résultat est donné « environ » (≈), sans diérèses ni exceptions rares.

const VOWELS = 'aeiouyàâäéèêëîïôöùûüœæ';
const isV = (c) => !!c && VOWELS.includes(c);

// Mots en -ent dont le « ent » se prononce (pas des verbes à la 3e personne du pluriel).
const ENT_SOUNDED = new Set(['souvent', 'argent', 'lent', 'lente', 'dent', 'vent', 'cent', 'content', 'contente', 'présent', 'absent', 'parent', 'différent', 'évident', 'patient', 'ardent', 'urgent', 'agent', 'accident', 'serpent', 'torrent', 'orient', 'client', 'talent', 'élément', 'moment', 'instant', 'tourment', 'sentiment', 'événement', 'vraiment', 'seulement', 'simplement', 'doucement', 'lentement']);

function stemSyllables(stem) {
  // « qu » et « gu » devant e/i : le u ne compte pas.
  const s = stem.replace(/([qg])u(?=[eéèêi])/g, '$1').replace(/([qg])u$/, '$1');
  let count = 0;
  let prev = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (isV(c)) {
      // Un é/è/ï suivi d'une autre voyelle ne fait pas diphtongue (« créé », « poète » reste 1+1).
      if (!isV(prev) || /[éèêï]/.test(prev) || /[éèêï]/.test(c) && prev !== 'u') count++;
    }
    prev = c;
  }
  return count;
}

/** Syllabes d'un mot : { base, mute } — `mute` = 1 si un e muet final se prononce devant une consonne. */
function wordInfo(word) {
  const w = word.toLowerCase();
  let stem = w;
  let tail = '';
  if (/(?:es|e)$/.test(w) && !/é(?:e|es)$/.test(w) || /ée$|ées$/.test(w)) {
    tail = w.endsWith('es') ? 'es' : 'e';
    stem = w.slice(0, -tail.length);
  } else if (/ent$/.test(w) && w.length > 4 && !/ment$/.test(w) && !ENT_SOUNDED.has(w)) {
    tail = 'ent';
    stem = w.slice(0, -3);
  }
  const base = stemSyllables(stem);
  if (!tail) return { base, mute: 0, tailOnly: false };
  if (base === 0) return { base: 1, mute: 0, tailOnly: tail === 'e' }; // « le », « que », « les », « vent »…
  return { base, mute: 1, tailOnly: false };
}

/** Nombre de syllabes d'une ligne, ou null si elle ne contient pas de mot. */
export function lineSyllables(text) {
  const words = [];
  const re = /([\p{L}œæ]+)(['’]?)/gu;
  let m;
  while ((m = re.exec(text))) words.push({ w: m[1], elided: !!m[2] });
  if (!words.length) return null;
  let total = 0;
  for (let i = 0; i < words.length; i++) {
    const { w, elided } = words[i];
    if (elided) continue; // l', d', j', qu'… : s'appuient sur le mot suivant
    const info = wordInfo(w);
    let n = info.base;
    if (info.mute) {
      const next = words[i + 1];
      if (next) {
        const c = next.w[0].toLowerCase();
        if (!(isV(c) || c === 'h')) n += 1; // e muet prononcé devant une consonne
      }
    } else if (info.tailOnly) {
      // « je », « de », « que »… : élidés devant une voyelle
      const next = words[i + 1];
      if (next && (isV(next.w[0].toLowerCase()) || next.w[0].toLowerCase() === 'h')) n = 0;
    }
    total += n;
  }
  return total;
}
