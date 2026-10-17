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
