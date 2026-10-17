import { describe, expect, it } from 'vitest'
import catalogoPrueba from './__fixtures__/catalogoPrueba.json'
import { crearMotor, expandirCatalogo, type CdgCatalogoCompacto } from './index'
import { iemDeLogs, filasIEM, seriesIEMPorSemana } from './estimulo'
import type { WorkoutLog } from '../../types'

const motor = crearMotor(expandirCatalogo(catalogoPrueba as CdgCatalogoCompacto))
const BULG = 'Sentadilla búlgara con mancuernas (dominante rodilla) - Cuádriceps, aductores, glúteo'
const nombreCdgDe = (id: string) => (id === 'bulg' ? BULG : undefined)

const log = (date: string, sets: Array<{ weight: number; repsDone: number; rir: number }>, exerciseId = 'bulg') => ({
  id: date, athleteId: 'a', workoutId: 'w', assignmentId: 'x', date, completedAt: date, entries: [{ exerciseId, sets }]
}) as unknown as WorkoutLog

describe('IEM de lo realizado', () => {
  it('coincide con el IEM de la misma sesión escrita como fila de Programación', () => {
    const real = iemDeLogs(motor, [log('2026-01-05', [{ weight: 20, repsDone: 10, rir: 2 }, { weight: 20, repsDone: 10, rir: 2 }])], nombreCdgDe)
    const fila = motor.calcularFila({ nombre: BULG, series: 2, reps: '10', esfuerzo: '2x2' })
    real.IEM.forEach((v, i) => expect(v).toBeCloseTo(fila.IEM[i], 9))
    expect(real.sinVinculo).toEqual([])
  })

  it('serie a peso corporal (0 kg) no cuenta y un ejercicio sin vínculo se avisa', () => {
    const r = iemDeLogs(motor, [log('2026-01-05', [{ weight: 0, repsDone: 10, rir: 2 }]), log('2026-01-06', [{ weight: 20, repsDone: 10, rir: 2 }], 'otro')], nombreCdgDe)
    expect(r.IEM.every(v => v === 0)).toBe(true)
    expect(r.sinVinculo).toEqual(['otro'])
  })

  it('filas: compuestos primero, solo con valor, de más a menos', () => {
    const { IEM } = iemDeLogs(motor, [log('2026-01-05', [{ weight: 20, repsDone: 10, rir: 2 }])], nombreCdgDe)
    const filas = filasIEM(motor, IEM)
    expect(filas[0].compuesto).toBe(true)
    expect(filas.every(f => f.valor > 0)).toBe(true)
    const musculos = filas.filter(f => !f.compuesto).map(f => f.valor)
    expect(musculos).toEqual([...musculos].sort((a, b) => b - a))
  })

  it('serie semanal: una por grupo compuesto y por músculo con ≥ 2 semanas', () => {
    const semanaDe = (f: string) => f.slice(0, 7) // un «mes» como semana, basta para agrupar
    const logs = [log('2026-01-05', [{ weight: 20, repsDone: 10, rir: 2 }]), log('2026-02-05', [{ weight: 20, repsDone: 10, rir: 1 }])]
    const s = seriesIEMPorSemana(motor, logs, nombreCdgDe, semanaDe)
    expect(s.length).toBeGreaterThan(0)
    expect(s.every(x => x.points.length >= 1)).toBe(true)
    expect(s.some(x => x.label === 'Cuádriceps (grupo)')).toBe(true)
    expect(s.find(x => x.label === 'Cuádriceps (grupo)')!.points.map(p => p.date)).toEqual(['2026-01', '2026-02'])
  })
})
