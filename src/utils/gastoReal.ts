import type { BodyweightLog, Diet, DietCompletionLog, FoodCategory } from '../types.js';
import { comidasDelDia } from './diaDeDieta.js';
import { addToPlaced } from './exchangeHelpers.js';
import { exchangeToKcal } from './nutritionConstants.js';
import { addDays } from './trainingWeek.js';
import { ObjetivoCorporalTipo, RANGO_PCT_SEMANA, pendiente } from './verificacionObjetivo.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Gasto real: lo que quema de verdad, sacado de lo que come y lo que pesa

   Mifflin es una media de población: a dos personas con el mismo peso, altura
   y edad les da el mismo número, y pueden separarse 300-400 kcal. Aquí se
   despeja el gasto de la única identidad que no depende de fórmulas:

       gasto/día = kcal comidas/día − (cambio de peso kg/día × 7.700)

   «Come 2.500 y no se mueve → gasta 2.500. Come 2.500 y baja medio kilo a la
   semana → gasta unas 3.050.»

   Es el GASTO TOTAL (mantenimiento), no la basal: la basal no se puede separar
   del resto (pasos, entreno, digestión) con peso y comida. Y es la que sirve
   para pautar kcal.

   Dos trampas, las dos decididas con Dani (09-2026):
     · Días sin registrar → no se inventan. Solo cuentan las semanas con 5 o
       más días registrados; la media de kcal sale solo de días registrados.
     · Infra-registro (marca el arroz, no el picoteo) → el gasto sale bajo. Si
       queda más de un 25 % por debajo de la fórmula, se avisa en vez de
       enseñarlo como verdad.
   Mientras no hay datos suficientes, se enseña el de la fórmula marcado como
   ESTIMADO, nunca como real.
   ═══════════════════════════════════════════════════════════════════════════ */

const KCAL_POR_KG = 7700;
/** Semanas que se miran para UN cálculo de gasto. */
export const VENTANA_GASTO_SEMANAS = 4;
/** Días registrados que hacen falta para que una semana cuente. */
export const DIAS_MINIMOS_SEMANA = 5;
/** Por debajo de esta fracción de la fórmula se sospecha infra-registro. */
const UMBRAL_INFRA_REGISTRO = 0.75;

// ── Kcal de un día ───────────────────────────────────────────────────────────

/**
 * Kcal que el atleta marcó como comidas ese día (intercambios × sus kcal).
 * `null` si no marcó nada: un día sin marcas es un día sin registrar, no un
 * día de ayuno.
 */
export function kcalDelDia(log: DietCompletionLog | null | undefined, diets: Diet[]): number | null {
  if (!log || !log.doneItemIds?.length) return null;
  const marcados = new Set(log.doneItemIds);
  const comidos = { HC: 0, PROT: 0, GRASA: 0 };
  let alguno = false;
  for (const [i, comida] of comidasDelDia(log, diets).entries()) {
    comida.items.forEach((item, j) => {
      // Misma convención de ids que la pantalla del atleta y la adherencia.
      if (!marcados.has(`${comida.id}_${j}`) && !marcados.has(`${i}_${j}`)) return;
      addToPlaced(comidos as unknown as Record<FoodCategory, number>, item.category, item.quantity);
      alguno = true;
    });
  }
  if (!alguno) return null;
  return exchangeToKcal(comidos);
}

// ── El cálculo ───────────────────────────────────────────────────────────────

export type ConfianzaGasto = 'alta' | 'media' | 'insuficiente';

export interface GastoReal {
  /** Gasto total real en kcal/día, o null si no hay datos para calcularlo. */
  kcal: number | null;
  /** Margen ± en kcal/día. */
  margen: number | null;
  confianza: ConfianzaGasto;
  /** Media de kcal comidas en los días registrados que cuentan. */
  kcalComidas: number | null;
  /** Cambio de peso de la tendencia, kg/semana. */
  cambioKgSemana: number | null;
  semanasValidas: number;
  diasRegistrados: number;
  pesajes: number;
  /** Rango de fechas mirado. */
  desde: string;
  hasta: string;
  /** El gasto sale sospechosamente bajo frente a la fórmula. */
  sospechaInfraRegistro: boolean;
}

/**
 * Gasto real en la ventana de `semanas` que acaba `hasta` (incluido).
 *
 * La ventana se parte en bloques de 7 días hacia atrás desde `hasta`. Solo los
 * bloques con `DIAS_MINIMOS_SEMANA` días registrados entran en la media de
 * kcal. El cambio de peso sale de la regresión de TODOS los pesajes de la
 * ventana, no de dos puntos: con dos puntos un día de retención movía el
 * gasto 300 kcal.
 */
