import { describe, it, expect, beforeEach, vi } from 'vitest';
import catalogo from '../../utils/cdg/__fixtures__/catalogoPrueba.json';
import type { Exercise, Mesocycle, Questionnaire, QuestionnaireResponse, Workout } from '../../types';
import { usarFuenteDeDatos, type FuenteDeDatos } from './datos';
import { getCdgSemana, proposeProgresionIem, getAlternativasEjercicio } from './cdg';
import { addDays, hoyIsoLocal } from '../../utils/trainingWeek';

/* Las tools CDG contra el catálogo de prueba (41 ejercicios) y un atleta en la
   semana 3 de un bloque de 8 con una sesión de hombro. Sin red ni Firestore:
   la fuente de datos es un objeto. Lo que se comprueba es que las tools
   devuelven los números del motor (no inventados) y que la propuesta de
   progresión sale como weekPlan con origenIem. */

const HOY = hoyIsoLocal();
const ej = (id: string, name: string, muscleGroup: Exercise['muscleGroup'], cdgNombre: string, equipment?: string[]): Exercise =>
  ({ id, ownerId: 'c', name, primaryFocus: '', type: 'fuerza', muscleGroup, cdgNombre, ...(equipment ? { equipment } : {}) } as Exercise);
const EJERCICIOS: Exercise[] = [
  ej('lat', 'Elevaciones laterales con mancuernas', 'deltoide_lat', 'Elevaciones laterales con mancuernas - Deltoides medial', ['mancuernas']),
  ej('pike', 'Pike push up con déficit', 'deltoide_ant', 'Pike push up con déficit- Deltoides anterior, tríceps'),
  ej('front', 'Elevaciones frontales con mochila', 'deltoide_ant', 'Elevaciones frontales con mochila lastrada - Deltoides anterior', ['mochila']),
  ej('press', 'Press banca con mancuernas', 'pecho', 'Press banca plano con mancuernas (caja torácica amplia) - Pectoral, deltoides anterior, tríceps', ['mancuernas', 'banco']),
  ej('flex', 'Flexiones', 'pecho', 'Flexiones - Pectoral, deltoides anterior, tríceps'),
  ej('maq', 'Press en máquina convergente', 'pecho', 'Press en máquina convergente horizontal - Pectoral, deltoides anterior, tríceps', ['máquina']),
];
const MESO = { id: 'm1', athleteId: 'ana@x.com', number: 1, weeks: 8, startDate: addDays(HOY, -14), objective: 'H', daysPerWeek: 2, groups: {} } as unknown as Mesocycle;
const SESION: Workout = {
  id: 'w0', ownerId: 'c', name: 'Hombro', mesocycleId: 'm1', dayIndex: 0,
  exercises: [
    { exerciseId: 'lat', order: 0, sets: 3, reps: '10-12', rir: 2, restSeconds: 90 },
    { exerciseId: 'pike', order: 1, sets: 3, reps: '8-12', rir: 2, restSeconds: 90 },
    { exerciseId: 'press', order: 2, sets: 3, reps: '8-12', rir: 2, restSeconds: 120 },
  ],
};
const CUESTIONARIO: Questionnaire = { id: 'q1', ownerId: 'coach', title: 'Tu semana', questions: [
  { id: 'ag_d', label: 'Agujetas hombro', type: 'scale', required: false, signalKey: 'agujetas.deltoides' },
  { id: 'ag_p', label: 'Agujetas pecho', type: 'scale', required: false, signalKey: 'agujetas.pectoral' },
  { id: 'sl', label: 'Sueño', type: 'numeric', required: false, signalKey: 'wellness.sleep_hours_weekly' },
] as Questionnaire['questions'] };
const RESPUESTA: QuestionnaireResponse = { id: 'r1', questionnaireId: 'q1', assignmentId: 'a', athleteId: 'ana@x.com', submittedAt: `${addDays(HOY, -1)}T09:00:00.000Z`,
  answers: [{ questionId: 'ag_d', value: 1 }, { questionId: 'ag_p', value: 4 }, { questionId: 'sl', value: 7.5 }] };

const creadas: Record<string, unknown>[] = [];
const fuente = {
  getCdgCatalogoJson: async () => JSON.stringify(catalogo),
  getExercises: async () => EJERCICIOS,
  getMesocycles: async () => [MESO],
  getWorkouts: async () => [SESION],
  getWorkoutLogs: async () => [],
  getResponsesForAthlete: async () => [RESPUESTA],
  getQuestionnairesByCoach: async () => [CUESTIONARIO],
  getOnboarding: async () => ({ athleteId: 'ana@x.com', equipment: ['Mancuernas', 'banco'], sessionMaxMinutes: 60 }),
  getVolumeLandmarks: async () => undefined,
  createAiProposal: vi.fn(async (d: Record<string, unknown>) => { creadas.push(d); return { id: 'prop_iem', ...d }; }),
  coachActual: () => ({ uid: 'coach', email: 'danitrviner@gmail.com' }),
  isLocalBypassActive: () => false,
};
usarFuenteDeDatos(fuente as unknown as FuenteDeDatos);
beforeEach(() => { creadas.length = 0; });

