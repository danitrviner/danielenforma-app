import { describe, expect, it } from 'vitest';
import { substitutesFor } from './ingredientSubstitutions';

describe('substitutesFor', () => {
  it('offers other milks/plant drinks for a milk, never oils', () => {
    const subs = substitutesFor('Leche desnatada');
    expect(subs).toContain('Bebida de avena');
    expect(subs.some(s => /leche|bebida/i.test(s))).toBe(true);
    expect(subs.some(s => /aceite/i.test(s))).toBe(false);
  });

  it('keeps protein powders together but never offers creatine', () => {
    const subs = substitutesFor('Proteína whey');
    expect(subs).toContain('Caseína');
    expect(subs).toContain('Proteína vegana');
    expect(subs.some(s => /creatina|bcaa|colageno|colágeno/i.test(s))).toBe(false);
  });

  it('does not match water to aguacate (whole-word matching)', () => {
    expect(substitutesFor('Agua')).toEqual([]);
  });

  it('offers only other oils for an oil (kcal-coherent)', () => {
    const subs = substitutesFor('Aceite de oliva');
    expect(subs.every(s => /aceite/i.test(s))).toBe(true);
    expect(subs).toContain('Aceite de coco');
  });

  it('resolves "Harina de avena" to flours, not oat flakes (longest match wins)', () => {
    const subs = substitutesFor('Harina de avena');
    expect(subs.some(s => /harina/i.test(s))).toBe(true);
    expect(subs).not.toContain('Copos de avena');
  });

  it('returns nothing for an unrecognized or non-swappable ingredient', () => {
    expect(substitutesFor('Aguacate')).toEqual([]);
    expect(substitutesFor('Creatina')).toEqual([]);
    expect(substitutesFor('')).toEqual([]);
  });

  it('excludes the matched food itself from the suggestions', () => {
    const subs = substitutesFor('Yogur griego');
    expect(subs).not.toContain('Yogur griego');
    expect(subs).toContain('Yogur natural');
  });
});
