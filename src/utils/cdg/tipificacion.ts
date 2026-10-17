/**
 * Tipificación del cliente (guía del Índice de Hipertrofia, «alta del
 * cliente»): cinco escalas editables que el coach rellena con lo que ve en la
 * llamada y en las primeras semanas. Cada una es 1-5, del polo izquierdo al
 * derecho. No son etiquetas para el atleta: son para decidir más rápido.
 */
import type { Sensibilidad, Velocidad } from './agujetas.js'
import type { TipificacionCliente } from '../../types.js'

export type { TipificacionCliente }

export const ESCALAS: Array<{ clave: keyof TipificacionCliente; izquierda: string; derecha: string; que: string }> = [
  { clave: 'freno', izquierda: 'Pupas', derecha: 'Tanque', que: 'Cuánto freno necesita' },
  { clave: 'tiempo', izquierda: 'Prisillas', derecha: 'El gym es mi vida', que: 'Tolerancia a más tiempo y volumen' },
  { clave: 'cambios', izquierda: 'Me aburro', derecha: 'Costumbres', que: 'Necesidad de cambios' },
  { clave: 'honestidad', izquierda: 'Honesto', derecha: 'Copy-paste', que: 'Veracidad del seguimiento' },
  { clave: 'cumplimentacion', izquierda: 'Dejado', derecha: 'Minucioso', que: 'Cumplimentación' },
]

export const esTipificacionVacia = (t?: TipificacionCliente) => !t || ESCALAS.every(e => t[e.clave] == null)

/** El tipo de bloque que encaja con cuánto freno necesita (sin tipificar, nada). */
export function tipoSugerido (t?: TipificacionCliente): { sensibilidad: Sensibilidad; velocidad: Velocidad } | null {
  const f = t?.freno
  if (f == null) return null
  if (f <= 2) return { sensibilidad: 'estatico', velocidad: 'suave' }
  if (f === 3) return { sensibilidad: 'estatico', velocidad: 'medio' }
  return { sensibilidad: 'dinamico', velocidad: f >= 5 ? 'agresivo' : 'medio' }
}

/** Semanas con los mismos ejercicios a partir de las que se aburre: antes si es de los que se aburren. */
export function semanasHastaAburrirse (t?: TipificacionCliente): number {
  return t?.cambios != null && t.cambios <= 2 ? 6 : 8
}

/** Aviso si sus datos de seguimiento son poco fiables. */
export function avisoDeFiabilidad (t?: TipificacionCliente): string | null {
  return t?.honestidad != null && t.honestidad >= 4
    ? 'Tipificado como «copy-paste»: sus respuestas de seguimiento pueden ser poco fiables. Contrasta con el rendimiento antes de decidir.'
    : null
}

/** Texto para la ficha que lee el asistente. */
export function describirTipificacion (t?: TipificacionCliente): string {
  if (esTipificacionVacia(t)) return ''
  return ESCALAS.filter(e => t![e.clave] != null)
    .map(e => `- ${e.que}: ${t![e.clave]}/5 (1 = ${e.izquierda}, 5 = ${e.derecha})`)
    .join('\n')
}

/**
 * Referencias toleradas (guía: «guarda la peor sesión tolerada»): con las
 * semanas realizadas y el cansancio al salir de cada una, el IF de sesión más
 * alto que llevó bien (≤ 7) y el más bajo con el que salió destrozado (≥ 8).
 * Se emparejan por orden: la última semana con la última respuesta.
 */
export function referenciasToleradas (ifMaxPorSemana: number[], cansancio: number[]): { tolerado?: number; demasiado?: number } {
  const n = Math.min(ifMaxPorSemana.length, cansancio.length)
  if (n === 0) return {}
  const ifs = ifMaxPorSemana.slice(-n); const c = cansancio.slice(-n)
  const bien = ifs.filter((_, i) => c[i] <= 7)
  const mal = ifs.filter((_, i) => c[i] >= 8)
  return {
    ...(bien.length ? { tolerado: Math.max(...bien) } : {}),
    ...(mal.length ? { demasiado: Math.min(...mal) } : {}),
  }
}
