import { describe, it, expect } from 'vitest';
import { alimentosUsados, claveDeCatalogo, claveDeProducto } from './alimentosFrecuentes';
import type { DietCompletionLog } from '../types';

const log = (date: string, items: Array<Record<string, unknown>>, hechos?: number[]): DietCompletionLog => ({
  id: `a@b.c_${date}`, athleteId: 'a@b.c', date, dietId: 'd',
  doneItemIds: (hechos ?? items.map((_, i) => i)).map(i => `m1_${i}`),
  meals: [{ id: 'm1', name: 'Comida', items }],
} as unknown as DietCompletionLog);

describe('alimentosUsados', () => {
  it('ordena recientes por fecha y saca frecuentes de lo repetido', () => {
    const r = alimentosUsados([
      log('2026-10-20', [{ category: 'PROT', foodLabel: 'Pollo', quantity: 1, baseGrams: 25 }]),
      log('2026-10-21', [{ category: 'PROT', foodLabel: 'Pollo', quantity: 2, baseGrams: 25 }, { category: 'HC', foodLabel: 'Arroz', quantity: 1 }]),
    ]);
    expect(r.recientes.map(a => a.label)).toEqual(['Pollo', 'Arroz']);
    expect(r.recientes[0].veces).toBe(2);
    expect(r.recientes[0].gramos).toBe(50);
  });
  it('ignora lo no comido, las recetas y las líneas de continuación', () => {
    const r = alimentosUsados([
      log('2026-10-21', [
        { category: 'HC', foodLabel: 'Pan', quantity: 1 },
        { category: 'PROT', foodLabel: 'Tortilla', quantity: 1, originRecipeId: 'r1' },
        { category: 'PROT', foodLabel: 'Yogur', quantity: 1, lineaId: 'x', gramos: 125, nutrientes: { kcal: 90, p: 10, hc: 5, g: 2 } },
        { category: 'GRASA', foodLabel: 'Yogur', quantity: 0.25, lineaId: 'x' },
      ], [1, 2, 3]),
    ]);
    expect(r.recientes.map(a => a.label)).toEqual(['Yogur']);
    expect(r.recientes[0].veces).toBe(1);
  });
  it('sin registros devuelve listas vacías', () => {
    expect(alimentosUsados([])).toEqual({ recientes: [], frecuentes: [] });
  });

  it('reconoce productos de supermercado y alimentos del catálogo por 100 g', () => {
    const nut = { kcal: 90, p: 10, hc: 5, g: 2 };
    const r = alimentosUsados([
      log('2026-10-20', [
        { category: 'PROT', foodLabel: 'Yogur proteico', quantity: 1, lineaId: 'a', gramos: 125, marca: 'Hacendado', nutrientes: nut, origen: { tipo: 'off', codigo: '8480000123456' } },
        { category: 'GRASA', foodLabel: 'Yogur proteico', quantity: 0.25, lineaId: 'a', origen: { tipo: 'off', codigo: '8480000123456' } },
        { category: 'HC', foodLabel: 'Pasta (seco)', quantity: 2, lineaId: 'b', gramos: 80, nutrientes: nut, origen: { tipo: 'catalogo', id: 'pasta-seco' } },
      ]),
      log('2026-10-21', [
        { category: 'PROT', foodLabel: 'Yogur proteico', quantity: 1, lineaId: 'c', gramos: 150, marca: 'Hacendado', nutrientes: nut, origen: { tipo: 'off', codigo: '8480000123456' } },
      ]),
    ]);
    const yogur = r.recientes.find(a => a.clave === claveDeProducto('8480000123456'));
    expect(yogur).toMatchObject({ tipo: 'off', codigo: '8480000123456', marca: 'Hacendado', veces: 2, gramos: 150 });
    expect(r.recientes.find(a => a.clave === claveDeCatalogo('pasta-seco'))).toMatchObject({ tipo: 'catalogo', gramos: 80 });
  });
  it('no confunde un alimento del banco con uno del catálogo que comparte id', () => {
    const r = alimentosUsados([
      log('2026-10-21', [
        { category: 'HC', foodLabel: 'Arroz', quantity: 1, baseGrams: 25, origen: { tipo: 'catalogo', id: 'arroz' } },
        { category: 'HC', foodLabel: 'Arroz (catálogo)', quantity: 2, lineaId: 'x', gramos: 60, nutrientes: { kcal: 200, p: 4, hc: 44, g: 1 }, origen: { tipo: 'catalogo', id: 'arroz' } },
      ]),
    ]);
    expect(r.recientes.map(a => a.clave).sort()).toEqual(['arroz', claveDeCatalogo('arroz')].sort());
  });
  it('deja fuera los «Añadido rápido»', () => {
    const r = alimentosUsados([
      log('2026-10-21', [
        { category: 'HC', foodLabel: 'Tarta', quantity: 3, lineaId: 'q', gramos: 100, nutrientes: { kcal: 300, p: 4, hc: 40, g: 14 }, origen: { tipo: 'personal', id: 'rapido' } },
      ]),
    ]);
    expect(r.recientes).toEqual([]);
  });
});
