import { describe, expect, it } from 'vitest';
import { Mesocycle, NutritionProgram, WorkoutAssignment, WorkoutLog, Workout, Diet } from '../types';
import {
  clasificarFaseEntreno, clasificarFaseNutricion, construirBandasEntreno, construirBandasNutricion,
  recortarAlMes, huecosIniciales, construirIndiceDeDias, adherenciaDelMes, diasDelIndiceEnMes,
  DatosCalendario,
} from './roadmapCalendar';

function meso(overrides: Partial<Mesocycle> = {}): Mesocycle {
  return {
    id: 'm1', athleteId: 'a@x.com', number: 1, weeks: 4, startDate: '2026-01-01',
    objective: '', daysPerWeek: 4, groups: {} as Mesocycle['groups'],
    ...overrides,
  };
}

function datosVacios(overrides: Partial<DatosCalendario> = {}): DatosCalendario {
  return {
    mesocycles: [], nutritionProgram: null, workoutAssignments: [], workoutLogs: [],
    workouts: [], diets: [], dietCompletionLogs: [], cardioSessions: [], bodyweightLogs: [],
    tasks: [], roadmapItems: [], highlightedDays: [],
    ...overrides,
  };
}

describe('clasificarFaseEntreno', () => {
  it('usa phaseType si el coach lo marcó, ignorando el texto del objetivo', () => {
    expect(clasificarFaseEntreno(meso({ phaseType: 'fuerza', objective: 'Definición de verano' }))).toBe('fuerza');
  });
  it('deduce por palabras clave cuando no hay phaseType', () => {
    expect(clasificarFaseEntreno(meso({ objective: 'Hipertrofia tren superior' }))).toBe('hipertrofia');
    expect(clasificarFaseEntreno(meso({ objective: 'Semana de descarga' }))).toBe('descarga');
  });
  it('null si no hay phaseType ni palabra reconocible — nunca inventa un tipo', () => {
    expect(clasificarFaseEntreno(meso({ objective: 'Puesta a punto general' }))).toBeNull();
    expect(clasificarFaseEntreno(meso({ objective: '' }))).toBeNull();
  });
});

describe('clasificarFaseNutricion', () => {
  it('superávit cuando sube el targetKcal respecto a la fase anterior', () => {
    expect(clasificarFaseNutricion({ targetKcal: 2800 }, { targetKcal: 2400 })).toBe('superavit');
  });
  it('déficit cuando baja', () => {
    expect(clasificarFaseNutricion({ targetKcal: 2000 }, { targetKcal: 2400 })).toBe('deficit');
  });
  it('mantenimiento cuando es igual', () => {
    expect(clasificarFaseNutricion({ targetKcal: 2400 }, { targetKcal: 2400 })).toBe('mantenimiento');
  });
  it('null sin fase anterior o sin targetKcal — no inventa un delta', () => {
    expect(clasificarFaseNutricion({ targetKcal: 2400 }, undefined)).toBeNull();
    expect(clasificarFaseNutricion({}, { targetKcal: 2400 })).toBeNull();
  });
});

describe('recortarAlMes', () => {
  it('una banda que empieza antes del mes y sigue después lleva los dos cortes ←→', () => {
    const bandas = construirBandasEntreno([meso({ id: 'm1', startDate: '2026-01-15', weeks: 12, phaseType: 'hipertrofia' })]);
    const [seg] = recortarAlMes(bandas, 2026, 1); // febrero, mes 1 (0-indexado)
    expect(seg.entraAntes).toBe(true);
    expect(seg.sigueDespues).toBe(true);
    expect(seg.leftPct).toBe(0);
    expect(seg.widthPct).toBe(100);
  });

  it('febrero de año bisiesto recorta a 29 días', () => {
    // 2028 es bisiesto; una banda que cubre toda la primera quincena de
    // febrero debe dar el mismo widthPct que calcularíamos a mano sobre 29.
    const bandas = construirBandasEntreno([meso({ startDate: '2028-02-01', weeks: 2 })]); // 14 días: 1-14 feb
    const [seg] = recortarAlMes(bandas, 2028, 1);
    expect(seg.finVisible).toBe('2028-02-14');
    expect(seg.widthPct).toBeCloseTo((14 / 29) * 100, 5);
  });

  it('una banda que no toca el mes no aparece', () => {
    const bandas = construirBandasEntreno([meso({ startDate: '2026-01-01', weeks: 2 })]);
    expect(recortarAlMes(bandas, 2026, 5)).toHaveLength(0);
  });
});

