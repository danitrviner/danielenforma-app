import { describe, expect, it } from 'vitest'
import {
  avisoDeSemanaBase, destinosDeProgresion, esDescargaOPuente, motivoSinProgresion, semanaBaseDeIem, semanaDePartidaDeIem, semanaRecortada,
} from './semanaBase'

describe('semana base del estímulo (F2)', () => {
  it('sin semanas especiales, la base es la anterior', () => {
    expect(semanaBaseDeIem({}, 2)).toBe(1)
    expect(semanaBaseDeIem({ semanasDescarga: [], semanasPivot: [] }, 6)).toBe(5)
  })

  it('tras una descarga, la base es la última semana normal, no la recortada', () => {
    expect(semanaBaseDeIem({ semanasDescarga: [4] }, 5)).toBe(3)
  })

  it('tras una semana puente, lo mismo', () => {
    expect(semanaBaseDeIem({ semanasPivot: [5] }, 6)).toBe(4)
  })

  it('salta varias seguidas (descarga + puente)', () => {
    expect(semanaBaseDeIem({ semanasDescarga: [4], semanasPivot: [5] }, 6)).toBe(3)
  })

  it('si no hay ninguna semana normal antes, parte de Base (0)', () => {
    expect(semanaBaseDeIem({ semanasDescarga: [1] }, 2)).toBe(0)
    expect(semanaBaseDeIem({}, 1)).toBe(0)
  })

  it('una descarga posterior a la semana que se programa no cambia la base', () => {
    expect(semanaBaseDeIem({ semanasDescarga: [8] }, 5)).toBe(4)
  })
})

describe('semana de partida del acumulado (F2)', () => {
  it('sin puente, la S1', () => {
    expect(semanaDePartidaDeIem({}, 4)).toBe(1)
    expect(semanaDePartidaDeIem({ semanasDescarga: [3] }, 4)).toBe(1)
  })

  it('una puente futura no cuenta todavía', () => {
    expect(semanaDePartidaDeIem({ semanasPivot: [6] }, 4)).toBe(1)
    expect(semanaDePartidaDeIem({ semanasPivot: [6] }, 6)).toBe(1)
  })

  it('con dos, manda la última ya pasada (no la primera)', () => {
    expect(semanaDePartidaDeIem({ semanasPivot: [3, 7] }, 5)).toBe(3)
    expect(semanaDePartidaDeIem({ semanasPivot: [3, 7] }, 9)).toBe(7)
    expect(semanaDePartidaDeIem({ semanasPivot: [7, 3] }, 9)).toBe(7)
  })
})

describe('destinos de la progresión (F2)', () => {
  it('ni la S1, ni las descargas, ni las puente', () => {
    expect(destinosDeProgresion({ semanasDescarga: [4], semanasPivot: [6] }, 8)).toEqual([2, 3, 5, 7, 8])
    expect(destinosDeProgresion({}, 3)).toEqual([2, 3])
    expect(destinosDeProgresion({}, 1)).toEqual([])
  })

  it('dice por qué no se progresa en una semana recortada', () => {
    const meso = { semanasDescarga: [4], semanasPivot: [4, 6] }
    expect(semanaRecortada(meso, 4)).toBe('descarga') // si coincide, manda la descarga
    expect(semanaRecortada(meso, 6)).toBe('puente')
    expect(semanaRecortada(meso, 5)).toBeNull()
    expect(esDescargaOPuente(meso, 5)).toBe(false)
    expect(motivoSinProgresion(meso, 4)).toContain('descarga')
    expect(motivoSinProgresion(meso, 6)).toContain('puente')
    expect(motivoSinProgresion(meso, 5)).toBeNull()
  })

  it('avisa de dónde parte cuando no es la semana anterior', () => {
    expect(avisoDeSemanaBase({}, 5)).toBeNull()
    const una = avisoDeSemanaBase({ semanasDescarga: [4] }, 5)!
    expect(una).toContain('la S3')
    expect(una).toContain('S4 (descarga)')
    const dos = avisoDeSemanaBase({ semanasDescarga: [4], semanasPivot: [5] }, 6)!
    expect(dos).toContain('S4 (descarga), S5 (puente)')
    expect(avisoDeSemanaBase({ semanasDescarga: [1] }, 2)).toContain('Base')
  })
})
