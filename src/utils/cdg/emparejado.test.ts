import { describe, expect, it } from 'vitest'
import { buscarEnCatalogo, proponerEmparejados, sinMusculos } from './emparejado'

const CDG = [
  'Press banca inclinado 20-30º (caja torácica plana) - Pectoral, deltoides anterior, tríceps',
  'Pike push up con déficit- Deltoides anterior, tríceps',
  'Remo en TRX  straps - Trapecio, dorsal, deltoides posterior',
  'Rotación de hombro a 90º - Rotadores internos',
  'Rotación de hombro a 90º - Rotadores externos',
  'Curl de bíceps en polea - Bíceps'
]

describe('emparejado CDG', () => {
  it('sinMusculos quita los grupos y tolera «déficit- Grupo»', () => {
    expect(sinMusculos(CDG[1])).toBe('Pike push up con déficit')
    expect(sinMusculos(CDG[0])).toBe('Press banca inclinado 20-30º (caja torácica plana)')
  })

  it('exacto ignorando tildes, mayúsculas y espacios dobles', () => {
    const [f] = proponerEmparejados([{ id: 'x', name: 'remo en trx straps' }], CDG)
    expect(f.estado).toBe('exacto')
    expect(f.propuesto).toBe(CDG[2])
  })

  it('probable por el id original cuando la limpieza acortó el nombre', () => {
    const [f] = proponerEmparejados([{ id: 'sys_press-banca-inclinado-20-30-caja-toracica-plana', name: 'Press banca inclinado 20-30º' }], CDG)
    expect(f.estado).toBe('probable')
    expect(f.propuesto).toBe(CDG[0])
  })

  it('ambiguo si varios nombres CDG quedan iguales sin músculos', () => {
    const cdg = ['Rotación de hombro a 90º - Rotadores internos', 'Rotación de hombro a 90º - Rotadores externos']
    const [f] = proponerEmparejados([{ id: 'sys_rot', name: 'Rotación de hombro a 90º' }], cdg)
    expect(f.estado).toBe('ambiguo')
    expect(f.propuesto).toBeNull()
    expect(f.candidatos).toHaveLength(2)
  })

  it('sin parecido real → revisar, con 3 candidatos', () => {
    const [f] = proponerEmparejados([{ id: 'abc', name: 'Encogimientos de trapecio en polea' }], CDG)
    expect(f.estado).toBe('revisar')
    expect(f.propuesto).toBeNull()
    expect(f.candidatos).toHaveLength(3)
  })

  it('buscador: todas las palabras, sin tildes', () => {
    expect(buscarEnCatalogo(CDG, 'biceps polea')).toEqual([CDG[5]])
    expect(buscarEnCatalogo(CDG, '')).toEqual([])
  })
})
