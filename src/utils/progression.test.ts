import { describe, expect, it } from 'vitest';
import { WorkoutExercise } from '../types';
import {
  mesocycleWeekNumber, resolveExerciseForWeek, diasDeCiclo, offsetsDeSesiones, frecuenciaPorSemana,
  vueltasDelCiclo,
} from './progression';

describe('mesocycleWeekNumber', () => {
  it('la fecha de inicio es semana 1', () => {
    expect(mesocycleWeekNumber('2026-08-01', '2026-08-01')).toBe(1);
  });

  it('el último día de la semana 1 sigue siendo semana 1', () => {
    expect(mesocycleWeekNumber('2026-08-01', '2026-08-07')).toBe(1);
  });

  it('el día 8 ya es semana 2', () => {
    expect(mesocycleWeekNumber('2026-08-01', '2026-08-08')).toBe(2);
  });

  it('semana 6 tras 5 semanas completas', () => {
    expect(mesocycleWeekNumber('2026-08-01', '2026-09-05')).toBe(6);
  });
});

const BASE: WorkoutExercise = {
  exerciseId: 'ex1', order: 0, sets: 3, reps: '8-10', restSeconds: 90, rir: 2,
};

describe('diasDeCiclo', () => {
  it('sin ciclo declarado, hasta 7 sesiones el ciclo sigue siendo la semana', () => {
    expect(diasDeCiclo(4)).toBe(7);
    expect(diasDeCiclo(7)).toBe(7);
  });

  it('sin ciclo declarado y con más de 7 sesiones, dura tantos días como sesiones', () => {
    expect(diasDeCiclo(9)).toBe(9);
    expect(diasDeCiclo(10)).toBe(10);
  });

  it('con ciclo declarado manda ese', () => {
    expect(diasDeCiclo(3, 5)).toBe(5);
    expect(diasDeCiclo(9, 14)).toBe(14);
  });

  it('un ciclo más corto que las sesiones es imposible: gana el nº de sesiones', () => {
    expect(diasDeCiclo(6, 4)).toBe(6);
  });
});

describe('offsetsDeSesiones', () => {
  it('sin ciclo declarado, las sesiones van al principio (comportamiento histórico)', () => {
    expect(offsetsDeSesiones({ sesiones: 4, cicloDias: 7 })).toEqual([0, 1, 2, 3]);
  });

  it('el patrón del reparto manda sobre cualquier reparto automático', () => {
    // Push, Pull, Descanso, Legs, Descanso
    expect(offsetsDeSesiones({ sesiones: 3, cicloDias: 5, offsetsDelSplit: [0, 1, 3], repartirEnElCiclo: true }))
      .toEqual([0, 1, 3]);
  });

  it('un patrón que no cuadra con las sesiones se ignora', () => {
    expect(offsetsDeSesiones({ sesiones: 4, cicloDias: 7, offsetsDelSplit: [0, 1, 3] })).toEqual([0, 1, 2, 3]);
  });

  it('un ciclo de 14 días también reparte a lo largo, sin anclar a semanas de 7', () => {
    // 10 sesiones en 14 días — nada las agrupa en "primera semana llena,
    // segunda con huecos": se reparten uniformes por todo el ciclo, así que
    // los días de la semana van cambiando de una vuelta a otra.
    expect(offsetsDeSesiones({ sesiones: 10, cicloDias: 14, repartirEnElCiclo: true }))
      .toEqual([0, 1, 2, 4, 5, 7, 8, 9, 11, 12]);
  });

  it('un número impar de sesiones en un ciclo largo también se reparte uniforme', () => {
    expect(offsetsDeSesiones({ sesiones: 9, cicloDias: 14, repartirEnElCiclo: true }))
      .toEqual([0, 1, 3, 4, 6, 7, 9, 10, 12]);
  });

  it('sin duración de ciclo explícita, las sesiones van al principio (comportamiento histórico)', () => {
    expect(offsetsDeSesiones({ sesiones: 4, cicloDias: 7 })).toEqual([0, 1, 2, 3]);
  });

  it('el mismo mecanismo vale para cualquier duración, cuadre o no con semanas', () => {
    expect(offsetsDeSesiones({ sesiones: 6, cicloDias: 10, repartirEnElCiclo: true })).toEqual([0, 1, 3, 5, 6, 8]);
    // 2 veces en un ciclo de 9 días — el ejemplo real de Dani (Torso, Pierna,
    // Full body, Descanso, Brazo, Torso, Descanso, Pierna, Descanso): Torso
    // cae en los días 0 y 5 del ciclo, no siempre el mismo día de la semana.
    expect(offsetsDeSesiones({ sesiones: 6, cicloDias: 9, repartirEnElCiclo: true })).toEqual([0, 1, 3, 4, 6, 7]);
  });

  it('los días asignados nunca se repiten ni se salen del ciclo', () => {
    for (let ses = 1; ses <= 10; ses++) {
      for (let ciclo = ses; ciclo <= 21; ciclo++) {
        const off = offsetsDeSesiones({ sesiones: ses, cicloDias: ciclo, repartirEnElCiclo: true });
        expect(off).toHaveLength(ses);
        expect(new Set(off).size).toBe(ses);
        expect(Math.max(...off)).toBeLessThan(ciclo);
      }
    }
  });
});

