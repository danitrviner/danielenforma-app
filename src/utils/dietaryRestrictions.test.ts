import { describe, it, expect } from 'vitest';
import { violatesRestrictions, restrictionLabel } from './dietaryRestrictions';

describe('violatesRestrictions', () => {
  it('excluye una receta con carne para un atleta vegano', () => {
    expect(violatesRestrictions([55, 68], 'vegano')).toBe(true);
  });

  it('excluye una receta con carne/pescado para un atleta vegetariano', () => {
    expect(violatesRestrictions([67], 'vegetariano')).toBe(true);
  });

  it('no excluye una receta apta aunque tenga otras restricciones', () => {
    // Prohibida para celíacos, pero eso no afecta a un atleta vegano.
    expect(violatesRestrictions([66], 'vegano')).toBe(false);
  });

  it('no dice nada de las recetas que aún no tienen restrictions (import antiguo)', () => {
    expect(violatesRestrictions(undefined, 'vegano')).toBe(false);
    expect(violatesRestrictions([], 'vegano')).toBe(false);
  });

  it('no filtra nada para omnívoro/otro', () => {
    expect(violatesRestrictions([55, 67], 'omnivoro')).toBe(false);
    expect(violatesRestrictions([55, 67], 'otro')).toBe(false);
  });

  it('etiqueta un código conocido', () => {
    expect(restrictionLabel(66)).toBe('Celiaquía');
  });

  it('no revienta con un código desconocido', () => {
    expect(restrictionLabel(999)).toContain('999');
  });
});
