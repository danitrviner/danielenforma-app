import { describe, it, expect } from 'vitest'
import { ZONAS_IEM, indicesDeZonas, iemPorZona, avisosIemIea, variacion } from './zonas'
import { agujetasPorZona, propuestaZona, aEscala5, tipoDeBloque, contextoDeLaSemana, sensibilidadDeZona } from './agujetas'
import { bandaIF, consejosDeTiempo } from './referencias'
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
  const estatico = { sensibilidad: 'estatico', velocidad: 'suave' } as const
  const dinamico = { sensibilidad: 'dinamico', velocidad: 'medio' } as const
  const base = { sensible: false, tipo: estatico, esObjetivo: false, iem: 20, contexto: 'favorable' as const }
  it('5 nunca sube y no fija un %: decide el coach cuánto bajar (Dani, 25-10)', () => {
    const p = propuestaZona({ ...base, agujetas: 5 })
    expect(p.tono).toBe('freno')
    expect(p.pct).toBeUndefined()
    expect(p.texto).toContain('tú decides cuánto')
    expect(p.texto).toContain('estiramiento')
  })
  it('el objetivo de Volumen es la meta: no se pasa y, si ya llega, decide el coach', () => {
    expect(propuestaZona({ ...base, agujetas: 1, objetivo: 20 })).toMatchObject({ tono: 'objetivo' })
    expect(propuestaZona({ ...base, agujetas: 1, objetivo: 20 }).pct).toBeUndefined()
    const p = propuestaZona({ ...base, agujetas: 1, iem: 20, objetivo: 21 })
    expect(p).toMatchObject({ tono: 'acelerar', pct: 5 })
    expect(p.texto).toContain('hasta su objetivo')
    expect(propuestaZona({ ...base, agujetas: 5, objetivo: 20 }).tono).toBe('freno')
  })
  it('4 en zona no propensa es pasarse; en propensa se espera una semana', () => {
    expect(propuestaZona({ ...base, agujetas: 4 })).toMatchObject({ tono: 'freno', pct: -20 })
    expect(propuestaZona({ ...base, sensible: true, agujetas: 4 }).tono).toBe('vigilar')
    expect(propuestaZona({ ...base, sensible: true, agujetas: 4, anterior: 4 }).tono).toBe('freno')
  })
  it('estático solo sube con un 1; dinámico con 1-3', () => {
    expect(propuestaZona({ ...base, agujetas: 1 })).toMatchObject({ tono: 'acelerar', pct: 10 })
    expect(propuestaZona({ ...base, agujetas: 2 }).tono).toBe('mantener')
    expect(propuestaZona({ ...base, tipo: dinamico, agujetas: 3 })).toMatchObject({ tono: 'acelerar', pct: 20, iemPropuesto: 24 })
  })
  it('la velocidad decide cuánto; el contexto neutro lo deja a la mitad; desfavorable no sube', () => {
    const agresivo = { sensibilidad: 'dinamico', velocidad: 'agresivo' } as const
    expect(propuestaZona({ ...base, tipo: agresivo, agujetas: 2 }).pct).toBe(30)
    expect(propuestaZona({ ...base, tipo: agresivo, agujetas: 2, contexto: 'neutro' }).pct).toBe(15)
    expect(propuestaZona({ ...base, tipo: agresivo, agujetas: 2, contexto: 'desfavorable' }).tono).toBe('mantener')
  })
  it('con base alta no más de un 10 %', () => {
    const agresivo = { sensibilidad: 'dinamico', velocidad: 'agresivo' } as const
    const p = propuestaZona({ ...base, tipo: agresivo, agujetas: 1, iem: 120 })
    expect(p.pct).toBe(10)
    expect(p.texto).toContain('mantén los puntos')
  })
  it('saliendo muy cansado de las sesiones no se sube', () => {
    const p = propuestaZona({ ...base, agujetas: 1, fatigaPost: 9 })
    expect(p.tono).toBe('mantener')
    expect(p.texto).toContain('baja el IF')
  })
  it('sin agujetas no hay dato', () => {
    expect(propuestaZona({ ...base }).tono).toBe('sin-dato')
  })
})

describe('tipo de bloque y contexto', () => {
  it('la actitud antigua se traduce a los dos ejes', () => {
    expect(tipoDeBloque({})).toEqual({ sensibilidad: 'estatico', velocidad: 'suave' })
    expect(tipoDeBloque({ cdgActitud: 'dinamico' })).toEqual({ sensibilidad: 'dinamico', velocidad: 'medio' })
    expect(tipoDeBloque({ cdgActitud: 'agresivo' })).toEqual({ sensibilidad: 'dinamico', velocidad: 'agresivo' })
    expect(tipoDeBloque({ cdgActitud: 'agresivo', cdgVelocidad: 'suave' }).velocidad).toBe('suave')
  })
  it('contexto de la semana', () => {
    expect(contextoDeLaSemana({}).contexto).toBe('sin-dato')
    expect(contextoDeLaSemana({ estres: 3, sueñoHoras: 7.5, motivacion: 8 }).contexto).toBe('favorable')
    expect(contextoDeLaSemana({ estres: 5, sueñoHoras: 7 }).contexto).toBe('neutro')
    expect(contextoDeLaSemana({ estres: 8, sueñoHoras: 5 })).toEqual({ contexto: 'desfavorable', motivos: ['estrés 8/10', '5 h de sueño'] })
  })
})

describe('referencias de la guía', () => {
  it('bandas de IF por sesión', () => {
    expect(bandaIF(35).banda).toBe('sencilla')
    expect(bandaIF(40).banda).toBe('intermedia')
    expect(bandaIF(85).banda).toBe('alta')
    expect(bandaIF(101).banda).toBe('muy-alta')
  })
  it('consejos solo si la sesión no cabe, con los unilaterales primero', () => {
    expect(consejosDeTiempo({ minutosDisponibles: 60, tiempoSeg: 55 * 60, unilaterales: 2 })).toEqual([])
    const c = consejosDeTiempo({ minutosDisponibles: 60, tiempoSeg: 75 * 60, unilaterales: 2 })[0]
    expect(c).toMatch(/^Se pasa ~15 min de los 60/)
    expect(c.indexOf('unilaterales')).toBeLessThan(c.indexOf('superseries'))
  })
})

describe('modo por zona (Dani, 25-10)', () => {
  it('con objetivo, dinámico; sin objetivo, estático; lo puesto por el coach manda', () => {
    const m = { cdgObjetivosIem: { pectoral: 120 }, cdgModoPorZona: { dorsal: 'dinamico' as const, pectoral: 'estatico' as const } }
    expect(sensibilidadDeZona({ cdgObjetivosIem: { pectoral: 120 } }, 'pectoral')).toBe('dinamico')
    expect(sensibilidadDeZona({}, 'pectoral')).toBe('estatico')
    expect(sensibilidadDeZona(m, 'pectoral')).toBe('estatico')
    expect(sensibilidadDeZona(m, 'dorsal')).toBe('dinamico')
  })
})
