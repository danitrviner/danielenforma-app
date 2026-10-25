import { describe, it, expect } from 'vitest'
import catalogoPrueba from './__fixtures__/catalogoPrueba.json'
import { ZONAS_IEM, type ZonaIem } from './zonas'
import {
  GRUPOS_DE_ZONAS, grupoDeZona, nombreCortoDeMusculo, musculosSinZona, barraFrenteAlObjetivo, MARCA_OBJETIVO, ordenarConGrupos, avisosDeSeries, zonaDeGrupo,
} from './zonasDesplegables'

const musculos = (catalogoPrueba as { muscles: { muscle: string }[] }).muscles.map(m => m.muscle)
const fila = (clave: ZonaIem) => ({ z: { clave } })

describe('grupos de zonas', () => {
  it('Espalda junta Dorsal y Trapecio; los erectores van aparte', () => {
    expect(grupoDeZona('dorsal')?.nombre).toBe('Espalda')
    expect(grupoDeZona('trapecio')?.nombre).toBe('Espalda')
    expect(grupoDeZona('lumbares')).toBeUndefined()
  })

  it('todas las zonas de los grupos existen', () => {
    const claves = new Set<string>(ZONAS_IEM.map(z => z.clave))
    for (const g of GRUPOS_DE_ZONAS) for (const z of g.zonas) expect(claves.has(z)).toBe(true)
  })

  it('el grupo sale donde cae su primera zona y sus zonas van detrás, seguidas', () => {
    const r = ordenarConGrupos([fila('pectoral'), fila('trapecio'), fila('cuadriceps'), fila('dorsal')])
    expect(r.map(x => (x.tipo === 'grupo' ? `g:${x.clave}` : x.fila.z.clave))).toEqual(['pectoral', 'g:espalda', 'trapecio', 'dorsal', 'cuadriceps'])
    expect(r.filter(x => x.tipo === 'zona' && x.enGrupo).length).toBe(2)
  })

  it('con una sola zona del grupo en la lista, el grupo sale igual con esa', () => {
    const r = ordenarConGrupos([fila('dorsal'), fila('pectoral')])
    expect(r[0]).toMatchObject({ tipo: 'grupo', clave: 'espalda' })
    expect(r.length).toBe(3)
  })
})

describe('músculos', () => {
  it('nombre corto para la pantalla; si no lo conoce, el del catálogo', () => {
    expect(nombreCortoDeMusculo('Flexores de codo braquioradial')).toBe('Braquiorradial')
    expect(nombreCortoDeMusculo('Triceps cabezas medial y lateral')).toBe('Cabezas medial y lateral')
    expect(nombreCortoDeMusculo('Músculo nuevo')).toBe('Músculo nuevo')
  })

  it('«Otros músculos»: los del catálogo que no están en ninguna zona', () => {
    expect(musculosSinZona(musculos).map(i => musculos[i]).sort()).toEqual(['Psoas ilíaco', 'Rotadores externos cadera', 'Rotadores externos hombro'])
  })
})

describe('barra frente al objetivo', () => {
  it('tres tonos: llega ≥ 100 %, cerca 80–99 %, lejos < 80 %', () => {
    expect(barraFrenteAlObjetivo(120, 120).tono).toBe('llega')
    expect(barraFrenteAlObjetivo(96, 120).tono).toBe('cerca')
    expect(barraFrenteAlObjetivo(95.9, 120).tono).toBe('lejos')
  })

  it('el objetivo cae en la raya y lo que pasa del 120 % no sale del carril', () => {
    expect(barraFrenteAlObjetivo(120, 120).ancho).toBeCloseTo(MARCA_OBJETIVO)
    expect(barraFrenteAlObjetivo(300, 120).ancho).toBe(1)
    expect(barraFrenteAlObjetivo(10, 0)).toMatchObject({ ratio: 0, ancho: 0 })
  })
})

describe('avisos de series (11-c)', () => {
  const limites = { deltoide_ant: { mev: 4, mrv: 12 }, deltoide_lat: { mev: 8, mrv: 24 }, cuadriceps: { mev: 8, mrv: 20 } }
  const base = { semanasDelCiclo: 1, descarga: false, entrena: () => true }

  it('bajo el mínimo en un grupo de la zona; los demás grupos no cuentan', () => {
    const r = avisosDeSeries(['deltoide_ant', 'deltoide_lat'], new Map([['deltoide_ant', 5], ['deltoide_lat', 6]] as const), limites, base)
    expect(r).toEqual([{ grupo: 'deltoide_lat', series: 6, tipo: 'bajo', limite: 8 }])
  })

  it('por encima del máximo recuperable, también en descarga', () => {
    const r = avisosDeSeries(['cuadriceps'], new Map([['cuadriceps', 22]] as const), limites, { ...base, descarga: true })
    expect(r).toEqual([{ grupo: 'cuadriceps', series: 22, tipo: 'sobre', limite: 20 }])
  })

  it('sin aviso de mínimo en descarga ni en un grupo que el bloque no entrena', () => {
    const series = new Map([['deltoide_lat', 2]] as const)
    expect(avisosDeSeries(['deltoide_lat'], series, limites, { ...base, descarga: true })).toEqual([])
    expect(avisosDeSeries(['deltoide_lat'], series, limites, { ...base, entrena: () => false })).toEqual([])
  })

  it('pasa las series del ciclo a semana de 7 días', () => {
    // Ciclo de 14 días: 12 series son 6 por semana, bajo el mínimo de 8.
    const r = avisosDeSeries(['deltoide_lat'], new Map([['deltoide_lat', 12]] as const), limites, { ...base, semanasDelCiclo: 2 })
    expect(r[0]).toMatchObject({ series: 6, tipo: 'bajo' })
  })
})

describe('zona de un grupo', () => {
  it('cada grupo de la app cae en su zona', () => {
    expect(zonaDeGrupo('pecho')).toBe('pectoral')
    expect(zonaDeGrupo('deltoide_lat')).toBe('deltoides')
    expect(zonaDeGrupo('core')).toBe('abdomen')
    expect(zonaDeGrupo(undefined)).toBeUndefined()
  })
})
