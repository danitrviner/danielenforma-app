import { describe, it, expect } from 'vitest'
import { ZONAS_IEM, indicesDeZonas, iemPorZona, avisosIemIea, variacion } from './zonas'
import { agujetasPorZona, propuestaZona, aEscala5 } from './agujetas'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { expandirCatalogo, crearMotor } from './motor'

const RUTA = resolve(__dirname, '../../../scripts/cdg/catalogo-cdg.json')
const conCatalogo = existsSync(RUTA)

describe.runIf(conCatalogo)('zonas de IEM contra el catálogo real', () => {
  const motor = conCatalogo ? crearMotor(expandirCatalogo(JSON.parse(readFileSync(RUTA, 'utf8')))) : (null as never)

  it('todos los músculos y articulaciones de las zonas existen en el catálogo', () => {
    expect(indicesDeZonas(motor).faltan).toEqual([])
  })

  it('ningún músculo cae en dos zonas', () => {
    const vistos = ZONAS_IEM.flatMap(z => z.musculos)
    expect(new Set(vistos).size).toBe(vistos.length)
  })

  it('una zona es la suma de sus músculos', () => {
    const IEM = motor.musculos.map((_, i) => i + 1)
    const z = iemPorZona(motor, IEM)
    const i = (n: string) => motor.musculos.indexOf(n) + 1
    expect(z.isquios).toBe(i('Isquios'))
    expect(z.gluteo).toBe(i('Glúteo mayor f. superiores') + i('Glúteo mayor f. inferiores') + i('Glúteo medio'))
  })

  it('avisa cuando el estrés articular sube más que el IEM de la zona', () => {
    const nM = motor.musculos.length; const nJ = motor.articulaciones.length
    const antes = { IEM: new Array(nM).fill(1), estresArticular: new Array(nJ).fill(1) }
    const ahora = { IEM: new Array(nM).fill(1.1), estresArticular: new Array(nJ).fill(1.05) }
    expect(avisosIemIea(motor, antes, ahora)).toEqual([])
    const cadera = motor.articulaciones.indexOf('Cadera Articular')
    ahora.estresArticular[cadera] = 1.3
    const avisos = avisosIemIea(motor, antes, ahora)
    expect(avisos.map(a => a.zona).sort()).toEqual(['aductores', 'gluteo', 'isquios'])
    expect(avisos.every(a => a.articulacion === 'Cadera Articular')).toBe(true)
  })
})

describe('variacion', () => {
  it('sin base no hay variación', () => {
    expect(variacion(0, 5)).toBeNull()
    expect(variacion(10, 11)).toBeCloseTo(0.1)
  })
})

describe('agujetas por zona', () => {
  it('lee la escala 1-5 nueva y guarda la anterior', () => {
    const serie = (k: string) => k === 'agujetas.isquios' ? [{ date: '2026-10-01', value: 3 }, { date: '2026-10-08', value: 5 }] : []
    const r = agujetasPorZona(serie)
    expect(r.isquios).toEqual({ zona: 'isquios', valor: 5, fecha: '2026-10-08', anterior: 3, deEscala10: false })
    expect(r.gluteo).toBeUndefined()
  })

  it('sin la nueva, convierte el DOM\'s 0-10 y se queda con el peor grupo de la zona', () => {
    const serie = (k: string) => ({
      'doms.deltoide_lat': [{ date: '2026-10-08', value: 4 }],
      'doms.deltoide_post': [{ date: '2026-10-08', value: 9 }],
    } as Record<string, Array<{ date: string; value: number }>>)[k] ?? []
    const r = agujetasPorZona(serie)
    expect(r.deltoides).toMatchObject({ valor: 5, deEscala10: true })
  })

  it('conversión 0-10 → 1-5', () => {
    expect([0, 1, 2, 5, 6, 8, 10].map(aEscala5)).toEqual([1, 1, 1, 3, 3, 4, 5])
  })
})

describe('freno / acelerador', () => {
  const base = { sensible: false, actitud: 'estatico' as const, esObjetivo: false }
  it('5 frena con 20-30 %', () => {
    expect(propuestaZona({ ...base, agujetas: 5 })).toMatchObject({ tono: 'freno' })
    expect(propuestaZona({ ...base, agujetas: 5 }).texto).toContain('20-30 %')
  })
  it('4 en zona no sensible es pasarse; en sensible se espera una semana', () => {
    expect(propuestaZona({ ...base, agujetas: 4 }).tono).toBe('freno')
    expect(propuestaZona({ ...base, sensible: true, agujetas: 4 }).tono).toBe('vigilar')
    expect(propuestaZona({ ...base, sensible: true, agujetas: 4, anterior: 4 }).tono).toBe('freno')
  })
  it('bloque estático solo sube en zonas objetivo y con un 1', () => {
    expect(propuestaZona({ ...base, agujetas: 1 }).tono).toBe('mantener')
    expect(propuestaZona({ ...base, agujetas: 1, esObjetivo: true }).tono).toBe('acelerar')
    expect(propuestaZona({ ...base, agujetas: 2, esObjetivo: true }).tono).toBe('mantener')
  })
  it('dinámico sube con 1-2, agresivo incluso con 3', () => {
    expect(propuestaZona({ ...base, actitud: 'dinamico', agujetas: 2 }).tono).toBe('acelerar')
    expect(propuestaZona({ ...base, actitud: 'dinamico', agujetas: 3 }).tono).toBe('mantener')
    expect(propuestaZona({ ...base, actitud: 'agresivo', agujetas: 3 }).tono).toBe('acelerar')
  })
  it('sin agujetas no propone nada', () => {
    expect(propuestaZona({ ...base }).tono).toBe('sin-dato')
  })
})
