/**
 * Referencias orientativas de la guía del Índice de Hipertrofia para leer los
 * números del panel. Son tablas para cuestionar, no reglas: cada atleta tiene
 * su propio nivel tolerado (ver `referenciasToleradas`).
 */

export type BandaIF = 'sencilla' | 'intermedia' | 'alta' | 'muy-alta'

/** IF por sesión: <40 sencilla · 40-70 intermedia · 70-100 alta · >100 muy alta. */
export function bandaIF (IF: number): { banda: BandaIF; etiqueta: string } {
  if (IF < 40) return { banda: 'sencilla', etiqueta: 'Sencilla' }
  if (IF < 70) return { banda: 'intermedia', etiqueta: 'Intermedia' }
  if (IF <= 100) return { banda: 'alta', etiqueta: 'Alta' }
  return { banda: 'muy-alta', etiqueta: 'Muy alta' }
}

/**
 * Bandas de estrés articular (IEA) del curso del Índice de Hipertrofia (X1,
 * 17-11-2026), por articulación:
 *  - bajo: menos de 1 por sesión y hasta 3 por semana;
 *  - alto: de 4 a 6 por sesión y de 12 a 17 por semana;
 *  - con antecedentes en una articulación, por debajo de 3 a la semana en ella.
 * Entre «bajo» y «alto» el curso no pone nombre: aquí es «medio». Por encima
 * del techo de «alto» sigue siendo «alto» y se marca `sobreElTecho`.
 * Como el resto de este archivo, son referencias para leer el número, no
 * reglas: el límite que avisa es el que el coach le ponga a cada atleta.
 */
export const BANDAS_IEA = {
  sesion: { bajoHasta: 1, altoDesde: 4, techo: 6 },
  semana: { bajoHasta: 3, altoDesde: 12, techo: 17 },
} as const

/** Tope semanal que da el curso para una articulación con antecedentes: es el que se propone al poner un límite. */
export const LIMITE_IEA_CON_ANTECEDENTES = 3

export type BandaIEA = 'bajo' | 'medio' | 'alto'
export type AmbitoIEA = keyof typeof BANDAS_IEA

/** Banda del estrés de UNA articulación en una sesión o en la semana entera. */
export function bandaIEA (valor: number, ambito: AmbitoIEA): { banda: BandaIEA; etiqueta: string; sobreElTecho: boolean } {
  const b = BANDAS_IEA[ambito]
  // «Menos de 1» por sesión, pero «hasta 3» por semana: el 3 justo aún es bajo.
  const bajo = ambito === 'sesion' ? valor < b.bajoHasta : valor <= b.bajoHasta
  if (bajo) return { banda: 'bajo', etiqueta: 'Bajo', sobreElTecho: false }
  if (valor < b.altoDesde) return { banda: 'medio', etiqueta: 'Medio', sobreElTecho: false }
  return { banda: 'alto', etiqueta: 'Alto', sobreElTecho: valor > b.techo }
}

/**
 * Qué hacer cuando la sesión no cabe en el tiempo que tiene el atleta. El
 * orden es el de la guía: primero lo que ahorra tiempo sin tocar el estímulo.
 */
export function consejosDeTiempo (o: { minutosDisponibles: number; tiempoSeg: number; unilaterales: number }): string[] {
  const sobran = Math.round(o.tiempoSeg / 60 - o.minutosDisponibles)
  if (sobran <= 0) return []
  const c: string[] = []
  if (o.unilaterales > 0) c.push(`pasar ${o.unilaterales === 1 ? 'el unilateral' : `alguno de los ${o.unilaterales} unilaterales`} a bilateral (cuentan el doble de tiempo)`)
  c.push('superseries de grupos que no compiten')
  c.push('menos series con algo más de intensidad (RPE 7-8; a RPE 9-10 deja de compensar)')
  return [`Se pasa ~${sobran} min de los ${o.minutosDisponibles} que tiene: ${c.join(' · ')}.`]
}
