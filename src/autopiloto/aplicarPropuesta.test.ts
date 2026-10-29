import { describe, it, expect } from 'vitest';
import { aplicarPropuesta, resolverReferencias, esCreacion, type LectorAplicacion, type Operacion } from './aplicarPropuesta';
import type { AiProposal, Diet, Mesocycle, NutritionProgram, Roadmap, UserProfile, Workout, WorkoutAssignment } from '../types';

/* Lo que antes solo se podía probar aprobando de verdad en la app. Cada caso
   construye una propuesta como las que crea el asistente y comprueba QUÉ se
   escribiría y QUÉ se guarda como «antes»: nada toca Firestore. */

const AHORA = '2026-10-29T10:00:00.000Z';
const OPC = { coachUid: 'coach_uid', ahora: AHORA };
const EMAIL = 'ana@x.com';

const perfil: UserProfile = { userId: 'u_ana', email: EMAIL, displayName: 'Ana Ruiz', role: 'client', planDurationMonths: 3 } as UserProfile;
const dietaBase: Diet = { id: 'd1', athleteId: EMAIL, name: 'Déficit', budget: { HC: 8, PROT: 6, GRASA: 4, MIX_HC: 0, MIX_GRASA: 0 }, objetivo: { kcal: 2000, p: 160, hc: 200, g: 60 }, meals: [{ id: 'm1', name: 'Desayuno', items: [] }] } as Diet;
const meso: Mesocycle = { id: 'meso1', athleteId: EMAIL, number: 1, weeks: 8, startDate: '2026-10-05', objective: 'Hipertrofia', daysPerWeek: 2, groups: {} } as Mesocycle;
const rutinaDia0: Workout = { id: 'w0', ownerId: 'coach_uid', name: 'Torso', mesocycleId: 'meso1', dayIndex: 0, exercises: [{ exerciseId: 'ex1', order: 0, sets: 3, reps: '8-10', rir: 2, restSeconds: 120 }] };
const rutinaDia1: Workout = { id: 'w1', ownerId: 'coach_uid', name: 'Pierna', mesocycleId: 'meso1', dayIndex: 1, exercises: [{ exerciseId: 'ex2', order: 0, sets: 4, reps: '6-8', rir: 2, restSeconds: 150 }] };
const roadmap: Roadmap = { athleteId: EMAIL, items: [{ id: 'rmi_0', title: 'Hito viejo', type: 'hito', lane: 'general', status: 'pendiente' } as Roadmap['items'][number]] };
const programa: NutritionProgram = { athleteId: EMAIL, startDate: '2026-10-05', phases: [{ id: 'nph_0', name: 'Déficit', weeks: 8, dietId: 'd1' }], suplementos: [{ id: 'sup_0', nombre: 'Creatina' } as NonNullable<NutritionProgram['suplementos']>[number]] };

function lector(sobre: Partial<Record<keyof LectorAplicacion, unknown>> = {}): LectorAplicacion {
  return {
    dietas: async () => [dietaBase],
    mesociclos: async () => [meso],
    rutinas: async () => [rutinaDia0, rutinaDia1],
    roadmap: async () => roadmap,
    programa: async () => programa,
    perfil: async () => perfil,
    asignaciones: async () => [{ id: 'as1', athleteId: EMAIL, workoutId: 'w0', mesocycleId: 'meso1', date: '2026-10-05', status: 'completed' } as WorkoutAssignment],
    configNutricion: async () => null,
    configDieta: async () => ({ athleteId: EMAIL, activeDietIds: ['d1'] }),
    ejercicios: async () => [{ id: 'ex1', name: 'Press banca' }, { id: 'ex2', name: 'Sentadilla' }] as never,
    ...(sobre as Partial<LectorAplicacion>),
  };
}

