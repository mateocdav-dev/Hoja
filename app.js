import { db, dayKey, askPersistence } from './db.js';
import { Reader } from './reader.js';
import { initIdeaSheet, renderIdeas, setToast, exportMarkdown, exportBackup, importBackup } from './ideas.js';

const $ = (s, r = document) => r.querySelector(s);
const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const FALLBACK_COLORS = ['#F6D5CF', '#DCD3FB', '#CFE3B5', '#BFD3EC', '#FFE3A3', '#E9DCCB'];

const coverUrls = new Map();
let returnTab = 'inicio';
const reader = new Reader({ onClose: () => { setTab(returnTab); renderHome(); } });

// ---------- utilidades ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = p => Math.round((p || 0) * 100);

let toastT;
function toast(msg, ms = 2400) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), ms);
}

function hash(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }

function coverHtml(b) {
  if (b.cover) {
    if (!coverUrls.has(b.id)) {
      coverUrls.set(b.id, URL.createObjectURL(new Blob([b.cover], { type: b.coverType || 'image/jpeg' })));
    }
    return `<span class="cover"><img src="${coverUrls.get(b.id)}" alt=""></span>`;
  }
  const bg = FALLBACK_COLORS[hash(b.title) % FALLBACK_COLORS.length];
  return `<span class="cover fallback" style="background:${bg}">${esc(b.title)}</span>`;
}

// ---------- navegación ----------
function setTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  returnTab = name;
  $('#ideas-menu').hidden = true;
  if (name === 'ideas') showIdeas();
  window.scrollTo(0, 0);
}

// ---------- ideas ----------
const goToIdea = async h => {
  if (!h.bookId || !(await db.get('books', h.bookId))) { toast('Ese libro ya no está en tu biblioteca'); return; }
  try { await reader.open(h.bookId, h.cfi); }
  catch (err) { console.error(err); toast('No pude abrir el libro'); }
};
const showIdeas = () => renderIdeas({ onGoTo: goToIdea }).catch(err => { console.error(err); toast('No pude cargar tus ideas'); });

$('#ideas-menu-btn').addEventListener('click', () => { $('#ideas-menu').hidden = !$('#ideas-menu').hidden; });
$('#ideas-menu').addEventListener('click', e => {
  const b = e.target.closest('[data-action]');
  if (!b) return;
  $('#ideas-menu').hidden = true;
  if (b.dataset.action === 'export-md') exportMarkdown();
  if (b.dataset.action === 'backup') exportBackup();
  if (b.dataset.action === 'restore') $('#backup-file').click();
});
$('#backup-file').addEventListener('change', async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  await importBackup(f);
  showIdeas();
  renderHome();
});
window.addEventListener('hoja:toast', e => toast(e.detail));

document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', async () => {
  const name = t.dataset.tab;
  if (name === 'leer') {
    const books = await db.all('books');
    const last = books.filter(b => b.lastOpened).sort((a, b) => b.lastOpened - a.lastOpened)[0] || books[0];
    if (!last) { toast('Primero añade un libro con el botón +'); return; }
    openBook(last.id);
    return;
  }
  setTab(name);
}));

// ---------- inicio ----------
async function renderHome() {
  let books = [], sessions = [];
  try { [books, sessions] = await Promise.all([db.all('books'), db.all('sessions')]); }
  catch (e) { console.error(e); toast('No pude leer la biblioteca de este dispositivo'); }

  const readDays = new Set(sessions.filter(s => s.seconds >= 60).map(s => s.date));
  const now = new Date();

  $('#today').textContent = now.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });

  // Semana de lunes a domingo
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  $('#week').innerHTML = DAYS.map((lbl, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    const k = dayKey(d);
    const cls = ['d', k === dayKey(now) ? 'today' : '', readDays.has(k) ? 'read' : ''].join(' ');
    return `<div class="${cls}"><span class="lbl">${lbl}</span><span class="num">${d.getDate()}</span></div>`;
  }).join('');

  // Racha: días seguidos hasta hoy (si hoy aún no lee, cuenta hasta ayer)
  let streak = 0;
  const d = new Date(now);
  if (!readDays.has(dayKey(d))) d.setDate(d.getDate() - 1);
  while (readDays.has(dayKey(d))) { streak++; d.setDate(d.getDate() - 1); }
  $('#streak-n').textContent = streak;

  // Sigue leyendo
  const last = books.filter(b => b.lastOpened).sort((a, b) => b.lastOpened - a.lastOpened)[0];
  $('#continue').innerHTML = last ? `
    <button class="continue" data-open="${last.id}">
      ${coverHtml(last)}
      <div>
        <p class="eyebrow">Sigue leyendo</p>
        <h3>${esc(last.title)}</h3>
        <p class="author">${esc(last.author)}</p>
        <div class="progress"><span class="track"><i style="width:${pct(last.percent)}%"></i></span>${pct(last.percent)}%</div>
      </div>
    </button>` : '';

  // Biblioteca
  books.sort((a, b) => (b.lastOpened || b.added) - (a.lastOpened || a.added));
  $('#lib-count').textContent = books.length ? `${books.length} ${books.length === 1 ? 'libro' : 'libros'}` : '';
  $('#library').innerHTML = books.length ? books.map(b => `
    <div class="book">
      <button class="open" data-open="${b.id}">
        ${coverHtml(b)}
        <p class="title">${esc(b.title)}</p>
      </button>
      <div class="meta"><span class="track"><i style="width:${pct(b.percent)}%"></i></span>${pct(b.percent)}%</div>
      <button class="more" data-more="${b.id}" aria-label="Opciones de ${esc(b.title)}">···</button>
    </div>`).join('') : `
    <div class="empty">
      <h3>Tu biblioteca está vacía</h3>
      <p>Descarga un libro en EPUB desde el iPhone y tócalo en el botón <b>+</b> para añadirlo. Estas bibliotecas son gratis y legales:</p>
      <div class="links">
        <a href="https://standardebooks.org/ebooks" target="_blank" rel="noopener">Standard Ebooks</a>
        <a href="https://www.gutenberg.org/browse/languages/es" target="_blank" rel="noopener">Gutenberg en español</a>
      </div>
      <button class="btn" data-add>Añadir mi primer libro</button>
    </div>`;
}

