import { describe, expect, it } from 'vitest'
import catalogoPrueba from './__fixtures__/catalogoPrueba.json'
import {
  crearMotor, expandirCatalogo, type CdgCatalogoCompacto,
  seriesSemanaX, calcularSemana, filasGestion, rendimientoSemana, cargaAgudaCronica,
  seriesProgramadas, seriesRealizadas, type CalculoSemana
} from './index'
import type { WorkoutExercise } from '../../types'

// Valores esperados = los que da la hoja de Google Sheets original.
const motor = crearMotor(expandirCatalogo(catalogoPrueba as CdgCatalogoCompacto))
const N = {
  bulg: 'Sentadilla búlgara con mancuernas (dominante rodilla) - Cuádriceps, aductores, glúteo',
  goblet: 'Sentadilla goblet (dominante cadera, mayor dorsiflexión) - Glúteo, aductores, cuádriceps',
  pike: 'Pike push up con déficit- Deltoides anterior, tríceps',
  flexC: 'Flexiones cerradas - Pectoral, deltoides anterior, tríceps',
  front: 'Elevaciones frontales con mochila lastrada - Deltoides anterior',
  lat: 'Elevaciones laterales con mancuernas - Deltoides medial',
  bird: 'Bird dogs - Lumbares',
  puente: 'Puente de glúteo unilateral - Glúteo'
}
const cerca = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-6)

describe('Programación (IF/IEM/estrés articular)', () => {
  it.each([
    [{ nombre: N.bulg, series: 4, reps: '10-12', esfuerzo: '4x2' }, 24.76702],
    [{ nombre: N.goblet, series: 3, reps: '10-12', esfuerzo: '3x2' }, 16.91235],
    [{ nombre: N.pike, series: 4, reps: '10-12', esfuerzo: '4x2' }, 9.01756],
    [{ nombre: N.flexC, series: 3, reps: '10-12', esfuerzo: '3x0' }, 12.0135],
    [{ nombre: N.front, series: 3, reps: '10-12', esfuerzo: '3x1' }, 4.626],
    [{ nombre: N.lat, series: 3, reps: '10-12', esfuerzo: '3x0' }, 7.068],
    [{ nombre: N.bird, series: 3, reps: '10-12', esfuerzo: '3x2', tecnicas: '1 Drop 1', pausa: '90' }, 8.26],
    [{ nombre: N.puente, series: 4, reps: '5-8', esfuerzo: '2x0 2x3', tecnicas: '1 Myo rep, 1 Rest Pause 3', pausa: '120' }, 84.979328],
    [{ nombre: N.bulg, series: 2, reps: '15-30', esfuerzo: '2x1', tecnicas: '2 Reps parciales' }, 25.3442175]
  ])('%# IF igual que la hoja', (fila, esperado) => cerca(motor.calcularFila(fila).IF, esperado))

  it('IEM de la búlgara 4x2: series × 2,55 × valor del catálogo', () => {
    const r = motor.calcularFila({ nombre: N.bulg, series: 4, reps: '10-12', esfuerzo: '4x2' })
    cerca(r.IEM[18], 10.2) // 4 × 2,55 × 1,0
  })

  it('filtro [Compuesto] = MEDIA de las porciones', () => {
    const r = motor.calcularFila({ nombre: N.bird, series: 3, reps: '10-12', esfuerzo: '3x2', tecnicas: '1 Drop 1' })
    cerca(motor.filtroIEM(r.IEM, '[Compuesto] Glúteo mayor'), 4.845)
  })

  it('el músculo "Mediano" cuenta 0 en el IF (como la hoja) salvo que se corrija', () => {
    const fila = { nombre: N.pike, series: 4, reps: '10-12', esfuerzo: '4x2' }
    cerca(motor.calcularFila(fila).IF, 9.01756)
    const corregido = crearMotor(expandirCatalogo(catalogoPrueba as CdgCatalogoCompacto), { corregirMediano: true })
    cerca(corregido.calcularFila(fila).IF, 11.08256)
  })

  it('ejercicio fuera del catálogo → 0', () => {
    expect(motor.calcularFila({ nombre: 'No existe', series: 3, reps: '10', esfuerzo: '3x2' }).IF).toBe(0)
  })
})

