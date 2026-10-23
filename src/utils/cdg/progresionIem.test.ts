import { describe, expect, it } from 'vitest'
import catalogoPrueba from './__fixtures__/catalogoPrueba.json'
import { crearMotor, expandirCatalogo, type CdgCatalogoCompacto } from './index'
import { proponerProgresionIem, aplicarOperaciones, type EjercicioProgramable } from './progresionIem'
import type { WorkoutExercise } from '../../types'

const motor = crearMotor(expandirCatalogo(catalogoPrueba as CdgCatalogoCompacto))
const N: Record<string, string> = {
  press: 'Press en máquina convergente horizontal - Pectoral, deltoides anterior, tríceps',
  peck: 'Peck deck codo a 90º (ajustado) - Pectoral',
  curl: 'Curl de bíceps en polea - Bíceps',
}
const nombreCdgDe = (id: string) => N[id]
const we = (exerciseId: string, sets: number, rir: number, extra: Partial<WorkoutExercise> = {}) =>
  ({ exerciseId, order: 0, sets, reps: '10-12', restSeconds: 90, rir, ...extra }) as WorkoutExercise
const dia = (): EjercicioProgramable[] => [
  { clave: 'A:press', dia: 'Empuje A', we: we('press', 3, 2), grupo: 'pecho' },
  { clave: 'A:peck', dia: 'Empuje A', we: we('peck', 3, 2), grupo: 'pecho' },
  { clave: 'A:curl', dia: 'Empuje A', we: we('curl', 3, 2), grupo: 'biceps' },
]
const iemDe = (ejs: EjercicioProgramable[]) => {
  const { zonas } = proponerProgresionIem({ motor, nombreCdgDe, ejercicios: ejs, iemBase: {}, pctPorZona: {} })
  return zonas
}

describe('E-08 · propuesta por IEM', () => {
  // IEM base = lo que ya está programado, para que el objetivo sea solo la subida.
  const base = () => {
    const r = proponerProgresionIem({ motor, nombreCdgDe, ejercicios: dia(), iemBase: { pectoral: 1 }, pctPorZona: { pectoral: 1 } })
    return r.zonas[0].antes
  }

  it('sin porcentaje no propone nada', () => {
    expect(iemDe(dia())).toEqual([])
  })

  it('sube el pectoral un 20 % con RIR y series, sin tocar el curl, y llega', () => {
    const b = base()
    const r = proponerProgresionIem({ motor, nombreCdgDe, ejercicios: dia(), iemBase: { pectoral: b }, pctPorZona: { pectoral: 20 } })
    expect(r.cambios.length).toBeGreaterThan(0)
    expect(r.cambios.every(c => c.clave !== 'A:curl')).toBe(true)
    expect(r.cambios.every(c => c.op.tipo !== 'tecnica')).toBe(true)
    expect(r.zonas[0].alcanzado).toBe(true)
    expect(r.zonas[0].despues).toBeGreaterThan(b)
    // Cada palanca una sola vez por ejercicio.
    const claves = r.cambios.map(c => `${c.clave}:${c.op.tipo}`)
    expect(new Set(claves).size).toBe(claves.length)
  })

  it('frenar baja el IEM subiendo RIR o quitando series', () => {
    const b = base()
    const r = proponerProgresionIem({ motor, nombreCdgDe, ejercicios: dia(), iemBase: { pectoral: b }, pctPorZona: { pectoral: -25 } })
    expect(r.zonas[0].despues).toBeLessThan(b)
    expect(r.cambios.every(c => (c.op.tipo === 'rir' || c.op.tipo === 'serie') && c.op.delta === 1 === (c.op.tipo === 'rir'))).toBe(true)
  })

  it('nunca baja de RIR 0 y avisa si se pasa del máximo de series', () => {
    const ejs = dia().map(x => ({ ...x, we: { ...x.we, rir: 0 } }))
    const b = proponerProgresionIem({ motor, nombreCdgDe, ejercicios: ejs, iemBase: { pectoral: 1 }, pctPorZona: { pectoral: 1 } }).zonas[0].antes
    const r = proponerProgresionIem({ motor, nombreCdgDe, ejercicios: ejs, iemBase: { pectoral: b }, pctPorZona: { pectoral: 30 }, mrvPorGrupo: { pecho: 6 } })
    expect(r.cambios.some(c => c.op.tipo === 'rir')).toBe(false)
    expect(r.cambios.filter(c => c.op.tipo === 'serie').every(c => c.superaMrv?.mrv === 6)).toBe(true)
  })

  it('la técnica solo si se permite y en aislamiento', () => {
    const b = base()
    const r = proponerProgresionIem({
      motor, nombreCdgDe, ejercicios: dia(), iemBase: { pectoral: b }, pctPorZona: { pectoral: 60 },
      palancas: { rir: false, series: false, tecnica: true },
    })
    expect(r.cambios.map(c => c.clave)).toEqual(['A:peck'])
  })

  it('es reproducible y las operaciones marcadas se aplican igual', () => {
    const b = base()
    const a1 = proponerProgresionIem({ motor, nombreCdgDe, ejercicios: dia(), iemBase: { pectoral: b }, pctPorZona: { pectoral: 20 } })
    const a2 = proponerProgresionIem({ motor, nombreCdgDe, ejercicios: dia(), iemBase: { pectoral: b }, pctPorZona: { pectoral: 20 } })
    expect(a1).toEqual(a2)
    const press = aplicarOperaciones(we('press', 3, 2), [{ tipo: 'rir', delta: -1 }, { tipo: 'serie', delta: 1 }])
    expect([press.rir, press.sets]).toEqual([1, 4])
  })

  it('solo mueve los ejercicios elegidos, aunque los demás cuenten para la zona', () => {
    const b = base()
    const ejs = dia().map(x => (x.clave === 'A:press' ? { ...x, movible: false } : x))
    const r = proponerProgresionIem({ motor, nombreCdgDe, ejercicios: ejs, iemBase: { pectoral: b }, pctPorZona: { pectoral: 20 } })
    expect(r.cambios.length).toBeGreaterThan(0)
    expect(r.cambios.every(c => c.clave === 'A:peck')).toBe(true)
  })

  it('sin IEM de referencia lo dice en vez de inventar', () => {
    const r = proponerProgresionIem({ motor, nombreCdgDe, ejercicios: dia(), iemBase: {}, pctPorZona: { biceps: 10 } })
    expect(r.cambios).toEqual([])
    expect(r.zonas[0].nota).toContain('Sin IEM de referencia')
  })
})
