import { describe, it, expect } from 'vitest';
import { estadoDelEjercicio } from './seriesPrincipales';

const p = (done: boolean) => ({ done });
const seg = (done: boolean) => ({ done, segmento: true });

describe('estadoDelEjercicio', () => {
  it('abierto mientras falte una serie principal', () => {
    expect(estadoDelEjercicio([p(true), p(false), seg(false)])).toBe('abierto');
    expect(estadoDelEjercicio([])).toBe('abierto');
  });

  it('las bajadas sin marcar ya no lo cuelgan: queda con la técnica pendiente', () => {
    expect(estadoDelEjercicio([p(true), p(true), seg(true), seg(false)])).toBe('tecnica-pendiente');
  });

  it('cerrado con todo marcado, con o sin técnica', () => {
    expect(estadoDelEjercicio([p(true), p(true)])).toBe('cerrado');
    expect(estadoDelEjercicio([p(true), seg(true), seg(true)])).toBe('cerrado');
  });
});
