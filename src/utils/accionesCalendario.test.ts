import { describe, it, expect } from 'vitest';
import {
  planificarPlantillaMeso, finDePlantilla, insertarFaseNutricion,
  construirCarrilVolumen, semanasDelMes, alternarRefeeds, refeedDe,
} from './accionesCalendario';
import { MesocycleTemplate, NutritionProgram, Workout, Exercise, WorkoutAssignment, Mesocycle, MuscleGroup, MuscleGroupConfig } from '../types';

const grupos = () => ({ pecho: { series: 12, priority: 'alta' } } as unknown as Record<MuscleGroup, MuscleGroupConfig>);

const TPL: MesocycleTemplate = {
  id: 'tpl1', ownerId: 'coach', name: 'Fuerza → Hipertrofia',
  stages: [
    { id: 's1', name: 'Fuerza base', weeks: 4, daysPerWeek: 4, groups: grupos(), reviewCadenceWeeks: 2, reviewType: 'revision' },
    { id: 's2', name: 'Hipertrofia', weeks: 6, daysPerWeek: 4, groups: grupos(), deloadWeek: 6 },
    { id: 's3', name: 'Descarga', weeks: 2, daysPerWeek: 3, groups: grupos() },
  ],
};

describe('planificarPlantillaMeso', () => {
  it('encadena las etapas por semanas completas sin perder días', () => {
    const { mesociclos } = planificarPlantillaMeso(TPL, 'a@b.com', '2026-09-07', 3, 'prog1');
    expect(mesociclos.map(m => m.startDate)).toEqual(['2026-09-07', '2026-10-05', '2026-11-16']);
    expect(mesociclos.map(m => m.number)).toEqual([3, 4, 5]);
    expect(mesociclos.map(m => m.programOrder)).toEqual([0, 1, 2]);
  });

  it('no se come un día por etapa al cruzar el cambio de hora (el bug de toISOString)', () => {
    // El último domingo de octubre España pasa de CEST a CET. Con el avance
    // por toISOString, la etapa 3 caía el 15/11 en vez del 16.
    const { mesociclos } = planificarPlantillaMeso(TPL, 'a@b.com', '2026-09-07', 1, 'p');
    const dias = (a: string, b: string) => Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000);
    expect(dias(mesociclos[0].startDate, mesociclos[1].startDate)).toBe(28);
    expect(dias(mesociclos[1].startDate, mesociclos[2].startDate)).toBe(42);
  });

  it('conserva la semana de descarga y los días predefinidos de la etapa', () => {
    const { mesociclos } = planificarPlantillaMeso(TPL, 'a@b.com', '2026-01-05', 1, 'p');
    expect(mesociclos[1].deloadWeek).toBe(6);
    expect(mesociclos[0].deloadWeek).toBeUndefined();
  });

  it('crea las revisiones de la cadencia, con fecha y solo en la etapa que la declara', () => {
    const { revisiones } = planificarPlantillaMeso(TPL, 'a@b.com', '2026-09-07', 1, 'p');
    expect(revisiones).toHaveLength(2);
    expect(revisiones.map(r => r.dueDate)).toEqual(['2026-09-21', '2026-10-05']);
    expect(revisiones[0].title).toBe('Revisión — Fuerza base');
    expect(revisiones[0].athleteId).toBe('a@b.com');
  });

  it('finDePlantilla cae el último día, no el primero del siguiente bloque', () => {
    expect(finDePlantilla(TPL, '2026-09-07')).toBe('2026-11-29');
  });
});

const PROGRAMA: NutritionProgram = {
  athleteId: 'a@b.com', startDate: '2026-09-07',
  phases: [
    { id: 'f1', name: 'Mantenimiento', weeks: 4, dietId: 'd1', targetKcal: 2600 },
    { id: 'f2', name: 'Déficit', weeks: 8, dietId: 'd2', targetKcal: 2200 },
  ],
};

