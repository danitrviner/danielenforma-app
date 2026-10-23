import { describe, it, expect } from 'vitest';
import type { WorkoutExercise } from '../types';
import {
  ajustesDe, seriesConTecnica, describirTecnica, pesoDeBajada, serieDelSegmento, TECNICAS_ELEGIBLES, llevaSegmentos,
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
      .toBe('Todas las series: myo-reps, activación de 12-15 reps y 3-5 miniseries de 3-5, descansando 15 s');
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
});
