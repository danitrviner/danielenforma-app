import { describe, expect, it } from 'vitest';
import { roundQuarter, round2, addToPlaced, itemWeightLabel, isDietPending } from './exchangeHelpers';
import { GRAMS_PER_EXCHANGE } from './nutritionConstants';

describe('roundQuarter', () => {
  it('snaps to the nearest 0.25', () => {
    expect(roundQuarter(1.1)).toBe(1);
    expect(roundQuarter(1.13)).toBe(1.25);
    expect(roundQuarter(1.37)).toBe(1.25);
    expect(roundQuarter(1.38)).toBe(1.5);
  });

  it('is idempotent on values already on the grid', () => {
    for (const v of [0, 0.25, 0.5, 0.75, 1, 2.25, 3]) {
      expect(roundQuarter(v)).toBe(v);
    }
  });

  it('rounds negative deltas the same way', () => {
    expect(roundQuarter(-0.1)).toBe(-0); // -0 === 0 arithmetically; toBe uses Object.is
    expect(roundQuarter(-0.4)).toBe(-0.5);
  });
});

describe('grams = intercambios × g/intercambio (Contrato-de-datos)', () => {
  it('HC: 25 g per exchange', () => {
    expect(2 * GRAMS_PER_EXCHANGE.HC).toBe(50);
  });
  it('PROT: 25 g per exchange', () => {
    expect(2 * GRAMS_PER_EXCHANGE.PROT).toBe(50);
  });
  it('GRASA: 11 g per exchange', () => {
    expect(1 * GRAMS_PER_EXCHANGE.GRASA).toBe(11);
  });

  it('swapping a food keeps the exchange count, only grams move', () => {
    // "Avena 2 HC" (50g @ 25g/ex) swapped for "Pan integral 2 HC" (70g total
    // per the handoff's 35g/unit label) — exchanges stay 2, grams recompute.
    const exchanges = 2;
    const oldGrams = itemWeightLabel('Avena (50g)', exchanges);
    const newGrams = itemWeightLabel('Pan integral (35g)', exchanges);
    expect(oldGrams).toBe('100g');
    expect(newGrams).toBe('70g');
  });
});

describe('addToPlaced', () => {
  it('MIX_HC contributes half to HC and half to PROT', () => {
    const p = { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 };
    addToPlaced(p, 'MIX_HC', 2);
    expect(p.HC).toBe(1);
    expect(p.PROT).toBe(1);
  });

  it('MIX_GRASA contributes half to GRASA and half to PROT', () => {
    const p = { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 };
    addToPlaced(p, 'MIX_GRASA', 1);
    expect(p.GRASA).toBe(0.5);
    expect(p.PROT).toBe(0.5);
  });
});

describe('isDietPending', () => {
  it('a self-managed diet with no budget floor is never pending', () => {
    expect(isDietPending({ budget: { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 }, meals: [] })).toBe(false);
  });

  it('is pending until every budgeted category is covered', () => {
    const diet = {
      budget: { HC: 2, PROT: 1, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 },
      meals: [{ id: 'm1', name: 'Comida 1', items: [{ category: 'HC' as const, foodLabel: 'Avena', quantity: 2 }] }],
    };
    expect(isDietPending(diet)).toBe(true); // PROT still short
  });
});

describe('round2', () => {
  it('rounds to 2 decimals', () => {
    expect(round2(1.005)).toBeCloseTo(1, 2);
    expect(round2(1.234)).toBe(1.23);
  });
});
