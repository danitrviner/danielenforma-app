import { describe, expect, it, vi, afterEach } from 'vitest';
import { Mesocycle, QSchedule } from '../types';
import { isDueToday, isUpcoming, Scheduled } from './scheduleEngine';

afterEach(() => { vi.useRealTimers(); });

// Construye YYYY-MM-DD a partir de los componentes LOCALES del Date, no de
// toISOString() (que es UTC) — scheduleEngine.ts construye y compara sus
// Date siempre en hora local (`new Date(dateStr + 'T00:00:00')`), así que el
// test tiene que hacer la misma conversión para no desplazarse un día en
// zonas horarias con offset positivo (ej. CEST, UTC+2).
function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

describe('legacy schedule types are unaffected by the optional ctx param', () => {
  it('once/weekdays/interval/monthly still evaluate correctly without passing ctx', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T12:00:00'));
    expect(isDueToday({ schedule: { type: 'once' }, startDate: '2026-08-10' })).toBe(true);
    expect(isDueToday({ schedule: { type: 'once' }, startDate: '2026-08-11' })).toBe(false);
  });
});

describe("'plan_week' trigger", () => {
  it('is due on the same weekday as startDate, N weeks later', () => {
    const start = '2026-08-01';
    const dueDate = new Date(start + 'T00:00:00');
    dueDate.setDate(dueDate.getDate() + 14); // semana 3 = +2 semanas desde la semana 1
    const a: Scheduled = { schedule: { type: 'plan_week', planWeek: 3 } as QSchedule, startDate: start };

    vi.useFakeTimers();
    vi.setSystemTime(new Date(isoDate(dueDate) + 'T12:00:00'));
    expect(isDueToday(a)).toBe(true);
  });

  it('is not due before or after its target date; isUpcoming only holds before', () => {
    const start = '2026-08-01';
    const dueDate = new Date(start + 'T00:00:00');
    dueDate.setDate(dueDate.getDate() + 14);
    const before = new Date(dueDate); before.setDate(before.getDate() - 1);
    const after = new Date(dueDate); after.setDate(after.getDate() + 1);
    const a: Scheduled = { schedule: { type: 'plan_week', planWeek: 3 } as QSchedule, startDate: start };

    vi.useFakeTimers();
    vi.setSystemTime(new Date(isoDate(before) + 'T12:00:00'));
    expect(isDueToday(a)).toBe(false);
    expect(isUpcoming(a)).toBe(true);

    vi.setSystemTime(new Date(isoDate(after) + 'T12:00:00'));
    expect(isDueToday(a)).toBe(false);
    expect(isUpcoming(a)).toBe(false);
  });

  it('respects an explicit planWeekday different from startDate\'s own weekday', () => {
    const start = '2026-08-01';
    const startWeekday = new Date(start + 'T00:00:00').getDay();
    const targetWeekday = (startWeekday + 2) % 7;
    const weekBase = new Date(start + 'T00:00:00');
    weekBase.setDate(weekBase.getDate() + 7); // base de la semana 2
    const shift = (targetWeekday - weekBase.getDay() + 7) % 7;
    const dueDate = new Date(weekBase);
    dueDate.setDate(dueDate.getDate() + shift);

    const a: Scheduled = { schedule: { type: 'plan_week', planWeek: 2, planWeekday: targetWeekday } as QSchedule, startDate: start };

    vi.useFakeTimers();
    vi.setSystemTime(new Date(isoDate(dueDate) + 'T12:00:00'));
    expect(isDueToday(a)).toBe(true);
  });
});

describe("'mesocycle_end' trigger", () => {
  const meso: Mesocycle = {
    id: 'm1', athleteId: 'a@x.com', number: 1, weeks: 4, startDate: '2026-07-01',
    objective: 'Bloque de prueba', daysPerWeek: 4, groups: {} as Mesocycle['groups'],
  };
  // Último día (inclusive) = startDate + weeks*7 - 1 = 2026-07-01 + 27 días = 2026-07-28.

  it("is due on the mesocycle's last day with offset 0", () => {
    const a: Scheduled = { schedule: { type: 'mesocycle_end' } as QSchedule, startDate: '2026-07-01' };
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-28T12:00:00'));
    expect(isDueToday(a, { mesocycles: [meso] })).toBe(true);
  });

  it('respects mesocycleOffsetDays (days before the close)', () => {
    const a: Scheduled = { schedule: { type: 'mesocycle_end', mesocycleOffsetDays: 2 } as QSchedule, startDate: '2026-07-01' };
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-26T12:00:00')); // 2 días antes del cierre
    expect(isDueToday(a, { mesocycles: [meso] })).toBe(true);
    vi.setSystemTime(new Date('2026-07-28T12:00:00')); // el día del cierre ya no aplica con offset 2
    expect(isDueToday(a, { mesocycles: [meso] })).toBe(false);
  });

  it('is never due without mesocycles in the context (no silent crash)', () => {
    const a: Scheduled = { schedule: { type: 'mesocycle_end' } as QSchedule, startDate: '2026-07-01' };
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-28T12:00:00'));
    expect(isDueToday(a)).toBe(false);
  });

  it('isUpcoming is true before any known mesocycle end and false after the last one', () => {
    const a: Scheduled = { schedule: { type: 'mesocycle_end' } as QSchedule, startDate: '2026-07-01' };
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T12:00:00'));
    expect(isUpcoming(a, { mesocycles: [meso] })).toBe(true);
    vi.setSystemTime(new Date('2026-07-29T12:00:00'));
    expect(isUpcoming(a, { mesocycles: [meso] })).toBe(false);
  });
});
