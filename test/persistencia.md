# Persistencia de lectura — v14

## Causa investigada antes de modificar
En v13 ya se guardaba `loc.start.cfi`, no el número de página. Sin embargo, `relocated` de epub.js 0.3.93 se comunica después de un requestAnimationFrame y Hoja añadía 600 ms de debounce. La prueba de avanzar y enviar hidden inmediatamente mostró un CFI visible nuevo y el guardado del CFI anterior. Esto demuestra una carrera de actualización; no demuestra por sí solo que todos los retrocesos de 3–4 páginas tengan la misma causa.

Otros riesgos encontrados: lectura/escritura de books en transacciones separadas, carga de fuentes sin esperar, eventos iniciales sin protección de restauración y tarea de locations que usaba `this.book` mutable. Al regresar a visible, app.js no remonta el lector; solo actualiza Inicio cuando no se está leyendo. La actualización del service worker muestra un aviso cuando el lector está abierto, sin recargarlo.

Fuente primaria de la librería: https://github.com/futurepress/epub.js/blob/v0.3.93/src/rendition.js (reportLocation, currentLocation y onResized).

## Corrección
- Capturar la ubicación visible con `currentLocation()` en hidden, pagehide y al cerrar, antes de esperas asíncronas.
- Guardar en cada relocated sin debounce y con snapshot inmutable y actualización atómica. Registro síncrono local de emergencia mientras confirma IndexedDB.
- Ignorar eventos de montaje hasta estabilizar la tipografía y mostrar el CFI elegido. Conservar el ancla textual si permanece dentro de la página.
- Si falla o tarda la fuente, usar Georgia durante esa carga, retirando la petición pendiente para evitar repaginación tardía.
- No leer un CFI antiguo de la base ni hacer display al volver a visible/pageshow en una instancia montada.
- Invalidar las tareas de cálculo de ubicaciones de otros montajes.

## Verificado en Edge móvil emulado (393 × 852)
- Reproducción antes del cambio: visible `epubcfi(/6/6!/4/2/2/1:0)`, guardado anterior `epubcfi(/6/4!/4/2/16/1:0)`.
- Tras corregir, el guardado al hidden coincide con el CFI visible, aun antes de que llegue relocated. Montaje idéntico al regresar.
- EPUB de prueba y EPUB real Meditaciones: avanzar, cerrar lector, abrir y recargar al 100 % y 140 %. El CFI guardado permanece y el pasaje se encuentra dentro del rango visible.
- Verificado sin CSS de fuentes y con una respuesta CSS retrasada; esto no sustituye una prueba con Safari/iPhone ni prueba todas las fuentes posibles.

## Diagnóstico temporal
Abrir con `?lecturaDebug=1` o poner `sessionStorage.hojaReadingDebug = '1'` en la consola. Consultar `window.hojaReadingTrace`: hasta 250 eventos con CFI visible, CFI guardado, inicio/fin/error de transacción, visibilitychange, pageshow, montaje y restauración. No contiene texto del libro. Desactivar quitando el parámetro y la clave de sessionStorage. No se envían trazas a un servidor.

## Pendiente: iPhone real instalado
1. Actualizar desde Inicio, sin reinstalar.
2. Abrir un EPUB y avanzar 5–8 páginas.
3. Salir inmediatamente a la pantalla de inicio del iPhone y volver. Verificar el mismo pasaje.
4. Cerrar la app por completo y volver a abrir el libro. Verificar el mismo pasaje.
5. Repetir con letra mayor y menor, incluso sin conexión. La página puede cambiar; el texto recordado debe seguir visible.
6. Si reaparece el fallo, revisar trazas antes de atribuirlo a un nuevo montaje o a la repaginación.
