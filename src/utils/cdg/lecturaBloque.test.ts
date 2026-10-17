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
  it('tonelaje estancado pese a acumular IEM → exceso', () => {
    expect(leerRendimiento([sem(1, [fila('Banca', 100, 3000)], 100), sem(2, [fila('Banca', 99, 3000)], 120)]).lectura).toBe('exceso')
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
  it('molestias (RM y estrés articular suben juntos) es la bandera que más pesa', () => {
    const r = indicadoresCambioDeBloque({ ...base, avisosArticulares: 1, rmUltimaSemana: 0.06 })
    expect(r.resumen).toMatch(/molestias/)
  })
})
