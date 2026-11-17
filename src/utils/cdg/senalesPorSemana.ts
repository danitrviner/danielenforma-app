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
 */
import type { WorkoutLog } from '../../types.js'
import { aperturaDelCiclo } from '../cicloRevision.js'
import { addDays } from '../trainingWeek.js'
import { contextoDeLaSemana, type Contexto, type PuntoSeñal } from './agujetas.js'

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
}

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
  logs: ReadonlyArray<Pick<WorkoutLog, 'id' | 'workoutId' | 'date' | 'cansancioAlSalir'>>,
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
  const nombre = o.nombreDe?.(peor.workoutId)?.trim() || undefined
  return {
    media: Math.round((suma / conDato.length) * 10) / 10,
    sesiones: conDato.length,
    fecha: conDato[conDato.length - 1].date,
    peor: { logId: peor.id, workoutId: peor.workoutId, fecha: peor.date, valor: peor.cansancioAlSalir!, nombre, etiqueta: etiquetaDeSesion(peor.date, nombre) },
  }
}