describe('insertarFaseNutricion', () => {
  it('parte la fase que contiene la fecha y deja el resto detrás', () => {
    const { programa, inicioReal } = insertarFaseNutricion(PROGRAMA, '2026-09-28', { name: 'Refeed', weeks: 1, dietId: 'd3', targetKcal: 3000 });
    expect(programa.phases.map(f => [f.name, f.weeks])).toEqual([
      ['Mantenimiento', 3], ['Refeed', 1], ['Mantenimiento', 1], ['Déficit', 8],
    ]);
    expect(inicioReal).toBe('2026-09-28');
  });

  it('no parte nada si la fecha cae justo al empezar una fase', () => {
    const { programa } = insertarFaseNutricion(PROGRAMA, '2026-10-05', { name: 'Carga', weeks: 2, dietId: 'd3' });
    expect(programa.phases.map(f => [f.name, f.weeks])).toEqual([
      ['Mantenimiento', 4], ['Carga', 2], ['Déficit', 8],
    ]);
  });

  it('redondea al lunes de la semana del programa y lo dice', () => {
    // Miércoles 30/09: la semana del programa empezó el lunes 28.
    const { inicioReal } = insertarFaseNutricion(PROGRAMA, '2026-09-30', { name: 'Refeed', weeks: 1, dietId: 'd3' });
    expect(inicioReal).toBe('2026-09-28');
  });

  it('una fecha anterior al programa adelanta el arranque en vez de inventar semanas negativas', () => {
    const { programa, inicioReal } = insertarFaseNutricion(PROGRAMA, '2026-08-24', { name: 'Adaptación', weeks: 2, dietId: 'd3' });
    expect(programa.startDate).toBe('2026-08-24');
    expect(programa.phases[0].name).toBe('Adaptación');
    expect(inicioReal).toBe('2026-08-24');
  });

  it('más allá del final se añade al final, sin rellenar el hueco con una fase inventada', () => {
    const { programa } = insertarFaseNutricion(PROGRAMA, '2027-06-01', { name: 'Nueva', weeks: 4, dietId: 'd3' });
    expect(programa.phases).toHaveLength(3);
    expect(programa.phases[2].name).toBe('Nueva');
  });

  it('nunca muta el programa recibido', () => {
    const copia = JSON.parse(JSON.stringify(PROGRAMA));
    insertarFaseNutricion(PROGRAMA, '2026-09-28', { name: 'X', weeks: 1, dietId: 'd3' });
    expect(PROGRAMA).toEqual(copia);
  });
});

describe('semanasDelMes', () => {
  it('empieza en el lunes de la semana del día 1 y cubre el mes entero', () => {
    const s = semanasDelMes(2026, 8); // septiembre 2026: el 1 es martes
    expect(s[0].inicio).toBe('2026-08-31');
    expect(s.at(-1)!.fin >= '2026-09-30').toBe(true);
  });

  it('un mes que empieza en domingo no pierde su primera semana', () => {
    const s = semanasDelMes(2026, 10); // noviembre 2026: el 1 es domingo
    expect(s[0].inicio).toBe('2026-10-26');
    expect(s[0].fin).toBe('2026-11-01');
  });
});

