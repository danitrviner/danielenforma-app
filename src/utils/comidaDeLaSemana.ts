import type { Diet, DietCompletionLog, DietItem, FoodCategory, Macros } from '../types';
import { comidasDelDia, cupoDelDia, toleranciaDelDiaKcal, BANDA_EN_OBJETIVO_MIN_KCAL } from './diaDeDieta';
import { itemWeightLabel, foodNameShort, round2 } from './exchangeHelpers';
import { macrosDeIntercambios, macrosDeLinea, macrosDeLineas, objetivoDelRegistro } from './macrosLegado';
import { MACROS_CERO, redondearMacros, sumarMacros } from './macros';
import { addDays, diasEntreFechas } from './trainingWeek';
import { slotPercents } from './slotWeights';

// ═══════════════════════════════════════════════════════════════════════════
// QUÉ HA COMIDO — el registro de comida del atleta, listo para contárselo.
//
// Petición de Dani (16-09-2026): poder ver desde la Revisión qué ha comido el
// atleta durante la ventana, «lo que ha marcado y la selección de alimentos que
// ha hecho». No es un resumen de adherencia: es el detalle real, plato a plato.
//
// Todo sale de `dietCompletionLogs`, que desde 09-2026 congela en cada día sus
// propias comidas y su propio cupo (ver `DietCompletionLog.meals` en types.ts).
// Los días anteriores a ese cambio no los traen: `comidasDelDia`/`cupoDelDia`
// caen a la dieta a la que apuntaban, así que el histórico viejo se lee igual
// aunque sea menos fiel. Aquí no se decide nada de eso, solo se compone.
//
// ── Por qué la marca de «comido» informa poco, y qué se mira en su lugar ────
// En «Mi plan» todo lo que el atleta añade nace ya marcado (decisión de Dani:
// si te lo pones en el día es porque te lo has comido). O sea que `doneItemIds`
// casi siempre cubre el día entero y distinguir marcado de no marcado no dice
// gran cosa. Lo que sí dice es la SELECCIÓN: qué alimentos eligió, cuánto pesan
// y de dónde salieron (una receta, el menú semanal, o puestos a mano). Por eso
// se calculan las dos cosas —`comido` y `puesto`— y la pantalla enseña el
// detalle, no solo el porcentaje.
// ═══════════════════════════════════════════════════════════════════════════

/** De dónde salió una línea del día. Contesta «¿sigue el plan o se lo monta él?». */
export type OrigenItem = 'receta' | 'menu' | 'mano';

export interface ItemComido {
  /** Nombre corto, sin los gramos incrustados ni la coletilla entre paréntesis. */
  etiqueta: string;
  /** Etiqueta completa, por si hace falta el detalle. */
  etiquetaCompleta: string;
  /** «150g» cuando el alimento trae su peso base; si no, «×2». */
  peso: string;
  categoria: FoodCategory;
  cantidad: number;
  /** kcal de la línea (las de su etiqueta, o por sus intercambios). */
  kcal: number;
  marcado: boolean;
  origen: OrigenItem;
}

export interface ComidaDelDia {
  id: string;
  nombre: string;
  slot?: number;
  items: ItemComido[];
  /** kcal y gramos de los items MARCADOS de esta comida. */
  comido: Macros;
}

export interface DiaComido {
  fecha: string;
  /** `false` = no hay registro ninguno de ese día. Distinto de un día vacío a propósito. */
  registrado: boolean;
  comidas: ComidaDelDia[];
  /** kcal y gramos marcados como comidos. */
  comido: Macros;
  /** kcal y gramos que había puestos en el día, marcados o no. */
  puesto: Macros;
  /** Objetivo de ese día (el congelado, o el cupo viejo traducido). */
  cupo: Macros;
  kcalComido: number;
  kcalCupo: number;
  /** kcal comidas − kcal del objetivo. Positivo = se pasó. */
  desvio: number;
  /** Cuántos items hay y cuántos están marcados — para poder decir «12 de 14». */
  items: number;
  itemsMarcados: number;
}

export interface PatronesComida {
  diasRegistrados: number;
  diasSinRegistrar: number;
  diasPorEncima: number;
  diasPorDebajo: number;
  diasEnObjetivo: number;
  /** Media de `desvio` de los días registrados, en kcal. */
  desvioMedio: number;
  /** Media de kcal comidas frente al cupo, de los días registrados. */
  kcalMediaComido: number;
  kcalMediaCupo: number;
  /** Los alimentos que más repite en la ventana, de más a menos. */
  alimentosFrecuentes: { etiqueta: string; veces: number; dias: number }[];
  /** En qué comida se le va el cupo: desvío medio por nombre de ingesta. */
  porComida: { nombre: string; desvioMedio: number; dias: number }[];
  /** Cuántas líneas vinieron de cada sitio, en toda la ventana. */
  porOrigen: Record<OrigenItem, number>;
}

