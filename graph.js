// Mapa de ideas estilo Obsidian: cada frase guardada es un punto, unida a su libro y a sus #etiquetas.
import { db } from './db.js';
import { esc } from './ideas.js';

const BOOK_COLORS = ['#F6D5CF', '#DCD3FB', '#CFE3B5', '#BFD3EC', '#FFE3A3', '#E9DCCB'];
const hash = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

function simulate(nodes, links) {
  let seed = 3;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  nodes.forEach((n, i) => {
    const a = (i / nodes.length) * Math.PI * 2;
    n.x = Math.cos(a) * 120 + r() * 20; n.y = Math.sin(a) * 120 + r() * 20; n.vx = 0; n.vy = 0;
  });
  const idx = new Map(nodes.map((n, i) => [n.id, i]));
  const L = links.map(l => ({ a: nodes[idx.get(l.source)], b: nodes[idx.get(l.target)], len: l.len }));
  const N = 420;
  for (let it = 0; it < N; it++) {
    const alpha = 1 - it / N;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        const d2 = Math.max(dx * dx + dy * dy, 30);
        const f = (1400 * alpha) / d2;
        const d = Math.sqrt(d2);
        dx /= d; dy /= d;
        a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
      }
    }
    for (const l of L) {
      const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - l.len) * 0.04 * alpha;
      l.a.vx += (dx / d) * f; l.a.vy += (dy / d) * f;
      l.b.vx -= (dx / d) * f; l.b.vy -= (dy / d) * f;
    }
    for (const n of nodes) {
      n.vx += -n.x * 0.006 * alpha; n.vy += -n.y * 0.006 * alpha;
      n.x += n.vx; n.y += n.vy; n.vx *= 0.55; n.vy *= 0.55;
    }
  }
}

export async function renderGraph(el, { onOpen, countEl } = {}) {
  const hs = await db.all('highlights');
  if (countEl) countEl.textContent = hs.length ? `${hs.length} ${hs.length === 1 ? 'idea' : 'ideas'}` : '';
  if (!hs.length) {
    el.innerHTML = `<p class="graph-empty">Cuando guardes frases, aquí verás cómo se conectan entre sí: por libro y por las #etiquetas que escribas en tus notas.</p>`;
    return;
  }
  const nodes = [], links = [], seen = new Map();
  const add = n => { if (!seen.has(n.id)) { seen.set(n.id, n); nodes.push(n); } return seen.get(n.id); };
  for (const h of hs) {
    const color = BOOK_COLORS[hash(h.bookTitle) % BOOK_COLORS.length];
    add({ id: 'b:' + h.bookTitle, type: 'book', label: h.bookTitle, color, r: 13 });
    add({ id: h.id, type: 'idea', label: h.text, color, r: h.pinned ? 7 : 5.5, h });
    links.push({ source: h.id, target: 'b:' + h.bookTitle, len: 55 });
    for (const t of h.tags || []) {
      add({ id: 't:' + t, type: 'tag', label: '#' + t, r: 9 });
      links.push({ source: h.id, target: 't:' + t, len: 45 });
    }
  }
  simulate(nodes, links);

  const padX = 78, padY = 34; // margen extra a los lados para que quepan los nombres
  const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y);
  const minX = Math.min(...xs) - padX, maxX = Math.max(...xs) + padX;
  const minY = Math.min(...ys) - padY, maxY = Math.max(...ys) + padY + 10;
  const byId = new Map(nodes.map(n => [n.id, n]));

  const lines = links.map(l => {
    const a = byId.get(l.source), b = byId.get(l.target);
    return `<line data-a="${esc(l.source)}" data-b="${esc(l.target)}" x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}"/>`;
  }).join('');
  const dots = nodes.map(n => {
    const cls = `g-node g-${n.type}`;
    const fill = n.type === 'tag' ? '' : `style="fill:${n.color}"`;
    const label = n.type === 'idea' ? '' : `<text x="${n.x.toFixed(1)}" y="${(n.y + n.r + 13).toFixed(1)}">${esc(cut(n.label, 22))}</text>`;
    return `<g class="${cls}" data-id="${esc(n.id)}"><circle class="g-hit" cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${Math.max(16, n.r + 6)}"/><circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${n.r}" ${fill}/>${label}</g>`;
  }).join('');

  el.innerHTML = `<svg class="graph" viewBox="${minX.toFixed(0)} ${minY.toFixed(0)} ${(maxX - minX).toFixed(0)} ${(maxY - minY).toFixed(0)}" preserveAspectRatio="xMidYMid meet">
      <g class="g-links">${lines}</g>${dots}</svg>
    <p class="graph-hint">Toca un libro o una #etiqueta para ver sus conexiones; toca un punto para abrir la frase.</p>`;

  const svg = el.querySelector('svg');
  svg.onclick = e => {
    const g = e.target.closest('.g-node');
    svg.classList.remove('focus');
    svg.querySelectorAll('.lit').forEach(x => x.classList.remove('lit'));
    if (!g) return;
    const id = g.dataset.id;
    const n = byId.get(id);
    if (n.type === 'idea') { onOpen?.(n.h); return; }
    svg.classList.add('focus');
    g.classList.add('lit');
    svg.querySelectorAll('line').forEach(l => {
      if (l.dataset.a === id || l.dataset.b === id) {
        l.classList.add('lit');
        const other = l.dataset.a === id ? l.dataset.b : l.dataset.a;
        svg.querySelector(`.g-node[data-id="${CSS.escape(other)}"]`)?.classList.add('lit');
      }
    });
  };
}
