import { describe, it, expect } from 'vitest'
import { atributosDeEjercicio } from './atributosEjercicio.mjs'

const a = (n: string) => atributosDeEjercicio(n) as { equipment: string[]; lateralidad: string; goma: boolean; guiado: boolean }

describe('atributosDeEjercicio', () => {
  it('reconoce el material nombrado', () => {
    expect(a('Press banca plano con mancuernas').equipment).toEqual(['mancuernas', 'banco'])
    expect(a('Zancadas bazoka en multipower (dominante rodilla)').equipment).toContain('multipower')
    expect(a('Jalón dinámico en polea alta agarre medio neutro straps').equipment).toEqual(['polea'])
    expect(a('Prensa horizontal pies abajo').equipment).toEqual(['máquina'])
  })
  it('un levantamiento sin implemento nombrado es de barra', () => {
    expect(a('Peso muerto convencional con déficit').equipment).toEqual(['barra'])
    expect(a('Press banca plano medium grip (caja torácica amplia)').equipment).toEqual(['barra', 'banco'])
  })
  it('un levantamiento con otro implemento no es de barra', () => {
    expect(a('Press banca plano en multipower').equipment).not.toContain('barra')
    expect(a('Peso muerto rumano con mancuernas').equipment).not.toContain('barra')
  })
  it('la goma suma material y activa el atributo', () => {
    const r = a('Peso muerto sumo + goma (40-50 kg)')
    expect(r.equipment).toEqual(['barra', 'gomas'])
    expect(r.goma).toBe(true)
  })
  it('lateralidad: unilateral por el nombre, bilateral si no', () => {
    expect(a('Hip thrust unilateral máxima aceleración').lateralidad).toBe('uni')
    expect(a('Sentadilla búlgara con mancuernas').lateralidad).toBe('uni')
    expect(a('Press banca plano con mancuernas').lateralidad).toBe('bi')
  })
  it('guiado solo en máquina y multipower', () => {
    expect(a('Fondos en máquina dominante codo').guiado).toBe(true)
    expect(a('Sentadilla en multipower').guiado).toBe(true)
    expect(a('Jalón en polea alta').guiado).toBe(false)
  })
  it('«straps» son correas de muñeca, no polea', () => {
    expect(a('Peso muerto rumano straps').equipment).toEqual(['barra'])
    expect(a('Remo unilateral en máquina pendular straps').equipment).toEqual(['máquina'])
  })
  it('«dorsiflexión» o «flexión de rodilla» no son flexiones de brazos', () => {
    expect(a('Prensa horizontal pies abajo (mayor dorsiflexión)').equipment).toEqual(['máquina'])
    expect(a('Peso muerto convencional (mayor flexión rodilla)').equipment).toEqual(['barra'])
    expect(a('Flexiones inclinadas').equipment).toEqual(['peso corporal'])
  })
  it('sin material reconocible devuelve lista vacía', () => {
    expect(a('Rotación de hombro codo pegado').equipment).toEqual([])
  })
})
