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

/**
 * Tipo de bloque (guía del Índice de Hipertrofia, «tipos de bloque»): dos ejes
 * que antes iban juntos en una sola «actitud».
 *  - Sensibilidad: CUÁNDO se sube. Estático = solo con agujetas 1; dinámico = con 1-3.
 *  - Velocidad: CUÁNTO se sube. Suave ≈ +10 %, medio ≈ +20 %, agresivo hasta ≈ +30 %.
 */
export type Sensibilidad = 'estatico' | 'dinamico'
export type Velocidad = 'suave' | 'medio' | 'agresivo'
export interface TipoDeBloque { sensibilidad: Sensibilidad; velocidad: Velocidad }

/** Actitud de una sola pieza: la que guardaban los bloques creados antes de separar los ejes. */
export type ActitudBloque = 'estatico' | 'dinamico' | 'agresivo'
export const TIPO_POR_DEFECTO: TipoDeBloque = { sensibilidad: 'estatico', velocidad: 'suave' }

/** El tipo de un mesociclo: los campos nuevos o, si no hay, el que equivale a la actitud antigua. */
export function tipoDeBloque (m: { cdgSensibilidad?: Sensibilidad; cdgVelocidad?: Velocidad; cdgActitud?: ActitudBloque }): TipoDeBloque {
  const viejo: TipoDeBloque = m.cdgActitud === 'agresivo' ? { sensibilidad: 'dinamico', velocidad: 'agresivo' }
    : m.cdgActitud === 'dinamico' ? { sensibilidad: 'dinamico', velocidad: 'medio' }
      : TIPO_POR_DEFECTO
  return { sensibilidad: m.cdgSensibilidad ?? viejo.sensibilidad, velocidad: m.cdgVelocidad ?? viejo.velocidad }
}