function propuesta(kind: AiProposal['kind'], payload: unknown, extra: Partial<AiProposal> = {}): AiProposal {
  return { id: 'p1', athleteId: EMAIL, kind, status: 'proposed', chatId: 'c', summary: 'x', rationale: '', payload: payload as AiProposal['payload'], createdAt: AHORA, ...extra };
}

const ok = (r: Awaited<ReturnType<typeof aplicarPropuesta>>) => {
  if (r.ok === false) throw new Error(r.motivo);
  return r;
};

describe('aplicarPropuesta · dieta', () => {
  it('una dieta nueva se crea y el id resultante llega por referencia', async () => {
    const r = ok(await aplicarPropuesta(propuesta('diet', { athleteId: EMAIL, name: 'Nueva', objetivo: { kcal: 2200, p: 170, hc: 230, g: 65 }, budget: {}, meals: [] }), lector(), OPC));
    expect(r.operaciones.map(o => o.tipo)).toEqual(['crearDieta']);
    expect(r.resultEntityRef).toBe('dieta');
    expect(r.snapshotAntes).toEqual([]);
  });

  it('un ajuste sobre una dieta con comidas conserva las comidas y guarda la dieta entera como antes', async () => {
    const r = ok(await aplicarPropuesta(propuesta('diet', { athleteId: EMAIL, name: 'Déficit', objetivo: { kcal: 1900, p: 160, hc: 175, g: 60 }, budget: {}, meals: [] }, { baseEntityId: 'd1' }), lector(), OPC));
    const op = r.operaciones[0] as Extract<Operacion, { tipo: 'actualizarDieta' }>;
    expect(op.tipo).toBe('actualizarDieta');
    expect('meals' in op.cambios).toBe(false);
    expect(r.snapshotAntes).toEqual([{ coleccion: 'diets', id: 'd1', datos: expect.objectContaining({ name: 'Déficit', meals: dietaBase.meals }) }]);
    expect(r.resultEntityId).toBe('d1');
  });

  it('si la dieta base ya no existe, no se aplica y se dice', async () => {
    const r = await aplicarPropuesta(propuesta('diet', { athleteId: EMAIL, name: 'x', objetivo: { kcal: 1900, p: 160, hc: 175, g: 60 }, budget: {}, meals: [] }, { baseEntityId: 'nope' }), lector(), OPC);
    expect(r).toEqual({ ok: false, motivo: expect.stringMatching(/ya no existe/) });
  });
});

describe('aplicarPropuesta · periodización', () => {
  it('crea las dietas de las fases nuevas, las enlaza por referencia y conserva lo programado del programa anterior', async () => {
    const r = ok(await aplicarPropuesta(propuesta('nutritionProgram', {
      startDate: '2026-11-02',
      phases: [
        { name: 'Déficit', weeks: 8, dietId: 'd1', objetivo: 'deficit', targetKcal: 2000 },
        { name: 'Mantenimiento', weeks: 2, diet: { athleteId: EMAIL, name: 'Mant', objetivo: { kcal: 2500, p: 170, hc: 300, g: 75 }, budget: {}, meals: [] } },
      ],
    }), lector(), OPC));
    expect(r.operaciones.map(o => o.tipo)).toEqual(['crearDieta', 'guardarPrograma']);
    const prog = (r.operaciones[1] as Extract<Operacion, { tipo: 'guardarPrograma' }>).programa;
    expect(prog.phases[1].dietId).toBe('$ref:dieta_1');
    expect(prog.suplementos).toEqual(programa.suplementos);
    expect(r.snapshotAntes).toEqual([{ coleccion: 'nutritionPrograms', id: EMAIL, datos: expect.objectContaining({ startDate: '2026-10-05' }) }]);
    const resuelto = resolverReferencias(prog, { dieta_1: 'd_nueva' });
    expect(resuelto.phases[1].dietId).toBe('d_nueva');
  });

  it('resolverReferencias lanza si falta un id', () => {
    expect(() => resolverReferencias({ a: '$ref:x' }, {})).toThrow(/sin resolver/);
  });
});

