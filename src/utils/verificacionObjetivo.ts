import { BodyweightLog, BodyMeasurement, WorkoutLog } from '../types.js';
import { epley } from './oneRepMax.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Verificación del objetivo corporal

   El entrenador piensa en UNA palabra —«volumen», «déficit»— y en un rango, no
   en fases con kcal, dieta y peso objetivo. Esto es el motor de esa palabra:
   con solo los pesos que registra el atleta dice si va dentro del rango.

   Los rangos van en % del peso corporal por semana, no en gramos fijos: medio
   kilo a la semana es agresivo con 55 kg y suave con 110 kg (decisión de Dani,
   09-2026). La primera semana NO se descarta: la bajada de agua del arranque
   se diluye sola en la regresión a medida que entran semanas.
   ═══════════════════════════════════════════════════════════════════════════ */

export type ObjetivoCorporalTipo =
  | 'volumen'
  | 'deficit'
  | 'deficit_acelerado'
  | 'salida_deficit'
  | 'mantenimiento'
  | 'recomposicion';

export interface ObjetivoCorporal {
  tipo: ObjetivoCorporalTipo;
  desde: string; // YYYY-MM-DD
}

export const OBJETIVO_LABEL: Record<ObjetivoCorporalTipo, string> = {
  volumen: 'Volumen',
  deficit: 'Déficit',
  deficit_acelerado: 'Pérdida acelerada',
  salida_deficit: 'Salida de déficit',
  mantenimiento: 'Mantenimiento',
  recomposicion: 'Recomposición',
};

export const OBJETIVOS_ORDEN: ObjetivoCorporalTipo[] = [
  'volumen', 'deficit', 'deficit_acelerado', 'salida_deficit', 'mantenimiento', 'recomposicion',
];

/** Rango de ritmo en % del peso por semana, con signo. `min` < `max` siempre. */
export const RANGO_PCT_SEMANA: Partial<Record<ObjetivoCorporalTipo, { min: number; max: number }>> = {
  volumen:           { min: 0.25, max: 0.4 },
  deficit:           { min: -0.6, max: -0.4 },
  // El borde −0,6 cuenta como «en rango» en los dos: justo en la frontera
  // no hay nada que corregir, sea cual sea la etiqueta.
  deficit_acelerado: { min: -1.0, max: -0.6 },
  salida_deficit:    { min: 0,    max: 0.2 },
};

/** Mantenimiento y recomposición: franja fija alrededor de la media inicial. */
export const FRANJA_MANTENIMIENTO_KG = 1;

/** Por debajo de esto un cambio de cintura es ruido de cinta métrica. */
const UMBRAL_CINTURA_CM = 0.5;
/** Cambio mediano del 1RM estimado que cuenta como «sube». */
const UMBRAL_FUERZA_PCT = 1;
const KCAL_POR_KG = 7700;
const MAX_AJUSTE_KCAL = 400;

export type EstadoVerificacion =
  | 'en-rango'
  | 'lento'        // va en la dirección buscada, pero por debajo del rango
  | 'rapido'       // se pasa del rango
  | 'contrario'    // se mueve en la dirección opuesta
  | 'por-encima'   // franja: por encima de la media inicial + 1 kg
  | 'por-debajo'   // franja: por debajo de la media inicial − 1 kg
  | 'parcial'      // recomposición: una señal buena y otra sin datos
  | 'sin-datos';

export type Senal = 'ok' | 'mal' | 'sin-datos';

export interface PuntoSemanal {
  semana: number;          // 0 = la semana en que empieza el objetivo
  fecha: string;           // `desde` + 7·semana
  real: number | null;     // media de los pesos de esa semana
  franja: [number, number] | null;
}

export interface Verificacion {
  tipo: ObjetivoCorporalTipo;
  estado: EstadoVerificacion;
  pesoReferencia: number | null;
  /** Ritmo real, % del peso por semana (con signo). */
  ritmoPct: number | null;
  /** Ritmo real, kg por semana (con signo). */
  ritmoKg: number | null;
  pesoActual: number | null;
  semanasConDatos: number;
  puntos: PuntoSemanal[];
  /** Solo recomposición. */
  cintura?: { senal: Senal; cambioCm: number | null };
  fuerza?: { senal: Senal; cambioPct: number | null; ejercicios: number };
  /** Cambio de kcal/día orientativo para volver al centro del rango; null si no toca. */
  ajusteKcal: number | null;
}

// ── Fechas ───────────────────────────────────────────────────────────────────

function diasEntre(desde: string, hasta: string): number {
  const a = Date.UTC(+desde.slice(0, 4), +desde.slice(5, 7) - 1, +desde.slice(8, 10));
  const b = Date.UTC(+hasta.slice(0, 4), +hasta.slice(5, 7) - 1, +hasta.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

function sumarDias(iso: string, dias: number): string {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + dias));
  return d.toISOString().slice(0, 10);
}

// ── Piezas puras ─────────────────────────────────────────────────────────────