describe('get_cdg_semana', () => {
  it('devuelve las zonas con IEM programado, las agujetas y la propuesta del protocolo por zona', async () => {
    const r = JSON.parse(await getCdgSemana('ana@x.com'));
    expect(r.mesociclo).toMatchObject({ id: 'm1', semanaActual: 3, vueltas: 8, cicloDias: 7 });
    const deltoides = r.zonas.find((z: { zona: string }) => z.zona === 'deltoides');
    expect(deltoides.iemProgramadoEstaSemana).toBeGreaterThan(0);
    expect(deltoides.agujetas).toMatchObject({ valor: 1 });
    expect(deltoides.propuestaSemanaQueViene.tono).toBe('acelerar');
    expect(deltoides.propuestaSemanaQueViene.pct).toBeGreaterThan(0);
    const pectoral = r.zonas.find((z: { zona: string }) => z.zona === 'pectoral');
    expect(pectoral.agujetas.valor).toBe(4);
    expect(pectoral.propuestaSemanaQueViene.tono).toBe('freno'); // no propensa con un 4: bajar
    expect(r.contexto.sueñoHoras).toBe(7.5);
    expect(r.ejerciciosSinVinculoCdg).toEqual([]);
  });
  it('sin catálogo lo dice y no inventa', async () => {
    usarFuenteDeDatos({ ...fuente, getCdgCatalogoJson: async () => null } as unknown as FuenteDeDatos);
    expect(JSON.parse(await getCdgSemana('ana@x.com')).error).toMatch(/catálogo CDG/);
    usarFuenteDeDatos(fuente as unknown as FuenteDeDatos);
  });
});

describe('propose_progresion_iem', () => {
  it('crea una propuesta weekPlan con origenIem y los cambios del motor para la semana siguiente', async () => {
    const r = JSON.parse(await proposeProgresionIem('ana@x.com', {}, 'por protocolo', 'chat'));
    expect(r.proposalCreated).toBe(true);
    expect(r.semana).toBe(4);
    expect(r.cambios.length).toBeGreaterThan(0);
    const p = creadas[0] as { kind: string; payload: { origenIem?: boolean; cambios: { exerciseId: string; semana: number }[] }; summary: string };
    expect(p.kind).toBe('weekPlan');
    expect(p.payload.origenIem).toBe(true);
    expect(p.payload.cambios.every(c => c.semana === 4)).toBe(true);
    expect(p.summary).toMatch(/^Progresión IEM S4/);
  });
  it('no deja ser más agresivo que el motor, pero sí descartar un ejercicio', async () => {
    const r = JSON.parse(await proposeProgresionIem('ana@x.com', { pct_por_zona: { deltoides: 40 }, descartar: ['lat'] }, '', 'chat'));
    expect(r.avisos.join(' ')).toMatch(/deltoides.*40 % ignorado|Deltoides.*40 % ignorado/i);
    const p = creadas[0] as { payload: { cambios: { exerciseId: string }[] } } | undefined;
    if (p) expect(p.payload.cambios.some(c => c.exerciseId === 'lat')).toBe(false);
  });
  it('una semana de descarga o fuera del bloque se rechaza', async () => {
    usarFuenteDeDatos({ ...fuente, getMesocycles: async () => [{ ...MESO, semanasDescarga: [4] }] } as unknown as FuenteDeDatos);
    expect(JSON.parse(await proposeProgresionIem('ana@x.com', { semana: 4 }, '', 'chat'))).toMatchObject({ valid: false });
    expect(JSON.parse(await proposeProgresionIem('ana@x.com', { semana: 9 }, '', 'chat'))).toMatchObject({ valid: false });
    usarFuenteDeDatos(fuente as unknown as FuenteDeDatos);
  });
});

describe('get_alternativas_ejercicio', () => {
  it('mismo grupo, con el material del atleta y ordenadas por el IEM de la zona', async () => {
    const r = JSON.parse(await getAlternativasEjercicio('ana@x.com', { ejercicio: 'press banca con mancuernas' }));
    expect(r.original).toMatchObject({ exerciseId: 'press', grupo: 'pecho', cdg: true });
    const ids = r.alternativas.map((a: { exerciseId: string }) => a.exerciseId);
    expect(ids).toContain('flex');      // sin material: siempre disponible
    expect(ids).not.toContain('maq');   // «máquina» no está en su material
    expect(ids).not.toContain('lat');   // otro grupo
    expect(r.alternativas[0].iemZona).toBeGreaterThan(0);
  });
  it('con una articulación que evitar, solo las que la cargan claramente menos', async () => {
    const r = JSON.parse(await getAlternativasEjercicio('ana@x.com', { exercise_id: 'press', evitar_articulacion: 'hombro' }));
    for (const a of r.alternativas) expect(a.estresEnLaEvitada).toBeLessThanOrEqual(r.original.estresEnLaEvitada * 0.6 + 1e-9);
  });
  it('un ejercicio que no existe lo dice', async () => {
    expect(JSON.parse(await getAlternativasEjercicio('ana@x.com', { ejercicio: 'zzz' })).error).toBeTruthy();
  });
});
