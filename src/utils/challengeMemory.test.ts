import { describe, expect, it } from 'vitest';
import { WeeklyChallenge, ChallengeKind } from '../types';
import {
  buildChallengeMemory, difficultyFor, rotationPenalty, frustrationPenalty,
  failedMilestoneAttempts, weekSeed, pickVariant, EMPTY_MEMORY,
} from './challengeMemory';

function ch(
  isoWeek: string,
  kind: ChallengeKind,
  status: WeeklyChallenge['status'],
  extra: Partial<WeeklyChallenge> = {},
): WeeklyChallenge {
  return {
    id: `a@x.com_${isoWeek}`,
    athleteId: 'a@x.com',
    isoWeek,
    weekStart: '2026-01-01',
    weekEnd: '2026-01-07',
    kind,
    title: kind,
    description: '',
    origin: 'auto',
    metric: { unit: 'pasos', target: 100 },
    status,
    progressValue: status === 'conseguido' ? 100 : 50,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}

describe('buildChallengeMemory', () => {
  it('ignora la semana en curso y las posteriores', () => {
    const history = [
      ch('2026-W10', 'pasos_media', 'activo'),   // la semana que se está generando
      ch('2026-W09', 'adherencia_dieta', 'conseguido'),
    ];
    const memory = buildChallengeMemory(history, '2026-W10');
    expect(memory.recentKinds).toEqual(['adherencia_dieta']);
    expect(memory.resolvedCount).toBe(1);
  });

  it('ordena bien a través del cambio de año (W52 → W01)', () => {
    const history = [
      ch('2025-W52', 'pasos_media', 'conseguido'),
      ch('2026-W01', 'adherencia_dieta', 'fallido'),
    ];
    const memory = buildChallengeMemory(history, '2026-W02');
    expect(memory.recentKinds).toEqual(['adherencia_dieta', 'pasos_media']);
  });

  it('cuenta rachas de victoria solo desde la semana más reciente hacia atrás', () => {
    const history = [
      ch('2026-W09', 'pasos_media', 'conseguido'),
      ch('2026-W08', 'peso_objetivo', 'conseguido'),
      ch('2026-W07', 'adherencia_dieta', 'fallido'),
      ch('2026-W06', 'pasos_total', 'conseguido'),
    ];
    const memory = buildChallengeMemory(history, '2026-W10');
    expect(memory.winStreak).toBe(2);
    expect(memory.wonCount).toBe(3);
    expect(memory.resolvedCount).toBe(4);
    expect(memory.winRate).toBeCloseTo(0.75, 2);
  });

  it('un reto sin resolver (activo) no cuenta como fallo', () => {
    const history = [
      ch('2026-W09', 'pasos_media', 'activo'),
      ch('2026-W08', 'pasos_media', 'conseguido'),
    ];
    const memory = buildChallengeMemory(history, '2026-W10');
    expect(memory.resolvedCount).toBe(1);
    expect(memory.winStreak).toBe(1);
  });

  it('la racha de fallos de un tipo se corta con la primera victoria de ese tipo', () => {
    const history = [
      ch('2026-W09', 'adherencia_dieta', 'fallido'),
      ch('2026-W08', 'adherencia_dieta', 'fallido'),
      ch('2026-W07', 'adherencia_dieta', 'conseguido'),
      ch('2026-W06', 'adherencia_dieta', 'fallido'),
    ];
    const memory = buildChallengeMemory(history, '2026-W10');
    expect(memory.failStreakByKind.get('adherencia_dieta')).toBe(2);
  });

  it('cuenta intentos fallidos de hito por ejercicio', () => {
    const history = [
      ch('2026-W09', 'carga_ejercicio', 'fallido', { isMilestone: true, metric: { unit: 'kg', target: 120, exerciseId: 'bench' } }),
      ch('2026-W08', 'carga_ejercicio', 'fallido', { isMilestone: true, metric: { unit: 'kg', target: 120, exerciseId: 'bench' } }),
    ];
    const memory = buildChallengeMemory(history, '2026-W10');
    expect(failedMilestoneAttempts('bench', memory)).toBe(2);
    expect(failedMilestoneAttempts('squat', memory)).toBe(0);
  });

  it('un hito conseguido cierra la cuenta de ese ejercicio', () => {
    const history = [
      ch('2026-W09', 'carga_ejercicio', 'conseguido', { isMilestone: true, metric: { unit: 'kg', target: 120, exerciseId: 'bench' } }),
      ch('2026-W08', 'carga_ejercicio', 'fallido', { isMilestone: true, metric: { unit: 'kg', target: 120, exerciseId: 'bench' } }),
    ];
    const memory = buildChallengeMemory(history, '2026-W10');
    expect(failedMilestoneAttempts('bench', memory)).toBe(0);
  });
});

describe('difficultyFor', () => {
  const many = (kind: ChallengeKind, results: WeeklyChallenge['status'][]) =>
    buildChallengeMemory(
      results.map((s, i) => ch(`2026-W${String(20 - i).padStart(2, '0')}`, kind, s)),
      '2026-W21',
    );

  it('sin historial usa el incremento de referencia — no trata al atleta de novato', () => {
    expect(difficultyFor('pasos_media', EMPTY_MEMORY)).toEqual({ factor: 1, label: 'justo' });
  });

  it('afloja mientras el atleta lleva menos de 3 retos resueltos', () => {
    const memory = many('pasos_media', ['conseguido', 'conseguido']);
    expect(difficultyFor('pasos_media', memory).label).toBe('suave');
  });

  it('afloja mucho tras dos fallos seguidos del mismo tipo', () => {
    const memory = many('adherencia_dieta', ['fallido', 'fallido', 'conseguido', 'conseguido']);
    const tuning = difficultyFor('adherencia_dieta', memory);
    expect(tuning.factor).toBeLessThan(0.5);
    expect(tuning.label).toBe('suave');
  });

  it('aprieta cuando el último reto de ese tipo se ganó con holgura', () => {
    const history = [
      ch('2026-W20', 'pasos_media', 'conseguido', { metric: { unit: 'pasos', target: 100 }, progressValue: 140 }),
      ch('2026-W19', 'pasos_media', 'conseguido'),
      ch('2026-W18', 'pasos_media', 'conseguido'),
      ch('2026-W17', 'pasos_media', 'conseguido'),
    ];
    const memory = buildChallengeMemory(history, '2026-W21');
    expect(difficultyFor('pasos_media', memory).label).toBe('ambicioso');
  });

  it('un tipo sin historial propio hereda el listón de la tasa global', () => {
    const memory = many('pasos_media', ['conseguido', 'conseguido', 'conseguido', 'conseguido']);
    // Nunca ha hecho un reto de cardio, pero gana el 100% de los demás.
    expect(difficultyFor('cardio_zona2', memory).label).toBe('ambicioso');
  });
});

describe('rotación y fatiga', () => {
  it('penaliza más cuanto más reciente es el tipo', () => {
    const memory = buildChallengeMemory([
      ch('2026-W09', 'pasos_media', 'conseguido'),
      ch('2026-W08', 'pasos_total', 'conseguido'),
      ch('2026-W07', 'adherencia_dieta', 'conseguido'),
    ], '2026-W10');
    expect(rotationPenalty('pasos_media', memory)).toBe(30);
    expect(rotationPenalty('pasos_total', memory)).toBe(18);
    expect(rotationPenalty('adherencia_dieta', memory)).toBe(10);
    expect(rotationPenalty('cardio_zona2', memory)).toBe(0);
  });

  it('aparta un tipo que ya falló dos veces seguidas', () => {
    const memory = buildChallengeMemory([
      ch('2026-W09', 'peso_objetivo', 'fallido'),
      ch('2026-W08', 'peso_objetivo', 'fallido'),
    ], '2026-W10');
    expect(frustrationPenalty('peso_objetivo', memory)).toBe(15);
    expect(frustrationPenalty('pasos_media', memory)).toBe(0);
  });
});

describe('variación de copy', () => {
  it('la semilla es estable dentro de la semana y distinta entre semanas', () => {
    expect(weekSeed('2026-W28')).toBe(weekSeed('2026-W28'));
    expect(weekSeed('2026-W28')).not.toBe(weekSeed('2026-W29'));
  });

  it('pickVariant siempre devuelve un elemento del conjunto', () => {
    const pool = ['a', 'b', 'c'] as const;
    for (const wk of ['2026-W01', '2026-W17', '2026-W44']) {
      expect(pool).toContain(pickVariant(pool, weekSeed(wk)));
    }
  });
});
