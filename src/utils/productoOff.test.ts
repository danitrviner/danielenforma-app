import { describe, it, expect } from 'vitest';
import { prepararIndiceOff, buscarEnIndiceOff, extrasDeRacion, esIncompleto, motivoDeIncompleto, type OffProducto, type OffRegistro } from './productoOff';

const indice = prepararIndiceOff([
  ['1', 'Yogur Proteínas Natural', 'Hacendado'],
  ['2', 'Pan de molde integral', 'Bimbo'],
  ['3', 'Galletas con yogur', 'Marca X'],
]);

describe('buscarEnIndiceOff', () => {
  it('ignora tildes y orden, y pone delante los que empiezan por lo buscado', () => {
    expect(buscarEnIndiceOff(indice, 'yogur').map(e => e.c)).toEqual(['1', '3']);
    expect(buscarEnIndiceOff(indice, 'proteinas yogur').map(e => e.c)).toEqual(['1']);
    expect(buscarEnIndiceOff(indice, 'bimbo').map(e => e.c)).toEqual(['2']);
  });
  it('no busca con menos de 3 letras', () => {
    expect(buscarEnIndiceOff(indice, 'yo')).toEqual([]);
  });
});

describe('extrasDeRacion', () => {
  const p = { c: '1', n: 'x', b: '', k: 100, p: 10, h: 10, g: 1, f: 2, sal: 0.5, m: { calcio: 120 } } as OffProducto;
  it('escala a la ración', () => {
    expect(extrasDeRacion(p, 200)).toEqual({ f: 4, sal: 1, m: { calcio: 240 } });
  });
  it('sin extras devuelve undefined', () => {
    expect(extrasDeRacion({ ...p, f: undefined, sal: undefined, m: undefined }, 100)).toBeUndefined();
  });
});

describe('registros incompletos', () => {
  it('distingue completos de incompletos y explica el motivo', () => {
    const falta: OffRegistro = { c: '1', n: 'x', b: '', i: 1, fal: ['p', 'h'] };
    const dudoso: OffRegistro = { c: '2', n: 'y', b: '', i: 2 };
    const bueno: OffRegistro = { c: '3', n: 'z', b: '', k: 1, p: 1, h: 1, g: 1 };
    expect(esIncompleto(falta)).toBe(true);
    expect(esIncompleto(bueno)).toBe(false);
    expect(motivoDeIncompleto(falta as never)).toBe('Falta: proteína, hidratos.');
    expect(motivoDeIncompleto(dudoso as never)).toContain('no cuadran');
  });
});
