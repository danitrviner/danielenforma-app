import { describe, it, expect } from 'vitest';
import { planificarLatido, FotoDelAtleta, DIAS_PARA_DARSE_POR_PERDIDA } from './latidoDiario';
import { addDays } from './trainingWeek';
import type {
  UserProfile, WorkoutAssignment, NutritionProgram, AthleteDietConfig,
} from '../types';

const HOY = '2026-09-16';
const COACH = 'coach@x.com';
const OPCIONES = { hoy: HOY, coachEmail: COACH, ahoraIso: '2026-09-16T02:00:00.000Z' };

const PERFIL = {
  userId: 'u1', email: 'ana@x.com', displayName: 'Ana Ruiz', role: 'client', level: 0,
} as UserProfile;

function foto(parcial: Partial<FotoDelAtleta> = {}): FotoDelAtleta {
  return {
    profile: PERFIL,
    assignments: [], workoutLogs: [], bodyweightLogs: [], stepLogs: [], exercises: [],
    nutritionProgram: null, dietConfig: null, roadmap: null,
    ...parcial,
  };
}

function asignacion(date: string, status: WorkoutAssignment['status'] = 'pending'): WorkoutAssignment {
  return { id: `as_${date}`, athleteId: 'u1', workoutId: 'w', date, status } as WorkoutAssignment;
}

const tipos = (r: ReturnType<typeof planificarLatido>) => r.acciones.map(a => a.tipo);

describe('planificarLatido · sesiones perdidas', () => {
  it('marca las pendientes de hace más de una semana', () => {
    const vieja = addDays(HOY, -(DIAS_PARA_DARSE_POR_PERDIDA + 1));
    const r = planificarLatido(foto({ assignments: [asignacion(vieja)] }), OPCIONES);
    expect(r.acciones).toEqual([
      { tipo: 'marcar_sesion_perdida', assignmentId: `as_${vieja}`, fecha: vieja },
    ]);
  });

  it('la línea del resumen concuerda en singular y en plural', () => {
    const una = planificarLatido(
      foto({ assignments: [asignacion(addDays(HOY, -20))] }), OPCIONES,
    );
    expect(una.resumen).toEqual(['1 sesión marcada como perdida']);

    const dos = planificarLatido(
      foto({ assignments: [asignacion(addDays(HOY, -20)), asignacion(addDays(HOY, -25))] }),
      OPCIONES,
    );
    expect(dos.resumen).toEqual(['2 sesiones marcadas como perdidas']);
  });

  it('respeta el margen: justo en el corte todavía se puede recuperar', () => {
    const enElCorte = addDays(HOY, -DIAS_PARA_DARSE_POR_PERDIDA);
    const r = planificarLatido(foto({ assignments: [asignacion(enElCorte)] }), OPCIONES);
    expect(r.acciones).toHaveLength(0);
  });

  it('no toca las que ya están hechas ni las que ya están perdidas', () => {
    const vieja = addDays(HOY, -30);
    const r = planificarLatido(foto({
      assignments: [asignacion(vieja, 'completed'), asignacion(`${vieja}b` as string, 'perdido')],
    }), OPCIONES);
    expect(r.acciones).toHaveLength(0);
  });
});

describe('planificarLatido · fase de nutrición', () => {
  const programa: NutritionProgram = {
    athleteId: 'ana@x.com', startDate: '2026-09-01',
    phases: [
      { id: 'f1', name: 'Déficit', weeks: 2, dietId: 'dieta_deficit' },
      { id: 'f2', name: 'Mantenimiento', weeks: 2, dietId: 'dieta_mant' },
    ],
  } as unknown as NutritionProgram;

  it('activa la dieta de la fase que toca y avisa a los dos', () => {
    // 16-09 cae en la segunda fase (empieza el 15).
    const r = planificarLatido(foto({ nutritionProgram: programa }), OPCIONES);
    expect(tipos(r)).toEqual(['activar_dieta', 'marcar_fase_vista', 'aviso', 'aviso']);
    const activar = r.acciones[0];
    expect(activar).toMatchObject({ activeDietIds: ['dieta_mant'] });
    const avisos = r.acciones.filter(a => a.tipo === 'aviso');
    expect(avisos.map(a => (a as { notificacion: { recipientEmail: string } }).notificacion.recipientEmail))
      .toEqual(['ana@x.com', COACH]);
  });

  it('si la dieta ya está puesta y la fase ya se vio, no escribe nada', () => {
    const config = { athleteId: 'ana@x.com', activeDietIds: ['dieta_mant'] } as AthleteDietConfig;
    const r = planificarLatido(foto({
      nutritionProgram: { ...programa, lastSeenPhaseId: 'f2' },
      dietConfig: config,
    }), OPCIONES);
    expect(r.acciones).toHaveLength(0);
  });

  it('con la dieta puesta pero la fase sin ver, avisa sin reescribir la dieta', () => {
    const config = { athleteId: 'ana@x.com', activeDietIds: ['dieta_mant'] } as AthleteDietConfig;
    const r = planificarLatido(foto({ nutritionProgram: programa, dietConfig: config }), OPCIONES);
    expect(tipos(r)).toEqual(['marcar_fase_vista', 'aviso', 'aviso']);
  });

  it('fuera del programa no hay fase y no se toca nada', () => {
    const r = planificarLatido(
      foto({ nutritionProgram: programa }),
      { ...OPCIONES, hoy: '2026-12-01' },
    );
    expect(r.acciones).toHaveLength(0);
  });
});

describe('planificarLatido · idempotencia', () => {
  it('pasarlo dos veces sobre la misma foto da exactamente lo mismo', () => {
    const f = foto({
      assignments: [asignacion(addDays(HOY, -20))],
      nutritionProgram: {
        athleteId: 'ana@x.com', startDate: '2026-09-01',
        phases: [{ id: 'f1', name: 'Déficit', weeks: 8, dietId: 'd1' }],
      } as unknown as NutritionProgram,
    });
    expect(planificarLatido(f, OPCIONES)).toEqual(planificarLatido(f, OPCIONES));
  });

  it('los avisos llevan clave de deduplicación, no se anuncian dos veces', () => {
    const f = foto({
      nutritionProgram: {
        athleteId: 'ana@x.com', startDate: '2026-09-01',
        phases: [{ id: 'f1', name: 'Déficit', weeks: 8, dietId: 'd1' }],
      } as unknown as NutritionProgram,
    });
    const claves = planificarLatido(f, OPCIONES).acciones
      .filter(a => a.tipo === 'aviso')
      .map(a => (a as { dedupeKey: string }).dedupeKey);
    expect(claves).toEqual(['notif_np_ana@x.com_f1_athlete', 'notif_np_ana@x.com_f1_coach']);
    expect(new Set(claves).size).toBe(claves.length);
  });

  it('un atleta sin nada devuelve cero acciones y cero resumen', () => {
    const r = planificarLatido(foto(), OPCIONES);
    expect(r.acciones).toEqual([]);
    expect(r.resumen).toEqual([]);
  });
});
