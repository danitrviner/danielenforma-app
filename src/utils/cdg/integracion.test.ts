import { describe, expect, it } from 'vitest'
import catalogoPrueba from './__fixtures__/catalogoPrueba.json'
import { crearMotor, expandirCatalogo, type CdgCatalogoCompacto } from './index'
import {
  semanasRealizadasDelMeso, cargaAgudaCronicaDelMeso, sesionesProgramadasDeLaSemana, rendimientoDelCiclo, type SemanaSeguimiento, semanaPorDefecto } from './integracion'
import type { WorkoutExercise, WorkoutLog } from '../../types'

const motor = crearMotor(expandirCatalogo(catalogoPrueba as CdgCatalogoCompacto))
const BULG = 'Sentadilla búlgara con mancuernas (dominante rodilla) - Cuádriceps, aductores, glúteo'
const nombreCdgDe = (id: string) => (id === 'bulg' ? BULG : undefined)
const meso = { id: 'm1', startDate: '2026-01-05', semanasDescarga: undefined as number[] | undefined } // lunes
const sesionDeWorkout = (w: string) => ({ w0: 0, w1: 1 } as Record<string, number>)[w]

const log = (date: string, workoutId: string, kg: number, reps = 10, rir = 2): WorkoutLog => ({
  id: `${date}-${workoutId}`, athleteId: 'a@a.com', workoutId, assignmentId: 'x', mesocycleId: 'm1',
  date, completedAt: date, entries: [{ exerciseId: 'bulg', sets: [{ weight: kg, repsDone: reps, rir }, { weight: kg, repsDone: reps, rir }] }]
} as unknown as WorkoutLog)

const base = { meso, cicloDias: 7, vueltas: 8, sesionDeWorkout, nombreCdgDe, motor }

describe('semanasRealizadasDelMeso', () => {
  it('agrupa por semana de ciclo y por Workout.dayIndex, y calcula Gestión y rendimiento al vuelo', () => {
    const logs = [log('2026-01-05', 'w0', 20), log('2026-01-06', 'w1', 20), log('2026-01-12', 'w0', 25)]
    const { semanas, descartados } = semanasRealizadasDelMeso({ ...base, logs })
    expect(semanas.map(s => s.semana)).toEqual([1, 2])
    expect(semanas[0].logs).toBe(2)
    expect(semanas[0].realizada[0]).toHaveLength(1) // sesión 1
    expect(semanas[0].realizada[1]).toHaveLength(1) // sesión 2
    expect(semanas[0].gestion.at(-1)?.sesion).toBe('Total')
    expect(semanas[0].gestion.at(-1)!.IF).toBeGreaterThan(0)
    expect(semanas[1].rendimiento[0].rm).toBeGreaterThan(semanas[0].rendimiento[0].rm)
    expect(descartados).toEqual({ sinSesion: 0, fueraDeSemana: 0 })
  })

  it('cuenta lo que no puede colocar en vez de perderlo en silencio', () => {
    const logs = [log('2026-01-05', 'sin-dia', 20), log('2025-12-01', 'w0', 20), { ...log('2026-01-05', 'w0', 20), mesocycleId: 'otro' } as WorkoutLog]
    const { semanas, descartados } = semanasRealizadasDelMeso({ ...base, logs })
    expect(semanas).toHaveLength(0)
    expect(descartados).toEqual({ sinSesion: 1, fueraDeSemana: 1 })
  })

  it('serie a peso corporal (0 kg) no cuenta, como en la hoja', () => {
    const { semanas } = semanasRealizadasDelMeso({ ...base, logs: [log('2026-01-05', 'w0', 0)] })
    expect(semanas).toHaveLength(1) // la sesión existe…
    expect(semanas[0].realizada.flat()).toHaveLength(0) // …pero sin series contables
    expect(semanas[0].calculo.IF.every(v => v === 0)).toBe(true)
  })
})

