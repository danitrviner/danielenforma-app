import { describe, it, expect } from 'vitest'
import { calcularRM, calcularSemana, rendimientoSemana, rendimientoCiclo, type CdgSerieRealizada, type SemanaRealizada } from './seguimiento'
import catalogoPrueba from './__fixtures__/catalogoPrueba.json'
import { crearMotor, expandirCatalogo, type CdgCatalogoCompacto } from './index'
import { semanaRealizadaDesdeLogs } from './adaptadores'
import type { WorkoutLog } from '../../types'
import { rirARpe } from './motor'
import {
  esSerieCdgValidaParaRm, rendimientoSemanaDeRegistros, rendimientoCicloDeRegistros, seriesCdgValidasParaRm,
} from './rendimientoDeRegistros'
import { compararSemanas, type SemanaParaLectura } from './lecturaBloque'

/* D2 (17-11-2026): con los registros de la app, el RM del seguimiento sale solo
   de las series válidas. Las funciones de la hoja (`calcularRM`,
   `rendimientoSemana`, `rendimientoCiclo`) no cambian: aquí se filtra antes. */

// Una serie tal como la deja el adaptador de registros (`seriesRealizadas`).
const serie = (kg: number, reps: number, rir: number | string, extra: Partial<CdgSerieRealizada> = {}): CdgSerieRealizada => ({
  exerciseName: 'Press banca', repetitions: { min: reps, max: reps, raw: String(reps) }, weight: kg,
  rpe: rirARpe(rir), intensification: '', ...extra,
})
const semana = (...ejercicios: CdgSerieRealizada[][]): SemanaRealizada => [ejercicios, [], [], [], [], [], []]

describe('qué series valen para el RM en el seguimiento CDG', () => {
  it('mismo criterio que rmValido: 3-15 repeticiones, RIR 2 o menos, RIR apuntado', () => {
    expect(esSerieCdgValidaParaRm(serie(80, 8, 2))).toBe(true)
    expect(esSerieCdgValidaParaRm(serie(80, 12, 0))).toBe(true)
    expect(esSerieCdgValidaParaRm(serie(80, 3, 1))).toBe(true)
    expect(esSerieCdgValidaParaRm(serie(80, 13, 2))).toBe(true) // vale desde el 17-11-2026 (el tope era 12)
    expect(esSerieCdgValidaParaRm(serie(80, 15, 1))).toBe(true)
    expect(esSerieCdgValidaParaRm(serie(80, 16, 2))).toBe(false) // demasiadas repeticiones
    expect(esSerieCdgValidaParaRm(serie(80, 2, 0))).toBe(false)
    expect(esSerieCdgValidaParaRm(serie(80, 8, 3))).toBe(false) // RIR de 3 o más
    expect(esSerieCdgValidaParaRm(serie(80, 8, 5))).toBe(false) // RIR 5: la tabla de la hoja no le da RPE
    expect(esSerieCdgValidaParaRm(serie(80, 8, 2, { rirApuntado: false }))).toBe(false) // RIR pautado sin tocar
    expect(esSerieCdgValidaParaRm(serie(0, 8, 2))).toBe(false)
  })
})

describe('rendimientoSemanaDeRegistros', () => {
  const buenas = [serie(80, 8, 2), serie(80, 8, 1)]

  it('una serie a RIR 5 (RM 0 en la hoja) deja de hundir la media', () => {
    const conRir5 = [...buenas, serie(80, 8, 5)]
    // La hoja: la serie sin RPE vale 0 y entra en la media → un tercio menos.
    expect(calcularRM(conRir5)).toBeCloseTo(calcularRM(buenas) * 2 / 3, 5)
    expect(rendimientoSemana('Semana 1', semana(conRir5))[0].rm).toBeCloseTo(calcularRM(buenas) * 2 / 3, 5)
    // Con los registros: el RM es el de las dos series válidas.
    const [fila] = rendimientoSemanaDeRegistros('Semana 1', semana(conRir5))
    expect(fila.rm).toBe(calcularRM(buenas))
    expect(fila.sinMarca).toBeUndefined()
  })

  it('las series de muchas repeticiones o lejos del fallo no mueven el RM, pero sí cuentan en el tonelaje', () => {
    const mezcla = [...buenas, serie(60, 20, 2), serie(80, 8, 4)]
    const [fila] = rendimientoSemanaDeRegistros('Semana 1', semana(mezcla))
    expect(fila.rm).toBe(calcularRM(buenas))
    expect(fila.tonelaje).toBe(80 * 8 * 3 + 60 * 20)
    expect(fila.tonelaje).toBe(rendimientoSemana('Semana 1', semana(mezcla))[0].tonelaje)
  })

  it('sin ninguna serie válida el ejercicio no tiene marca (y no es una marca de 0 kg)', () => {
    const [fila] = rendimientoSemanaDeRegistros('Semana 1', semana([serie(60, 20, 2), serie(60, 20, 2)]))
    expect(fila).toMatchObject({ rm: 0, sinMarca: true, tonelaje: 2400, ejercicio: 'Press banca', sesion: 'Sesión 1' })
  })

  it('con todas las series válidas da exactamente lo que la hoja', () => {
    expect(seriesCdgValidasParaRm(buenas)).toEqual(buenas)
    expect(rendimientoSemanaDeRegistros('Semana 1', semana(buenas))).toEqual(rendimientoSemana('Semana 1', semana(buenas)))
  })
})

