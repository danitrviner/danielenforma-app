import { describe, it, expect } from 'vitest';
import type { OffProducto } from './productoOff';
import { atajosDeCantidad, cantidadInicial, envaseDeProducto, extraDeProducto } from './caprichoEscaneado';
import { alimentoDelExtra, esExtraDelCatalogo, textoDeExtra } from './extrasDelCatalogo';

const cono: OffProducto = { c: '8000000000001', n: 'Cono de nata y chocolate', b: 'Marca', q: '4 x 120 ml', k: 300, p: 4, h: 36, g: 15 };
const tarrina: OffProducto = { c: '8000000000002', n: 'Helado de vainilla', b: 'Marca', q: '500 ml', s: 60, k: 200, p: 3.5, h: 24, g: 10 };

describe('envase del producto', () => {
  it('lee una cantidad sola, con sus unidades', () => {
    expect(envaseDeProducto('500 g')).toEqual({ total: 500, medida: 'g' });
    expect(envaseDeProducto('1,5 L')).toEqual({ total: 1500, medida: 'ml' });
    expect(envaseDeProducto('33 cl')).toEqual({ total: 330, medida: 'ml' });
    expect(envaseDeProducto('0.25 kg e')).toEqual({ total: 250, medida: 'g' });
  });
  it('lee un envase de varias unidades', () => {
    expect(envaseDeProducto('4 x 120 ml')).toEqual({ total: 480, medida: 'ml', unidades: 4, porUnidad: 120 });
    expect(envaseDeProducto('6x60g')).toEqual({ total: 360, medida: 'g', unidades: 6, porUnidad: 60 });
    expect(envaseDeProducto('480 ml (4 × 120 ml)')).toMatchObject({ unidades: 4, porUnidad: 120 });
  });
  it('lo que no se entiende, null', () => {
    expect(envaseDeProducto(undefined)).toBeNull();
    expect(envaseDeProducto('6 unidades')).toBeNull();
  });
});

describe('cantidades de un toque', () => {
  it('un cono de una caja de cuatro: sale ya puesta la unidad', () => {
    expect(atajosDeCantidad(cono).map(a => `${a.titulo} ${a.gramos} ${a.medida}`)).toEqual(['1 unidad 120 ml']);
    expect(cantidadInicial(cono)).toBe(120);
  });
  it('una tarrina: la ración declarada, medio envase y el envase entero', () => {
    expect(atajosDeCantidad(tarrina).map(a => `${a.titulo} ${a.gramos}`)).toEqual(['1 ración 60', 'Medio envase 250', 'Envase entero 500']);
    expect(cantidadInicial(tarrina)).toBe(60);
  });
  it('un envase individual: lo primero, entero', () => {
    const polo = { q: '90 ml', s: 90 };
    expect(atajosDeCantidad(polo).map(a => `${a.titulo} ${a.gramos}`)).toEqual(['Envase entero 90', 'Medio envase 45']);
    expect(atajosDeCantidad({ q: '75 g' }).map(a => a.titulo)).toEqual(['Envase entero', 'Medio envase']);
  });
  it('sin envase ni ración: sin atajos y abre en 100', () => {
    expect(atajosDeCantidad({})).toEqual([]);
    expect(cantidadInicial({})).toBe(100);
  });
  it('un envase familiar no ofrece comérselo entero', () => {
    expect(atajosDeCantidad({ q: '2 kg', s: 30 }).map(a => a.titulo)).toEqual(['1 ración']);
  });
});

describe('el producto como extra del menú', () => {
  it('un cono entero se guarda en unidades y cuenta sus macros exactos', () => {
    const e = extraDeProducto(cono, 120);
    expect(e).toMatchObject({ foodLabel: 'Cono de nata y chocolate (Marca)', alimentoId: 'off_8000000000001', gramos: 120, piezas: 1, unidad: 'unidad', delAtleta: true });
    expect(e.macros).toEqual({ kcal: 360, p: 4.8, hc: 43.2, g: 18 });
    expect(esExtraDelCatalogo(e)).toBe(true);
    expect(textoDeExtra(e)).toBe('1 Cono de nata y chocolate (Marca) · 120 g');
  });
  it('una cantidad que no son raciones justas se guarda en gramos', () => {
    const e = extraDeProducto(tarrina, 100);
    expect(e.piezas).toBeUndefined();
    expect(textoDeExtra(e)).toBe('100 g de Helado de vainilla (Marca)');
    expect(extraDeProducto(tarrina, 90)).toMatchObject({ piezas: 1.5, unidad: 'ración' });
  });
  it('se puede volver a ajustar después sin el producto a mano', () => {
    const a = alimentoDelExtra(extraDeProducto(cono, 120))!;
    expect(Math.round(a.porCien.kcal)).toBe(300);
    expect(a.unidad).toEqual({ nombre: 'unidad', gramos: 120 });
  });
  it('no repite la marca si ya va en el nombre', () => {
    expect(extraDeProducto({ ...cono, n: 'Cono Marca clásico' }, 120).foodLabel).toBe('Cono Marca clásico');
  });
});
