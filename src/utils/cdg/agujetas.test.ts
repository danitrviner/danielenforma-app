import { describe, it, expect } from 'vitest'
import { agujetasPorZona, agujetasDeSesiones, agujetasVigentes, origenDeLectura, propuestaZona, type SesionConAgujetas } from './agujetas'

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
