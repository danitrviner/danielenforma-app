import { describe, expect, it } from 'vitest'
import catalogoPrueba from './__fixtures__/catalogoPrueba.json'
import { crearMotor, expandirCatalogo, type CdgCatalogoCompacto } from './index'
import { avisosCarga, cargaAgudaCronica, colapsarSemana, colapsarCarga, type CalculoSemana, type CargaPorSesion } from './seguimiento'
import type { MotorCdg } from './motor'
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

describe('F15 · avisos de carga: lo nuevo y las semanas recortadas', () => {
  const motor = { musculos: ['Cuádriceps', 'Bíceps'], articulaciones: ['Rodilla'] } as unknown as MotorCdg
  const seis = Array.from({ length: 6 }, () => semana(SIETE(10, 10)))

  it('un músculo sin historia y con carga esta semana es «nuevo», no un ratio 1 que no avisa', () => {
    const a = aguda(SIETE(10, 10))
    a.IEM[7] = [20, 6] // el bíceps (crónica 0) entra esta semana
    const ac = cargaAgudaCronica(a, seis)!
    expect(ac.IEM[7][1]).toBe(1) // la hoja sigue diciendo 1…
    const avisos = avisosCarga(ac, motor)
    expect(avisos.musculos).toEqual([]) // …y por eso no salía en ningún aviso
    expect(avisos.nuevos).toEqual([{ sesion: 'Total de sesiones', tipo: 'musculo', nombre: 'Bíceps', aguda: 6 }])
  })

  it('sin nada nuevo, la lista sale vacía; con crónica y sin carga tampoco es nuevo', () => {
    expect(avisosCarga(cargaAgudaCronica(aguda(SIETE(10, 10)), seis)!, motor).nuevos).toEqual([])
    expect(avisosCarga(cargaAgudaCronica(aguda(SIETE(0, 0)), seis)!, motor).nuevos).toEqual([])
  })

  it('una sesión que antes no existía va como «nueva», no como «por debajo»', () => {
    const ac = cargaAgudaCronica(aguda([10, 10, 8, 0, 0, 0, 0]), seis)!
    const { sesionesIF } = avisosCarga(ac, motor)
    expect(sesionesIF[2]).toMatchObject({ valor: 0, fuera: false, nueva: true })
    expect(sesionesIF[0]).toMatchObject({ fuera: false })
    expect(sesionesIF[0]).not.toHaveProperty('nueva')
  })

  it('no cambia los umbrales por defecto: 0,8 y 1,6', () => {
    const fuera = (ifs: number[]) => avisosCarga(cargaAgudaCronica(aguda(ifs), seis)!, motor).sesionesIF[7].fuera
    expect(fuera(SIETE(16, 16))).toBe(false) // 1,6 justo: dentro
    expect(fuera(SIETE(16.5, 16.5))).toBe(true)
    expect(fuera(SIETE(8, 8))).toBe(false) // 0,8 justo: dentro
    expect(fuera(SIETE(7.5, 7.5))).toBe(true)
  })

  it('en descarga o puente no se avisa por debajo, pero sí por encima', () => {
    const bajo = cargaAgudaCronica(aguda(SIETE(5, 5)), seis)!
    expect(avisosCarga(bajo, motor).sesionesIF[7].fuera).toBe(true)
    expect(avisosCarga(bajo, motor).musculos.length).toBeGreaterThan(0)
    const enDescarga = avisosCarga(bajo, motor, { sinAvisoPorDebajo: true })
    expect(enDescarga.sesionesIF[7].fuera).toBe(false)
    expect(enDescarga.musculos).toEqual([])
    expect(enDescarga.articulaciones).toEqual([])
    const alto = cargaAgudaCronica(aguda(SIETE(20, 20)), seis)!
    expect(avisosCarga(alto, motor, { sinAvisoPorDebajo: true }).sesionesIF[7].fuera).toBe(true)
  })
})
