import { describe, expect, it } from 'vitest'
import { rirEfectivo, rmCdg, rmDeSerie } from './oneRepMax'

// Valores calculados a mano con las fórmulas de la hoja (n = reps + RIR):
//   Epley  = kg × (1 + 0,033 n)
//   Mayhew = 100 kg / (52,2 + 41,9 e^(−0,055 n))
//   Wathen = 100 kg / (48,8 + 53,8 e^(−0,075 n))
describe('RM de CDG (sustituye a Epley)', () => {
  it('con 10-15 reps hechas usa solo Epley sobre reps + RIR', () => {
    expect(rmCdg(80, 10, 2)).toBeCloseTo(80 * (1 + 0.033 * 12), 1) // 112,0
    expect(rmCdg(80, 15, 0)).toBeCloseTo(80 * (1 + 0.033 * 15), 1) // 119,6
  })

  it('con cualquier otro número de reps usa la media de las tres fórmulas', () => {
    expect(rmCdg(100, 5, 1)).toBe(120.5)
    expect(rmCdg(100, 1, 2)).toBe(111)
  })

  it('el RIR cuenta: con más reserva el RM sube', () => {
    expect(rmCdg(100, 5, 3)).toBeGreaterThan(rmCdg(100, 5, 0))
  })

  it('al fallo cuenta como RIR 0 y el RIR ilegible también', () => {
    expect(rirEfectivo(3, true)).toBe(0)
    expect(rirEfectivo('fallo')).toBe(0)
    expect(rirEfectivo('')).toBe(0)
    expect(rirEfectivo(undefined)).toBe(0)
    expect(rmDeSerie({ weight: 100, repsDone: 5, rir: 3, alFallo: true })).toBe(rmCdg(100, 5, 0))
  })

  it('RIR 5 da RM (la tabla de la hoja no lo tiene, pero la app no debe quedarse sin dato)', () => {
    expect(rmCdg(100, 5, 5)).toBeGreaterThan(rmCdg(100, 5, 4))
  })

  it('sin peso o sin reps → 0, como antes', () => {
    expect(rmCdg(0, 5, 1)).toBe(0)
    expect(rmCdg(100, 0, 1)).toBe(0)
    expect(rmCdg('100', '5', '1')).toBe(120.5)
  })
})
