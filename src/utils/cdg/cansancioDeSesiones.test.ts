import { describe, it, expect } from 'vitest'
import { cansancioDeSesiones, etiquetaDeSesion } from './senalesPorSemana'

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

describe('etiquetaDeSesion', () => {
  it('dice el día y, si lo hay, el nombre de la rutina', () => {
    expect(etiquetaDeSesion('2026-11-12', 'Pierna A')).toBe('la del jueves, Pierna A')
    expect(etiquetaDeSesion('2026-11-15')).toBe('la del domingo')
    expect(etiquetaDeSesion('2026-11-11', '  ')).toBe('la del miércoles')
  })
})
