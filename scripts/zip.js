// Lector/escritor ZIP mínimo para EPUB (sin dependencias).
const zlib = require('zlib');
const { crc32 } = require('./png');

function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('No es un ZIP válido');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Directorio central dañado');
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nlen).toString('utf8');
    const lnlen = buf.readUInt16LE(local + 26), lelen = buf.readUInt16LE(local + 28);
    const start = local + 30 + lnlen + lelen;
    entries.push({ name, method, crc, csize, usize, raw: buf.slice(start, start + csize) });
    p += 46 + nlen + elen + clen;
  }
  return entries;
}

function entryData(e) {
  if (e.method === 0) return e.raw;
  if (e.method === 8) return zlib.inflateRawSync(e.raw);
  throw new Error(`Compresión no soportada (${e.method}) en ${e.name}`);
}

function makeEntry(name, data, store = false) {
  const raw = store ? data : zlib.deflateRawSync(data, { level: 9 });
  return { name, method: store ? 0 : 8, crc: crc32(data), csize: raw.length, usize: data.length, raw };
}

function writeZip(entries) {
  // mimetype primero y sin comprimir (requisito EPUB)
  entries = [...entries].sort((a, b) => (a.name === 'mimetype' ? -1 : b.name === 'mimetype' ? 1 : 0));
  const locals = [], centrals = [];
  let offset = 0;
  for (const e of entries) {
    const n = Buffer.from(e.name, 'utf8');
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6);
    lh.writeUInt16LE(e.method, 8); lh.writeUInt32LE(0, 10); lh.writeUInt32LE(e.crc, 14);
    lh.writeUInt32LE(e.csize, 18); lh.writeUInt32LE(e.usize, 22);
    lh.writeUInt16LE(n.length, 26); lh.writeUInt16LE(0, 28);
    locals.push(lh, n, e.raw);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(e.method, 10); ch.writeUInt32LE(0, 12);
    ch.writeUInt32LE(e.crc, 16); ch.writeUInt32LE(e.csize, 20); ch.writeUInt32LE(e.usize, 24);
    ch.writeUInt16LE(n.length, 28); ch.writeUInt32LE(offset, 42);
    centrals.push(ch, n);
    offset += 30 + n.length + e.raw.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

module.exports = { readZip, entryData, makeEntry, writeZip };
