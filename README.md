# Hoja

Lector de libros personal para iPhone. Es una web app instalable (PWA): se abre desde la pantalla de inicio como cualquier app y funciona sin internet. Tus libros y tu avance se guardan solo en tu teléfono.

## Qué hace hoy
**Biblioteca y lector**
- Añadir uno o varios EPUB con el botón **+**, con portada automática.
- Lector paginado: toca los bordes, desliza o usa las flechas ‹ ›. Recuerda dónde ibas.
- Índice de capítulos, marcadores y búsqueda dentro del libro (sin importar tildes), desde el botón ☰ del lector.
- Tamaño de letra y temas; modo noche para toda la app (automático, noche o claro) con el botón junto a la racha.

**Ideas**
- Subrayar en verde, notas con #etiquetas, ideas fijadas, filtros e «Ir al libro».
- Exportar a Obsidian (una nota .md por libro).

**Crecer**
- Árbol que gana una hoja por cada 7 días seguidos de lectura (las hojas no se pierden).
- Racha, mejor racha, días leídos, tiempo total y meta diaria ajustable (5–30 min).
- Mapa de ideas estilo Obsidian: frases conectadas por libro y por #etiqueta.
- Respaldo: guardar y restaurar, con recordatorio semanal en Inicio.

**Actualizaciones**: se actualiza sola al volver a la app, o jalando hacia abajo en Inicio.

## Probar en el computador
```bash
node scripts/serve.js
```
Abre http://localhost:8642. Para probar sin buscar libros, añade `test/prueba.epub`.

## Publicar y llevarlo al iPhone
1. Crea un repositorio en GitHub (p. ej. `hoja`) y sube esta carpeta.
2. En el repo: **Settings → Pages → Branch: main / root → Save**. En un minuto queda en `https://TU-USUARIO.github.io/hoja/`.
3. En el iPhone abre esa dirección en **Safari** → botón **Compartir** → **Añadir a pantalla de inicio**.
4. Abre Hoja desde el ícono (no desde Safari): así tus datos quedan en la app instalada.

Para publicar cambios: sube los archivos y aumenta la versión `CACHE` en `sw.js`. El teléfono la detecta solo al volver a la app o al jalar hacia abajo.

## Libros gratis y legales (EPUB)
- [Standard Ebooks](https://standardebooks.org/ebooks): ediciones muy cuidadas (en inglés).
- [Project Gutenberg en español](https://www.gutenberg.org/browse/languages/es).

En el iPhone: descarga el EPUB, se guarda en **Archivos**; luego en Hoja toca **+** y elígelo.
Si tienes un PDF, conviértelo a EPUB con [Calibre](https://calibre-ebook.com) (gratis) antes de añadirlo.

## Archivos
| Archivo | Para qué |
|---|---|
| `index.html` | Estructura de pantallas |
| `styles.css` | Colores, tipografía y formas |
| `app.js` | Inicio, biblioteca, importar libros, navegación |
| `reader.js` | Lector (epub.js), avance, temas, tiempo leído |
| `nav.js` | Índice, marcadores y búsqueda del lector |
| `ideas.js` | Subrayados, ideas, exportar a Obsidian y respaldo |
| `growth.js` | Racha, árbol, estadísticas y meta diaria |
| `graph.js` | Mapa de ideas |
| `theme.js` | Modo claro / noche |
| `db.js` | Base de datos local (IndexedDB) |
| `sw.js` | Funciona sin internet |
| `scripts/` | Generan íconos, el EPUB de prueba y el servidor local |

## Ojo
- iOS puede borrar datos de webs que no usas en semanas; instalada en la pantalla de inicio es mucho más estable. Guarda un respaldo de vez en cuando (Ideas → ···).
- Solo EPUB sin DRM. Los libros comprados en Apple Books o Kindle traen DRM y no abren aquí.