describe('construirCarrilVolumen', () => {
  const semanas = [
    { inicio: '2026-09-07', fin: '2026-09-13', etiqueta: '7-13 sep' },
    { inicio: '2026-09-14', fin: '2026-09-20', etiqueta: '14-20 sep' },
  ];
  const meso: Mesocycle = {
    id: 'm1', athleteId: 'a@b.com', number: 1, weeks: 6, startDate: '2026-09-07',
    objective: 'Hipertrofia', daysPerWeek: 2, groups: grupos(),
  };
  const exercises: Exercise[] = [{ id: 'e1', ownerId: 'coach', name: 'Press banca', primaryFocus: 'pecho', muscleGroup: 'pecho', type: 'fuerza', isCustom: false }];
  const workout: Workout = {
    id: 'w1', ownerId: 'coach', name: 'Empuje', mesocycleId: 'm1',
    exercises: [{ exerciseId: 'e1', order: 0, sets: 3, reps: '8-10', restSeconds: 120, rir: 2 }],
  };
  const asig = (id: string, date: string): WorkoutAssignment => ({ id, athleteId: 'a@b.com', workoutId: 'w1', date, status: 'pending' });

  it('suma las series planificadas por grupo y semana', () => {
    const carril = construirCarrilVolumen({
      semanas, workoutAssignments: [asig('a1', '2026-09-08'), asig('a2', '2026-09-10'), asig('a3', '2026-09-15')],
      workouts: [workout], exercises, mesocycles: [meso],
    });
    expect(carril.porGrupo).toHaveLength(1);
    expect(carril.porGrupo[0].grupo).toBe('pecho');
    expect(carril.porGrupo[0].series).toEqual([6, 3]);
    expect(carril.porGrupo[0].total).toBe(9);
  });

  it('la progresión programada se VE subir de una semana a otra', () => {
    const conProgresion: Workout = {
      ...workout,
      exercises: [{ ...workout.exercises[0], weeklyProgression: [{ atWeek: 2, addSets: 2 }] }],
    };
    const carril = construirCarrilVolumen({
      semanas, workoutAssignments: [asig('a1', '2026-09-08'), asig('a2', '2026-09-15')],
      workouts: [conProgresion], exercises, mesocycles: [meso],
    });
    expect(carril.porGrupo[0].series).toEqual([3, 5]);
  });

  it('ignora asignaciones cuyo workout ya no existe en vez de romperse', () => {
    const carril = construirCarrilVolumen({
      semanas, workoutAssignments: [{ id: 'x', athleteId: 'a@b.com', workoutId: 'borrado', date: '2026-09-08', status: 'pending' }],
      workouts: [workout], exercises, mesocycles: [meso],
    });
    expect(carril.porGrupo).toHaveLength(0);
  });

  it('no cuenta un ejercicio sin grupo muscular ni en el workout ni en el catálogo', () => {
    const carril = construirCarrilVolumen({
      semanas, workoutAssignments: [asig('a1', '2026-09-08')],
      workouts: [workout], exercises: [{ ...exercises[0], muscleGroup: undefined }], mesocycles: [meso],
    });
    expect(carril.porGrupo).toHaveLength(0);
  });
});

describe('alternarRefeeds', () => {
  it('marca varios días de golpe, ordenados', () => {
    const p = alternarRefeeds(PROGRAMA, ['2026-10-03', '2026-09-26'], true, { note: 'Carga de HC' });
    expect(p.refeedDays!.map(r => r.date)).toEqual(['2026-09-26', '2026-10-03']);
    expect(p.refeedDays![0].note).toBe('Carga de HC');
  });

  it('volver a marcar un día ya marcado lo actualiza, no lo duplica', () => {
    const uno = alternarRefeeds(PROGRAMA, ['2026-09-26'], true, { note: 'Primera' });
    const dos = alternarRefeeds(uno, ['2026-09-26'], true, { note: 'Corregida', dietId: 'd9' });
    expect(dos.refeedDays).toHaveLength(1);
    expect(dos.refeedDays![0]).toEqual({ date: '2026-09-26', dietId: 'd9', note: 'Corregida' });
  });

  it('desmarcar quita solo esos días', () => {
    const con = alternarRefeeds(PROGRAMA, ['2026-09-26', '2026-10-03'], true);
    const sin = alternarRefeeds(con, ['2026-09-26'], false);
    expect(sin.refeedDays!.map(r => r.date)).toEqual(['2026-10-03']);
  });

  it('al quitar el último, el campo desaparece en vez de quedarse vacío', () => {
    const con = alternarRefeeds(PROGRAMA, ['2026-09-26'], true);
    const sin = alternarRefeeds(con, ['2026-09-26'], false);
    expect('refeedDays' in sin).toBe(false);
  });

  it('no guarda nota ni dieta vacías', () => {
    const p = alternarRefeeds(PROGRAMA, ['2026-09-26'], true, { note: '   ' });
    expect(p.refeedDays![0]).toEqual({ date: '2026-09-26' });
  });

  it('nunca muta el programa recibido', () => {
    const copia = JSON.parse(JSON.stringify(PROGRAMA));
    alternarRefeeds(PROGRAMA, ['2026-09-26'], true, { note: 'x' });
    expect(PROGRAMA).toEqual(copia);
  });

  it('refeedDe encuentra el día y devuelve null si no lo hay', () => {
    const p = alternarRefeeds(PROGRAMA, ['2026-09-26'], true);
    expect(refeedDe(p, '2026-09-26')!.date).toBe('2026-09-26');
    expect(refeedDe(p, '2026-09-27')).toBeNull();
    expect(refeedDe(null, '2026-09-26')).toBeNull();
  });
});
