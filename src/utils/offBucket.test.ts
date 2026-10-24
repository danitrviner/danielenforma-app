import { describe, it, expect } from 'vitest';
import { trozoDeCodigo } from './offBucket';

describe('trozoDeCodigo', () => {
  it('da los trozos que escribe el generador', () => {
    expect(trozoDeCodigo('8480000123456')).toBe(762);
    expect(trozoDeCodigo('3017620422003')).toBe(637);
    expect(trozoDeCodigo('84000')).toBe(477);
    expect(trozoDeCodigo('8410001234567')).toBe(970);
  });
  it('coincide con el script para cualquier código', async () => {
    const mjs = await import('../../scripts/_lib/offBucket.mjs');
    for (const c of ['8412345678905', '5449000000996', '20267608', '00012345678905']) {
      expect(trozoDeCodigo(c)).toBe(mjs.trozoDeCodigo(c));
    }
  });
});
