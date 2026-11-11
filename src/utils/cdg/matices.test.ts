import { describe, it, expect } from 'vitest'
import catalogoPrueba from './__fixtures__/catalogoPrueba.json'
import { crearMotor, expandirCatalogo, type CdgCatalogoCompacto } from './index'
import { fichaPorSerie } from './fichaEjercicio'
import { unirPropios } from './propios'
import { actualizarPropio, comparar, conCambio, crearVariante, cuentaComoUnilateral, nombreDeVariante, resultadoReferencia, esPropio } from './matices'

const cat = catalogoPrueba as CdgCatalogoCompacto
const jsonCat = JSON.stringify(cat)
const todos = expandirCatalogo(cat)
const FRANCES = 'Press francés con mancuernas - Tríceps'
const frances = todos.find(e => e.exercise === FRANCES)!

describe('resultadoReferencia', () => {
  it('coincide con la ficha (mismo motor, misma serie)', () => {
    const r = resultadoReferencia(frances)
    const f = fichaPorSerie(crearMotor(todos), FRANCES)
    expect(r.IF).toBeCloseTo(f.IF)
    expect(r.IEMTotal).toBeCloseTo(f.IEMTotal)
  })
  it('menos inestabilidad baja el IF y no toca el IEM', () => {
    const antes = resultadoReferencia(frances)
    const despues = resultadoReferencia(conCambio(frances, { tipo: 'inestabilidad', valor: 0 }))
    expect(despues.IF).toBeLessThan(antes.IF)
    expect(despues.IEMTotal).toBeCloseTo(antes.IEMTotal)
  })
  it('subir un músculo sube el IEM', () => {
    const i = frances.muscleStress.findIndex(m => m.muscle === 'Triceps cabeza larga')
    const mas = conCambio(frances, { tipo: 'musculo', i, valor: frances.muscleStress[i].value + 0.2 })
    expect(resultadoReferencia(mas).IEMTotal).toBeGreaterThan(resultadoReferencia(frances).IEMTotal)
  })
  it('acota valores fuera de rango', () => {
    expect(conCambio(frances, { tipo: 'inestabilidad', valor: -3 }).inestability).toBe(0)
    expect(conCambio(frances, { tipo: 'articulacion', i: 0, valor: 9 }).jointStress[0].value).toBe(2)
  })
})

describe('comparar', () => {
  it('da la diferencia por músculo y los dos resultados', () => {
    const apoyado = conCambio(frances, { tipo: 'inestabilidad', valor: 0.4 })
    const c = comparar(frances, apoyado)
    expect(c.musculos).toHaveLength(33)
    expect(c.articulaciones).toHaveLength(11)
    expect(c.inestabilidad.dif).toBeCloseTo(0.4 - Number(frances.inestability))
    expect(c.ref.b.IF).toBeLessThan(c.ref.a.IF)
  })
})

describe('propios: variante y edición', () => {
  it('nombre de la variante conserva los músculos y lleva (propio)', () => {
    expect(nombreDeVariante(FRANCES, 'Press francés apoyado')).toBe('Press francés apoyado - Tríceps (propio)')
  })
  it('crear variante → unirPropios la acepta y es editable', () => {
    const v = crearVariante(null, jsonCat, frances, 'Press francés apoyado', 'sys_x')
    const unido = expandirCatalogo(JSON.parse(unirPropios(jsonCat, v.json)))
    const nuevo = unido.find(e => e.exercise === v.nombre)!
    expect(nuevo).toBeDefined()
    expect(esPropio(nuevo)).toBe(true)
    const editado = actualizarPropio(v.json, jsonCat, conCambio(nuevo, { tipo: 'inestabilidad', valor: 0.4 }))
    const tras = JSON.parse(editado.json).exercises[0]
    expect(tras.inestability).toBe(0.4)
    expect(tras.base).toBe(FRANCES)
    expect(tras.appId).toBe('sys_x')
    expect(JSON.parse(unirPropios(jsonCat, editado.json)).exercises).toHaveLength(cat.exercises.length + 1)
  })
  it('no deja editar uno del Excel ni repetir nombre', () => {
    expect(() => actualizarPropio(null, jsonCat, frances)).toThrow(/no es un ejercicio propio/)
    const v = crearVariante(null, jsonCat, frances, 'Press francés apoyado')
    expect(() => crearVariante(v.json, jsonCat, frances, 'Press francés apoyado')).toThrow(/Ya existe/)
    expect(() => crearVariante(null, jsonCat, frances, '  ')).toThrow(/Falta/)
  })
})

it('unilateral solo cuenta en minúscula (réplica del motor: afecta al tiempo)', () => {
  expect(cuentaComoUnilateral('Extensiones de tríceps unilateral en polea alta - Tríceps')).toBe(true)
  expect(cuentaComoUnilateral('Unilateral remo')).toBe(false)
})
