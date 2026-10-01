// «Día flexible» (decisión de Dani, 10-2026): para los días en los que el
// atleta no sabe cuántas veces va a comer, deja de repartir por comidas y
// apunta lo que vaya comiendo contra el cupo del día entero. Por debajo sigue
// viviendo en la misma forma que un día normal —`DietCompletionLog.meals`—
// para no abrir un segundo formato de guardado: es UNA sola comida sintética
// con todo lo apuntado, marcada con `modoFlexible` en el propio registro.
//
// Las dos funciones de aquí son la conversión ida y vuelta, PURAS a propósito
// (sin tocar Firestore ni estado de React): la pantalla las llama al cambiar
// de modo en el selector de "Editar reparto por comida".
import { DietItem, DietMeal } from '../types';
import { filasDeComida } from './filasDelPlan';

/** Mismo shape que `ItemState` de dietHelpers.ts (`${mealId}_${idx}` → estado),
 *  repetido aquí para no acoplar un util puro a components/. */
export type EstadoItem = { foodLabel: string; done: boolean };
export type EstadosPorClave = Record<string, EstadoItem>;

export const ID_COMIDA_FLEXIBLE = 'flexible';
export const NOMBRE_COMIDA_FLEXIBLE = 'Lo que voy comiendo';

/** "HH:mm" del momento en que se llama — hora LOCAL, para que coincida con lo
 *  que el atleta ve en el reloj del móvil al apuntar algo. */
export function horaActualHHMM(d: Date = new Date()): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * De "Por comidas" a "Día flexible": junta TODO lo colocado —en el orden en
 * que ya estaba, comida a comida— en una sola comida sintética.
 *
 * El orden de concatenación es lo que mantiene las recetas agrupadas: dentro
 * de cada comida, `filasDeComida` ya exige que los ítems de una receta sean
 * CONTIGUOS, y concatenar comida a comida sin reordenar conserva esa
 * contigüidad. Reordenar aquí por nombre o por categoría la habría roto.
 */
export function aDiaFlexible(
  meals: DietMeal[],
  estados: EstadosPorClave,
): { meals: DietMeal[]; estados: EstadosPorClave } {
  const items: DietItem[] = [];
  const nuevosEstados: EstadosPorClave = {};
  for (const meal of meals) {
    meal.items.forEach((item, idx) => {
      const claveVieja = `${meal.id}_${idx}`;
      const nuevoIdx = items.length;
      items.push(item);
      const previo = estados[claveVieja];
      nuevosEstados[`${ID_COMIDA_FLEXIBLE}_${nuevoIdx}`] = previo ?? { foodLabel: item.foodLabel, done: true };
    });
  }
  const comidaFlexible: DietMeal = { id: ID_COMIDA_FLEXIBLE, name: NOMBRE_COMIDA_FLEXIBLE, items };
  return { meals: [comidaFlexible], estados: nuevosEstados };
}

/**
 * De "Día flexible" a "Por comidas": decisión de Dani — todo lo apuntado va a
 * la PRIMERA comida de la estructura del plan (`estructura`, la misma que
 * siembra `sembrarDiaDelPlan`/`estructuraDeDia` para un día nuevo, CON sus
 * repartos). El arrastre entre comidas (arrastreEntreComidas.ts) se encarga
 * después de mover a las demás lo que esa primera comida se pase o le falte.
 *
 * Si la estructura viene vacía (no debería, siempre hay al menos una comida
 * por defecto) se crea un hueco de emergencia para no perder lo apuntado.
 */
export function aPorComidas(
  meals: DietMeal[],
  estados: EstadosPorClave,
  estructura: DietMeal[],
): { meals: DietMeal[]; estados: EstadosPorClave } {
  const items: DietItem[] = meals.flatMap(m => m.items);
  const destino = estructura.length > 0 ? estructura : [{ id: ID_COMIDA_FLEXIBLE, name: NOMBRE_COMIDA_FLEXIBLE, items: [] as DietItem[] }];
  const [primera, ...resto] = destino;

  // Las claves viejas son `${mealId}_${idx}`; como `items` sale de concatenar
  // las comidas en el mismo orden, el idx de origen coincide 1:1 con la
  // posición en `items` — basta recorrer en orden, sin casar por id.
  const estadosViejosEnOrden: EstadoItem[] = [];
  for (const meal of meals) {
    meal.items.forEach((item, idx) => {
      estadosViejosEnOrden.push(estados[`${meal.id}_${idx}`] ?? { foodLabel: item.foodLabel, done: true });
    });
  }

  const nuevosEstados: EstadosPorClave = {};
  items.forEach((item, idx) => {
    nuevosEstados[`${primera.id}_${idx}`] = estadosViejosEnOrden[idx] ?? { foodLabel: item.foodLabel, done: true };
  });

  // El resto vuelve VACÍO, solo con su reparto: si el plan del coach trae
  // alimentos ya colocados, esos mismos alimentos ya vienen dentro de lo
  // apuntado en flexible, y conservarlos aquí los contaría dos veces.
  const primeraConTodo: DietMeal = { ...primera, items };
  return { meals: [primeraConTodo, ...resto.map(m => ({ ...m, items: [] }))], estados: nuevosEstados };
}

/** Type guard sobre `DietItem.hora` — para no repetir el `typeof ... ===
 *  'string' && ...length > 0` en cada sitio que decide si pintar la hora. */
export function itemTieneHora(item: DietItem): item is DietItem & { hora: string } {
  return typeof item.hora === 'string' && item.hora.length > 0;
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