export function calcularGastoReal(params: {
  pesos: readonly Pick<BodyweightLog, 'date' | 'weight'>[];
  registros: readonly DietCompletionLog[];
  diets: Diet[];
  hasta: string;
  semanas?: number;
  /** Gasto de la fórmula, para detectar infra-registro. */
  gastoFormula?: number | null;
}): GastoReal {
  const semanas = params.semanas ?? VENTANA_GASTO_SEMANAS;
  const { hasta } = params;
  const desde = addDays(hasta, -(semanas * 7 - 1));

  const porDia = new Map<string, number>();
  for (const log of params.registros) {
    if (log.date < desde || log.date > hasta) continue;
    const k = kcalDelDia(log, params.diets);
    if (k != null) porDia.set(log.date, k);
  }

  let semanasValidas = 0;
  const kcalValidas: number[] = [];
  for (let b = 0; b < semanas; b++) {
    const fin = addDays(hasta, -7 * b);
    const ini = addDays(fin, -6);
    const dias = [...porDia.entries()].filter(([d]) => d >= ini && d <= fin).map(([, k]) => k);
    if (dias.length >= DIAS_MINIMOS_SEMANA) {
      semanasValidas++;
      kcalValidas.push(...dias);
    }
  }

  const pesajes = params.pesos.filter(p => p.weight > 0 && p.date >= desde && p.date <= hasta);
  const puntos = pesajes.map(p => [diasEntre(desde, p.date), p.weight] as [number, number]);
  const kgDia = pendiente(puntos);

  const base: GastoReal = {
    kcal: null, margen: null, confianza: 'insuficiente',
    kcalComidas: kcalValidas.length ? Math.round(media(kcalValidas)) : null,
    cambioKgSemana: kgDia == null ? null : Math.round(kgDia * 7 * 1000) / 1000,
    semanasValidas, diasRegistrados: porDia.size, pesajes: pesajes.length,
    desde, hasta, sospechaInfraRegistro: false,
  };

  // Al menos 2 semanas buenas de comida y pesajes repartidos (no dos seguidos).
  const extension = puntos.length ? Math.max(...puntos.map(p => p[0])) - Math.min(...puntos.map(p => p[0])) : 0;
  if (semanasValidas < 2 || kgDia == null || pesajes.length < 4 || extension < 10) return base;

  const kcalComidas = media(kcalValidas);
  const kcal = kcalComidas - kgDia * KCAL_POR_KG;

  // Margen: lo que puede bailar la pendiente (su error típico) pasado a kcal,
  // más un 5 % de la comida por redondeo de intercambios y verduras libres.
  const errorPendiente = errorTipicoPendiente(puntos) ?? 0;
  const margen = errorPendiente * KCAL_POR_KG + 0.05 * kcalComidas;

  const confianza: ConfianzaGasto = semanasValidas >= 3 && pesajes.length >= 8 ? 'alta' : 'media';
  const sospecha = params.gastoFormula != null && kcal < params.gastoFormula * UMBRAL_INFRA_REGISTRO;

  return {
    ...base,
    kcal: redondear50(kcal),
    margen: Math.max(50, redondear50(margen)),
    confianza,
    sospechaInfraRegistro: sospecha,
  };
}

/**
 * Evolución del gasto: un cálculo por semana, cada uno con su ventana de 4
 * semanas. En un déficit largo es donde se ve la adaptación metabólica —el
 * gasto bajando— y es lo que decide un diet break.
 */
export function evolucionDelGasto(params: {
  pesos: readonly Pick<BodyweightLog, 'date' | 'weight'>[];
  registros: readonly DietCompletionLog[];
  diets: Diet[];
  hoy: string;
  puntos?: number;
}): { hasta: string; kcal: number }[] {
  const n = params.puntos ?? 12;
  const salida: { hasta: string; kcal: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const hasta = addDays(params.hoy, -7 * i);
    const g = calcularGastoReal({ ...params, hasta });
    if (g.kcal != null) salida.push({ hasta, kcal: g.kcal });
  }
  return salida;
}

/**
 * Kcal/día para ir al CENTRO del rango del objetivo, partiendo del gasto.
 * En los de franja (mantenimiento, recomposición) es el propio gasto.
 */
export function kcalParaObjetivo(gasto: number, tipo: ObjetivoCorporalTipo, pesoKg: number): number {
  const r = RANGO_PCT_SEMANA[tipo];
  if (!r) return redondear50(gasto);
  const kgSemana = (((r.min + r.max) / 2) / 100) * pesoKg;
  return redondear50(gasto + (kgSemana * KCAL_POR_KG) / 7);
}

// ── Utilidades ───────────────────────────────────────────────────────────────

function media(xs: readonly number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function redondear50(n: number): number {
  return Math.round(n / 50) * 50;
}

function diasEntre(a: string, b: string): number {
  return Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000);
}

/** Error típico de la pendiente de una regresión lineal simple. */
function errorTipicoPendiente(puntos: readonly [number, number][]): number | null {
  const n = puntos.length;
  if (n < 3) return null;
  const m = pendiente(puntos);
  if (m == null) return null;
  const mx = media(puntos.map(p => p[0]));
  const my = media(puntos.map(p => p[1]));
  const b = my - m * mx;
  const sse = puntos.reduce((s, [x, y]) => s + (y - (b + m * x)) ** 2, 0);
  const sxx = puntos.reduce((s, [x]) => s + (x - mx) ** 2, 0);
  return sxx === 0 ? null : Math.sqrt(sse / (n - 2) / sxx);
}