document.addEventListener('click', async e => {
  const open = e.target.closest('[data-open]');
  if (open) { openBook(open.dataset.open); return; }
  const more = e.target.closest('[data-more]');
  if (more) { deleteBook(more.dataset.more); return; }
  if (e.target.closest('[data-add]')) $('#file').click();
});

async function openBook(id) {
  try { await reader.open(id); }
  catch (err) {
    console.error(err);
    await reader.close(true);
    toast('No pude abrir este libro');
    renderHome();
  }
}

async function deleteBook(id) {
  const b = await db.get('books', id);
  if (!b) return;
  if (!confirm(`¿Quitar «${b.title}» de tu biblioteca? Tus ideas de este libro se conservan.`)) return;
  await Promise.all([db.del('books', id), db.del('files', id), db.del('locations', id)]);
  if (coverUrls.has(id)) { URL.revokeObjectURL(coverUrls.get(id)); coverUrls.delete(id); }
  toast('Libro eliminado');
  renderHome();
}

// ---------- importar EPUB ----------
$('#fab').addEventListener('click', () => $('#file').click());
$('#file').addEventListener('change', async e => {
  const files = [...e.target.files];
  e.target.value = '';
  if (!files.length) return;
  const results = [];
  for (const [i, f] of files.entries()) {
    results.push(await importBook(f, files.length > 1 ? `Añadiendo ${i + 1} de ${files.length}…` : 'Añadiendo libro…', files.length === 1));
  }
  if (files.length > 1) {
    const ok = results.filter(r => r === 'ok').length;
    const dup = results.filter(r => r === 'dup').length;
    const bad = results.filter(r => r === 'error').length;
    toast([`${ok} ${ok === 1 ? 'libro añadido' : 'libros añadidos'}`, dup && `${dup} ya estaba${dup === 1 ? '' : 'n'}`, bad && `${bad} no se pudo${bad === 1 ? '' : 'ieron'} leer`].filter(Boolean).join(' · '), 3500);
  }
  renderHome();
});

// Devuelve 'ok', 'dup' o 'error'. Si se importan varios, solo muestra el progreso y un resumen al final.
async function importBook(file, progressMsg = 'Añadiendo libro…', single = true) {
  toast(progressMsg, 10000);
  let book;
  try {
    const data = await file.arrayBuffer();
    book = ePub(data.slice(0));
    // Un archivo dañado puede dejar a epub.js esperando para siempre
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('EPUB ilegible')), 15000));
    await Promise.race([book.opened, timeout]);
    const meta = await Promise.race([book.loaded.metadata, timeout]);
    const title = (meta.title || file.name.replace(/\.epub$/i, '')).trim();
    const author = (meta.creator || '').trim();

    const existing = await db.all('books');
    if (existing.some(b => b.title === title && b.author === author)) {
      if (single) toast('Ese libro ya está en tu biblioteca');
      return 'dup';
    }

    let cover = null, coverType = null;
    try {
      const url = await book.coverUrl();
      if (url) {
        const blob = await (await fetch(url)).blob();
        cover = await blob.arrayBuffer();
        coverType = blob.type || 'image/jpeg';
      }
    } catch {}

    const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await db.put('files', { id, data });
    await db.put('books', { id, title, author, cover, coverType, added: Date.now(), percent: 0, cfi: null, lastOpened: null });
    if (single) toast(`Listo: ${title}`);
    return 'ok';
  } catch (err) {
    console.error(err);
    if (single) toast('No pude leer ese archivo. ¿Es un EPUB?');
    return 'error';
  } finally {
    try { book?.destroy(); } catch {}
  }
}

// ---------- arranque ----------
setToast(toast);
initIdeaSheet();
renderHome();
askPersistence();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !reader.isOpen) renderHome();
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW', err));
}