describe('huecosIniciales', () => {
  it('mes que empieza en domingo deja 6 huecos (lunes primero)', () => {
    // Marzo de 2026 empieza en domingo.
    expect(huecosIniciales(2026, 2)).toBe(6);
  });
  it('mes que empieza en lunes no deja huecos', () => {
    // Junio de 2026 empieza en lunes.
    expect(huecosIniciales(2026, 5)).toBe(0);
  });
});

describe('construirIndiceDeDias', () => {
  it('día sin asignación dentro de un mesociclo activo es "rest", no "sin-datos"', () => {
    const datos = datosVacios({ mesocycles: [meso({ startDate: '2026-01-01', weeks: 4 })] });
    const indice = construirIndiceDeDias(datos, '2026-02-01');
    expect(indice.get('2026-01-05')?.estado).toBe('rest');
  });

  it('día sin asignación y sin ningún mesociclo activo es "sin-datos"', () => {
    const datos = datosVacios({
      mesocycles: [
        meso({ id: 'm1', startDate: '2026-01-01', weeks: 2 }),
        meso({ id: 'm2', startDate: '2026-02-01', weeks: 2 }),
      ],
    });
    const indice = construirIndiceDeDias(datos, '2026-03-01');
    // 2026-01-20 cae DESPUÉS de que acabe m1 (fin 2026-01-14) y ANTES de que
    // empiece m2 (2026-02-01): hueco real entre bloques.
    expect(indice.get('2026-01-20')?.estado).toBe('sin-datos');
  });

  it('futuro es siempre "plan", tenga o no asignación', () => {
    const datos = datosVacios({ mesocycles: [meso({ startDate: '2026-01-01', weeks: 52 })] });
    const indice = construirIndiceDeDias(datos, '2026-01-01');
    expect(indice.get('2026-06-15')?.estado).toBe('plan');
    expect(indice.get('2026-06-15')?.esFuturo).toBe(true);
  });

  it('asignación completada con log recortado (menos series de las previstas) es "partial"', () => {
    const workout: Workout = {
      id: 'w1', ownerId: 'coach', name: 'Empuje', exercises: [
        { exerciseId: 'e1', order: 0, sets: 4, reps: '8', restSeconds: 90, rir: 2 },
        { exerciseId: 'e2', order: 1, sets: 4, reps: '8', restSeconds: 90, rir: 2 },
      ],
    };
    const asig: WorkoutAssignment = { id: 'a1', workoutId: 'w1', athleteId: 'x', date: '2026-01-05', status: 'completed', mesocycleId: 'm1' };
    const log: WorkoutLog = {
      id: 'l1', athleteId: 'x', workoutId: 'w1', assignmentId: 'a1', date: '2026-01-05', completedAt: '2026-01-05T19:00:00.000Z',
      entries: [{ exerciseId: 'e1', sets: [{ weight: 50, repsDone: 8, rir: 2 }, { weight: 50, repsDone: 8, rir: 2 }] }], // solo 2 de las 8 series previstas
    };
    const datos = datosVacios({
      mesocycles: [meso({ startDate: '2026-01-01', weeks: 4 })],
      workouts: [workout], workoutAssignments: [asig], workoutLogs: [log],
    });
    const indice = construirIndiceDeDias(datos, '2026-02-01');
    const dia = indice.get('2026-01-05')!;
    expect(dia.estado).toBe('partial');
    expect(dia.entreno.seriesHechas).toBe(2);
    expect(dia.entreno.seriesTotal).toBe(8);
  });

  it('asignación completada con todas las series es "done"', () => {
    const workout: Workout = { id: 'w1', ownerId: 'coach', name: 'Empuje', exercises: [{ exerciseId: 'e1', order: 0, sets: 2, reps: '8', restSeconds: 90, rir: 2 }] };
    const asig: WorkoutAssignment = { id: 'a1', workoutId: 'w1', athleteId: 'x', date: '2026-01-05', status: 'completed', mesocycleId: 'm1' };
    const log: WorkoutLog = {
      id: 'l1', athleteId: 'x', workoutId: 'w1', assignmentId: 'a1', date: '2026-01-05', completedAt: '2026-01-05T19:00:00.000Z',
      entries: [{ exerciseId: 'e1', sets: [{ weight: 50, repsDone: 8, rir: 2 }, { weight: 50, repsDone: 8, rir: 2 }] }],
    };
    const datos = datosVacios({
      mesocycles: [meso({ startDate: '2026-01-01', weeks: 4 })],
      workouts: [workout], workoutAssignments: [asig], workoutLogs: [log],
    });
    const indice = construirIndiceDeDias(datos, '2026-02-01');
    expect(indice.get('2026-01-05')?.estado).toBe('done');
  });

  it('asignación saltada es "skipped"', () => {
    const asig: WorkoutAssignment = { id: 'a1', workoutId: 'w1', athleteId: 'x', date: '2026-01-05', status: 'skipped', mesocycleId: 'm1' };
    const datos = datosVacios({ mesocycles: [meso({ startDate: '2026-01-01', weeks: 4 })], workoutAssignments: [asig] });
    const indice = construirIndiceDeDias(datos, '2026-02-01');
    expect(indice.get('2026-01-05')?.estado).toBe('skipped');
  });

  it('kcal del día se calcula a partir de los ítems marcados, no de un número fijo', () => {
    const diet: Diet = {
      id: 'd1', athleteId: 'x', name: 'Dieta', budget: { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 },
      meals: [{ id: 'c1', name: 'Comida', items: [{ category: 'HC', foodLabel: 'arroz', quantity: 2 }, { category: 'PROT', foodLabel: 'pollo', quantity: 1 }] }],
    };
    const program: NutritionProgram = { athleteId: 'x', startDate: '2026-01-01', phases: [{ id: 'f1', name: 'Fase 1', weeks: 4, dietId: 'd1' }] };
    const datos = datosVacios({
      mesocycles: [meso({ startDate: '2026-01-01', weeks: 4 })],
      nutritionProgram: program, diets: [diet],
      dietCompletionLogs: [{ id: 'x_2026-01-05', athleteId: 'x', date: '2026-01-05', dietId: 'd1', doneItemIds: ['c1_0'] }], // solo el arroz, no el pollo
    });
    const indice = construirIndiceDeDias(datos, '2026-02-01');
    // HC: 2 intercambios × 100 kcal = 200. El pollo (PROT) no está marcado.
    expect(indice.get('2026-01-05')?.nutricion.kcal).toBe(200);
  });
});

