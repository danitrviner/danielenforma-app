import { BodyMeasurement, BodyMetricKey, BODY_METRIC_LABELS } from '../types';

/* ═══════════════════════════════════════════════════════════════════════════
   Agrupar las mediciones por métrica, para las tarjetas de Revisión

   Vivía dentro de un `useMemo` de BodyMeasurementsPanel hasta que tumbó la
   pantalla en producción: `Cannot read properties of undefined (reading
   'localeCompare')` (Sentry, 29-08, 5 veces). Está aquí fuera para poder
   probarla, porque el fallo no era de pintado sino de datos.

   La causa: `BODY_METRIC_LABELS` es un `Record<BodyMetricKey, string>`, así que
   TypeScript da por hecho que toda clave tiene etiqueta. Pero estas mediciones
   vienen de Firestore, donde hay documentos escritos por versiones viejas y por
   scripts, y una `metricKey` que esta versión no conoce deja la etiqueta en
   `undefined`. Al ordenar alfabéticamente por etiqueta, eso reventaba — y con
   ello desaparecían TODAS las mediciones del atleta, no solo la rara.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface PuntoDeMetrica {
  date: string;
  value: number;
}

/** Métricas que no se siguen en el tiempo y por tanto no llevan tarjeta. */
const FUERA_DE_LAS_TARJETAS: BodyMetricKey[] = [
  'bodyweight', // tiene su propio panel
  // La altura no es un perímetro: en un adulto no cambia (mdc.ts la excluye
  // del umbral a propósito) y solo alimenta el %grasa US Navy y el WHtR. Su
  // tarjeta diría «Estable» para siempre.
  'altura',
];

/**
 * Las mediciones agrupadas por métrica y ordenadas por fecha, listas para
 * pintar. Descarta las que no tienen etiqueta: sin nombre no hay tarjeta que
 * enseñar, y perder una métrica desconocida es mucho mejor que perderlas todas.
 */
export function agruparMedicionesPorMetrica(
  todas: BodyMeasurement[],
): Map<BodyMetricKey, PuntoDeMetrica[]> {
  const mapa = new Map<BodyMetricKey, PuntoDeMetrica[]>();
  for (const m of todas) {
    if (FUERA_DE_LAS_TARJETAS.includes(m.metricKey)) continue;
    if (!BODY_METRIC_LABELS[m.metricKey]) continue;
    if (!mapa.has(m.metricKey)) mapa.set(m.metricKey, []);
    mapa.get(m.metricKey)!.push({ date: m.date, value: m.value });
  }
  for (const puntos of mapa.values()) puntos.sort((a, b) => a.date.localeCompare(b.date));
  return mapa;
}

/** Las métricas a pintar, por orden alfabético de etiqueta. */
export function metricasOrdenadas(
  mapa: Map<BodyMetricKey, PuntoDeMetrica[]>,
): BodyMetricKey[] {
  return [...mapa.keys()]
    .sort((a, b) => (BODY_METRIC_LABELS[a] ?? '').localeCompare(BODY_METRIC_LABELS[b] ?? ''));
}
