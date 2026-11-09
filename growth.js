// Crecer: racha, árbol que gana una hoja cada 7 días seguidos, estadísticas, meta diaria y respaldo.
import { db, dayKey, getSetting, setSetting } from './db.js';

const STAGES = ['Semilla', 'Brote', 'Plantita', 'Arbusto', 'Árbol joven', 'Árbol'];
const GOALS = [5, 10, 15, 20, 30];
const $ = s => document.querySelector(s);

// ---------- datos ----------
export const getGoal = () => getSetting('dailyGoal', 10);

export function readDaysFrom(sessions, goalMin) {
  return new Set(sessions.filter(s => s.seconds >= goalMin * 60).map(s => s.date));
}

const toDate = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const dayDiff = (a, b) => Math.round((toDate(b) - toDate(a)) / 864e5);

// Racha actual, mejor racha y hojas ganadas (cada bloque de 7 días seguidos = 1 hoja, para siempre)
export function streakInfo(days) {
  const sorted = [...days].sort();
  let best = 0, leaves = 0, run = 0, prev = null;
  for (const k of sorted) {
    run = prev && dayDiff(prev, k) === 1 ? run + 1 : 1;
    if (run % 7 === 0) leaves++;
    best = Math.max(best, run);
    prev = k;
  }
  let current = 0;
  const d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  while (days.has(dayKey(d))) { current++; d.setDate(d.getDate() - 1); }
  return { current, best, leaves, total: days.size };
}

const stageOf = leaves => (leaves === 0 ? 0 : leaves < 3 ? 1 : leaves < 6 ? 2 : leaves < 12 ? 3 : leaves < 24 ? 4 : 5);

// ---------- árbol generativo (siempre el mismo dibujo para el mismo número de hojas) ----------
function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function treeSVG(leaves, progress = 0) {
  const stage = stageOf(leaves);
  const W = 320, H = 300, bx = 160, by = 262;
  const ground = `<ellipse cx="${bx}" cy="${by + 6}" rx="${70 + stage * 8}" ry="12" class="t-ground"/>`;
  if (stage === 0) {
    const bud = progress > 0 ? `<path class="t-leaf l1" d="M${bx} ${by - 6} q -10 -14 0 -${10 + progress * 18} q 10 ${4 + progress * 4} 0 ${10 + progress * 18}" opacity=".9"/>` : '';
    return `<svg viewBox="0 0 ${W} ${H}" class="tree">${ground}${bud}<ellipse cx="${bx}" cy="${by}" rx="11" ry="7" class="t-seed"/></svg>`;
  }
  const r = rng(11);
  const trunk = [0, 50, 60, 66, 70, 72][stage];
  const segs = [], spots = [];
  const branch = (x, y, ang, len, w, d) => {
    const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
    segs.push(`<path d="M${x.toFixed(1)} ${y.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}" stroke-width="${w.toFixed(1)}"/>`);
    for (const t of [0.55, 0.85, 1]) spots.push({ x: x + (x2 - x) * t, y: y + (y2 - y) * t, a: ang + (r() - 0.5) * 2.2, s: 0.8 + r() * 0.5, tip: d === 0 && t === 1, depth: d });
    if (d <= 0) return;
    branch(x2, y2, ang - (0.38 + r() * 0.3), len * (0.66 + r() * 0.12), w * 0.66, d - 1);
    branch(x2, y2, ang + (0.38 + r() * 0.3), len * (0.66 + r() * 0.12), w * 0.66, d - 1);
  };
  branch(bx, by, -Math.PI / 2, trunk, 3 + stage * 2.2, stage);
  // Orden estable de aparición: primero las puntas, luego las ramas más finas, al final las gruesas
  spots.forEach(p => { p.k = (p.tip ? 0 : 1 + p.depth) + r() * 0.9; });
  spots.sort((a, b) => a.k - b.k);
  const leaf = (p, i, scale = 1, extra = '') => {
    const L = 27 * p.s * scale, Wd = 11 * p.s * scale;
    const deg = (p.a * 180) / Math.PI;
    return `<path class="t-leaf l${i % 4}" ${extra} transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${deg.toFixed(0)})" d="M0 0 Q ${L / 2} ${-Wd} ${L} 0 Q ${L / 2} ${Wd} 0 0Z"/>`;
  };
  const shown = spots.slice(0, Math.min(leaves, spots.length));
  const leafSvg = shown.map((p, i) => leaf(p, i, 1, i === shown.length - 1 ? 'data-new="1"' : '')).join('');
  const budSvg = progress > 0 && spots[leaves] ? leaf(spots[leaves], leaves, 0.25 + progress * 0.5, 'opacity=".55"') : '';
  // Encuadre: si el árbol se sale, se aleja la cámara manteniendo el suelo abajo
  const minX = Math.min(0, ...spots.map(p => p.x - 18)), maxX = Math.max(W, ...spots.map(p => p.x + 18));
  const minY = Math.min(0, ...spots.map(p => p.y - 18));
  const vb = `${minX.toFixed(0)} ${minY.toFixed(0)} ${(maxX - minX).toFixed(0)} ${(H - minY).toFixed(0)}`;
  return `<svg viewBox="${vb}" class="tree">${ground}<g class="t-wood">${segs.join('')}</g>${leafSvg}${budSvg}</svg>`;
}

