// Codificador PNG mínimo (sin dependencias) + utilidades de dibujo con antialias.
const zlib = require('zlib');

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

// pixel(x, y) -> [r, g, b] en 0..255 ; con supersampling ss×ss
function renderPNG(w, h, pixel, ss = 4) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        const c = pixel(x + (sx + 0.5) / ss, y + (sy + 0.5) / ss);
        r += c[0]; g += c[1]; b += c[2];
      }
      const n = ss * ss, o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = Math.round(r / n); raw[o + 1] = Math.round(g / n); raw[o + 2] = Math.round(b / n);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

// Hoja: lente formada por dos círculos, girada 45°. Coordenadas normalizadas -1..1.
function leaf(u, v, scale = 0.62) {
  const a = -Math.PI / 4;
  const x = (u * Math.cos(a) - v * Math.sin(a)) / scale;
  const y = (u * Math.sin(a) + v * Math.cos(a)) / scale;
  const R = 0.62, off = 0.3;
  const inLeaf = (x - off) ** 2 + y ** 2 < R * R && (x + off) ** 2 + y ** 2 < R * R;
  const tipY = Math.sqrt(R * R - off * off);
  const vein = inLeaf && Math.abs(x) < 0.022 && y > -tipY * 0.7;
  const stem = !inLeaf && Math.abs(x) < 0.03 && y > tipY - 0.02 && y < tipY + 0.16;
  return { inLeaf, vein, stem };
}

module.exports = { renderPNG, hex, leaf, crc32 };
