/**
 * Las señales de contexto (estrés, sueño, motivación, cansancio al salir)
 * alineadas POR SEMANA, no por posición (F16, 17-11-2026).
 *
 * Antes se emparejaba «la penúltima respuesta de estrés» con «la penúltima de
 * sueño», aunque vinieran de cuestionarios distintos y de semanas distintas:
 * bastaba con que uno se hubiera contestado una vez más que el otro para que
 * el contexto de «hace 3 semanas» mezclara meses. Aquí cada respuesta va al
 * ciclo de revisión al que pertenece (`aperturaDelCiclo`: con revisión el
 * lunes, de martes a lunes, identificado por su viernes), y una semana sin
 * respuestas es «sin dato», no un hueco que se salta.
 *
 * D6r (17-11-2026): el cansancio al salir ya se apunta en cada sesión
 * (`WorkoutLog.cansancioAlSalir`). `cansancioDeSesiones` da la media de las
 * sesiones de la semana que se evalúa y CUÁL fue la más dura; el cuestionario
 * semanal queda de respaldo para quien no lo apunte por sesión.
 *
 * Auditoría de cifras (17-11-2026): el freno ya no espera a la MEDIA. Con la
 * media en 8 hacía falta que casi todas las sesiones de la semana fueran de 8,
 * y el curso lo mira sesión a sesión: de una sesión de la que se sale con 8 o
 * más no se sube lo que se trabajó ESE día. `cansancioDeSesiones` da además
 * las sesiones «duras» con los ejercicios registrados en cada una, y
 * `sesionesDurasPorZona` las reparte por zona con el grupo muscular de cada
 * ejercicio (`ZONAS_IEM[].grupos`): no hace falta el motor CDG. La media en 8
 * o más sigue frenando todas las zonas (`propuestaZona`).
 */
import type { MuscleGroup, WorkoutLog } from '../../types.js'
import { aperturaDelCiclo } from '../cicloRevision.js'
import { addDays } from '../trainingWeek.js'
import { contextoDeLaSemana, UMBRALES_PROTOCOLO, type Contexto, type PuntoSeñal } from './agujetas.js'
import { ZONAS_IEM, type ZonaIem } from './zonas.js'

export interface SeriesDeContexto {
  estres: readonly PuntoSeñal[]
  sueño: readonly PuntoSeñal[]
  motivacion: readonly PuntoSeñal[]
  fatigaPost: readonly PuntoSeñal[]
}

export interface ContextoDeCiclo {
  /** Apertura del ciclo de revisión (el viernes, con revisión el lunes). */
  ciclo: string
  estres?: number
  sueñoHoras?: number
  motivacion?: number
  fatigaPost?: number
  contexto: Contexto
}

/** Tope de semanas que se devuelven: lo que miran los indicadores (4) con margen. */
const CICLOS_MAXIMOS = 26

/**
 * Una fila por ciclo de revisión, de la más antigua a la más reciente y SIN
 * saltos: desde el primer ciclo con alguna respuesta hasta el último cerrado
 * antes de `hoy` (o el de `hoy`, si ya tiene respuestas; si no, todavía no ha
 * llegado y no cuenta como «sin dato»). De cada señal, la última respuesta del ciclo.
 */
export function contextoPorCiclos (series: SeriesDeContexto, hoy: string, diaRevision?: number | null): ContextoDeCiclo[] {
  const porCiclo = new Map<string, Omit<ContextoDeCiclo, 'ciclo' | 'contexto'>>()
  const volcar = (puntos: readonly PuntoSeñal[], campo: 'estres' | 'sueñoHoras' | 'motivacion' | 'fatigaPost') => {
    // Vienen en orden ascendente: la última del ciclo pisa a las anteriores.
    for (const p of puntos) {
      const fecha = p.date.slice(0, 10)
      if (fecha > hoy) continue
      const ciclo = aperturaDelCiclo(fecha, diaRevision)
      porCiclo.set(ciclo, { ...porCiclo.get(ciclo), [campo]: p.value })
    }
  }
  volcar(series.estres, 'estres'); volcar(series.sueño, 'sueñoHoras'); volcar(series.motivacion, 'motivacion'); volcar(series.fatigaPost, 'fatigaPost')
  if (porCiclo.size === 0) return []

  const cicloDeHoy = aperturaDelCiclo(hoy, diaRevision)
  const ultimo = porCiclo.has(cicloDeHoy) ? cicloDeHoy : addDays(cicloDeHoy, -7)
  const primero = [...porCiclo.keys()].sort()[0]
  const filas: ContextoDeCiclo[] = []
  for (let c = ultimo; c >= primero && filas.length < CICLOS_MAXIMOS; c = addDays(c, -7)) {
    const v = porCiclo.get(c) ?? {}
    filas.unshift({ ciclo: c, ...v, contexto: contextoDeLaSemana(v).contexto })
  }
  return filas
}

