import { describe, it, expect } from 'vitest';
import { alimentosUsados, claveDeCatalogo, claveDeProducto, conDiaEnLista } from './alimentosFrecuentes';
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
    expect(alimentosUsados([])).toEqual({ recientes: [], frecuentes: [], todos: [] });
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

describe('producto escaneado en el historial', () => {
  const nut = { kcal: 90, p: 10, hc: 5, g: 2 };
  const escaneado = { category: 'PROT', foodLabel: 'Skyr natural', marca: 'Hacendado', quantity: 1, gramos: 150, nutrientes: nut, lineaId: 'l1', origen: { tipo: 'off', codigo: '8480000123456' } };

  it('sigue en «todos» aunque ya no quepa en los recientes', () => {
    const otros = Array.from({ length: 12 }, (_, i) => ({ category: 'HC', foodLabel: `Alimento ${i}`, quantity: 1 }));
    const r = alimentosUsados([log('2026-11-01', [escaneado]), log('2026-11-05', otros)]);
    expect(r.recientes.some(a => a.clave === claveDeProducto('8480000123456'))).toBe(false);
    const enTodos = r.todos.find(a => a.clave === claveDeProducto('8480000123456'));
    expect(enTodos).toMatchObject({ tipo: 'off', codigo: '8480000123456', marca: 'Hacendado', gramos: 150 });
    expect(r.todos[0].ultimo).toBe('2026-11-05');
  });

  it('el día recién guardado entra en la lista y sale en recientes', () => {
    const lista = [log('2026-11-01', [{ category: 'HC', foodLabel: 'Pan', quantity: 1 }])];
    const hoy = log('2026-11-10', [escaneado]);
    const nueva = conDiaEnLista(lista, hoy, '2026-10-11', '2026-11-10');
    expect(nueva.map(l => l.date)).toEqual(['2026-11-01', '2026-11-10']);
    expect(alimentosUsados(nueva).recientes[0].clave).toBe(claveDeProducto('8480000123456'));
  });

  it('sustituye el día si ya estaba y no mete días fuera de la ventana', () => {
    const viejo = log('2026-11-10', [{ category: 'HC', foodLabel: 'Pan', quantity: 1 }]);
    const nuevo = log('2026-11-10', [escaneado]);
    expect(conDiaEnLista([viejo], nuevo, '2026-10-11', '2026-11-10')).toEqual([nuevo]);
    expect(conDiaEnLista([viejo], log('2026-09-01', [escaneado]), '2026-10-11', '2026-11-10')).toEqual([viejo]);
    expect(conDiaEnLista([viejo], log('2026-11-12', [escaneado]), '2026-10-11', '2026-11-10')).toEqual([viejo]);
  });
});
