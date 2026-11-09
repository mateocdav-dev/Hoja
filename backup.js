// Respaldo completo: metadatos JSON y archivos binarios sin convertirlos a base64.
import { db } from './db.js';
import { initializeProgress, mergeSession } from './progress.js';

export function backupFilename(date = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  const days = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  return `hoja-respaldo-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${days[date.getDay()]}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}.zip`;
}

const STORES = ['books', 'files', 'locations', 'highlights', 'bookmarks', 'sessions', 'settings'];
const validId = id => typeof id === 'string' && id.length > 0 && id.length < 200;
const fail = () => { throw new Error('El respaldo está incompleto o tiene datos inválidos'); };
const required = (ok) => { if (!ok) fail(); };
const goalValid = n => [5, 10, 15, 20, 30].includes(n);
const sameBook = (a, b) => a.title === b.title && (a.author || '') === (b.author || '');

export async function createBackup() {
  await initializeProgress();
  const snapshot = await db.snapshot(STORES);
  const zip = new JSZip();
  const files = new Map(snapshot.files.map(f => [f.id, f]));
  const books = snapshot.books.map((b, i) => {
    const { cover, ...meta } = b;
    const file = files.get(b.id);
    if (!file?.data?.byteLength) throw new Error(`No se encontró el archivo de «${b.title}»`);
    const filePath = `books/${i}.epub`;
    zip.file(filePath, file.data);
    let coverPath;
    if (cover) { coverPath = `covers/${i}.bin`; zip.file(coverPath, cover); }
    return { ...meta, filePath, coverPath };
  });
  const data = {
    app: 'hoja', version: 2, exported: new Date().toISOString(), books,
    locations: snapshot.locations.filter(l => files.has(l.id)),
    highlights: snapshot.highlights, bookmarks: snapshot.bookmarks, sessions: snapshot.sessions,
    settings: snapshot.settings.filter(s => !['lastBackup', 'backupSnooze'].includes(s.key)),
  };
  zip.file('hoja.json', JSON.stringify(data));
  return zip.generateAsync({ type: 'blob', compression: 'STORE', mimeType: 'application/zip' });
}

export function validateBackup(data) {
  required(data && data.app === 'hoja' && [1, 2].includes(data.version));
  for (const name of ['books', 'highlights', 'sessions', 'settings']) required(Array.isArray(data[name]));
  for (const name of ['bookmarks', 'locations']) required(data[name] === undefined || Array.isArray(data[name]));
  const ids = new Set();
  for (const b of data.books) {
    required(validId(b.id) && !ids.has(b.id) && typeof b.title === 'string' && typeof (b.author || '') === 'string');
    ids.add(b.id);
    required(b.percent == null || (Number.isFinite(b.percent) && b.percent >= 0 && b.percent <= 1));
    required(b.cfi == null || typeof b.cfi === 'string');
    required(b.lastOpened == null || Number.isFinite(b.lastOpened));
    if (data.version === 2) required(typeof b.filePath === 'string' && b.filePath.startsWith('books/'));
  }
  for (const name of ['highlights', 'bookmarks']) {
    const seen = new Set();
    for (const h of data[name] || []) {
      required(validId(h.id) && !seen.has(h.id) && typeof h.cfi === 'string' && typeof h.bookTitle === 'string');
      seen.add(h.id);
      if (name === 'highlights') {
        required(typeof h.text === 'string' && typeof (h.note || '') === 'string');
        required(h.tags === undefined || (Array.isArray(h.tags) && h.tags.every(t => typeof t === 'string')));
      }
    }
  }
  for (const s of data.sessions) {
    required(/^\d{4}-\d{2}-\d{2}$/.test(s.date) && Number.isFinite(s.seconds) && s.seconds >= 0);
    required(Array.isArray(s.books) && s.books.every(validId));
    required(s.goalMin === undefined || goalValid(s.goalMin));
    required(s.completed === undefined || typeof s.completed === 'boolean');
  }
  for (const s of data.settings) {
    required(typeof s.key === 'string');
    if (s.key === 'dailyGoal') required(goalValid(s.value));
    if (s.key === 'reader') {
      required(s.value && typeof s.value === 'object');
      for (const key of ['theme', 'lightTheme', 'darkTheme']) {
        required(s.value[key] === undefined || ['crema', 'blanco', 'noche'].includes(s.value[key]));
      }
      required(s.value.fontSize === undefined || (Number.isFinite(s.value.fontSize) && s.value.fontSize >= 80 && s.value.fontSize <= 160));
    }
  }
  for (const l of data.locations || []) required(validId(l.id) && typeof l.data === 'string');
  return data;
}

