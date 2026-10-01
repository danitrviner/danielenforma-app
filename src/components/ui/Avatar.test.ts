import { describe, expect, it } from 'vitest';
import { esFotoDeStock } from './Avatar';

describe('esFotoDeStock', () => {
  it('reconoce el retrato de stock que se ponía por defecto', () => {
    expect(esFotoDeStock('https://lh3.googleusercontent.com/aida-public/AB6AXuCYz2_Air0')).toBe(true);
  });
  it('no toca fotos reales ni vacío', () => {
    expect(esFotoDeStock('https://firebasestorage.googleapis.com/v0/b/x/o/avatar.jpg')).toBe(false);
    expect(esFotoDeStock('')).toBe(false);
    expect(esFotoDeStock(undefined)).toBe(false);
  });
});
