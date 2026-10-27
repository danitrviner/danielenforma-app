import { describe, expect, it } from 'vitest'
import { articulacionesEnDiasSeguidos } from './diasSeguidos'

const art = ['Hombro Articular', 'Rodilla Articular']
describe('articulacionesEnDiasSeguidos (P2)', () => {
  it('marca la articulación que pasa del umbral en dos días consecutivos', () => {
    const r = articulacionesEnDiasSeguidos(art, [
      { nombre: 'Torso A', dayIndex: 0, estresArticular: [9.2, 0] },
      { nombre: 'Pierna A', dayIndex: 1, estresArticular: [6, 4.8] },
      { nombre: 'Torso B', dayIndex: 3, estresArticular: [18.6, 0] },
    ])
    expect(r).toEqual([{ articulacion: 'Hombro Articular', j: 0, sesiones: [0, 1], valores: [9.2, 6] }])
  })
  it('con un día de descanso entre medias no avisa, y sin dayIndex tampoco', () => {
    expect(articulacionesEnDiasSeguidos(art, [
      { nombre: 'A', dayIndex: 0, estresArticular: [9, 9] },
      { nombre: 'B', dayIndex: 2, estresArticular: [9, 9] },
      { nombre: 'C', estresArticular: [9, 9] },
    ])).toEqual([])
  })
  it('por debajo del umbral en una de las dos no cuenta', () => {
    expect(articulacionesEnDiasSeguidos(art, [
      { nombre: 'A', dayIndex: 4, estresArticular: [9, 2] },
      { nombre: 'B', dayIndex: 5, estresArticular: [4.9, 7] },
    ])).toEqual([])
  })
})
