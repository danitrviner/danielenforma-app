import { describe, it, expect } from 'vitest';
import {
  Exercise, Mesocycle, MuscleGroup, MuscleGroupConfig, WorkoutLog, MUSCLE_ORDER,
} from '../types';
import {
  resolverPeriodoRevision, buildRevisionCoach, agruparEjerciciosPorPatron,
  mejoresYPeores, mesoActivo, semanasDeVentana,
} from './revisionCoach';

const HOY = '2026-09-14'; // lunes

// ── Fixtures ────────────────────────────────────────────────────────────────

function ej(id: string, muscleGroup: MuscleGroup, secundarios?: MuscleGroup[]): Exercise {
  return {
    id, ownerId: 'coach', name: `Ej ${id}`, primaryFocus: '',
    muscleGroup, secondaryMuscleGroups: secundarios, type: 'fuerza',
  } as Exercise;
}

function log(
  date: string,
  entries: { exerciseId: string; series: [number, number][]; rir?: number }[],
): WorkoutLog {
  return {
    id: `log-${date}-${entries[0]?.exerciseId ?? 'x'}`,
    athleteId: 'a@b.com', workoutId: 'w', assignmentId: 'as',
    date, completedAt: `${date}T18:00:00.000Z`,
    entries: entries.map(e => ({
      exerciseId: e.exerciseId,
      sets: e.series.map(([weight, repsDone]) => ({ weight, repsDone, rir: e.rir ?? 2 })),
    })),
  };
}

function groups(parcial: Partial<Record<MuscleGroup, MuscleGroupConfig>>): Record<MuscleGroup, MuscleGroupConfig> {
  const base = {} as Record<MuscleGroup, MuscleGroupConfig>;
  for (const g of MUSCLE_ORDER) base[g] = { series: 0, priority: 'media' };
  return { ...base, ...parcial } as Record<MuscleGroup, MuscleGroupConfig>;
}

function meso(over: Partial<Mesocycle> & Pick<Mesocycle, 'id' | 'number' | 'startDate' | 'weeks'>): Mesocycle {
  return {
    athleteId: 'a@b.com', objective: '', daysPerWeek: 4,
    groups: groups({}), ...over,
  } as Mesocycle;
}

// ── resolverPeriodoRevision ─────────────────────────────────────────────────

describe('resolverPeriodoRevision · ventanas por días', () => {
  it('7 días termina hoy e incluye hoy (7 días, no 8)', () => {
    const v = resolverPeriodoRevision({ tipo: '7d' }, [], HOY);
    expect(v.desde).toBe('2026-09-08');
    expect(v.hasta).toBe(HOY);
    expect(v.semanas).toBe(1);
    expect(v.etiqueta).toBe('Últimos 7 días');
  });

  it('14 días son 2 semanas, y eso es lo que normaliza el mapa', () => {
    const v = resolverPeriodoRevision({ tipo: '14d' }, [], HOY);
    expect(v.desde).toBe('2026-09-01');
    expect(v.semanas).toBe(2);
  });

  it('compara contra la ventana equivalente anterior', () => {
    expect(resolverPeriodoRevision({ tipo: '7d' }, [], HOY).etiquetaComparacion)
      .toBe('vs la semana anterior');
    expect(resolverPeriodoRevision({ tipo: '14d' }, [], HOY).etiquetaComparacion)
      .toBe('vs 2 semanas antes');
  });
});

