import { describe, it, expect } from 'vitest';
import { calcularDerivas } from './derivaPropuestas';
import type { AiProposal, Diet, Mesocycle, MuscleGroup, MuscleGroupConfig } from '../types';

/* Lo que Dani cambia a mano NO ocurre al aprobar —ahí la app crea la entidad
   tal cual la propuso la IA— sino después, en el editor. Por eso la deriva se
   calcula comparando la propuesta con la entidad viva, y no preguntándole a él
   en un momento en el que todavía no ha cambiado nada. */

const grupos = (series: Partial<Record<MuscleGroup, number>>): Record<MuscleGroup, MuscleGroupConfig> =>
  Object.fromEntries(
    Object.entries(series).map(([g, s]) => [g, { series: s as number, priority: 'media' }]),
  ) as Record<MuscleGroup, MuscleGroupConfig>;

const meso = (id: string, groups: Partial<Record<MuscleGroup, number>>, extra: Partial<Mesocycle> = {}): Mesocycle => ({
  id, athleteId: 'ana@x.com', number: 4, weeks: 8, startDate: '2026-09-01',
  objective: 'Hipertrofia', daysPerWeek: 4, groups: grupos(groups), ...extra,
});

const propuestaMeso = (payload: Omit<Mesocycle, 'id'>, resultEntityId: string): AiProposal => ({
  id: 'prop1', athleteId: 'ana@x.com', kind: 'mesocycle', status: 'approved',
  chatId: 'chat1', summary: 'Mesociclo #4', rationale: '', payload,
  resultEntityId, createdAt: '2026-09-01T10:00:00Z', reviewedAt: '2026-09-01T11:00:00Z',
});

describe('calcularDerivas', () => {
  it('no dice nada de una propuesta que se aplicó tal cual', () => {
    const actual = meso('m1', { dorsal: 14, pecho: 12 });
    const { id: _id, ...payload } = actual;
    expect(calcularDerivas([propuestaMeso(payload, 'm1')], [actual], [])).toEqual([]);
  });

  it('pilla que subiste las series de un grupo después de aprobar', () => {
    const { id: _id, ...propuesto } = meso('m1', { dorsal: 14, pecho: 12 });
    const actual = meso('m1', { dorsal: 18, pecho: 12 });
    const [deriva] = calcularDerivas([propuestaMeso(propuesto, 'm1')], [actual], []);
    expect(deriva.que).toBe('Mesociclo #4');
    expect(deriva.cambios).toEqual(['dorsal 14 → 18 series']);
  });

  it('pilla un grupo que quitaste entero y los cambios de estructura', () => {
    const { id: _id, ...propuesto } = meso('m1', { dorsal: 14, gluteo: 10 }, { weeks: 8 });
    const actual = meso('m1', { dorsal: 14 }, { weeks: 6 });
    const [deriva] = calcularDerivas([propuestaMeso(propuesto, 'm1')], [actual], []);
    expect(deriva.cambios).toContain('semanas 8 → 6');
    expect(deriva.cambios).toContain('gluteo 10 → 0 series');
  });

  it('ignora las propuestas que no llegaste a aprobar', () => {
    const { id: _id, ...propuesto } = meso('m1', { dorsal: 14 });
    const p = { ...propuestaMeso(propuesto, 'm1'), status: 'proposed' as const };
    expect(calcularDerivas([p], [meso('m1', { dorsal: 20 })], [])).toEqual([]);
  });

  it('compara también el presupuesto de una dieta', () => {
    const dieta: Diet = {
      id: 'd1', athleteId: 'ana@x.com', name: 'Volumen',
      budget: { HC: 10, PROT: 6, GRASA: 4, MIX_HC: 0, MIX_GRASA: 0 }, meals: [],
    };
    const propuesta: AiProposal = {
      id: 'p2', athleteId: 'ana@x.com', kind: 'diet', status: 'approved', chatId: 'c',
      summary: 'Dieta', rationale: '',
      payload: { ...dieta, budget: { ...dieta.budget, HC: 8 } },
      resultEntityId: 'd1', createdAt: '2026-09-01T10:00:00Z',
    };
    const [deriva] = calcularDerivas([propuesta], [], [dieta]);
    expect(deriva.cambios).toEqual(['HC 8 → 10 intercambios']);
  });
});