export const SENSIBILIDADES: Array<{ value: Sensibilidad; label: string; ayuda: string }> = [
  { value: 'estatico', label: 'Estático', ayuda: 'Solo se sube con agujetas de 1' },
  { value: 'dinamico', label: 'Dinámico', ayuda: 'Se sube con agujetas de 1 a 3' },
]
export const VELOCIDADES: Array<{ value: Velocidad; label: string; pct: number }> = [
  { value: 'suave', label: 'Suave (~10 %)', pct: 10 },
  { value: 'medio', label: 'Medio (~20 %)', pct: 20 },
  { value: 'agresivo', label: 'Agresivo (~30 %)', pct: 30 },
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
export interface Propuesta {
  tono: TonoPropuesta
  texto: string
  /** Cambio de IEM propuesto en % (negativo = bajar). */
  pct?: number
  /** IEM semanal al que llevaría ese cambio. */
  iemPropuesto?: number
}

export type Contexto = 'favorable' | 'neutro' | 'desfavorable' | 'sin-dato'

/**
 * Contexto de la semana a partir del seguimiento (guía, paso 1 del protocolo):
 * dónde va el pie antes de mirar ninguna zona.
 */
export function contextoDeLaSemana (o: { estres?: number; sueñoHoras?: number; motivacion?: number }): { contexto: Contexto; motivos: string[] } {
  const { estres, sueñoHoras, motivacion } = o
  if (estres == null && sueñoHoras == null && motivacion == null) return { contexto: 'sin-dato', motivos: [] }
  const malos: string[] = []
  if (estres != null && estres >= 7) malos.push(`estrés ${estres}/10`)
  if (sueñoHoras != null && sueñoHoras < 6) malos.push(`${sueñoHoras.toLocaleString('es-ES')} h de sueño`)
  if (motivacion != null && motivacion <= 4) malos.push(`motivación ${motivacion}/10`)
  if (malos.length) return { contexto: 'desfavorable', motivos: malos }
  const buenos = (estres == null || estres <= 4) && (sueñoHoras == null || sueñoHoras >= 7) && (motivacion == null || motivacion >= 7)
  return { contexto: buenos ? 'favorable' : 'neutro', motivos: [] }
}

const r1 = (v: number) => Math.round(v * 10) / 10

/**
 * Freno / acelerador de una zona: el protocolo semanal de la guía.
 *  1. Agujetas 5 → bajar 20-30 % (si la subida vino de ejercicios en
 *     estiramiento, quitar estiramiento antes que series).
 *  2. Agujetas 4: en zona propensa (isquios, aductores) se espera una semana;
 *     en el resto, bajar 15-30 %.
 *  3. Fatiga al salir de las sesiones 8-9 o más → no subir IEM: bajar IF manteniéndolo.
 *  4. Contexto desfavorable → no subir (un mal momento puntual tampoco obliga a bajar).
 *  5. Se sube si lo permite la sensibilidad (estático: 1; dinámico: 1-3), lo que
 *     diga la velocidad, a la mitad con contexto neutro. Con una base alta
 *     (≥ 100) no más de un 10 %: se mantienen los puntos añadidos, no el porcentaje.
 */
export function propuestaZona (o: {
  agujetas?: number; anterior?: number; sensible: boolean; tipo: TipoDeBloque; esObjetivo: boolean;
  iem?: number; contexto?: Contexto; fatigaPost?: number
}): Propuesta {
  const { agujetas: a, anterior, sensible, tipo, esObjetivo, iem = 0, contexto = 'sin-dato', fatigaPost } = o
  const con = (pct: number) => (iem > 0.005 ? { pct, iemPropuesto: r1(iem * (1 + pct / 100)) } : { pct })
  if (a == null) return { tono: 'sin-dato', texto: 'Sin agujetas registradas: decide con la recuperación entre sesiones y el rendimiento.' }
  if (a >= 5) return { tono: 'freno', texto: 'Frenar ya: bajar su IEM un 20-30 %. Si la subida vino de ejercicios en estiramiento, quita estiramiento antes que series.', ...con(-25) }
  if (a >= 4) {
    if (!sensible) return { tono: 'freno', texto: 'No es una zona propensa a agujetas: con un 4 te estás pasando. Bajar su IEM un 15-30 %.', ...con(-20) }
    if (anterior != null && anterior >= 4) return { tono: 'freno', texto: 'Segunda semana seguida en 4 o más: no se recupera. Bajar su IEM un 15-30 %.', ...con(-20) }
    return { tono: 'vigilar', texto: 'Zona propensa a agujetas (trabajo en estiramiento): esperar una semana y anotarlo. Si sigue en 4, bajar.' }
  }
  if (fatigaPost != null && fatigaPost >= 8) {
    return { tono: 'mantener', texto: `Sale muy cansado de las sesiones (${fatigaPost}/10): no subir el IEM. Si puedes, baja el IF de la sesión manteniendo el IEM.` }
  }
  const umbral = tipo.sensibilidad === 'dinamico' ? 3 : 1
  if (a > umbral) return { tono: 'mantener', texto: tipo.sensibilidad === 'estatico' && a <= 3 ? 'Mantener: en un bloque estático solo se sube con agujetas de 1.' : 'Mantener el IEM.' }
  if (contexto === 'desfavorable') return { tono: 'mantener', texto: 'Contexto desfavorable esta semana: no subir. Si se repite varias semanas, baja carga; si es puntual, solo espera.' }
  let pct = VELOCIDADES.find(v => v.value === tipo.velocidad)!.pct
  const notas: string[] = []
  if (contexto === 'neutro' || contexto === 'sin-dato') { pct = Math.round(pct / 2); notas.push(contexto === 'neutro' ? 'contexto neutro: la mitad' : 'sin datos de contexto: la mitad') }
  if (iem >= 100 && pct > 10) { pct = 10; notas.push('base alta: mantén los puntos añadidos, no repitas el porcentaje') }
  if (iem > 0.005 && iem < 10) notas.push('zona poco trabajada: admite subidas mucho mayores')
  return {
    tono: 'acelerar',
    texto: `Margen para subir el IEM ~${pct} %${esObjetivo ? ' (zona objetivo)' : ''}${notas.length ? ` · ${notas.join(' · ')}` : ''}. Comprueba que el IF de la sesión lo admite.`,
    ...con(pct),
  }
}
