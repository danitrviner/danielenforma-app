// La puerta de las tools para el SERVIDOR: las mismas definiciones y el mismo
// despachador que `./tools.ts`, pero SIN registrar la fuente de datos de
// cliente (que arrastra el SDK de Firebase del navegador). Quien importe esto
// tiene que llamar a `usarFuenteDeDatos(fuenteAdmin(db, uid))` antes de
// ejecutar nada; si no, `executeTool` lanza con un mensaje que lo dice.
export { TOOL_DEFINITIONS, toolStatusLabel } from './tools/definiciones.js';
export { executeTool } from './tools/despachador.js';
export { usarFuenteDeDatos, hayFuenteDeDatos } from './tools/datos.js';