export interface ComidaDeLaSemana {
  dias: DiaComido[];
  patrones: PatronesComida;
}

/** Mínimo del margen de «día en objetivo», en kcal. El margen real es
 *  `toleranciaDelDiaKcal` (10 % del objetivo o esto, lo que sea mayor). */
export const TOLERANCIA_DIA = BANDA_EN_OBJETIVO_MIN_KCAL;

/** Todas las fechas de la ventana, incluidos los dos extremos. */
function fechasDeLaVentana(desde: string, hasta: string): string[] {
  const dias = diasEntreFechas(desde, hasta);
  if (dias < 0) return [];
  return Array.from({ length: dias + 1 }, (_, i) => addDays(desde, i));
}

function origenDe(item: { originRecipeId?: string; origenMenu?: string }): OrigenItem {
  if (item.origenMenu) return 'menu';
  if (item.originRecipeId) return 'receta';
  return 'mano';
}

/** El día tal y como quedó registrado, o un día vacío si no hay registro. */
function construirDia(fecha: string, log: DietCompletionLog | undefined, diets: Diet[]): DiaComido {
  const cupo = redondearMacros((log ? objetivoDelRegistro(log) : null) ?? macrosDeIntercambios(cupoDelDia(log, diets)));

  if (!log) {
    return {
      fecha, registrado: false, comidas: [],
      comido: { ...MACROS_CERO }, puesto: { ...MACROS_CERO }, cupo,
      kcalComido: 0, kcalCupo: Math.round(cupo.kcal),
      desvio: -Math.round(cupo.kcal), items: 0, itemsMarcados: 0,
    };
  }

  const marcados = new Set(log.doneItemIds ?? []);
  const comidas: ComidaDelDia[] = [];
  const todosComidos: DietItem[] = [];
  const todosPuestos: DietItem[] = [];
  let items = 0;
  let itemsMarcados = 0;

  for (const meal of comidasDelDia(log, diets)) {
    const comidosAqui: DietItem[] = [];
    const lineas: ItemComido[] = meal.items.map((item, idx) => {
      // La clave de «marcado» es posicional (`${mealId}_${idx}`) — es la misma
      // que escribe el tracker del atleta, así que se replica tal cual.
      const marcado = marcados.has(`${meal.id}_${idx}`);
      items++;
      todosPuestos.push(item);
      if (marcado) {
        itemsMarcados++;
        todosComidos.push(item);
        comidosAqui.push(item);
      }
      return {
        etiqueta: foodNameShort(item.foodLabel),
        etiquetaCompleta: item.foodLabel,
        peso: itemWeightLabel(item.foodLabel, item.quantity),
        categoria: item.category,
        cantidad: item.quantity,
        kcal: Math.round(macrosDeLinea(item).kcal),
        marcado,
        origen: origenDe(item),
      };
    });
    comidas.push({ id: meal.id, nombre: meal.name, slot: meal.slot, items: lineas, comido: redondearMacros(macrosDeLineas(comidosAqui)) });
  }

  const comido = redondearMacros(macrosDeLineas(todosComidos));
  return {
    fecha, registrado: true, comidas,
    comido, puesto: redondearMacros(macrosDeLineas(todosPuestos)), cupo,
    kcalComido: Math.round(comido.kcal),
    kcalCupo: Math.round(cupo.kcal),
    desvio: Math.round(comido.kcal - cupo.kcal),
    items, itemsMarcados,
  };
}

