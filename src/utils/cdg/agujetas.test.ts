import { describe, it, expect } from 'vitest'
import { agujetasPorZona, agujetasDeSesiones, agujetasVigentes, origenDeLectura, propuestaZona, semanasFueraDeSubidas, subidasDeLaZona, type SesionConAgujetas } from './agujetas'

/* D7 (17-11-2026): las agujetas contestadas a las 48 h de cada sesión conviven
   con las del cuestionario semanal. Por zona manda la más reciente por fecha. */

const semanal = (puntos: Record<string, Array<{ date: string; value: number }>>) => (k: string) => puntos[k] ?? []
const sesion = (completedAt: string, agujetas48h: Record<string, number>, agujetas48hAt?: string): SesionConAgujetas =>
  ({ date: completedAt.slice(0, 10), completedAt, agujetas48h, agujetas48hAt })

describe('agujetasDeSesiones', () => {
  it('saca los puntos por zona, con la fecha en que contestó', () => {
    const r = agujetasDeSesiones([
      sesion('2026-11-12T18:00:00.000Z', { gluteo: 4, isquios: 3 }, '2026-11-14T09:00:00.000Z'),
      sesion('2026-11-09T18:00:00.000Z', { gluteo: 2 }, '2026-11-11T20:00:00.000Z'),
    ])
    expect(r.gluteo).toEqual([
      { date: '2026-11-11', value: 2, instante: '2026-11-11T20:00:00.000Z' },
      { date: '2026-11-14', value: 4, instante: '2026-11-14T09:00:00.000Z' },
    ])
    expect(r.isquios).toHaveLength(1)
  })

  it('ignora claves que no son zona y notas fuera de 1-5; sin `agujetas48hAt`, dos días después de la sesión', () => {
    const r = agujetasDeSesiones([sesion('2026-11-12T18:00:00.000Z', { gluteo: 3, hombro: 2, isquios: 0, pectoral: 6 })])
    expect(Object.keys(r)).toEqual(['gluteo'])
    expect(r.gluteo![0].date).toBe('2026-11-14')
  })

  it('con `hasta`, lo contestado después no entra', () => {
    const s = [sesion('2026-11-12T18:00:00.000Z', { gluteo: 4 }, '2026-11-14T09:00:00.000Z')]
    expect(agujetasDeSesiones(s, '2026-11-13').gluteo).toBeUndefined()
    expect(agujetasDeSesiones(s, '2026-11-14').gluteo).toHaveLength(1)
  })
})

