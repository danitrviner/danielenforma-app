/**
 * Agujetas a las 48 h por zona y la regla de freno / acelerador del curso.
 *
 * Escala del curso: 1 a 5, a las 48 h de la sesión de esa zona.
 *   1 = «apenas he notado trabajo» · 5 = duele incluso en reposo.
 * Señales nuevas `agujetas.<zona>` (cuestionario «Agujetas a las 48 h»). Si el
 * atleta solo tiene el cuestionario antiguo (DOM's 0-10 por grupo, `doms.<grupo>`)
 * se usa ese, convertido a 1-5 con max(1, round(v / 2)), y se marca.
 *
 * Reglas (clases de seguimiento):
 *   5 → freno agudo en esa zona: bajar su IEM un 20-30 %.
 *   4 → zona sensible (isquios, glúteo, aductores, dorsal): esperar una semana y,
 *       si sigue sin recuperar, bajar. Zona no sensible (p. ej. deltoides): te pasas, bajar.
 *   3 → mantener; en bloque agresivo se puede subir si el contexto es favorable.
 *   1-2 → margen: subir el IEM si el IF de la sesión y el contexto lo permiten.
 *       Bloque estático: solo se sube en las zonas objetivo y con un 1.
 *       Bloque dinámico: se sube con 1-2. Bloque agresivo: incluso con 3.
 * Las agujetas no se leen a ciegas: los ejercicios en estiramiento y los tempos
 * excéntricos largos dan más agujetas con el mismo IEM.
 */
import { ZONAS_IEM, type ZonaIem } from './zonas.js'

export type ActitudBloque = 'estatico' | 'dinamico' | 'agresivo'
export const ACTITUD_POR_DEFECTO: ActitudBloque = 'estatico'
export const ACTITUDES: Array<{ value: ActitudBloque; label: string; ayuda: string }> = [
  { value: 'estatico', label: 'Estático', ayuda: 'Solo sube en zonas objetivo y con un 1' },
  { value: 'dinamico', label: 'Dinámico', ayuda: 'Sube con agujetas de 1-2' },
  { value: 'agresivo', label: 'Agresivo', ayuda: 'Sube incluso con un 3 si el contexto acompaña' },
]

export interface PuntoSeñal { date: string; value: number }
export type SerieDeSeñal = (signalKey: string) => PuntoSeñal[]

export interface LecturaAgujetas {
  zona: ZonaIem
  valor: number
  fecha: string
  /** Lectura anterior de la misma zona (para ver si se recupera de una semana a otra). */
  anterior?: number
  /** Viene del cuestionario antiguo 0-10, convertido. */
  deEscala10: boolean
}

export const aEscala5 = (v010: number) => Math.min(5, Math.max(1, Math.round(v010 / 2)))

export function agujetasPorZona (serie: SerieDeSeñal): Partial<Record<ZonaIem, LecturaAgujetas>> {
  const out: Partial<Record<ZonaIem, LecturaAgujetas>> = {}
  for (const z of ZONAS_IEM) {
    const nuevas = serie(`agujetas.${z.clave}`).filter(p => p.value >= 1 && p.value <= 5)
    if (nuevas.length) {
      const u = nuevas[nuevas.length - 1]
      out[z.clave] = { zona: z.clave, valor: u.value, fecha: u.date, anterior: nuevas[nuevas.length - 2]?.value, deEscala10: false }
      continue
    }
    // Cuestionario antiguo: por fecha, el peor de los grupos de la zona.
    const porFecha = new Map<string, number>()
    for (const g of z.grupos) for (const p of serie(`doms.${g}`)) porFecha.set(p.date, Math.max(porFecha.get(p.date) ?? 0, p.value))
    const fechas = [...porFecha.keys()].sort()
    if (!fechas.length) continue
    const f = fechas[fechas.length - 1]; const fa = fechas[fechas.length - 2]
    out[z.clave] = { zona: z.clave, valor: aEscala5(porFecha.get(f)!), fecha: f, anterior: fa ? aEscala5(porFecha.get(fa)!) : undefined, deEscala10: true }
  }
  return out
}

export type TonoPropuesta = 'freno' | 'vigilar' | 'mantener' | 'acelerar' | 'sin-dato'
export interface Propuesta { tono: TonoPropuesta; texto: string }

export function propuestaZona (o: { agujetas?: number; anterior?: number; sensible: boolean; actitud: ActitudBloque; esObjetivo: boolean }): Propuesta {
  const { agujetas: a, anterior, sensible, actitud, esObjetivo } = o
  if (a == null) return { tono: 'sin-dato', texto: 'Sin agujetas registradas: decide con la recuperación entre sesiones y el rendimiento.' }
  if (a >= 5) return { tono: 'freno', texto: 'Frenar ya en esta zona: bajar su IEM un 20-30 %.' }
  if (a >= 4) {
    if (!sensible) return { tono: 'freno', texto: 'No es una zona propensa a agujetas: con un 4 te estás pasando. Bajar su IEM.' }
    if (anterior != null && anterior >= 4) return { tono: 'freno', texto: 'Segunda semana seguida en 4 o más: no se recupera. Bajar su IEM.' }
    return { tono: 'vigilar', texto: 'Zona propensa a agujetas (trabajo en estiramiento): esperar una semana. Si sigue en 4, bajar.' }
  }
  const umbralSubir = actitud === 'agresivo' ? 3 : actitud === 'dinamico' ? 2 : 1
  const puedeSubir = a <= umbralSubir && (actitud !== 'estatico' || esObjetivo)
  if (puedeSubir) return { tono: 'acelerar', texto: `Margen para subir el IEM${esObjetivo ? ' (zona objetivo)' : ''} si el IF de la sesión y el contexto lo permiten. Cuanto mejor el contexto, más se sube.` }
  return { tono: 'mantener', texto: a <= 2 && actitud === 'estatico' && !esObjetivo ? 'Mantener: en bloque estático solo se sube en las zonas objetivo.' : 'Mantener el IEM.' }
}
