import { describe, expect, it } from 'vitest';
import { TaskItem, WorkoutAssignment, Mesocycle, Exercise, Workout, NutritionProgram } from '../types';
import { deriveReviewEvents, weekAdherence, deriveVolumeIncreaseEvents, deriveKcalChangeEvents, deriveDeloadEvents, detectConflicts, PlanEvent } from './planEvents';

const baseTask: TaskItem = {
  id: 't1', athleteId: 'atleta@enforma.com', type: 'revision', title: 'Revisión semanal',
  dueDate: '2026-08-22', status: 'pending', createdBy: 'system', createdAt: '2026-08-15T00:00:00.000Z',
};

describe('deriveReviewEvents', () => {
  it('una tarea pendiente con fecha futura es "programado"', () => {
    const events = deriveReviewEvents([{ ...baseTask, dueDate: '2026-09-01' }], '2026-08-22');
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('programado');
  });

  it('una tarea pendiente con fecha pasada es "vencido"', () => {
    const events = deriveReviewEvents([{ ...baseTask, dueDate: '2026-08-01' }], '2026-08-22');
    expect(events[0].status).toBe('vencido');
  });

  it('una tarea completada es "hecho" aunque su fecha ya haya pasado', () => {
    const events = deriveReviewEvents([{ ...baseTask, dueDate: '2026-08-01', status: 'done' }], '2026-08-22');
    expect(events[0].status).toBe('hecho');
  });

  it('excluye tareas sin fecha', () => {
    const events = deriveReviewEvents([{ ...baseTask, dueDate: undefined }], '2026-08-22');
    expect(events).toHaveLength(0);
  });

  it('excluye tareas manuales/otro — no son revisiones programadas con el atleta', () => {
    const events = deriveReviewEvents([
      { ...baseTask, type: 'manual' },
      { ...baseTask, id: 't2', type: 'otro' },
    ], '2026-08-22');
    expect(events).toHaveLength(0);
  });

  it('asigna el icono correcto por tipo', () => {
    const events = deriveReviewEvents([
      { ...baseTask, id: 'a', type: 'revision' },
      { ...baseTask, id: 'b', type: 'cuestionario' },
      { ...baseTask, id: 'c', type: 'foto' },
    ], '2026-08-22');
    expect(events.map(e => e.icon)).toEqual(['fact_check', 'quiz', 'photo_camera']);
  });
});

describe('weekAdherence', () => {
  const mk = (date: string, status: WorkoutAssignment['status']): WorkoutAssignment => ({
    id: date + status, workoutId: 'w1', athleteId: 'a1', date, status,
  });

  it('semana futura', () => {
    expect(weekAdherence([], '2026-09-01', '2026-09-08', '2026-08-22')).toBe('futuro');
  });

  it('semana pasada sin assignments', () => {
    expect(weekAdherence([], '2026-08-01', '2026-08-08', '2026-08-22')).toBe('sin-datos');
  });

  it('alta adherencia (>=80%)', () => {
    const assignments = [mk('2026-08-03', 'completed'), mk('2026-08-04', 'completed'), mk('2026-08-05', 'completed'), mk('2026-08-06', 'completed')];
    expect(weekAdherence(assignments, '2026-08-01', '2026-08-08', '2026-08-22')).toBe('alta');
  });

  it('adherencia media (50-79%)', () => {
    const assignments = [mk('2026-08-03', 'completed'), mk('2026-08-04', 'pending')];
    expect(weekAdherence(assignments, '2026-08-01', '2026-08-08', '2026-08-22')).toBe('media');
  });

  it('baja adherencia (<50%)', () => {
    const assignments = [mk('2026-08-03', 'completed'), mk('2026-08-04', 'pending'), mk('2026-08-05', 'pending')];
    expect(weekAdherence(assignments, '2026-08-01', '2026-08-08', '2026-08-22')).toBe('baja');
  });

  it('ignora assignments fuera del rango de la semana', () => {
    const assignments = [mk('2026-07-31', 'completed'), mk('2026-08-08', 'completed')];
    expect(weekAdherence(assignments, '2026-08-01', '2026-08-08', '2026-08-22')).toBe('sin-datos');
  });
});

