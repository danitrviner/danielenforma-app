import { describe, it, expect } from 'vitest';
import { prepararIndiceOff, buscarEnIndiceOff, mezclarResultadosOff, productoDesdeApiOff, extrasDeRacion, esIncompleto, motivoDeIncompleto, type OffProducto, type OffRegistro } from './productoOff';

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
  it('encuentra el singular buscando en plural', () => {
    expect(buscarEnIndiceOff(prepararIndiceOff([['9', 'Galleta María', 'Gullón']]), 'galletas').map(e => e.c)).toEqual(['9']);
  });
});

describe('mezclarResultadosOff', () => {
  it('pone delante la primera lista y no repite código ni nombre con marca', () => {
    const a = prepararIndiceOff([['1', 'Yogur natural', 'Hacendado']]);
    const b = prepararIndiceOff([['1', 'Yogur natural', 'Hacendado'], ['2', 'Yogur Natural', 'hacendado'], ['3', 'Yogur griego', 'Danone']]);
    expect(mezclarResultadosOff([a, b]).map(e => e.c)).toEqual(['1', '3']);
  });
});

describe('productoDesdeApiOff', () => {
  const nutri = { 'energy-kcal_100g': 29, proteins_100g: 0.8, carbohydrates_100g: 5.8, fat_100g: 0.1, salt_100g: 0.5, sugars_100g: 4.7, calcium_100g: 0.012 };
  it('convierte un producto completo con sus extras', () => {
    const r = productoDesdeApiOff({ code: '8480000160164', product_name_es: 'Tomate triturado', brands: 'Hacendado, Mercadona', quantity: '400 g', nutriscore_grade: 'b', nutriments: nutri }, '8480000160164');
    expect(r).toEqual({ c: '8480000160164', n: 'Tomate triturado', b: 'Hacendado', q: '400 g', k: 29, p: 0.8, h: 5.8, g: 0.1, sal: 0.5, az: 4.7, m: { calcio: 12 }, ns: 'b' });
  });
  it('saca las kcal de los kJ si no vienen', () => {
    const r = productoDesdeApiOff({ product_name: 'X', nutriments: { 'energy-kj_100g': 418.4, proteins_100g: 0, carbohydrates_100g: 25, fat_100g: 0 } }, '1');
    expect(r && !esIncompleto(r) && r.k).toBe(100);
  });
  it('sin macros es incompleto, con kcal que no cuadran también, y sin nombre no es nada', () => {
    expect(productoDesdeApiOff({ product_name: 'X', nutriments: { 'energy-kcal_100g': 100 } }, '1')).toEqual({ c: '1', n: 'X', b: '', i: 1, fal: ['p', 'h', 'g'] });
    expect(productoDesdeApiOff({ product_name: 'X', nutriments: { 'energy-kcal_100g': 900, proteins_100g: 1, carbohydrates_100g: 1, fat_100g: 1 } }, '1')).toMatchObject({ i: 2 });
    expect(productoDesdeApiOff({ nutriments: nutri }, '1')).toBeNull();
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
