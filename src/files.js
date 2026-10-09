// Pièces jointes : compression d'image, enregistrement vocal, ouverture de fichiers.
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { attachmentBlob } from './store.js';

export const isNative = () => Capacitor.isNativePlatform();

const MAX_SIDE = 1800;

/** Réduit les grosses photos (JPEG 0.85, 1800 px max) pour garder la base légère. */
export async function prepareImage(file) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 600 * 1024) { bmp.close?.(); return file; }
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

export function pickFiles({ accept = '', multiple = true, capture = null } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (accept) input.accept = accept;
    input.multiple = multiple;
    if (capture) input.setAttribute('capture', capture);
    input.style.display = 'none';
    document.body.appendChild(input);
    let done = false;
    const finish = (files) => { if (done) return; done = true; input.remove(); resolve(files); };
    input.addEventListener('change', () => finish([...input.files]));
    input.addEventListener('cancel', () => finish([]));
    input.click();
  });
}

// ——— Enregistrement vocal ———

export function recorderSupported() {
  return !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
}

export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((m) => MediaRecorder.isTypeSupported?.(m));
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const startedAt = Date.now();
  rec.start(250);
  const release = () => stream.getTracks().forEach((t) => t.stop());
  return {
    startedAt,
    stop() {
      return new Promise((resolve) => {
        rec.onstop = () => {
          release();
          const blob = new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' });
          resolve({ blob, duration: (Date.now() - startedAt) / 1000 });
        };
        if (rec.state !== 'inactive') rec.stop(); else rec.onstop();
      });
    },
    cancel() {
      rec.onstop = null;
      try { if (rec.state !== 'inactive') rec.stop(); } catch {}
      release();
    },
  };
}

// ——— Ouvrir / partager ———

const blobToB64 = (blob) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1] || '');
  r.onerror = () => rej(r.error);
  r.readAsDataURL(blob);
});

export async function openAttachment(meta) {
  const blob = await attachmentBlob(meta.id);
  if (!blob) throw new Error('Fichier introuvable sur cet appareil.');
  if (isNative()) {
    const safe = meta.name.replace(/[^\w.\- ]+/g, '_') || 'fichier';
    const path = `plume-${meta.id.slice(0, 8)}-${safe}`;
    await Filesystem.writeFile({ path, data: await blobToB64(blob), directory: Directory.Cache });
    const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
    await Share.share({ title: meta.name, url: uri, dialogTitle: 'Ouvrir avec…' });
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.target = '_blank'; a.rel = 'noopener';
  if (meta.kind === 'file' && !/pdf$/.test(meta.type)) a.download = meta.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export async function saveTextFile(name, text, type = 'text/markdown') {
  return saveBlob(name, new Blob([text], { type }));
}

export async function saveBlob(name, blob) {
  if (isNative()) {
    const path = name;
    await Filesystem.writeFile({ path, data: await blobToB64(blob), directory: Directory.Cache });
    const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
    await Share.share({ title: name, url: uri, dialogTitle: 'Enregistrer ou envoyer' });
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