describe('resolverPeriodoRevision · ventana de mesociclo', () => {
  // Empezó el 2026-09-07 (lunes pasado), 5 semanas → hoy es la semana 2.
  const enCurso = meso({ id: 'm2', number: 2, startDate: '2026-09-07', weeks: 5, name: 'Hipertrofia' });
  const anterior = meso({ id: 'm1', number: 1, startDate: '2026-08-03', weeks: 5 });

  it('un bloque EN CURSO corta la ventana en hoy, no al final programado', () => {
    const v = resolverPeriodoRevision({ tipo: 'meso', mesoId: 'm2' }, [enCurso, anterior], HOY);
    expect(v.desde).toBe('2026-09-07');
    expect(v.hasta).toBe(HOY);              // no 2026-10-11
    expect(v.semanaDelPlan).toBe(2);
    expect(v.semanasDelPlan).toBe(5);
    // Lo importante: normaliza por los días TRANSCURRIDOS, no por las 5 semanas
    // del bloque (que pintaría un 40 % del volumen desde el primer día) ni por
    // 2 semanas enteras (que repartiría entre dos lo hecho en una).
    expect(v.semanas).toBe(1.14);   // 8 días corridos
    expect(v.etiqueta).toBe('Hipertrofia · en curso');
  });

  it('un bloque TERMINADO usa el bloque entero', () => {
    const v = resolverPeriodoRevision({ tipo: 'meso', mesoId: 'm1' }, [enCurso, anterior], HOY);
    expect(v.desde).toBe('2026-08-03');
    expect(v.hasta).toBe('2026-09-06');
    expect(v.semanas).toBe(5);
    expect(v.semanaDelPlan).toBe(5);
    expect(v.etiqueta).toBe('Meso #1');     // sin nombre propio
  });

  it('un bloque EN CURSO se compara con el MISMO tramo del anterior, no con el bloque entero', () => {
    // El fallo que esto impide: comparar 8 días contra los 35 del bloque
    // anterior canta un −45 % de tonelaje que solo significa «aún no ha
    // terminado». Desplazando la ventana los 35 días que separan los dos
    // inicios, se miden los 8 primeros días de cada uno.
    const v = resolverPeriodoRevision({ tipo: 'meso', mesoId: 'm2' }, [enCurso, anterior], HOY);
    expect(v.comparison).toEqual({ mode: 'offset', dias: 35, label: 'vs el mismo tramo de Meso #1' });
    expect(v.etiquetaComparacion).toBe('vs el mismo tramo de Meso #1');
  });

  it('un bloque TERMINADO sí se compara entero contra entero, como el cierre de mesociclo', () => {
    const terminado = meso({ id: 'm0', number: 0, startDate: '2026-06-29', weeks: 5 });
    const v = resolverPeriodoRevision({ tipo: 'meso', mesoId: 'm1' }, [enCurso, anterior, terminado], HOY);
    expect(v.comparison).toEqual({ mode: 'mesocycle', currentId: 'm1', previousId: 'm0' });
    expect(v.etiquetaComparacion).toBe('vs Macrociclo 0');
  });

  it('el primer mesociclo no tiene con qué compararse y lo dice', () => {
    const v = resolverPeriodoRevision({ tipo: 'meso', mesoId: 'm1' }, [anterior], HOY);
    expect(v.comparison).toEqual({ mode: 'mesocycle', currentId: 'm1', previousId: null });
    expect(v.etiquetaComparacion).toBe('sin macrociclo previo');
  });

  it('si el mesociclo elegido ya no existe, cae a 7 días en vez de pintar una ventana vacía', () => {
    const v = resolverPeriodoRevision({ tipo: 'meso', mesoId: 'borrado' }, [enCurso], HOY);
    expect(v.etiqueta).toBe('Últimos 7 días');
    expect(v.meso).toBeNull();
  });
});

describe('semanasDeVentana', () => {
  it('cuenta los dos extremos', () => {
    expect(semanasDeVentana('2026-09-08', '2026-09-14')).toBe(1);   // 7 días
    expect(semanasDeVentana('2026-09-01', '2026-09-14')).toBe(2);   // 14 días
  });

  it('da decimales para las ventanas a medias', () => {
    expect(semanasDeVentana('2026-09-07', '2026-09-14')).toBe(1.14); // 8 días
    expect(semanasDeVentana('2026-09-07', '2026-09-17')).toBe(1.57); // 11 días
  });

  it('nunca baja de 1: el primer día de un bloque no extrapola a 21 series/semana', () => {
    expect(semanasDeVentana('2026-09-14', '2026-09-14')).toBe(1);
    expect(semanasDeVentana('2026-09-14', '2026-09-16')).toBe(1);
  });
});

describe('mesoActivo', () => {
  const m1 = meso({ id: 'm1', number: 1, startDate: '2026-08-03', weeks: 5 });
  const m2 = meso({ id: 'm2', number: 2, startDate: '2026-09-07', weeks: 5 });

  it('coge el que contiene a hoy', () => {
    expect(mesoActivo([m1, m2], HOY)?.id).toBe('m2');
  });

  it('entre bloques, coge el último que empezó', () => {
    expect(mesoActivo([m1], HOY)?.id).toBe('m1');
  });

  it('null sin bloques', () => {
    expect(mesoActivo([], HOY)).toBeNull();
  });
});

// ── agruparEjerciciosPorPatron ──────────────────────────────────────────────

