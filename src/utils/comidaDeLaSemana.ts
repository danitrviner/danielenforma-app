import type { BudgetVec, Diet, DietCompletionLog, FoodCategory } from '../types';
import { comidasDelDia, cupoDelDia } from './diaDeDieta';
import { addToPlaced, itemWeightLabel, foodNameShort, round2 } from './exchangeHelpers';
import { exchangeToKcal } from './nutritionConstants';
import { addDays, diasEntreFechas } from './trainingWeek';

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
  marcado: boolean;
  origen: OrigenItem;
}

export interface ComidaDelDia {
  id: string;
  nombre: string;
  slot?: number;
  items: ItemComido[];
  /** Intercambios de los items MARCADOS de esta comida. */
  comido: BudgetVec;
}

export interface DiaComido {
  fecha: string;
  /** `false` = no hay registro ninguno de ese día. Distinto de un día vacío a propósito. */
  registrado: boolean;
  comidas: ComidaDelDia[];
  /** Intercambios marcados como comidos. */
  comido: BudgetVec;
  /** Intercambios que había puestos en el día, marcados o no. */
  puesto: BudgetVec;
  cupo: BudgetVec;
  kcalComido: number;
  kcalCupo: number;
  /** comido − cupo, sumando las tres categorías. Positivo = se pasó. */
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
  /** Media de `desvio` de los días registrados, en intercambios. */
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

const CERO: BudgetVec = { HC: 0, PROT: 0, GRASA: 0 };

/** Un día se da por «en objetivo» si no se pasa ni se queda corto por más de esto. */
export const TOLERANCIA_DIA = 1;

function vec(p: Record<FoodCategory, number>): BudgetVec {
  return { HC: round2(p.HC), PROT: round2(p.PROT), GRASA: round2(p.GRASA) };
}

function sumar(a: BudgetVec, b: BudgetVec): BudgetVec {
  return { HC: round2(a.HC + b.HC), PROT: round2(a.PROT + b.PROT), GRASA: round2(a.GRASA + b.GRASA) };
}

function total(v: BudgetVec): number {
  return round2(v.HC + v.PROT + v.GRASA);
}

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
  const cupoBruto = cupoDelDia(log, diets);
  const cupo: BudgetVec = { HC: cupoBruto.HC ?? 0, PROT: cupoBruto.PROT ?? 0, GRASA: cupoBruto.GRASA ?? 0 };

  if (!log) {
    return {
      fecha, registrado: false, comidas: [],
      comido: CERO, puesto: CERO, cupo,
      kcalComido: 0, kcalCupo: Math.round(exchangeToKcal(cupo)),
      desvio: round2(-total(cupo)), items: 0, itemsMarcados: 0,
    };
  }

  const marcados = new Set(log.doneItemIds ?? []);
  const comidas: ComidaDelDia[] = [];
  const acumComido: Record<FoodCategory, number> = { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 };
  const acumPuesto: Record<FoodCategory, number> = { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 };
  let items = 0;
  let itemsMarcados = 0;

  for (const meal of comidasDelDia(log, diets)) {
    const porComida: Record<FoodCategory, number> = { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 };
    const lineas: ItemComido[] = meal.items.map((item, idx) => {
      // La clave de «marcado» es posicional (`${mealId}_${idx}`) — es la misma
      // que escribe el tracker del atleta, así que se replica tal cual.
      const marcado = marcados.has(`${meal.id}_${idx}`);
      items++;
      addToPlaced(acumPuesto, item.category, item.quantity);
      if (marcado) {
        itemsMarcados++;
        addToPlaced(acumComido, item.category, item.quantity);
        addToPlaced(porComida, item.category, item.quantity);
      }
      return {
        etiqueta: foodNameShort(item.foodLabel),
        etiquetaCompleta: item.foodLabel,
        peso: itemWeightLabel(item.foodLabel, item.quantity),
        categoria: item.category,
        cantidad: item.quantity,
        marcado,
        origen: origenDe(item),
      };
    });
    comidas.push({ id: meal.id, nombre: meal.name, slot: meal.slot, items: lineas, comido: vec(porComida) });
  }

  const comido = vec(acumComido);
  return {
    fecha, registrado: true, comidas,
    comido, puesto: vec(acumPuesto), cupo,
    kcalComido: Math.round(exchangeToKcal(comido)),
    kcalCupo: Math.round(exchangeToKcal(cupo)),
    desvio: round2(total(comido) - total(cupo)),
    items, itemsMarcados,
  };
}

function construirPatrones(dias: DiaComido[]): PatronesComida {
  const registrados = dias.filter(d => d.registrado);
  const sinRegistrar = dias.length - registrados.length;

  // Un día sin cupo pautado no se puede juzgar: no hay objetivo contra el que
  // decir si se pasó o se quedó corto. Cuenta como registrado, pero no entra
  // en el reparto de «por encima / por debajo / en objetivo».
  const juzgables = registrados.filter(d => total(d.cupo) > 0);
  const porEncima = juzgables.filter(d => d.desvio > TOLERANCIA_DIA).length;
  const porDebajo = juzgables.filter(d => d.desvio < -TOLERANCIA_DIA).length;

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

  // Desvío por ingesta: cuánto se separa cada comida de su objetivo. Solo tiene
  // sentido cuando el coach repartió el cupo por comida (`meal.target`); sin
  // reparto no hay objetivo por ingesta y la fila no sale.
  const porNombre = new Map<string, number[]>();
  for (const d of registrados) {
    for (const c of d.comidas) {
      const objetivo = d.comidas.length > 0 ? total(d.cupo) / d.comidas.length : 0;
      if (objetivo <= 0) continue;
      const lista = porNombre.get(c.nombre) ?? [];
      lista.push(round2(total(c.comido) - objetivo));
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
export function totalesDeLaVentana(comida: ComidaDeLaSemana): { comido: BudgetVec; cupo: BudgetVec } {
  let comido = CERO;
  let cupo = CERO;
  for (const d of comida.dias) {
    if (!d.registrado) continue;
    comido = sumar(comido, d.comido);
    cupo = sumar(cupo, d.cupo);
  }
  return { comido, cupo };
}
