import { describe, it, expect } from 'vitest';
import type { Mesocycle, WeekDistribution, MuscleGroup } from '../types';
import { MUSCLE_ORDER } from '../types';
import { buildSnapshot, isStale } from './repartoDesactualizado';
import { fechasDelMesociclo } from './asignacionMesociclo';

function grupos(series: Partial<Record<MuscleGroup, number>>): Mesocycle['groups'] {
  return Object.fromEntries(
    MUSCLE_ORDER.map(g => [g, { series: series[g] ?? 0, priority: 'media' as const }]),
  ) as Mesocycle['groups'];
}

const MESO: Mesocycle = {
  id: 'm1',
  athleteId: 'atleta@enforma.com',
  number: 1,
  weeks: 2,
  startDate: '2026-09-07', // lunes
  objective: 'Hipertrofia',
  daysPerWeek: 4,
  splitId: 'upper-lower',
  groups: grupos({ pecho: 12, dorsal: 12 }),
} as Mesocycle;

function conReparto(m: Mesocycle): Mesocycle {
  const distribution = { days: [], snapshot: buildSnapshot(m), generatedAt: '' } as unknown as WeekDistribution;
  return { ...m, distribution };
}

describe('isStale · mover los días del calendario no pide recalcular', () => {
  it('un reparto recién generado no está desactualizado', () => {
    const m = conReparto(MESO);
    expect(isStale(m, m.distribution!)).toBe(false);
  });

  it('marcar miércoles, viernes, sábado y domingo a mano (mismo nº de sesiones) NO lo desactualiza', () => {
    const base = conReparto(MESO);
    // Lo que hace `toggleDiaCiclo`: patrón a mano, suelta el reparto de la lista
    // y, si hace falta, ajusta la duración del ciclo.
    const tocado: Mesocycle = { ...base, customOffsets: [2, 4, 5, 6], splitId: undefined, cycleDays: 7 };
    expect(isStale(tocado, base.distribution!)).toBe(false);
  });

  it('cambiar el número de sesiones SÍ lo desactualiza', () => {
    const base = conReparto(MESO);
    expect(isStale({ ...base, daysPerWeek: 5, customOffsets: [0, 1, 2, 4, 5] }, base.distribution!)).toBe(true);
  });

  it('elegir OTRO reparto de la lista SÍ lo desactualiza', () => {
    const base = conReparto(MESO);
    expect(isStale({ ...base, splitId: 'push-pull-legs' }, base.distribution!)).toBe(true);
  });

  it('cambiar el volumen SÍ lo desactualiza', () => {
    const base = conReparto(MESO);
    expect(isStale({ ...base, groups: grupos({ pecho: 16, dorsal: 12 }) }, base.distribution!)).toBe(true);
  });
});

describe('fechas del atleta con el calendario a mano', () => {
  it('miércoles, viernes, sábado y domingo en las dos vueltas', () => {
    const meso: Mesocycle = { ...MESO, splitId: undefined, customOffsets: [2, 4, 5, 6] };
    expect(fechasDelMesociclo(meso, 4).map(f => f.date)).toEqual([
      '2026-09-09', '2026-09-11', '2026-09-12', '2026-09-13',
      '2026-09-16', '2026-09-18', '2026-09-19', '2026-09-20',
    ]);
  });
});