describe('agruparEjerciciosPorPatron', () => {
  const exercises = [
    ej('press', 'pecho'),
    ej('frances', 'triceps'),   // empuje_torso Y brazo
    ej('plancha', 'core'),      // sin patrón
    ej('remo', 'dorsal'),
  ];
  const perf = exercises.map(e => ({
    exerciseId: e.id, name: e.name, sets: 3, reps: 30, tonnage: 1000,
    bestOrm: 100, prevBestOrm: 95, deltaOrmPct: 5, isPR: false,
  }));

  it('un ejercicio de dos patrones aparece ENTERO en los dos', () => {
    const { porPatron } = agruparEjerciciosPorPatron(perf, exercises);
    expect(porPatron.empuje_torso.map(e => e.exerciseId)).toEqual(['press', 'frances']);
    expect(porPatron.brazo.map(e => e.exerciseId)).toEqual(['frances']);
  });

  it('los grupos fuera del protocolo no se pierden: van a `sinPatron`', () => {
    const { sinPatron } = agruparEjerciciosPorPatron(perf, exercises);
    expect(sinPatron.map(e => e.exerciseId)).toEqual(['plancha']);
  });

  it('un ejercicio sin muscleGroup tampoco desaparece', () => {
    const huerfano = { id: 'x', ownerId: 'c', name: 'X', primaryFocus: '', type: 'fuerza' } as Exercise;
    const { sinPatron } = agruparEjerciciosPorPatron(
      [{ ...perf[0], exerciseId: 'x' }], [huerfano],
    );
    expect(sinPatron.map(e => e.exerciseId)).toEqual(['x']);
  });

  it('devuelve los 5 patrones aunque estén vacíos', () => {
    const { porPatron } = agruparEjerciciosPorPatron([], []);
    expect(Object.keys(porPatron).sort()).toEqual(
      ['brazo', 'empuje_cadera', 'empuje_pierna', 'empuje_torso', 'traccion'],
    );
  });
});

// ── mejoresYPeores ──────────────────────────────────────────────────────────

describe('mejoresYPeores', () => {
  const base = { name: 'x', reps: 30, tonnage: 1000, isPR: false };
  const perf = [
    { ...base, exerciseId: 'sube_mucho', sets: 4, bestOrm: 120, prevBestOrm: 100, deltaOrmPct: 20 },
    { ...base, exerciseId: 'sube_poco',  sets: 4, bestOrm: 103, prevBestOrm: 100, deltaOrmPct: 3 },
    { ...base, exerciseId: 'ruido',      sets: 4, bestOrm: 101, prevBestOrm: 100, deltaOrmPct: 1 },
    { ...base, exerciseId: 'baja',       sets: 4, bestOrm: 90,  prevBestOrm: 100, deltaOrmPct: -10 },
    { ...base, exerciseId: 'estreno',    sets: 4, bestOrm: 80,  prevBestOrm: null, deltaOrmPct: null },
    { ...base, exerciseId: 'dos_series', sets: 2, bestOrm: 150, prevBestOrm: 100, deltaOrmPct: 50 },
  ];

  it('ordena de mayor a menor subida', () => {
    const { suben } = mejoresYPeores(perf);
    expect(suben.map(e => e.exerciseId)).toEqual(['sube_mucho', 'sube_poco']);
  });

  it('un ejercicio que se ESTRENA no es «el que más sube»', () => {
    const { suben, bajan } = mejoresYPeores(perf);
    expect([...suben, ...bajan].map(e => e.exerciseId)).not.toContain('estreno');
  });

  it('dos series sueltas no son una tendencia', () => {
    expect(mejoresYPeores(perf).suben.map(e => e.exerciseId)).not.toContain('dos_series');
    // ...salvo que se baje el listón a propósito
    expect(mejoresYPeores(perf, { minSeries: 1 }).suben[0].exerciseId).toBe('dos_series');
  });

  it('un ±1 % de Epley es ruido de redondeo, no una mejora', () => {
    expect(mejoresYPeores(perf).suben.map(e => e.exerciseId)).not.toContain('ruido');
  });

  it('los que bajan salen de la peor a la menos mala', () => {
    expect(mejoresYPeores(perf).bajan.map(e => e.exerciseId)).toEqual(['baja']);
  });

  it('respeta el tope n', () => {
    expect(mejoresYPeores(perf, { n: 1 }).suben).toHaveLength(1);
  });
});

// ── buildRevisionCoach ──────────────────────────────────────────────────────