describe('Semana X → Gestión y Rendimiento (hoja de Israel, Semana 1, Sesión 1)', () => {
  const dia1: Array<[string, string[]]> = [
    ['Press en máquina convergente horizontal - Pectoral, deltoides anterior, tríceps', ['9', '50', '2', '-', '9', '50', '1', '-', '8', '50', '2', '-']],
    ['Remo Gironda agarre medio neutro (sin retracción) - Dorsal, deltoides posterior', ['12', '30', '2', '-', '12', '30', '2', '-', '12', '30', '2', '-']],
    ['Press inclinado en máquina pendular - Pectoral, deltoides anterior, tríceps', ['12', '10', '0', '-', '10', '7.5', '1', '-', '12', '5', '2', '-']],
    ['Jalón estable en polea alta agarre ancho prono - Dorsal, deltoides posterior', ['12', '25', '0', '-', '10', '20', '2', '-', '10', '20', '2', '-']],
    ['Curl de bíceps en polea - Bíceps', ['10', '10', '0', '-', '10', '5', '2', '-', '10', '5', '2', '-']],
    ['Extensiones de tríceps en polea alta con barra V - Tríceps', ['12', '10', '0', '-', '10', '5', '2', '-', '10', '5', '2', '-']]
  ]
  const semana = [dia1.map(([n, c]) => seriesSemanaX(n, [0, 1, 2].map(k => ({ reps: c[4 * k], kg: c[4 * k + 1], rir: c[4 * k + 2], tecnica: c[4 * k + 3] })))), [], [], [], [], [], []]
  const num = (s: string) => parseFloat(s.replace(',', '.'))

  it('fila de Gestión idéntica', () => {
    const f = filasGestion(1, calcularSemana(motor, semana))[0]
    cerca(f.IF, 23.87172)
    const iem = '8,1725 11,56 7,94 1,655 9,45 10,445 13,195 9,035 5,9875 11,835 15,02 8,82 13,59 8,82 11,16 6,515 13,51 0 18,99 7,99 8,01 4,77 0 0 1,1475 0 0 0 0 0 0 0 0'.split(' ').map(num)
    const iea = '5,716 3,6084 2,789 0 0 0 0,708 0,177 4,36 0 0'.split(' ').map(num)
    f.IEM.forEach((v, i) => cerca(v, iem[i]))
    f.estresArticular.forEach((v, i) => cerca(v, iea[i]))
  })

  it('RM y tonelaje idénticos', () => {
    const esperado = [[66.94542482, 1300], [43.86, 1080], [10.4975, 255], [30.24666667, 700], [9.086666667, 200], [9.306666667, 220]]
    rendimientoSemana('Semana 1', semana).forEach((r, i) => {
      expect(Math.abs(r.rm - esperado[i][0])).toBeLessThan(1e-6)
      expect(r.tonelaje).toBe(esperado[i][1])
    })
  })

  it('serie sin kg se salta (rareza de la hoja)', () => {
    expect(seriesSemanaX(N.bird, [{ reps: '10', kg: '', rir: '2' }, { reps: '10', kg: '0', rir: '2' }])).toHaveLength(1)
  })
})

describe('Carga aguda/crónica', () => {
  const semana = (f: number): CalculoSemana => ({
    IF: [f, f, 0, 0, 0, 0, 0],
    IEM: Array.from({ length: 7 }, (_, d) => new Array(33).fill(d < 2 ? f : 0)),
    estresArticular: Array.from({ length: 7 }, (_, d) => new Array(11).fill(d < 2 ? f : 0))
  })
  const aguda = { IF: [12, 12, 0, 0, 0, 0, 0, 24], IEM: Array.from({ length: 8 }, () => new Array(33).fill(12)), estresArticular: Array.from({ length: 8 }, () => new Array(11).fill(12)) }

  it('null si no hay 6 semanas', () => expect(cargaAgudaCronica(aguda, [semana(10)])).toBeNull())
  it('aguda / media de 6 semanas; crónica 0 → IF 0 e IEM 1', () => {
    const r = cargaAgudaCronica(aguda, Array.from({ length: 6 }, () => semana(10)))!
    cerca(r.IF[0], 1.2)
    cerca(r.IF[7], 1.2)
    expect(r.IF[3]).toBe(0)
    expect(r.IEM[3][0]).toBe(1)
  })
})

describe('Adaptadores En Forma', () => {
  const nombreCdgDe = (id: string) => ({ e1: N.bulg } as Record<string, string>)[id]
  it('WorkoutExercise → mismo IF que la fila equivalente de la hoja', () => {
    const we = { exerciseId: 'e1', order: 0, sets: 4, reps: '10-12', restSeconds: 90, rir: 2 } as WorkoutExercise
    const series = seriesProgramadas(we, nombreCdgDe)
    cerca(motor.sumar(series.map(motor.calcularSerie)).IF, 24.76702)
  })
  it('dropset se aplica a la última serie', () => {
    const we = { exerciseId: 'e1', order: 0, sets: 3, reps: '10', restSeconds: 90, rir: 2, technique: 'dropset' } as WorkoutExercise
    expect(seriesProgramadas(we, nombreCdgDe).map(s => s.intensificationTechnique)).toEqual(['Normal', 'Normal', 'Drop 1'])
  })
  it('serie a peso corporal (0 kg) no cuenta, como en la hoja', () => {
    const entry = { exerciseId: 'e1', sets: [{ weight: 0, repsDone: 10, rir: 2 }, { weight: 20, repsDone: 10, rir: 2 }] }
    expect(seriesRealizadas(entry, nombreCdgDe)).toHaveLength(1)
  })
  it('alFallo cuenta como RIR 0 y sin vínculo CDG no cuenta', () => {
    const entry = { exerciseId: 'e1', sets: [{ weight: 20, repsDone: 10, rir: 3, alFallo: true }] }
    expect(seriesRealizadas(entry, nombreCdgDe)[0].rpe).toBe(10)
    expect(seriesRealizadas({ ...entry, exerciseId: 'otro' }, nombreCdgDe)).toHaveLength(0)
  })
})