describe('deriveVolumeIncreaseEvents', () => {
  const meso: Mesocycle = {
    id: 'm1', athleteId: 'a1', number: 1, weeks: 8, startDate: '2026-08-01',
    objective: '', daysPerWeek: 3, groups: {} as any,
  };
  const exercises: Exercise[] = [{ id: 'ex1', ownerId: 'c1', name: 'Press banca', primaryFocus: 'pecho', type: 'fuerza', isCustom: false }];
  const workout: Workout = {
    id: 'w1', ownerId: 'c1', name: 'Día 1', mesocycleId: 'm1',
    exercises: [{
      exerciseId: 'ex1', order: 0, sets: 3, reps: '8-10', restSeconds: 90, rir: 2,
      weeklyProgression: [{ atWeek: 4, addSets: 1 }],
    }],
  };

  it('calcula la fecha del escalón a partir del inicio del mesociclo', () => {
    const events = deriveVolumeIncreaseEvents([workout], exercises, meso, '2026-08-01');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ lane: 'entrenamiento', date: '2026-08-22', title: '+1 serie: Press banca' });
  });

  it('marca "hecho" si la fecha ya pasó, "programado" si no', () => {
    expect(deriveVolumeIncreaseEvents([workout], exercises, meso, '2026-09-01')[0].status).toBe('hecho');
    expect(deriveVolumeIncreaseEvents([workout], exercises, meso, '2026-08-01')[0].status).toBe('programado');
  });

  it('ignora workouts de otros mesociclos', () => {
    const otro = { ...workout, mesocycleId: 'm2' };
    expect(deriveVolumeIncreaseEvents([otro], exercises, meso, '2026-08-01')).toEqual([]);
  });

  it('sin reglas de progresión, no genera eventos', () => {
    const sinReglas = { ...workout, exercises: [{ ...workout.exercises[0], weeklyProgression: undefined }] };
    expect(deriveVolumeIncreaseEvents([sinReglas], exercises, meso, '2026-08-01')).toEqual([]);
  });

  describe('condición (Bloque H2.2)', () => {
    const conditionalWorkout: Workout = {
      ...workout,
      exercises: [{
        ...workout.exercises[0],
        weeklyProgression: [{ atWeek: 4, addSets: 1, condition: { rows: [{ metric: 'adherenciaDieta', operator: '>=', value: 80 }], fallback: 'mantener' } }],
      }],
    };

    it('sin regla de progresión con condición, "conditional" no aparece', () => {
      expect(deriveVolumeIncreaseEvents([workout], exercises, meso, '2026-08-01')[0].conditional).toBeUndefined();
    });

    it('sin conditionData, se marca como no cumplida a lo seguro', () => {
      expect(deriveVolumeIncreaseEvents([conditionalWorkout], exercises, meso, '2026-08-01')[0].conditional).toEqual({ met: false });
    });

    it('con conditionData que sí cumple, se marca cumplida', () => {
      const events = deriveVolumeIncreaseEvents([conditionalWorkout], exercises, meso, '2026-08-01', {
        workoutAssignments: [], workoutLogs: [], bodyweightLogs: [], dietAdherencePct: 90,
      });
      expect(events[0].conditional).toEqual({ met: true });
    });

    it('con conditionData que no cumple, se marca no cumplida', () => {
      const events = deriveVolumeIncreaseEvents([conditionalWorkout], exercises, meso, '2026-08-01', {
        workoutAssignments: [], workoutLogs: [], bodyweightLogs: [], dietAdherencePct: 50,
      });
      expect(events[0].conditional).toEqual({ met: false });
    });
  });
});

describe('deriveKcalChangeEvents', () => {
  const program: NutritionProgram = {
    athleteId: 'a1', startDate: '2026-08-01',
    phases: [
      { id: 'ph1', name: 'Fase 1', weeks: 4, dietId: 'd1', targetKcal: 2500 },
      { id: 'ph2', name: 'Fase 2', weeks: 4, dietId: 'd2', targetKcal: 2300 },
      { id: 'ph3', name: 'Fase 3', weeks: 4, dietId: 'd3', targetKcal: 2300 },
      { id: 'ph4', name: 'Fase 4', weeks: 4, dietId: 'd4' },
    ],
  };

  it('null → sin eventos', () => {
    expect(deriveKcalChangeEvents(null, '2026-08-01')).toEqual([]);
  });

  it('marca un evento solo cuando el kcal objetivo cambia respecto a la fase anterior', () => {
    const events = deriveKcalChangeEvents(program, '2026-08-01');
    // ph1 no tiene fase anterior; ph2 baja 200 kcal; ph3 igual que ph2 (sin cambio);
    // ph4 no define targetKcal (hereda de la dieta) → no hay número que comparar.
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ lane: 'nutricion', date: '2026-08-29', title: '-200 kcal: Fase 2' });
  });

  it('un aumento de kcal se marca con signo positivo', () => {
    const up: NutritionProgram = {
      ...program,
      phases: [
        { id: 'ph1', name: 'Fase 1', weeks: 2, dietId: 'd1', targetKcal: 2200 },
        { id: 'ph2', name: 'Fase 2', weeks: 2, dietId: 'd2', targetKcal: 2500 },
      ],
    };
    expect(deriveKcalChangeEvents(up, '2026-08-01')[0].title).toBe('+300 kcal: Fase 2');
  });

  it('marca "hecho" si la fecha ya pasó, "programado" si no', () => {
    expect(deriveKcalChangeEvents(program, '2026-09-01')[0].status).toBe('hecho');
    expect(deriveKcalChangeEvents(program, '2026-08-01')[0].status).toBe('programado');
  });
});

