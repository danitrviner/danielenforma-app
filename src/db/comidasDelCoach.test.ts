import { describe, it, expect } from 'vitest';
import type { Recipe } from '../types';
import { conComidasDelCoach } from './recipes';

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

