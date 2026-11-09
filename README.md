# Hoja

Lector de libros personal para iPhone. Es una web app instalable (PWA): se abre desde la pantalla de inicio como cualquier app y funciona sin internet. Tus libros y tu avance se guardan solo en tu teléfono.

## Qué hace hoy (fases 0 y 1)
- Añadir libros EPUB con el botón **+**, con portada automática.
- Biblioteca con portadas y % de avance; tarjeta «Sigue leyendo».
- Lector paginado: toca el borde derecho/izquierdo o desliza para pasar página.
- Barra de % de avance y páginas que faltan del capítulo.
- Recuerda dónde ibas.
- Tamaño de letra y temas crema, blanco y noche.
- Semana con los días que leíste (≥ 1 min) y contador de racha.

Próximas fases: subrayar y guardar ideas (2), planta/árbol de racha (3), grafo de ideas (4).

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

Para actualizar la app tras cambios: sube los archivos y cambia `CACHE = 'hoja-v1'` en `sw.js` a `hoja-v2` (y así sucesivamente). La app se actualiza al abrirla dos veces.

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
| `db.js` | Base de datos local (IndexedDB) |
| `sw.js` | Funciona sin internet |
| `scripts/` | Generan íconos, el EPUB de prueba y el servidor local |

## Ojo
- iOS puede borrar datos de webs que no usas en semanas; instalada en la pantalla de inicio es mucho más estable. En la fase 2 llega «exportar respaldo».
- Solo EPUB sin DRM. Los libros comprados en Apple Books o Kindle traen DRM y no abren aquí.
