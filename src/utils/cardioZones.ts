import { CardioZones } from '../types';

export const ZONE_ORDER: (keyof CardioZones)[] = ['z1', 'z2', 'z3', 'z4', 'z5'];

export const ZONE_LABEL: Record<keyof CardioZones, string> = {
  z1: 'Z1 Recuperación', z2: 'Z2 Base aeróbica', z3: 'Z3 Tempo', z4: 'Z4 Umbral', z5: 'Z5 VO₂máx',
};

/**
 * El RELLENO de una zona: fondo de la pantalla de cardio en vivo, segmento de
 * la barra de reparto, banda de la gráfica, punto de la leyenda.
 *
 * Es un color de señal, como un semáforo: se queda saturado y brillante en los
 * dos temas. Encima siempre va `text-on-accent`, que es tinta oscura tanto en
 * claro como en oscuro. Por eso estos seis son literales y no tokens de tema.
 */
export const ZONE_COLOR: Record<keyof CardioZones, string> = {
  z1: '#4a90d9', z2: '#00eefc', z3: '#fbcb1a', z4: '#ff8c42', z5: '#ff4d4d',
};

/**
 * La misma zona cuando hace de TEXTO sobre una superficie normal — la leyenda
 * «Tus zonas de FC», el minireproductor, la etiqueta de la gráfica.
 *
 * Aquí sí cambia con el tema, y tiene que hacerlo: el cian de Z2 sobre papel da
 * 1,5:1. Apunta a los tokens `--color-zone-N-ink` de src/index.css, que en
 * oscuro valen exactamente lo mismo que el relleno de arriba.
 *
 * Al mezclarlo con alfa hay que usar `color-mix()`, NO concatenar dos dígitos
 * hex al final (`${color}1a`): eso producía `var(--color-zone-2-ink)1a`, que el
 * navegador descarta entero sin avisar.
 */
export const ZONE_INK: Record<keyof CardioZones, string> = {
  z1: 'var(--color-zone-1-ink)', z2: 'var(--color-zone-2-ink)', z3: 'var(--color-zone-3-ink)',
  z4: 'var(--color-zone-4-ink)', z5: 'var(--color-zone-5-ink)',
};

// "No en zona" (§4bis.4 del análisis FITIV) — por debajo del suelo de Z1.
// No es un error: es calentamiento/vuelta a la calma, pero hay que mostrarlo
// explícito en vez de dejar el badge de zona en blanco.
export const BELOW_ZONE_LABEL = 'Fuera de zona';
export const BELOW_ZONE_COLOR = '#6b7280';
/** «Fuera de zona» como texto — ver ZONE_INK. */
export const BELOW_ZONE_INK = 'var(--color-zone-out-ink)';

export function getZoneForBpm(bpm: number, zones: CardioZones): keyof CardioZones | null {
  for (const z of ZONE_ORDER) {
    if (bpm >= zones[z].min && bpm <= zones[z].max) return z;
  }
  if (bpm > zones.z5.max) return 'z5';
  if (bpm < zones.z1.min) return null; // por debajo de Z1: en calentamiento/reposo
  return null;
}

/**
 * % de la FCmax del atleta — el eje derecho de la gráfica en vivo (§4bis.1).
 * FITIV trunca en vez de redondear (131/190 → 68%, no 69%, verificado contra
 * el informe real de la captura del §4bis.4); se replica igual a propósito.
 */
export function pctOfMaxHR(bpm: number, maxHR: number | undefined): number | null {
  if (!maxHR || maxHR <= 0) return null;
  return Math.floor((bpm / maxHR) * 100);
}

export type ZoneAlertDirection = 'high' | 'low' | 'in';

/**
 * Compara el BPM actual contra la banda de la zona objetivo de una sesión
 * guiada (p.ej. Zona 2 prescrita por el coach) — es lo que dispara el aviso
 * háptico/por voz que hace utilizable entrenar por zonas sin mirar la
 * pantalla todo el rato (§F3 del plan de réplica FITIV).
 */
export function getZoneAlertDirection(bpm: number, targetBand: { min: number; max: number }): ZoneAlertDirection {
  if (bpm > targetBand.max) return 'high';
  if (bpm < targetBand.min) return 'low';
  return 'in';
}

/**
 * FCmax estimada por edad — Tanaka, Monahan & Seals (2001): 208 − 0,7 × edad.
 *
 * Antes la app usaba `220 − edad` (Haskell & Fox) en la tarjeta de ajustes del
 * atleta, aunque el comentario de `db/cardio.ts` ya decía «Tanaka»: dos sitios,
 * dos fórmulas. Se unifica en Tanaka porque es la revisión que corrigió el
 * problema conocido de 220−edad: sobreestima la FCmax de los jóvenes e
 * infraestima la de los mayores (a los 50 son 185 contra 173: 12 ppm de
 * diferencia, que desplazan TODAS las zonas). Su error típico también es
 * menor (~7 ppm frente a ~10-12).
 *
 * Sigue siendo una estimación de población: por eso la app deja editarla a
 * mano y ofrece calibrar con un test real, que es lo único exacto.
 */
export function maxHREstimada(edadAnios: number): number {
  return Math.round(208 - 0.7 * edadAnios);
}

// Friel por LTHR (referencia running, §5.6 del plan) — usado cuando el
// atleta ya tiene LTHR de un test de umbral (Test 2), más preciso que Karvonen.
//
// El suelo de Z1 no era 0 por convicción, sino por omisión: Friel no define
// límite inferior. Pero dejarlo en 0 hacía que con este método NUNCA existiera
// el estado «Fuera de zona», mientras que con Karvonen (suelo en el 50% de la
// FC de reserva) sí — el mismo paseo se contaba como Z1 o como fuera de zona
// según qué método tuviera el atleta. Se le pone un suelo práctico del 70% del
// LTHR: por debajo de eso no es entrenamiento aeróbico, es reposo o paseo.
export function zonesFromLthr(lthr: number): CardioZones {
  const pct = (p: number) => Math.round(lthr * p);
  return {
    z1: { min: pct(0.70), max: pct(0.85) - 1 },
    z2: { min: pct(0.85), max: pct(0.89) },
    z3: { min: pct(0.90), max: pct(0.94) },
    z4: { min: pct(0.95), max: pct(0.99) },
    z5: { min: pct(1.00), max: pct(1.10) },
  };
}
