import { describe, it, expect } from 'vitest'
import type { MuscleGroup } from '../../types'
import { cansancioDeSesiones, etiquetaDeSesion, nombresDeZonas, sesionesDurasPorZona, zonasDeEjercicios } from './senalesPorSemana'
import { propuestaZona } from './agujetas'

/* D6r (17-11-2026): el cansancio al salir, sesión a sesión. */

const log = (id: string, date: string, cansancioAlSalir?: number, workoutId = 'w') => ({ id, workoutId, date, cansancioAlSalir })
const NOMBRES: Record<string, string> = { pierna: 'Pierna A', torso: 'Torso A' }
const nombreDe = (id: string) => NOMBRES[id]

describe('cansancioDeSesiones', () => {
  it('da la media de las sesiones con dato y cuál fue la más dura', () => {
    const r = cansancioDeSesiones([
      log('a', '2026-11-09', 6, 'torso'), log('b', '2026-11-12', 9, 'pierna'), log('c', '2026-11-13', 7, 'torso'), log('d', '2026-11-14'),
    ], { nombreDe })
    expect(r).toEqual({
      media: 7.3, sesiones: 3, fecha: '2026-11-13',
      peor: { logId: 'b', workoutId: 'pierna', fecha: '2026-11-12', valor: 9, nombre: 'Pierna A', etiqueta: 'la del jueves, Pierna A' },
      // Sin los ejercicios del registro se sabe que fue dura, pero no qué zonas frena.
      duras: [{ logId: 'b', workoutId: 'pierna', fecha: '2026-11-12', valor: 9, nombre: 'Pierna A', etiqueta: 'la del jueves, Pierna A', ejercicios: [] }],
    })
  })

  it('sin ninguna sesión con dato no hay nada: se cae al cuestionario semanal', () => {
    expect(cansancioDeSesiones([log('a', '2026-11-09'), log('b', '2026-11-12')])).toBeUndefined()
    expect(cansancioDeSesiones([])).toBeUndefined()
  })

  it('solo cuenta la semana que se evalúa (`desde` y `hasta` incluidos)', () => {
    const logs = [log('a', '2026-11-08', 10), log('b', '2026-11-09', 6), log('c', '2026-11-15', 8), log('d', '2026-11-16', 2)]
    const r = cansancioDeSesiones(logs, { desde: '2026-11-09', hasta: '2026-11-15' })
    expect(r).toMatchObject({ media: 7, sesiones: 2, fecha: '2026-11-15' })
    expect(r!.peor.logId).toBe('c')
    expect(cansancioDeSesiones(logs, { desde: '2026-11-20' })).toBeUndefined()
  })

  it('a igualdad, la más reciente; el 0 es un dato y lo que no es 0-10 se ignora', () => {
    const r = cansancioDeSesiones([log('a', '2026-11-10', 8), log('b', '2026-11-12', 8), log('c', '2026-11-13', 0), log('d', '2026-11-14', 11), log('e', '2026-11-14', Number.NaN)])
    expect(r).toMatchObject({ media: 5.3, sesiones: 3 })
    expect(r!.peor).toMatchObject({ logId: 'b', etiqueta: 'la del jueves' })
  })

  it('no depende del orden en que lleguen los registros', () => {
    const r = cansancioDeSesiones([log('b', '2026-11-12', 9), log('a', '2026-11-09', 9)])
    expect(r!.peor.logId).toBe('b')
    expect(r!.fecha).toBe('2026-11-12')
  })
})

/* Auditoría de cifras (17-11-2026): una sesión con 8 o más frena las zonas que
   se trabajaron en ella, sin esperar a que la media de la semana llegue a 8. */