describe('cargaAgudaCronicaDelMeso', () => {
  const grupos = [{ dayIndex: 0, exercises: [{ exerciseId: 'bulg', order: 0, sets: 3, reps: '10', restSeconds: 90, rir: 2 } as WorkoutExercise] }]
  const semana = (n: number): SemanaSeguimiento => {
    const { semanas } = semanasRealizadasDelMeso({ ...base, logs: [log(`2026-01-${String(5 + (n - 1) * 7).padStart(2, '0')}`, 'w0', 20)] })
    return { ...semanas[0], semana: n }
  }

  it('con menos de 6 semanas no hay cálculo y lo dice', () => {
    const r = cargaAgudaCronicaDelMeso({ motor, semanas: [semana(1), semana(2)], grupos, meso, vueltas: 8, nombreCdgDe })
    expect(r.disponible).toBe(false)
    expect('motivo' in r && r.motivo).toContain('hay 2')
  })

  it('con 6 semanas compara lo programado de la siguiente con la media de las 6', () => {
    const semanas = [1, 2, 3, 4, 5, 6].map(semana)
    const r = cargaAgudaCronicaDelMeso({ motor, semanas, grupos, meso, vueltas: 8, nombreCdgDe, umbrales: { superior: 1.1 } })
    expect(r.disponible).toBe(true)
    if (r.disponible) {
      expect(r.semanaReferencia).toBe(7)
      expect(r.semanasUsadas).toEqual([6, 5, 4, 3, 2, 1])
      expect(r.ac.IF[7]).toBeGreaterThan(0)
      expect(r.avisos.sesionesIF).toHaveLength(8)
    }
  })

  it('la semana en curso no entra en la crónica aunque tenga sesiones', () => {
    const semanas = [1, 2, 3, 4, 5, 6, 7].map(semana)
    const r = cargaAgudaCronicaDelMeso({ motor, semanas, grupos, meso, vueltas: 8, nombreCdgDe, semanaEnCurso: 7 })
    expect(r.disponible).toBe(true)
    if (r.disponible) {
      expect(r.semanaReferencia).toBe(8)
      expect(r.semanasUsadas).toEqual([6, 5, 4, 3, 2, 1])
    }
  })

  it('con semana de referencia elegida, la crónica son las realizadas antes de esa semana', () => {
    const semanas = [1, 2, 3, 4, 5, 6].map(semana)
    const r = cargaAgudaCronicaDelMeso({ motor, semanas, grupos, meso, vueltas: 8, nombreCdgDe, semanaReferencia: 4 })
    expect(r.disponible).toBe(true)
    if (r.disponible) {
      expect(r.semanaReferencia).toBe(4)
      expect(r.semanasUsadas).toEqual([3, 2, 1])
      expect(r.fiable).toBe(false)
    }
  })

  it('en Base (semana 0) no hay nada que comparar', () => {
    const r = cargaAgudaCronicaDelMeso({ motor, semanas: [1, 2, 3].map(semana), grupos, meso, vueltas: 8, nombreCdgDe, semanaReferencia: 0 })
    expect(r.disponible).toBe(false)
  })

  it('sin semana siguiente en el bloque, lo dice', () => {
    const r = cargaAgudaCronicaDelMeso({ motor, semanas: [semana(8)], grupos, meso, vueltas: 8, nombreCdgDe })
    expect(r.disponible).toBe(false)
  })
})

describe('sesiones programadas y rendimiento del ciclo', () => {
  it('coloca cada día en su hueco 0-6 y resuelve la descarga', () => {
    const we = { exerciseId: 'bulg', order: 0, sets: 4, reps: '10', restSeconds: 90, rir: 2 } as WorkoutExercise
    const s = sesionesProgramadasDeLaSemana([{ dayIndex: 2, exercises: [we] }], { semanasDescarga: [3] }, 3)
    expect(s[2][0].sets).toBe(2)
    expect(s[0]).toEqual([])
  })

  it('mejora del ciclo por ejercicio y por categoría', () => {
    const { semanas } = semanasRealizadasDelMeso({ ...base, logs: [log('2026-01-05', 'w0', 20), log('2026-01-12', 'w0', 30)] })
    // El fixture no trae categoría; el catálogo real sí (Empuje, Tracción, Brazo, Pierna, Cadera…).
    const conCategoria = crearMotor(expandirCatalogo(catalogoPrueba as CdgCatalogoCompacto).map(e => ({ ...e, category: 'Pierna' })))
    const r = rendimientoDelCiclo(conCategoria, semanas)
    expect(r.incrementos[0].incremento).toBeGreaterThan(0)
    expect(r.categorias.map(c => c.categoria)).toEqual(['Pierna'])
  })
})

describe('semanaPorDefecto', () => {
  const sem = (semana: number, logs: number) => ({ semana, logs })
  it('elige la última semana con todas las sesiones del ciclo', () => {
    expect(semanaPorDefecto([sem(1, 4), sem(2, 4), sem(3, 1)], 4)?.semana).toBe(2)
  })
  it('si ninguna está completa, la última', () => {
    expect(semanaPorDefecto([sem(1, 2), sem(2, 1)], 4)?.semana).toBe(2)
  })
  it('sin semanas no hay semana', () => {
    expect(semanaPorDefecto([], 4)).toBeUndefined()
  })
})
