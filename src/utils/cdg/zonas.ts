/**
 * Zonas de programación por IEM.
 *
 * El curso programa el IEM por TEJIDO («el IEM del glúteo», «el aductor con 16,7
 * puntos») y las agujetas se preguntan por zona. Una zona es la SUMA del IEM de
 * sus músculos CDG (como hacen los «IEM [COMPUESTO]» de la hoja): no cambia
 * ninguna fórmula del motor, solo agrupa. Las mismas zonas sirven para el IEM
 * objetivo del bloque, el cuestionario de agujetas a las 48 h y el freno/acelerador.
 *
 * `sensible`: músculos en los que el curso avisa de más agujetas por el trabajo
 * en estiramiento (isquios, glúteo, aductores, dorsal). Con un 4 en ellos se
 * espera una semana; en el resto un 4 ya es pasarse.
 * `articulaciones`: zonas de estrés articular que carga sobre todo esa musculatura.
 */
import type { MuscleGroup } from '../../types.js'
import type { MotorCdg } from './motor.js'

export const ZONAS_IEM = [
  { clave: 'pectoral', nombre: 'Pectoral', musculos: ['Pectoral haz clavicular', 'Pectoral haz esterno costal', 'Pectoral haz costo abdominal'], grupos: ['pecho'], sensible: false, articulaciones: ['Hombro Articular', 'Hombro Tendinoso Compresivo', 'Hombro Tendinoso Tensil'] },
  { clave: 'dorsal', nombre: 'Dorsal', musculos: ['Dorsal transversales', 'Dorsal longitudinales'], grupos: ['dorsal'], sensible: true, articulaciones: ['Hombro Articular', 'Hombro Tendinoso Tensil'] },
  { clave: 'trapecio', nombre: 'Trapecio (escápula)', musculos: ['Complejo escapular'], grupos: ['trapecio'], sensible: false, articulaciones: ['Hombro Articular'] },
  { clave: 'deltoides', nombre: 'Deltoides', musculos: ['Deltoides anterior', 'Deltoides medial', 'Deltoides posterior'], grupos: ['deltoide_ant', 'deltoide_lat', 'deltoide_post'], sensible: false, articulaciones: ['Hombro Articular', 'Hombro Tendinoso Compresivo', 'Hombro Tendinoso Tensil'] },
  { clave: 'biceps', nombre: 'Bíceps (flexores de codo)', musculos: ['Flexores de codo biceps c. larga', 'Flexores de codo biceps c. corta', 'Flexores de codo braquial', 'Flexores de codo braquioradial'], grupos: ['biceps'], sensible: false, articulaciones: [] },
  { clave: 'triceps', nombre: 'Tríceps', musculos: ['Triceps cabeza larga', 'Triceps cabezas medial y lateral'], grupos: ['triceps'], sensible: false, articulaciones: [] },
  { clave: 'antebrazo', nombre: 'Antebrazo', musculos: ['Antebrazo posterior', 'Antebrazo anterior'], grupos: ['antebrazo'], sensible: false, articulaciones: [] },
  { clave: 'lumbares', nombre: 'Erectores (lumbares)', musculos: ['Erectores espinales lumbares', 'Erectores espinales dorsales'], grupos: ['lumbares'], sensible: false, articulaciones: ['Columna Cizalla', 'Columna Sagital flexión', 'Columna Sagital extensión'] },
  { clave: 'abdomen', nombre: 'Abdomen y oblicuos', musculos: ['Abdomen', 'Oblicuos'], grupos: ['core'], sensible: false, articulaciones: ['Columna Sagital flexión', 'Columna Rotacional'] },
  { clave: 'cuadriceps', nombre: 'Cuádriceps', musculos: ['Cuádriceps vastos lateral, medial e intermedio', 'Cuádriceps recto anterior'], grupos: ['cuadriceps'], sensible: false, articulaciones: ['Rodilla Articular', 'Rodilla Tendinoso Compresivo', 'Rodilla Tendinoso Tensil'] },
  { clave: 'isquios', nombre: 'Isquiotibiales', musculos: ['Isquios'], grupos: ['isquios'], sensible: true, articulaciones: ['Cadera Articular', 'Columna Cizalla'] },
  { clave: 'gluteo', nombre: 'Glúteo (mayor y medio)', musculos: ['Glúteo mayor f. superiores', 'Glúteo mayor f. inferiores', 'Glúteo medio'], grupos: ['gluteo'], sensible: true, articulaciones: ['Cadera Articular'] },
  { clave: 'aductores', nombre: 'Aductores', musculos: ['Aductores'], grupos: ['aductores'], sensible: true, articulaciones: ['Cadera Articular'] },
  { clave: 'gemelos', nombre: 'Gemelos', musculos: ['Plantiflexores sóleo', 'Plantiflexores gastrocnemios'], grupos: ['gemelo'], sensible: false, articulaciones: [] },
] as const satisfies ReadonlyArray<{ clave: string; nombre: string; musculos: readonly string[]; grupos: readonly MuscleGroup[]; sensible: boolean; articulaciones: readonly string[] }>

