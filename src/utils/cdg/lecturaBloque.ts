/**
 * Lectura del bloque según la guía del Índice de Hipertrofia: qué dicen juntos
 * el tonelaje y el RM estimado, y si toca cambiar de bloque. Funciones puras:
 * reciben lo que ya calcula el seguimiento (semanas realizadas, contexto) y
 * devuelven texto para el coach. Nada decide solo: son indicadores.
 */
import type { FilaRendimiento } from './seguimiento.js'
import type { Contexto } from './agujetas.js'

export interface SemanaParaLectura {
  semana: number
  rendimiento: FilaRendimiento[]
  /** IEM total realizado esa semana (suma de músculos y días). */
  iemTotal: number
}

export type LecturaRendimiento = 'progreso' | 'acumulacion' | 'fatiga-disipada' | 'exceso' | 'sin-cambios' | 'sin-dato'
export interface Lectura { lectura: LecturaRendimiento; texto: string; tonelaje?: number; rm?: number }

const UMBRAL = 0.02 // ±2 %: por debajo es ruido

/**
 * Tonelaje frente a RM entre dos semanas, solo con los ejercicios que están en
 * las dos (comparar ejercicios distintos no dice nada).
 */
export function compararSemanas (a: SemanaParaLectura, b: SemanaParaLectura): { tonelaje: number; rm: number } | null {
  const porEjercicio = (s: SemanaParaLectura) => {
    const m = new Map<string, { ton: number; rm: number[] }>()
    for (const f of s.rendimiento) {
      const e = m.get(f.ejercicio) ?? { ton: 0, rm: [] }
      e.ton += f.tonelaje; e.rm.push(f.rm); m.set(f.ejercicio, e)
    }
    return m
  }
  const A = porEjercicio(a); const B = porEjercicio(b)
  const comunes = [...A.keys()].filter(k => B.has(k))
  if (comunes.length === 0) return null
  const tonA = comunes.reduce((x, k) => x + A.get(k)!.ton, 0)
  const tonB = comunes.reduce((x, k) => x + B.get(k)!.ton, 0)
  const media = (l: number[]) => l.reduce((x, y) => x + y, 0) / l.length
  const ratios = comunes.map(k => media(B.get(k)!.rm) / media(A.get(k)!.rm)).filter(r => isFinite(r) && r > 0)
  if (tonA <= 0 || ratios.length === 0) return null
  return { tonelaje: tonB / tonA - 1, rm: media(ratios) - 1 }
}

/**
 * Los cuatro patrones de la guía, sobre las dos últimas semanas con datos:
 * suben juntos → progreso · tonelaje sube y RM no → acumulación · tonelaje baja
 * y RM sube → fatiga disipada · tonelaje estancado o bajando pese a acumular
 * (más IEM) → exceso, toca descargar.
 */
export function leerRendimiento (semanas: SemanaParaLectura[]): Lectura {
  const conDatos = semanas.filter(s => s.rendimiento.length > 0)
  if (conDatos.length < 2) return { lectura: 'sin-dato', texto: 'Hacen falta dos semanas con registros para leer el rendimiento.' }
  const a = conDatos[conDatos.length - 2]; const b = conDatos[conDatos.length - 1]
  const d = compararSemanas(a, b)
  if (!d) return { lectura: 'sin-dato', texto: `S${a.semana} y S${b.semana} no comparten ejercicios: no se pueden comparar.` }
  const sube = (v: number) => v > UMBRAL; const baja = (v: number) => v < -UMBRAL
  const acumulando = b.iemTotal > a.iemTotal * (1 + UMBRAL)
  const base = { tonelaje: d.tonelaje, rm: d.rm }
  if (sube(d.tonelaje) && sube(d.rm)) return { ...base, lectura: 'progreso', texto: 'Tonelaje y RM suben juntos: progreso.' }
  if (baja(d.tonelaje) && sube(d.rm)) return { ...base, lectura: 'fatiga-disipada', texto: 'Baja el tonelaje y sube el RM: se ha disipado fatiga (típico tras una descarga).' }
  if (sube(d.tonelaje) && !sube(d.rm)) return { ...base, lectura: 'acumulacion', texto: 'Sube el tonelaje pero no el RM: fase de acumulación. Normal si es lo buscado; vigila que no se alargue.' }
  if (!sube(d.tonelaje) && acumulando) return { ...base, lectura: 'exceso', texto: 'El tonelaje no sube aunque se está acumulando más IEM: exceso de carga. Plantéate descargar.' }
  return { ...base, lectura: 'sin-cambios', texto: 'Sin cambios claros entre las dos últimas semanas.' }
}

