import { describe, it, expect } from 'vitest'
import { tipoSugerido, semanasHastaAburrirse, avisoDeFiabilidad, describirTipificacion, referenciasToleradas, esTipificacionVacia } from './tipificacion'

describe('tipificación del cliente', () => {
  it('el freno sugiere el tipo de bloque', () => {
    expect(tipoSugerido({})).toBeNull()
    expect(tipoSugerido({ freno: 1 })).toEqual({ sensibilidad: 'estatico', velocidad: 'suave' })
    expect(tipoSugerido({ freno: 4 })).toEqual({ sensibilidad: 'dinamico', velocidad: 'medio' })
    expect(tipoSugerido({ freno: 5 })).toEqual({ sensibilidad: 'dinamico', velocidad: 'agresivo' })
  })
  it('el que se aburre pide cambio antes', () => {
    expect(semanasHastaAburrirse({ cambios: 1 })).toBe(6)
    expect(semanasHastaAburrirse({})).toBe(8)
  })
  it('avisa si el seguimiento es poco fiable y lo describe para el asistente', () => {
    expect(avisoDeFiabilidad({ honestidad: 5 })).toMatch(/copy-paste/)
    expect(avisoDeFiabilidad({ honestidad: 2 })).toBeNull()
    expect(describirTipificacion({ freno: 2 })).toBe('- Cuánto freno necesita: 2/5 (1 = Pupas, 5 = Tanque)')
    expect(esTipificacionVacia({})).toBe(true)
  })
})

describe('referencias toleradas', () => {
  it('IF más alto llevado bien y más bajo con el que salió destrozado', () => {
    expect(referenciasToleradas([50, 62, 75, 70], [5, 7, 9, 8])).toEqual({ tolerado: 62, demasiado: 70 })
    expect(referenciasToleradas([], [5])).toEqual({})
  })
})
