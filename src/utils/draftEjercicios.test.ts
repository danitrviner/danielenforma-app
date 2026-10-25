import { describe, it, expect } from 'vitest';
import type { Exercise } from '../types';
import {
  alternarEnDraft, moverEnDraft, catalogoParaGrupo, ejerciciosSugeridos,
  conNombreDeSesion, nombrePropioDeSesion, resumenDeMaterial,
} from './draftEjercicios';

const ex = (id: string, muscleGroup: Exercise['muscleGroup'] = 'pecho') =>
  ({ id, name: id, muscleGroup }) as Exercise;

describe('draft de ejercicios', () => {
  it('alterna: añade al final y quita; un grupo vacío desaparece', () => {
    let d = alternarEnDraft(undefined, 'pecho', 'a');
    d = alternarEnDraft(d, 'pecho', 'b');
    expect(d.pecho).toEqual(['a', 'b']);
    d = alternarEnDraft(d, 'pecho', 'a');
    d = alternarEnDraft(d, 'pecho', 'b');
    expect('pecho' in d).toBe(false);
  });

  it('mueve dentro del grupo y no se sale por los extremos', () => {
    const d = { pecho: ['a', 'b', 'c'] };
    expect(moverEnDraft(d, 'pecho', 'c', -1).pecho).toEqual(['a', 'c', 'b']);
    expect(moverEnDraft(d, 'pecho', 'a', -1).pecho).toEqual(['a', 'b', 'c']);
    expect(moverEnDraft(d, 'pecho', 'c', 1).pecho).toEqual(['a', 'b', 'c']);
  });

  it('restringe el catálogo al draft, en su orden, y cae al completo si no hay nada válido', () => {
    const cat = [ex('a'), ex('b'), ex('c')];
    expect(catalogoParaGrupo(cat, { pecho: ['c', 'a'] }, 'pecho').map(e => e.id)).toEqual(['c', 'a']);
    expect(catalogoParaGrupo(cat, undefined, 'pecho')).toBe(cat);
    expect(catalogoParaGrupo(cat, { pecho: ['borrado'] }, 'pecho')).toBe(cat);
    expect(catalogoParaGrupo(cat, { espalda: ['a'] } as never, 'pecho')).toBe(cat);
  });

  it('sugiere ejercicios según el tope de series por ejercicio', () => {
    expect(ejerciciosSugeridos(0)).toBe(0);
    expect(ejerciciosSugeridos(4)).toBe(1);
    expect(ejerciciosSugeridos(14)).toBe(4);
  });

  it('nombres de sesión: conserva los demás y trata vacío como «sin nombre»', () => {
    const n = conNombreDeSesion(['Torso A'], 2, 'Brazos', 4);
    expect(n).toEqual(['Torso A', '', 'Brazos', '']);
    expect(nombrePropioDeSesion(n, 1)).toBeUndefined();
    expect(nombrePropioDeSesion(n, 2)).toBe('Brazos');
    expect(nombrePropioDeSesion(undefined, 0)).toBeUndefined();
  });
});

describe('resumen del material (12-e)', () => {
  const conEq = (id: string, equipment: string[], muscleGroup: Exercise['muscleGroup'] = 'pecho') => ({ ...ex(id, muscleGroup), equipment }) as Exercise;
  const catalogo = [conEq('press', ['maquina']), conEq('apert', ['mancuernas']), conEq('flex', []), conEq('remo', ['maquina'], 'dorsal')];

  it('cuenta los de los grupos del bloque que su material no cubre', () => {
    expect(resumenDeMaterial(['Mancuernas', ' '], catalogo, ['pecho'])).toEqual({ material: ['Mancuernas'], noEncajan: 1 });
  });
  it('«Gimnasio completo» lo cubre todo', () => {
    expect(resumenDeMaterial(['Gimnasio completo'], catalogo, ['pecho', 'dorsal']).noEncajan).toBe(0);
  });
  it('sin material en el alta no cuenta nada', () => {
    expect(resumenDeMaterial([], catalogo, ['pecho'])).toEqual({ material: [], noEncajan: 0 });
  });
});