describe('buildRevisionCoach', () => {
  const exercises = [ej('press', 'pecho'), ej('remo', 'dorsal')];
  // Bloque de 5 semanas desde el 2026-09-07; hoy es la semana 2.
  const m = meso({
    id: 'm2', number: 2, startDate: '2026-09-07', weeks: 5,
    groups: groups({ pecho: { series: 12, priority: 'alta' }, dorsal: { series: 16, priority: 'alta' } }),
  });
  // 12 series de press y 8 de remo repartidas en las dos semanas transcurridas.
  const logs = [
    log('2026-09-08', [{ exerciseId: 'press', series: [[60, 10], [60, 10], [60, 10]] }]),
    log('2026-09-10', [{ exerciseId: 'remo',  series: [[70, 10], [70, 10], [70, 10], [70, 10]] }]),
    log('2026-09-11', [{ exerciseId: 'press', series: [[62, 10], [62, 10], [62, 10]] }]),
    log('2026-09-13', [{ exerciseId: 'remo',  series: [[72, 10], [72, 10], [72, 10], [72, 10]] }]),
  ];

  it('el mapa cuenta series por SEMANA transcurrida, no el total del bloque', () => {
    const r = buildRevisionCoach({
      logs, exercises, mesocycles: [m], periodo: { tipo: 'meso', mesoId: 'm2' }, hoy: HOY,
    });
    const pecho = r.mapa.find(c => c.group === 'pecho')!;
    // 6 series de press en 8 días (1,14 semanas) = 5,3/semana, contra 12
    // programadas. Repartirlas entre «2 semanas» daría 3 y sería mentira: no ha
    // entrenado dos semanas, lleva ocho días.
    expect(pecho.realizadasSemana).toBe(5.3);
    expect(pecho.planificadasSemana).toBe(12);
    expect(pecho.cumplimientoPct).toBe(44);
    expect(pecho.prioridad).toBe('alta');
  });

  it('no cuenta logs de fuera de la ventana', () => {
    const conViejo = [...logs, log('2026-08-15', [{ exerciseId: 'press', series: [[100, 10]] }])];
    const r = buildRevisionCoach({
      logs: conViejo, exercises, mesocycles: [m], periodo: { tipo: 'meso', mesoId: 'm2' }, hoy: HOY,
    });
    expect(r.mapa.find(c => c.group === 'pecho')!.realizadasSemana).toBe(5.3);
  });

  it('sin mesociclo el mapa sigue saliendo, pero sin plan con que comparar', () => {
    const r = buildRevisionCoach({
      logs, exercises, mesocycles: [], periodo: { tipo: '14d' }, hoy: HOY,
    });
    const pecho = r.mapa.find(c => c.group === 'pecho')!;
    expect(pecho.realizadasSemana).toBe(3);
    expect(pecho.planificadasSemana).toBeNull();
    expect(pecho.cumplimientoPct).toBeNull();
  });

  it('un mesociclo sin volumen programado no dice «0 % cumplido»', () => {
    const vacio = meso({ id: 'm3', number: 3, startDate: '2026-09-07', weeks: 5 });
    const r = buildRevisionCoach({
      logs, exercises, mesocycles: [vacio], periodo: { tipo: 'meso', mesoId: 'm3' }, hoy: HOY,
    });
    expect(r.mapa.every(c => c.planificadasSemana === null)).toBe(true);
    expect(r.mapa.every(c => c.cumplimientoPct === null)).toBe(true);
  });

  it('trae los 5 patrones y el informe de la misma ventana', () => {
    const r = buildRevisionCoach({
      logs, exercises, mesocycles: [m], periodo: { tipo: 'meso', mesoId: 'm2' }, hoy: HOY,
    });
    expect(r.patrones).toHaveLength(5);
    expect(r.informe.sessions).toBe(4);
    expect(r.ejerciciosPorPatron.empuje_torso.map(e => e.exerciseId)).toEqual(['press']);
    expect(r.ejerciciosPorPatron.traccion.map(e => e.exerciseId)).toEqual(['remo']);
  });

  it('sin logs no revienta: devuelve la ventana y todo a cero', () => {
    const r = buildRevisionCoach({
      logs: [], exercises, mesocycles: [m], periodo: { tipo: 'meso', mesoId: 'm2' }, hoy: HOY,
    });
    expect(r.informe.sessions).toBe(0);
    expect(r.suben).toEqual([]);
    expect(r.mapa).toHaveLength(MUSCLE_ORDER.length);
    expect(r.mapa.every(c => c.realizadasSemana === 0)).toBe(true);
  });
});
