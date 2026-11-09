// Modo claro / noche de toda la app: automático (sigue al sistema), noche o claro.
const KEY = 'hoja-mode';
const ORDER = ['auto', 'dark', 'light'];
const BG = { light: '#F2EFEA', dark: '#131F24' };
const mq = matchMedia('(prefers-color-scheme: dark)');

export function getMode() {
  try { return localStorage.getItem(KEY) || 'auto'; } catch { return 'auto'; }
}

export const isDark = () => document.documentElement.dataset.theme === 'dark';
export const appBg = () => (isDark() ? BG.dark : BG.light);

export function applyMode() {
  const mode = getMode();
  const dark = mode === 'dark' || (mode === 'auto' && mq.matches);
  const root = document.documentElement;
  const changed = dark !== isDark();
  if (dark) root.dataset.theme = 'dark'; else delete root.dataset.theme;
  const btn = document.getElementById('mode-btn');
  if (btn) btn.dataset.mode = mode;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && !document.body.classList.contains('reading')) meta.content = appBg();
  if (changed) window.dispatchEvent(new CustomEvent('hoja:mode', { detail: { dark } }));
  return mode;
}

export function cycleMode() {
  const next = ORDER[(ORDER.indexOf(getMode()) + 1) % ORDER.length];
  try { localStorage.setItem(KEY, next); } catch {}
  return applyMode();
}

mq.addEventListener?.('change', applyMode);