describe('frecuenciaPorSemana', () => {
  it('dos veces en una semana son 2 por semana', () => {
    expect(frecuenciaPorSemana(2, 7)).toBe(2);
  });

  it('una vez cada 5 días son 1,4 por semana', () => {
    expect(frecuenciaPorSemana(1, 5)).toBe(1.4);
  });

  it('tres veces cada 14 días son exactamente 1,5 por semana', () => {
    expect(frecuenciaPorSemana(3, 14)).toBe(1.5);
  });

  it('una vez cada 4 días son 1,75 por semana, no 1,8', () => {
    expect(frecuenciaPorSemana(1, 4)).toBe(1.75);
  });

  it('dos veces cada 9 días son 1,56 por semana', () => {
    expect(frecuenciaPorSemana(2, 9)).toBe(1.56);
  });
});

describe('mesocycleWeekNumber · ciclos largos', () => {
  it('con un ciclo de 9 días, el día 9 sigue siendo la primera vuelta', () => {
    expect(mesocycleWeekNumber('2026-08-01', '2026-08-09', 9)).toBe(1);
  });

  it('con un ciclo de 9 días, el día 10 ya es la segunda vuelta', () => {
    expect(mesocycleWeekNumber('2026-08-01', '2026-08-10', 9)).toBe(2);
  });

  it('sin pasar el ciclo se comporta como antes (semanas de 7)', () => {
    expect(mesocycleWeekNumber('2026-08-01', '2026-08-09')).toBe(2);
  });

  it('las vueltas de un ciclo largo no se solapan entre sí', () => {
    // 4 vueltas × 9 días desde el 1 de agosto: cada sesión cae en un día distinto.
    const fechas = new Set<string>();
    for (let vuelta = 0; vuelta < 4; vuelta++) {
      for (let dia = 0; dia < 9; dia++) {
        const d = new Date(Date.UTC(2026, 7, 1));
        d.setUTCDate(d.getUTCDate() + vuelta * 9 + dia);
        const iso = d.toISOString().slice(0, 10);
        expect(fechas.has(iso)).toBe(false);
        fechas.add(iso);
        expect(mesocycleWeekNumber('2026-08-01', iso, 9)).toBe(vuelta + 1);
      }
    }
    expect(fechas.size).toBe(36);
  });
});