describe('agujetasPorZona · 48 h + cuestionario semanal', () => {
  it('sin sesiones se comporta como siempre y la lectura es «semanal»', () => {
    const r = agujetasPorZona(semanal({ 'agujetas.isquios': [{ date: '2026-11-06', value: 3 }, { date: '2026-11-13', value: 4 }] }))
    expect(r.isquios).toEqual({ zona: 'isquios', valor: 4, fecha: '2026-11-13', anterior: 3, deEscala10: false })
    expect(origenDeLectura(r.isquios!)).toBe('semanal')
  })

  it('gana la más reciente por fecha: la de 48 h si es posterior al cuestionario', () => {
    const r = agujetasPorZona(
      semanal({ 'agujetas.gluteo': [{ date: '2026-11-13', value: 2 }] }),
      [sesion('2026-11-14T18:00:00.000Z', { gluteo: 4 }, '2026-11-16T10:00:00.000Z')],
    )
    expect(r.gluteo).toMatchObject({ valor: 4, fecha: '2026-11-16', anterior: 2, origen: '48h' })
    expect(origenDeLectura(r.gluteo!)).toBe('48h')
  })

  it('…y la del cuestionario si es él el posterior; la anterior es entonces la de 48 h', () => {
    const r = agujetasPorZona(
      semanal({ 'agujetas.gluteo': [{ date: '2026-11-13', value: 2 }] }),
      [sesion('2026-11-09T18:00:00.000Z', { gluteo: 5 }, '2026-11-11T10:00:00.000Z')],
    )
    expect(r.gluteo).toMatchObject({ valor: 2, fecha: '2026-11-13', anterior: 5 })
    expect(r.gluteo!.origen).toBeUndefined()
  })

  it('el mismo día manda la de la sesión, y la anterior es la de OTRO día', () => {
    const r = agujetasPorZona(
      semanal({ 'agujetas.gluteo': [{ date: '2026-11-07', value: 1 }, { date: '2026-11-14', value: 2 }] }),
      [sesion('2026-11-12T08:00:00.000Z', { gluteo: 4 }, '2026-11-14T07:00:00.000Z')],
    )
    expect(r.gluteo).toMatchObject({ valor: 4, fecha: '2026-11-14', anterior: 1, origen: '48h' })
  })

  it('dos sesiones contestadas: la última, con la previa de anterior', () => {
    const r = agujetasPorZona(semanal({}), [
      sesion('2026-11-09T18:00:00.000Z', { cuadriceps: 4 }, '2026-11-11T18:00:00.000Z'),
      sesion('2026-11-12T18:00:00.000Z', { cuadriceps: 3 }, '2026-11-14T18:00:00.000Z'),
    ])
    expect(r.cuadriceps).toMatchObject({ valor: 3, anterior: 4, fecha: '2026-11-14', origen: '48h', deEscala10: false })
  })

  it('una lectura previa de hace más de 14 días no cuenta como anterior', () => {
    const r = agujetasPorZona(
      semanal({ 'agujetas.gluteo': [{ date: '2026-10-20', value: 4 }] }),
      [sesion('2026-11-12T18:00:00.000Z', { gluteo: 4 }, '2026-11-14T18:00:00.000Z')],
    )
    expect(r.gluteo).toMatchObject({ valor: 4, anterior: undefined })
  })

  it('una respuesta a 48 h tapa al DOM\'s 0-10 antiguo de esa zona, no al de las demás', () => {
    const r = agujetasPorZona(
      semanal({ 'doms.gluteo': [{ date: '2026-11-13', value: 8 }], 'doms.pecho': [{ date: '2026-11-13', value: 6 }] }),
      [sesion('2026-11-09T18:00:00.000Z', { gluteo: 2 }, '2026-11-11T18:00:00.000Z')],
    )
    expect(r.gluteo).toMatchObject({ valor: 2, deEscala10: false, origen: '48h' })
    expect(r.pectoral).toMatchObject({ valor: 3, deEscala10: true })
  })

  it('la vigencia de 7 días sigue igual para las dos fuentes', () => {
    const r = agujetasPorZona(semanal({}), [sesion('2026-11-05T18:00:00.000Z', { gluteo: 3 }, '2026-11-07T18:00:00.000Z')])
    expect(agujetasVigentes(r.gluteo!.fecha, '2026-11-14')).toBe(true)
    expect(agujetasVigentes(r.gluteo!.fecha, '2026-11-15')).toBe(false)
  })

  it('`hasta` deja fuera las respuestas a 48 h posteriores', () => {
    const sesiones = [sesion('2026-11-12T18:00:00.000Z', { gluteo: 5 }, '2026-11-14T18:00:00.000Z')]
    const serie = semanal({ 'agujetas.gluteo': [{ date: '2026-11-06', value: 2 }] })
    expect(agujetasPorZona(serie, sesiones, '2026-11-10').gluteo).toMatchObject({ valor: 2 })
    expect(agujetasPorZona(serie, sesiones, '2026-11-14').gluteo).toMatchObject({ valor: 5, anterior: 2 })
  })
})

describe('propuestaZona · cansancio por sesión (D6r)', () => {
  const base = { sensible: false, tipo: { sensibilidad: 'dinamico', velocidad: 'medio' } as const, esObjetivo: false, iem: 20, contexto: 'favorable' as const, agujetas: 1 }

  it('con 8 o más de media nombra la sesión y pide bajar ESA', () => {
    const p = propuestaZona({ ...base, fatigaPost: 8.5, sesionMasCansada: { etiqueta: 'la del jueves, Pierna A', valor: 9 } })
    expect(p.tono).toBe('mantener')
    expect(p.pct).toBeUndefined()
    expect(p.texto).toContain('8,5/10 de media')
    expect(p.texto).toContain('la del jueves, Pierna A: 9/10')
    expect(p.texto).toContain('de esa sesión')
  })

  it('sin detalle de sesión (cuestionario semanal) queda el aviso de siempre', () => {
    const p = propuestaZona({ ...base, fatigaPost: 9 })
    expect(p.texto).toBe('Sale muy cansado de las sesiones (9/10): no subir el IEM. Si puedes, baja el IF de la sesión manteniendo el IEM.')
  })

  it('por debajo de 8 de media no frena, aunque haya una sesión señalada', () => {
    const p = propuestaZona({ ...base, fatigaPost: 6.3, sesionMasCansada: { etiqueta: 'la del jueves, Pierna A', valor: 9 } })
    expect(p.tono).toBe('acelerar')
  })

  it('las agujetas de 4 o 5 siguen mandando por delante del cansancio', () => {
    expect(propuestaZona({ ...base, agujetas: 5, fatigaPost: 9, sesionMasCansada: { etiqueta: 'la del jueves', valor: 9 } }).bloqueante).toBe(true)
  })
})