describe('adherenciaDelMes', () => {
  it('null cuando no hay ningún día evaluable ese mes (no 0%)', () => {
    const datos = datosVacios();
    const indice = construirIndiceDeDias(datos, '2026-02-01');
    expect(adherenciaDelMes(indice, 2026, 0)).toBeNull();
  });

  it('cuenta parcial como medio punto', () => {
    const asigDone: WorkoutAssignment = { id: 'a1', workoutId: 'w1', athleteId: 'x', date: '2026-01-05', status: 'completed', mesocycleId: 'm1' };
    const asigSkipped: WorkoutAssignment = { id: 'a2', workoutId: 'w1', athleteId: 'x', date: '2026-01-06', status: 'skipped', mesocycleId: 'm1' };
    const workout: Workout = { id: 'w1', ownerId: 'coach', name: 'Empuje', exercises: [{ exerciseId: 'e1', order: 0, sets: 2, reps: '8', restSeconds: 90, rir: 2 }] };
    const log: WorkoutLog = {
      id: 'l1', athleteId: 'x', workoutId: 'w1', assignmentId: 'a1', date: '2026-01-05', completedAt: '2026-01-05T19:00:00.000Z',
      entries: [{ exerciseId: 'e1', sets: [{ weight: 50, repsDone: 8, rir: 2 }, { weight: 50, repsDone: 8, rir: 2 }] }],
    };
    const datos = datosVacios({
      mesocycles: [meso({ startDate: '2026-01-01', weeks: 4 })],
      workouts: [workout], workoutAssignments: [asigDone, asigSkipped], workoutLogs: [log],
    });
    const indice = construirIndiceDeDias(datos, '2026-02-01');
    // 1 done + 1 skipped = 1/2 = 50%
    expect(adherenciaDelMes(indice, 2026, 0)).toBe(50);
  });
});

describe('diasDelIndiceEnMes', () => {
  it('solo devuelve días que existen en el índice (dentro del rango de datos)', () => {
    const datos = datosVacios({ mesocycles: [meso({ startDate: '2026-01-15', weeks: 1 })] });
    const indice = construirIndiceDeDias(datos, '2026-02-01');
    const dias = diasDelIndiceEnMes(indice, 2026, 0);
    expect(dias.every(d => d.fecha >= '2026-01-15')).toBe(true);
  });
});

describe('construirBandasNutricion', () => {
  it('encadena las fases una tras otra desde startDate', () => {
    const program: NutritionProgram = {
      athleteId: 'x', startDate: '2026-01-01',
      phases: [{ id: 'f1', name: 'Fase 1', weeks: 2, dietId: 'd1' }, { id: 'f2', name: 'Fase 2', weeks: 3, dietId: 'd2' }],
    };
    const bandas = construirBandasNutricion(program);
    expect(bandas[0].inicio).toBe('2026-01-01');
    expect(bandas[0].fin).toBe('2026-01-14');
    expect(bandas[1].inicio).toBe('2026-01-15');
  });

  it('sin programa, lista vacía', () => {
    expect(construirBandasNutricion(null)).toEqual([]);
  });
});
