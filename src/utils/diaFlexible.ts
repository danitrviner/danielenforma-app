// «Día flexible» (10-2026): días guardados como UNA sola comida sintética con
// todo lo apuntado, marcada con `modoFlexible` en el registro. Desde que todo
// va en kcal (26-10-2026) ya no se cambia de modo: estos días se siguen
// leyendo, en orden de hora, y lo nuevo se apunta con su hora.
import { DietItem } from '../types';
import { filasDeComida } from './filasDelPlan';

/** "HH:mm" del momento en que se llama — hora LOCAL, para que coincida con lo
 *  que el atleta ve en el reloj del móvil al apuntar algo. */
export function horaActualHHMM(d: Date = new Date()): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Las filas de la comida flexible (alimentos y recetas agrupadas, vía
 * `filasDeComida`) en orden CRONOLÓGICO: por la hora del primer ítem de cada
 * fila, y las que no tienen hora al final, en el orden en que ya estaban
 * entre sí (`Array.prototype.sort` de JS es estable).
 */
export function filasEnOrdenCronologico(items: DietItem[]) {
  const filas = filasDeComida(items);
  const horaDeFila = (fila: ReturnType<typeof filasDeComida>[number]): string | null => {
    const primerIdx = fila.tipo === 'alimento' ? fila.idx : fila.idxs[0];
    const hora = items[primerIdx]?.hora;
    return hora && hora.length > 0 ? hora : null;
  };
  return [...filas].sort((a, b) => {
    const ha = horaDeFila(a);
    const hb = horaDeFila(b);
    if (ha == null && hb == null) return 0;
    if (ha == null) return 1;  // sin hora, al final
    if (hb == null) return -1;
    return ha.localeCompare(hb);
  });
}
