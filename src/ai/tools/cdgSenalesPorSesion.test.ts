import { describe, it, expect } from 'vitest';
import catalogo from '../../utils/cdg/__fixtures__/catalogoPrueba.json';
import type { Exercise, Mesocycle, Questionnaire, QuestionnaireResponse, Workout, WorkoutLog } from '../../types';
import { usarFuenteDeDatos, type FuenteDeDatos } from './datos';
import { getCdgSemana } from './cdg';
import { addDays, hoyIsoLocal } from '../../utils/trainingWeek';

/* D6r y D7 (17-11-2026) en get_cdg_semana: el cansancio al salir sale de las
   sesiones (media y cuál fue la más dura) y las agujetas contestadas a las 48 h
   conviven con las del cuestionario semanal. Sin datos por sesión, como antes. */

const HOY = hoyIsoLocal();
const ej = (id: string, name: string, muscleGroup: Exercise['muscleGroup'], cdgNombre: string): Exercise =>
  ({ id, ownerId: 'c', name, primaryFocus: '', type: 'fuerza', muscleGroup, cdgNombre } as Exercise);
const EJERCICIOS: Exercise[] = [
  ej('lat', 'Elevaciones laterales con mancuernas', 'deltoide_lat', 'Elevaciones laterales con mancuernas - Deltoides medial'),
  ej('press', 'Press banca con mancuernas', 'pecho', 'Press banca plano con mancuernas (caja torácica amplia) - Pectoral, deltoides anterior, tríceps'),
];
const MESO = { id: 'm1', athleteId: 'ana@x.com', number: 1, weeks: 8, startDate: addDays(HOY, -14), objective: 'H', daysPerWeek: 2, groups: {} } as unknown as Mesocycle;
const SESION: Workout = {
  id: 'w0', ownerId: 'c', name: 'Hombro', mesocycleId: 'm1', dayIndex: 0,
  exercises: [
    { exerciseId: 'lat', order: 0, sets: 3, reps: '10-12', rir: 2, restSeconds: 90 },
    { exerciseId: 'press', order: 1, sets: 3, reps: '8-12', rir: 2, restSeconds: 120 },
  ],
};
const CUESTIONARIO: Questionnaire = { id: 'q1', ownerId: 'coach', title: 'Tu semana', questions: [
  { id: 'ag_d', label: 'Agujetas hombro', type: 'scale', required: false, signalKey: 'agujetas.deltoides' },
  { id: 'ag_p', label: 'Agujetas pecho', type: 'scale', required: false, signalKey: 'agujetas.pectoral' },
  { id: 'fat', label: 'Cansancio', type: 'scale', required: false, signalKey: 'wellness.fatigue_post_weekly' },
] as Questionnaire['questions'] };
// Hace 3 días: deltoides 1, pectoral 1, y un cansancio semanal de 5.
const RESPUESTA: QuestionnaireResponse = { id: 'r1', questionnaireId: 'q1', assignmentId: 'a', athleteId: 'ana@x.com', submittedAt: `${addDays(HOY, -3)}T09:00:00.000Z`,
  answers: [{ questionId: 'ag_d', value: 1 }, { questionId: 'ag_p', value: 1 }, { questionId: 'fat', value: 5 }] };

const log = (id: string, diasAtras: number, extra: Partial<WorkoutLog>): WorkoutLog => ({
  id, athleteId: 'ana@x.com', workoutId: 'w0', assignmentId: `as_${id}`, mesocycleId: 'm1',
  date: addDays(HOY, -diasAtras), completedAt: `${addDays(HOY, -diasAtras)}T18:00:00.000Z`, entries: [], ...extra,
});

const usar = (logs: WorkoutLog[]) => usarFuenteDeDatos({
  getCdgCatalogoJson: async () => JSON.stringify(catalogo),
  getExercises: async () => EJERCICIOS,
  getMesocycles: async () => [MESO],
  getWorkouts: async () => [SESION],
  getWorkoutLogs: async () => logs,
  getResponsesForAthlete: async () => [RESPUESTA],
  getQuestionnairesByCoach: async () => [CUESTIONARIO],
  coachActual: () => ({ uid: 'coach', email: 'danitrviner@gmail.com' }),
  isLocalBypassActive: () => false,
} as unknown as FuenteDeDatos);

const zona = (r: { zonas: Array<{ zona: string }> }, clave: string) => r.zonas.find(z => z.zona === clave) as unknown as {
  agujetas: { valor: number; anterior: number | null; origen: string } | null;
  propuestaSemanaQueViene: { tono: string; pct: number | null; texto: string };
};

describe('get_cdg_semana · señales por sesión', () => {
  it('sin nada apuntado en las sesiones, el cansancio y las agujetas salen del cuestionario semanal', async () => {
    usar([log('a', 2, {})]);
    const r = JSON.parse(await getCdgSemana('ana@x.com'));
    expect(r.contexto).toMatchObject({ fatigaPost: 5, fatigaPostOrigen: 'cuestionario_semanal', sesionMasCansada: null });
    expect(zona(r, 'deltoides').agujetas).toMatchObject({ valor: 1, origen: 'cuestionario_semanal' });
    expect(zona(r, 'deltoides').propuestaSemanaQueViene.tono).toBe('acelerar');
  });

  it('con cansancio por sesión usa la media, dice cuál fue la más dura y frena nombrándola', async () => {
    usar([log('a', 5, { cansancioAlSalir: 8 }), log('b', 2, { cansancioAlSalir: 9 }), log('viejo', 20, { cansancioAlSalir: 2 })]);
    const r = JSON.parse(await getCdgSemana('ana@x.com'));
    expect(r.contexto).toMatchObject({
      fatigaPost: 8.5, fatigaPostOrigen: 'sesiones',
      sesionMasCansada: { sesion: 'Hombro', fecha: addDays(HOY, -2), cansancio: 9, sesionesConDato: 2 },
    });
    const p = zona(r, 'deltoides').propuestaSemanaQueViene;
    expect(p.tono).toBe('mantener');
    expect(p.pct).toBeNull();
    expect(p.texto).toContain('Hombro: 9/10');
    expect(p.texto).toContain('de esa sesión');
  });

  it('una sesión dura con media por debajo de 8 no veta, pero queda señalada', async () => {
    usar([log('a', 5, { cansancioAlSalir: 4 }), log('b', 2, { cansancioAlSalir: 9 })]);
    const r = JSON.parse(await getCdgSemana('ana@x.com'));
    expect(r.contexto).toMatchObject({ fatigaPost: 6.5, sesionMasCansada: { cansancio: 9 } });
    expect(zona(r, 'deltoides').propuestaSemanaQueViene.tono).toBe('acelerar');
  });

  it('las agujetas contestadas a las 48 h mandan si son más recientes que el cuestionario', async () => {
    usar([log('a', 4, { agujetas48h: { deltoides: 4 }, agujetas48hAt: `${addDays(HOY, -1)}T10:00:00.000Z` })]);
    const r = JSON.parse(await getCdgSemana('ana@x.com'));
    expect(zona(r, 'deltoides').agujetas).toMatchObject({ valor: 4, anterior: 1, origen: 'a_48h_de_la_sesion' });
    expect(zona(r, 'deltoides').propuestaSemanaQueViene.tono).toBe('freno'); // no propensa con un 4
    // El pectoral no se contestó a 48 h: sigue con el cuestionario.
    expect(zona(r, 'pectoral').agujetas).toMatchObject({ valor: 1, origen: 'cuestionario_semanal' });
  });
});