// ---------- vista ----------
export async function renderGrowth({ onGoalChange } = {}) {
  const [sessions, goal, lastBackup] = await Promise.all([db.all('sessions'), getGoal(), getSetting('lastBackup', null)]);
  const days = readDaysFrom(sessions, goal);
  const info = streakInfo(days);
  const today = sessions.find(s => s.date === dayKey());
  const todayMin = Math.floor((today?.seconds || 0) / 60);
  const totalMin = Math.round(sessions.reduce((a, s) => a + s.seconds, 0) / 60);
  const inBlock = info.current % 7;
  const progress = inBlock / 7;
  const stage = stageOf(info.leaves);

  const msg = info.current === 0
    ? 'Lee hoy para empezar tu racha. Cada 7 días seguidos, tu planta gana una hoja.'
    : inBlock === 0
      ? '¡Ganaste una hoja nueva! Sigue así.'
      : `${7 - inBlock === 1 ? 'Falta 1 día' : `Faltan ${7 - inBlock} días`} para la próxima hoja.`;
  const dots = Array.from({ length: 7 }, (_, i) => `<i class="${i < (inBlock || (info.current ? 7 : 0)) ? 'on' : ''}"></i>`).join('');
  const hm = totalMin >= 60 ? `${Math.floor(totalMin / 60)} h ${totalMin % 60} min` : `${totalMin} min`;

  $('#growth').innerHTML = `
    <div class="tree-card">
      ${treeSVG(info.leaves, progress)}
      <div class="tree-info"><b>${STAGES[stage]}</b><span>${info.leaves} ${info.leaves === 1 ? 'hoja' : 'hojas'}</span></div>
      <div class="leaf-dots">${dots}</div>
      <p class="tree-msg">${msg}</p>
    </div>
    <div class="stats">
      <div class="stat"><b>${info.current}</b><span>Racha actual</span></div>
      <div class="stat"><b>${info.best}</b><span>Mejor racha</span></div>
      <div class="stat"><b>${info.total}</b><span>Días leídos</span></div>
      <div class="stat"><b>${hm}</b><span>Tiempo leído</span></div>
    </div>
    <div class="goal-card">
      <div class="goal-top"><b>Meta diaria</b><span>${Math.min(todayMin, goal)} / ${goal} min hoy</span></div>
      <div class="track goal-track"><i style="width:${Math.min(100, (todayMin / goal) * 100)}%"></i></div>
      <div class="goal-chips">${GOALS.map(g => `<button class="fchip ${g === goal ? 'on' : ''}" data-goal="${g}">${g} min</button>`).join('')}</div>
      <p class="goal-note">Un día cuenta para tu racha cuando llegas a la meta.</p>
    </div>`;

  $('#data-card').innerHTML = `
    <p>Tus libros, ideas y racha viven solo en este teléfono. Guarda un respaldo de vez en cuando: si algún día reinstalas Hoja, lo recuperas todo.</p>
    <p class="last-backup">Último respaldo: <b>${lastBackup ? ago(lastBackup) : 'nunca'}</b></p>
    <div class="data-actions">
      <button class="btn" data-action="backup">Guardar respaldo</button>
      <button class="pill wide" data-action="restore">Restaurar respaldo</button>
    </div>`;

  $('#growth .goal-chips').onclick = async e => {
    const b = e.target.closest('[data-goal]');
    if (!b) return;
    await setSetting('dailyGoal', +b.dataset.goal);
    renderGrowth({ onGoalChange });
    onGoalChange?.();
  };
}

export function ago(ts) {
  const d = Math.floor((Date.now() - ts) / 864e5);
  return d <= 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`;
}
