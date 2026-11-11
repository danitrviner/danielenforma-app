import { describe, it, expect } from 'vitest'
import { unirPropios } from './propios'

const cat = { muscles: [{ muscle: 'A', size: 'Grande', parentMuscle: 'A' }], joints: ['J'], exercises: [{ exercise: 'Uno', inestability: 1, m: [1], j: [0] }] }
const prop = (exercises: unknown[], extra = {}) => JSON.stringify({ muscles: cat.muscles, joints: cat.joints, exercises, ...extra })

describe('unirPropios', () => {
  it('añade los propios al final', () => {
    const out = JSON.parse(unirPropios(JSON.stringify(cat), prop([{ exercise: 'Dos (propio)', inestability: 0.4, m: [0.5], j: [0] }])))
    expect(out.exercises.map((e: { exercise: string }) => e.exercise)).toEqual(['Uno', 'Dos (propio)'])
  })
  it('sin propios o con propios rotos deja el catálogo igual', () => {
    const c = JSON.stringify(cat)
    expect(unirPropios(c, null)).toBe(c)
    expect(unirPropios(c, '{roto')).toBe(c)
    expect(unirPropios(c, prop([]))).toBe(c)
  })
  it('ignora los propios si los músculos no coinciden', () => {
    const c = JSON.stringify(cat)
    expect(unirPropios(c, prop([{ exercise: 'X', inestability: 1, m: [1], j: [0] }], { joints: ['Otra'] }))).toBe(c)
  })
  it('no duplica nombres del Excel ni acepta valores incompletos', () => {
    const out = JSON.parse(unirPropios(JSON.stringify(cat), prop([
      { exercise: 'Uno', inestability: 1, m: [0.1], j: [0] },
      { exercise: 'Corto', inestability: 1, m: [], j: [0] },
      { exercise: 'Bueno', inestability: 1, m: [0.3], j: [0] }
    ])))
    expect(out.exercises.map((e: { exercise: string }) => e.exercise)).toEqual(['Uno', 'Bueno'])
  })
})
