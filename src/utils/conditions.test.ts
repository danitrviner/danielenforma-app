import { describe, expect, it } from 'vitest';
import { WorkoutAssignment, WorkoutLog, BodyweightLog, RuleCondition } from '../types';
import { evaluateCondition, getMetricValue, ConditionContext } from './conditions';

const baseCtx: ConditionContext = {
  today: '2026-08-22',
  workoutAssignments: [],
  workoutLogs: [],
  exerciseId: 'ex1',
  bodyweightLogs: [],
};

const mkAssignment = (date: string, status: WorkoutAssignment['status']): WorkoutAssignment =>
  ({ id: date + status, workoutId: 'w1', athleteId: 'a1', date, status });

describe('getMetricValue — adherenciaEntreno', () => {
  it('sin assignments en la ventana, undefined', () => {
    expect(getMetricValue('adherenciaEntreno', baseCtx)).toBeUndefined();
  });

  it('calcula % completado en los últimos 14 días', () => {
    const ctx = { ...baseCtx, workoutAssignments: [
      mkAssignment('2026-08-20', 'completed'),
      mkAssignment('2026-08-21', 'completed'),
      mkAssignment('2026-08-19', 'pending'),
      mkAssignment('2026-08-22', 'completed'),
    ] };
    expect(getMetricValue('adherenciaEntreno', ctx)).toBeCloseTo(75);
  });

  it('ignora assignments fuera de la ventana de 14 días', () => {
    const ctx = { ...baseCtx, workoutAssignments: [
      mkAssignment('2026-07-01', 'completed'), // muy viejo, fuera de ventana
      mkAssignment('2026-08-21', 'skipped'),
    ] };
    expect(getMetricValue('adherenciaEntreno', ctx)).toBe(0);
  });
});

describe('getMetricValue — rirMedio', () => {
  const mkLog = (date: string, exerciseId: string, rirs: (number | 'fallo')[]): WorkoutLog => ({
    id: date, athleteId: 'a1', workoutId: 'w1', assignmentId: 'as1', date, completedAt: date + 'T00:00:00.000Z',
    entries: [{ exerciseId, sets: rirs.map(r => r === 'fallo' ? { weight: 20, repsDone: 8, rir: 0, alFallo: true } : { weight: 20, repsDone: 8, rir: r }) }],
  });

  it('sin logs del ejercicio, undefined', () => {
    expect(getMetricValue('rirMedio', baseCtx)).toBeUndefined();
  });

  it('promedia el RIR de las series del ejercicio en la ventana', () => {
    const ctx = { ...baseCtx, workoutLogs: [mkLog('2026-08-20', 'ex1', [2, 3, 1])] };
    expect(getMetricValue('rirMedio', ctx)).toBeCloseTo(2);
  });

  it('ignora series al fallo (no son RIR real) y logs de otro ejercicio', () => {
    const ctx = { ...baseCtx, workoutLogs: [mkLog('2026-08-20', 'ex1', [2, 'fallo']), mkLog('2026-08-20', 'ex2', [5])] };
    expect(getMetricValue('rirMedio', ctx)).toBe(2);
  });
});

describe('getMetricValue — adherenciaDieta y peso', () => {
  it('adherenciaDieta pasa directo el valor precalculado', () => {
    expect(getMetricValue('adherenciaDieta', { ...baseCtx, dietAdherencePct: 88 })).toBe(88);
    expect(getMetricValue('adherenciaDieta', baseCtx)).toBeUndefined();
  });

  it('peso usa el registro más reciente hasta hoy', () => {
    const logs: BodyweightLog[] = [
      { id: '1', athleteId: 'a1', date: '2026-08-01', weight: 80, createdAt: '2026-08-01T00:00:00.000Z' },
      { id: '2', athleteId: 'a1', date: '2026-08-20', weight: 78, createdAt: '2026-08-20T00:00:00.000Z' },
      { id: '3', athleteId: 'a1', date: '2026-09-01', weight: 76, createdAt: '2026-09-01T00:00:00.000Z' }, // futuro, se ignora
    ];
    expect(getMetricValue('peso', { ...baseCtx, bodyweightLogs: logs })).toBe(78);
  });
});

describe('evaluateCondition', () => {
  it('sin filas, se cumple siempre', () => {
    expect(evaluateCondition({ rows: [], fallback: 'mantener' }, baseCtx)).toBe(true);
  });

  it('todas las filas deben cumplirse (Y)', () => {
    const ctx = { ...baseCtx, dietAdherencePct: 90, workoutAssignments: [mkAssignment('2026-08-21', 'completed')] };
    const condition: RuleCondition = {
      rows: [
        { metric: 'adherenciaDieta', operator: '>=', value: 80 },
        { metric: 'adherenciaEntreno', operator: '>=', value: 100 },
      ],
      fallback: 'mantener',
    };
    expect(evaluateCondition(condition, ctx)).toBe(true);
  });

  it('una fila que no se cumple hace fallar toda la condición', () => {
    const ctx = { ...baseCtx, dietAdherencePct: 50 };
    const condition: RuleCondition = { rows: [{ metric: 'adherenciaDieta', operator: '>=', value: 80 }], fallback: 'mantener' };
    expect(evaluateCondition(condition, ctx)).toBe(false);
  });

  it('sin datos suficientes para una métrica, la condición no se cumple (falla a lo seguro)', () => {
    const condition: RuleCondition = { rows: [{ metric: 'rirMedio', operator: '>=', value: 2 }], fallback: 'mantener' };
    expect(evaluateCondition(condition, baseCtx)).toBe(false);
  });
});
