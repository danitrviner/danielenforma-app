import { describe, it, expect } from 'vitest';
import { revisarCalidadDelPlan, defectosQueBloquean, mesoEnCurso, EntradaCalidadDelPlan } from './calidadDelPlan';
import { MUSCLE_ORDER } from '../types';
import type {
  Mesocycle, MuscleGroup, MuscleGroupConfig, UserProfile, Workout, Diet,
  AthleteDietConfig, QuestionnaireAssignment, PhotoAssignment, Roadmap,
} from '../types';

const HOY = '2026-09-16';

const PERFIL = {
  userId: 'u1', email: 'ana@x.com', displayName: 'Ana', role: 'client',
  planStartDate: '2026-09-01', planDurationMonths: 3,
} as UserProfile;

function grupos(parcial: Partial<Record<MuscleGroup, MuscleGroupConfig>>): Record<MuscleGroup, MuscleGroupConfig> {
  const base = {} as Record<MuscleGroup, MuscleGroupConfig>;
  for (const g of MUSCLE_ORDER) base[g] = { series: 0, priority: 'baja' };
  return { ...base, ...parcial };
}

const MESO: Mesocycle = {
  id: 'm1', athleteId: 'ana@x.com', number: 1, name: 'Bloque 1',
  weeks: 5, startDate: '2026-09-07', objective: 'Hipertrofia', daysPerWeek: 4,
  groups: grupos({ pecho: { series: 12, priority: 'alta' } }),
} as Mesocycle;

function sesion(id: string, name: string, ejercicios: number, mesocycleId = 'm1'): Workout {
  return {
    id, ownerId: 'coach', name, mesocycleId,
    exercises: Array.from({ length: ejercicios }, () => ({ exerciseId: 'e', sets: 3 })),
  } as unknown as Workout;
}

function entrada(parcial: Partial<EntradaCalidadDelPlan> = {}): EntradaCalidadDelPlan {
  return {
    profile: PERFIL,
    mesocycles: [MESO],
    workouts: [sesion('w1', 'Día 1', 5), sesion('w2', 'Día 2', 4)],
    diets: [],
    dietConfig: null,
    qAssignments: [],
    photoAssignments: [],
    roadmap: { athleteId: 'ana@x.com', items: [{ id: 'h1', title: 'Hito', targetDate: '2026-09-20' }] } as Roadmap,
    today: HOY,
    ...parcial,
  };
}

const ids = (e: EntradaCalidadDelPlan) => revisarCalidadDelPlan(e).map(d => d.id);

describe('revisarCalidadDelPlan · un plan bien montado no dice nada', () => {
  it('sin defectos, la lista sale vacía', () => {
    expect(revisarCalidadDelPlan(entrada())).toEqual([]);
  });
});

describe('revisarCalidadDelPlan · entrenamiento', () => {
  it('caza el grupo con prioridad alta y cero series', () => {
    const meso = { ...MESO, groups: grupos({ pecho: { series: 0, priority: 'alta' } }) };
    const d = revisarCalidadDelPlan(entrada({ mesocycles: [meso] }));
    expect(d.map(x => x.id)).toContain('prioritarios_a_cero');
    expect(d.find(x => x.id === 'prioritarios_a_cero')!.titulo).toContain('Pecho');
  });

  it('una sesión sin ejercicios bloquea, y se dice cuál', () => {
    const d = revisarCalidadDelPlan(entrada({
      workouts: [sesion('w1', 'Día 1', 5), sesion('w2', 'Día 2', 0)],
    }));
    const fallo = d.find(x => x.id === 'sesiones_vacias')!;
    expect(fallo.gravedad).toBe('bloquea');
    expect(fallo.titulo).toBe('Una sesión sin ejercicios: Día 2');
    expect(fallo.consecuencia).toContain('Al abrirla ');
  });

  it('con varias vacías concuerda en plural y las lista', () => {
    const d = revisarCalidadDelPlan(entrada({
      workouts: [sesion('w1', 'Día 1', 0), sesion('w2', 'Día 2', 0)],
    }));
    expect(d.find(x => x.id === 'sesiones_vacias')!.titulo)
      .toBe('2 sesiones sin ejercicios: Día 1 y Día 2');
  });

  it('un bloque sin ninguna sesión bloquea', () => {
    expect(ids(entrada({ workouts: [] }))).toContain('bloque_sin_sesiones');
  });

  it('no mira las sesiones de OTROS bloques', () => {
    // Sesiones vacías pero de un mesociclo que no es el que está en curso.
    expect(ids(entrada({ workouts: [sesion('w9', 'Vieja', 0, 'm0')] })))
      .toContain('bloque_sin_sesiones');
    expect(ids(entrada({ workouts: [sesion('w9', 'Vieja', 0, 'm0')] })))
      .not.toContain('sesiones_vacias');
  });

  it('sin bloque en curso no se inventa nada de entrenamiento', () => {
    const viejo = { ...MESO, startDate: '2026-01-01' };
    const d = ids(entrada({ mesocycles: [viejo], workouts: [] }));
    expect(d).not.toContain('bloque_sin_sesiones');
    expect(d).not.toContain('prioritarios_a_cero');
  });
});

