/**
 * Agujetas por zona y la regla de freno / acelerador del curso.
 *
 * Escala del curso: 1 a 5 («apenas he notado trabajo» … «duele incluso en
 * reposo»). En la app se preguntan UNA VEZ A LA SEMANA en el DOM's 0-10 por
 * grupo (`doms.<grupo>`, decisión de Dani 27-10: nada de cuestionarios cada dos
 * días) y aquí se convierten a 1-5 con max(1, round(v / 2)). Si hubiera
 * respuestas antiguas en `agujetas.<zona>` (1-5), se usan tal cual.
 *
 * Reglas (clase de seguimiento semanal del curso; el detalle, en `propuestaZona`):
 *   5 → freno: nunca subir; reducir o pausar la carga de esa zona (sin % fijo,
 *       decisión de Dani del 25-10).
 *   4 → zona propensa a agujetas (`sensible` en zonas.ts: isquios y aductores):
 *       esperar una semana y, si sigue sin recuperar, bajar. Zona no propensa
 *       (p. ej. deltoides): te pasas, bajar un 15-30 %.
 *   1-3 → margen para subir si el IF de la sesión y el contexto lo permiten.
 *       Sensibilidad estática: solo con un 1. Dinámica: con 1-3.
 *       Cuánto lo dice la velocidad (suave ~10 %, medio ~20 %, agresivo ~30 %).
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

/**
 * Modo (sensibilidad) de una zona (Dani, 25-10): lo que el coach haya puesto o,
 * por defecto, dinámico en las zonas que se priorizan (las que tienen objetivo
 * de IEM) y estático en el resto, que se mantienen.
 */
