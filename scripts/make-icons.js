// Genera los íconos de la app: hoja crema con nervadura café sobre fondo verde.
// Uso: node scripts/make-icons.js
const fs = require('fs');
const path = require('path');
const { renderPNG, hex, leaf } = require('./png');

const GREEN = hex('#8F9C70'), CREAM = hex('#F7F3EC'), BROWN = hex('#6E4335');
const out = path.join(__dirname, '..', 'icons');
fs.mkdirSync(out, { recursive: true });

for (const size of [180, 192, 512]) {
  const png = renderPNG(size, size, (x, y) => {
    const u = (x / size) * 2 - 1 + 0.06, v = (y / size) * 2 - 1 - 0.06;
    const l = leaf(u, v, 1.15);
    if (l.vein || l.stem) return BROWN;
    if (l.inLeaf) return CREAM;
    return GREEN;
  }, size > 200 ? 3 : 4);
  fs.writeFileSync(path.join(out, `icon-${size}.png`), png);
  console.log(`icons/icon-${size}.png`);
}
