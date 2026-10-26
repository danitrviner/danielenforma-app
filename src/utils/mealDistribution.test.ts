import { describe, expect, it } from 'vitest';
import { resolveSlots, inferSlot } from './mealDistribution';

describe('inferSlot', () => {
  it('reconoce las franjas habituales', () => {
    expect(inferSlot('Desayuno')).toBe(1);
    expect(inferSlot('Media mañana')).toBe(2);
    expect(inferSlot('Comida')).toBe(3);
    expect(inferSlot('Merienda')).toBe(4);
    expect(inferSlot('Cena')).toBe(5);
  });

  it('"almuerzo" es ambiguo — lo deja sin resolver aquí (resolveSlots lo desambigua)', () => {
    expect(inferSlot('Almuerzo')).toBeUndefined();
  });

  it('nombre libre sin match: undefined', () => {
    expect(inferSlot('Ración de Ana')).toBeUndefined();
  });
});

describe('resolveSlots', () => {
  it('respeta el slot explícito por encima de todo', () => {
    expect(resolveSlots([{ slot: 5, name: 'Comida rara' }])).toEqual([5]);
  });

  it('"almuerzo" resuelve a comida (3) si esa franja está libre', () => {
    const slots = resolveSlots([{ name: 'Desayuno' }, { name: 'Almuerzo' }, { name: 'Cena' }]);
    expect(slots).toEqual([1, 3, 5]);
  });

  it('"almuerzo" resuelve a media mañana (2) si "comida" ya ocupa la franja 3', () => {
    const slots = resolveSlots([{ name: 'Almuerzo' }, { name: 'Comida' }, { name: 'Cena' }]);
    expect(slots).toEqual([2, 3, 5]);
  });

  it('dieta vieja sin nombres reconocibles con 4 comidas cae en el preset por conteo', () => {
    const slots = resolveSlots([{ name: 'Comida 1' }, { name: 'Comida 2' }, { name: 'Comida 3' }, { name: 'Comida 4' }]);
    expect(slots).toEqual([1, 2, 3, 5]);
  });

  it('nunca deja una comida sin franja resuelta', () => {
    const slots = resolveSlots(Array.from({ length: 7 }, (_, i) => ({ name: `Comida ${i + 1}` })));
    expect(slots).toHaveLength(7);
    slots.forEach(s => expect(s).toBeGreaterThanOrEqual(1));
  });
});