/**
 * Los últimos valores SEGUIDOS con dato, en orden. «Dos semanas saliendo
 * destrozado» son las dos últimas semanas, no las dos últimas veces que
 * contestó: una semana sin respuesta corta la racha.
 */
export function rachaFinal<T> (valores: ReadonlyArray<T | undefined>): T[] {
  const out: T[] = []
  for (let i = valores.length - 1; i >= 0 && valores[i] != null; i--) out.unshift(valores[i] as T)
  return out
}

/** El valor de una señal en el ciclo de revisión al que pertenece `fecha`, si lo hay. */
export function valorEnElCicloDe (filas: readonly ContextoDeCiclo[], fecha: string, campo: 'estres' | 'sueñoHoras' | 'motivacion' | 'fatigaPost', diaRevision?: number | null): number | undefined {
  const ciclo = aperturaDelCiclo(fecha, diaRevision)
  return filas.find(f => f.ciclo === ciclo)?.[campo]
}

/** El cansancio al salir de las sesiones de una semana, apuntado sesión a sesión (D6r). */
export interface CansancioDeSesiones {
  /** Media de las sesiones con dato, con un decimal. */
  media: number
  /** Cuántas sesiones lo llevan apuntado. */
  sesiones: number
  /** Día de la última sesión con dato (`YYYY-MM-DD`). */
  fecha: string
  /** La sesión de la que salió más cansado (a igualdad, la más reciente). */
  peor: { logId: string; workoutId: string; fecha: string; valor: number; nombre?: string; /** «la del jueves, Pierna A» */ etiqueta: string }
  /** Las sesiones de las que salió con 8 o más (`UMBRALES_PROTOCOLO.fatigaPostAlta`),
   *  de la más antigua a la más reciente. Cada una frena las zonas que trabajó. */
  duras: SesionDura[]
}

/** Una sesión de la que salió con 8 o más de cansancio. */
export interface SesionDura {
  logId: string; workoutId: string; fecha: string; valor: number; nombre?: string
  /** «la del jueves, Pierna A» */
  etiqueta: string
  /** Ejercicios registrados en ella (con alguna serie hecha). Vacío si el
   *  registro llegó sin sus ejercicios: entonces no se sabe qué zonas frena. */
  ejercicios: string[]
}

/** La sesión dura que frena una zona: lo que `propuestaZona` necesita para nombrarla. */
export interface SesionDuraDeZona { etiqueta: string; valor: number; fecha: string }

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const
/** «jueves» de una fecha `YYYY-MM-DD`, sin depender de la zona horaria ni del idioma del entorno. */
const diaDeLaSemana = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return DIAS[new Date(Date.UTC(y, (m || 1) - 1, d || 1)).getUTCDay()]
}

/** «la del jueves, Pierna A» (o «la del jueves», sin nombre de rutina). */
export function etiquetaDeSesion (fecha: string, nombre?: string): string {
  return `la del ${diaDeLaSemana(fecha)}${nombre?.trim() ? `, ${nombre.trim()}` : ''}`
}

/**
 * Media del cansancio al salir (0-10) de las sesiones entre `desde` y `hasta`
 * (por `date`, los dos incluidos; sin límites, todas las que se pasen) y la
 * sesión con la nota más alta. Sin ninguna sesión con dato, `undefined`: quien
 * llama cae entonces al cuestionario semanal.
 */
