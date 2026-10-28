import { describe, it, expect } from 'vitest';
import type { WorkoutExercise } from '../types';
import {
  ajustesDe, seriesConTecnica, describirTecnica, pesoDeBajada, serieDelSegmento, TECNICAS_ELEGIBLES, llevaSegmentos, segmentosProgramados, seriesPrincipales, pautaDelBloque, seriesAGuardar, pautaDeSerie,
} from './tecnicaDeSerie';

const we = (extra: Partial<WorkoutExercise> = {}): WorkoutExercise =>
  ({ exerciseId: 'e', order: 0, sets: 3, reps: '8-12', restSeconds: 90, rir: 1, ...extra });

describe('tecnicaDeSerie', () => {
  it('lo guardado antes de E-06 se lee igual: en la última serie y con los valores por defecto', () => {
    expect(seriesConTecnica(we({ technique: 'dropset' }), 3)).toEqual([3]);
    expect(ajustesDe(we()).dropset).toEqual({ bajadas: 2, pctBajada: 20, hastaFallo: true });
    expect(describirTecnica(we({ technique: 'dropset' }), 3)).toBe('Última serie: drop-set, 2 bajadas de −20\u00a0%, hasta el fallo');
  });

  it('todas o series concretas; las que ya no existen se ignoran', () => {
    expect(seriesConTecnica(we({ technique: 'amrap', tecnicaAjustes: { series: 'todas' } }), 3)).toEqual([1, 2, 3]);
    expect(seriesConTecnica(we({ technique: 'dropset', tecnicaAjustes: { series: [3, 2, 2] } }), 3)).toEqual([2, 3]);
    expect(seriesConTecnica(we({ technique: 'dropset', tecnicaAjustes: { series: [5] } }), 3)).toEqual([3]);
    expect(seriesConTecnica(we(), 3)).toEqual([]);
  });

  it('describe en lenguaje llano', () => {
    expect(describirTecnica(we({ technique: 'dropset', tecnicaAjustes: { series: [2, 3], dropset: { bajadas: 1, pctBajada: 30, hastaFallo: false } } }), 3))
      .toBe('Series 2 y 3: drop-set, 1 bajada de −30\u00a0%');
    expect(describirTecnica(we({ technique: 'myoreps', tecnicaAjustes: { series: 'todas' } }), 2))
      .toBe('Todas las series: myo-reps, activación de 12-15 reps y 3-5 miniseries de 3-5, descansando 20 s');
    expect(describirTecnica(we({ technique: 'fallo', sets: 1 }), 1)).toBe('En la serie: al fallo, hasta que la técnica se rompa');
  });

  it('peso sugerido de cada bajada, a medio kilo', () => {
    expect(pesoDeBajada(100, 20, 0)).toBe(80);
    expect(pesoDeBajada(100, 20, 1)).toBe(64);
    expect(pesoDeBajada(27.5, 20, 0)).toBe(22);
    expect(pesoDeBajada(0, 20, 0)).toBeNull();
  });

  it('un segmento sin serie apuntada es de la última principal', () => {
    expect(serieDelSegmento({ segmento: true }, 3)).toBe(3);
    expect(serieDelSegmento({ segmento: true, segmentoDe: 2 }, 3)).toBe(2);
    expect(serieDelSegmento({ segmento: true, segmentoDe: 9 }, 3)).toBe(3);
    expect(serieDelSegmento({}, 3)).toBeNull();
  });

  it('rest-pause ya no se ofrece, pero lo guardado sigue llevando segmentos', () => {
    expect(TECNICAS_ELEGIBLES).not.toContain('restpause');
    expect(llevaSegmentos('restpause')).toBe(true);
    expect(llevaSegmentos('amrap')).toBe(false);
  });

  it('14-b: segmentos programados por serie con técnica', () => {
    expect(segmentosProgramados(we({ technique: 'dropset' }), 3)).toEqual([3, 3]);
    expect(segmentosProgramados(we({ technique: 'dropset', tecnicaAjustes: { series: 'todas', dropset: { bajadas: 1, pctBajada: 20, hastaFallo: true } } }), 3)).toEqual([1, 2, 3]);
    expect(segmentosProgramados(we({ technique: 'myoreps' }), 2)).toEqual([2, 2, 2]);
    expect(segmentosProgramados(we({ technique: 'myoreps', tecnicaAjustes: { myoreps: { repsActivacion: '12', miniSeries: 'muchas', repsMini: '3', descansoSeg: 15 } } }), 1)).toEqual([1, 1, 1]);
    expect(segmentosProgramados(we({ technique: 'restpause' }), 3)).toEqual([]);
    expect(segmentosProgramados(we(), 3)).toEqual([]);
  });

  it('series principales: fuera bajadas y miniseries', () => {
    expect(seriesPrincipales([{ n: 1 }, { n: 2, segmento: true }, { n: 3 }]).map(s => s.n)).toEqual([1, 3]);
  });

  it('14-d: la pauta del bloque sale de lo programado', () => {
    expect(pautaDelBloque(we({ technique: 'dropset' }))).toBe('Sin descanso · −20\u00a0% cada bajada · hasta el fallo');
    expect(pautaDelBloque(we({ technique: 'dropset', tecnicaAjustes: { dropset: { bajadas: 3, pctBajada: 15, hastaFallo: false } } })))
      .toBe('Sin descanso · −15\u00a0% cada bajada · sin llegar al fallo');
    expect(pautaDelBloque(we({ technique: 'myoreps' }))).toBe('20\u00a0s entre miniseries · 3-5 reps cada una');
    expect(pautaDelBloque(we({ technique: 'restpause' }))).toBe('');
  });

  it('14-a: qué se guarda al marcar series una a una', () => {
    expect(seriesAGuardar([3], 3)).toBe('ultima');
    expect(seriesAGuardar([1, 2, 3], 3)).toBe('todas');
    expect(seriesAGuardar([1], 1)).toBe('ultima');
    expect(seriesAGuardar([3, 1, 1], 3)).toEqual([1, 3]);
    expect(seriesAGuardar([2], 3)).toEqual([2]);
    expect(seriesAGuardar([], 3)).toBeNull();
    expect(seriesAGuardar([7], 3)).toBeNull();
  });

  it('14-a: pauta por serie según la técnica', () => {
    expect(pautaDeSerie(we({ technique: 'dropset' }))).toBe('Después de la serie: 2 bajadas · −20\u00a0% cada una · hasta el fallo · sin descanso');
    expect(pautaDeSerie(we({ technique: 'myoreps' }))).toBe('Después de la serie: 3-5 miniseries de 3-5 reps · 20\u00a0s entre ellas');
    expect(pautaDeSerie(we({ technique: 'fallo' }))).toBe('Esta serie: hasta el fallo');
    expect(pautaDeSerie(we())).toBe('');
  });
});
