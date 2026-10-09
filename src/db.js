// Couche IndexedDB minimale. Tout est stocké sur l'appareil.
// Chaque enregistrement porte updatedAt / deletedAt : prêt pour une synchronisation ultérieure.

const NAME = 'plume';
const VERSION = 1;
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('notes')) {
        const s = d.createObjectStore('notes', { keyPath: 'id' });
        s.createIndex('updatedAt', 'updatedAt');
      }
      if (!d.objectStoreNames.contains('folders')) d.createObjectStore('folders', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('attachments')) {
        const s = d.createObjectStore('attachments', { keyPath: 'id' });
        s.createIndex('noteId', 'noteId');
      }
      if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function run(storeNames, mode, fn) {
  return open().then(
    (d) =>
      new Promise((resolve, reject) => {
        const tx = d.transaction(storeNames, mode);
        let result;
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
        result = fn(tx);
      })
  );
}

const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export const db = {
  open,
  async getAll(store) {
    const d = await open();
    return reqP(d.transaction(store).objectStore(store).getAll());
  },
  async get(store, id) {
    const d = await open();
    return reqP(d.transaction(store).objectStore(store).get(id));
  },
  put(store, obj) {
    return run([store], 'readwrite', (tx) => { tx.objectStore(store).put(obj); });
  },
  putMany(store, objs) {
    return run([store], 'readwrite', (tx) => { const s = tx.objectStore(store); objs.forEach((o) => s.put(o)); });
  },
  del(store, id) {
    return run([store], 'readwrite', (tx) => { tx.objectStore(store).delete(id); });
  },
  delMany(store, ids) {
    return run([store], 'readwrite', (tx) => { const s = tx.objectStore(store); ids.forEach((i) => s.delete(i)); });
  },
  putAttachment(meta, blob) {
    return run(['attachments', 'blobs'], 'readwrite', (tx) => {
      tx.objectStore('attachments').put(meta);
      tx.objectStore('blobs').put({ id: meta.id, blob });
    });
  },
  deleteAttachments(ids) {
    return run(['attachments', 'blobs'], 'readwrite', (tx) => {
      ids.forEach((id) => { tx.objectStore('attachments').delete(id); tx.objectStore('blobs').delete(id); });
    });
  },
  async getBlob(id) {
    const d = await open();
    const rec = await reqP(d.transaction('blobs').objectStore('blobs').get(id));
    return rec ? rec.blob : null;
  },
};
