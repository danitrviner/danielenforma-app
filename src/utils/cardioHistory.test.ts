import { describe, it, expect } from 'vitest';
import { CardioSession } from '../types';
import { isWithinRange, filterSessions, allTags, compare30DayAverage } from './cardioHistory';

function makeSession(overrides: Partial<CardioSession> & { id: string; date: string }): CardioSession {
  return {
    athleteId: 'a@x.com',
    type: 'libre',
    startedAt: `${overrides.date}T08:00:00.000Z`,
    durationSec: 1800,
    timeInZoneSec: { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 },
    samples: [],
    sampleIntervalSec: 4,
    ...overrides,
  };
}

const TODAY = new Date('2026-08-15T12:00:00Z');

describe('isWithinRange', () => {
  it('"all" siempre es cierto', () => {
    expect(isWithinRange('2020-01-01', 'all', TODAY)).toBe(true);
  });

  it('"week" cubre los últimos 7 días', () => {
    expect(isWithinRange('2026-08-10', 'week', TODAY)).toBe(true); // hace 5 días
    expect(isWithinRange('2026-08-05', 'week', TODAY)).toBe(false); // hace 10 días
  });

  it('nunca incluye fechas futuras', () => {
    expect(isWithinRange('2026-08-20', 'week', TODAY)).toBe(false);
  });

  it('"month" y "year" respetan sus ventanas', () => {
    expect(isWithinRange('2026-07-20', 'month', TODAY)).toBe(true); // hace 26 días
    expect(isWithinRange('2026-06-01', 'month', TODAY)).toBe(false); // hace >30 días
    expect(isWithinRange('2026-01-01', 'year', TODAY)).toBe(true);
    expect(isWithinRange('2025-01-01', 'year', TODAY)).toBe(false);
  });
});

describe('filterSessions', () => {
  const sessions = [
    makeSession({ id: '1', date: '2026-08-14', type: 'zona2', tags: ['dolorido'] }),
    makeSession({ id: '2', date: '2026-08-01', type: 'libre' }),
    makeSession({ id: '3', date: '2026-08-14', type: 'libre', tags: ['calor'] }),
  ];

  it('combina rango + tipo + etiqueta', () => {
    expect(filterSessions(sessions, { range: 'week' }, TODAY).map(s => s.id)).toEqual(['1', '3']);
    expect(filterSessions(sessions, { type: 'zona2' }, TODAY).map(s => s.id)).toEqual(['1']);
    expect(filterSessions(sessions, { tag: 'calor' }, TODAY).map(s => s.id)).toEqual(['3']);
  });

  it('sin filtros, devuelve todo', () => {
    expect(filterSessions(sessions, {}, TODAY)).toHaveLength(3);
  });
});

describe('allTags', () => {
  it('recoge las etiquetas únicas, ordenadas', () => {
    const sessions = [
      makeSession({ id: '1', date: '2026-08-01', tags: ['calor', 'dolorido'] }),
      makeSession({ id: '2', date: '2026-08-02', tags: ['dolorido'] }),
      makeSession({ id: '3', date: '2026-08-03' }),
    ];
    expect(allTags(sessions)).toEqual(['calor', 'dolorido']);
  });
});

describe('compare30DayAverage — "VS. Promedio de los últimos 30 días" (§4bis.4)', () => {
  it('promedia solo el mismo tipo, dentro de los 30 días previos, sin incluirse a sí misma', () => {
    const target = makeSession({ id: 'target', date: '2026-08-15', type: 'zona2', durationSec: 2400, avgHR: 140 });
    const peers = [
      makeSession({ id: 'p1', date: '2026-08-10', type: 'zona2', durationSec: 1800, avgHR: 130 }),
      makeSession({ id: 'p2', date: '2026-08-05', type: 'zona2', durationSec: 2200, avgHR: 135 }),
      makeSession({ id: 'other-type', date: '2026-08-12', type: 'libre', durationSec: 3000, avgHR: 150 }),
      makeSession({ id: 'too-old', date: '2026-07-01', type: 'zona2', durationSec: 500, avgHR: 100 }),
    ];
    const cmp = compare30DayAverage(target, [target, ...peers]);
    expect(cmp.count).toBe(2);
    expect(cmp.durationSec).toBe(2000); // (1800+2200)/2
    expect(cmp.avgHR).toBeCloseTo(132.5, 5);
  });

  it('sin sesiones previas del mismo tipo, no hay comparativa', () => {
    const target = makeSession({ id: 'target', date: '2026-08-15', type: 'zona2' });
    expect(compare30DayAverage(target, [target]).count).toBe(0);
  });
});
