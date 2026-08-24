import { describe, expect, it } from 'vitest';
import {
  Exercise, Mesocycle, MuscleGroup, MuscleGroupConfig, Questionnaire, QuestionnaireResponse,
  WorkoutAssignment, WorkoutLog, MUSCLE_ORDER,
} from '../types';
import { leerFeedback, buildVolumeHistoryFrom } from './volumeHistory';
import { adherenciaDeMesociclo } from './adherence';

const grupos = (parcial: Partial<Record<MuscleGroup, number>>): Record<MuscleGroup, MuscleGroupConfig> =>
  Object.fromEntries(MUSCLE_ORDER.map(g => [g, { series: parcial[g] ?? 0, priority: 'media' as const }])) as Record<MuscleGroup, MuscleGroupConfig>;

const meso = (over: Partial<Mesocycle> = {}): Mesocycle => ({
  id: 'm1', athleteId: 'a@b.c', number: 1, weeks: 4, startDate: '2026-05-01',
  objective: '', daysPerWeek: 4, groups: grupos({ pecho: 10 }),
  ...over,
});

const asig = (id: string, mesocycleId: string, status: WorkoutAssignment['status']): WorkoutAssignment => ({
  id, workoutId: 'w', athleteId: 'uid', date: '2026-05-02', status, mesocycleId,
});

const pregunta = (id: string, signalKey?: string) => ({
  id, label: id, type: 'scale' as const, required: false, ...(signalKey ? { signalKey } : {}),
});

const cuestionario = (questions: ReturnType<typeof pregunta>[]): Questionnaire => ({
  id: 'q1', ownerId: 'coach', title: 'Fin de mesociclo', questions,
});

const respuesta = (submittedAt: string, answers: { questionId: string; value: string | number }[]): QuestionnaireResponse => ({
  id: `r-${submittedAt}`, questionnaireId: 'q1', assignmentId: 'qa1', athleteId: 'a@b.c', submittedAt, answers,
});

describe('adherenciaDeMesociclo', () => {
  it('cuenta solo las asignaciones de ese mesociclo', () => {
    const a = [asig('1', 'm1', 'completed'), asig('2', 'm1', 'pending'), asig('3', 'm2', 'completed')];
    expect(adherenciaDeMesociclo(a, 'm1')).toBe(50);
  });

  it('sin asignaciones devuelve null, no 0%', () => {
    expect(adherenciaDeMesociclo([], 'm1')).toBeNull();
    expect(adherenciaDeMesociclo([asig('1', 'otro', 'completed')], 'm1')).toBeNull();
  });
});

describe('leerFeedback', () => {
  it('sin preguntas etiquetadas no hay feedback que leer', () => {
    const q = cuestionario([pregunta('p1')]);
    expect(leerFeedback([respuesta('2026-06-01', [{ questionId: 'p1', value: 8 }])], [q])).toBeUndefined();
  });

  it('lee las escalas del cierre de bloque', () => {
    const q = cuestionario([
      pregunta('p1', 'meso_end.rating'),
      pregunta('p2', 'meso_end.recovery'),
      pregunta('p3', 'meso_end.effort'),
    ]);
    const fb = leerFeedback([respuesta('2026-06-01', [
      { questionId: 'p1', value: 8 }, { questionId: 'p2', value: 3 }, { questionId: 'p3', value: 9 },
    ])], [q]);
    expect(fb).toMatchObject({ rating: 8, recovery: 3, effort: 9 });
  });

  it('traduce las etiquetas de la multi-opción a grupos musculares', () => {
    const q = cuestionario([pregunta('p1', 'meso_end.priority_groups'), pregunta('p2', 'meso_end.overload_groups')]);
    const fb = leerFeedback([respuesta('2026-06-01', [
      { questionId: 'p1', value: 'Pecho,Deltoides lat.' },
      { questionId: 'p2', value: 'Isquiotibiales' },
    ])], [q])!;
    expect(fb.priorityGroups).toEqual(['pecho', 'deltoide_lat']);
    expect(fb.overloadGroups).toEqual(['isquios']);
  });

  it('ignora opciones que no corresponden a ningún grupo', () => {
    const q = cuestionario([pregunta('p1', 'meso_end.priority_groups')]);
    const fb = leerFeedback([respuesta('2026-06-01', [{ questionId: 'p1', value: 'Pecho,Inventado' }])], [q])!;
    expect(fb.priorityGroups).toEqual(['pecho']);
  });

  it('cuando dos zonas de agujetas caen en el mismo grupo se queda con la peor', () => {
    const q = cuestionario([pregunta('p1', 'doms.core'), pregunta('p2', 'doms.core')]);
    const fb = leerFeedback([respuesta('2026-06-01', [
      { questionId: 'p1', value: 4 }, { questionId: 'p2', value: 9 },
    ])], [q])!;
    expect(fb.doms.core).toBe(9);
  });

  it('de dos respuestas del mismo cuestionario manda la más reciente', () => {
    const q = cuestionario([pregunta('p1', 'meso_end.recovery')]);
    const fb = leerFeedback([
      respuesta('2026-05-01T10:00:00Z', [{ questionId: 'p1', value: 2 }]),
      respuesta('2026-06-01T10:00:00Z', [{ questionId: 'p1', value: 9 }]),
    ], [q])!;
    expect(fb.recovery).toBe(9);
  });
});

