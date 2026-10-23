// Fenêtre de dictée : affiche le texte au fur et à mesure, rend le texte final (ou null si abandon).
import { h, openSheet, toast } from './ui.js';
import { icon } from './icons.js';
import { listen, supported, errorText } from './dictation.js';

export { supported };

export function dictateSheet({ title = 'Dictée' } = {}) {
  return new Promise((resolve) => {
    let session = null;
    let result = null;
    let finished = false;
    const text = h('p', { class: 'dict-text', 'aria-live': 'polite' }, 'Parlez, je vous écoute…');
    const stopBtn = h('button', { class: 'btn btn-primary', type: 'button' }, 'Terminer');
    let closeSheet = () => {};

    const end = (value) => {
      if (finished) return;
      finished = true;
      result = value;
      closeSheet();
    };

    openSheet({
      title,
      className: 'dialog dictate',
      onClose: () => {
        if (!finished) { finished = true; try { session?.cancel(); } catch {} }
        resolve(result);
      },
      content: (body, close) => {
        closeSheet = close;
        stopBtn.onclick = () => { stopBtn.disabled = true; stopBtn.textContent = '…'; session?.stop(); };
        return h('div', { class: 'dialog-body dict-body' },
          h('div', { class: 'dict-mic', 'aria-hidden': 'true', html: icon('mic', 30) }),
          text,
          h('div', { class: 'dialog-actions' },
            h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Annuler'),
            stopBtn));
      },
    });

    try {
      session = listen({ onPartial: (t) => { if (t) text.textContent = t; } });
    } catch (e) { toast(errorText(e)); end(null); return; }
    session.done.then(
      (t) => { if (t) end(t); else { toast('Je n’ai rien entendu.'); end(null); } },
      (e) => { if (e?.code !== 'cancelled') toast(errorText(e)); end(null); },
    );
  });
}
