import { describe, it, expect } from 'vitest';
import { ajustarCupoSinTocarProteina } from './ajusteDeCupo';
import { exchangeToKcal } from './nutritionConstants';

// 10 HC / 7 PROT / 4 GRASA = 1000 + 700 + 396 = 2096 kcal.
const CUPO = { HC: 10, PROT: 7, GRASA: 4 };

describe('ajustarCupoSinTocarProteina', () => {
  it('en déficit, la proteína NO se toca', () => {
    const r = ajustarCupoSinTocarProteina(CUPO, 1700)!;
    expect(r.cupo.PROT).toBe(CUPO.PROT);
    expect(r.cupo.HC).toBeLessThan(CUPO.HC);
    expect(r.cupo.GRASA).toBeLessThan(CUPO.GRASA);
  });

  it('lo que el escalado plano se llevaba: comparación directa', () => {
    // El escalado de antes: factor 1700/2096 aplicado también a la proteína.
    const escalaPlana = 1700 / exchangeToKcal(CUPO);
    const protPlana = CUPO.PROT * escalaPlana;
    expect(protPlana).toBeLessThan(6);          // perdía más de un intercambio
    expect(ajustarCupoSinTocarProteina(CUPO, 1700)!.cupo.PROT).toBe(7);
  });

  it('acaba cerca del objetivo, dentro del redondeo a cuartos', () => {
    for (const objetivo of [1600, 1800, 2000, 2400, 2800]) {
      const r = ajustarCupoSinTocarProteina(CUPO, objetivo)!;
      expect(Math.abs(r.kcalDespues - objetivo)).toBeLessThanOrEqual(30);
      expect(r.kcalSinColocar).toBe(0);
    }
  });

  it('al subir kcal también respeta la proteína y reparte el resto', () => {
    const r = ajustarCupoSinTocarProteina(CUPO, 2600)!;
    expect(r.cupo.PROT).toBe(7);
    expect(r.cupo.HC).toBeGreaterThan(CUPO.HC);
    expect(r.nota).toContain('no se toca');
  });

  it('cada macro mantiene su peso relativo: una dieta sin grasa no gana grasa', () => {
    const sinGrasa = { HC: 12, PROT: 8, GRASA: 0 };
    const r = ajustarCupoSinTocarProteina(sinGrasa, 1500)!;
    expect(r.cupo.GRASA).toBe(0);
    expect(r.cupo.PROT).toBe(8);
  });

  it('si solo la proteína ya pasa del objetivo, no la recorta: lo dice', () => {
    const muchaProte = { HC: 2, PROT: 20, GRASA: 1 };   // 2000 kcal solo de PROT
    const r = ajustarCupoSinTocarProteina(muchaProte, 1200)!;
    expect(r.cupo.PROT).toBe(20);
    expect(r.cupo.HC).toBe(0);
    expect(r.cupo.GRASA).toBe(0);
    expect(r.kcalSinColocar).toBeGreaterThan(0);
    expect(r.nota).toContain('decisión tuya');
  });

  it('sin objetivo o con el cupo vacío devuelve null, no un cupo inventado', () => {
    expect(ajustarCupoSinTocarProteina(CUPO, 0)).toBeNull();
    expect(ajustarCupoSinTocarProteina(CUPO, NaN)).toBeNull();
    expect(ajustarCupoSinTocarProteina({ HC: 0, PROT: 0, GRASA: 0 }, 2000)).toBeNull();
  });

  it('todo sale en cuartos de intercambio, que es la unidad real', () => {
    const r = ajustarCupoSinTocarProteina(CUPO, 1777)!;
    for (const v of Object.values(r.cupo)) {
      expect(Math.abs(Math.round(v * 4) - v * 4)).toBeLessThan(1e-9);
    }
  });
});