/* Hipótesis del bloque (17-11-2026): entre subida y subida van 2 semanas
   sostenidas, y de la segunda subida en adelante se repiten los PUNTOS de la
   primera. Las subidas se deducen de lo programado, no se guardan. */
describe('subidasDeLaZona · deducidas de lo programado semana a semana', () => {
  it('sin cambios en lo programado no hay subidas ni meseta', () => {
    const r = subidasDeLaZona({ programado: [16, 16, 16], destino: 4 })
    expect(r.subidas).toEqual([])
    expect(r.primera).toBeNull()
    expect(r.semanasSostenidas).toBeNull()
    expect(r.enMeseta).toBe(false)
  })

  it('16 → 17,6 en la S3: una subida de 1,6 puntos; para la S4 está en meseta y para la S5 ya no', () => {
    const programado = [16, 16, 17.6, 17.6]
    const s4 = subidasDeLaZona({ programado, destino: 4 })
    expect(s4.primera).toEqual({ semana: 3, de: 16, a: 17.6, puntos: 1.6, pct: 10 })
    expect(s4.semanasSostenidas).toBe(1)
    expect(s4.enMeseta).toBe(true)
    const s5 = subidasDeLaZona({ programado, destino: 5 })
    expect(s5.semanasSostenidas).toBe(2)
    expect(s5.enMeseta).toBe(false)
  })

  it('solo mira las semanas anteriores a la que se programa', () => {
    expect(subidasDeLaZona({ programado: [16, 16, 17.6, 19.2], destino: 3 }).subidas).toEqual([])
  })

  it('una descarga en medio no cuenta ni como bajada, ni como subida al volver, ni como semana sostenida', () => {
    // S3 sube, S4 descarga (mitad), S5 vuelve al nivel de la S3.
    const r = subidasDeLaZona({ programado: [16, 16, 17.6, 8.8, 17.6], destino: 5, semanasFuera: [4] })
    expect(r.subidas.map(x => x.semana)).toEqual([3])
    expect(r.semanasSostenidas).toBe(1)
    expect(r.enMeseta).toBe(true)
  })

  it('volver a donde estaba después de un freno no es una subida', () => {
    const r = subidasDeLaZona({ programado: [16, 13, 16, 17.6], destino: 5 })
    expect(r.subidas).toHaveLength(1)
    expect(r.primera).toMatchObject({ semana: 4, de: 16, puntos: 1.6 })
  })

  it('con la semana 1 reducida, la vuelta de la S2 no cuenta como subida', () => {
    const meso = { semana1Reducida: true, semanasDescarga: [6], semanasPivot: [9] }
    expect(semanasFueraDeSubidas(meso)).toEqual([1, 6, 9])
    expect(semanasFueraDeSubidas({ vuelveDeParon: true })).toEqual([1])
    expect(semanasFueraDeSubidas({})).toEqual([])
    const r = subidasDeLaZona({ programado: [14.9, 16, 16], destino: 4, semanasFuera: semanasFueraDeSubidas(meso) })
    expect(r.subidas).toEqual([])
  })

  it('un redondeo no es una subida: hace falta medio punto y un 3 %', () => {
    expect(subidasDeLaZona({ programado: [16, 16.3], destino: 3 }).subidas).toEqual([])
    expect(subidasDeLaZona({ programado: [40, 40.8], destino: 3 }).subidas).toEqual([]) // 0,8 puntos, pero un 2 %
    expect(subidasDeLaZona({ programado: [16, 16.6], destino: 3 }).subidas).toHaveLength(1)
  })

  it('dos subidas: la primera manda los puntos y la última, la meseta', () => {
    const r = subidasDeLaZona({ programado: [16, 17.6, 17.6, 19.2], destino: 5 })
    expect(r.subidas.map(x => [x.semana, x.puntos])).toEqual([[2, 1.6], [4, 1.6]])
    expect(r.primera?.semana).toBe(2)
    expect(r.ultima?.semana).toBe(4)
    expect(r.enMeseta).toBe(true)
  })
})

