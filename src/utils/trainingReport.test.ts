import { describe, it, expect } from 'vitest';
import { Mesocycle, MuscleGroup, MuscleGroupConfig, MUSCLE_ORDER } from '../types';
import { resolveWindows } from './trainingReport';

/* Los tres modos de comparación de `resolveWindows`. El tercero ('offset') se
   añadió para la pestaña de Revisión del coach; los dos primeros llevaban sin
   test desde que se escribieron, así que se cubren de paso. */

function meso(id: string, number: number, startDate: string, weeks: number): Mesocycle {
  const groups = {} as Record<MuscleGroup, MuscleGroupConfig>;
  for (const g of MUSCLE_ORDER) groups[g] = { series: 0, priority: 'media' };
  return { id, athleteId: 'a@b.com', number, startDate, weeks, objective: '', daysPerWeek: 4, groups } as Mesocycle;
}

describe('resolveWindows · modo weeks', () => {
  it('desplaza la ventana entera n semanas hacia atrás', () => {
    const w = resolveWindows('2026-09-08', '2026-09-14', { mode: 'weeks', n: 1 }, []);
    expect(w).toMatchObject({
      curStart: '2026-09-08', curEnd: '2026-09-14',
      prevStart: '2026-09-01', prevEnd: '2026-09-07',
      comparisonLabel: 'vs la semana anterior',
    });
  });

  it('pluraliza a partir de 2', () => {
    expect(resolveWindows('2026-09-01', '2026-09-14', { mode: 'weeks', n: 2 }, []).comparisonLabel)
      .toBe('vs 2 semanas antes');
  });
});

describe('resolveWindows · modo mesocycle', () => {
  const m1 = meso('m1', 1, '2026-08-03', 5);
  const m2 = meso('m2', 2, '2026-09-07', 5);

  it('coge los dos bloques ENTEROS, ignorando el periodo que se le pase', () => {
    const w = resolveWindows('2026-09-07', '2026-09-14', { mode: 'mesocycle', currentId: 'm2', previousId: 'm1' }, [m1, m2]);
    expect(w).toMatchObject({
      curStart: '2026-09-07', curEnd: '2026-10-11',   // las 5 semanas, no hasta el 14
      prevStart: '2026-08-03', prevEnd: '2026-09-06',
      comparisonLabel: 'vs Macrociclo 1',
    });
  });

  it('sin bloque previo lo dice en vez de comparar contra nada', () => {
    const w = resolveWindows('2026-08-03', '2026-09-06', { mode: 'mesocycle', currentId: 'm1', previousId: null }, [m1]);
    expect(w.prevStart).toBeNull();
    expect(w.prevEnd).toBeNull();
    expect(w.comparisonLabel).toBe('sin macrociclo previo');
  });
});

describe('resolveWindows · modo offset', () => {
  it('respeta el periodo que se le pasa y desplaza los dos extremos los mismos días', () => {
    // Los 8 primeros días del bloque nuevo contra los 8 primeros del anterior,
    // que empezó 35 días antes. Es lo que impide el falso −45 % de tonelaje al
    // comparar un bloque a medias contra uno terminado.
    const w = resolveWindows(
      '2026-09-07', '2026-09-14',
      { mode: 'offset', dias: 35, label: 'vs el mismo tramo de Meso #1' },
      [],
    );
    expect(w).toEqual({
      curStart: '2026-09-07', curEnd: '2026-09-14',
      prevStart: '2026-08-03', prevEnd: '2026-08-10',
      comparisonLabel: 'vs el mismo tramo de Meso #1',
    });
    // Las dos ventanas miden lo mismo: ese es el punto entero del modo.
    const dias = (a: string, b: string) =>
      (new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86_400_000;
    expect(dias(w.curStart, w.curEnd)).toBe(dias(w.prevStart!, w.prevEnd!));
  });

  it('no necesita la lista de mesociclos', () => {
    const w = resolveWindows('2026-09-01', '2026-09-07', { mode: 'offset', dias: 7, label: 'x' }, []);
    expect(w.prevStart).toBe('2026-08-25');
  });
});