describe('resolveExerciseForWeek', () => {
  it('sin reglas, devuelve el ejercicio tal cual', () => {
    expect(resolveExerciseForWeek(BASE, 4)).toEqual(BASE);
  });

  it('antes de la primera regla, no aplica nada', () => {
    const we: WorkoutExercise = { ...BASE, weeklyProgression: [{ atWeek: 4, addSets: 1 }] };
    expect(resolveExerciseForWeek(we, 3).sets).toBe(3);
  });

  it('en la semana de la regla, aplica el escalón', () => {
    const we: WorkoutExercise = { ...BASE, weeklyProgression: [{ atWeek: 4, addSets: 1 }] };
    expect(resolveExerciseForWeek(we, 4).sets).toBe(4);
  });

  it('los escalones son acumulativos: el último aplicable gana', () => {
    const we: WorkoutExercise = {
      ...BASE,
      weeklyProgression: [
        { atWeek: 4, addSets: 1 },
        { atWeek: 6, addSets: 2 },
        { atWeek: 9, addSets: 1 },
      ],
    };
    expect(resolveExerciseForWeek(we, 5).sets).toBe(4);  // solo el escalón de la semana 4
    expect(resolveExerciseForWeek(we, 7).sets).toBe(5);  // el de la semana 6 (no se suman entre sí)
    expect(resolveExerciseForWeek(we, 12).sets).toBe(4); // el de la semana 9
  });

  it('sustituye reps y RIR a partir de su semana', () => {
    const we: WorkoutExercise = { ...BASE, weeklyProgression: [{ atWeek: 4, addReps: '10-12', setRir: 1 }] };
    const resolved = resolveExerciseForWeek(we, 4);
    expect(resolved.reps).toBe('10-12');
    expect(resolved.rir).toBe(1);
    expect(resolved.sets).toBe(3); // sin addSets, no cambia
  });

  it('con setGroups, el escalón se aplica solo al último bloque y resincroniza el agregado', () => {
    const we: WorkoutExercise = {
      ...BASE,
      setGroups: [
        { label: 'Top set', sets: 1, reps: '5', rir: 1 },
        { label: 'Back-off', sets: 2, reps: '10-12', rir: 3 },
      ],
      weeklyProgression: [{ atWeek: 4, addSets: 1 }],
    };
    const resolved = resolveExerciseForWeek(we, 4);
    expect(resolved.setGroups?.[0].sets).toBe(1);   // el primer bloque no cambia
    expect(resolved.setGroups?.[1].sets).toBe(3);   // el último bloque sube +1
    expect(resolved.sets).toBe(4);                  // agregado resincronizado (1 + 3)
  });

  it('no deja las series por debajo de 1', () => {
    const we: WorkoutExercise = { ...BASE, sets: 1, weeklyProgression: [{ atWeek: 4, addSets: -5 }] };
    expect(resolveExerciseForWeek(we, 4).sets).toBe(1);
  });

  describe('condición (Bloque H2.2)', () => {
    const withCondition = (fallback: 'mantener' | 'mitad' | 'posponer' | 'avisar'): WorkoutExercise => ({
      ...BASE,
      weeklyProgression: [{ atWeek: 4, addSets: 2, condition: { rows: [{ metric: 'adherenciaDieta', operator: '>=', value: 80 }], fallback } }],
    });

    it('sin conditionCtx, la regla condicional nunca se aplica (a lo seguro)', () => {
      expect(resolveExerciseForWeek(withCondition('mantener'), 4).sets).toBe(3);
    });

    it('con conditionCtx que cumple, se aplica normal', () => {
      const ctx = { today: '2026-09-01', workoutAssignments: [], workoutLogs: [], bodyweightLogs: [], dietAdherencePct: 90 };
      expect(resolveExerciseForWeek(withCondition('mantener'), 4, ctx).sets).toBe(5);
    });

    it('fallback "mantener": si no se cumple, la regla no aplica', () => {
      const ctx = { today: '2026-09-01', workoutAssignments: [], workoutLogs: [], bodyweightLogs: [], dietAdherencePct: 50 };
      expect(resolveExerciseForWeek(withCondition('mantener'), 4, ctx).sets).toBe(3);
    });

    it('fallback "mitad": si no se cumple, aplica la mitad de addSets (redondeado)', () => {
      const ctx = { today: '2026-09-01', workoutAssignments: [], workoutLogs: [], bodyweightLogs: [], dietAdherencePct: 50 };
      expect(resolveExerciseForWeek(withCondition('mitad'), 4, ctx).sets).toBe(4); // 3 + round(2/2)
    });

    it('sin condición cumplida, cae al escalón anterior que sí aplique', () => {
      const we: WorkoutExercise = {
        ...BASE,
        weeklyProgression: [
          { atWeek: 4, addSets: 1 },
          { atWeek: 6, addSets: 2, condition: { rows: [{ metric: 'adherenciaDieta', operator: '>=', value: 80 }], fallback: 'mantener' } },
        ],
      };
      const ctx = { today: '2026-09-01', workoutAssignments: [], workoutLogs: [], bodyweightLogs: [], dietAdherencePct: 50 };
      expect(resolveExerciseForWeek(we, 7, ctx).sets).toBe(4); // se queda en el escalón de la semana 4
    });
  });
});

describe('vueltasDelCiclo', () => {
  it('con ciclo semanal, las vueltas son las semanas de siempre', () => {
    expect(vueltasDelCiclo(4, 7)).toBe(4);
    expect(vueltasDelCiclo(8, 7)).toBe(8);
  });

  it('un microciclo de dos semanas se repite la mitad de veces', () => {
    expect(vueltasDelCiclo(8, 14)).toBe(4);
    expect(vueltasDelCiclo(4, 14)).toBe(2);
  });

  it('un ciclo rotativo cabe las veces que cabe', () => {
    expect(vueltasDelCiclo(4, 5)).toBe(6); // 28 días / 5 ≈ 5,6 → 6
    expect(vueltasDelCiclo(3, 4)).toBe(5);
  });

  it('nunca devuelve menos de una vuelta', () => {
    expect(vueltasDelCiclo(1, 14)).toBe(1);
  });
});
