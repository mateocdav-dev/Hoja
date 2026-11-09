// Lector EPUB sobre epub.js: paginado, % de avance, temas, tamaño de letra y tiempo leído.
import { db, dayKey, getSetting, setSetting } from './db.js';
import { HIGHLIGHT, addHighlight, highlightsFor, openIdeaSheet } from './ideas.js';
import { isDark, appBg } from './theme.js';
import { installNav } from './nav.js';

const THEMES = {
  crema:  { bg: '#F2EFEA', fg: '#2A2622', link: '#9A6B1E' },
  blanco: { bg: '#FFFFFF', fg: '#1E1E1E', link: '#9A6B1E' },
  noche:  { bg: '#131F24', fg: '#DCE6EC', link: '#B9C49A' },
};
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Literata:opsz,wght@7..72,400;7..72,600&display=swap';
const IDLE_LIMIT = 5 * 60 * 1000; // sin pasar página en 5 min ya no cuenta como lectura

const $ = s => document.querySelector(s);

export class Reader {
  constructor({ onClose }) {
    this.onClose = onClose;
    this.el = $('#reader');
    this.prefs = { lightTheme: 'crema', darkTheme: 'noche', fontSize: 100 };
    // Al cambiar el modo de la app, el lector cambia al tema elegido para ese modo
    window.addEventListener('hoja:mode', () => { if (this.rendition) this.applyTheme(); else this.applyChrome(); });
    this.pendingSeconds = 0;

    $('#r-back').addEventListener('click', () => this.close());
    $('#r-settings').addEventListener('click', () => this.toggleSheet(true));
    $('#r-backdrop').addEventListener('click', () => { this.toggleSheet(false); this.toggleNav(false); });
    $('#fs-down').addEventListener('click', () => this.setFontSize(this.prefs.fontSize - 10));
    $('#fs-up').addEventListener('click', () => this.setFontSize(this.prefs.fontSize + 10));
    document.querySelectorAll('.sw').forEach(b =>
      b.addEventListener('click', () => this.setTheme(b.dataset.theme)));
    $('#sel-hl').addEventListener('click', () => this.saveSelection(false));
    $('#r-prev').addEventListener('click', () => this.prev());
    $('#r-next').addEventListener('click', () => this.next());
    $('#sel-note').addEventListener('click', () => this.saveSelection(true));

    installNav(this);
    document.addEventListener('keydown', e => this.onKey(e));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') { this.flushTime(); this.saveProgress(); }
    });
  }

  get isOpen() { return !this.el.hidden; }

  async open(id, cfi) {
    if (this.isOpen) await this.close(true);
    const [rec, file] = await Promise.all([db.get('books', id), db.get('files', id)]);
    if (!rec || !file) throw new Error('Libro no encontrado');

    this.id = id;
    this.rec = rec;
    const savedPrefs = await getSetting('reader', {});
    this.prefs = {
      lightTheme: savedPrefs.lightTheme || (savedPrefs.theme && savedPrefs.theme !== 'noche' ? savedPrefs.theme : 'crema'),
      darkTheme: savedPrefs.darkTheme || 'noche',
      fontSize: savedPrefs.fontSize || 100,
    };
    this.el.hidden = false;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('reading');
    $('#r-title').textContent = rec.title;
    $('#r-loading').hidden = false;
    this.paintProgress(rec.percent || 0, '');
    this.applyChrome();

    rec.lastOpened = Date.now();
    db.put('books', rec);

    this.book = ePub(file.data.slice(0));
    this.rendition = this.book.renderTo('r-view', {
      width: '100%', height: '100%',
      flow: 'paginated', spread: 'none',
      // Safari (iPhone) no entrega toques, deslizar ni selección a un iframe aislado sin scripts.
      // Se permite, y por seguridad se eliminan los scripts del libro antes de mostrarlo (abajo).
      allowScriptedContent: true,
    });
    this.book.spine.hooks.serialize.register((output, section) => {
      section.output = output
        .replace(/<script\b[\s\S]*?<\/script>/gi, '')
        .replace(/<script\b[^>]*\/>/gi, '')
        .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, '');
    });

    for (const [name, t] of Object.entries(THEMES)) {
      this.rendition.themes.register(name, {
        'html, body': { background: `${t.bg} !important`, color: `${t.fg} !important` },
        'body': {
          'font-family': "'Literata', Georgia, serif !important",
          'line-height': '1.62 !important',
          '-webkit-text-size-adjust': '100%',
          'touch-action': 'manipulation',
        },
        'p, li, div, span, blockquote, h1, h2, h3, h4, h5, h6': { color: 'inherit !important' },
        'p': { 'text-align': 'left' },
        'a': { color: `${t.link} !important` },
        'img': { 'max-width': '100% !important' },
      });
    }
    this.rendition.hooks.content.register(contents => {
      contents.addStylesheet(FONT_CSS).catch?.(() => {});
      this.attachTouch(contents);
      // Si el usuario deselecciona, se oculta la barra de subrayar
      contents.document.addEventListener('selectionchange', () => {
        clearTimeout(this.selT);
        this.selT = setTimeout(() => {
          const s = contents.window.getSelection();
          if (!s || !s.toString().trim()) this.showSelBar(false);
        }, 250);
      });
    });
    this.rendition.on('selected', (cfiRange, contents) => {
      const text = contents.window.getSelection()?.toString() || '';
      if (!text.trim()) return;
      this.selection = { cfi: cfiRange, text, contents };
      this.showSelBar(true);
    });

    this.bindGestures();
    this.rendition.on('relocated', loc => this.onRelocated(loc));

    this.rendition.themes.select(this.theme);
    this.rendition.themes.fontSize(this.prefs.fontSize + '%');

    await this.book.ready;
    this.toc = flattenToc(this.book.navigation?.toc || []);

    const saved = await db.get('locations', id);
    if (saved?.data) {
      this.book.locations.load(saved.data);
    }
    await this.rendition.display(cfi || rec.cfi || undefined);
    $('#r-loading').hidden = true;
    this.highlights = await highlightsFor(id);
    this.highlights.forEach(h => this.paint(h));
    await this.loadBookmarks();
    this.paintRibbon();
    this.lastActivity = Date.now();

    if (!saved?.data) {
      // Se calcula una sola vez por libro y se guarda.
      this.book.locations.generate(1600).then(() => {
        if (!this.book) return;
        db.put('locations', { id, data: this.book.locations.save() });
        const loc = this.rendition.currentLocation();
        if (loc?.start) this.onRelocated(loc);
      }).catch(() => {});
    }

    clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), 15000);
  }

  bindGestures() {
    // Computador: clic en los bordes. En iPhone Safari no genera clics al tocar texto normal,
    // así que los toques se leen directamente del dedo (attachTouch) y aquí se ignoran.
    this.rendition.on('click', e => {
      if (Date.now() - (this.lastTouch || 0) < 800) return;
      this.handleTap(e.clientX, e.clientY, e.view);
    });
    this.rendition.on('keyup', e => this.onKey(e));
  }

  // Se engancha a cada página del libro (iframe) en cuanto se carga
  attachTouch(contents) {
    const doc = contents.document, win = contents.window;
    let sx = null, sy = 0, st = 0;
    doc.addEventListener('touchstart', e => {
      if (e.touches.length > 1) { sx = null; return; }
      const t = e.touches[0];
      sx = t.clientX; sy = t.clientY; st = Date.now();
    }, { passive: true });
    doc.addEventListener('touchcancel', () => { sx = null; }, { passive: true });
    doc.addEventListener('touchend', e => {
      if (sx == null) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy, dt = Date.now() - st;
      sx = null;
      this.lastTouch = Date.now();
      // Deslizar
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.3 && dt < 800) {
        dx < 0 ? this.next() : this.prev();
        return;
      }
      // Toque corto (no presión larga para seleccionar)
      if (Math.abs(dx) < 12 && Math.abs(dy) < 12 && dt < 400) this.handleTap(t.clientX, t.clientY, win);
    }, { passive: true });
  }

  // x, y en coordenadas de la página del libro (iframe)
  handleTap(x, y, win) {
    const sel = win?.getSelection?.();
    if (sel && sel.toString().trim()) return; // está seleccionando texto
    const hit = this.highlightAt({ clientX: x, clientY: y, view: win });
    if (hit) { this.openHighlight(hit); return; }
    const frame = win?.frameElement?.getBoundingClientRect();
    const sx = (frame ? frame.left : 0) + x;
    const w = window.innerWidth;
    if (sx < w * 0.3) this.prev();
    else if (sx > w * 0.7) this.next();
  }

  onKey(e) {
    if (!this.isOpen || !this.rendition) return;
    if (e.key === 'ArrowRight') this.next();
    if (e.key === 'ArrowLeft') this.prev();
    if (e.key === 'Escape') { this.toggleSheet(false); this.toggleNav(false); }
  }

  // ---------- subrayados ----------
  hlStyles() {
    return this.theme === 'noche'
      ? { fill: HIGHLIGHT, 'fill-opacity': '0.45', 'mix-blend-mode': 'normal' }
      : { fill: HIGHLIGHT, 'fill-opacity': '0.5', 'mix-blend-mode': 'multiply' };
  }

  paint(h) {
    try { this.rendition.annotations.highlight(h.cfi, { id: h.id }, () => {}, 'hoja-hl', this.hlStyles()); }
    catch (e) { console.warn('No se pudo pintar el subrayado', e); }
  }

  unpaint(h) {
    try { this.rendition.annotations.remove(h.cfi, 'highlight'); } catch {}
  }

  repaintAll() {
    (this.highlights || []).forEach(h => { this.unpaint(h); this.paint(h); });
  }

  showSelBar(show) {
    $('#r-selbar').hidden = !show;
    if (!show) this.selection = null;
  }

  async saveSelection(withNote) {
    const sel = this.selection;
    if (!sel) return;
    const h = await addHighlight({ book: this.rec, cfi: sel.cfi, text: sel.text, chapter: this.chapter });
    this.highlights.push(h);
    this.paint(h);
    try { sel.contents.window.getSelection().removeAllRanges(); } catch {}
    this.showSelBar(false);
    if (withNote) this.openHighlight(h);
    else window.dispatchEvent(new CustomEvent('hoja:toast', { detail: 'Frase guardada en Ideas' }));
  }

  openHighlight(h) {
    openIdeaSheet(h, {
      onChange: updated => { const i = this.highlights.findIndex(x => x.id === updated.id); if (i >= 0) this.highlights[i] = updated; },
      onDelete: removed => { this.unpaint(removed); this.highlights = this.highlights.filter(x => x.id !== removed.id); },
    });
  }

  // ¿El toque cayó sobre un subrayado?
  highlightAt(e) {
    if (!this.highlights?.length) return null;
    const contents = this.rendition.getContents().find(c => c.window === e.view);
    if (!contents) return null;
    for (const h of this.highlights) {
      try {
        const range = contents.range(h.cfi);
        if (!range) continue;
        for (const r of range.getClientRects()) {
          if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) return h;
        }
      } catch {}
    }
    return null;
  }

  next() { this.rendition?.next(); }
  prev() { this.rendition?.prev(); }

  onRelocated(loc) {
    if (!loc?.start) return;
    this.lastActivity = Date.now();
    this.cfi = loc.start.cfi;
    let pct = null;
    try {
      if (this.book.locations.length()) pct = this.book.locations.percentageFromCfi(this.cfi);
    } catch {}
    if (loc.atEnd) pct = 1;
    if (pct != null) this.percent = pct;

    const chapter = this.chapterFor(loc.start.href);
    this.chapter = chapter;
    this.showSelBar(false);
    this.paintRibbon?.();
    const page = loc.start.displayed;
    const left = page ? page.total - page.page : 0;
    const label = [chapter, left > 0 ? `${left} pág. para terminar el capítulo` : ''].filter(Boolean).join(' · ');
    this.paintProgress(this.percent ?? this.rec.percent ?? 0, label);

    clearTimeout(this.saveT);
    this.saveT = setTimeout(() => this.saveProgress(), 600);
  }

  chapterFor(href) {
    if (!href || !this.toc) return '';
    const base = href.split('#')[0];
    const hit = this.toc.find(i => i.href.split('#')[0].endsWith(base) || base.endsWith(i.href.split('#')[0]));
    return hit ? hit.label.trim() : '';
  }

  paintProgress(pct, label) {
    const p = Math.round((pct || 0) * 100);
    $('#r-pct').textContent = p + '%';
    $('#r-bar').style.width = p + '%';
    $('#r-chapter').textContent = label || '';
  }

  async saveProgress() {
    if (!this.id || !this.cfi) return;
    try {
      const rec = await db.get('books', this.id);
      if (!rec) return;
      rec.cfi = this.cfi;
      if (this.percent != null) rec.percent = this.percent;
      rec.lastOpened = Date.now();
      await db.put('books', rec);
      this.rec = rec;
    } catch (e) { console.warn('No se pudo guardar el avance', e); }
  }

  tick() {
    if (!this.isOpen || document.visibilityState !== 'visible') return;
    if (Date.now() - (this.lastActivity || 0) > IDLE_LIMIT) return;
    this.pendingSeconds += 15;
    if (this.pendingSeconds >= 60) this.flushTime();
  }

  async flushTime() {
    const secs = this.pendingSeconds;
    if (!secs || !this.id) return;
    this.pendingSeconds = 0;
    try {
      const key = dayKey();
      const rec = (await db.get('sessions', key)) || { date: key, seconds: 0, books: [] };
      rec.seconds += secs;
      if (!rec.books.includes(this.id)) rec.books.push(this.id);
      await db.put('sessions', rec);
    } catch (e) { console.warn('No se pudo guardar el tiempo', e); }
  }

  toggleSheet(show) {
    $('#r-sheet').hidden = !show;
    $('#r-backdrop').hidden = !show;
    if (show) this.applyChrome();
  }

  setFontSize(v) {
    this.prefs.fontSize = Math.max(80, Math.min(160, v));
    this.rendition?.themes.fontSize(this.prefs.fontSize + '%');
    setSetting('reader', this.prefs);
    this.applyChrome();
  }

  setTheme(name) {
    if (!THEMES[name]) return;
    if (isDark()) this.prefs.darkTheme = name; else this.prefs.lightTheme = name;
    setSetting('reader', this.prefs);
    this.applyTheme();
  }

  get theme() { return isDark() ? this.prefs.darkTheme : this.prefs.lightTheme; }

  applyTheme() {
    this.rendition?.themes.select(this.theme);
    if (this.rendition) this.repaintAll();
    this.applyChrome();
  }

  applyChrome() {
    this.el.className = 'reader t-' + this.theme;
    $('#fs-val').textContent = this.prefs.fontSize + '%';
    document.querySelectorAll('.sw').forEach(b => b.classList.toggle('on', b.dataset.theme === this.theme));
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = this.isOpen ? THEMES[this.theme].bg : appBg();
  }

  async close(silent = false) {
    clearInterval(this.timer);
    clearTimeout(this.saveT);
    await this.flushTime();
    await this.saveProgress();
    this.toggleSheet(false);
    this.toggleNav(false);
    this.showSelBar(false);
    this.bookmarks = [];
    this.highlights = [];
    try { this.rendition?.destroy(); } catch {}
    try { this.book?.destroy(); } catch {}
    this.rendition = null; this.book = null; this.cfi = null; this.percent = null;
    this.el.hidden = true;
    document.body.style.overflow = '';
    document.body.classList.remove('reading');
    this.applyChrome();
    if (!silent) this.onClose?.();
  }
}

function flattenToc(items, out = [], depth = 0) {
  for (const i of items) {
    out.push({ href: i.href || '', label: i.label || '', depth });
    if (i.subitems?.length) flattenToc(i.subitems, out, depth + 1);
  }
  return out;
}
