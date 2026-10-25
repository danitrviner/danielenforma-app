import { describe, expect, it } from 'vitest'
import catalogoPrueba from './__fixtures__/catalogoPrueba.json'
import { crearMotor, expandirCatalogo, type CdgCatalogoCompacto } from './index'
import { borradorDeSemanas, etiquetaOperacion, pctHastaObjetivo, tonelajePorSemana } from './borradorIem'
import { iemProgramadoPorZona, type EjercicioProgramable } from './progresionIem'
import type { WorkoutExercise, WorkoutLog } from '../../types'

const motor = crearMotor(expandirCatalogo(catalogoPrueba as CdgCatalogoCompacto))
const N: Record<string, string> = {
  press: 'Press en máquina convergente horizontal - Pectoral, deltoides anterior, tríceps',
  peck: 'Peck deck codo a 90º (ajustado) - Pectoral',
}
const nombreCdgDe = (id: string) => N[id]
const we = (exerciseId: string, sets: number, rir: number) =>
  ({ exerciseId, order: 0, sets, reps: '10-12', restSeconds: 90, rir }) as WorkoutExercise
const ejercicios = (): EjercicioProgramable[] => [
  { clave: 'A#0', dia: 'A', we: we('press', 3, 3), grupo: 'pecho' },
  { clave: 'A#1', dia: 'A', we: we('peck', 3, 3), grupo: 'pecho' },
]

describe('borrador de las semanas siguientes (13-g)', () => {
  it('repite el % semanal sobre la semana anterior del borrador y no se guarda nada', () => {
    const b = borradorDeSemanas({ motor, nombreCdgDe, ejercicios: ejercicios(), pctPorZona: { pectoral: 10 }, semanas: [5, 6] })
    expect(b.map(s => s.semana)).toEqual([5, 6])
    const iem = (s: typeof b[number]) => iemProgramadoPorZona(motor, nombreCdgDe, [...s.porEjercicio.values()].map(c => c.we)).pectoral
    const inicio = iemProgramadoPorZona(motor, nombreCdgDe, ejercicios().map(x => x.we)).pectoral
    expect(iem(b[0])).toBeGreaterThan(inicio)
    expect(iem(b[1])).toBeGreaterThan(iem(b[0]))
    expect([...b[0].porEjercicio.values()].some(c => c.motivos.length > 0)).toBe(true)
  })

  it('no pasa del objetivo de Volumen: al llegar se mantiene', () => {
    const inicio = iemProgramadoPorZona(motor, nombreCdgDe, ejercicios().map(x => x.we)).pectoral
    const b = borradorDeSemanas({ motor, nombreCdgDe, ejercicios: ejercicios(), pctPorZona: { pectoral: 30 }, objetivos: { pectoral: inicio }, semanas: [5] })
    expect([...b[0].porEjercicio.values()].every(c => c.motivos.length === 0)).toBe(true)
  })

  it('el % se recorta para no pasar el objetivo', () => {
    expect(pctHastaObjetivo(20, 100, 105)).toBe(5)
    expect(pctHastaObjetivo(20, 100, 100)).toBe(0)
    expect(pctHastaObjetivo(20, 100, undefined)).toBe(20)
    expect(pctHastaObjetivo(-20, 100, 90)).toBe(-20)
  })

  it('etiquetas cortas de cada cambio', () => {
    expect(etiquetaOperacion({ tipo: 'rir', delta: -1 })).toBe('↓RIR')
    expect(etiquetaOperacion({ tipo: 'serie', delta: 1 })).toBe('+1 serie')
    expect(etiquetaOperacion({ tipo: 'tecnica' })).toBe('+técnica')
  })
})

describe('tonelaje por semana (aviso de rendimiento)', () => {
  it('suma kg × reps de las series principales de esos ejercicios, por semana del bloque', () => {
    const log = (date: string, sets: WorkoutLog['entries'][number]['sets']): WorkoutLog =>
      ({ id: date, athleteId: 'a', workoutId: 'w', mesocycleId: 'm', date, entries: [{ exerciseId: 'press', sets }, { exerciseId: 'otro', sets }] }) as WorkoutLog
    const logs = [
      log('2026-01-05', [{ weight: 60, repsDone: 10, rir: 1 }, { weight: 48, repsDone: 8, rir: 0, segmento: true }]),
      log('2026-01-13', [{ weight: 62.5, repsDone: 10, rir: 1 }]),
    ]
    expect(tonelajePorSemana(logs, { id: 'm', startDate: '2026-01-05' }, 7, new Set(['press']), [1, 2, 3])).toEqual([600, 625, 0])
  })
})
