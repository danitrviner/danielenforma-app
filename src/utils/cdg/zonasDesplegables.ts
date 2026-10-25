/**
 * Tabla «Por zona muscular» con niveles (11-b): grupo → zona → músculo.
 *
 * Solo cambia CÓMO se ve: las zonas (objetivo, agujetas, freno/acelerador) siguen
 * siendo las de `zonas.ts` y ninguna fórmula se toca. Debajo de cada zona salen
 * sus músculos del catálogo CDG (las «porciones» del motor) y, por encima, los
 * grupos de varias zonas que pidió Dani (de momento solo «Espalda» = Dorsal +
 * Trapecio; los erectores van aparte porque el catálogo los separa).
 */
import type { MuscleGroup } from '../../types.js'
import { ZONAS_IEM, type ZonaIem } from './zonas.js'

export const GRUPOS_DE_ZONAS: ReadonlyArray<{ clave: string; nombre: string; zonas: readonly ZonaIem[] }> = [
  { clave: 'espalda', nombre: 'Espalda', zonas: ['dorsal', 'trapecio'] },
]

/** Grupo al que pertenece una zona, si alguno. */
export function grupoDeZona (zona: ZonaIem) {
  return GRUPOS_DE_ZONAS.find(g => g.zonas.includes(zona))
}

/** Nombre para la pantalla de cada músculo del catálogo (los del CDG son largos). */
const NOMBRE_CORTO: Record<string, string> = {
  'Rotadores externos hombro': 'Rotadores externos del hombro',
  'Deltoides anterior': 'Anterior',
  'Deltoides medial': 'Medial',
  'Deltoides posterior': 'Posterior',
  'Pectoral haz clavicular': 'Haz clavicular',
  'Pectoral haz esterno costal': 'Haz esternocostal',
  'Pectoral haz costo abdominal': 'Haz costoabdominal',
  'Erectores espinales dorsales': 'Dorsales',
  'Erectores espinales lumbares': 'Lumbares',
  'Dorsal transversales': 'Fibras transversales',
  'Dorsal longitudinales': 'Fibras longitudinales',
  'Flexores de codo biceps c. larga': 'Bíceps c. larga',
  'Flexores de codo biceps c. corta': 'Bíceps c. corta',
  'Flexores de codo braquial': 'Braquial',
  'Flexores de codo braquioradial': 'Braquiorradial',
  'Triceps cabeza larga': 'Cabeza larga',
  'Triceps cabezas medial y lateral': 'Cabezas medial y lateral',
  'Antebrazo posterior': 'Posterior',
  'Antebrazo anterior': 'Anterior',
  'Cuádriceps vastos lateral, medial e intermedio': 'Vastos',
  'Cuádriceps recto anterior': 'Recto anterior',
  'Glúteo mayor f. superiores': 'Mayor (fibras superiores)',
  'Glúteo mayor f. inferiores': 'Mayor (fibras inferiores)',
  'Glúteo medio': 'Medio',
  'Rotadores externos cadera': 'Rotadores externos de la cadera',
  'Plantiflexores sóleo': 'Sóleo',
  'Plantiflexores gastrocnemios': 'Gastrocnemios',
}

export const nombreCortoDeMusculo = (cdg: string): string => NOMBRE_CORTO[cdg] ?? cdg

const EN_ZONA: ReadonlySet<string> = new Set(ZONAS_IEM.flatMap(z => z.musculos))

/** Índices de los músculos del motor que no caen en ninguna zona («Otros músculos»). */
export function musculosSinZona (musculos: readonly string[]): number[] {
  return musculos.flatMap((m, i) => (EN_ZONA.has(m) ? [] : [i]))
}

/**
 * Barra «frente al objetivo»: el carril llega a un 20 % por encima del objetivo
 * para que se vea cuánto se pasa; la raya del objetivo cae en 1/1,2 del carril.
 * Verde si llega, oro de 80 a 99 %, marrón por debajo del 80 %.
 */
export const TOPE_BARRA = 1.2
export const MARCA_OBJETIVO = 1 / TOPE_BARRA
export function barraFrenteAlObjetivo (valor: number, objetivo: number) {
  const ratio = objetivo > 0 ? valor / objetivo : 0
  return {
    ratio,
    ancho: Math.max(0, Math.min(1, ratio / TOPE_BARRA)),
    tono: ratio >= 1 ? 'llega' as const : ratio >= 0.8 ? 'cerca' as const : 'lejos' as const,
  }
}

/**
 * Orden de las filas con los grupos: el grupo se pone donde cae su primera zona
 * (la lista ya viene ordenada) y sus zonas van detrás, seguidas, en su orden.
 */
export type FilaOrdenada<T> = { tipo: 'grupo'; clave: string; nombre: string; zonas: T[] } | { tipo: 'zona'; fila: T; enGrupo: boolean }
export function ordenarConGrupos<T extends { z: { clave: ZonaIem } }> (filas: T[]): FilaOrdenada<T>[] {
  const out: FilaOrdenada<T>[] = []
  const hechos = new Set<string>()
  for (const f of filas) {
    const g = grupoDeZona(f.z.clave)
    if (!g) { out.push({ tipo: 'zona', fila: f, enGrupo: false }); continue }
    if (hechos.has(g.clave)) continue
    hechos.add(g.clave)
    const zonas = filas.filter(x => grupoDeZona(x.z.clave)?.clave === g.clave)
    out.push({ tipo: 'grupo', clave: g.clave, nombre: g.nombre, zonas })
    for (const z of zonas) out.push({ tipo: 'zona', fila: z, enGrupo: true })
  }
  return out
}

/**
 * Avisos de series de una zona (11-c): un grupo suyo por debajo del mínimo
 * efectivo (MEV) o por encima del máximo recuperable (MRV). Misma regla que los
 * avisos de Planificar progresión: el mínimo solo cuenta si el bloque entrena ese
 * grupo y la semana no es de descarga; las series se pasan a semana de 7 días.
 * Solo esto resalta la fila: quedar bajo el objetivo de IEM ya lo dicen la barra
 * y «Falta».
 */
export interface AvisoDeSeries { grupo: MuscleGroup; series: number; tipo: 'bajo' | 'sobre'; limite: number }
export function avisosDeSeries (
  grupos: readonly MuscleGroup[],
  seriesPorGrupo: ReadonlyMap<MuscleGroup, number>,
  limites: Partial<Record<MuscleGroup, { mev: number; mrv: number }>>,
  o: { semanasDelCiclo: number; descarga: boolean; entrena: (g: MuscleGroup) => boolean }
): AvisoDeSeries[] {
  const out: AvisoDeSeries[] = []
  for (const g of grupos) {
    const lm = limites[g]
    if (!lm) continue
    const series = Math.round((seriesPorGrupo.get(g) ?? 0) / Math.max(o.semanasDelCiclo, 1 / 7))
    if (series > lm.mrv) out.push({ grupo: g, series, tipo: 'sobre', limite: lm.mrv })
    else if (!o.descarga && o.entrena(g) && series < lm.mev) out.push({ grupo: g, series, tipo: 'bajo', limite: lm.mev })
  }
  return out
}

/** Zona de IEM que entrena un grupo muscular de la app (p. ej. deltoide_lat → deltoides). */
export function zonaDeGrupo (grupo: MuscleGroup | undefined): ZonaIem | undefined {
  if (!grupo) return undefined
  return ZONAS_IEM.find(z => (z.grupos as readonly MuscleGroup[]).includes(grupo))?.clave
}
