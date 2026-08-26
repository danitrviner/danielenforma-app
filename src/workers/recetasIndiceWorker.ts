import { hidratarEntradaIndice } from '../db/recetasHidratacion';
import { Recipe } from '../types';

/**
 * Hace fuera del hilo principal lo único caro de verdad de
 * `cargarIndiceRecetas()`: parsear los ~4,7 MB de `recetas-indice.json` y
 * pasar sus 8.850 entradas por `hidratarEntradaIndice`. Antes ese
 * `JSON.parse` + `.map()` bloqueaba la pantalla varios cientos de ms al
 * abrir Recetas por primera vez en un móvil.
 *
 * El `fetch()` en sí se queda en `cargarIndiceRecetas()` (hilo principal):
 * así los tests que mockean `fetch` global siguen funcionando sin tener que
 * simular un Worker, y lo que de verdad pesa (parsear el texto) es lo único
 * que cruza el `postMessage`.
 *
 * Sin tipos de lib "webworker" a propósito (el tsconfig del proyecto usa
 * "DOM", que no se puede mezclar con "webworker" en el mismo `tsc`) — de ahí
 * los `as any` puntuales en `self`. El contrato de mensajes es mínimo (un
 * string de entrada, un array o un error de salida), así que no hace falta
 * más.
 */
type MensajeEntrada = { texto: string };
type MensajeSalida = { recetas: Recipe[] } | { error: string };

(self as any).onmessage = (evento: MessageEvent<MensajeEntrada>) => {
  try {
    const datos = JSON.parse(evento.data.texto) as { recetas?: Recipe[] };
    const recetas = (datos.recetas ?? []).map(hidratarEntradaIndice);
    (self as any).postMessage({ recetas } satisfies MensajeSalida);
  } catch (err) {
    (self as any).postMessage({ error: err instanceof Error ? err.message : 'Error parseando el índice' } satisfies MensajeSalida);
  }
};