describe('buildVolumeHistoryFrom', () => {
  const ex: Exercise[] = [{
    id: 'press', ownerId: 'c', name: 'Press banca', primaryFocus: '', muscleGroup: 'pecho',
    type: 'fuerza', isCustom: false,
  }];

  const log = (date: string, series: number): WorkoutLog => ({
    id: `l-${date}`, athleteId: 'a@b.c', workoutId: 'w', assignmentId: 'as', date,
    completedAt: `${date}T10:00:00.000Z`,
    entries: [{ exerciseId: 'press', sets: Array.from({ length: series }, () => ({ weight: 80, repsDone: 8, rir: 2 })) }],
  });

  it('sin mesociclo anterior devuelve un historial vacío en vez de romperse', () => {
    const h = buildVolumeHistoryFrom({
      mesocycles: [meso()], currentId: 'm1', logs: [], exercises: ex, assignments: [],
    });
    expect(h.previous).toBeUndefined();
    expect(h.adherencePct).toBeNull();
    expect(h.groups).toEqual({});
  });

  it('convierte las series del bloque anterior a series SEMANALES', () => {
    const previo = meso({ id: 'm1', number: 1, weeks: 4, startDate: '2026-05-01', groups: grupos({ pecho: 10 }) });
    const actual = meso({ id: 'm2', number: 2, startDate: '2026-06-01' });
    // 4 sesiones × 8 series = 32 series de pecho en 4 semanas → 8/semana
    const logs = ['2026-05-02', '2026-05-09', '2026-05-16', '2026-05-23'].map(d => log(d, 8));
    const h = buildVolumeHistoryFrom({
      mesocycles: [previo, actual], currentId: 'm2', logs, exercises: ex, assignments: [],
    });
    expect(h.previous?.id).toBe('m1');
    expect(h.groups.pecho).toMatchObject({ planned: 10, performed: 8 });
  });

  it('un grupo programado del que no hay ni una serie sale con performed 0', () => {
    const previo = meso({ id: 'm1', number: 1, groups: grupos({ pecho: 10, dorsal: 12 }) });
    const actual = meso({ id: 'm2', number: 2, startDate: '2026-06-01' });
    const h = buildVolumeHistoryFrom({
      mesocycles: [previo, actual], currentId: 'm2', logs: [log('2026-05-02', 8)], exercises: ex, assignments: [],
    });
    expect(h.groups.dorsal).toEqual({ planned: 12, performed: 0, deltaPct: -100 });
  });

  it('coge la adherencia del mesociclo ANTERIOR, no la del que se está montando', () => {
    const previo = meso({ id: 'm1', number: 1 });
    const actual = meso({ id: 'm2', number: 2, startDate: '2026-06-01' });
    const h = buildVolumeHistoryFrom({
      mesocycles: [previo, actual], currentId: 'm2', logs: [], exercises: ex,
      assignments: [
        asig('1', 'm1', 'completed'), asig('2', 'm1', 'completed'), asig('3', 'm1', 'perdido'), asig('4', 'm1', 'pending'),
        asig('5', 'm2', 'pending'),
      ],
    });
    expect(h.adherencePct).toBe(50);
  });

  it('el feedback se lee aunque no haya mesociclo anterior', () => {
    const q = cuestionario([pregunta('p1', 'meso_end.recovery')]);
    const h = buildVolumeHistoryFrom({
      mesocycles: [meso()], currentId: 'm1', logs: [], exercises: ex, assignments: [],
      questionnaires: [q], responses: [respuesta('2026-06-01', [{ questionId: 'p1', value: 3 }])],
    });
    expect(h.feedback?.recovery).toBe(3);
  });
});
