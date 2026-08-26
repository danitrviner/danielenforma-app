import { BodyMetricKey } from '../types';

// MÍNIMO CAMBIO DETECTABLE (MDC) — por debajo de estos umbrales, un delta de
// perímetro es ruido de medición (presión de la cinta, hidratación, edema
// post-entreno de 48-72h), no progreso real. Decisión de Dani: mostrar
// "Estable" en vez de una flecha de progreso/regresión cuando el cambio no
// supera el umbral. bodyweight/altura quedan fuera — no son parte del
// protocolo de perímetros (el peso tiene su propio seguimiento en
// BodyweightPanel, la altura no cambia en adultos).
export type MDCCategoria = 'extremidad' | 'tronco' | 'pliegue';

const CATEGORIA_POR_METRICA: Record<Exclude<BodyMetricKey, 'bodyweight' | 'altura'>, MDCCategoria> = {
  pecho: 'tronco', cintura: 'tronco', abdomen: 'tronco', cadera: 'tronco', cuello: 'tronco',
  // legacy (protocolo simplificado previo)
  biceps_izq: 'extremidad', biceps_der: 'extremidad', muslo_izq: 'extremidad', muslo_der: 'extremidad', gemelo: 'extremidad',
  // protocolo completo
  biceps_izq_relajado: 'extremidad', biceps_izq_contraido: 'extremidad',
  biceps_der_relajado: 'extremidad', biceps_der_contraido: 'extremidad',
  muslo_izq_relajado: 'extremidad', muslo_izq_contraido: 'extremidad',
  muslo_der_relajado: 'extremidad', muslo_der_contraido: 'extremidad',
  gemelo_izq: 'extremidad', gemelo_der: 'extremidad',
  pliegue_subgluteo_der: 'pliegue',
};

const UMBRAL_POR_CATEGORIA: Record<MDCCategoria, number> = {
  extremidad: 1.0, // cm
  tronco: 1.5,     // cm
  pliegue: 0.2,    // cm (2.0mm)
};

export function mdcDeMetrica(metricKey: BodyMetricKey): number | null {
  const categoria = CATEGORIA_POR_METRICA[metricKey as Exclude<BodyMetricKey, 'bodyweight' | 'altura'>];
  return categoria ? UMBRAL_POR_CATEGORIA[categoria] : null;
}

/** 'estable' si |delta| no supera el MDC de esa métrica — nunca se etiqueta como cambio real por debajo del umbral. */
export function estadoMDC(delta: number, metricKey: BodyMetricKey): 'sube' | 'baja' | 'estable' {
  const umbral = mdcDeMetrica(metricKey);
  if (umbral == null || Math.abs(delta) < umbral) return 'estable';
  return delta > 0 ? 'sube' : 'baja';
}
