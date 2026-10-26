import { describe, expect, it } from 'vitest';
import {
  kcalDeGramos, macrosDesdeGramos, sumarMacros, restarMacros, escalarMacros, redondearMacros, sinNegativos, sonMacrosVacios, MACROS_CERO,
} from './macros';

describe('macros', () => {
  it('las kcal de un objetivo salen de sus gramos (4/4/9)', () => {
    expect(kcalDeGramos({ p: 150, hc: 250, g: 70 })).toBe(150 * 4 + 250 * 4 + 70 * 9);
    expect(macrosDesdeGramos(150, 250, 70)).toEqual({ kcal: 2230, p: 150, hc: 250, g: 70 });
  });

  it('suma, resta y escala campo a campo', () => {
    const a = { kcal: 500, p: 30, hc: 60, g: 15 };
    const b = { kcal: 200, p: 10, hc: 20, g: 8 };
    expect(sumarMacros(a, b)).toEqual({ kcal: 700, p: 40, hc: 80, g: 23 });
    expect(sumarMacros()).toEqual(MACROS_CERO);
    expect(restarMacros(b, a)).toEqual({ kcal: -300, p: -20, hc: -40, g: -7 });
    expect(escalarMacros(a, 0.5)).toEqual({ kcal: 250, p: 15, hc: 30, g: 7.5 });
  });

  it('redondea kcal a entero y gramos a un decimal', () => {
    expect(redondearMacros({ kcal: 99.5, p: 12.345, hc: 0.04, g: 7.96 })).toEqual({ kcal: 100, p: 12.3, hc: 0, g: 8 });
  });

  it('lo que queda nunca baja de cero para buscar recetas', () => {
    expect(sinNegativos({ kcal: -50, p: 10, hc: -3, g: 0 })).toEqual({ kcal: 0, p: 10, hc: 0, g: 0 });
  });

  it('vacío = sin nada que contar', () => {
    expect(sonMacrosVacios(null)).toBe(true);
    expect(sonMacrosVacios(MACROS_CERO)).toBe(true);
    expect(sonMacrosVacios({ kcal: 0, p: 5, hc: 0, g: 0 })).toBe(false);
  });
});