export function sensibilidadDeZona (
  m: { cdgModoPorZona?: Partial<Record<string, Sensibilidad>>; cdgObjetivosIem?: Partial<Record<string, number>> },
  zona: ZonaIem,
): Sensibilidad {
  return m.cdgModoPorZona?.[zona] ?? (m.cdgObjetivosIem?.[zona] != null ? 'dinamico' : 'estatico')
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

export type TonoPropuesta = 'freno' | 'vigilar' | 'mantener' | 'acelerar' | 'objetivo' | 'sin-dato'
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
 * Umbrales del protocolo semanal, en un solo sitio (E-09). PENDIENTES DE
 * VALIDAR con la formación de Dani (decisión D15): la pantalla los marca así
 * hasta entonces. Fijos a propósito: no se editan desde la app (Dani, 23-10).
 */
export const UMBRALES_PROTOCOLO = {
  /** Contexto desfavorable si estrés ≥, sueño <, motivación ≤. */
  estresMalo: 7, sueñoMaloHoras: 6, motivacionMala: 4,
  /** Contexto favorable si estrés ≤, sueño ≥, motivación ≥ (todos los que haya). */
  estresBueno: 4, sueñoBuenoHoras: 7, motivacionBuena: 7,
  /** Fatiga al salir de las sesiones a partir de la cual no se sube el IEM. */
  fatigaPostAlta: 8,
  /** Con una base de IEM así de alta, la subida no pasa de `subidaMaxBaseAlta` %. */
  iemBaseAlta: 100, subidaMaxBaseAlta: 10,
  /** Una lectura de agujetas más antigua que esto ya no dice nada de la semana. */
  diasVigenciaAgujetas: 7,
  /** Revisados por Dani el 27-10-2026 (son suyos, no del curso). */
  validados: true,
} as const

/** ¿La lectura de agujetas es de los últimos `diasVigenciaAgujetas` días? (fechas YYYY-MM-DD) */
export function agujetasVigentes (fechaLectura: string, hoy: string, dias: number = UMBRALES_PROTOCOLO.diasVigenciaAgujetas): boolean {
  const ms = Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${fechaLectura.slice(0, 10)}T00:00:00Z`)
  return Number.isFinite(ms) && ms >= 0 && ms <= dias * 86_400_000
}

/**
 * Contexto de la semana a partir del seguimiento (guía, paso 1 del protocolo):
 * dónde va el pie antes de mirar ninguna zona.
 */
export function contextoDeLaSemana (o: { estres?: number; sueñoHoras?: number; motivacion?: number }): { contexto: Contexto; motivos: string[] } {
  const { estres, sueñoHoras, motivacion } = o
  if (estres == null && sueñoHoras == null && motivacion == null) return { contexto: 'sin-dato', motivos: [] }
  const u = UMBRALES_PROTOCOLO
  const malos: string[] = []
  if (estres != null && estres >= u.estresMalo) malos.push(`estrés ${estres}/10`)
  if (sueñoHoras != null && sueñoHoras < u.sueñoMaloHoras) malos.push(`${sueñoHoras.toLocaleString('es-ES')} h de sueño`)
  if (motivacion != null && motivacion <= u.motivacionMala) malos.push(`motivación ${motivacion}/10`)
  if (malos.length) return { contexto: 'desfavorable', motivos: malos }
  const buenos = (estres == null || estres <= u.estresBueno) && (sueñoHoras == null || sueñoHoras >= u.sueñoBuenoHoras) && (motivacion == null || motivacion >= u.motivacionBuena)
  return { contexto: buenos ? 'favorable' : 'neutro', motivos: [] }
}

const r1 = (v: number) => Math.round(v * 10) / 10

/**
 * Freno / acelerador de una zona: el protocolo semanal de la guía.
 *  1. Agujetas 5 (duele en reposo) → nunca subir; reducir o pausar esa carga,
 *     y cuánto lo decide el coach: sin % fijo (Dani, 25-10). Si la subida vino
 *     de ejercicios en estiramiento, quitar estiramiento antes que series.
 *  2. Agujetas 4: en zona propensa (isquios, aductores) se espera una semana;
 *     en el resto, bajar 15-30 %.
 *  3. Fatiga al salir de las sesiones 8-9 o más → no subir IEM: bajar IF manteniéndolo.
 *  4. Contexto desfavorable → el curso no lo veta, lo hace más prudente: la mitad
 *     del %, con aviso (Dani, 27-10). Un mal momento puntual tampoco obliga a bajar.
 *  5. Se sube si lo permite la sensibilidad (estático: 1; dinámico: 1-3), lo que
 *     diga la velocidad, a la mitad con contexto neutro. Con una base alta
 *     (≥ 100) no más de un 10 %: se mantienen los puntos añadidos, no el porcentaje.
 *  6. El IEM objetivo de la zona (Volumen) es la meta: la subida no lo pasa, y
 *     si ya llega, el motor no propone y decide el coach (Dani, 25-10).
 */
export function propuestaZona (o: {
  agujetas?: number; anterior?: number; sensible: boolean; tipo: TipoDeBloque; esObjetivo: boolean;
  iem?: number; contexto?: Contexto; fatigaPost?: number
  /** IEM semanal objetivo de la zona (`Mesocycle.cdgObjetivosIem`), si lo hay. */
  objetivo?: number
  /** Semana 1 de un bloque tras un parón (`Mesocycle.vuelveDeParon`): el curso
   *  pide no apretar el freno de golpe, el pico de agujetas suele normalizarse solo (P5). */
  primeraSemanaTrasParon?: boolean
}): Propuesta {
  const { agujetas: a, anterior, sensible, tipo, esObjetivo, iem = 0, contexto = 'sin-dato', fatigaPost, objetivo, primeraSemanaTrasParon } = o
  const con = (pct: number) => (iem > 0.005 ? { pct, iemPropuesto: r1(iem * (1 + pct / 100)) } : { pct })
  if (a == null) return { tono: 'sin-dato', texto: 'Sin agujetas registradas: decide con la recuperación entre sesiones y el rendimiento.' }
  if (a >= 4 && primeraSemanaTrasParon) {
    return { tono: 'vigilar', texto: 'Primera semana tras un parón: el pico de agujetas es normal y suele normalizarse solo. No frenes de golpe; espera a la semana que viene y anótalo.' }
  }
  if (a >= 5) return { tono: 'freno', texto: 'Duele incluso en reposo: no subir. Reduce o pausa la carga de esta zona y mira cómo evoluciona; tú decides cuánto. Si la subida vino de ejercicios en estiramiento, quita estiramiento antes que series.' }
  if (a >= 4) {
    if (!sensible) return { tono: 'freno', texto: 'No es una zona propensa a agujetas: con un 4 te estás pasando. Bajar su IEM un 15-30 %.', ...con(-20) }
    if (anterior != null && anterior >= 4) return { tono: 'freno', texto: 'Segunda semana seguida en 4 o más: no se recupera. Bajar su IEM un 15-30 %.', ...con(-20) }
    return { tono: 'vigilar', texto: 'Zona propensa a agujetas (trabajo en estiramiento): esperar una semana y anotarlo. Si sigue en 4, bajar.' }
  }
  if (fatigaPost != null && fatigaPost >= UMBRALES_PROTOCOLO.fatigaPostAlta) {
    return { tono: 'mantener', texto: `Sale muy cansado de las sesiones (${fatigaPost}/10): no subir el IEM. Si puedes, baja el IF de la sesión manteniendo el IEM.` }
  }
  const umbral = tipo.sensibilidad === 'dinamico' ? 3 : 1
  if (a > umbral) return { tono: 'mantener', texto: tipo.sensibilidad === 'estatico' && a <= 3 ? 'Mantener: en un bloque estático solo se sube con agujetas de 1.' : 'Mantener el IEM.' }
  if (objetivo != null && objetivo > 0 && iem >= objetivo - 0.05) {
    return { tono: 'objetivo', texto: `Ya llega a su objetivo de ${r1(objetivo).toLocaleString('es-ES')}: decide tú si sigue subiendo.` }
  }
  let pct = VELOCIDADES.find(v => v.value === tipo.velocidad)!.pct
  const notas: string[] = []
  if (contexto !== 'favorable') {
    pct = Math.round(pct / 2)
    notas.push(contexto === 'desfavorable' ? 'contexto desfavorable: si subes, poco; si se repite varias semanas, baja' : contexto === 'neutro' ? 'contexto neutro: la mitad' : 'sin datos de contexto: la mitad')
  }
  if (iem >= UMBRALES_PROTOCOLO.iemBaseAlta && pct > UMBRALES_PROTOCOLO.subidaMaxBaseAlta) { pct = UMBRALES_PROTOCOLO.subidaMaxBaseAlta; notas.push('base alta: mantén los puntos añadidos, no repitas el porcentaje') }
  if (iem > 0.005 && iem < 10) notas.push('zona poco trabajada: admite subidas mucho mayores')
  if (objetivo != null && objetivo > 0 && iem > 0.005 && iem * (1 + pct / 100) > objetivo) {
    // Hacia abajo: la subida no pasa del objetivo (1e-9 por el redondeo de coma flotante).
    pct = Math.max(1, Math.floor((objetivo / iem - 1) * 100 + 1e-9))
    notas.push(`hasta su objetivo de ${r1(objetivo).toLocaleString('es-ES')}`)
  }
  return {
    tono: 'acelerar',
    texto: `Margen para subir el IEM ~${pct} %${esObjetivo ? ' (zona objetivo)' : ''}${notas.length ? ` · ${notas.join(' · ')}` : ''}. Comprueba que el IF de la sesión lo admite.`,
    ...con(pct),
  }
}