export type ZonaIem = typeof ZONAS_IEM[number]['clave']
export type DefZonaIem = typeof ZONAS_IEM[number]
export const ZONA_POR_CLAVE = Object.fromEntries(ZONAS_IEM.map(z => [z.clave, z])) as Record<ZonaIem, DefZonaIem>
export const esZonaIem = (k: string): k is ZonaIem => k in ZONA_POR_CLAVE

/** Índices del motor de cada zona. Un nombre que no esté en el catálogo se ignora (y se devuelve en `faltan`). */
export function indicesDeZonas (motor: Pick<MotorCdg, 'musculos' | 'articulaciones'>) {
  const faltan: string[] = []
  const idx = (lista: readonly string[], nombres: readonly string[]) => nombres.flatMap(n => {
    const i = lista.indexOf(n)
    if (i < 0) { faltan.push(n); return [] }
    return [i]
  })
  const zonas = ZONAS_IEM.map(z => ({ ...z, iMusculos: idx(motor.musculos, z.musculos), iArticulaciones: idx(motor.articulaciones, z.articulaciones) }))
  return { zonas, faltan }
}

/** IEM de cada zona (suma de sus músculos). */
export function iemPorZona (motor: Pick<MotorCdg, 'musculos' | 'articulaciones'>, IEM: number[]): Record<ZonaIem, number> {
  const out = {} as Record<ZonaIem, number>
  for (const z of indicesDeZonas(motor).zonas) out[z.clave] = z.iMusculos.reduce((a, i) => a + (IEM[i] ?? 0), 0)
  return out
}

/** Variación relativa; null si no hay base. */
export const variacion = (antes: number, ahora: number): number | null => (antes > 0.005 ? (ahora - antes) / antes : null)

export interface AvisoArticular { zona: ZonaIem; articulacion: string; dIEM: number; dIEA: number }

/**
 * Zonas en las que, de una semana a la siguiente, el estrés articular de sus
 * articulaciones sube MÁS que el estímulo del músculo: la carga extra se va más
 * al tejido pasivo que al músculo. Sin umbrales nuevos: es una comparación entre
 * las dos variaciones.
 */
export function avisosIemIea (
  motor: Pick<MotorCdg, 'musculos' | 'articulaciones'>,
  antes: { IEM: number[]; estresArticular: number[] },
  ahora: { IEM: number[]; estresArticular: number[] }
): AvisoArticular[] {
  const out: AvisoArticular[] = []
  for (const z of indicesDeZonas(motor).zonas) {
    const a = z.iMusculos.reduce((s, i) => s + (antes.IEM[i] ?? 0), 0)
    const b = z.iMusculos.reduce((s, i) => s + (ahora.IEM[i] ?? 0), 0)
    const dIEM = variacion(a, b)
    if (dIEM == null || dIEM <= 0) continue
    for (const j of z.iArticulaciones) {
      const dIEA = variacion(antes.estresArticular[j] ?? 0, ahora.estresArticular[j] ?? 0)
      if (dIEA != null && dIEA > dIEM) out.push({ zona: z.clave, articulacion: motor.articulaciones[j], dIEM, dIEA })
    }
  }
  return out
}