describe('revisarCalidadDelPlan · nutrición', () => {
  const dieta = (id: string, comidas: number): Diet =>
    ({ id, athleteId: 'ana@x.com', name: `Dieta ${id}`, budget: {}, meals: Array(comidas).fill({}) } as unknown as Diet);

  it('una dieta activa sin comidas bloquea', () => {
    const d = revisarCalidadDelPlan(entrada({
      diets: [dieta('d1', 0)],
      dietConfig: { athleteId: 'ana@x.com', activeDietIds: ['d1'] } as AthleteDietConfig,
    }));
    const fallo = d.find(x => x.id === 'dieta_activa_sin_comidas')!;
    expect(fallo.gravedad).toBe('bloquea');
  });

  it('una dieta activa que ya no existe bloquea', () => {
    expect(ids(entrada({
      diets: [],
      dietConfig: { athleteId: 'ana@x.com', activeDietIds: ['borrada'] } as AthleteDietConfig,
    }))).toContain('dieta_activa_borrada');
  });

  it('avisa de los días sueltos sin dieta, pero no de un calendario aún vacío', () => {
    const aMedias = {
      athleteId: 'ana@x.com', activeDietIds: [],
      weeklySchedule: { mon: 'd1', tue: 'd1', wed: 'd1' },
    } as unknown as AthleteDietConfig;
    const d = revisarCalidadDelPlan(entrada({ dietConfig: aMedias }));
    const fallo = d.find(x => x.id === 'dias_sin_dieta')!;
    expect(fallo.titulo).toContain('jueves');
    expect(fallo.titulo).toContain('domingo');

    // Calendario entero vacío: de eso ya avisa la checklist, aquí sería ruido.
    const vacio = { athleteId: 'ana@x.com', activeDietIds: [], weeklySchedule: {} } as unknown as AthleteDietConfig;
    expect(ids(entrada({ dietConfig: vacio }))).not.toContain('dias_sin_dieta');
  });
});

describe('revisarCalidadDelPlan · seguimiento', () => {
  const asignacion = (schedule: unknown): QuestionnaireAssignment =>
    ({ id: 'a1', questionnaireId: 'q1', athleteId: 'ana@x.com', active: true,
       startDate: '2026-09-01', createdAt: '', schedule } as QuestionnaireAssignment);

  it('«cada N días» sin N no se dispara nunca: bloquea', () => {
    expect(ids(entrada({ qAssignments: [asignacion({ type: 'interval' })] })))
      .toContain('cuestionario_sin_cadencia');
  });

  it('«los martes» sin ningún día marcado tampoco', () => {
    expect(ids(entrada({ qAssignments: [asignacion({ type: 'weekdays', weekdays: [] })] })))
      .toContain('cuestionario_sin_cadencia');
  });

  it('pedirlo UNA vez es una decisión legítima, no un defecto', () => {
    expect(ids(entrada({ qAssignments: [asignacion({ type: 'once' })] })))
      .not.toContain('cuestionario_sin_cadencia');
  });

  it('una cadencia completa no molesta', () => {
    expect(ids(entrada({ qAssignments: [asignacion({ type: 'interval', intervalDays: 14 })] })))
      .not.toContain('cuestionario_sin_cadencia');
  });

  it('fotos activas sin ninguna vista elegida', () => {
    const fotos = [{ id: 'p1', athleteId: 'ana@x.com', active: true, views: [], startDate: '', createdAt: '', schedule: { type: 'once' } }] as unknown as PhotoAssignment[];
    expect(ids(entrada({ photoAssignments: fotos }))).toContain('fotos_sin_vistas');
  });
});

describe('revisarCalidadDelPlan · el plan como conjunto', () => {
  it('fecha de inicio sin duración', () => {
    const sinFin = { ...PERFIL, planDurationMonths: undefined } as UserProfile;
    expect(ids(entrada({ profile: sinFin }))).toContain('plan_sin_fin');
  });

  it('un bloque sin ningún hito dentro', () => {
    expect(ids(entrada({ roadmap: { athleteId: 'ana@x.com', items: [] } as Roadmap })))
      .toContain('bloque_sin_hitos');
  });

  it('un hito FUERA del bloque no cuenta como hito del bloque', () => {
    const fuera = { athleteId: 'ana@x.com', items: [{ id: 'h', title: 'Tarde', targetDate: '2027-01-01' }] } as Roadmap;
    expect(ids(entrada({ roadmap: fuera }))).toContain('bloque_sin_hitos');
  });

  it('separa lo que rompe de lo que solo hay que mirar', () => {
    const d = revisarCalidadDelPlan(entrada({
      workouts: [sesion('w1', 'Día 1', 0)],
      profile: { ...PERFIL, planDurationMonths: undefined } as UserProfile,
    }));
    expect(defectosQueBloquean(d).map(x => x.id)).toEqual(['sesiones_vacias']);
    expect(d.length).toBeGreaterThan(1);
  });
});

describe('mesoEnCurso', () => {
  it('el último día del bloque todavía cuenta', () => {
    // 07-09 + 5 semanas = hasta el 11-10 inclusive.
    expect(mesoEnCurso([MESO], '2026-10-11')?.id).toBe('m1');
    expect(mesoEnCurso([MESO], '2026-10-12')).toBeNull();
  });

  it('un bloque sin fecha de inicio no está en curso', () => {
    expect(mesoEnCurso([{ ...MESO, startDate: '' }], HOY)).toBeNull();
  });
});
