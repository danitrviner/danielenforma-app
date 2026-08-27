import { DataPoint } from './seriesCorrelation';

// Resumen de progreso para la vista que el coach graba en vídeo y le enseña
// al atleta: el titular de cada métrica (dónde empezó, dónde está, cuánto ha
// cambiado) sin que nadie tenga que seleccionar series ni leer una gráfica.
//
// La dirección "buena" NO es universal: bajar de peso es progreso para quien
// busca perder grasa y un retroceso para quien busca ganar masa, así que
// `mejorSiSube: null` significa "muestra el cambio, pero sin pintarlo de
// verde ni de rojo" — la app no conoce el objetivo del atleta (el alta ya no
// lo pregunta: lo decide el coach con él delante).

export type Direccion = 'mejora' | 'empeora' | 'neutro';

export interface ResumenMetrica {
  id: string;
  label: string;
  unit?: string;
  primero: number;
  ultimo: number;
  delta: number;
  deltaPct: number | null; // null si el primer valor es 0 (no hay % definible)
  direccion: Direccion;
  desde: string;           // fecha del primer punto (YYYY-MM-DD)
  puntos: number;          // nº de mediciones en la serie
  chispa: number[];        // hasta 8 valores para Sparkline, más antiguo primero
}

function round1(n: number): number { return Math.round(n * 10) / 10; }

/**
 * Últimos `n` valores de la serie, para la sparkline. Se cogen los últimos y
 * no una muestra repartida: el atleta mira "cómo vengo ahora", no la forma
 * completa de la curva (esa está en la gráfica de abajo).
 */
export function chispaDe(points: DataPoint[], n = 8): number[] {
  return points.slice(-n).map(p => p.value);
}

/**
 * Titular de una serie. Devuelve null con menos de 2 puntos: un solo dato no
 * es progreso, y enseñar "0 kg de cambio" con una única medición engaña.
 */
export function resumirSerie(params: {
  id: string;
  label: string;
  unit?: string;
  points: DataPoint[];
  /** true = subir es mejorar, false = bajar es mejorar, null = sin juicio (depende del objetivo). */
  mejorSiSube: boolean | null;
  /** Cambios por debajo de esto se consideran ruido y salen como 'neutro'. */
  umbralRuido?: number;
}): ResumenMetrica | null {
  const { id, label, unit, points, mejorSiSube, umbralRuido = 0 } = params;
  if (points.length < 2) return null;

  const ordenados = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const primero = ordenados[0].value;
  const ultimo = ordenados[ordenados.length - 1].value;
  const delta = round1(ultimo - primero);

  let direccion: Direccion;
  if (mejorSiSube === null || Math.abs(delta) <= umbralRuido) {
    direccion = 'neutro';
  } else if (delta === 0) {
    direccion = 'neutro';
  } else {
    direccion = (delta > 0) === mejorSiSube ? 'mejora' : 'empeora';
  }

  return {
    id,
    label,
    unit,
    primero,
    ultimo,
    delta,
    deltaPct: primero !== 0 ? round1((delta / Math.abs(primero)) * 100) : null,
    direccion,
    desde: ordenados[0].date,
    puntos: ordenados.length,
    chispa: chispaDe(ordenados),
  };
}
