import { describe, expect, it } from 'vitest'
import catalogoPrueba from './__fixtures__/catalogoPrueba.json'
import { crearMotor, expandirCatalogo, type CdgCatalogoCompacto } from './index'
import { proponerProgresionIem, aplicarOperaciones, rendimientoEstancado, semanasSinMejorar, segundosDeUnaSerie, type EjercicioProgramable } from './progresionIem'
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

  it('la técnica solo si se permite, en aislamiento y cuando la serie no cabe en la sesión (Dani, 25-10)', () => {
    const b = base()
    const r = proponerProgresionIem({
      motor, nombreCdgDe, ejercicios: dia(), iemBase: { pectoral: b }, pctPorZona: { pectoral: 60 },
      palancas: { rir: false, series: true, tecnica: true }, tiempo: { limiteSeg: 100, porDia: { 'Empuje A': 100 } },
    })
    expect(r.cambios.map(c => c.clave)).toEqual(['A:peck'])
    expect(proponerProgresionIem({
      motor, nombreCdgDe, ejercicios: dia(), iemBase: { pectoral: b }, pctPorZona: { pectoral: 60 },
      palancas: { rir: false, series: false, tecnica: true },
    }).cambios).toEqual([])
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

describe('13-h · tiempo de sesión, técnica y rendimiento (Dani, 25-10)', () => {
  const base = () => proponerProgresionIem({ motor, nombreCdgDe, ejercicios: dia(), iemBase: { pectoral: 1 }, pctPorZona: { pectoral: 1 } }).zonas[0].antes

  it('si la serie de más no cabe en la sesión, sube intensidad (RIR) en vez de series', () => {
    const b = base()
    const sinTiempo = proponerProgresionIem({
      motor, nombreCdgDe, ejercicios: dia(), iemBase: { pectoral: b }, pctPorZona: { pectoral: 30 },
      tiempo: { limiteSeg: 3600, porDia: { 'Empuje A': 3600 } },
    })
    expect(sinTiempo.cambios.length).toBeGreaterThan(0)
    expect(sinTiempo.cambios.every(c => c.op.tipo === 'rir')).toBe(true)
  })

  it('con tiempo de sobra puede añadir serie y bajar RIR en el mismo ejercicio', () => {
    const b = base()
    const r = proponerProgresionIem({
      motor, nombreCdgDe, ejercicios: dia(), iemBase: { pectoral: b }, pctPorZona: { pectoral: 60 },
      tiempo: { limiteSeg: 99999, porDia: { 'Empuje A': 0 } },
    })
    const porEj = new Map<string, Set<string>>()
    for (const c of r.cambios) porEj.set(c.clave, new Set([...(porEj.get(c.clave) ?? []), c.op.tipo]))
    expect([...porEj.values()].some(t => t.has('rir') && t.has('serie'))).toBe(true)
  })

  it('la técnica no sube el IEM por su cuenta: solo se sugiere cuando la serie no cabe, y lo marca', () => {
    const b = base()
    const conTiempo = proponerProgresionIem({
      motor, nombreCdgDe, ejercicios: dia(), iemBase: { pectoral: b }, pctPorZona: { pectoral: 60 }, palancas: { tecnica: true },
      tiempo: { limiteSeg: 99999, porDia: {} },
    })
    expect(conTiempo.cambios.some(c => c.op.tipo === 'tecnica')).toBe(false)
    const sinTiempo = proponerProgresionIem({
      motor, nombreCdgDe, ejercicios: dia().map(x => ({ ...x, we: { ...x.we, rir: 0 } })), iemBase: { pectoral: b }, pctPorZona: { pectoral: 60 }, palancas: { tecnica: true },
      tiempo: { limiteSeg: 100, porDia: { 'Empuje A': 100 } },
    })
    const tecnicas = sinTiempo.cambios.filter(c => c.op.tipo === 'tecnica')
    expect(tecnicas.length).toBeGreaterThan(0)
    expect(tecnicas.every(c => c.porTiempo)).toBe(true)
  })

  it('una serie de más cuesta su descanso y ~45 s', () => {
    expect(segundosDeUnaSerie(we('press', 3, 2))).toBe(135)
  })

  it('aviso de rendimiento: dos semanas sin mejorar el tonelaje mientras sube la carga', () => {
    expect(rendimientoEstancado([1000, 980, 950], [50, 55, 60])).toBe(true)
    expect(rendimientoEstancado([1000, 1050, 950], [50, 55, 60])).toBe(false) // una sola semana mala
    expect(rendimientoEstancado([1000, 980, 950], [60, 55, 50])).toBe(false) // bajando carga, es lo esperable
    expect(rendimientoEstancado([1000, 980], [50, 55])).toBe(false) // poca historia
  })

  it('cuenta las semanas seguidas sin mejorar: 2 = vigilar, 3 = plantearse bajar (Dani: 2-3 semanas)', () => {
    expect(semanasSinMejorar([1000, 980, 950], [50, 55, 60])).toBe(2)
    expect(semanasSinMejorar([900, 1000, 990, 980, 970], [40, 50, 55, 60, 60])).toBe(3)
    expect(semanasSinMejorar([1000, 1000, 1000], [50, 50, 50])).toBe(0) // sin subir carga no avisa
    expect(semanasSinMejorar([1000, 1100], [50, 55])).toBe(0)
  })
})
