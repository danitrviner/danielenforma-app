import { describe, it, expect } from 'vitest'
import { leerRendimiento, compararSemanas, indicadoresCambioDeBloque, type SemanaParaLectura } from './lecturaBloque'

const fila = (ejercicio: string, rm: number, tonelaje: number) => ({ semana: '', sesion: 'D1', ejercicio, rm, tonelaje })
const sem = (semana: number, filas: ReturnType<typeof fila>[], iemTotal = 100): SemanaParaLectura => ({ semana, rendimiento: filas, iemTotal })

describe('leerRendimiento (los 4 patrones de la guía)', () => {
  it('suben juntos → progreso', () => {
    expect(leerRendimiento([sem(1, [fila('Banca', 100, 3000)]), sem(2, [fila('Banca', 104, 3200)])]).lectura).toBe('progreso')
  })
  it('tonelaje sube y RM no → acumulación', () => {
    expect(leerRendimiento([sem(1, [fila('Banca', 100, 3000)]), sem(2, [fila('Banca', 100, 3400)])]).lectura).toBe('acumulacion')
  })
  it('tonelaje baja y RM sube → fatiga disipada', () => {
    expect(leerRendimiento([sem(1, [fila('Banca', 100, 3000)]), sem(2, [fila('Banca', 105, 2000)])]).lectura).toBe('fatiga-disipada')
  })
  it('tonelaje estancado pese a acumular IEM una sola semana → posible exceso, no exceso', () => {
    const r = leerRendimiento([sem(1, [fila('Banca', 100, 3000)], 100), sem(2, [fila('Banca', 99, 3000)], 120)])
    expect(r.lectura).toBe('posible-exceso')
    expect(r.texto).toContain('una sola semana')
  })
  it('si se repite dos semanas seguidas → exceso, plantéate descargar', () => {
    const r = leerRendimiento([
      sem(1, [fila('Banca', 100, 3000)], 100), sem(2, [fila('Banca', 99, 3000)], 120), sem(3, [fila('Banca', 99, 2950)], 140),
    ])
    expect(r.lectura).toBe('exceso')
    expect(r.texto).toContain('descargar')
    expect(r.semanas).toEqual([2, 3])
  })
  it('si la semana anterior respondió, la de ahora vuelve a ser una sola', () => {
    const r = leerRendimiento([
      sem(1, [fila('Banca', 100, 3000)], 100), sem(2, [fila('Banca', 104, 3300)], 120), sem(3, [fila('Banca', 104, 3300)], 140),
    ])
    expect(r.lectura).toBe('posible-exceso')
  })
  it('por debajo del ruido de medida (3 %) no es subir ni bajar', () => {
    // +2,5 % de RM y de tonelaje: antes «progreso», ahora no se distingue de medir mal.
    expect(leerRendimiento([sem(1, [fila('Banca', 100, 3000)]), sem(2, [fila('Banca', 102.5, 3075)])]).lectura).toBe('sin-cambios')
  })
  it('no compara con la semana en curso incompleta ni con una descarga', () => {
    const s1 = sem(1, [fila('Banca', 100, 3000)]); const s2 = sem(2, [fila('Banca', 104, 3200)])
    const aMedias = { ...sem(3, [fila('Banca', 90, 1000)], 40), incompleta: true }
    const descarga = { ...sem(3, [fila('Banca', 100, 1500)], 50), descarga: true }
    expect(compararSemanas(s2, aMedias)).toBeNull()
    expect(compararSemanas(descarga, s2)).toBeNull()
    // La lectura sigue siendo la de S1 → S2: la semana a medias y la descarga se saltan.
    expect(leerRendimiento([s1, s2, aMedias])).toMatchObject({ lectura: 'progreso', semanas: [1, 2] })
    expect(leerRendimiento([s1, descarga, { ...s2, semana: 4 }])).toMatchObject({ lectura: 'progreso', semanas: [1, 4] })
    expect(leerRendimiento([s1, aMedias]).lectura).toBe('sin-dato')
  })
  it('solo compara ejercicios comunes; sin datos lo dice', () => {
    expect(compararSemanas(sem(1, [fila('Banca', 100, 3000)]), sem(2, [fila('Sentadilla', 140, 5000)]))).toBeNull()
    expect(leerRendimiento([sem(1, [])]).lectura).toBe('sin-dato')
  })
})

describe('indicadoresCambioDeBloque', () => {
  const base = { semanasHechas: 4, contextos: [], fatigaPost: [], motivacion: [], lecturas: [], avisosArticulares: 0 }
  it('nada a favor en un bloque joven que progresa', () => {
    const r = indicadoresCambioDeBloque({ ...base, lecturas: ['progreso'] })
    expect(r.aFavor.filter(i => i.cumple)).toEqual([])
    expect(r.enContra.find(i => i.clave === 'si-va-bien')!.cumple).toBe(true)
  })
  it('contexto malo 4 semanas + cansancio alto + 8 semanas → plantear cambio', () => {
    const r = indicadoresCambioDeBloque({
      ...base, semanasHechas: 9,
      contextos: ['desfavorable', 'desfavorable', 'desfavorable', 'desfavorable'], fatigaPost: [8, 9],
    })
    expect(r.aFavor.filter(i => i.cumple).map(i => i.clave)).toEqual(['contexto', 'aburrimiento'])
    expect(r.resumen).toMatch(/plantéate cambiar/)
  })
  it('el indicador de estancamiento solo se enciende con exceso repetido, no con una semana suelta', () => {
    const suelta = indicadoresCambioDeBloque({ ...base, lecturas: ['progreso', 'posible-exceso'] })
    expect(suelta.aFavor.find(i => i.clave === 'estancado')!.cumple).toBe(false)
    expect(suelta.enContra.find(i => i.clave === 'caida-corta')!.cumple).toBe(false)
    const repetida = indicadoresCambioDeBloque({ ...base, lecturas: ['posible-exceso', 'exceso'] })
    expect(repetida.aFavor.find(i => i.clave === 'estancado')!.cumple).toBe(true)
  })
  it('molestias (RM y estrés articular suben juntos) es la bandera que más pesa', () => {
    const r = indicadoresCambioDeBloque({ ...base, avisosArticulares: 1, rmUltimaSemana: 0.06 })
    expect(r.resumen).toMatch(/molestias/)
  })
})
