import { describe, it, expect, vi } from 'vitest';
import { dejarBorradorDeDieta, recogerBorradorDeDieta, hayBorradorDeDieta } from './borradorDieta';
import type { Diet } from '../types';

/* El buzón es de un solo uso a propósito: si el borrador se quedara puesto,
   volver a la pestaña de dietas por cualquier otro motivo reabriría una
   propuesta que Dani ya había dejado. */

const dieta = (name: string): Omit<Diet, 'id'> => ({
  athleteId: 'ana@x.com', name, budget: { HC: 8, PROT: 6, GRASA: 4, MIX_HC: 0, MIX_GRASA: 0 }, meals: [],
} as unknown as Omit<Diet, 'id'>);

describe('borradorDieta', () => {
  it('lo recoge quien lo pidió, y solo una vez', () => {
    dejarBorradorDeDieta({ proposalId: 'p1', athleteEmail: 'ana@x.com', diet: dieta('Déficit') });
    expect(hayBorradorDeDieta('ana@x.com')).toBe(true);
    expect(recogerBorradorDeDieta('ana@x.com')?.proposalId).toBe('p1');
    expect(recogerBorradorDeDieta('ana@x.com')).toBeNull();
  });

  it('no se lo lleva otro atleta, y además lo tira: no puede reaparecer luego', () => {
    dejarBorradorDeDieta({ proposalId: 'p2', athleteEmail: 'ana@x.com', diet: dieta('Volumen') });
    expect(recogerBorradorDeDieta('luis@x.com')).toBeNull();
    // Antes seguía ahí y se abría solo al volver a Dietas de Ana horas después.
    expect(recogerBorradorDeDieta('ana@x.com')).toBeNull();
  });

  it('caduca a los cinco minutos', () => {
    vi.useFakeTimers();
    try {
      dejarBorradorDeDieta({ proposalId: 'p3', athleteEmail: 'ana@x.com', diet: dieta('Mantenimiento') });
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);
      expect(hayBorradorDeDieta('ana@x.com')).toBe(false);
      expect(recogerBorradorDeDieta('ana@x.com')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
