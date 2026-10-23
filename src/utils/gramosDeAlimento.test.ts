import { describe, it, expect } from 'vitest';
import { itemsDeAlimentoPorGramos, previsionDeGramos, sePuedeEnGramos } from './gramosDeAlimento';
import type { MealItem } from '../types';

const arroz = { id: 'a1', mode: 'pesado', category: 'HC', label: '25g arroz cocido' } as unknown as MealItem;
const yogur = {
  id: 'pers_1', mode: 'pesado', category: 'PROT', label: '25g yogur', personal: true,
  porCien: { kcal: 72, hc: 4, prot: 8, grasa: 2.5 },
} as unknown as MealItem;

describe('apuntar por gramos', () => {
  it('banco: una línea con quantity = gramos / gramos por intercambio', () => {
    const [it1, ...resto] = itemsDeAlimentoPorGramos(arroz, 50, 'l1');
    expect(resto).toHaveLength(0);
    expect(it1.quantity).toBe(2);
    expect(it1.baseGrams).toBe(25);
    expect(it1.lineaId).toBeUndefined();
  });
  it('banco: la previsión sale de los intercambios y es aproximada', () => {
    const p = previsionDeGramos(arroz, 50);
    expect(p.aproximado).toBe(true);
    expect(p.nutrientes?.hc).toBe(50);
  });
  it('personal con porCien: kcal reales y líneas enlazadas', () => {
    const items = itemsDeAlimentoPorGramos(yogur, 125, 'l2');
    expect(items.length).toBeGreaterThan(0);
    expect(items.every(i => i.lineaId === 'l2')).toBe(true);
    expect(items[0].gramos).toBe(125);
    expect(items[0].nutrientes?.kcal).toBe(90);
    expect(previsionDeGramos(yogur, 125).aproximado).toBe(false);
  });
  it('sin gramos legibles no se puede en gramos', () => {
    expect(sePuedeEnGramos({ ...arroz, label: '1 huevo' } as MealItem)).toBe(false);
  });
});
