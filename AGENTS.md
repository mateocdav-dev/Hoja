# Hoja — guía para agentes (Codex / Claude)

App de lectura personal de Mateo para su **iPhone 14 Pro**. PWA instalable, sin servidor ni cuentas. Trabaja y responde en **español**. Mateo no es programador: explica en lenguaje simple, sin jerga, y verifica antes de decir que algo funciona.

- Publicada: https://mateocdav-dev.github.io/Hoja/ (GitHub Pages, rama `main`, raíz).
- Repo: https://github.com/mateocdav-dev/Hoja. Los commits usan `mateocdav-dev@users.noreply.github.com`; nunca el Gmail.
- Nota del proyecto en su vault de Obsidian: `I:\My Drive\00 CODEX\VAULT OBSIDIAN\01-Projects\Personal\app-lectura-hoja.md`. Actualízala con resultados comprobados al cerrar un avance.

## Stack y reglas
- HTML + CSS + JS puro con módulos ES. **Sin build ni npm.** Librerías por CDN con versión fija: `jszip@3.10.1` y `epubjs@0.3.93` (jsdelivr).
- Datos solo en el teléfono: IndexedDB (`db.js`, versión 2). Stores: `books`, `files` (EPUB), `locations`, `highlights`, `bookmarks`, `sessions`, `settings`.
- **Cada cambio publicado debe subir `CACHE` en `sw.js`** (va en `hoja-v13`). Si no, el iPhone no se entera. La app busca versión nueva al volver a primer plano y con el gesto de jalar hacia abajo.
- Paleta: fondo `#F2EFEA`, acento verde `#8F9C70` (elegido por Mateo; el amarillo ya no se usa), tinta `#1E1E1E`. Modo noche inspirado en Duolingo: `#131F24`, `#202F36`, `#37464F`. Tipografías: Outfit (UI) y Literata (lectura). Las decisiones estéticas son de Mateo.

## Archivos
| Archivo | Qué hace |
|---|---|
| `index.html` | Pantallas: Inicio, Ideas (Mapa / Tarjetas), Crecer, lector, hojas modales |
| `styles.css` | Estilos y variables de color (claro y `html[data-theme="dark"]`) |
| `app.js` | Inicio, biblioteca, importar EPUB, navegación, modo, actualizaciones, jalar para refrescar, recordatorio de respaldo |
| `reader.js` | Lector epub.js: paginado, gestos, temas por modo, subrayado, tiempo leído |
| `nav.js` | Índice, marcadores y búsqueda (sin tildes) dentro del lector |
| `ideas.js` | Subrayados, hoja de detalle, tarjetas, exportar a Obsidian (.md) y diálogo para guardar respaldos |
| `backup.js` | ZIP completo con EPUB, portadas y datos; restauración validada y atómica; compatibilidad con JSON v1 |
| `progress.js` | Migración de sesiones antiguas, meta por día y días cumplidos permanentes |
| `growth.js` | Racha, árbol SVG (1 hoja por cada 7 días seguidos), estadísticas, meta diaria |
| `graph.js` | Mapa de ideas con fuerzas propias (sin d3) |
| `theme.js` | Modo automático / noche / claro |
| `sw.js` | Caché sin conexión, versionada |
| `scripts/` | `serve.js` (servidor local), `epub-cover.js` + `zip.js` (cambiar portada o metadatos de un EPUB), `compose-cover.ps1` (montar título en Outfit sobre una ilustración), `make-test-epub.js` |

## Probar
- Local: `node scripts/serve.js` y abrir http://localhost:8642 en tamaño 393 × 852. Libro de prueba: `test/prueba.epub`.
- Tras cambiar archivos, en el navegador de pruebas hay que desregistrar el service worker y borrar las cachés; si no, sirve la versión vieja.
- Una pestaña en segundo plano pausa epub.js y el lector parece colgado. No es un fallo de la app.
- Publicar: commit + `git push` en `main`; GitHub Pages tarda ~1 min.

## Lecciones (no repetir errores)
- **iOS Safari no genera `click` al tocar texto o imágenes.** Los gestos del lector se leen con `touchstart`/`touchend` dentro del iframe (`attachTouch`).
- **epub.js en iOS necesita `allowScriptedContent: true`.** Con `sandbox` sin `allow-scripts`, Safari no entrega eventos táctiles ni de selección al iframe. Por seguridad, `spine.hooks.serialize` elimina `<script>` y atributos `on*` de cada capítulo.
- Sin zoom por doble toque: viewport con `maximum-scale=1, user-scalable=no` y `touch-action: manipulation`.
- En iOS, **borrar el ícono de la app borra sus datos**. Antes de reinstalar, guardar respaldo (Crecer → Tus datos). Safari y la app instalada no comparten datos.
- El ícono de inicio solo cambia al reinstalar.
- Al instalar el service worker se usa `cache: 'reload'`, para no reutilizar archivos viejos de la caché HTTP de GitHub (10 min).
- Libros de Mateo en `I:\My Drive\02 PROYECTOS\06. BOOKS`:
  - En la raíz, los EPUB **con portada** ilustrada.
  - En `Sin portada\`, los originales; no los modifiques.
  - En `Portadas\`, las imágenes.
  - En `Backups\`, los respaldos de la app con fecha, día y hora en el nombre.
- Al compartir en iPhone, enviar solo `files`, sin `title`: el título produce un archivo .txt adicional.

## Pendientes / ideas
- Respaldo v13: ZIP con fecha, día y hora; destino manual por elección de Mateo. Carpeta habitual: `I:\My Drive\02 PROYECTOS\06. BOOKS\Backups`. Sin OAuth ni conexión directa con Drive.
- Las metas nuevas no recalculan días anteriores; si hoy ya tiene lectura registrada, rigen mañana. Se conservan las hojas ganadas al cambiar de meta.
- Confirmar en el iPhone: barra de estado en modo noche, rendimiento del EPUB de 40 MB (*Mente millonaria*) y el ícono nuevo tras reinstalar.
- Posibles mejoras: gestionar etiquetas, renombrar o editar libros, estadísticas por libro, notificación de recordatorio diario.
