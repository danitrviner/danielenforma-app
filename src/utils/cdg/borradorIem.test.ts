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

/* Hipótesis del bloque (17-11-2026): el borrador sigue el ritmo de la semana
   en firme: 2 semanas sostenidas entre subida y subida, y los puntos de la
   primera en vez del porcentaje. */
describe('borrador con ritmo: meseta y puntos', () => {
  const iemDe = (s: { porEjercicio: Map<string, { we: WorkoutExercise }> }) =>
    iemProgramadoPorZona(motor, nombreCdgDe, [...s.porEjercicio.values()].map(c => c.we)).pectoral
  const inicio = iemProgramadoPorZona(motor, nombreCdgDe, ejercicios().map(x => x.we)).pectoral

  it('si la semana en firme sube, la siguiente sostiene y la de después vuelve a subir', () => {
    const b = borradorDeSemanas({ motor, nombreCdgDe, ejercicios: ejercicios(), pctPorZona: { pectoral: 10 }, semanas: [5, 6, 7, 8], ritmo: { pectoral: { sostenidas: 1 } } })
    const iem = b.map(iemDe)
    expect(iem[0]).toBeCloseTo(inicio, 5)       // S5 sostiene
    expect(iem[1]).toBeGreaterThan(iem[0])      // S6 sube
    expect(iem[2]).toBeCloseTo(iem[1], 5)       // S7 sostiene
    expect(iem[3]).toBeGreaterThan(iem[2])      // S8 sube
    expect([...b[0].porEjercicio.values()].every(c => c.motivos.length === 0)).toBe(true)
  })

  it('una zona que venía en meseta sube en la primera semana del borrador', () => {
    const b = borradorDeSemanas({ motor, nombreCdgDe, ejercicios: ejercicios(), pctPorZona: { pectoral: 10 }, semanas: [5, 6], ritmo: { pectoral: { sostenidas: 2 } } })
    expect(iemDe(b[0])).toBeGreaterThan(inicio)
    expect(iemDe(b[1])).toBeCloseTo(iemDe(b[0]), 5)
  })

  it('con los puntos de la primera subida, pide esos puntos y no el porcentaje', () => {
    // 30 % sería mucho más; 1 punto sobre la base es lo que se pide.
    const conPuntos = borradorDeSemanas({ motor, nombreCdgDe, ejercicios: ejercicios(), pctPorZona: { pectoral: 30 }, semanas: [5], ritmo: { pectoral: { sostenidas: 2, puntos: 1 } } })
    const sinPuntos = borradorDeSemanas({ motor, nombreCdgDe, ejercicios: ejercicios(), pctPorZona: { pectoral: 30 }, semanas: [5], ritmo: { pectoral: { sostenidas: 2 } } })
    expect(iemDe(conPuntos[0])).toBeLessThan(iemDe(sinPuntos[0]))
  })

  it('sin `ritmo` sube todas las semanas, como antes', () => {
    const b = borradorDeSemanas({ motor, nombreCdgDe, ejercicios: ejercicios(), pctPorZona: { pectoral: 10 }, semanas: [5, 6] })
    expect(iemDe(b[0])).toBeGreaterThan(inicio)
    expect(iemDe(b[1])).toBeGreaterThan(iemDe(b[0]))
  })
})

