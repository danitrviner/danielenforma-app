import { describe, expect, it } from 'vitest'
import type { MuscleGroup, WorkoutExercise } from '../../types'
import { iemPorSerieDeGrupo, iemEstimado } from './iemEstimado'

// Motor de mentira: cada serie da tantos puntos de IEM como su RPE, en un solo músculo.
const motor = {
  calcularSerie: (s: { rpe: number }) => ({ IF: 1, IEM: [s.rpe], estresArticular: [] as number[] }),
  sumar: (rs: Array<{ IF: number; IEM: number[]; estresArticular: number[] }>) => ({
    IF: rs.reduce((a, r) => a + r.IF, 0),
    IEM: [rs.reduce((a, r) => a + r.IEM[0], 0)],
    estresArticular: [] as number[]
  })
} as unknown as Parameters<typeof iemPorSerieDeGrupo>[0]['motor']

const we = (exerciseId: string, rir: number, sets = 3): WorkoutExercise =>
  ({ exerciseId, sets, reps: '8-12', rir, restSeconds: 90, order: 0 }) as WorkoutExercise

const grupos: Record<string, MuscleGroup> = { jalon: 'dorsal', remo: 'dorsal', curl: 'biceps' }

describe('iemPorSerieDeGrupo', () => {
  it('da la mediana por serie de cada grupo y salta lo que no está en el catálogo CDG', () => {
    const r = iemPorSerieDeGrupo({
      motor,
      nombreCdgDe: id => (id === 'sinCdg' ? undefined : id),
      grupoDe: id => grupos[id],
      rutinas: [
        { exercises: [we('jalon', 1), we('remo', 3), we('sinCdg', 0)] },
        { exercises: [we('jalon', 1, 5), we('curl', 2)] },
      ],
    })
    // RIR 1 → RPE 9, RIR 3 → RPE 7: dorsal = mediana(9, 7, 9) = 9
    expect(r.dorsal).toBe(9)
    expect(r.biceps).toBe(8)
    expect(r.pecho).toBeUndefined()
  })
})

describe('iemEstimado', () => {
  it('multiplica series por la referencia y avisa si a algún grupo le falta', () => {
    expect(iemEstimado([{ group: 'dorsal', series: 5 }, { group: 'biceps', series: 2 }], { dorsal: 9, biceps: 8 }))
      .toEqual({ iem: 61, incompleto: false })
    expect(iemEstimado([{ group: 'dorsal', series: 5 }, { group: 'pecho', series: 4 }], { dorsal: 9 }))
      .toEqual({ iem: 45, incompleto: true })
  })
})
