// Ideas: subrayados, notas, fijadas, exportar a Obsidian y respaldo.
import { db, dayKey, setSetting } from './db.js';
import { backupFilename, createBackup, restoreBackup } from './backup.js';

export const HIGHLIGHT = '#8F9C70';
const CARD_COLORS = ['#F6D5CF', '#DCD3FB', '#CFE3B5', '#BFD3EC', '#FFE3A3', '#E9DCCB'];

const $ = (s, r = document) => r.querySelector(s);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hash = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
export const tagsFrom = text => [...new Set((String(text || '').match(/#[\p{L}\p{N}_-]+/gu) || []).map(t => t.slice(1).toLowerCase()))];
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

let toastFn = () => {};
export function setToast(fn) { toastFn = fn; }

// ---------- datos ----------
export async function addHighlight({ book, cfi, text, chapter, note = '' }) {
  const h = {
    id: newId(), bookId: book.id, bookTitle: book.title, bookAuthor: book.author || '',
    cfi, text: text.trim(), chapter: chapter || '', note: note.trim(), tags: tagsFrom(note),
    pinned: false, created: Date.now(), updated: Date.now(),
  };
  await db.put('highlights', h);
  return h;
}

export async function highlightsFor(bookId) {
  return (await db.all('highlights')).filter(h => h.bookId === bookId);
}

// ---------- hoja de detalle (sirve en el lector y en Ideas) ----------
let sheetCtx = null;

export function openIdeaSheet(h, { onChange, onGoTo, onDelete } = {}) {
  sheetCtx = { h, onChange, onGoTo, onDelete };
  $('#idea-quote').textContent = h.text;
  $('#idea-source').textContent = [h.bookTitle, h.chapter].filter(Boolean).join(' · ');
  $('#idea-note').value = h.note || '';
  $('#idea-pin').classList.toggle('on', !!h.pinned);
  $('#idea-pin span').textContent = h.pinned ? 'Fijada' : 'Fijar';
  $('#idea-goto').hidden = !onGoTo;
  $('#idea-modal').hidden = false;
}

function closeIdeaSheet() {
  $('#idea-modal').hidden = true;
  $('#idea-note').blur();
  sheetCtx = null;
}

async function saveSheet({ close = true } = {}) {
  if (!sheetCtx) return;
  const h = sheetCtx.h;
  const note = $('#idea-note').value.trim();
  h.note = note;
  h.tags = tagsFrom(note);
  h.updated = Date.now();
  await db.put('highlights', h);
  sheetCtx.onChange?.(h);
  if (close) { closeIdeaSheet(); toastFn('Idea guardada'); }
}

export function initIdeaSheet() {
  $('#idea-backdrop').addEventListener('click', () => saveSheet());
  $('#idea-save').addEventListener('click', () => saveSheet());
  $('#idea-pin').addEventListener('click', async () => {
    if (!sheetCtx) return;
    sheetCtx.h.pinned = !sheetCtx.h.pinned;
    $('#idea-pin').classList.toggle('on', sheetCtx.h.pinned);
    $('#idea-pin span').textContent = sheetCtx.h.pinned ? 'Fijada' : 'Fijar';
    await saveSheet({ close: false });
  });
  $('#idea-goto').addEventListener('click', async () => {
    if (!sheetCtx) return;
    const { h, onGoTo } = sheetCtx;
    await saveSheet({ close: false });
    closeIdeaSheet();
    onGoTo?.(h);
  });
  $('#idea-delete').addEventListener('click', async () => {
    if (!sheetCtx) return;
    if (!confirm('¿Borrar este subrayado y su nota?')) return;
    const { h, onDelete } = sheetCtx;
    await db.del('highlights', h.id);
    closeIdeaSheet();
    onDelete?.(h);
    toastFn('Subrayado borrado');
  });
}

// ---------- pestaña Ideas ----------
let filter = 'all';

export async function renderIdeas({ onGoTo } = {}) {
  const all = (await db.all('highlights')).sort((a, b) => b.created - a.created);
  const books = [...new Map(all.map(h => [h.bookTitle, h.bookTitle])).keys()];
  if (filter !== 'all' && filter !== 'pinned' && !books.includes(filter)) filter = 'all';

  $('#ideas-count').textContent = all.length ? `${all.length} ${all.length === 1 ? 'idea' : 'ideas'}` : '';
  $('#ideas-filters').innerHTML = [
    ['all', 'Todas'], ['pinned', 'Fijadas'], ...books.map(b => [b, b]),
  ].map(([k, label]) => `<button class="fchip ${filter === k ? 'on' : ''}" data-filter="${esc(k)}">${esc(label)}</button>`).join('');

  let list = all;
  if (filter === 'pinned') list = all.filter(h => h.pinned);
  else if (filter !== 'all') list = all.filter(h => h.bookTitle === filter);
  list = [...list.filter(h => h.pinned), ...list.filter(h => !h.pinned)];

  $('#ideas-list').innerHTML = list.length ? list.map(h => `
    <button class="idea" data-idea="${h.id}" style="background:${CARD_COLORS[hash(h.bookTitle) % CARD_COLORS.length]}">
      <span class="idea-top"><span class="idea-book">${esc(h.bookTitle)}</span>${h.pinned ? '<svg class="pin" viewBox="0 0 24 24"><path d="M15 3 21 9l-4 1-4 4 1 5-2 1-4-4-4 4-1-1 4-4-4-4 1-2 5 1 4-4Z"/></svg>' : ''}</span>
      <span class="idea-quote">“${esc(h.text)}”</span>
      ${h.note ? `<span class="idea-note">${esc(h.note)}</span>` : ''}
      <span class="idea-date">${new Date(h.created).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}${h.chapter ? ' · ' + esc(h.chapter) : ''}</span>
    </button>`).join('') : `
    <div class="soon soon-lilac">
      <h3>${all.length ? 'Nada por aquí' : 'Tus frases vivirán aquí'}</h3>
      <p>${all.length ? 'No hay ideas con este filtro.' : 'Mientras lees, mantén el dedo sobre una frase y selecciónala. Abajo aparecerán <b>Resaltar</b> y <b>Nota</b>.'}</p>
    </div>`;

  $('#ideas-filters').onclick = e => {
    const b = e.target.closest('[data-filter]');
    if (!b) return;
    filter = b.dataset.filter;
    renderIdeas({ onGoTo });
  };
  $('#ideas-list').onclick = async e => {
    const card = e.target.closest('[data-idea]');
    if (!card) return;
    const h = await db.get('highlights', card.dataset.idea);
    if (!h) return;
    const refresh = () => renderIdeas({ onGoTo });
    openIdeaSheet(h, { onChange: refresh, onDelete: refresh, onGoTo: h.bookId ? onGoTo : null });
  };
}

// ---------- exportar a Obsidian ----------
const slug = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'libro';
const quote = t => t.split('\n').map(l => '> ' + l).join('\n');

function bookMarkdown(title, author, hs) {
  const block = h => [
    quote(h.text),
    h.chapter ? `> — *${h.chapter}*` : '',
    h.note ? `\n${h.note}` : '',
  ].filter(Boolean).join('\n');
  const pinned = hs.filter(h => h.pinned), rest = hs.filter(h => !h.pinned);
  const tags = [...new Set(hs.flatMap(h => h.tags || []))];
  return [
    '---',
    'tipo: lectura',
    `libro: "${title.replace(/"/g, "'")}"`,
    `autor: "${(author || '').replace(/"/g, "'")}"`,
    `exportado: ${dayKey()}`,
    `tags: [lectura${tags.length ? ', ' + tags.join(', ') : ''}]`,
    '---',
    `# ${title}`,
    author ? `*${author}*\n` : '',
    pinned.length ? '## Ideas fijadas\n\n' + pinned.map(block).join('\n\n') + '\n' : '',
    rest.length ? '## Subrayados\n\n' + rest.map(block).join('\n\n') : '',
    '',
  ].join('\n');
}

export async function exportMarkdown() {
  const all = (await db.all('highlights')).sort((a, b) => a.created - b.created);
  if (!all.length) { toastFn('Aún no tienes ideas para exportar'); return; }
  const byBook = new Map();
  for (const h of all) {
    if (!byBook.has(h.bookTitle)) byBook.set(h.bookTitle, { author: h.bookAuthor, hs: [] });
    byBook.get(h.bookTitle).hs.push(h);
  }
  const files = [...byBook].map(([title, { author, hs }]) =>
    new File([bookMarkdown(title, author, hs)], `${slug(title)}.md`, { type: 'text/markdown' }));
  await shareOrDownload(files, 'Ideas de Hoja');
}

// ---------- respaldo ----------
let backupBusy = false;
export async function exportBackup() {
  if (backupBusy) return;
  backupBusy = true;
  try {
    toastFn('Preparando libros y datos…', 10000);
    const blob = await createBackup();
    const file = new File([blob], backupFilename(), { type: 'application/zip' });
    toastFn('Respaldo listo', 1200);
    // La preparación de un libro grande puede consumir el gesto inicial que exige iOS para compartir.
    // Se pide un segundo toque solo cuando el archivo ya está listo.
    await offerBackup(file);
  } catch (e) {
    console.error(e);
    toastFn('No pude preparar el respaldo. Tus datos siguen en Hoja.', 5000);
  } finally { backupBusy = false; }
}

async function offerBackup(file) {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'backup-dialog';
    dialog.setAttribute('aria-labelledby', 'backup-title');
    dialog.setAttribute('aria-describedby', 'backup-description');
    dialog.innerHTML = `<h3 id="backup-title">Tu respaldo está listo</h3><p id="backup-description">Incluye tus libros, portadas, ideas y avance (${(file.size / 1048576).toFixed(1)} MB). Guárdalo en Archivos o en Drive.</p><div class="data-actions"><button class="pill" data-cancel>Cancelar</button><button class="btn" data-save>Guardar archivo</button></div>`;
    const close = () => { dialog.close(); dialog.remove(); resolve(); };
    dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
    dialog.querySelector('[data-cancel]').onclick = close;
    dialog.querySelector('[data-save]').onclick = async e => {
      e.target.disabled = true;
      try {
        if (await shareOrDownload([file], 'Respaldo de Hoja')) {
          await setSetting('lastBackup', Date.now());
          toastFn('Respaldo enviado para guardar');
          close();
        } else e.target.disabled = false;
      } catch (error) {
        console.error(error);
        toastFn('No pude guardar el archivo. Inténtalo de nuevo.');
        e.target.disabled = false;
      }
    };
    document.body.appendChild(dialog);
    dialog.showModal();
  });
}

export async function importBackup(file) {
  if (backupBusy) return;
  backupBusy = true;
  try {
    toastFn('Restaurando libros y datos…', 10000);
    const result = await restoreBackup(file);
    toastFn(result.legacy
      ? `Respaldo antiguo restaurado: ${result.ideas} ideas. Los libros se añaden por separado.`
      : `Respaldo restaurado: ${result.books} ${result.books === 1 ? 'libro' : 'libros'} y ${result.ideas} ${result.ideas === 1 ? 'idea' : 'ideas'}`, 5000);
  } catch (e) {
    console.error(e);
    toastFn('No pude restaurar el respaldo. Revisa el archivo y el espacio disponible.', 5000);
  } finally { backupBusy = false; }
}

async function shareOrDownload(files, title) {
  try {
    if (navigator.canShare?.({ files })) {
      // Sin título: el iPhone lo guardaría como un .txt aparte junto al archivo.
      await navigator.share({ files });
      return true;
    }
  } catch (e) {
    if (e.name === 'AbortError') return false;
  }
  for (const f of files) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(f);
    a.download = f.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  return true;
}
