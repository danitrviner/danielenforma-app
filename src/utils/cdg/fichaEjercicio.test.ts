import { describe, expect, it } from 'vitest'
import catalogoPrueba from './__fixtures__/catalogoPrueba.json'
import { crearMotor, expandirCatalogo, type CdgCatalogoCompacto } from './index'
import { fichaPorSerie, zonaPorSerie } from './fichaEjercicio'

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

describe('zonaPorSerie (12-c)', () => {
  it('IEM de la zona del grupo y el IF de la serie', () => {
    const r = zonaPorSerie(motor, FLEXIONES, 'pecho')!
    expect(r.zona).toBe('pectoral')
    expect(r.IEM).toBeGreaterThan(0)
    expect(r.IF).toBeCloseTo(fichaPorSerie(motor, FLEXIONES).IF)
    expect(r.IEM).toBeLessThanOrEqual(fichaPorSerie(motor, FLEXIONES).IEMTotal)
  })
  it('nombre corto de la zona y zona de varios grupos', () => {
    expect(zonaPorSerie(motor, 'Curl de bíceps en polea - Bíceps', 'biceps')!.zona).toBe('bíceps')
    expect(zonaPorSerie(motor, 'Elevaciones laterales con mancuernas - Deltoides medial', 'deltoide_lat')!.zona).toBe('deltoides')
  })
  it('sin vínculo o nombre desconocido: null, no un 0', () => {
    expect(zonaPorSerie(motor, undefined, 'pecho')).toBeNull()
    expect(zonaPorSerie(motor, 'No existe', 'pecho')).toBeNull()
  })
})

describe('clasificación dudosa (12-d)', () => {
  it('un pec deck clasificado como tríceps: dudosa, trabaja sobre todo pectoral', () => {
    const r = zonaPorSerie(motor, 'Peck deck codo a 90º (ajustado) - Pectoral', 'triceps')!
    expect(r.dudosa).toBe(true)
    expect(r.principal?.zona).toBe('pectoral')
  })
  it('bien clasificado: no avisa', () => {
    expect(zonaPorSerie(motor, FLEXIONES, 'pecho')!.dudosa).toBe(false)
  })
})