export function cansancioDeSesiones (
  logs: ReadonlyArray<Pick<WorkoutLog, 'id' | 'workoutId' | 'date' | 'cansancioAlSalir'> & {
    /** Solo hace falta saber qué ejercicios se hicieron: de ahí salen las zonas de una sesión dura. */
    entries?: ReadonlyArray<{ exerciseId: string; sets?: ReadonlyArray<{ repsDone: number }> }>
  }>,
  o: { desde?: string; hasta?: string; nombreDe?: (workoutId: string) => string | undefined } = {},
): CansancioDeSesiones | undefined {
  const conDato = logs
    .filter(l => typeof l.cansancioAlSalir === 'number' && l.cansancioAlSalir >= 0 && l.cansancioAlSalir <= 10
      && (o.desde == null || l.date >= o.desde) && (o.hasta == null || l.date <= o.hasta))
    .sort((a, b) => a.date.localeCompare(b.date))
  if (conDato.length === 0) return undefined
  const suma = conDato.reduce((a, l) => a + l.cansancioAlSalir!, 0)
  // `>=`: recorriendo de la más antigua a la más reciente, a igualdad gana la última.
  const peor = conDato.reduce((p, l) => (l.cansancioAlSalir! >= p.cansancioAlSalir! ? l : p))
  const nombreDe = (workoutId: string) => o.nombreDe?.(workoutId)?.trim() || undefined
  const nombre = nombreDe(peor.workoutId)
  const duras: SesionDura[] = conDato
    .filter(l => l.cansancioAlSalir! >= UMBRALES_PROTOCOLO.fatigaPostAlta)
    .map(l => {
      const n = nombreDe(l.workoutId)
      // Solo los ejercicios que se hicieron: uno saltado no cansó a nadie.
      const ejercicios = [...new Set((l.entries ?? []).filter(e => e.sets?.some(s => s.repsDone > 0)).map(e => e.exerciseId))]
      return { logId: l.id, workoutId: l.workoutId, fecha: l.date, valor: l.cansancioAlSalir!, ...(n ? { nombre: n } : {}), etiqueta: etiquetaDeSesion(l.date, n), ejercicios }
    })
  return {
    media: Math.round((suma / conDato.length) * 10) / 10,
    sesiones: conDato.length,
    fecha: conDato[conDato.length - 1].date,
    peor: { logId: peor.id, workoutId: peor.workoutId, fecha: peor.date, valor: peor.cansancioAlSalir!, nombre, etiqueta: etiquetaDeSesion(peor.date, nombre) },
    duras,
  }
}

/** Las zonas que trabaja una lista de ejercicios, por el grupo muscular PRINCIPAL
 *  de cada uno (`ZONAS_IEM[].grupos`), en el orden de `ZONAS_IEM`. */
export function zonasDeEjercicios (ejercicios: readonly string[], grupoDe: (exerciseId: string) => MuscleGroup | undefined): ZonaIem[] {
  const grupos = new Set(ejercicios.map(grupoDe).filter((g): g is MuscleGroup => g != null))
  return ZONAS_IEM.filter(z => (z.grupos as readonly MuscleGroup[]).some(g => grupos.has(g))).map(z => z.clave)
}

/**
 * Qué sesión dura frena cada zona: la de nota más alta entre las que la
 * trabajaron (a igualdad, la más reciente). Una zona que no se tocó en
 * ninguna sesión de 8 o más no sale, y puede subir si lo demás lo permite.
 */
export function sesionesDurasPorZona (
  cansancio: Pick<CansancioDeSesiones, 'duras'> | undefined,
  grupoDe: (exerciseId: string) => MuscleGroup | undefined,
): Partial<Record<ZonaIem, SesionDuraDeZona>> {
  const out: Partial<Record<ZonaIem, SesionDuraDeZona>> = {}
  // Vienen de la más antigua a la más reciente: con `>=` gana la última a igualdad.
  for (const d of cansancio?.duras ?? []) {
    for (const zona of zonasDeEjercicios(d.ejercicios, grupoDe)) {
      if (!out[zona] || d.valor >= out[zona]!.valor) out[zona] = { etiqueta: d.etiqueta, valor: d.valor, fecha: d.fecha }
    }
  }
  return out
}

/** «a, b y c», con «e» delante de «i-» o «hi-» («cuádriceps e isquiotibiales»). */
export function listarConY (cosas: readonly string[]): string {
  if (cosas.length <= 1) return cosas.join('')
  const ultima = cosas[cosas.length - 1]
  return `${cosas.slice(0, -1).join(', ')} ${/^h?i(?!e)/i.test(ultima) ? 'e' : 'y'} ${ultima}`
}

/** «cuádriceps e isquiotibiales»: las zonas que frena una sesión dura, para decirlo dentro de una frase. */
export function nombresDeZonas (zonas: readonly ZonaIem[]): string {
  return listarConY(ZONAS_IEM.filter(z => zonas.includes(z.clave)).map(z => z.nombre.toLowerCase()))
}
