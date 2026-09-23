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
/**
 * Semanas que mira la tendencia. Con una sola semana la franja se re-anclaba
 * en cada peso y un atleta que va un poco lento TODAS las semanas nunca se
 * salía (Dani, 09-2026): el retraso de cada semana es pequeño, el acumulado
 * no. Cuatro semanas acumulan lo bastante para que se vea, y aun así el dato
 * de hace dos meses no manda sobre lo que pasa ahora.
 */
export const VENTANA_TENDENCIA_SEMANAS = 4;
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
  fecha: string;           // día en que se lee la semana (su último día, u hoy)
  real: number | null;     // media de los 7 días hasta `fecha`
  /** Peso de tendencia: la recta de las últimas semanas evaluada aquí. */
  tendencia: number | null;
  franja: [number, number] | null;
}

export interface Verificacion {
  tipo: ObjetivoCorporalTipo;
  estado: EstadoVerificacion;
  pesoReferencia: number | null;
  /** Ritmo ACTUAL (últimas `VENTANA_TENDENCIA_SEMANAS`), % del peso por semana, con signo. Decide el veredicto. */
  ritmoPct: number | null;
  /** Ritmo actual en kg por semana (con signo). */
  ritmoKg: number | null;
  /** Ritmo medio de todo el objetivo, %/sem — contexto, no veredicto. */
  ritmoMedioPct: number | null;
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

/**
 * El peso que representa una ventana de 7 días: la MEDIANA con 3 pesajes o
 * más, la media con 1-2. Con la media, un 83 suelto entre cinco 81 sube la
 * semana 330 g y con eso ya se tuerce un ritmo que se mide en 300-500 g; con la
 * mediana ese día raro no cuenta. Con dos pesajes no hay forma de saber cuál
 * es el raro, así que se hace la media.
 */
export function pesoRepresentativo(pesos: readonly number[]): number {
  if (pesos.length < 3) return pesos.reduce((a, b) => a + b, 0) / pesos.length;
  const o = [...pesos].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

/** Día en que se lee la semana `s`: su último día, o hoy si aún no ha acabado. */
export function diaDeLectura(desde: string, semana: number, hoy: string): string {
  const fin = sumarDias(desde, semana * 7 + 6);
  return fin < hoy ? fin : hoy;
}

/**
 * Peso de cada semana = los ÚLTIMOS 7 DÍAS hasta el día en que se lee (ver
 * `pesoRepresentativo`: mediana si hay 3+ pesajes).
 *
 * No la semana del calendario: a mitad de semana eso dejaba un solo pesaje
 * decidiendo, y un 83 suelto tras un 81 movía la tendencia entera (Dani,
 * 09-2026). Con la ventana móvil, la semana en curso se lee con los 7 días
 * previos a hoy, y un pesaje raro pesa lo que le toca: 1 de los que haya.
 * Funciona igual con quien se pesa a diario que con quien se pesa dos veces
 * por semana.
 *
 * No mira antes de `desde`: el peso de otra fase no es de este objetivo.
 */
export function mediasSemanales(
  logs: readonly Pick<BodyweightLog, 'date' | 'weight'>[],
  desde: string,
  hoy: string,
): Map<number, number> {
  return new Map([...lecturasSemanales(logs, desde, hoy)].map(([s, l]) => [s, l.peso]));
}

/**
 * Lo mismo, con DÓNDE cae cada lectura en el eje del tiempo (en semanas desde
 * `desde`): la fecha media de los pesajes que entran. La semana en curso se
 * lee con una ventana que se solapa con la anterior, y si la regresión la
 * pusiera en «semana 5» a secas, dos medias casi iguales a una semana de
 * distancia aplanarían el ritmo.
 */
export function lecturasSemanales(
  logs: readonly Pick<BodyweightLog, 'date' | 'weight'>[],
  desde: string,
  hoy: string,
): Map<number, { peso: number; x: number }> {
  const validos = logs.filter(l => l.weight > 0 && l.date >= desde && l.date <= hoy);
  const lecturas = new Map<number, { peso: number; x: number }>();
  if (validos.length === 0 || hoy < desde) return lecturas;
  const ultima = Math.floor(diasEntre(desde, hoy) / 7);
  for (let s = 0; s <= ultima; s++) {
    const dia = diaDeLectura(desde, s, hoy);
    const inicio = sumarDias(dia, -6);
    const dentro = validos.filter(l => l.date >= inicio && l.date <= dia);
    if (!dentro.length) continue;
    lecturas.set(s, {
      peso: pesoRepresentativo(dentro.map(l => l.weight)),
      x: dentro.reduce((a, l) => a + diasEntre(desde, l.date), 0) / dentro.length / 7,
    });
  }
  return lecturas;
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

  const lecturas = lecturasSemanales(pesos, desde, hoy);
  const semanas = [...lecturas.keys()].sort((a, b) => a - b);
  const punto = (w: number) => [lecturas.get(w)!.x, lecturas.get(w)!.peso] as [number, number];
  const pesoReferencia = semanas.length ? lecturas.get(semanas[0])!.peso : null;
  const pesoActual = semanas.length ? lecturas.get(semanas[semanas.length - 1])!.peso : null;
  /** Centro de la ventana de lectura de la semana s, en semanas. */
  // Sin pesajes esa semana (o la que viene): el centro de su ventana de 7 días.
  const xDe = (w: number) => lecturas.get(w)?.x
    ?? ((w <= ultimaSemana ? diasEntre(desde, diaDeLectura(desde, w, hoy)) : w * 7 + 6) - 3) / 7;

  const r2 = (v: number) => Math.round(v * 100) / 100;
  const pct = (kg: number | null) => kg == null || pesoReferencia == null
    ? null : Math.round((kg / pesoReferencia) * 10000) / 100;

  /** Recta de las semanas con datos en [s − ventana + 1, s], evaluada en s. */
  const tendenciaEn = (s: number): number | null => {
    const tramo = semanas.filter(w => w <= s && w > s - VENTANA_TENDENCIA_SEMANAS)
      .map(punto);
    if (tramo.length === 0) return null;
    const m = pendiente(tramo);
    if (m == null) return tramo[tramo.length - 1][1];
    const mx = tramo.reduce((t, [x]) => t + x, 0) / tramo.length;
    const my = tramo.reduce((t, [, y]) => t + y, 0) / tramo.length;
    return my + m * (xDe(s) - mx);
  };

  const ultimaSemana = Math.max(0, Math.floor(diasEntre(desde, hoy) / 7));
  // Ritmo actual: solo la ventana reciente. Si el coach corrigió las kcal hace
  // tres semanas, el veredicto tiene que hablar de lo de ahora, no arrastrar
  // la fase entera.
  const recientes = semanas.filter(w => w > ultimaSemana - VENTANA_TENDENCIA_SEMANAS);
  const kgSemana = pendiente(recientes.map(punto));
  const ritmoKg = kgSemana == null ? null : Math.round(kgSemana * 1000) / 1000;
  const ritmoPct = pct(kgSemana);
  const ritmoMedioPct = pct(pendiente(semanas.map(punto)));

  const primera = semanas[0];
  const puntos: PuntoSemanal[] = [];
  // Una semana más allá de hoy: la franja de la próxima semana es lo que el
  // atleta tiene que buscar.
  for (let s = 0; s <= ultimaSemana + 1; s++) {
    let franja: [number, number] | null = null;
    if (rango) {
      /* Se ancla en la TENDENCIA de hace `ventana` semanas (o al inicio) y se
       * proyecta hasta aquí. Se mueve con cada peso nuevo, pero acumula el
       * retraso de cuatro semanas: quien va lento de forma sostenida se sale. */
      if (primera != null && s > primera) {
        const a = Math.max(primera, s - VENTANA_TENDENCIA_SEMANAS);
        const base = tendenciaEn(a);
        if (base != null) {
          const k = xDe(s) - xDe(a);
          franja = [r2(base * (1 + (rango.min / 100) * k)), r2(base * (1 + (rango.max / 100) * k))];
        }
      }
    } else if (pesoReferencia != null) {
      franja = [r2(pesoReferencia - FRANJA_MANTENIMIENTO_KG), r2(pesoReferencia + FRANJA_MANTENIMIENTO_KG)];
    }
    const real = s <= ultimaSemana ? lecturas.get(s)?.peso : undefined;
    const t = s <= ultimaSemana && primera != null && s >= primera ? tendenciaEn(s) : null;
    puntos.push({
      semana: s,
      fecha: s <= ultimaSemana ? diaDeLectura(desde, s, hoy) : sumarDias(desde, s * 7 + 6),
      real: real == null ? null : r2(real),
      tendencia: t == null ? null : r2(t),
      franja,
    });
  }

  const base: Verificacion = {
    tipo, estado: 'sin-datos', pesoReferencia, ritmoPct, ritmoKg, ritmoMedioPct, pesoActual,
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
  const tendenciaActual = tendenciaEn(ultimaSemana);
  if (pesoReferencia != null && tendenciaActual != null && semanas.length >= 2) {
    // Contra la tendencia, no contra la última media: un fin de semana con
    // sal no saca a nadie de mantenimiento.
    const d = Math.round((tendenciaActual - pesoReferencia) * 100) / 100;
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
