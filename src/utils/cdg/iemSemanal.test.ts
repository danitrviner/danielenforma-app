import { describe, expect, it } from 'vitest'
import catalogoPrueba from './__fixtures__/catalogoPrueba.json'
import { crearMotor, expandirCatalogo, type CdgCatalogoCompacto } from './index'
import { iemSemanalPorZona, semanasDeLaRevision, numeroDeSemana } from './iemSemanal'
import type { WorkoutLog } from '../../types'

const motor = crearMotor(expandirCatalogo(catalogoPrueba as CdgCatalogoCompacto))
const BULG = 'Sentadilla búlgara con mancuernas (dominante rodilla) - Cuádriceps, aductores, glúteo'
const CURL = 'Curl de bíceps en polea - Bíceps'
const nombreCdgDe = (id: string) => ({ bulg: BULG, curl: CURL } as Record<string, string>)[id]

const log = (date: string, exerciseId: string, series: number, rir = 2) => ({
  id: date + exerciseId, athleteId: 'a', workoutId: 'w', assignmentId: 'x', date, completedAt: date,
  entries: [{ exerciseId, sets: Array.from({ length: series }, () => ({ weight: 20, repsDone: 10, rir })) }]
}) as unknown as WorkoutLog

describe('iemSemanalPorZona', () => {
  it('reparte el IEM por semana y zona, ordena por total y calcula la variación de la última semana', () => {
    const r = iemSemanalPorZona(motor, [
      log('2026-01-05', 'bulg', 2), log('2026-01-12', 'bulg', 4), log('2026-01-13', 'curl', 3), log('2026-01-14', 'otro', 3)
    ], nombreCdgDe, ['2026-01-05', '2026-01-12'])
    const cuad = r.filas.find(f => f.clave === 'cuadriceps')!
    expect(cuad.valores[1]).toBeCloseTo(cuad.valores[0] * 2, 1)
    expect(cuad.variacionPct).toBe(100)
    const biceps = r.filas.find(f => f.clave === 'biceps')!
    expect(biceps.valores[0]).toBe(0)
    expect(biceps.variacionPct).toBeNull()
    expect(r.filas.map(f => f.total)).toEqual([...r.filas.map(f => f.total)].sort((a, b) => b - a))
    expect(r.totalPorSemana[1]).toBeGreaterThan(r.totalPorSemana[0])
    expect(r.sinVinculo).toEqual(['otro'])
    expect(r.filas.find(f => f.clave === 'pectoral')).toBeUndefined()
  })

  it('la semana en curso no entra en la variación: compara las dos últimas completas', () => {
    const r = iemSemanalPorZona(motor, [
      log('2026-01-05', 'bulg', 2), log('2026-01-12', 'bulg', 4), log('2026-01-19', 'bulg', 1)
    ], nombreCdgDe, ['2026-01-05', '2026-01-12', '2026-01-19'], '2026-01-20')
    expect(r.enCurso).toBe(2)
    expect(r.filas.find(f => f.clave === 'cuadriceps')!.variacionPct).toBe(100)
  })
})

describe('semanasDeLaRevision', () => {
  it('las del bloque desde su inicio', () => {
    expect(semanasDeLaRevision({ hasta: '2026-11-16', inicioBloque: '2026-10-26' })).toEqual(['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16'])
  })
  it('F5 · de un bloque largo se enseñan las 8 últimas con su número REAL de semana', () => {
    // Bloque de 10 semanas desde el 07-09: la primera columna es la S3, no la «S1».
    const s = semanasDeLaRevision({ hasta: '2026-11-15', inicioBloque: '2026-09-07' })
    expect(s).toHaveLength(8)
    expect(s[0]).toBe('2026-09-21')
    expect(s.numeros).toEqual([3, 4, 5, 6, 7, 8, 9, 10])
    expect(numeroDeSemana(s, 0)).toBe(3)
    expect(numeroDeSemana(s, 7)).toBe(10)
  })
  it('F5 · un bloque corto empieza en la S1, y con ciclo de 14 días el número es la vuelta', () => {
    expect(semanasDeLaRevision({ hasta: '2026-11-16', inicioBloque: '2026-10-26' }).numeros).toEqual([1, 2, 3, 4])
    expect(semanasDeLaRevision({ hasta: '2026-11-16', inicioBloque: '2026-10-26', cicloDias: 14 }).numeros).toEqual([1, 1, 2, 2])
  })
  it('F5 · sin bloque no hay semana de bloque: se rotula por posición', () => {
    const s = semanasDeLaRevision({ hasta: '2026-11-18' })
    expect(s.numeros).toBeUndefined()
    expect(numeroDeSemana(s, 2)).toBe(3)
    expect(numeroDeSemana(['2026-11-02', '2026-11-09'], 1)).toBe(2)
  })
  it('sin bloque, las 6 últimas de lunes a domingo', () => {
    const s = semanasDeLaRevision({ hasta: '2026-11-18' })
    expect(s).toHaveLength(6)
    expect(s[5]).toBe('2026-11-16')
    expect(s[0]).toBe('2026-10-12')
  })
})
