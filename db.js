// Almacenamiento local en IndexedDB. Todo vive en el teléfono.
// books:     metadatos ligeros (título, autor, portada, avance)
// files:     el EPUB completo (ArrayBuffer), separado para que la biblioteca cargue rápido
// locations: ubicaciones precalculadas del libro (para el % de avance)
// highlights, sessions, settings
const DB_NAME = 'hoja';
const VERSION = 2;
const STORES = {
  books: { keyPath: 'id' },
  files: { keyPath: 'id' },
  locations: { keyPath: 'id' },
  highlights: { keyPath: 'id', index: 'bookId' },
  bookmarks: { keyPath: 'id', index: 'bookId' },
  sessions: { keyPath: 'date' },
  settings: { keyPath: 'key' },
};

let dbPromise;
function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      for (const [name, cfg] of Object.entries(STORES)) {
        if (d.objectStoreNames.contains(name)) continue;
        const store = d.createObjectStore(name, { keyPath: cfg.keyPath });
        if (cfg.index) store.createIndex(cfg.index, cfg.index);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run(store, mode, fn) {
  const d = await open();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const db = {
  get: (store, key) => run(store, 'readonly', s => s.get(key)),
  all: (store) => run(store, 'readonly', s => s.getAll()),
  put: (store, value) => run(store, 'readwrite', s => s.put(value)),
  del: (store, key) => run(store, 'readwrite', s => s.delete(key)),
  // Todas las escrituras del respaldo se confirman juntas o se revierten juntas.
  async batch(records) {
    if (!records.length) return;
    const d = await open();
    return new Promise((resolve, reject) => {
      const t = d.transaction([...new Set(records.map(r => r.store))], 'readwrite');
      t.oncomplete = () => resolve();
      t.onerror = t.onabort = () => reject(t.error || new Error('No se pudieron guardar los datos'));
      try { for (const r of records) t.objectStore(r.store).put(r.value); }
      catch (e) { t.abort(); reject(e); }
    });
  },
  async snapshot(stores) {
    const d = await open();
    return new Promise((resolve, reject) => {
      const t = d.transaction(stores, 'readonly'), result = {};
      for (const name of stores) {
        const req = t.objectStore(name).getAll();
        req.onsuccess = () => { result[name] = req.result; };
      }
      t.oncomplete = () => resolve(result);
      t.onerror = t.onabort = () => reject(t.error);
    });
  },
  async update(store, key, change) {
    const d = await open();
    return new Promise((resolve, reject) => {
      const t = d.transaction(store, 'readwrite'), s = t.objectStore(store);
      let value;
      const req = s.get(key);
      req.onsuccess = () => {
        try { value = change(req.result); if (value) s.put(value); }
        catch (e) { t.abort(); reject(e); }
      };
      t.oncomplete = () => resolve(value);
      t.onerror = t.onabort = () => reject(t.error || new Error('No se pudo guardar'));
    });
  },
};

// Pide al navegador que no borre los datos (iOS lo respeta mejor si la app está instalada).
export async function askPersistence() {
  try { if (navigator.storage?.persist) await navigator.storage.persist(); } catch {}
}

export function dayKey(d = new Date()) {
  const z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

export async function getSetting(key, fallback) {
  try { const r = await db.get('settings', key); return r ? r.value : fallback; } catch { return fallback; }
}
export async function setSetting(key, value) {
  try { await db.put('settings', { key, value }); } catch {}
}