describe('aplicarPropuesta · sesiones y publicación', () => {
  it('las sesiones reescriben las que ya existen por dayIndex y crean las nuevas con el ownerId del coach', async () => {
    const r = ok(await aplicarPropuesta(propuesta('workoutDays', {
      mesocycleId: 'meso1',
      days: [
        { dayIndex: 0, exercises: [{ exerciseId: 'ex1', name: 'Press banca', sets: 4, reps: '8', rir: 1, restSeconds: 120 }] },
        { dayIndex: 2, name: 'Empuje B', exercises: [{ exerciseId: 'ex2', name: 'Sentadilla', sets: 3, reps: '10', rir: 2, restSeconds: 90 }] },
      ],
    }), lector(), OPC));
    expect(r.operaciones.map(o => o.tipo)).toEqual(['actualizarRutina', 'crearRutina']);
    const nueva = r.operaciones[1] as Extract<Operacion, { tipo: 'crearRutina' }>;
    expect(nueva.rutina.ownerId).toBe('coach_uid');
    expect(nueva.rutina.name).toBe('Empuje B');
    expect(nueva.rutina.dayIndex).toBe(2);
    expect(r.snapshotAntes).toEqual([{ coleccion: 'workouts', id: 'w0', datos: expect.objectContaining({ name: 'Torso' }) }]);
    expect(r.resultEntityId).toBe('meso1');
  });

  it('publicar el bloque salta las fechas ya asignadas: volver a aprobar no duplica', async () => {
    const r = ok(await aplicarPropuesta(propuesta('publishBlock', { mesocycleId: 'meso1', mesocycleName: 'Meso 1' }), lector(), OPC));
    const fechas = r.operaciones.map(o => (o as Extract<Operacion, { tipo: 'crearAsignacion' }>).asignacion.date);
    expect(fechas).not.toContain('2026-10-05');
    expect(fechas.length).toBeGreaterThan(10);
    expect(new Set(r.operaciones.map(o => o.tipo))).toEqual(new Set(['crearAsignacion']));
  });

  it('publicar un bloque sin sesiones no se aplica', async () => {
    const r = await aplicarPropuesta(propuesta('publishBlock', { mesocycleId: 'meso1', mesocycleName: 'Meso 1' }), lector({ rutinas: async () => [] }), OPC);
    expect(r).toEqual({ ok: false, motivo: expect.stringMatching(/todavía no tiene sesiones/) });
  });
});

