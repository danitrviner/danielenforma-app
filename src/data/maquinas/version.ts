/**
 * Versión del catálogo publicado. Vive en su propio módulo, separada de
 * `index.ts`, porque `index.ts` importa los JSON de las marcas: cualquiera que
 * necesite solo la versión se traería con ella los 28 KB del catálogo entero.
 *
 * Se sube a mano cada vez que cambia el contenido de la semilla. Un atleta que
 * ya completó el catálogo con una versión anterior vuelve a tener máquinas
 * pendientes (solo las nuevas) en vez de quedarse en `completado` para siempre.
 */
export const CATALOGO_VERSION = '2026-08-07.1';