function construirPatrones(dias: DiaComido[]): PatronesComida {
  const registrados = dias.filter(d => d.registrado);
  const sinRegistrar = dias.length - registrados.length;

  // Un día sin cupo pautado no se puede juzgar: no hay objetivo contra el que
  // decir si se pasó o se quedó corto. Cuenta como registrado, pero no entra
  // en el reparto de «por encima / por debajo / en objetivo».
  const juzgables = registrados.filter(d => d.cupo.kcal > 0);
  const porEncima = juzgables.filter(d => d.desvio > toleranciaDelDiaKcal(d.cupo.kcal)).length;
  const porDebajo = juzgables.filter(d => d.desvio < -toleranciaDelDiaKcal(d.cupo.kcal)).length;

  const media = (nums: number[]) => (nums.length === 0 ? 0 : round2(nums.reduce((s, n) => s + n, 0) / nums.length));

  // Alimentos más repetidos. Se cuenta por etiqueta corta —«arroz», no «30g
  // arroz, pasta…»— para que dos raciones distintas del mismo alimento sumen.
  const vecesPorAlimento = new Map<string, { veces: number; dias: Set<string> }>();
  for (const d of registrados) {
    for (const c of d.comidas) {
      for (const it of c.items) {
        const e = vecesPorAlimento.get(it.etiqueta) ?? { veces: 0, dias: new Set<string>() };
        e.veces++;
        e.dias.add(d.fecha);
        vecesPorAlimento.set(it.etiqueta, e);
      }
    }
  }
  const alimentosFrecuentes = [...vecesPorAlimento.entries()]
    .map(([etiqueta, { veces, dias: d }]) => ({ etiqueta, veces, dias: d.size }))
    .sort((a, b) => b.veces - a.veces || a.etiqueta.localeCompare(b.etiqueta))
    .slice(0, 10);

  // Desvío por ingesta, en kcal: cuánto se separa cada comida de su parte del
  // día. Su parte es la de su franja (`slotPercents`: desayuno 20 %, comida
  // 38 %…) cuando todas las comidas la traen; si no, a partes iguales. A
  // partes iguales la cena salía siempre «por encima» (B4, 26-10-2026).
  const porNombre = new Map<string, number[]>();
  for (const d of registrados) {
    const slots = d.comidas.map(c => c.slot);
    const conFranja = slots.length > 0 && slots.every((s): s is number => typeof s === 'number');
    const pesos = conFranja ? slotPercents(slots as number[]) : null;
    for (const [i, c] of d.comidas.entries()) {
      const objetivo = pesos ? d.cupo.kcal * pesos[i] / 100 : d.comidas.length > 0 ? d.cupo.kcal / d.comidas.length : 0;
      if (objetivo <= 0) continue;
      const lista = porNombre.get(c.nombre) ?? [];
      lista.push(Math.round(c.comido.kcal - objetivo));
      porNombre.set(c.nombre, lista);
    }
  }
  const porComida = [...porNombre.entries()]
    .map(([nombre, desvios]) => ({ nombre, desvioMedio: media(desvios), dias: desvios.length }))
    .sort((a, b) => Math.abs(b.desvioMedio) - Math.abs(a.desvioMedio));

  const porOrigen: Record<OrigenItem, number> = { receta: 0, menu: 0, mano: 0 };
  for (const d of registrados) for (const c of d.comidas) for (const it of c.items) porOrigen[it.origen]++;

  return {
    diasRegistrados: registrados.length,
    diasSinRegistrar: sinRegistrar,
    diasPorEncima: porEncima,
    diasPorDebajo: porDebajo,
    diasEnObjetivo: juzgables.length - porEncima - porDebajo,
    desvioMedio: media(registrados.map(d => d.desvio)),
    kcalMediaComido: Math.round(media(registrados.map(d => d.kcalComido))),
    kcalMediaCupo: Math.round(media(registrados.map(d => d.kcalCupo))),
    alimentosFrecuentes,
    porComida,
    porOrigen,
  };
}

export interface ComidaDeLaSemanaParams {
  logs: DietCompletionLog[];
  /** Solo hacen falta para los días anteriores a 09-2026, que no congelaron sus comidas. */
  diets: Diet[];
  desde: string;
  hasta: string;
}

/**
 * Qué ha comido el atleta en la ventana, día a día y con sus patrones.
 *
 * Devuelve TODOS los días de la ventana, también los que no tienen registro:
 * un hueco es información («no apuntó nada de jueves a domingo»), y si solo se
 * devolvieran los días con datos la pantalla daría a entender que la semana
 * estuvo completa.
 */
export function construirComidaDeLaSemana(params: ComidaDeLaSemanaParams): ComidaDeLaSemana {
  const { logs, diets, desde, hasta } = params;
  const porFecha = new Map<string, DietCompletionLog>();
  for (const log of logs) {
    if (log.date < desde || log.date > hasta) continue;
    // Si hubiera dos registros del mismo día, manda el guardado más tarde.
    const previo = porFecha.get(log.date);
    if (!previo || (log.updatedAt ?? '') >= (previo.updatedAt ?? '')) porFecha.set(log.date, log);
  }

  const dias = fechasDeLaVentana(desde, hasta).map(f => construirDia(f, porFecha.get(f), diets));
  return { dias, patrones: construirPatrones(dias) };
}

/** Lo comido y el cupo de toda la ventana, para la cabecera del bloque. */
export function totalesDeLaVentana(comida: ComidaDeLaSemana): { comido: Macros; cupo: Macros } {
  const registrados = comida.dias.filter(d => d.registrado);
  return {
    comido: redondearMacros(sumarMacros(...registrados.map(d => d.comido))),
    cupo: redondearMacros(sumarMacros(...registrados.map(d => d.cupo))),
  };
}