/** Medias de peso por semana contadas desde `desde`. Ignora lo anterior y lo futuro. */
export function mediasSemanales(
  logs: readonly Pick<BodyweightLog, 'date' | 'weight'>[],
  desde: string,
  hoy: string,
): Map<number, number> {
  const cubos = new Map<number, number[]>();
  for (const l of logs) {
    if (!(l.weight > 0) || l.date < desde || l.date > hoy) continue;
    const semana = Math.floor(diasEntre(desde, l.date) / 7);
    const cubo = cubos.get(semana) ?? [];
    cubo.push(l.weight);
    cubos.set(semana, cubo);
  }
  const medias = new Map<number, number>();
  for (const [s, pesos] of cubos) medias.set(s, pesos.reduce((a, b) => a + b, 0) / pesos.length);
  return medias;
}

/**
 * Pendiente por mínimos cuadrados, en kg/semana.
 *
 * Con regresión y no «última menos primera»: una semana suelta con retención
 * de líquidos no puede decidir el veredicto, y los huecos (semanas sin pesarse)
 * no la desplazan.
 */
export function pendiente(puntos: readonly [number, number][]): number | null {
  if (puntos.length < 2) return null;
  const n = puntos.length;
  const mx = puntos.reduce((s, [x]) => s + x, 0) / n;
  const my = puntos.reduce((s, [, y]) => s + y, 0) / n;
  let num = 0;
  let den = 0;
  for (const [x, y] of puntos) {
    num += (x - mx) * (y - my);
    den += (x - mx) ** 2;
  }
  return den === 0 ? null : num / den;
}

/** Clasifica un ritmo (%/sem) contra un rango. Redondea a centésimas para que
 *  −0,6 no caiga fuera del déficit por un error de coma flotante. */
export function clasificarRitmo(
  ritmoPct: number,
  rango: { min: number; max: number },
): 'en-rango' | 'lento' | 'rapido' | 'contrario' {
  const r = Math.round(ritmoPct * 100) / 100;
  if (r >= rango.min && r <= rango.max) return 'en-rango';
  const direccion = rango.min + rango.max >= 0 ? 1 : -1;
  const avance = r * direccion;
  const lejano = Math.max(Math.abs(rango.min), Math.abs(rango.max));
  if (avance > lejano) return 'rapido';
  // Salida de déficit arranca en 0: bajar peso ahí ya es ir en contra.
  if (avance < 0) return 'contrario';
  return 'lento';
}

/** Cambio de cintura desde el objetivo: primera medida contra la última. */
export function senalCintura(
  medidas: readonly Pick<BodyMeasurement, 'date' | 'metricKey' | 'value'>[],
  desde: string,
): { senal: Senal; cambioCm: number | null } {
  const cintura = medidas
    .filter(m => m.metricKey === 'cintura' && m.date >= desde)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (cintura.length < 2) return { senal: 'sin-datos', cambioCm: null };
  const cambio = cintura[cintura.length - 1].value - cintura[0].value;
  return { senal: cambio <= -UMBRAL_CINTURA_CM ? 'ok' : 'mal', cambioCm: Math.round(cambio * 10) / 10 };
}

/**
 * Tendencia de fuerza: por ejercicio, mejor 1RM estimado de la primera mitad
 * del periodo contra la segunda; se toma la mediana de los cambios.
 *
 * Mediana y no media: un ejercicio nuevo que sube un 30 % por aprendizaje
 * técnico no debe tapar que el resto está plano.
 */
export function senalFuerza(
  logs: readonly Pick<WorkoutLog, 'date' | 'entries'>[],
  desde: string,
  hoy: string,
): { senal: Senal; cambioPct: number | null; ejercicios: number } {
  const dias = diasEntre(desde, hoy);
  if (dias < 14) return { senal: 'sin-datos', cambioPct: null, ejercicios: 0 };
  const corte = sumarDias(desde, Math.floor(dias / 2));

  const mejor = new Map<string, [number, number]>(); // [primera mitad, segunda]
  for (const log of logs) {
    if (log.date < desde || log.date > hoy) continue;
    const mitad = log.date < corte ? 0 : 1;
    for (const e of log.entries ?? []) {
      for (const s of e.sets ?? []) {
        const rm = epley(s.weight, s.repsDone);
        if (!rm) continue;
        const par = mejor.get(e.exerciseId) ?? [0, 0];
        par[mitad] = Math.max(par[mitad], rm);
        mejor.set(e.exerciseId, par);
      }
    }
  }

  const cambios = [...mejor.values()]
    .filter(([a, b]) => a > 0 && b > 0)
    .map(([a, b]) => ((b - a) / a) * 100)
    .sort((a, b) => a - b);
  if (cambios.length === 0) return { senal: 'sin-datos', cambioPct: null, ejercicios: 0 };
  const m = Math.floor(cambios.length / 2);
  const mediana = cambios.length % 2 ? cambios[m] : (cambios[m - 1] + cambios[m]) / 2;
  return {
    senal: mediana >= UMBRAL_FUERZA_PCT ? 'ok' : 'mal',
    cambioPct: Math.round(mediana * 10) / 10,
    ejercicios: cambios.length,
  };
}