export interface Indicador { clave: string; texto: string; cumple: boolean; detalle?: string }

/**
 * ¿Toca cambiar de bloque? Indicadores a favor de la guía. Ninguno decide solo:
 * las molestias son la bandera que más pesa, y una caída de RM de 1-2 semanas
 * sin más datos NO es motivo (indicador en contra).
 */
export function indicadoresCambioDeBloque (o: {
  semanasHechas: number
  /** A partir de cuántas semanas con los mismos ejercicios se aburre (tipificación; por defecto 8). */
  semanasAburrimiento?: number
  /** Contexto de cada semana, de la más antigua a la más reciente. */
  contextos: Contexto[]
  fatigaPost: number[]
  motivacion: number[]
  lecturas: LecturaRendimiento[]
  /** Avisos de estrés articular subiendo más que el IEM en la última semana. */
  avisosArticulares: number
  rmUltimaSemana?: number
}): { aFavor: Indicador[]; enContra: Indicador[]; resumen: string } {
  const ultimas = <T>(l: T[], n: number) => l.slice(-n)
  const contextoMalo = ultimas(o.contextos, 4).length === 4 && ultimas(o.contextos, 4).every(c => c === 'desfavorable')
  const fatigaAlta = ultimas(o.fatigaPost, 2).length === 2 && ultimas(o.fatigaPost, 2).every(v => v >= 8)
  const mot = ultimas(o.motivacion, 3)
  const motivacionCae = mot.length === 3 && mot[2] < mot[0] && mot[2] <= 5
  const estancado = ultimas(o.lecturas, 2).some(l => l === 'exceso')
  const molestias = o.avisosArticulares > 0 && (o.rmUltimaSemana ?? 0) > UMBRAL
  const aFavor: Indicador[] = [
    { clave: 'contexto', cumple: contextoMalo && (fatigaAlta || motivacionCae), texto: 'Contexto malo persistente (4+ semanas) con cansancio alto o motivación cayendo' },
    { clave: 'aburrimiento', cumple: o.semanasHechas >= (o.semanasAburrimiento ?? 8), texto: `Mismos ejercicios ${(o.semanasAburrimiento ?? 8) < 8 ? `${o.semanasAburrimiento}+ semanas (se aburre antes)` : '~2 meses'} (aburrimiento)`, detalle: `${o.semanasHechas} semanas en este bloque` },
    { clave: 'estancado', cumple: estancado, texto: 'Tonelaje estancado o bajando pese a acumular' },
    { clave: 'molestias', cumple: molestias, texto: 'Molestias: el RM sube a la vez que el estrés articular (la bandera que más pesa)' },
    { clave: 'duracion', cumple: o.semanasHechas >= 12, texto: 'Duración típica superada (8-12 semanas)', detalle: o.semanasHechas >= 8 && o.semanasHechas < 12 ? 'dentro de la ventana 8-12' : undefined },
  ]
  const caidaCorta = o.lecturas.length > 0 && o.lecturas.slice(-2).every(l => l !== 'progreso') && !estancado && !molestias
  const enContra: Indicador[] = [
    { clave: 'caida-corta', cumple: caidaCorta, texto: 'Una caída de RM de 1-2 semanas sin más datos no es motivo para cambiar' },
    { clave: 'si-va-bien', cumple: ultimas(o.lecturas, 1)[0] === 'progreso', texto: 'Si va bien, no lo toques: el rendimiento sigue subiendo' },
  ]
  const n = aFavor.filter(i => i.cumple).length
  const resumen = molestias ? 'Hay molestias: revisa ya el estrés articular, aunque el resto vaya bien.'
    : n >= 2 ? 'Varios indicadores a favor: plantéate cambiar de bloque (o una semana pivot) y activa la carga aguda:crónica.'
      : n === 1 ? 'Un indicador a favor: vigila, todavía no obliga a cambiar.'
        : 'Nada indica que haya que cambiar de bloque.'
  return { aFavor, enContra, resumen }
}