describe('deriveDeloadEvents', () => {
  const meso: Mesocycle = {
    id: 'm1', athleteId: 'a1', number: 1, weeks: 8, startDate: '2026-08-01',
    objective: '', daysPerWeek: 3, groups: {} as any,
  };

  it('sin deloadWeek, no genera marcador', () => {
    expect(deriveDeloadEvents([meso], '2026-08-01')).toEqual([]);
  });

  it('calcula la fecha de la semana de descarga a partir del inicio del meso', () => {
    const events = deriveDeloadEvents([{ ...meso, deloadWeek: 8 }], '2026-08-01');
    expect(events).toHaveLength(1);
    // semana 8 = 7 semanas después del inicio = 2026-08-01 + 49 días
    expect(events[0]).toMatchObject({ lane: 'entrenamiento', date: '2026-09-19', title: 'Descarga: Mes. 1' });
  });

  it('marca "hecho" si la fecha ya pasó, "programado" si no', () => {
    const withDeload = { ...meso, deloadWeek: 8 };
    expect(deriveDeloadEvents([withDeload], '2026-10-01')[0].status).toBe('hecho');
    expect(deriveDeloadEvents([withDeload], '2026-08-01')[0].status).toBe('programado');
  });
});

describe('detectConflicts', () => {
  const ev = (date: string, lane: PlanEvent['lane'] = 'entrenamiento'): PlanEvent =>
    ({ id: date + lane, lane, date, title: 't', status: 'programado', icon: 'i' });

  it('sin eventos ni mesociclos, no hay conflictos', () => {
    expect(detectConflicts([], [], [])).toEqual([]);
  });

  it('dos subidas de volumen en semanas consecutivas', () => {
    const conflicts = detectConflicts([ev('2026-08-03'), ev('2026-08-10')], [], []);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].message).toMatch(/semanas seguidas/);
  });

  it('subidas de volumen NO consecutivas no generan conflicto', () => {
    expect(detectConflicts([ev('2026-08-03'), ev('2026-08-24')], [], [])).toEqual([]);
  });

  it('fin de mesociclo sin revisión cercana', () => {
    const meso: Mesocycle = { id: 'm1', athleteId: 'a1', number: 1, weeks: 4, startDate: '2026-08-01', objective: '', daysPerWeek: 3, groups: {} as any };
    const conflicts = detectConflicts([], [], [meso]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].message).toMatch(/Fin del mesociclo #1/);
  });

  it('fin de mesociclo CON revisión cercana no genera conflicto', () => {
    const meso: Mesocycle = { id: 'm1', athleteId: 'a1', number: 1, weeks: 4, startDate: '2026-08-01', objective: '', daysPerWeek: 3, groups: {} as any };
    // fin = 2026-08-29
    expect(detectConflicts([], [ev('2026-08-30', 'revisiones')], [meso])).toEqual([]);
  });

  it('subida de volumen la misma semana que un recorte de kcal', () => {
    const kcal: PlanEvent = { id: 'k1', lane: 'nutricion', date: '2026-08-03', title: '-200 kcal: Fase 2', status: 'programado', icon: 'trending_down' };
    const conflicts = detectConflicts([ev('2026-08-04')], [], [], [kcal]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].message).toMatch(/recorte de kcal/);
  });

  it('subida de volumen la misma semana que una SUBIDA de kcal no genera conflicto', () => {
    const kcal: PlanEvent = { id: 'k1', lane: 'nutricion', date: '2026-08-03', title: '+300 kcal: Fase 2', status: 'programado', icon: 'trending_up' };
    expect(detectConflicts([ev('2026-08-04')], [], [], [kcal])).toEqual([]);
  });

  it('subida de volumen y recorte de kcal en semanas distintas no generan conflicto', () => {
    const kcal: PlanEvent = { id: 'k1', lane: 'nutricion', date: '2026-08-24', title: '-200 kcal: Fase 2', status: 'programado', icon: 'trending_down' };
    expect(detectConflicts([ev('2026-08-04')], [], [], [kcal])).toEqual([]);
  });

  it('revisión programada en semana de descarga', () => {
    const deload: PlanEvent = { id: 'd1', lane: 'entrenamiento', date: '2026-09-19', title: 'Descarga: Mes. 1', status: 'programado', icon: 'trending_down' };
    const conflicts = detectConflicts([], [ev('2026-09-22', 'revisiones')], [], [], [deload]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].message).toMatch(/semana de descarga/);
  });

  it('revisión fuera de la semana de descarga no genera conflicto', () => {
    const deload: PlanEvent = { id: 'd1', lane: 'entrenamiento', date: '2026-09-19', title: 'Descarga: Mes. 1', status: 'programado', icon: 'trending_down' };
    expect(detectConflicts([], [ev('2026-09-30', 'revisiones')], [], [], [deload])).toEqual([]);
  });
});
