import { describe, expect, it } from 'vitest';
import { Exercise, MuscleGroup, MuscleGroupConfig, DayPlan, MUSCLE_ORDER } from '../types';
import {
  grupoDelEjercicio, seriesPorGrupo, seriesPlanificadasDelDia, seriesPlanificadasDelMeso,
  balanceDeSeries, duracionEstimadaMin, frecuenciaSemanal, gruposEnDiasSeguidos,
  repartoDeSeries, SERIES_MAX_POR_EJERCICIO,
} from './programacion';

const ex = (id: string, muscleGroup?: MuscleGroup): Exercise => ({
  id, ownerId: 'coach', name: id, primaryFocus: '', muscleGroup,
  type: 'fuerza', isCustom: false,
});

const grupos = (parcial: Partial<Record<MuscleGroup, number>>): Record<MuscleGroup, MuscleGroupConfig> =>
  Object.fromEntries(MUSCLE_ORDER.map(g => [g, { series: parcial[g] ?? 0, priority: 'media' as const }])) as Record<MuscleGroup, MuscleGroupConfig>;

describe('grupoDelEjercicio', () => {
  it('da prioridad al grupo escrito en la prescripción', () => {
    expect(grupoDelEjercicio({ exerciseId: 'a', muscleGroup: 'pecho' }, [ex('a', 'triceps')])).toBe('pecho');
  });

  it('cae al catálogo cuando la prescripción no lo trae (rutina de biblioteca)', () => {
    expect(grupoDelEjercicio({ exerciseId: 'a' }, [ex('a', 'dorsal')])).toBe('dorsal');
  });

  it('devuelve null si no hay grupo por ningún lado', () => {
    expect(grupoDelEjercicio({ exerciseId: 'a' }, [ex('a')])).toBeNull();
    expect(grupoDelEjercicio({ exerciseId: 'zz' }, [])).toBeNull();
  });
});

describe('seriesPorGrupo', () => {
  it('suma las series de varios ejercicios del mismo grupo', () => {
    const mapa = seriesPorGrupo(
      [
        { exerciseId: 'a', muscleGroup: 'pecho', sets: 4 },
        { exerciseId: 'b', muscleGroup: 'pecho', sets: 3 },
        { exerciseId: 'c', muscleGroup: 'triceps', sets: 2 },
      ],
      [],
    );
    expect(mapa.get('pecho')).toBe(7);
    expect(mapa.get('triceps')).toBe(2);
  });

  it('ignora los ejercicios sin grupo en vez de inventarles uno', () => {
    const mapa = seriesPorGrupo([{ exerciseId: 'x', sets: 5 }], [ex('x')]);
    expect(mapa.size).toBe(0);
  });
});

describe('seriesPlanificadasDelDia / DelMeso', () => {
  it('lee las asignaciones del día de la distribución', () => {
    const day: DayPlan = {
      assignments: [{ group: 'pecho', series: 9 }, { group: 'triceps', series: 4 }],
      totalSeries: 13,
    };
    const mapa = seriesPlanificadasDelDia(day);
    expect(mapa.get('pecho')).toBe(9);
    expect(mapa.get('triceps')).toBe(4);
  });

  it('un día vacío (o inexistente) no planifica nada', () => {
    expect(seriesPlanificadasDelDia(undefined).size).toBe(0);
  });

  it('del meso solo salen los grupos con volumen > 0', () => {
    const mapa = seriesPlanificadasDelMeso(grupos({ pecho: 12, dorsal: 0 }));
    expect(mapa.get('pecho')).toBe(12);
    expect(mapa.has('dorsal')).toBe(false);
  });
});

