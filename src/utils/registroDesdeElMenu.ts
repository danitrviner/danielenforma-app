import type { DietItem, DietMeal, FoodCategory } from '../types';

/**
 * Llevar una comida del menú semanal al registro del día ("Mi plan"), y
 * quitarla si el atleta se desmarca.
 *
 * Por qué existe (07-09-2026, queja real de una atleta): marcaba el sándwich en
 * «Mi Menú», le salía verde y tachado —el aspecto universal de "ya está
 * registrado"— se iba a «Mi plan» y no había subido ni una caloría. Eran dos
 * registros distintos que no se hablaban: el menú guardaba una marca y el plan
 * guardaba la comida con sus intercambios.
 *
 * La regla que evita contar dos veces es la MARCA DE ORIGEN: cada ítem que
 * entra por aquí lleva `origenMenu` con la clave de la comida del menú
 * (`${día}_${idComida}`). Con eso:
 *
 *  · Marcar dos veces no suma dos veces — si ya hay ítems con esa marca, no se
 *    toca nada.
 *  · Desmarcar quita exactamente lo que se puso, y solo eso: lo que la atleta
 *    hubiera apuntado a mano en esa misma comida se queda donde está.
 *
 * Es una función pura sobre el día: quien la llama decide cuándo guardar.
 */

export interface DiaDelPlan {
  meals: DietMeal[];
  doneItemIds: string[];
}

export interface ComidaDelMenu {
  /** `${día}_${idComida}` — identifica la comida del menú, no la receta: la
   *  misma receta puede estar en el desayuno y en la cena. */
  clave: string;
  /** "Desayuno", "Merienda"… para emparejarla con la comida del plan. */
  nombre: string;
  /** Franja 1-5. Manda sobre el nombre al emparejar. */
  slot?: number;
  /** Lo que se come, ya escalado y con acompañamientos incluidos. */
  intercambios: Partial<Record<FoodCategory, number>>;
  /** Con qué nombre aparece en el plan. */
  etiqueta: string;
}

function comidaDestino(meals: DietMeal[], comida: ComidaDelMenu): DietMeal | null {
  return meals.find(m => comida.slot != null && m.slot === comida.slot)
    ?? meals.find(m => m.name.toLowerCase() === comida.nombre.toLowerCase())
    ?? null;
}

/** ¿Esta comida del menú ya está registrada en el día? */
export function yaRegistrada(dia: DiaDelPlan, clave: string): boolean {
  return dia.meals.some(m => m.items.some(i => i.origenMenu === clave));
}

export function registrarComidaDelMenu(dia: DiaDelPlan, comida: ComidaDelMenu): DiaDelPlan {
  if (yaRegistrada(dia, comida.clave)) return dia;

  const nuevos: DietItem[] = (Object.entries(comida.intercambios) as [FoodCategory, number][])
    .filter(([, q]) => q > 0)
    .map(([category, quantity]) => ({
      category,
      foodLabel: comida.etiqueta,
      quantity,
      origenMenu: comida.clave,
    }));
  if (nuevos.length === 0) return dia;

  const destino = comidaDestino(dia.meals, comida);
  // Si el día no tiene esa comida (la atleta come 4 veces y el menú trae 5),
  // se añade en vez de meterla a la fuerza en otra: registrar la merienda
  // dentro de la cena es peor que crear la merienda.
  const meals = destino
    ? dia.meals.map(m => m.id === destino.id ? { ...m, items: [...m.items, ...nuevos] } : m)
    : [...dia.meals, {
        id: `menu_${comida.clave}`,
        name: comida.nombre,
        slot: comida.slot,
        items: nuevos,
      }];

  const mealId = destino ? destino.id : `menu_${comida.clave}`;
  const desde = destino ? destino.items.length : 0;
  const doneItemIds = [
    ...dia.doneItemIds,
    ...nuevos.map((_, i) => `${mealId}_${desde + i}`),
  ];
  return { meals, doneItemIds };
}

export function quitarComidaDelMenu(dia: DiaDelPlan, clave: string): DiaDelPlan {
  if (!yaRegistrada(dia, clave)) return dia;

  const hechos = new Set(dia.doneItemIds);
  const meals: DietMeal[] = [];
  const doneItemIds: string[] = [];

  for (const meal of dia.meals) {
    const quedan: DietItem[] = [];
    meal.items.forEach((item, idx) => {
      if (item.origenMenu === clave) return;              // este se va
      if (hechos.has(`${meal.id}_${idx}`)) {
        doneItemIds.push(`${meal.id}_${quedan.length}`);  // reindexado
      }
      quedan.push(item);
    });
    // Una comida que solo existía porque la creó el menú desaparece con él; una
    // que ya estaba en el día se queda, aunque quede vacía.
    if (quedan.length === 0 && meal.id === `menu_${clave}`) continue;
    meals.push({ ...meal, items: quedan });
  }
  return { meals, doneItemIds };
}
