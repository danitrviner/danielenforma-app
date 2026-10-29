// Tools del asistente. Hasta el 28-10-2026 este archivo tenía casi 4.000 líneas
// con definiciones, lectores, propuestas y despachador juntos; ahora vive en
// ./tools/ partido por lo que hace cada pieza (ver docs/autopiloto-tanda-1.md).
// Este módulo solo reexporta lo que el bucle de agente y el panel necesitan,
// para que nadie tenga que cambiar sus imports.
export { TOOL_DEFINITIONS, toolStatusLabel } from './tools/definiciones.js';
export { executeTool } from './tools/despachador.js';

// La app registra su fuente de datos al importar la puerta: a partir de aquí
// las tools leen y escriben con `dbService`, bajo la sesión del coach.
import { usarFuenteDeDatos } from './tools/datos';
import { fuenteCliente } from './tools/fuenteCliente';
usarFuenteDeDatos(fuenteCliente);