describe('propuestaZona · meseta y puntos', () => {
  const base = { sensible: false, tipo: { sensibilidad: 'dinamico', velocidad: 'suave' } as const, esObjetivo: true, contexto: 'favorable' as const, agujetas: 1 }

  it('sin `subidas` todo sigue como antes: el % de la velocidad', () => {
    const p = propuestaZona({ ...base, iem: 17.6 })
    expect(p.tono).toBe('acelerar')
    expect(p.pct).toBe(10)
    expect(p.puntos).toBeUndefined()
    expect(p.texto).toContain('~10 %')
  })

  it('subió la semana pasada: no acelera, mantiene y lo dice', () => {
    const subidas = subidasDeLaZona({ programado: [16, 16, 17.6], destino: 4 })
    const p = propuestaZona({ ...base, iem: 17.6, subidas })
    expect(p.tono).toBe('mantener')
    expect(p.enMeseta).toBe(true)
    expect(p.pct).toBeUndefined()
    expect(p.texto).toBe('Mantener: lleva una semana en el nivel nuevo y entre subida y subida van 2 sostenidas como mínimo.')
  })

  it('con 2 semanas sostenidas vuelve a subir, y repite los PUNTOS de la primera, no el 10 %', () => {
    const subidas = subidasDeLaZona({ programado: [16, 16, 17.6, 17.6], destino: 5 })
    const p = propuestaZona({ ...base, iem: 17.6, subidas })
    expect(p.tono).toBe('acelerar')
    expect(p.enMeseta).toBeUndefined()
    expect(p.puntos).toBe(1.6)
    expect(p.pct).toBe(9) // 1,6 sobre 17,6; el 10 % habrían sido 1,76
    expect(p.iemPropuesto).toBe(19.2)
    expect(p.texto).toContain('+1,6 puntos (~9 %)')
    expect(p.texto).toContain('se repiten los puntos de la primera subida del bloque (S3), no el porcentaje')
  })

  it('con el contexto en contra, la mitad de los puntos', () => {
    const subidas = subidasDeLaZona({ programado: [16, 16, 17.6, 17.6], destino: 5 })
    const p = propuestaZona({ ...base, contexto: 'neutro', iem: 17.6, subidas })
    expect(p.puntos).toBe(0.8)
    expect(p.pct).toBe(5)
  })

  it('si la primera subida fue un salto a mano, no se repite: manda el % de la velocidad', () => {
    const subidas = subidasDeLaZona({ programado: [16, 16, 22, 22], destino: 5 }) // +6 puntos
    const p = propuestaZona({ ...base, iem: 22, subidas })
    expect(p.pct).toBe(10)
    expect(p.puntos).toBe(2.2)
  })

  it('los puntos tampoco pasan del objetivo de la zona', () => {
    const subidas = subidasDeLaZona({ programado: [16, 16, 17.6, 17.6], destino: 5 })
    const p = propuestaZona({ ...base, iem: 17.6, objetivo: 18.5, subidas })
    expect(p.pct).toBe(5)
    expect(p.puntos).toBe(0.9)
    expect(p.iemPropuesto).toBeLessThanOrEqual(18.5)
    expect(p.texto).toContain('hasta su objetivo de 18,5')
  })

  it('el objetivo como techo va por delante de la meseta, y los frenos por delante de todo', () => {
    const enMeseta = subidasDeLaZona({ programado: [16, 16, 17.6], destino: 4 })
    expect(propuestaZona({ ...base, iem: 17.6, objetivo: 17.6, subidas: enMeseta }).tono).toBe('objetivo')
    expect(propuestaZona({ ...base, agujetas: 5, iem: 17.6, subidas: enMeseta }).bloqueante).toBe(true)
    expect(propuestaZona({ ...base, agujetas: 4, iem: 17.6, subidas: enMeseta }).tono).toBe('freno')
    expect(propuestaZona({ ...base, fatigaPost: 9, iem: 17.6, subidas: enMeseta }).enMeseta).toBeUndefined()
  })

  it('base alta: sigue el tope del 10 % aunque los puntos de la primera fueran más', () => {
    const subidas = subidasDeLaZona({ programado: [90, 90, 108, 108], destino: 5 }) // +18 puntos
    const p = propuestaZona({ ...base, tipo: { sensibilidad: 'dinamico', velocidad: 'agresivo' }, iem: 108, subidas })
    expect(p.pct).toBe(10)
    expect(p.texto).toContain('base alta')
  })
})
