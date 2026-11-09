// Crea test/prueba.epub: un EPUB 3 pequeño para probar la app.
// Uso: node scripts/make-test-epub.js
const fs = require('fs');
const path = require('path');
const { renderPNG, hex, crc32 } = require('./png');

// ---------- ZIP sin compresión (válido para EPUB) ----------
function zip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const n = Buffer.from(name), crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(0, 8); lh.writeUInt32LE(0, 10); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(n.length, 26); lh.writeUInt16LE(0, 28);
    locals.push(lh, n, data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0, 8); ch.writeUInt16LE(0, 10); ch.writeUInt32LE(0, 12);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(n.length, 28); ch.writeUInt32LE(offset, 42);
    centrals.push(ch, n);
    offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

// ---------- Contenido ----------
const CHAPTERS = [
  { title: 'I. Lo que depende de ti', ideas: [
    'Hay cosas que dependen de nosotros y cosas que no. Depende de nosotros lo que pensamos, lo que elegimos y cómo respondemos; no depende de nosotros el clima, la opinión ajena ni el pasado.',
    'Quien pone su paz en lo que no controla vive siempre en vilo. Quien la pone en su propia respuesta puede estar tranquilo incluso en un día difícil.',
    'Leer diez minutos no cambia el mundo. Pero sí cambia el tipo de persona que eres mientras lo haces, y esa persona es la que decide el resto del día.',
    'La mañana es un pequeño territorio propio. Antes de que lleguen los mensajes, las urgencias y el ruido, hay un rato que todavía te pertenece.',
  ]},
  { title: 'II. El hábito es un voto', ideas: [
    'Cada página es un voto por la persona que quieres ser. Ninguno decide la elección por sí solo, pero juntos terminan ganándola.',
    'No hace falta motivación para abrir un libro; hace falta que abrirlo sea más fácil que no hacerlo. Deja el libro a la mano y la excusa lejos.',
    'Un día perdido no rompe un hábito. Dos días seguidos empiezan a construir otro. La regla sencilla es no fallar dos veces.',
    'La racha no es una cadena para castigarte, es un jardín para cuidar. Si un día no riegas, la planta no muere; solo espera.',
  ]},
  { title: 'III. Subrayar es conversar', ideas: [
    'Un libro subrayado deja de ser del autor y empieza a ser un poco tuyo. Las marcas son la huella de lo que te tocó.',
    'Guardar una frase es fácil; volver a ella es lo valioso. Las ideas crecen cuando se conectan con otras ideas.',
    'Escribe al margen lo que piensas, aunque sea una palabra. Leer sin responder es escuchar a medias.',
    'Con el tiempo, tus notas forman un mapa de lo que has aprendido. Ese mapa vale más que cualquier lista de libros terminados.',
  ]},
];

function chapterXhtml(ch) {
  const paras = [];
  for (let r = 0; r < 3; r++) for (const p of ch.ideas) paras.push(`<p>${p}</p>`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="es" xml:lang="es">
<head><title>${ch.title}</title></head>
<body><section epub:type="chapter"><h2>${ch.title}</h2>
${paras.join('\n')}
</section></body></html>`;
}

const files = CHAPTERS.map((c, i) => ({ name: `OEBPS/cap${i + 1}.xhtml`, data: Buffer.from(chapterXhtml(c)) }));

const nav = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="es" xml:lang="es">
<head><title>Índice</title></head>
<body><nav epub:type="toc" id="toc"><h1>Índice</h1><ol>
${CHAPTERS.map((c, i) => `<li><a href="cap${i + 1}.xhtml">${c.title}</a></li>`).join('\n')}
</ol></nav></body></html>`;

const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="es">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:7a1d1f0e-hoja-prueba-0001</dc:identifier>
    <dc:title>Meditaciones de prueba</dc:title>
    <dc:creator>Marco Aurelio</dc:creator>
    <dc:language>es</dc:language>
    <meta property="dcterms:modified">2026-11-09T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="cover" href="cover.png" media-type="image/png" properties="cover-image"/>
    ${CHAPTERS.map((_, i) => `<item id="cap${i + 1}" href="cap${i + 1}.xhtml" media-type="application/xhtml+xml"/>`).join('\n    ')}
  </manifest>
  <spine>
    ${CHAPTERS.map((_, i) => `<itemref idref="cap${i + 1}"/>`).join('\n    ')}
  </spine>
</package>`;

const container = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

// Portada: fondo oliva con sol amarillo y colinas
const W = 400, H = 600, OLIVE = hex('#8BA23A'), SUN = hex('#FDB92E'), HILL = hex('#6E8A2C'), SKY = hex('#F6E3B0');
const cover = renderPNG(W, H, (x, y) => {
  if ((x - 200) ** 2 + (y - 250) ** 2 < 80 ** 2) return SUN;
  const hill = 430 + 40 * Math.sin(x / 70);
  if (y > hill) return y > 470 + 30 * Math.cos(x / 55) ? HILL : OLIVE;
  return SKY;
}, 2);

const epub = zip([
  { name: 'mimetype', data: Buffer.from('application/epub+zip') },
  { name: 'META-INF/container.xml', data: Buffer.from(container) },
  { name: 'OEBPS/content.opf', data: Buffer.from(opf) },
  { name: 'OEBPS/nav.xhtml', data: Buffer.from(nav) },
  { name: 'OEBPS/cover.png', data: cover },
  ...files,
]);

const out = path.join(__dirname, '..', 'test');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'prueba.epub'), epub);
console.log(`test/prueba.epub (${(epub.length / 1024).toFixed(1)} KB)`);
