import { describe, it, expect } from 'vitest';
import { tamanoQueCabe } from './useTamanoQueCabe';

const ESCALA = { max: 24, min: 17, largo: 19 };

describe('tamaño del título que cabe en una línea', () => {
  it('un nombre corto va al máximo', () => {
    // 600 px a 100 px de letra → a 24 px mide 144: cabe de sobra en 300.
    expect(tamanoQueCabe(600, 300, ESCALA)).toEqual({ px: 24, unaLinea: true });
  });

  it('uno medio encoge lo justo para caber en una línea', () => {
    // 1500 px a 100 → en 300 px cabe a 19,9 → 19,5 (medios px hacia abajo).
    expect(tamanoQueCabe(1500, 300, ESCALA)).toEqual({ px: 19.5, unaLinea: true });
  });

  it('uno largo no encoge por debajo del mínimo: se parte en líneas a 19', () => {
    expect(tamanoQueCabe(3000, 300, ESCALA)).toEqual({ px: 19, unaLinea: false });
  });

  it('sin medidas, el máximo y sin forzar una línea', () => {
    expect(tamanoQueCabe(0, 300, ESCALA)).toEqual({ px: 24, unaLinea: false });
  });
});
