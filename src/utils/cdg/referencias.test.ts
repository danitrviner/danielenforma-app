import { describe, expect, it } from 'vitest'
import { BANDAS_IEA, LIMITE_IEA_CON_ANTECEDENTES, bandaIEA } from './referencias'

describe('X1 · bandas de estrés articular del curso', () => {
  it('por semana: hasta 3 es bajo, de 12 en adelante alto y lo de en medio, medio', () => {
    expect(bandaIEA(0, 'semana').banda).toBe('bajo')
    expect(bandaIEA(3, 'semana').banda).toBe('bajo')
    expect(bandaIEA(3.1, 'semana').banda).toBe('medio')
    expect(bandaIEA(11.9, 'semana').banda).toBe('medio')
    expect(bandaIEA(12, 'semana')).toEqual({ banda: 'alto', etiqueta: 'Alto', sobreElTecho: false })
    expect(bandaIEA(17, 'semana').sobreElTecho).toBe(false)
    expect(bandaIEA(17.5, 'semana')).toEqual({ banda: 'alto', etiqueta: 'Alto', sobreElTecho: true })
  })

  it('por sesión: menos de 1 es bajo (el 1 ya no) y de 4 en adelante, alto', () => {
    expect(bandaIEA(0.9, 'sesion').banda).toBe('bajo')
    expect(bandaIEA(1, 'sesion').banda).toBe('medio')
    expect(bandaIEA(3.9, 'sesion').banda).toBe('medio')
    expect(bandaIEA(4, 'sesion').banda).toBe('alto')
    expect(bandaIEA(6, 'sesion').sobreElTecho).toBe(false)
    expect(bandaIEA(6.1, 'sesion').sobreElTecho).toBe(true)
  })

  it('las cifras son las del curso', () => {
    expect(BANDAS_IEA).toEqual({ sesion: { bajoHasta: 1, altoDesde: 4, techo: 6 }, semana: { bajoHasta: 3, altoDesde: 12, techo: 17 } })
    expect(LIMITE_IEA_CON_ANTECEDENTES).toBe(3)
  })
})
