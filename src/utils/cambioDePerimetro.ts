import type { BodyMeasurement, BodyMetricKey } from '../types.js';
import { RUIDO_PERIMETRO_CM } from './ruidoDeMedida.js';

/* ═══════════════════════════════════════════════════════════════════════════
   «Mídete igual» (17-11-2026)

   Cuando el atleta apunta un perímetro se le enseña el cambio frente a la
   medida anterior. Si ese cambio es menor que el error de la cinta
   (`RUIDO_PERIMETRO_CM`: 0,5 cm en brazo, 1 cm en el resto) no se pinta ni
   subida ni bajada, sino «sin cambio medible»: medio centímetro de cintura
   no es grasa, es dónde ha caído la cinta.

   Mismo criterio que el cierre de bloque (`ruidoDePerimetro` en
   evolucionDelBloque.ts); la prueba comprueba que no se separen.
   ═══════════════════════════════════════════════════════════════════════════ */

export type EstadoDeCambio = 'sube' | 'baja' | 'sin_cambio';

/** Las medidas que son un perímetro: ni el peso ni la altura. */
export const esPerimetro = (clave: BodyMetricKey | undefined): clave is BodyMetricKey =>
  !!clave && clave !== 'bodyweight' && clave !== 'altura';

/** Error de la cinta, en cm: el brazo se mide más fino que el resto. */
export function ruidoDeMetrica(clave: string): number {
  return /^biceps/.test(clave) ? RUIDO_PERIMETRO_CM.brazo : RUIDO_PERIMETRO_CM.resto;
}

export interface CambioDePerimetro {
  /** Con un decimal y signo. */
  delta: number;
  estado: EstadoDeCambio;
}

export function cambioDePerimetro(clave: string, anterior: number, actual: number): CambioDePerimetro {
  const delta = Math.round((actual - anterior) * 10) / 10;
  if (Math.abs(delta) < ruidoDeMetrica(clave)) return { delta, estado: 'sin_cambio' };
  return { delta, estado: delta > 0 ? 'sube' : 'baja' };
}

/**
 * La última medida de ese perímetro ANTERIOR a hoy. La de hoy no vale: si el
 * atleta rehace el cuestionario el mismo día, se compararía consigo mismo.
 */
export function medidaAnterior(
  todas: Pick<BodyMeasurement, 'metricKey' | 'date' | 'value'>[], clave: BodyMetricKey, hoy: string,
): { value: number; date: string } | null {
  let ultima: { value: number; date: string } | null = null;
  for (const m of todas) {
    if (m.metricKey !== clave || m.date >= hoy || !Number.isFinite(m.value)) continue;
    if (!ultima || m.date > ultima.date) ultima = { value: m.value, date: m.date };
  }
  return ultima;
}

/** «34,5» — coma decimal, sin ceros de más. */
export const cm = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

/** Lo que se lee junto al icono: «Sin cambio medible», «+1,2 cm», «−0,8 cm». */
export function textoDeCambio(c: CambioDePerimetro): string {
  if (c.estado === 'sin_cambio') return 'Sin cambio medible';
  return `${c.delta > 0 ? '+' : '−'}${cm(Math.abs(c.delta))} cm`;
}