describe('balanceDeSeries', () => {
  it('marca lo que falta por asignar', () => {
    const b = balanceDeSeries(
      new Map<MuscleGroup, number>([['pecho', 6]]),
      new Map<MuscleGroup, number>([['pecho', 9]]),
    );
    expect(b.pendientes).toBe(3);
    expect(b.sobrantes).toBe(0);
    expect(b.cuadra).toBe(false);
    expect(b.filas[0]).toMatchObject({ group: 'pecho', planificadas: 9, pautadas: 6, diff: -3 });
  });

  it('cuenta como sobrante un grupo que el plan no pedía', () => {
    const b = balanceDeSeries(
      new Map<MuscleGroup, number>([['biceps', 4]]),
      new Map<MuscleGroup, number>(),
    );
    expect(b.sobrantes).toBe(4);
    expect(b.filas[0]).toMatchObject({ group: 'biceps', planificadas: 0, diff: 4 });
  });

  it('cuadra cuando cada grupo recibe exactamente sus series', () => {
    const b = balanceDeSeries(
      new Map<MuscleGroup, number>([['pecho', 9], ['dorsal', 9]]),
      new Map<MuscleGroup, number>([['pecho', 9], ['dorsal', 9]]),
    );
    expect(b.cuadra).toBe(true);
    expect(b.totalPautadas).toBe(18);
    expect(b.totalPlanificadas).toBe(18);
  });

  it('no compensa un déficit con un exceso de otro grupo', () => {
    const b = balanceDeSeries(
      new Map<MuscleGroup, number>([['pecho', 12], ['dorsal', 6]]),
      new Map<MuscleGroup, number>([['pecho', 9], ['dorsal', 9]]),
    );
    expect(b.pendientes).toBe(3);
    expect(b.sobrantes).toBe(3);
    expect(b.cuadra).toBe(false);
  });

  it('ordena los descuadres más grandes primero', () => {
    const b = balanceDeSeries(
      new Map<MuscleGroup, number>([['pecho', 8], ['dorsal', 3]]),
      new Map<MuscleGroup, number>([['pecho', 9], ['dorsal', 9]]),
    );
    expect(b.filas.map(f => f.group)).toEqual(['dorsal', 'pecho']);
  });
});

describe('duracionEstimadaMin', () => {
  it('cuenta series × (trabajo + descanso), redondeado a 5 min', () => {
    // 12 series × (45 s + 90 s) = 1620 s = 27 min → 25
    expect(duracionEstimadaMin([{ sets: 12, restSeconds: 90 }])).toBe(25);
  });

  it('un día sin ejercicios dura 0, no el mínimo de 5', () => {
    expect(duracionEstimadaMin([])).toBe(0);
  });

  it('suma todos los ejercicios del día', () => {
    const min = duracionEstimadaMin([
      { sets: 4, restSeconds: 120 },
      { sets: 3, restSeconds: 60 },
    ]);
    // 4×165 + 3×105 = 660 + 315 = 975 s ≈ 16,25 min → 15
    expect(min).toBe(15);
  });
});

const dias = (asignaciones: [MuscleGroup, number][][]): DayPlan[] =>
  asignaciones.map(a => ({
    assignments: a.map(([group, series]) => ({ group, series })),
    totalSeries: a.reduce((s, [, n]) => s + n, 0),
  }));

describe('frecuenciaSemanal', () => {
  it('cuenta en cuántas sesiones aparece cada grupo', () => {
    const f = frecuenciaSemanal(dias([
      [['pecho', 5], ['triceps', 3]],
      [['dorsal', 6]],
      [['pecho', 5]],
    ]));
    expect(f.find(x => x.group === 'pecho')).toMatchObject({ veces: 2, dias: [0, 2] });
    expect(f.find(x => x.group === 'dorsal')!.veces).toBe(1);
  });

  it('un grupo con 0 series ese día no cuenta como frecuencia', () => {
    const f = frecuenciaSemanal(dias([[['pecho', 0]], [['pecho', 6]]]));
    expect(f.find(x => x.group === 'pecho')).toMatchObject({ veces: 1, dias: [1] });
  });

  it('ordena por frecuencia descendente', () => {
    const f = frecuenciaSemanal(dias([
      [['pecho', 4], ['gemelo', 3]],
      [['pecho', 4]],
      [['pecho', 4]],
    ]));
    expect(f[0].group).toBe('pecho');
  });

  it('en una semana, dos veces son 2 por semana', () => {
    const f = frecuenciaSemanal(dias([[['pecho', 5]], [['dorsal', 5]], [['pecho', 5]]]), 7);
    expect(f.find(x => x.group === 'pecho')!.porSemana).toBe(2);
  });

  it('en un ciclo de 9 días, dos veces NO son dos por semana', () => {
    const f = frecuenciaSemanal(dias([[['pecho', 5]], [['dorsal', 5]], [['pecho', 5]]]), 9);
    expect(f.find(x => x.group === 'pecho')!.porSemana).toBe(1.56);
  });

  it('tres veces en un ciclo de 14 días son la frecuencia 1,5', () => {
    const f = frecuenciaSemanal(dias([[['pecho', 4]], [['pecho', 4]], [['pecho', 4]]]), 14);
    expect(f.find(x => x.group === 'pecho')!.porSemana).toBe(1.5);
  });
});

