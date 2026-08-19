import { describe, expect, it } from 'vitest';
import { FoodCategory } from '../types';
import { quotaSplit, resolveSlots, inferSlot, distributeMealTargets } from './mealDistribution';

// Réplica exacta del `distributeEvenly` que este módulo sustituye en
// NutritionPlansScreen.tsx — la prueba de equivalencia de abajo demuestra que
// el fallback sin preferencia es bit a bit el mismo reparto de siempre.
function distributeEvenly(total: number, n: number): number[] {
  if (n === 0) return [];
  const units = Math.round(total / 0.25);
  const base = Math.floor(units / n);
  const extra = units - base * n;
  return Array.from({ length: n }, (_, i) => Math.round((base + (i < extra ? 1 : 0)) * 0.25 * 100) / 100);
}

describe('quotaSplit', () => {
  it('la suma es exacta al total (redondeado a 0,25) para un rango de totales y pesos', () => {
    const weightSets = [[1, 1, 1], [1, 2, 3], [5, 1], [1], [2, 2, 2, 2, 2]];
    for (let t = 0; t <= 20; t += 0.25) {
      for (const w of weightSets) {
        const split = quotaSplit(t, w);
        const sum = split.reduce((s, v) => s + v, 0);
        expect(Math.round(sum * 100) / 100).toBeCloseTo(Math.round(t / 0.25) * 0.25, 5);
      }
    }
  });

  it('ningún elemento es negativo y todos son múltiplos de 0,25', () => {
    const split = quotaSplit(10, [3, 1, 5, 0.5]);
    split.forEach(v => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(Math.round(v / 0.25 * 1e6) % 1e6).toBe(0);
    });
  });

  it('equivale exactamente a distributeEvenly con pesos iguales, para cualquier total', () => {
    for (let t = 0; t <= 15; t += 0.25) {
      for (const n of [1, 2, 3, 4, 5]) {
        expect(quotaSplit(t, Array(n).fill(1))).toEqual(distributeEvenly(t, n));
      }
    }
  });

  it('monotonía: un peso estrictamente mayor nunca recibe una porción estrictamente menor', () => {
    const split = quotaSplit(10, [1, 3, 5]);
    expect(split[0]).toBeLessThanOrEqual(split[1]);
    expect(split[1]).toBeLessThanOrEqual(split[2]);
  });

  it('total 0 reparte todo en 0', () => {
    expect(quotaSplit(0, [1, 2, 3])).toEqual([0, 0, 0]);
  });

  it('sin comidas devuelve []', () => {
    expect(quotaSplit(10, [])).toEqual([]);
  });
});

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

describe('distributeMealTargets', () => {
  const budget: Record<FoodCategory, number> = { HC: 10, PROT: 6, GRASA: 4, MIX_HC: 0, MIX_GRASA: 0 };
  const meals = [
    { id: 'a', name: 'Desayuno' },
    { id: 'b', name: 'Comida' },
    { id: 'c', name: 'Cena' },
  ];

  it('sin preferencia: personalized=false y reparto uniforme (igual que distributeEvenly)', () => {
    const r = distributeMealTargets({ budget, meals });
    expect(r.personalized).toBe(false);
    expect(r.targets.map(t => t.HC)).toEqual(distributeEvenly(10, 3));
    expect(r.targets.map(t => t.PROT)).toEqual(distributeEvenly(6, 3));
  });

  it('con perfil "equilibrado" y sin comida de entreno: tampoco personaliza', () => {
    const r = distributeMealTargets({ budget, meals, hungerProfile: 'equilibrado' });
    expect(r.personalized).toBe(false);
  });

  it('perfil "noche": la cena recibe más HC que el desayuno', () => {
    const r = distributeMealTargets({ budget, meals, hungerProfile: 'noche' });
    expect(r.personalized).toBe(true);
    const [desayuno, , cena] = r.targets;
    expect(cena.HC).toBeGreaterThan(desayuno.HC);
  });

  it('perfil "mañana": el desayuno recibe más HC que la cena', () => {
    const r = distributeMealTargets({ budget, meals, hungerProfile: 'manana' });
    const [desayuno, , cena] = r.targets;
    expect(desayuno.HC).toBeGreaterThan(cena.HC);
  });

  it('comida de entreno explícita: sube HC y baja grasa ahí, sin desbordar el presupuesto', () => {
    const withTraining = [
      { id: 'a', name: 'Desayuno' },
      { id: 'b', name: 'Comida', aroundTraining: true },
      { id: 'c', name: 'Cena' },
    ];
    const r = distributeMealTargets({ budget, meals: withTraining });
    expect(r.personalized).toBe(true);
    const sumHC = r.targets.reduce((s, t) => s + t.HC, 0);
    const sumGrasa = r.targets.reduce((s, t) => s + t.GRASA, 0);
    expect(Math.round(sumHC * 100) / 100).toBe(10);
    expect(Math.round(sumGrasa * 100) / 100).toBe(4);
    expect(r.targets[1].HC).toBeGreaterThan(r.targets[0].HC);
  });

  it('la proteína se reparte más plana que los hidratos entre franjas muy distintas', () => {
    const r = distributeMealTargets({ budget, meals, hungerProfile: 'noche' });
    const hcSpread = Math.max(...r.targets.map(t => t.HC)) - Math.min(...r.targets.map(t => t.HC));
    const protSpread = Math.max(...r.targets.map(t => t.PROT)) - Math.min(...r.targets.map(t => t.PROT));
    expect(protSpread).toBeLessThanOrEqual(hcSpread);
  });

  it('presupuesto en 0 para una categoría: todas las comidas quedan en 0 en esa categoría', () => {
    const r = distributeMealTargets({ budget: { ...budget, GRASA: 0 }, meals, hungerProfile: 'noche' });
    r.targets.forEach(t => expect(t.GRASA).toBe(0));
  });

  it('sin comidas: listas vacías, no personalizado', () => {
    expect(distributeMealTargets({ budget, meals: [] })).toEqual({ targets: [], slots: [], reasons: [], personalized: false });
  });
});
