import { describe, expect, it } from 'vitest'
import catalogoPrueba from './__fixtures__/catalogoPrueba.json'
import { crearMotor, expandirCatalogo, type CdgCatalogoCompacto } from './index'
import { fichaPorSerie } from './fichaEjercicio'

const motor = crearMotor(expandirCatalogo(catalogoPrueba as CdgCatalogoCompacto))
const FLEXIONES = 'Flexiones - Pectoral, deltoides anterior, tríceps'

describe('fichaPorSerie', () => {
  it('un ejercicio del catálogo da valores por serie', () => {
    const f = fichaPorSerie(motor, FLEXIONES)
    expect(f.encontrado).toBe(true)
    expect(f.IF).toBeGreaterThan(0)
    expect(f.IEMTotal).toBeGreaterThan(0)
    expect(f.musculos.length).toBeGreaterThan(0)
  })
  it('los músculos vienen de mayor a menor y el principal es el pectoral', () => {
    const f = fichaPorSerie(motor, FLEXIONES)
    const valores = f.musculos.map(m => m.valor)
    expect(valores).toEqual([...valores].sort((a, b) => b - a))
    expect(f.musculos[0].nombre).toMatch(/Pectoral/)
  })
  it('el IEM total es la suma de todos los músculos', () => {
    const f = fichaPorSerie(motor, FLEXIONES)
    expect(f.IEMTotal).toBeGreaterThanOrEqual(f.musculos.reduce((a, m) => a + m.valor, 0) - 1e-9)
  })
  it('sin vínculo o con un nombre que no existe, no inventa números', () => {
    expect(fichaPorSerie(motor, undefined).encontrado).toBe(false)
    const f = fichaPorSerie(motor, 'No existe')
    expect(f).toEqual({ encontrado: false, IF: 0, IEMTotal: 0, musculos: [], articulacion: null })
  })
})