describe('gruposEnDiasSeguidos', () => {
  it('detecta el mismo grupo en dos jornadas consecutivas', () => {
    const choques = gruposEnDiasSeguidos(dias([[['pecho', 5]], [['pecho', 5]], [['dorsal', 5]]]));
    expect(choques).toEqual([{ group: 'pecho', dias: [0, 1] }]);
  });

  it('un día de por medio no es un choque', () => {
    expect(gruposEnDiasSeguidos(dias([[['pecho', 5]], [['dorsal', 5]], [['pecho', 5]]]))).toEqual([]);
  });

  it('encuentra los dos choques de un grupo repartido en tres días seguidos', () => {
    const choques = gruposEnDiasSeguidos(dias([[['gluteo', 4]], [['gluteo', 4]], [['gluteo', 4]]]));
    expect(choques).toEqual([
      { group: 'gluteo', dias: [0, 1] },
      { group: 'gluteo', dias: [1, 2] },
    ]);
  });

  it('con un rotativo, dos sesiones separadas por un descanso no chocan', () => {
    // Push, Pull, Descanso, Legs, Descanso → sesiones en los días 0, 1 y 3.
    // Las sesiones 1 y 2 (Pull y Legs) están separadas por el descanso del día 2.
    const choques = gruposEnDiasSeguidos(
      dias([[['pecho', 5]], [['dorsal', 5]], [['dorsal', 5]]]),
      { offsets: [0, 1, 3], cicloDias: 5 },
    );
    expect(choques).toEqual([]);
  });

  it('avisa del choque entre el final de una vuelta y el principio de la siguiente', () => {
    // Ciclo de 4 días con sesiones en 0, 1, 3: el día 3 pega con el 0 del ciclo siguiente.
    const choques = gruposEnDiasSeguidos(
      dias([[['pecho', 5]], [['dorsal', 5]], [['pecho', 5]]]),
      { offsets: [0, 1, 3], cicloDias: 4 },
    );
    expect(choques).toEqual([{ group: 'pecho', dias: [3, 0], entreVueltas: true }]);
  });
});

describe('repartoDeSeries', () => {
  it('nunca pasa de 4 series por ejercicio cuando hay catálogo de sobra', () => {
    for (let series = 1; series <= 25; series++) {
      const reparto = repartoDeSeries(series, 50);
      expect(Math.max(...reparto)).toBeLessThanOrEqual(SERIES_MAX_POR_EJERCICIO);
      expect(reparto.reduce((s, n) => s + n, 0)).toBe(series);
    }
  });

  it('9 series salen como 3+3+3, no como 5+4', () => {
    expect(repartoDeSeries(9, 50)).toEqual([3, 3, 3]);
  });

  it('12 series salen como 4+4+4', () => {
    expect(repartoDeSeries(12, 50)).toEqual([4, 4, 4]);
  });

  it('0 series no abren ningún ejercicio', () => {
    expect(repartoDeSeries(0, 50)).toEqual([]);
  });

  it('con un solo ejercicio disponible reparte en dos antes que perder volumen', () => {
    expect(repartoDeSeries(10, 1)).toEqual([5, 5]);
  });
});

describe('seriesPlanificadasDelMeso · ciclos de más de una semana', () => {
  it('un ciclo de dos semanas pide el doble de series que la configuración semanal', () => {
    const mapa = seriesPlanificadasDelMeso(grupos({ pecho: 12 }), 2);
    expect(mapa.get('pecho')).toBe(24);
  });

  it('sin indicar ciclo, se queda con las series semanales tal cual', () => {
    expect(seriesPlanificadasDelMeso(grupos({ pecho: 12 })).get('pecho')).toBe(12);
  });
});