export async function readBackup(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let zip, data;
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
    const manifest = zip.file('hoja.json');
    if (!manifest) fail();
    data = JSON.parse(await manifest.async('string'));
    required(data.version === 2);
  } else {
    data = JSON.parse(new TextDecoder().decode(bytes));
    required(data.version === 1);
  }
  validateBackup(data);
  const files = [], covers = new Map();
  if (zip) for (const b of data.books) {
    const entry = zip.file(b.filePath);
    if (!entry) fail();
    const content = await entry.async('arraybuffer');
    if (!content.byteLength) fail();
    files.push({ id: b.id, data: content });
    if (b.coverPath) {
      const cover = zip.file(b.coverPath);
      if (!cover) fail();
      covers.set(b.id, await cover.async('arraybuffer'));
    }
  }
  return { data, files, covers };
}

// Construye el lote completo antes de escribir. Mantiene los libros y avances locales más recientes.
export function planRestore({ data, files, covers }, current) {
  const records = [], mapped = new Map(), books = [...current.books];
  const incomingFiles = new Map(files.map(f => [f.id, f]));
  const localFiles = new Set(current.files.map(f => f.id));
  for (const b of data.books) {
    const local = books.find(x => x.id === b.id && sameBook(x, b)) || books.find(x => sameBook(x, b));
    if (!local && data.version === 1) continue; // El JSON antiguo no contiene EPUB.
    const id = local?.id || (books.some(x => x.id === b.id) ? crypto.randomUUID() : b.id);
    mapped.set(b.id, id);
    const { filePath, coverPath, cover, ...meta } = b;
    const newer = !local || (b.lastOpened || 0) > (local.lastOpened || 0);
    const rec = local ? { ...local } : { ...meta, id };
    if (local && newer) Object.assign(rec, { cfi: b.cfi, percent: b.percent, lastOpened: b.lastOpened });
    if (!rec.cover && covers.has(b.id)) { rec.cover = covers.get(b.id); rec.coverType = b.coverType; }
    records.push({ store: 'books', value: rec });
    if (!local) books.push(rec);
    if (!localFiles.has(id) && incomingFiles.has(b.id)) {
      records.push({ store: 'files', value: { ...incomingFiles.get(b.id), id } });
      localFiles.add(id);
    }
    if (!current.locations.some(l => l.id === id)) {
      const locations = data.locations?.find(l => l.id === b.id);
      if (locations) records.push({ store: 'locations', value: { ...locations, id } });
    }
  }
  const resolveBook = h => mapped.get(h.bookId) || books.find(b => sameBook(b, { title: h.bookTitle, author: h.bookAuthor }))?.id || null;
  for (const name of ['highlights', 'bookmarks']) for (const h of data[name] || []) {
    const local = current[name].find(x => x.id === h.id);
    if (local && (local.updated || local.created || 0) > (h.updated || h.created || 0)) continue;
    records.push({ store: name, value: { ...h, bookId: resolveBook(h) } });
  }
  const goal = data.settings.find(s => s.key === 'dailyGoal')?.value || 10;
  const sessions = new Map(current.sessions.map(s => [s.date, s]));
  for (const s of data.sessions) {
    const incoming = { ...s, books: s.books.map(id => mapped.get(id) || id) };
    sessions.set(s.date, mergeSession(sessions.get(s.date), incoming, goal));
  }
  for (const s of sessions.values()) records.push({ store: 'sessions', value: s });
  for (const s of data.settings) if (['dailyGoal', 'reader'].includes(s.key)) records.push({ store: 'settings', value: s });
  return records;
}

export async function restoreBackup(file) {
  const parsed = await readBackup(file); // Validar y leer todos los binarios antes de tocar datos.
  await initializeProgress();
  const current = await db.snapshot(STORES);
  await db.batch(planRestore(parsed, current));
  return { books: parsed.data.version === 2 ? parsed.data.books.length : 0, ideas: parsed.data.highlights.length, legacy: parsed.data.version === 1 };
}
