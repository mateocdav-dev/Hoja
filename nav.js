// Navegación del lector: índice de capítulos, marcadores y búsqueda dentro del libro.
import { db } from './db.js';
import { esc } from './ideas.js';

const $ = s => document.querySelector(s);
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const fold = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function installNav(reader) {
  let pane = 'toc';
  let searchToken = 0;

  const show = name => {
    pane = name;
    document.querySelectorAll('#nav-seg button').forEach(b => b.classList.toggle('on', b.dataset.pane === name));
    document.querySelectorAll('.nav-pane').forEach(p => { p.hidden = p.dataset.pane !== name; });
    if (name === 'toc') renderToc();
    if (name === 'marks') renderMarks();
    if (name === 'search') setTimeout(() => $('#search-q').focus(), 50);
  };

  reader.toggleNav = open => {
    $('#r-nav-sheet').hidden = !open;
    $('#r-backdrop').hidden = !open && $('#r-sheet').hidden;
    if (open) show(pane);
    else $('#search-q').blur();
  };

  const go = async target => {
    reader.toggleNav(false);
    try { await reader.rendition.display(target); } catch (e) { console.warn('No se pudo ir', e); }
  };

  // ---------- índice ----------
  function renderToc() {
    const items = reader.toc || [];
    $('#nav-toc').innerHTML = items.length ? items.map((i, n) => `
      <button class="nav-item ${reader.chapter && i.label.trim() === reader.chapter ? 'on' : ''}" data-toc="${n}" style="padding-left:${14 + i.depth * 16}px">
        ${esc(i.label.trim() || 'Sin título')}
      </button>`).join('') : '<p class="nav-empty">Este libro no trae índice.</p>';
    $('#nav-toc .on')?.scrollIntoView({ block: 'center' });
  }
  $('#nav-toc').addEventListener('click', e => {
    const b = e.target.closest('[data-toc]');
    if (b) go(reader.toc[+b.dataset.toc].href);
  });

  // ---------- marcadores ----------
  reader.loadBookmarks = async () => {
    reader.bookmarks = (await db.all('bookmarks')).filter(b => b.bookId === reader.id).sort((a, b) => (a.percent || 0) - (b.percent || 0));
  };
  reader.isBookmarked = () => !!reader.cfi && (reader.bookmarks || []).some(b => b.cfi === reader.cfi);
  reader.paintRibbon = () => {
    const on = reader.isBookmarked();
    $('#r-ribbon').hidden = !on;
    $('#mark-toggle').textContent = on ? 'Quitar marcador de esta página' : 'Marcar esta página';
  };

  async function pageSnippet() {
    try {
      const range = await reader.book.getRange(reader.cfi);
      const node = range.startContainer;
      const text = (node.textContent || '').slice(range.startOffset).replace(/\s+/g, ' ').trim();
      if (text.length > 20) return text.slice(0, 110);
      return (node.parentElement?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 110);
    } catch { return ''; }
  }

  $('#mark-toggle').addEventListener('click', async () => {
    if (!reader.cfi) return;
    const existing = (reader.bookmarks || []).find(b => b.cfi === reader.cfi);
    if (existing) await db.del('bookmarks', existing.id);
    else await db.put('bookmarks', {
      id: newId(), bookId: reader.id, cfi: reader.cfi, percent: reader.percent ?? 0,
      bookTitle: reader.rec.title, bookAuthor: reader.rec.author || '',
      chapter: reader.chapter || '', snippet: await pageSnippet(), created: Date.now(),
    });
    await reader.loadBookmarks();
    reader.paintRibbon();
    renderMarks();
  });

  function renderMarks() {
    const list = reader.bookmarks || [];
    $('#nav-marks').innerHTML = list.length ? list.map(b => `
      <div class="nav-mark">
        <button class="nav-item" data-mark="${b.id}">
          <span class="nav-meta">${Math.round((b.percent || 0) * 100)}%${b.chapter ? ' · ' + esc(b.chapter) : ''}</span>
          <span class="nav-snip">${esc(b.snippet || 'Página marcada')}…</span>
        </button>
        <button class="nav-del" data-del="${b.id}" aria-label="Borrar marcador">×</button>
      </div>`).join('') : '<p class="nav-empty">Aún no tienes marcadores en este libro.</p>';
    reader.paintRibbon();
  }
  $('#nav-marks').addEventListener('click', async e => {
    const del = e.target.closest('[data-del]');
    if (del) {
      await db.del('bookmarks', del.dataset.del);
      await reader.loadBookmarks();
      renderMarks();
      return;
    }
    const m = e.target.closest('[data-mark]');
    if (m) go(reader.bookmarks.find(b => b.id === m.dataset.mark).cfi);
  });

  // ---------- búsqueda ----------
  $('#search-form').addEventListener('submit', async e => {
    e.preventDefault();
    const q = $('#search-q').value.trim();
    $('#search-q').blur();
    if (q.length < 2) return;
    const token = ++searchToken;
    const results = [];
    const items = reader.book.spine.spineItems;
    $('#nav-results').innerHTML = '';
    for (const [i, item] of items.entries()) {
      if (token !== searchToken || !reader.book) return;
      $('#search-status').textContent = `Buscando… ${Math.round(((i + 1) / items.length) * 100)}%`;
      try {
        await item.load(reader.book.load.bind(reader.book));
        results.push(...findIn(item, q));
      } catch {} finally { try { item.unload(); } catch {} }
      if (results.length >= 150) break;
    }
    if (token !== searchToken) return;
    $('#search-status').textContent = results.length
      ? `${results.length >= 150 ? 'Más de 150' : results.length} ${results.length === 1 ? 'resultado' : 'resultados'}`
      : 'Sin resultados';
    const qf = fold(q);
    $('#nav-results').innerHTML = results.map((r, n) => {
      const ex = r.excerpt;
      const at = fold(ex).indexOf(qf);
      const shown = at >= 0
        ? esc(ex.slice(0, at)) + '<mark>' + esc(ex.slice(at, at + q.length)) + '</mark>' + esc(ex.slice(at + q.length))
        : esc(ex);
      return `<button class="nav-item" data-res="${n}"><span class="nav-snip">…${shown}…</span></button>`;
    }).join('');
    reader.searchResults = results;
  });
  $('#nav-results').addEventListener('click', async e => {
    const b = e.target.closest('[data-res]');
    if (!b) return;
    const r = reader.searchResults[+b.dataset.res];
    await go(r.cfi);
    try {
      reader.rendition.annotations.highlight(r.cfi, {}, () => {}, 'hoja-search', { fill: '#F5B71F', 'fill-opacity': '0.5', 'mix-blend-mode': 'multiply' });
      setTimeout(() => { try { reader.rendition.annotations.remove(r.cfi, 'highlight'); reader.repaintAll(); } catch {} }, 2500);
    } catch {}
  });

  // Busca sin distinguir mayúsculas ni tildes ("habito" encuentra "hábito")
  function findIn(section, q) {
    const out = [];
    const qf = fold(q);
    const doc = section.document;
    if (!doc?.body) return out;
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent;
      const tf = fold(text);
      let pos = tf.indexOf(qf);
      while (pos !== -1) {
        try {
          const range = doc.createRange();
          range.setStart(node, pos);
          range.setEnd(node, pos + q.length);
          const cfi = section.cfiFromRange(range);
          const from = Math.max(0, pos - 50);
          out.push({ cfi, excerpt: text.slice(from, pos + q.length + 70).replace(/\s+/g, ' ').trim() });
        } catch {}
        if (out.length >= 30) return out; // máximo por capítulo
        pos = tf.indexOf(qf, pos + qf.length);
      }
    }
    return out;
  }

  document.querySelectorAll('#nav-seg button').forEach(b => b.addEventListener('click', () => show(b.dataset.pane)));
  $('#r-nav').addEventListener('click', () => reader.toggleNav(true));
}
