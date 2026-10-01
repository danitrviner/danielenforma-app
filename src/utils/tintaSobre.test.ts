import { describe, expect, it } from 'vitest';
import { tintaSobre } from './coloresPersistidos';

describe('tintaSobre', () => {
  it('el oro lleva tinta de oro; estados y series, tinta de estado', () => {
    expect(tintaSobre('var(--color-accent)')).toBe('var(--color-on-accent)');
    expect(tintaSobre('var(--color-chart-2)')).toBe('var(--color-on-accent)');
    for (const t of ['data', 'success', 'warning', 'danger', 'info', 'chart-3']) {
      expect(tintaSobre(`var(--color-${t})`)).toBe('var(--color-on-fill)');
    }
  });
});
