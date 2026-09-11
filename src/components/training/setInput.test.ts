import { describe, expect, it } from 'vitest';
import { resumenRangosPautados } from './setInput';

describe('resumenRangosPautados', () => {
  it('todas las series con el mismo rango: solo el rango, sin conteo', () => {
    expect(resumenRangosPautados([{ reps: '8-12' }, { reps: '8-12' }, { reps: '8-12' }])).toBe('8-12');
  });

  it('rangos distintos: agrupa consecutivas iguales con conteo', () => {
    expect(resumenRangosPautados([
      { reps: '6-7' }, { reps: '6-7' }, { reps: '6-7' }, { reps: '8-9' },
    ])).toBe('3x6-7, 1x8-9');
  });

  it('un solo grupo repetido no lleva conteo aunque sean varias series', () => {
    expect(resumenRangosPautados([{ reps: '12' }, { reps: '12' }])).toBe('12');
  });

  it('sin series pautadas, null', () => {
    expect(resumenRangosPautados([])).toBeNull();
    expect(resumenRangosPautados([{ reps: '' }, { reps: '   ' }])).toBeNull();
  });
});
