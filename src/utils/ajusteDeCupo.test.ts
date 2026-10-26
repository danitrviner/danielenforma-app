import { describe, it, expect } from 'vitest';
import { ajustarObjetivoSinTocarProteina } from './ajusteDeCupo';

describe('ajustarObjetivoSinTocarProteina (gramos, 10-2026)', () => {
  const objetivo = { kcal: 2230, p: 150, hc: 250, g: 70 };

  it('baja a las kcal de la fase sin tocar la proteína', () => {
    const r = ajustarObjetivoSinTocarProteina(objetivo, 1900)!;
    expect(r.objetivo.p).toBe(150);
    expect(Math.abs(r.objetivo.kcal - 1900)).toBeLessThanOrEqual(10);
    expect(r.objetivo.hc).toBeLessThan(250);
    expect(r.objetivo.g).toBeLessThan(70);
  });

  it('si la proteína sola se pasa, deja hidratos y grasa a cero y lo dice', () => {
    const r = ajustarObjetivoSinTocarProteina(objetivo, 500)!;
    expect(r.objetivo).toEqual({ kcal: 600, p: 150, hc: 0, g: 0 });
    expect(r.kcalSinColocar).toBe(100);
  });

  it('sin objetivo no hace nada', () => {
    expect(ajustarObjetivoSinTocarProteina({ kcal: 0, p: 0, hc: 0, g: 0 }, 2000)).toBeNull();
    expect(ajustarObjetivoSinTocarProteina(objetivo, 0)).toBeNull();
  });
});
