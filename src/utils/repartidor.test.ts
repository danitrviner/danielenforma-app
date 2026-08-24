import { describe, expect, it } from 'vitest';
import { MuscleGroup, MuscleGroupConfig, MUSCLE_ORDER } from '../types';
import { runDistribution, frecuenciaSemanal } from './programacion';
import { offsetsDeSesiones, frecuenciaPorSemana } from './progression';
import { TRAINING_SPLITS, tiposDeEntrenamiento, offsetsDeSplit, cicloDeSplit } from './trainingSplits';

const grupos = (parcial: Partial<Record<MuscleGroup, number>>): Record<MuscleGroup, MuscleGroupConfig> =>
  Object.fromEntries(MUSCLE_ORDER.map(g => [g, { series: parcial[g] ?? 0, priority: 'media' as const }])) as Record<MuscleGroup, MuscleGroupConfig>;

const seriesDe = (days: ReturnType<typeof runDistribution>['days'], group: MuscleGroup) =>
  days.reduce((s, d) => s + d.assignments.filter(a => a.group === group).reduce((n, a) => n + a.series, 0), 0);

const sesionesCon = (days: ReturnType<typeof runDistribution>['days'], group: MuscleGroup) =>
  days.filter(d => d.assignments.some(a => a.group === group && a.series > 0)).length;

describe('runDistribution · ciclo semanal (comportamiento de siempre)', () => {
  it('reparte exactamente las series configuradas', () => {
    const { days } = runDistribution(grupos({ pecho: 12 }), 4, undefined, {
      cicloDias: 7, offsets: [0, 1, 2, 3],
    });
    expect(seriesDe(days, 'pecho')).toBe(12);
  });

  it('no pone el mismo grupo en dos días seguidos si puede evitarlo', () => {
    const { days } = runDistribution(grupos({ pecho: 12 }), 4, undefined, {
      cicloDias: 7, offsets: [0, 1, 2, 3],
    });
    const dias = days.map((d, i) => (d.assignments.some(a => a.group === 'pecho') ? i : -1)).filter(i => i >= 0);
    for (let i = 1; i < dias.length; i++) expect(dias[i] - dias[i - 1]).toBeGreaterThan(1);
  });
});

describe('runDistribution · ciclo de dos semanas — las frecuencias «y media»', () => {
  it('un ciclo de 14 días mueve el doble de series que la configuración semanal', () => {
    const { days } = runDistribution(grupos({ pecho: 9 }), 6, undefined, {
      cicloDias: 14, offsets: [0, 1, 2, 7, 8, 9],
    });
    expect(seriesDe(days, 'pecho')).toBe(18); // 9 por semana × 2 semanas
  });

  it('9 series semanales caen en 3 sesiones del ciclo: frecuencia 1,5', () => {
    const { days } = runDistribution(grupos({ pecho: 9 }), 6, undefined, {
      cicloDias: 14, offsets: [0, 1, 2, 7, 8, 9],
    });
    expect(sesionesCon(days, 'pecho')).toBe(3);
    expect(frecuenciaPorSemana(3, 14)).toBe(1.5);
  });

  it('15 series semanales caen en 5 sesiones del ciclo: frecuencia 2,5', () => {
    const { days } = runDistribution(grupos({ pecho: 15 }), 10, undefined, {
      cicloDias: 14, offsets: [0, 1, 2, 3, 4, 7, 8, 9, 10, 11],
    });
    expect(sesionesCon(days, 'pecho')).toBe(5);
    expect(frecuenciaPorSemana(5, 14)).toBe(2.5);
  });

  it('una frecuencia impar sale como 2 sesiones una semana y 3 la siguiente', () => {
    const offsets = [0, 1, 2, 3, 4, 7, 8, 9, 10, 11];
    const { days } = runDistribution(grupos({ pecho: 15 }), 10, undefined, { cicloDias: 14, offsets });
    const enSemana = [0, 0];
    days.forEach((d, i) => {
      if (d.assignments.some(a => a.group === 'pecho' && a.series > 0)) enSemana[offsets[i] < 7 ? 0 : 1]++;
    });
    expect(enSemana.sort()).toEqual([2, 3]);
  });

  it('21 series semanales dan 3 y 4: frecuencia 3,5', () => {
    const offsets = [0, 1, 2, 3, 4, 7, 8, 9, 10, 11];
    const { days } = runDistribution(grupos({ pecho: 21 }), 10, undefined, { cicloDias: 14, offsets });
    expect(sesionesCon(days, 'pecho')).toBe(7);
    expect(frecuenciaPorSemana(7, 14)).toBe(3.5);
  });

  it('la frecuencia que reporta la vista es la real, no el número de sesiones', () => {
    const { days } = runDistribution(grupos({ pecho: 9 }), 6, undefined, {
      cicloDias: 14, offsets: [0, 1, 2, 7, 8, 9],
    });
    const fila = frecuenciaSemanal(days, 14).find(f => f.group === 'pecho')!;
    expect(fila.veces).toBe(3);
    expect(fila.porSemana).toBe(1.5);
  });
});

