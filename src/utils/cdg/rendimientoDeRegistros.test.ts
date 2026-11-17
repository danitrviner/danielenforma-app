import { describe, it, expect } from 'vitest'
import { calcularRM, rendimientoSemana, rendimientoCiclo, type CdgSerieRealizada, type SemanaRealizada } from './seguimiento'
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
  it('mismo criterio que rmValido: 3-12 repeticiones, RIR 2 o menos, RIR apuntado', () => {
    expect(esSerieCdgValidaParaRm(serie(80, 8, 2))).toBe(true)
    expect(esSerieCdgValidaParaRm(serie(80, 12, 0))).toBe(true)
    expect(esSerieCdgValidaParaRm(serie(80, 3, 1))).toBe(true)
    expect(esSerieCdgValidaParaRm(serie(80, 13, 2))).toBe(false) // demasiadas repeticiones
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
    const [fila] = rendimientoSemanaDeRegistros('Semana 1', semana([serie(60, 15, 2), serie(60, 15, 2)]))
    expect(fila).toMatchObject({ rm: 0, sinMarca: true, tonelaje: 1800, ejercicio: 'Press banca', sesion: 'Sesión 1' })
  })

  it('con todas las series válidas da exactamente lo que la hoja', () => {
    expect(seriesCdgValidasParaRm(buenas)).toEqual(buenas)
    expect(rendimientoSemanaDeRegistros('Semana 1', semana(buenas))).toEqual(rendimientoSemana('Semana 1', semana(buenas)))
  })
})

describe('rendimientoCicloDeRegistros', () => {
  const s1 = rendimientoSemanaDeRegistros('Semana 1', semana([serie(80, 8, 2)]))
  const s2 = rendimientoSemanaDeRegistros('Semana 2', semana([serie(80, 15, 2)])) // sin marca
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
