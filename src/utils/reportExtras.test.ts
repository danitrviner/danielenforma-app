import { describe, it, expect } from 'vitest';
import {
  computeBodyweightSection, computeAdherenceSection, computeNutritionSection, computeChallengesSection,
} from './reportExtras';
import { BodyweightLog, WorkoutAssignment, DietCompletionLog, Diet, WeeklyChallenge } from '../types';

const bw = (date: string, weight: number): BodyweightLog =>
  ({ id: `bw_${date}`, athleteId: 'a@x.com', date, weight, createdAt: date });

const asg = (date: string, status: WorkoutAssignment['status']): WorkoutAssignment =>
  ({ id: `as_${date}`, workoutId: 'w1', athleteId: 'a@x.com', date, status });

describe('computeBodyweightSection', () => {
  it('usa el último peso previo al periodo como línea base', () => {
    const logs = [bw('2026-06-28', 80), bw('2026-07-03', 79.4), bw('2026-07-08', 79)];
    const r = computeBodyweightSection(logs, '2026-07-01', '2026-07-08', 75);
    expect(r.startWeight).toBe(80);
    expect(r.endWeight).toBe(79);
    expect(r.deltaKg).toBe(-1);
    expect(r.towardsTarget).toBe(true);
    expect(r.entries).toBe(2);
  });

  it('marca dirección contraria cuando se aleja del objetivo', () => {
    const logs = [bw('2026-07-01', 80), bw('2026-07-07', 81)];
    const r = computeBodyweightSection(logs, '2026-07-01', '2026-07-08', 75);
    expect(r.deltaKg).toBe(1);
    expect(r.towardsTarget).toBe(false);
  });

  it('sin registros en el periodo devuelve endWeight null', () => {
    const r = computeBodyweightSection([bw('2026-06-01', 80)], '2026-07-01', '2026-07-08', undefined);
    expect(r.endWeight).toBeNull();
    expect(r.towardsTarget).toBeNull();
  });
});

describe('computeAdherenceSection', () => {
  it('calcula completadas/programadas en ambas ventanas', () => {
    const assignments = [
      asg('2026-07-02', 'completed'), asg('2026-07-04', 'completed'), asg('2026-07-06', 'pending'),
      asg('2026-06-25', 'completed'), asg('2026-06-27', 'perdido'),
    ];
    const r = computeAdherenceSection(assignments, '2026-07-01', '2026-07-07', '2026-06-24', '2026-06-30');
    expect(r.planned).toBe(3);
    expect(r.completed).toBe(2);
    expect(r.pct).toBe(67);
    expect(r.prevPct).toBe(50);
  });
});

describe('computeNutritionSection', () => {
  const diet = { id: 'd1', meals: [{ items: [{}, {}, {}, {}] }] } as unknown as Diet;
  const log = (date: string, done: number): DietCompletionLog =>
    ({ id: `dl_${date}`, athleteId: 'a@x.com', date, dietId: 'd1', doneItemIds: Array.from({ length: done }, (_, i) => `i${i}`) });

  it('promedia el % de items completados por día registrado', () => {
    const r = computeNutritionSection([log('2026-07-02', 4), log('2026-07-03', 2)], [diet], '2026-07-01', '2026-07-07', null, null);
    expect(r.daysLogged).toBe(2);
    expect(r.avgPct).toBe(75); // (100 + 50) / 2
    expect(r.periodDays).toBe(7);
    expect(r.prevAvgPct).toBeNull();
  });
});

describe('computeChallengesSection', () => {
  it('incluye retos cuya semana solapa el periodo', () => {
    const ch = (isoWeek: string, weekStart: string, weekEnd: string, status: WeeklyChallenge['status']): WeeklyChallenge => ({
      id: `a@x.com_${isoWeek}`, athleteId: 'a@x.com', isoWeek, weekStart, weekEnd,
      kind: 'pasos' as WeeklyChallenge['kind'], title: `Reto ${isoWeek}`, description: '', origin: 'auto',
      metric: { unit: 'pasos', target: 8000 }, status, createdAt: weekStart,
    });
    const r = computeChallengesSection(
      [ch('2026-W27', '2026-06-29', '2026-07-05', 'conseguido'), ch('2026-W25', '2026-06-15', '2026-06-21', 'fallido')],
      '2026-07-01', '2026-07-07',
    );
    expect(r.items).toHaveLength(1);
    expect(r.items[0].status).toBe('conseguido');
  });
});
