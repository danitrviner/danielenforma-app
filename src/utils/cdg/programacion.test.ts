import { describe, expect, it } from 'vitest'
import catalogoPrueba from './__fixtures__/catalogoPrueba.json'
import { crearMotor, expandirCatalogo, type CdgCatalogoCompacto } from './index'
import { resumenSesion, sumarSesiones, usaRir5, formatearTiempo } from './programacion'
import type { WorkoutExercise } from '../../types'

const motor = crearMotor(expandirCatalogo(catalogoPrueba as CdgCatalogoCompacto))
const N: Record<string, string> = {
  bulg: 'Sentadilla búlgara con mancuernas (dominante rodilla) - Cuádriceps, aductores, glúteo',
  goblet: 'Sentadilla goblet (dominante cadera, mayor dorsiflexión) - Glúteo, aductores, cuádriceps',
  pike: 'Pike push up con déficit- Deltoides anterior, tríceps',
  flexC: 'Flexiones cerradas - Pectoral, deltoides anterior, tríceps',
  front: 'Elevaciones frontales con mochila lastrada - Deltoides anterior',
  lat: 'Elevaciones laterales con mancuernas - Deltoides medial',
  puente: 'Puente de glúteo unilateral - Glúteo'
}
const nombreCdgDe = (id: string) => N[id]
const we = (exerciseId: string, sets: number, rir: number, extra: Partial<WorkoutExercise> = {}) =>
  ({ exerciseId, order: 0, sets, reps: '10-12', restSeconds: 90, rir, ...extra }) as WorkoutExercise

// Día 1 de la hoja «MESOCICLO 1 ISRAEL»: mismos IF que la hoja, ejercicio a ejercicio.
const DIA_1: Array<[WorkoutExercise, number]> = [
  [we('bulg', 4, 2), 24.76702],
  [we('goblet', 3, 2), 16.91235],
  [we('pike', 4, 2), 9.01756],
  [we('flexC', 3, 0), 12.0135],
  [we('front', 3, 1), 4.626],
  [we('lat', 3, 0), 7.068]
]

describe('resumenSesion (panel de programación)', () => {
  it.each(DIA_1.map(([e, esperado], i) => [i, e, esperado] as const))('Día 1 · ejercicio %i da el IF de la hoja', (_i, e, esperado) => {
    const r = resumenSesion(motor, [e], nombreCdgDe)
    expect(Math.abs(r.IF - esperado)).toBeLessThan(1e-5)
  })

  it('el IF de la sesión es la suma y coincide con sumarSesiones', () => {
    const r = resumenSesion(motor, DIA_1.map(([e]) => e), nombreCdgDe)
    expect(r.IF).toBeCloseTo(DIA_1.reduce((a, [, v]) => a + v, 0), 4)
    expect(sumarSesiones(motor, [r, r]).IF).toBeCloseTo(2 * r.IF, 6)
    expect(r.porEjercicio).toHaveLength(6)
  })

  it('ejercicio sin vínculo CDG cuenta 0 y se avisa', () => {
    const r = resumenSesion(motor, [we('desconocido', 3, 2)], nombreCdgDe)
    expect(r.IF).toBe(0)
    expect(r.sinVinculo).toEqual(['desconocido'])
  })

  it('cdgNombre que no está en el catálogo se avisa aparte', () => {
    const r = resumenSesion(motor, [we('x', 3, 2)], id => (id === 'x' ? 'No existe' : undefined))
    expect(r.IF).toBe(0)
    expect(r.fueraDeCatalogo).toEqual(['x'])
  })

  it('RIR 5 no cuenta (IF 0) y se avisa', () => {
    const r = resumenSesion(motor, [we('bulg', 4, 5)], nombreCdgDe)
    expect(r.IF).toBe(0)
    expect(r.rir5).toEqual(['bulg'])
    expect(usaRir5(we('bulg', 3, 5, { setGroups: [{ sets: 3, reps: '10', rir: 2 }] }))).toBe(false)
    expect(usaRir5(we('bulg', 3, 2, { setGroups: [{ sets: 3, reps: '10', rir: 5 }] }))).toBe(true)
  })

  it('tiempo: 60 s + pausa por serie; unilateral ×2; técnica suma su extra', () => {
    expect(resumenSesion(motor, [we('pike', 4, 2)], nombreCdgDe).tiempoSeg).toBe(4 * (60 + 90))
    expect(resumenSesion(motor, [we('puente', 2, 2)], nombreCdgDe).tiempoSeg).toBe(2 * (60 + 90) * 2)
    expect(resumenSesion(motor, [we('pike', 4, 2, { technique: 'dropset' })], nombreCdgDe).tiempoSeg).toBe(4 * 150 + 20)
    expect(formatearTiempo(3900)).toBe('1 h 05 min')
  })
})