describe('cansancio por sesión: qué zonas frena cada sesión dura', () => {
  const GRUPOS: Record<string, MuscleGroup> = { sentadilla: 'cuadriceps', curlFemoral: 'isquios', hip: 'gluteo', press: 'pecho', remo: 'dorsal', laterales: 'deltoide_lat', curl: 'biceps' }
  const grupoDe = (id: string) => GRUPOS[id]
  const hecha = { weight: 60, repsDone: 8, rir: 1 }
  const sesion = (id: string, date: string, cansancioAlSalir: number | undefined, workoutId: string, ejercicios: string[], saltados: string[] = []) => ({
    id, workoutId, date, cansancioAlSalir,
    entries: [...ejercicios.map(exerciseId => ({ exerciseId, sets: [hecha, hecha] })), ...saltados.map(exerciseId => ({ exerciseId, sets: [{ weight: 0, repsDone: 0 }] }))],
  })
  // Lunes torso (6), jueves pierna (9), sábado torso (7): media 7,3, por debajo de 8.
  const SEMANA = [
    sesion('a', '2026-11-09', 6, 'torso', ['press', 'remo', 'laterales']),
    sesion('b', '2026-11-12', 9, 'pierna', ['sentadilla', 'curlFemoral'], ['hip']),
    sesion('c', '2026-11-14', 7, 'torso', ['press', 'remo', 'curl']),
  ]

  it('las sesiones duras llevan sus ejercicios hechos (los saltados no cuentan)', () => {
    const r = cansancioDeSesiones(SEMANA, { nombreDe })!
    expect(r.media).toBe(7.3)
    expect(r.duras).toEqual([{ logId: 'b', workoutId: 'pierna', fecha: '2026-11-12', valor: 9, nombre: 'Pierna A', etiqueta: 'la del jueves, Pierna A', ejercicios: ['sentadilla', 'curlFemoral'] }])
  })

  it('solo se frenan las zonas de esa sesión, nombrándola', () => {
    const porZona = sesionesDurasPorZona(cansancioDeSesiones(SEMANA, { nombreDe }), grupoDe)
    expect(Object.keys(porZona).sort()).toEqual(['cuadriceps', 'isquios'])
    expect(porZona.cuadriceps).toEqual({ etiqueta: 'la del jueves, Pierna A', valor: 9, fecha: '2026-11-12' })
    // El glúteo se saltó y el torso no se tocó ese día: no se frenan.
    expect(porZona.gluteo).toBeUndefined()
    expect(porZona.pectoral).toBeUndefined()
    expect(nombresDeZonas(['isquios', 'cuadriceps'])).toBe('cuádriceps e isquiotibiales')
    expect(nombresDeZonas(['pectoral', 'dorsal', 'biceps'])).toBe('pectoral, dorsal y bíceps (flexores de codo)')
    expect(nombresDeZonas([])).toBe('')
  })

  it('de punta a punta: el cuádriceps se mantiene y el pectoral puede subir', () => {
    const c = cansancioDeSesiones(SEMANA, { nombreDe })!
    const porZona = sesionesDurasPorZona(c, grupoDe)
    const base = { sensible: false, tipo: { sensibilidad: 'dinamico', velocidad: 'medio' } as const, esObjetivo: false, iem: 20, contexto: 'favorable' as const, agujetas: 1, fatigaPost: c.media, sesionMasCansada: c.peor }
    const cuadriceps = propuestaZona({ ...base, sesionDura: porZona.cuadriceps })
    expect(cuadriceps.tono).toBe('mantener')
    expect(cuadriceps.texto).toContain('la del jueves, Pierna A: 9/10')
    expect(propuestaZona({ ...base, sesionDura: porZona.pectoral }).tono).toBe('acelerar')
  })

  it('con la media en 8 o más se frenan todas, también las que no tocó ninguna sesión dura', () => {
    const dura = [sesion('a', '2026-11-09', 8, 'torso', ['press']), sesion('b', '2026-11-12', 9, 'pierna', ['sentadilla']), sesion('c', '2026-11-14', 7, 'torso', ['curl'])]
    const c = cansancioDeSesiones(dura, { nombreDe })!
    expect(c.media).toBe(8)
    const porZona = sesionesDurasPorZona(c, grupoDe)
    expect(porZona.biceps).toBeUndefined()
    const base = { sensible: false, tipo: { sensibilidad: 'dinamico', velocidad: 'medio' } as const, esObjetivo: false, iem: 20, contexto: 'favorable' as const, agujetas: 1, fatigaPost: c.media, sesionMasCansada: c.peor }
    expect(propuestaZona({ ...base, sesionDura: porZona.biceps }).tono).toBe('mantener')
  })

  it('si dos sesiones duras trabajan la misma zona, manda la de nota más alta (a igualdad, la más reciente)', () => {
    const c = cansancioDeSesiones([
      sesion('a', '2026-11-09', 9, 'pierna', ['sentadilla']), sesion('b', '2026-11-12', 8, 'pierna', ['sentadilla', 'curlFemoral']), sesion('c', '2026-11-14', 9, 'torso', ['press']),
    ], { nombreDe })!
    expect(c.duras.map(d => d.logId)).toEqual(['a', 'b', 'c'])
    const porZona = sesionesDurasPorZona(c, grupoDe)
    expect(porZona.cuadriceps).toMatchObject({ etiqueta: 'la del lunes, Pierna A', valor: 9 })
    expect(porZona.isquios).toMatchObject({ etiqueta: 'la del jueves, Pierna A', valor: 8 })
    const empate = cansancioDeSesiones([sesion('a', '2026-11-09', 8, 'pierna', ['sentadilla']), sesion('b', '2026-11-12', 8, 'pierna', ['sentadilla'])], { nombreDe })
    expect(sesionesDurasPorZona(empate, grupoDe).cuadriceps?.fecha).toBe('2026-11-12')
  })

  it('un ejercicio sin grupo muscular no frena nada, y sin cansancio no hay zonas', () => {
    expect(zonasDeEjercicios(['desconocido', 'sentadilla'], grupoDe)).toEqual(['cuadriceps'])
    expect(sesionesDurasPorZona(undefined, grupoDe)).toEqual({})
    // 7 no es una sesión dura.
    expect(cansancioDeSesiones([sesion('a', '2026-11-09', 7, 'pierna', ['sentadilla'])])!.duras).toEqual([])
  })
})

describe('etiquetaDeSesion', () => {
  it('dice el día y, si lo hay, el nombre de la rutina', () => {
    expect(etiquetaDeSesion('2026-11-12', 'Pierna A')).toBe('la del jueves, Pierna A')
    expect(etiquetaDeSesion('2026-11-15')).toBe('la del domingo')
    expect(etiquetaDeSesion('2026-11-11', '  ')).toBe('la del miércoles')
  })
})