// ── Veredicto ────────────────────────────────────────────────────────────────

export function verificarObjetivo(entrada: {
  objetivo: ObjetivoCorporal;
  pesos: readonly Pick<BodyweightLog, 'date' | 'weight'>[];
  hoy: string;
  medidas?: readonly Pick<BodyMeasurement, 'date' | 'metricKey' | 'value'>[];
  entrenos?: readonly Pick<WorkoutLog, 'date' | 'entries'>[];
}): Verificacion {
  const { objetivo, pesos, hoy } = entrada;
  const { tipo, desde } = objetivo;
  const rango = RANGO_PCT_SEMANA[tipo];

  const medias = mediasSemanales(pesos, desde, hoy);
  const semanas = [...medias.keys()].sort((a, b) => a - b);
  const pesoReferencia = semanas.length ? medias.get(semanas[0])! : null;
  const pesoActual = semanas.length ? medias.get(semanas[semanas.length - 1])! : null;

  const kgSemana = pendiente(semanas.map(s => [s, medias.get(s)!] as [number, number]));
  const ritmoKg = kgSemana == null ? null : Math.round(kgSemana * 1000) / 1000;
  const ritmoPct = kgSemana == null || pesoReferencia == null
    ? null
    : Math.round((kgSemana / pesoReferencia) * 10000) / 100;

  const ultimaSemana = Math.max(0, Math.floor(diasEntre(desde, hoy) / 7));
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const puntos: PuntoSemanal[] = [];
  let ancla: { semana: number; peso: number } | null = null;
  // Una semana más allá de hoy: la franja de la próxima semana es lo que el
  // atleta tiene que buscar, y ya se puede pintar con el último peso.
  for (let s = 0; s <= ultimaSemana + 1; s++) {
    let franja: [number, number] | null = null;
    if (rango) {
      /* La franja se re-ancla con cada peso nuevo: parte de la última media
       * real, no del peso del día 1. Así dice «desde donde estás ahora, aquí
       * deberías estar», en vez de un abanico fijo que un atleta que se
       * retrasó una vez ya no puede alcanzar nunca. El veredicto global sigue
       * saliendo de la regresión de todo el periodo. */
      if (ancla) {
        const k = s - ancla.semana;
        franja = [r2(ancla.peso * (1 + (rango.min / 100) * k)), r2(ancla.peso * (1 + (rango.max / 100) * k))];
      }
    } else if (pesoReferencia != null) {
      franja = [r2(pesoReferencia - FRANJA_MANTENIMIENTO_KG), r2(pesoReferencia + FRANJA_MANTENIMIENTO_KG)];
    }
    const real = s <= ultimaSemana ? medias.get(s) : undefined;
    puntos.push({
      semana: s,
      fecha: sumarDias(desde, s * 7),
      real: real == null ? null : r2(real),
      franja,
    });
    if (real != null) ancla = { semana: s, peso: real };
  }

  const base: Verificacion = {
    tipo, estado: 'sin-datos', pesoReferencia, ritmoPct, ritmoKg, pesoActual,
    semanasConDatos: semanas.length, puntos, ajusteKcal: null,
  };

  if (rango) {
    if (ritmoPct == null || kgSemana == null || pesoReferencia == null) return base;
    const estado = clasificarRitmo(ritmoPct, rango);
    let ajusteKcal: number | null = null;
    if (estado !== 'en-rango') {
      const centroKg = (((rango.min + rango.max) / 2) / 100) * pesoReferencia;
      const bruto = ((centroKg - kgSemana) * KCAL_POR_KG) / 7;
      const acotado = Math.max(-MAX_AJUSTE_KCAL, Math.min(MAX_AJUSTE_KCAL, bruto));
      ajusteKcal = Math.round(acotado / 50) * 50 || null;
    }
    return { ...base, estado, ajusteKcal };
  }

  // Mantenimiento y recomposición: franja alrededor de la media inicial.
  let estadoPeso: EstadoVerificacion = 'sin-datos';
  if (pesoReferencia != null && pesoActual != null && semanas.length >= 2) {
    const d = Math.round((pesoActual - pesoReferencia) * 100) / 100;
    estadoPeso = d > FRANJA_MANTENIMIENTO_KG ? 'por-encima'
      : d < -FRANJA_MANTENIMIENTO_KG ? 'por-debajo' : 'en-rango';
  }

  if (tipo === 'mantenimiento') return { ...base, estado: estadoPeso };

  const cintura = senalCintura(entrada.medidas ?? [], desde);
  const fuerza = senalFuerza(entrada.entrenos ?? [], desde, hoy);
  let estado: EstadoVerificacion;
  if (estadoPeso !== 'en-rango' && estadoPeso !== 'sin-datos') estado = estadoPeso;
  else if (estadoPeso === 'sin-datos') estado = 'sin-datos';
  else if (cintura.senal === 'mal' || fuerza.senal === 'mal') estado = 'lento';
  else if (cintura.senal === 'ok' && fuerza.senal === 'ok') estado = 'en-rango';
  else estado = 'parcial';
  return { ...base, estado, cintura, fuerza };
}
