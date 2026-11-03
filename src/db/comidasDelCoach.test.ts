import { describe, it, expect } from 'vitest';
import type { Recipe } from '../types';
import { conComidasDelCoach, sinBocadillosEnDesayuno } from './recipes';

/* Las comidas que elige el coach para una receta mandan sobre las del recetario
   (11-2026): el bocadillo de hamburguesa deja de salir en desayunos. */
describe('conComidasDelCoach', () => {
  const r = (id: string, intakeTypes: number[]) => ({ id, name: id, intakeTypes }) as Recipe;
  const indice = [r('bocadillo', [1, 3]), r('avena', [1])];

  it('cambia solo las recetas que ha tocado el coach', () => {
    const out = conComidasDelCoach(indice, { comidas: { bocadillo: [3, 5] } });
    expect(out[0].intakeTypes).toEqual([3, 5]);
    expect(out[1]).toBe(indice[1]);
  });

  it('sin cambios devuelve el mismo índice; una lista vacía la deja sin comida', () => {
    expect(conComidasDelCoach(indice, {})).toBe(indice);
    expect(conComidasDelCoach(indice, { comidas: { avena: [] } })[1].intakeTypes).toEqual([]);
  });
});

describe('sinBocadillosEnDesayuno', () => {
  const r = (id: string, name: string, intakeTypes: number[]) => ({ id, name, intakeTypes }) as Recipe;

  it('quita el desayuno a bocadillos y wraps, y deja lo demás igual', () => {
    const indice = [r('b', 'Bocadillo de jamón cocido', [1, 2, 4]), r('w', 'Wrap de atún', [1, 3]), r('t', 'Tostada de aguacate', [1, 2])];
    const out = sinBocadillosEnDesayuno(indice);
    expect(out[0].intakeTypes).toEqual([2, 4]);
    expect(out[1].intakeTypes).toEqual([3]);
    expect(out[2]).toBe(indice[2]);
  });

  it('si solo era de desayuno pasa a media mañana y merienda; y el coach manda después', () => {
    const [solo] = sinBocadillosEnDesayuno([r('b', 'Bocadillo de lomo', [1])]);
    expect(solo.intakeTypes).toEqual([2, 4]);
    expect(conComidasDelCoach([solo], { comidas: { b: [1] } })[0].intakeTypes).toEqual([1]);
  });
});
