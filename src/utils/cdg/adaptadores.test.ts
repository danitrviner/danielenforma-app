import { describe, expect, it } from 'vitest'
import { seriesRealizadas, semanaRealizadaDesdeLogs, tecnicaDeSegmentos } from './adaptadores'
import type { WorkoutLog } from '../../types'

const nombreCdgDe = (id: string) => (id === 'curl' ? 'Curl de bíceps en polea - Bíceps' : undefined)
type Entrada = WorkoutLog['entries'][number]
const serie = (weight: number, repsDone = 10) => ({ weight, repsDone, rir: 1 })
const segmento = (weight: number, segmentoDe?: number, repsDone = 6) => ({ weight, repsDone, rir: 0, segmento: true, ...(segmentoDe ? { segmentoDe } : {}) })
const entrada = (sets: unknown[]): Entrada => ({ exerciseId: 'curl', sets } as unknown as Entrada)
const tecnicas = (e: Entrada, o?: Parameters<typeof seriesRealizadas>[2]) => seriesRealizadas(e, nombreCdgDe, o).map(s => s.intensification)

describe('F15 · bajadas y miniseries apuntadas en lo realizado', () => {
  const dosBajadas = entrada([serie(20), serie(20), serie(20), segmento(16, 3), segmento(12, 3)])

  it('sin pedirlo, lo realizado se lee como siempre: sin técnica y sin contar los segmentos como series', () => {
    expect(tecnicas(dosBajadas)).toEqual(['', '', ''])
    expect(tecnicas(dosBajadas, { tecnicaPautada: 'dropset' })).toEqual(['', '', ''])
  })

  it('la técnica va en la serie tras la que se apuntaron, con la equivalencia de lo programado', () => {
    // Dos bajadas siguen siendo «Drop 1»: es como cuenta el drop set lo programado.
    expect(tecnicas(dosBajadas, { segmentos: true, tecnicaPautada: 'dropset' })).toEqual(['', '', 'Drop 1'])
    const enLaPrimera = entrada([serie(20), serie(20), segmento(20, 1), segmento(20, 1)])
    expect(tecnicas(enLaPrimera, { segmentos: true, tecnicaPautada: 'myoreps' })).toEqual(['Myo rep', ''])
    expect(tecnicas(enLaPrimera, { segmentos: true, tecnicaPautada: 'restpause' })).toEqual(['Rest Pause 1', ''])
  })

  it('los registros antiguos sin `segmentoDe` son de la última serie', () => {
    expect(tecnicas(entrada([serie(20), serie(20), segmento(16)]), { segmentos: true, tecnicaPautada: 'dropset' })).toEqual(['', 'Drop 1'])
  })

  it('una técnica pautada que no se apuntó (o con las filas vacías) no cuenta', () => {
    expect(tecnicas(entrada([serie(20), serie(20)]), { segmentos: true, tecnicaPautada: 'dropset' })).toEqual(['', ''])
    expect(tecnicas(entrada([serie(20), serie(20), segmento(16, 2, 0)]), { segmentos: true, tecnicaPautada: 'dropset' })).toEqual(['', ''])
  })

  it('una serie principal que no cuenta (sin repeticiones) no descoloca a las demás', () => {
    const e = entrada([serie(20, 0), serie(20), serie(20), segmento(16, 2)])
    expect(tecnicas(e, { segmentos: true, tecnicaPautada: 'dropset' })).toEqual(['Drop 1', ''])
  })

  it('sin saber la técnica pautada se deduce del peso: menos kg, drop set; los mismos, miniseries', () => {
    expect(tecnicaDeSegmentos(null, 20, [{ weight: 16 }])).toBe('Drop 1')
    expect(tecnicaDeSegmentos(undefined, 20, [{ weight: 20 }, { weight: 20 }])).toBe('Myo rep')
    // AMRAP y «al fallo» no llevan segmentos: si los hay, también se deduce.
    expect(tecnicaDeSegmentos('amrap', 20, [{ weight: 15 }])).toBe('Drop 1')
    expect(tecnicaDeSegmentos('dropset', 20, [])).toBeNull()
  })

  it('semanaRealizadaDesdeLogs pregunta la técnica pautada de cada ejercicio solo si se piden los segmentos', () => {
    const log = { id: 'l', athleteId: 'a', workoutId: 'w', assignmentId: 'x', date: '2026-01-05', completedAt: '2026-01-05', entries: [dosBajadas] } as unknown as WorkoutLog
    let preguntas = 0
    const tecnicaPautadaDe = () => { preguntas++; return 'dropset' as const }
    expect(semanaRealizadaDesdeLogs([log], nombreCdgDe, () => 0, { tecnicaPautadaDe })[0][0].map(s => s.intensification)).toEqual(['', '', ''])
    expect(preguntas).toBe(0)
    expect(semanaRealizadaDesdeLogs([log], nombreCdgDe, () => 0, { segmentos: true, tecnicaPautadaDe })[0][0].map(s => s.intensification)).toEqual(['', '', 'Drop 1'])
    expect(preguntas).toBe(1)
  })
})

describe('sesiones fuera de su gimnasio (17-11-2026)', () => {
  it('la serie hecha fuera sale marcada; la de su gimnasio, sin el campo', () => {
    const [dentro] = seriesRealizadas(entrada([serie(20)]), nombreCdgDe)
    const [fuera] = seriesRealizadas(entrada([{ ...serie(8), fuera: true }]), nombreCdgDe)
    expect('fuera' in dentro).toBe(false)
    expect(fuera.fuera).toBe(true)
    // Por lo demás, la misma serie: el estímulo la cuenta igual.
    expect(fuera).toMatchObject({ weight: 8, rpe: dentro.rpe, repetitions: dentro.repetitions })
  })
})
