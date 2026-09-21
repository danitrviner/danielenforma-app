import { describe, it, expect } from 'vitest';
import {
  Exercise, Mesocycle, MuscleGroup, MuscleGroupConfig, WorkoutLog, BodyweightLog, MUSCLE_ORDER,
  Questionnaire, QuestionnaireResponse, WeightCheckIn,
} from '../types';
import {
  resolverPeriodoRevision, buildRevisionCoach, agruparEjerciciosPorPatron,
  mejoresYPeores, mesoActivo, semanasDeVentana, pesoVsSemanaPasada, construirBienestar,
  fechaDeLaUltimaRevision, curvasDeLaVentana,
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

// ── pesoVsSemanaPasada ──────────────────────────────────────────────────────
// Ventana de revisión del 14 al 20 de septiembre de 2026 (lunes a domingo),
// así que la anterior va del 7 al 13 — mismos límites que antes usaba la
// semana de calendario, pero ahora vienen de la ventana, no del reloj.

describe('pesoVsSemanaPasada', () => {
  const DESDE = '2026-09-14';
  const HASTA = '2026-09-20';
  const peso = (date: string, weight: number): BodyweightLog =>
    ({ id: date, athleteId: 'a@b.com', date, weight, createdAt: `${date}T08:00:00.000Z` });

  it('compara MEDIAS, no el último registro de cada semana', () => {
    // Un día alto y otro bajo en la misma semana: la media los promedia. Con el
    // último registro, el resultado dependería de qué día se pesó.
    const r = pesoVsSemanaPasada([
      peso('2026-09-07', 81.0), peso('2026-09-10', 80.0), peso('2026-09-13', 80.6),
      peso('2026-09-14', 80.2), peso('2026-09-15', 79.6),
    ], DESDE, HASTA);
    expect(r.semanaAnterior).toBe(80.5);
    expect(r.estaSemana).toBe(79.9);
    expect(r.deltaKg).toBe(-0.6);
    expect(r.registrosEstaSemana).toBe(2);
  });

  it('con un solo registro por semana, la media es ese registro', () => {
    const r = pesoVsSemanaPasada([peso('2026-09-09', 82), peso('2026-09-16', 81.2)], DESDE, HASTA);
    expect(r.deltaKg).toBe(-0.8);
    expect(r.registrosEstaSemana).toBe(1);
  });

  it('marca la subida en positivo', () => {
    const r = pesoVsSemanaPasada([peso('2026-09-09', 80), peso('2026-09-16', 80.9)], DESDE, HASTA);
    expect(r.deltaKg).toBe(0.9);
  });

  it('sin una de las dos semanas NO inventa un cero', () => {
    expect(pesoVsSemanaPasada([peso('2026-09-16', 80)], DESDE, HASTA).deltaKg).toBeNull();
    expect(pesoVsSemanaPasada([peso('2026-09-09', 80)], DESDE, HASTA).deltaKg).toBeNull();
    expect(pesoVsSemanaPasada([], DESDE, HASTA)).toMatchObject({ estaSemana: null, deltaKg: null });
  });

  it('ignora los pesos de hace más de dos semanas', () => {
    const r = pesoVsSemanaPasada([
      peso('2026-08-01', 90), peso('2026-09-09', 80), peso('2026-09-16', 79.5),
    ], DESDE, HASTA);
    expect(r.semanaAnterior).toBe(80);
    expect(r.deltaKg).toBe(-0.5);
  });
});

// ── Bienestar ───────────────────────────────────────────────────────────────

const Q_BIENESTAR: Questionnaire = {
  id: 'q_b', ownerId: 'coach', title: 'Semanal',
  questions: [
    { id: 'sueno', label: 'Horas de sueño', type: 'numeric', required: true, signalKey: 'wellness.sleep_hours_weekly' },
    { id: 'estres', label: 'Estrés', type: 'scale', required: true, scaleMin: 1, scaleMax: 10, signalKey: 'wellness.stress_weekly' },
    { id: 'doms_pecho', label: 'Agujetas pecho', type: 'scale', required: false, scaleMin: 0, scaleMax: 10, signalKey: 'doms.pecho' },
    { id: 'doms_dorsal', label: 'Agujetas dorsal', type: 'scale', required: false, scaleMin: 0, scaleMax: 10, signalKey: 'doms.dorsal' },
  ],
};

function respuesta(fecha: string, sueno: number, estres: number, pecho: number, dorsal: number): QuestionnaireResponse {
  return {
    id: `r_${fecha}`, questionnaireId: 'q_b', assignmentId: 'a', athleteId: 'ana@x.com',
    submittedAt: `${fecha}T19:00:00.000Z`,
    answers: [
      { questionId: 'sueno', value: sueno },
      { questionId: 'estres', value: estres },
      { questionId: 'doms_pecho', value: pecho },
      { questionId: 'doms_dorsal', value: dorsal },
    ],
  };
}

describe('construirBienestar', () => {
  const RESPUESTAS = [
    respuesta('2026-08-10', 7, 4, 8, 2),
    respuesta('2026-08-17', 7, 5, 8, 3),
    respuesta('2026-08-24', 6, 6, 7, 2),
    respuesta('2026-09-07', 6, 7, 8, 3),
  ];
  const ventana = { desde: '2026-09-01', hasta: '2026-09-14' };

  it('calcula el IRP actual y su serie', () => {
    const b = construirBienestar({ responses: RESPUESTAS, questionnaires: [Q_BIENESTAR], ventana });
    expect(b.irp.valor).not.toBeNull();
    expect(b.irp.horasSueño).not.toBeNull();
    expect(b.irp.estres).not.toBeNull();
    expect(b.historial.length).toBeGreaterThan(0);
  });

  it('el IRP de referencia es el de ANTES de la ventana, no el de dentro', () => {
    const b = construirBienestar({ responses: RESPUESTAS, questionnaires: [Q_BIENESTAR], ventana });
    const ultimoAntes = b.historial.filter(p => p.date <= '2026-08-31').pop();
    expect(b.irpAlInicio).toBe(ultimoAntes?.value ?? null);
    // El punto del 07-09 cae DENTRO de la ventana: no puede ser la referencia.
    const dentro = b.historial.find(p => p.date === '2026-09-07');
    if (dentro) expect(b.irpAlInicio).not.toBe(dentro.value);
  });

  it('solo saca como crónicos los grupos que pasan el umbral, de más a menos', () => {
    const b = construirBienestar({ responses: RESPUESTAS, questionnaires: [Q_BIENESTAR], ventana });
    // Pecho ronda 7,7/10 sostenido; dorsal ronda 2,7 y no llega al umbral de 6.
    expect(b.domsCronico.map(d => d.grupo)).toEqual(['pecho']);
    expect(b.domsCronico[0].media).toBeGreaterThanOrEqual(6);
  });

  it('domsPorGrupo trae TODOS los grupos con lecturas, pasen o no el umbral', () => {
    const b = construirBienestar({ responses: RESPUESTAS, questionnaires: [Q_BIENESTAR], ventana });
    // El dorsal no es crónico, pero su media sí va en la columna de la tabla.
    expect(Object.keys(b.domsPorGrupo).sort()).toEqual(['dorsal', 'pecho']);
    expect(b.domsPorGrupo.dorsal).toBeLessThan(6);
    expect(b.domsPorGrupo.pecho).toBeGreaterThanOrEqual(6);
    // Un grupo sin preguntas no aparece: un 0 diría «no le duele», que es otra cosa.
    expect(b.domsPorGrupo.cuadriceps).toBeUndefined();
  });

  it('sin cuestionarios no inventa nada: IRP null y listas vacías', () => {
    const b = construirBienestar({ responses: [], questionnaires: [], ventana });
    expect(b.irp.valor).toBeNull();
    expect(b.historial).toEqual([]);
    expect(b.domsCronico).toEqual([]);
    expect(b.domsPorGrupo).toEqual({});
    expect(b.irpAlInicio).toBeNull();
  });

  it('buildRevisionCoach lo expone sin que haya que pedirlo aparte', () => {
    const r = buildRevisionCoach({
      logs: [], exercises: [], mesocycles: [], periodo: { tipo: '7d' }, hoy: HOY,
      responses: RESPUESTAS, questionnaires: [Q_BIENESTAR],
    });
    expect(r.bienestar.irp.valor).not.toBeNull();
  });
});

// ── Periodo «desde la última revisión» ──────────────────────────────────────

function checkin(fecha: string, extra: Partial<WeightCheckIn> = {}): WeightCheckIn {
  return {
    id: `c_${fecha}`, userId: 'u', email: 'ana@x.com',
    timestamp: new Date(`${fecha}T18:00:00`), dateStr: fecha,
    weight: 80, mood: '😊', adherence: 'Sí', notes: '',
    ...extra,
  };
}

describe('fechaDeLaUltimaRevision', () => {
  it('solo cuenta los check-ins ya contestados o aprobados', () => {
    const cs = [
      checkin('2026-09-01', { approved: true }),
      checkin('2026-09-08', { coachFeedback: 'Buen trabajo' }),
      // Recibido y sin tocar: es el que se va a contestar ahora, no un corte.
      checkin('2026-09-13'),
    ];
    expect(fechaDeLaUltimaRevision(cs)).toBe('2026-09-08');
  });

  it('un feedback en blanco no cuenta como contestado', () => {
    expect(fechaDeLaUltimaRevision([checkin('2026-09-08', { coachFeedback: '   ' })])).toBeNull();
  });

  it('sin check-ins devuelve null', () => {
    expect(fechaDeLaUltimaRevision([])).toBeNull();
  });
});

describe('resolverPeriodoRevision · desde la última revisión', () => {
  const CS = [checkin('2026-09-08', { approved: true })];

  it('abre el día siguiente al check-in contestado y llega hasta hoy', () => {
    const v = resolverPeriodoRevision({ tipo: 'ultima_revision' }, [], HOY, CS);
    expect(v.desde).toBe('2026-09-09');
    expect(v.hasta).toBe(HOY);          // 2026-09-14
    expect(v.etiqueta).toBe('Desde la última revisión · 6 días');
  });

  it('se compara contra los mismos días de antes, no contra semanas redondeadas', () => {
    const v = resolverPeriodoRevision({ tipo: 'ultima_revision' }, [], HOY, CS);
    expect(v.comparison).toEqual({ mode: 'offset', dias: 6, label: 'vs los 6 días anteriores' });
  });

  it('sin ninguna revisión contestada cae a los últimos 7 días', () => {
    const v = resolverPeriodoRevision({ tipo: 'ultima_revision' }, [], HOY, []);
    expect(v.etiqueta).toBe('Últimos 7 días');
  });

  it('un check-in contestado hoy mismo no deja la ventana en el futuro', () => {
    const v = resolverPeriodoRevision(
      { tipo: 'ultima_revision' }, [], HOY, [checkin(HOY, { approved: true })],
    );
    expect(v.desde).toBe(HOY);
    expect(v.hasta).toBe(HOY);
  });
});

// ── Curvas de tendencia ─────────────────────────────────────────────────────

describe('curvasDeLaVentana', () => {
  const EJ = 'press_banca';
  const logsDe = (fechas: string[], cargas: number[]): WorkoutLog[] =>
    fechas.map((date, i) => ({
      id: `l_${date}`, athleteId: 'a', workoutId: 'w', assignmentId: 'as', date,
      completedAt: `${date}T18:00:00.000Z`,
      entries: [{ exerciseId: EJ, sets: [{ weight: cargas[i], repsDone: 8, rir: 2 }] }],
    })) as WorkoutLog[];

  it('la curva sale del historial entero, no de la ventana', () => {
    const logs = logsDe(
      ['2026-06-01', '2026-06-08', '2026-06-15', '2026-09-10'],
      [60, 62, 64, 70],
    );
    const { curvaPorEjercicio } = curvasDeLaVentana(
      [{ exerciseId: EJ, name: 'Press banca' } as never], logs,
    );
    // Cuatro sesiones, aunque tres caigan fuera de cualquier ventana reciente.
    expect(curvaPorEjercicio[EJ]).toHaveLength(4);
  });

  it('se queda con los últimos 8 puntos, que es lo que cabe en la sparkline', () => {
    const fechas = Array.from({ length: 12 }, (_, i) => `2026-07-${String(i + 1).padStart(2, '0')}`);
    const { curvaPorEjercicio } = curvasDeLaVentana(
      [{ exerciseId: EJ, name: 'Press banca' } as never],
      logsDe(fechas, fechas.map((_, i) => 60 + i)),
    );
    expect(curvaPorEjercicio[EJ]).toHaveLength(8);
  });

  it('la última sesión es la fecha real del último registro', () => {
    const { ultimaSesionPorEjercicio } = curvasDeLaVentana(
      [{ exerciseId: EJ, name: 'Press banca' } as never],
      logsDe(['2026-08-01', '2026-08-20'], [60, 65]),
    );
    expect(ultimaSesionPorEjercicio[EJ]).toBe('2026-08-20');
  });

  it('un ejercicio sin registros no aparece, en vez de salir con una curva vacía', () => {
    const r = curvasDeLaVentana([{ exerciseId: 'nunca', name: 'Nada' } as never], []);
    expect(r.curvaPorEjercicio.nunca).toBeUndefined();
    expect(r.ultimaSesionPorEjercicio.nunca).toBeUndefined();
  });
});
