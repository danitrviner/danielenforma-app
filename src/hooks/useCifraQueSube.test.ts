import { describe, expect, it } from 'vitest';

/* La curva de la cuenta atrás está dentro del hook, así que se prueba lo que
   de verdad puede romperse: que la interpolación empiece en 0, termine EXACTO
   en el objetivo (una cifra que se queda en 6.239 de 6.240 canta), y que no
   se pase por el camino. */
function suave(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
function valorEn(objetivo: number, t: number): number {
  return objetivo * suave(t);
}

describe('la curva de la cifra que sube', () => {
  it('empieza en cero y acaba EXACTO en el objetivo', () => {
    expect(valorEn(6240, 0)).toBe(0);
    expect(valorEn(6240, 1)).toBe(6240);
  });

  it('nunca se pasa del objetivo por el camino', () => {
    for (let t = 0; t <= 1; t += 0.05) {
      expect(valorEn(6240, t)).toBeLessThanOrEqual(6240);
    }
  });

  it('arranca rápido y frena: a mitad de tiempo ya va por más de la mitad', () => {
    expect(suave(0.5)).toBeGreaterThan(0.5);
  });

  it('con un objetivo de cero no da NaN', () => {
    expect(valorEn(0, 0.5)).toBe(0);
  });
});