describe('runDistribution · la regla de días seguidos mira el calendario', () => {
  it('las sesiones a caballo entre semanas no cuentan como días seguidos', () => {
    // Sesiones 2 y 3 son el día 2 y el día 7: hay cuatro días de por medio.
    const { days } = runDistribution(grupos({ pecho: 12 }), 6, undefined, {
      cicloDias: 14, offsets: [0, 1, 2, 7, 8, 9],
    });
    const diasCalendario = days
      .map((d, i) => (d.assignments.some(a => a.group === 'pecho') ? [0, 1, 2, 7, 8, 9][i] : -1))
      .filter(i => i >= 0);
    for (let i = 1; i < diasCalendario.length; i++) {
      expect(diasCalendario[i] - diasCalendario[i - 1]).toBeGreaterThan(1);
    }
  });
});

describe('runDistribution · con el reparto Torso-Pierna alterno', () => {
  const split = TRAINING_SPLITS.find(s => s.id === 'rot14-torso-pierna-3d')!;

  it('deja pecho y cuádriceps a 1,5 por semana', () => {
    const { days } = runDistribution(
      grupos({ pecho: 9, cuadriceps: 9 }),
      6,
      tiposDeEntrenamiento(split),
      { cicloDias: cicloDeSplit(split), offsets: offsetsDeSplit(split) },
    );
    const frec = frecuenciaSemanal(days, 14);
    expect(frec.find(f => f.group === 'pecho')!.porSemana).toBe(1.5);
    expect(frec.find(f => f.group === 'cuadriceps')!.porSemana).toBe(1.5);
  });

  it('el pecho solo cae en días de torso y el cuádriceps solo en días de pierna', () => {
    const tipos = tiposDeEntrenamiento(split);
    const { days } = runDistribution(
      grupos({ pecho: 9, cuadriceps: 9 }),
      6,
      tipos,
      { cicloDias: cicloDeSplit(split), offsets: offsetsDeSplit(split) },
    );
    days.forEach((d, i) => {
      for (const a of d.assignments) {
        if (a.group === 'pecho') expect(tipos[i]).toBe('Torso');
        if (a.group === 'cuadriceps') expect(tipos[i]).toBe('Pierna');
      }
    });
  });
});

describe('runDistribution · sobrevolumen', () => {
  it('avisa sobre el volumen del CICLO, no sobre el semanal', () => {
    // 40 series/semana × 2 semanas = 80, y 6 sesiones × 12 = 72.
    const offsets = offsetsDeSesiones({ sesiones: 6, cicloDias: 14, repartirEnElCiclo: true });
    const { overloadAlert } = runDistribution(grupos({ pecho: 20, dorsal: 20 }), 6, undefined, {
      cicloDias: 14, offsets,
    });
    expect(overloadAlert).toBe(true);
  });

  it('no avisa cuando cabe', () => {
    const { overloadAlert } = runDistribution(grupos({ pecho: 12 }), 4, undefined, {
      cicloDias: 7, offsets: [0, 1, 2, 3],
    });
    expect(overloadAlert).toBe(false);
  });
});