describe('aplicarPropuesta · configuración, road map, semana', () => {
  it('setupConfig resuelve las dietas por nombre y guarda el antes de perfil y calendario; un nombre desconocido para todo', async () => {
    const r = ok(await aplicarPropuesta(propuesta('setupConfig', { planStartDate: '2026-11-02', planDurationMonths: 6, weeklyScheduleByName: { mon: 'Déficit', sun: null } }), lector(), OPC));
    expect(r.operaciones.map(o => o.tipo)).toEqual(['actualizarPerfil', 'guardarConfigDieta']);
    const cfg = (r.operaciones[1] as Extract<Operacion, { tipo: 'guardarConfigDieta' }>).config;
    expect(cfg.weeklySchedule).toEqual({ mon: 'd1', sun: null });
    expect(r.snapshotAntes).toEqual([
      { coleccion: 'user_profiles', id: 'u_ana', datos: { planStartDate: null, planDurationMonths: 3 }, parcial: true },
      { coleccion: 'athleteDietConfigs', id: EMAIL, datos: { activeDietIds: ['d1'] } },
    ]);
    const mal = await aplicarPropuesta(propuesta('setupConfig', { activeDietNames: ['Volumen'] }), lector(), OPC);
    expect(mal).toEqual({ ok: false, motivo: expect.stringMatching(/Volumen/) });
  });

  it('el road map añade sin borrar y guarda el road map entero como antes', async () => {
    const r = ok(await aplicarPropuesta(propuesta('roadmap', { items: [{ id: 'rmi_1', title: 'Nuevo', type: 'hito', lane: 'general', status: 'pendiente' }] }), lector(), OPC));
    const rm = (r.operaciones[0] as Extract<Operacion, { tipo: 'guardarRoadmap' }>).roadmap;
    expect(rm.items.map(i => i.title)).toEqual(['Hito viejo', 'Nuevo']);
    expect(r.snapshotAntes[0]).toEqual({ coleccion: 'roadmaps', id: EMAIL, datos: { items: roadmap.items } });
  });

  it('un día señalado son tres cosas: hito, tarea y nota en la sesión de ese día', async () => {
    const r = ok(await aplicarPropuesta(propuesta('specialDay', { date: '2026-10-05', kind: 'amrap', title: 'AMRAP', athleteNote: 'Hoy al fallo', description: '' }), lector(), OPC));
    expect(r.operaciones.map(o => o.tipo)).toEqual(['guardarRoadmap', 'crearTarea', 'actualizarAsignacion']);
    expect(r.snapshotAntes.find(f => f.coleccion === 'workoutAssignments')).toEqual({ coleccion: 'workoutAssignments', id: 'as1', datos: { note: null }, parcial: true });
  });

  it('la semana programada reescribe solo las rutinas que cambian y guarda su antes', async () => {
    const r = ok(await aplicarPropuesta(propuesta('weekPlan', { mesocycleId: 'meso1', rir: { desde: 3, hasta: 1 } }), lector(), OPC));
    const rutinas = r.operaciones.filter(o => o.tipo === 'actualizarRutina');
    expect(rutinas).toHaveLength(2);
    expect(r.operaciones.at(-1)?.tipo).toBe('actualizarMesociclo');
    expect(r.snapshotAntes.map(f => `${f.coleccion}/${f.id}`)).toEqual(['workouts/w0', 'workouts/w1', 'mesocycles/meso1']);
  });

  it('el bloque con revisiones crea el mesociclo y una tarea por revisión', async () => {
    const r = ok(await aplicarPropuesta(propuesta('periodizationBlock', { mesocycle: { ...meso, weeks: 8 }, reviewCadenceWeeks: 4, reviewType: 'revision' }), lector(), OPC));
    expect(r.operaciones.map(o => o.tipo)).toEqual(['crearMesociclo', 'crearTarea', 'crearTarea']);
    expect(r.resultEntityRef).toBe('meso');
  });

  it('el reto lleva el id de la semana ISO y el feedback del check-in guarda el texto anterior', async () => {
    const reto = ok(await aplicarPropuesta(propuesta('weeklyChallenge', { kind: 'pasos_media', title: 'Pasos', description: '', metric: { target: 8000 }, today: '2026-10-29' }), lector(), OPC));
    expect(reto.resultEntityId).toBe(`${EMAIL}_2026-W44`);
    const fb = ok(await aplicarPropuesta(propuesta('checkinFeedback', { checkInId: 'ck1', feedback: 'Bien' }), lector({ checkin: async () => ({ id: 'ck1', coachFeedback: 'viejo', approved: false } as never) }), OPC));
    expect(fb.snapshotAntes).toEqual([{ coleccion: 'checkins', id: 'ck1', datos: { coachFeedback: 'viejo', approved: false, approvedAt: null }, parcial: true }]);
  });

  it('lo que hizo el latido no se vuelve a aplicar', async () => {
    const r = await aplicarPropuesta(propuesta('latido', { fecha: '2026-10-29', acciones: [] }), lector(), OPC);
    expect(r.ok).toBe(false);
  });

  it('esCreacion distingue lo que necesita id nuevo', () => {
    expect(esCreacion({ tipo: 'crearDieta', ref: 'x', dieta: {} as never })).toBe(true);
    expect(esCreacion({ tipo: 'actualizarDieta', id: 'd', cambios: {} })).toBe(false);
  });
});