describe('rendimientoCicloDeRegistros', () => {
  const s1 = rendimientoSemanaDeRegistros('Semana 1', semana([serie(80, 8, 2)]))
  const s2 = rendimientoSemanaDeRegistros('Semana 2', semana([serie(80, 20, 2)])) // sin marca
  const s3 = rendimientoSemanaDeRegistros('Semana 3', semana([serie(84, 8, 2)]))
  const semanas = [{ semana: 'Semana 1', filas: s1 }, { semana: 'Semana 2', filas: s2 }, { semana: 'Semana 3', filas: s3 }]

  it('una semana sin marca no cuenta como «la última»: no se pierde el 100 %', () => {
    // La hoja, con las tres: la última semana con filas es la 3, bien. Pero si la sin marca es la última…
    const acabaSinMarca = [semanas[0], semanas[2], semanas[1]]
    expect(rendimientoCiclo(acabaSinMarca, () => 'Empuje').incrementos[0].incremento).toBe(-1)
    expect(rendimientoCicloDeRegistros(acabaSinMarca, () => 'Empuje').incrementos[0].incremento).toBeCloseTo(0.05, 5)
  })

  it('y la media del ciclo sale solo de las semanas con marca', () => {
    const r = rendimientoCicloDeRegistros(semanas, () => 'Empuje')
    expect(r.medias[0]).toMatchObject({ semanas: 2 })
    expect(r.medias[0].mediaRM).toBeCloseTo((s1[0].rm + s3[0].rm) / 2, 5)
  })
})

describe('compararSemanas con filas sin marca', () => {
  const fila = (ejercicio: string, rm: number, tonelaje: number, sinMarca = false) => ({ semana: '', sesion: 'D1', ejercicio, rm, tonelaje, ...(sinMarca ? { sinMarca } : {}) })
  const sem = (n: number, filas: ReturnType<typeof fila>[]): SemanaParaLectura => ({ semana: n, rendimiento: filas, iemTotal: 100 })

  it('una fila sin marca no baja la media del RM del ejercicio', () => {
    // El press se hace dos días; el segundo de la semana 2, todo lejos del fallo.
    const a = sem(1, [fila('Banca', 100, 3000), fila('Banca', 100, 3000)])
    const b = sem(2, [fila('Banca', 100, 3000), fila('Banca', 0, 3000, true)])
    expect(compararSemanas(a, b)).toEqual({ tonelaje: 0, rm: 0 }) // antes: rm −50 %
  })

  it('un ejercicio sin marca en una de las dos semanas cuenta para el tonelaje y no para el RM', () => {
    const a = sem(1, [fila('Banca', 100, 3000), fila('Remo', 80, 2000)])
    const b = sem(2, [fila('Banca', 104, 3000), fila('Remo', 0, 2500, true)])
    const d = compararSemanas(a, b)!
    expect(d.rm).toBeCloseTo(0.04, 5) // solo el press
    expect(d.tonelaje).toBeCloseTo(0.1, 5) // los dos
  })

  it('si ningún ejercicio común tiene marca en las dos, no hay comparación', () => {
    expect(compararSemanas(sem(1, [fila('Banca', 100, 3000)]), sem(2, [fila('Banca', 0, 3000, true)]))).toBeNull()
  })
})

describe('sesiones fuera de su gimnasio (17-11-2026)', () => {
  const fuera = (kg: number, reps: number, rir: number) => ({ ...serie(kg, reps, rir), fuera: true }) as CdgSerieRealizada

  it('una serie fuera no vale para el RM aunque cumpla el resto', () => {
    expect(esSerieCdgValidaParaRm(fuera(80, 8, 2))).toBe(false)
  })

  it('un ejercicio hecho fuera no da fila: ni RM ni tonelaje en el seguimiento', () => {
    expect(rendimientoSemanaDeRegistros('Semana 2', semana([fuera(30, 10, 1), fuera(30, 10, 1)]))).toEqual([])
    // Con otro ejercicio en la misma sesión, solo sale ese.
    const remo = [serie(60, 8, 2)].map(s => ({ ...s, exerciseName: 'Remo' }))
    const filas = rendimientoSemanaDeRegistros('Semana 2', semana([fuera(30, 10, 1)], remo))
    expect(filas.map(f => f.ejercicio)).toEqual(['Remo'])
    expect(filas[0].tonelaje).toBe(480)
  })

  it('el estímulo (IEM) de la sesión fuera sí cuenta: el esfuerzo fue real', () => {
    const motor = crearMotor(expandirCatalogo(catalogoPrueba as CdgCatalogoCompacto))
    const BULG = 'Sentadilla búlgara con mancuernas (dominante rodilla) - Cuádriceps, aductores, glúteo'
    const log = (conFuera: boolean): WorkoutLog => ({
      id: 'l', athleteId: 'a@a.com', workoutId: 'w0', assignmentId: 'x', date: '2026-01-05', completedAt: '',
      ...(conFuera ? { fuera: true } : {}),
      entries: [{ exerciseId: 'bulg', sets: [0, 1].map(() => ({ weight: 20, repsDone: 10, rir: 2, ...(conFuera ? { fuera: true } : {}) })) }],
    })
    const deLogs = (conFuera: boolean) => semanaRealizadaDesdeLogs([log(conFuera)], id => (id === 'bulg' ? BULG : undefined), () => 0)
    const dentro = calcularSemana(motor, deLogs(false))
    const hotel = calcularSemana(motor, deLogs(true))
    expect(hotel.IEM).toEqual(dentro.IEM)
    expect(hotel.IF.some(v => v > 0)).toBe(true)
    // …y el rendimiento de esa misma semana queda vacío.
    expect(rendimientoSemanaDeRegistros('Semana 1', deLogs(true))).toEqual([])
  })
})
