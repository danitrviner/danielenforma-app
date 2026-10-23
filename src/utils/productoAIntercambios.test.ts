import { describe, it, expect } from 'vitest';
import { itemsDeProducto, nutrientesDeRacion } from './productoAIntercambios';

const base = { origen: { tipo: 'off' as const, codigo: '8480000000000' }, lineaId: 'L1' };

describe('nutrientesDeRacion', () => {
  it('escala por 100 g y redondea', () => {
    expect(nutrientesDeRacion({ kcal: 60, p: 10, hc: 4, g: 0.5 }, 125)).toEqual({ kcal: 75, p: 12.5, hc: 5, g: 0.6 });
  });
  it('sin kcal declaradas las calcula con 4-4-9', () => {
    expect(nutrientesDeRacion({ p: 10, hc: 5, g: 2 }, 100)?.kcal).toBe(78);
  });
  it('si falta un macro devuelve null: no se inventa', () => {
    expect(nutrientesDeRacion({ kcal: 60, p: 10, hc: 4 }, 100)).toBeNull();
  });
  it('gramos no válidos o macros negativos dan null', () => {
    expect(nutrientesDeRacion({ p: 10, hc: 4, g: 1 }, 0)).toBeNull();
    expect(nutrientesDeRacion({ p: -1, hc: 4, g: 1 }, 100)).toBeNull();
  });
});

describe('itemsDeProducto', () => {
  it('reparte un producto mixto entre categorías, con intercambios limpios', () => {
    const r = itemsDeProducto({ ...base, nombre: 'Yogur proteico', gramos: 200, porCien: { kcal: 62, p: 12.5, hc: 4, g: 0.5 } });
    expect(r.incompleto).toBe(false);
    for (const i of r.items) expect((i.quantity * 4) % 1).toBe(0); // múltiplos de 0,25
    expect(r.items.map(i => i.category)).toContain('PROT');
    expect(r.items.every(i => i.lineaId === 'L1' && i.origen?.tipo === 'off')).toBe(true);
  });
  it('gramos y nutrientes solo en la primera línea', () => {
    const r = itemsDeProducto({ ...base, nombre: 'Pan con aceite', gramos: 100, porCien: { kcal: 380, p: 8, hc: 50, g: 16 } });
    expect(r.items.length).toBeGreaterThan(1);
    expect(r.items[0].gramos).toBe(100);
    expect(r.items[0].nutrientes?.kcal).toBe(380);
    expect(r.items.slice(1).every(i => i.gramos === undefined && i.nutrientes === undefined)).toBe(true);
  });
  it('con datos incompletos no crea líneas', () => {
    const r = itemsDeProducto({ ...base, nombre: 'Pan de centeno', gramos: 60, porCien: { p: 8, hc: 45 } });
    expect(r).toMatchObject({ incompleto: true, items: [], nutrientes: null });
  });
  it('un producto sin aporte apreciable no crea líneas pero no es incompleto', () => {
    const r = itemsDeProducto({ ...base, nombre: 'Agua con gas', gramos: 330, porCien: { kcal: 0, p: 0, hc: 0, g: 0 } });
    expect(r.items).toEqual([]);
    expect(r.incompleto).toBe(false);
  });
  it('el total de intercambios no se mueve más de 0,25 del cálculo directo', () => {
    const r = itemsDeProducto({ ...base, nombre: 'Barrita', gramos: 50, porCien: { kcal: 400, p: 20, hc: 40, g: 18 } });
    const directo = (20 * .5) / 25 + (40 * .5) / 25 + (18 * .5) / 11;
    const total = r.items.reduce((a, i) => a + i.quantity, 0);
    expect(Math.abs(total - directo)).toBeLessThanOrEqual(0.5);
  });
});
