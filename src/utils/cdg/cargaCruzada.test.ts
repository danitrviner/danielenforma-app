import { describe, expect, it } from 'vitest'
import catalogoPrueba from './__fixtures__/catalogoPrueba.json'
import { crearMotor, expandirCatalogo, type CdgCatalogoCompacto } from './index'
import { cargaAgudaCronica, colapsarSemana, colapsarCarga, type CalculoSemana, type CargaPorSesion } from './seguimiento'
import { semanasAnterioresAlBloque } from './integracion'
import type { WorkoutLog } from '../../types'

const semana = (ifs: number[]): CalculoSemana => ({
  IF: ifs, IEM: ifs.map(v => [v, 0]), estresArticular: ifs.map(v => [v / 2]),
})
const aguda = (ifs: number[]): CargaPorSesion => {
  const tot = ifs.reduce((a, b) => a + b, 0)
  return { IF: [...ifs, tot], IEM: [...ifs.map(v => [v, 0]), [tot, 0]], estresArticular: [...ifs.map(v => [v / 2]), [tot / 2]] }
}
const SIETE = (a: number, b: number) => [a, b, 0, 0, 0, 0, 0]

describe('E-10 · carga crónica con menos semanas y cruzando bloques', () => {
  it('sin mínimo exige 6 (como el original); con mínimo 3 hace la media de las que haya', () => {
    const tres = [semana(SIETE(10, 10)), semana(SIETE(10, 10)), semana(SIETE(10, 10))]
    expect(cargaAgudaCronica(aguda(SIETE(12, 12)), tres)).toBeNull()
    const ac = cargaAgudaCronica(aguda(SIETE(12, 12)), tres, 3)!
    expect(ac.IF[7]).toBeCloseTo(24 / 20)
    expect(cargaAgudaCronica(aguda(SIETE(12, 12)), tres.slice(0, 2), 3)).toBeNull()
  })

  it('colapsar deja la semana entera en la sesión 1 y el total igual', () => {
    const c = colapsarSemana(semana(SIETE(10, 6)))
    expect(c.IF).toEqual([16, 0, 0, 0, 0, 0, 0])
    expect(c.IEM[0]).toEqual([16, 0])
    const a = colapsarCarga(aguda(SIETE(10, 6)))
    expect(a.IF[0]).toBe(16)
    expect(a.IF[7]).toBe(16)
  })

  it('semanas anteriores al bloque: tramos de 7 días hacia atrás, sin las vacías, la más reciente primero', () => {
    const motor = crearMotor(expandirCatalogo(catalogoPrueba as CdgCatalogoCompacto))
    const nombre = 'Curl de bíceps en polea - Bíceps'
    const log = (date: string, kg: number): WorkoutLog => ({
      id: date, athleteId: 'a', workoutId: 'w', assignmentId: 'x', date, completedAt: date,
      entries: [{ exerciseId: 'curl', sets: [{ weight: kg, repsDone: 10, rir: 2 }] }],
    })
    const logs = [log('2026-09-28', 20), log('2026-09-15', 20), log('2026-09-16', 20), log('2026-10-02', 20)]
    const r = semanasAnterioresAlBloque({ logs, inicio: '2026-10-01', motor, nombreCdgDe: id => (id === 'curl' ? nombre : undefined) })
    // 24-09…30-09 (1 sesión) y 10-09…16-09 (2 sesiones); 17-09…23-09 vacía; 02-10 es del bloque.
    expect(r).toHaveLength(2)
    expect(r[1].IF[0]).toBeCloseTo(r[0].IF[0] * 2)
  })
})
