import { describe, expect, it } from 'vitest'
import { contextoPorCiclos, rachaFinal, valorEnElCicloDe, type SeriesDeContexto } from './senalesPorSemana'
import { agujetasPorZona, esLecturaDeLaSemanaPrevia, ultimaVigente, UMBRALES_PROTOCOLO } from './agujetas'

const p = (date: string, value: number) => ({ date, value })
const vacio: SeriesDeContexto = { estres: [], sueño: [], motivacion: [], fatigaPost: [] }

describe('F16 · contexto alineado por semana, no por índice', () => {
  // Viernes 2026-10-09, 16, 23 y 30: aperturas de cuatro ciclos seguidos.
  it('junta en la misma fila lo contestado en el mismo ciclo, aunque sea otro día y otro cuestionario', () => {
    const filas = contextoPorCiclos({
      ...vacio,
      estres: [p('2026-10-09', 8), p('2026-10-16', 3)],
      // El sueño se contesta el lunes (mismo ciclo que el viernes anterior).
      sueño: [p('2026-10-12', 5), p('2026-10-19', 8)],
    }, '2026-10-21')
    expect(filas.map(f => f.ciclo)).toEqual(['2026-10-09', '2026-10-16'])
    expect(filas[0]).toMatchObject({ estres: 8, sueñoHoras: 5, contexto: 'desfavorable' })
    expect(filas[1]).toMatchObject({ estres: 3, sueñoHoras: 8, contexto: 'favorable' })
  })

  it('una señal contestada más veces que otra ya no descuadra las semanas', () => {
    // Estrés cada semana; motivación solo la primera y la última. Por índice,
    // la motivación de la primera semana se emparejaba con el estrés de la tercera.
    const filas = contextoPorCiclos({
      ...vacio,
      estres: [p('2026-10-09', 8), p('2026-10-16', 8), p('2026-10-23', 8), p('2026-10-30', 3)],
      motivacion: [p('2026-10-09', 3), p('2026-10-30', 9)],
    }, '2026-11-01')
    expect(filas.map(f => f.motivacion)).toEqual([3, undefined, undefined, 9])
    expect(filas.map(f => f.contexto)).toEqual(['desfavorable', 'desfavorable', 'desfavorable', 'favorable'])
  })

  it('una semana sin respuestas es «sin dato», no se salta', () => {
    const filas = contextoPorCiclos({ ...vacio, estres: [p('2026-10-09', 8), p('2026-10-30', 8)] }, '2026-11-01')
    expect(filas.map(f => f.contexto)).toEqual(['desfavorable', 'sin-dato', 'sin-dato', 'desfavorable'])
  })

  it('el ciclo en curso sin contestar todavía no cuenta; los ya cerrados sin contestar, sí', () => {
    const series = { ...vacio, estres: [p('2026-10-09', 8)] }
    // Martes 13-10: ya ha empezado el ciclo del viernes 16, que aún no se ha abierto.
    expect(contextoPorCiclos(series, '2026-10-13').map(f => f.ciclo)).toEqual(['2026-10-09'])
    // Un mes después sin contestar: las semanas cerradas salen sin dato.
    expect(contextoPorCiclos(series, '2026-11-04').map(f => f.contexto)).toEqual(['desfavorable', 'sin-dato', 'sin-dato', 'sin-dato'])
  })

  it('sin respuestas no hay filas; y las de fecha futura no entran', () => {
    expect(contextoPorCiclos(vacio, '2026-10-21')).toEqual([])
    expect(contextoPorCiclos({ ...vacio, estres: [p('2026-12-01', 9)] }, '2026-10-21')).toEqual([])
  })

  it('racha final: los últimos valores seguidos con dato', () => {
    expect(rachaFinal([8, undefined, 9, 8])).toEqual([9, 8])
    expect(rachaFinal([8, 9, undefined])).toEqual([])
    expect(rachaFinal([])).toEqual([])
  })

  it('el valor de la semana de una fecha concreta', () => {
    const filas = contextoPorCiclos({ ...vacio, fatigaPost: [p('2026-10-09', 9), p('2026-10-16', 5)] }, '2026-10-21')
    expect(valorEnElCicloDe(filas, '2026-10-11', 'fatigaPost')).toBe(9) // domingo: ciclo del viernes 9
    expect(valorEnElCicloDe(filas, '2026-10-14', 'fatigaPost')).toBe(5) // miércoles: ciclo del viernes 16
    expect(valorEnElCicloDe(filas, '2026-09-01', 'fatigaPost')).toBeUndefined()
  })
})

describe('F16 · vigencia de las señales de contexto', () => {
  it('la última respuesta solo vale 10 días; caducada es «sin dato»', () => {
    expect(UMBRALES_PROTOCOLO.diasVigenciaContexto).toBe(10)
    const serie = [p('2026-08-01', 3), p('2026-10-10', 8)]
    expect(ultimaVigente(serie, '2026-10-13')).toEqual(p('2026-10-10', 8))
    expect(ultimaVigente(serie, '2026-10-20')).toEqual(p('2026-10-10', 8)) // justo 10 días
    expect(ultimaVigente(serie, '2026-10-21')).toBeUndefined()
    expect(ultimaVigente(serie, '2027-01-15')).toBeUndefined()
    expect(ultimaVigente([], '2026-10-13')).toBeUndefined()
  })

  it('no rescata una respuesta anterior aunque la última esté caducada o sea futura', () => {
    expect(ultimaVigente([p('2026-10-10', 8), p('2026-10-30', 2)], '2026-10-13')).toBeUndefined()
  })
})

describe('F16 · la lectura «anterior» de agujetas tiene que ser de la semana previa', () => {
  it('hasta 14 días y de otro día', () => {
    expect(esLecturaDeLaSemanaPrevia('2026-10-01', '2026-10-08')).toBe(true)
    expect(esLecturaDeLaSemanaPrevia('2026-09-24', '2026-10-08')).toBe(true)
    expect(esLecturaDeLaSemanaPrevia('2026-09-23', '2026-10-08')).toBe(false)
    expect(esLecturaDeLaSemanaPrevia('2026-10-08', '2026-10-08')).toBe(false)
  })

  it('un 4 de hace dos meses no convierte el 4 de hoy en «segunda semana seguida»', () => {
    const serie = (k: string) => (k === 'agujetas.isquios' ? [p('2026-08-07', 4), p('2026-10-09', 4)] : [])
    expect(agujetasPorZona(serie).isquios).toMatchObject({ valor: 4, anterior: undefined })
    const seguidas = (k: string) => (k === 'agujetas.isquios' ? [p('2026-10-02', 4), p('2026-10-09', 4)] : [])
    expect(agujetasPorZona(seguidas).isquios).toMatchObject({ valor: 4, anterior: 4 })
  })

  it('dos respuestas el mismo día: la anterior es la del día previo, no la repetida', () => {
    const serie = (k: string) => (k === 'agujetas.isquios' ? [p('2026-10-02', 2), p('2026-10-09', 5), p('2026-10-09', 4)] : [])
    expect(agujetasPorZona(serie).isquios).toMatchObject({ valor: 4, anterior: 2 })
  })

  it('también en el cuestionario antiguo 0-10', () => {
    const serie = (k: string) => (k === 'doms.isquios' ? [p('2026-08-07', 8), p('2026-10-09', 8)] : [])
    expect(agujetasPorZona(serie).isquios).toMatchObject({ valor: 4, anterior: undefined, deEscala10: true })
  })
})
