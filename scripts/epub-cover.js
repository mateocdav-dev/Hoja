// Inspecciona o cambia la portada de un EPUB.
//   node scripts/epub-cover.js info  libro.epub
//   node scripts/epub-cover.js set   libro.epub portada.jpg salida.epub ["Título" "Autor"]
// Si el libro no trae título/autor en sus metadatos, se añaden los indicados.
// La portada nueva reemplaza la imagen de portada existente (así también cambia la página de portada
// interna); si el libro no tiene, se añade como cover-image. Nunca modifica el archivo original.
const fs = require('fs');
const path = require('path');
const { readZip, entryData, makeEntry, writeZip } = require('./zip');

const attr = (tag, name) => (tag.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, 'i')) || [])[1];

function analyze(entries) {
  const get = n => entries.find(e => e.name === n);
  const container = entryData(get('META-INF/container.xml')).toString('utf8');
  const opfPath = attr(container.match(/<rootfile\b[^>]*>/i)[0], 'full-path');
  const opf = entryData(get(opfPath)).toString('utf8');
  const dir = path.posix.dirname(opfPath) === '.' ? '' : path.posix.dirname(opfPath) + '/';
  const items = [...opf.matchAll(/<item\b[^>]*>/gi)].map(m => ({
    tag: m[0], id: attr(m[0], 'id'), href: attr(m[0], 'href'), type: attr(m[0], 'media-type'), props: attr(m[0], 'properties') || '',
  }));
  const metaCover = opf.match(/<meta\b[^>]*name=["']cover["'][^>]*>/i);
  const metaId = metaCover && attr(metaCover[0], 'content');
  const cover = items.find(i => /\bcover-image\b/.test(i.props)) || items.find(i => i.id === metaId && /^image\//.test(i.type || ''));
  const title = (opf.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i) || [])[1];
  const author = (opf.match(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i) || [])[1];
  const coverPath = cover ? decodeURIComponent(path.posix.normalize(dir + cover.href)) : null;
  return { opfPath, opf, dir, items, cover, coverPath, title, author, metaCover };
}

const [, , cmd, file, img, out, newTitle, newAuthor] = process.argv;
const xmlEsc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const entries = readZip(fs.readFileSync(file));
const a = analyze(entries);

if (cmd === 'info') {
  const ce = a.coverPath && entries.find(e => e.name === a.coverPath);
  console.log(JSON.stringify({
    file: path.basename(file), title: a.title, author: a.author, opf: a.opfPath,
    cover: a.cover ? { href: a.coverPath, type: a.cover.type, bytes: ce ? ce.usize : null } : null,
  }));
} else if (cmd === 'set') {
  const data = fs.readFileSync(img);
  const ext = path.extname(img).toLowerCase();
  const type = ext === '.png' ? 'image/png' : 'image/jpeg';
  let opf = a.opf;
  let list = entries;
  let missing = '';
  if (!a.title && newTitle) missing += `\n    <dc:title>${xmlEsc(newTitle)}</dc:title>`;
  if (!a.author && newAuthor) missing += `\n    <dc:creator>${xmlEsc(newAuthor)}</dc:creator>`;
  if (!/<dc:language/i.test(opf) && missing) missing += '\n    <dc:language>es</dc:language>';
  if (missing) opf = opf.replace(/(<metadata\b[^>]*>)/i, `$1${missing}`);

  if (a.cover && a.cover.type === type && entries.some(e => e.name === a.coverPath)) {
    // Mismo formato: se reemplaza la imagen en su sitio
    list = entries.map(e => (e.name === a.coverPath ? makeEntry(e.name, data, true)
      : e.name === a.opfPath && missing ? makeEntry(e.name, Buffer.from(opf, 'utf8')) : e));
  } else {
    // Se añade una imagen nueva y se marca como portada
    const href = `hoja-portada${ext === '.png' ? '.png' : '.jpg'}`;
    if (a.cover) {
      const cleaned = a.cover.tag.replace(/\sproperties\s*=\s*["'][^"']*["']/i, m => {
        const rest = attr(a.cover.tag, 'properties').replace(/\bcover-image\b/, '').trim();
        return rest ? ` properties="${rest}"` : '';
      });
      opf = opf.replace(a.cover.tag, cleaned);
    }
    opf = opf.replace(/<\/manifest>/i, `  <item id="hoja-portada" href="${href}" media-type="${type}" properties="cover-image"/>\n  </manifest>`);
    if (a.metaCover) opf = opf.replace(a.metaCover[0], '<meta name="cover" content="hoja-portada"/>');
    else opf = opf.replace(/<\/metadata>/i, '  <meta name="cover" content="hoja-portada"/>\n  </metadata>');
    // EPUB 2 no admite properties en item: no molesta a los lectores, pero se deja también el meta
    list = entries.filter(e => e.name !== a.dir + href).map(e => (e.name === a.opfPath ? makeEntry(e.name, Buffer.from(opf, 'utf8')) : e));
    list.push(makeEntry(a.dir + href, data, true));
  }
  const outBuf = writeZip(list);
  readZip(outBuf); // comprobación
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, outBuf);
  console.log(`OK ${path.basename(out)} (${(outBuf.length / 1048576).toFixed(1)} MB)`);
} else {
  console.log('Uso: info <epub> | set <epub> <imagen> <salida.epub>');
}
