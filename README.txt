JS TRENDY SHOP — MARCAS CONFIGURABLES POR CATEGORÍA

Esta versión conserva el diseño actual de JS Trendy Shop.

CAMBIOS DE ESTA VERSIÓN
- En Administración > Categorías ahora cada categoría muestra un campo para configurar sus marcas permitidas.
- Ejemplo: Carteras puede tener Guess, Steve Madden y Michael Kors.
- Si una marca no está configurada para una categoría, no aparece como filtro público de esa categoría.
- Al agregar/editar un producto, primero eliges la categoría y después el selector de Marca muestra únicamente las marcas configuradas para esa categoría.
- Al cambiar de categoría, la marca se reinicia para evitar elegir una marca de otra categoría.
- Se conserva la opción "Este producto maneja tallas".
- No se agrega filtro público de Modelo.
- El botón Agregar de Categorías sigue permitiendo crear categorías nuevas.

CONFIGURACIÓN DE SUPABASE
1. Abre Supabase > SQL Editor.
2. Ejecuta categoria_marcas.sql una sola vez. Si ya lo ejecutaste anteriormente, puedes volver a ejecutarlo porque usa IF NOT EXISTS y ON CONFLICT DO NOTHING.
3. Abre admin.html.
4. En Categorías, escribe las marcas permitidas y pulsa Guardar marcas.

MARCAS INICIALES INCLUIDAS EN EL SQL
Carteras: Guess, Steve Madden, Michael Kors
Ropa: Nike, Adidas, Puma
Calzado: Nike, Adidas, New Balance

IMPORTANTE
Las categorías nuevas creadas desde el administrador siguen guardándose como antes. Después de crear una categoría, entra a Categorías y configura sus marcas permitidas.


CORRECCION: las marcas por categoria ahora combinan la configuracion de Supabase con un respaldo por categoria. Si falta Carteras en la respuesta de Supabase, siguen apareciendo Guess, Steve Madden y Michael Kors. El filtro de tallas se conserva y es independiente.


V8.1 — Las categorías y marcas destacadas usan un solo control por elemento: la imagen es la ilustración y el nombre/control no se repite. Las imágenes están dentro de la carpeta assets del proyecto.


V8.3: se retiró el filtro público de Marcas del catálogo porque las marcas ya se seleccionan desde el portal de Marcas destacadas. Se agregó el botón Todos, que limpia categoría, marca, talla y búsqueda y lleva automáticamente al catálogo completo.


V8.4 — CATEGORÍAS Y MARCAS VISUALES CONFIGURABLES
- Base exacta de V8.3; se conserva el diseño y la funcionalidad existente.
- Se agrega tienda_visual.sql con tablas para categorías y marcas visuales.
- El administrador puede agregar nuevas categorías con nombre, texto del botón, orden e imagen.
- El administrador puede agregar nuevas marcas con logo, orden y opción de mostrarlas en Marcas destacadas.
- La imagen es solamente ilustración; el nombre/botón es el control funcional.
- El público carga categorías y marcas desde Supabase automáticamente.
- Si las tablas nuevas aún no existen, la tienda conserva el aspecto de V8.3 mediante respaldo local.
- No se vuelve a mostrar un filtro público duplicado de marcas en el catálogo.
- El botón Todos sigue limpiando categoría, marca, talla y búsqueda y lleva al catálogo completo.

PASO NUEVO: ejecuta tienda_visual.sql una sola vez en Supabase SQL Editor antes de probar la administración visual.


CAMBIO V8.4.1 — ORDEN AUTOMÁTICO
- El campo Orden de categorías visuales se llena automáticamente con el siguiente número disponible (máximo actual + 1).
- El campo Orden de marcas también se llena automáticamente con el siguiente número disponible.
- Ambos campos siguen siendo editables para permitir cambiar manualmente la posición.
- No se modificó el diseño público ni el funcionamiento de las demás secciones.

V8.4: el menú lateral de Categorías ahora contiene las opciones Ver categorías, Agregar categoría y Agregar marca como submenú, manteniendo las pantallas separadas.


Menú del administrador actualizado: Categorías, Agregar categoría y Agregar marca ahora son opciones principales al mismo nivel que Productos y Configuración.
