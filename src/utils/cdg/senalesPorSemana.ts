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
 */
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
