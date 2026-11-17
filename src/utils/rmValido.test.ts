import { describe, it, expect } from 'vitest';
import { esSerieValidaParaRm, motivoDeNoValer, seriesValidasParaRm, mediana, REPS_MAX_RM, REPS_MIN_RM, RIR_MAX_RM } from './rmValido';
import { rmCdg } from './oneRepMax';

const serie = (repsDone: number, rir: number, extra: object = {}) => ({ repsDone, rir, ...extra });

describe('series válidas para el RM', () => {
  it('vale de 3 a 15 repeticiones con RIR 2 o menos', () => {
    expect(esSerieValidaParaRm(serie(3, 0))).toBe(true);
    expect(esSerieValidaParaRm(serie(8, 2))).toBe(true);
    expect(esSerieValidaParaRm(serie(12, 1))).toBe(true);
    // Auditoría de cifras (17-11-2026): el tope sube de 12 a 15 para que el
    // aislamiento a 10-15 y la entrada a 12-14 tengan marca.
    expect([REPS_MIN_RM, REPS_MAX_RM, RIR_MAX_RM]).toEqual([3, 15, 2]);
    expect(esSerieValidaParaRm(serie(13, 1))).toBe(true);
    expect(esSerieValidaParaRm(serie(15, 2))).toBe(true);
  });

  it('el RIR máximo no se mueve: a 15 repeticiones con RIR 3 sigue sin valer', () => {
    expect(motivoDeNoValer(serie(15, 3))).toBe('rir');
  });

  it('por qué 15 y no más: entre 12 y 15 una repetición mueve el RM como a 8; de 15 a 16, nada', () => {
    const sube = (reps: number) => (rmCdg(80, reps + 1, 1) / rmCdg(80, reps, 1) - 1) * 100;
    for (const reps of [12, 13, 14]) {
      expect(sube(reps)).toBeGreaterThanOrEqual(2);
      expect(sube(reps)).toBeLessThan(3);
    }
    expect(sube(15)).toBe(0);
  });

  it('fuera por repeticiones: menos de 3 o más de 15', () => {
    expect(motivoDeNoValer(serie(2, 0))).toBe('reps');
    expect(motivoDeNoValer(serie(16, 0))).toBe('reps');
    expect(motivoDeNoValer(serie(20, 1))).toBe('reps');
  });

  it('fuera por RIR: 3 o más', () => {
    expect(motivoDeNoValer(serie(8, 3))).toBe('rir');
    expect(motivoDeNoValer(serie(8, 5))).toBe('rir');
  });

  it('al fallo vale aunque el RIR guardado sea alto o no esté apuntado', () => {
    expect(esSerieValidaParaRm(serie(8, 4, { alFallo: true }))).toBe(true);
    expect(esSerieValidaParaRm(serie(8, 1, { alFallo: true, rirApuntado: false }))).toBe(true);
  });

  it('el RIR pautado sin tocar no vale; el registro antiguo sin marca, sí', () => {
    expect(motivoDeNoValer(serie(8, 1, { rirApuntado: false }))).toBe('rir_sin_apuntar');
    expect(esSerieValidaParaRm(serie(8, 1, { rirApuntado: true }))).toBe(true);
    expect(esSerieValidaParaRm(serie(8, 1))).toBe(true);
  });

  it('bajadas y miniseries fuera', () => {
    expect(motivoDeNoValer(serie(8, 0, { segmento: true }))).toBe('segmento');
  });

  it('filtra una sesión entera', () => {
    const sets = [serie(8, 1), serie(16, 0), serie(7, 4), serie(6, 2)];
    expect(seriesValidasParaRm(sets).map(s => s.repsDone)).toEqual([8, 6]);
  });
});

describe('mediana', () => {
  it('impar, par y vacía', () => {
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([4, 1, 3, 2])).toBe(2.5);
    expect(mediana([])).toBeNull();
  });
});

describe('fuera de su gimnasio (17-11-2026)', () => {
  it('una serie hecha fuera no vale para el RM, aunque sea perfecta', () => {
    expect(motivoDeNoValer(serie(8, 1, { fuera: true }))).toBe('fuera');
    expect(esSerieValidaParaRm(serie(8, 1, { fuera: true }))).toBe(false);
    expect(seriesValidasParaRm([serie(8, 1), serie(8, 1, { fuera: true })])).toHaveLength(1);
  });
});
