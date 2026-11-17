import { describe, expect, it } from 'vitest';
import type { Exercise, HipotesisDeZona, Mesocycle, WorkoutExercise, WorkoutLog } from '../../types';
import catalogoPrueba from '../cdg/__fixtures__/catalogoPrueba.json';
import { crearMotor, expandirCatalogo, type CdgCatalogoCompacto } from '../cdg';
import { addDays } from '../trainingWeek';
import { semaforoDeHipotesis, semaforoDelBloque } from './semaforoDeHipotesis';

const H: Record<string, HipotesisDeZona> = {
  pectoral: { palanca: 'volumen', iemMedioObjetivo: 58, iemTecho: 64, rmObjetivoPct: 5 },
  deltoides: { palanca: 'intensidad', iemMedioObjetivo: 41, iemTecho: 44 },
};
const estado = (pectoral: number, deltoides: number) => ({
  porZona: {
    pectoral: { zona: 'pectoral' as const, iemMedio: pectoral, iemFinal: pectoral, porSemana: [] },
    deltoides: { zona: 'deltoides' as const, iemMedio: deltoides, iemFinal: deltoides, porSemana: [] },
  },
});
const base = { hipotesis: H, semanaActual: 9, semanasTotales: 12 };

describe('semaforoDeHipotesis', () => {
  it('una fila por zona con estrella, en el orden de las zonas; sin hipótesis, ninguna', () => {
    expect(semaforoDeHipotesis({ ...base, estado: estado(60, 42) }).map(f => f.zona)).toEqual(['pectoral', 'deltoides']);
    expect(semaforoDeHipotesis({ ...base, hipotesis: undefined, estado: estado(60, 42) })).toEqual([]);
    expect(semaforoDeHipotesis({ ...base, hipotesis: {}, estado: null })).toEqual([]);
  });

  it('va en camino: el IEM medio llega al 95 % del objetivo y el RM lleva lo que toca a estas alturas', () => {
    const [p] = semaforoDeHipotesis({
      ...base, estado: estado(56, 42), rm: { pectoral: 3.9 },
      subidas: { pectoral: { subidas: [{ semana: 4, de: 55, a: 60.5, puntos: 5.5, pct: 10 }], semanasSostenidas: 3 } },
    });
    expect(p).toMatchObject({
      nombre: 'Pectoral', palanca: 'volumen', iemMedio: 56, iemMedioObjetivo: 58, techo: 64, subidas: 1, semanasDesdeLaSubida: 3,
      rmPct: 3.9, rmObjetivoPct: 5, rmEsperadoPct: 3.8, proceso: 'en_camino', resultado: 'en_camino', color: 'en_camino',
    });
    expect(p.texto).toBe('IEM medio 56 de 58 · techo 64 · 3 semanas desde la última subida · RM +3,9 % de +5 % (a estas alturas, +3,8 %)');
  });

  it('por detrás: el estímulo no llega, o el RM va por debajo de lo que toca', () => {
    const [p, d] = semaforoDeHipotesis({ ...base, estado: estado(50, 42), rm: { pectoral: 4, deltoides: 1 } });
    expect(p).toMatchObject({ proceso: 'por_detras', resultado: 'en_camino', color: 'por_detras' });
    expect(d).toMatchObject({ proceso: 'en_camino', resultado: 'por_detras', color: 'por_detras', rmObjetivoPct: 5 });
    expect(d.texto).toBe('IEM medio 42 de 41 · techo 44 · sin subidas todavía · RM +1 % de +5 % (a estas alturas, +3,8 %)');
  });

  it('una caída de RM mayor que el ruido va por detrás aunque sea la primera semana', () => {
    const [p] = semaforoDeHipotesis({ ...base, semanaActual: 1, estado: estado(60, 42), rm: { pectoral: -3.5 } });
    expect(p).toMatchObject({ resultado: 'por_detras', color: 'por_detras' });
    // Mientras lo que toca no supera el ruido (semana 6 de 12: +2,5 %), una cifra dentro del ruido vale.
    expect(semaforoDeHipotesis({ ...base, semanaActual: 6, estado: estado(60, 42), rm: { pectoral: -1 } })[0].resultado).toBe('en_camino');
    expect(semaforoDeHipotesis({ ...base, semanaActual: 9, estado: estado(60, 42), rm: { pectoral: 1 } })[0].resultado).toBe('por_detras');
  });

  it('sin dato: sin motor ni marcas no hay color; si solo falta uno, manda el otro', () => {
    const [p] = semaforoDeHipotesis({ ...base, estado: null });
    expect(p).toMatchObject({ iemMedio: null, rmPct: null, proceso: 'sin_dato', resultado: 'sin_dato', color: 'sin_dato' });
    expect(p.texto).toBe('IEM medio sin dato · techo 64 · sin subidas todavía · RM sin medida');
    expect(semaforoDeHipotesis({ ...base, estado: estado(60, 42) })[0].color).toBe('en_camino');
    expect(semaforoDeHipotesis({ ...base, estado: null, rm: { pectoral: 1 } })[0].color).toBe('por_detras');
  });

  it('hipótesis sin cifras de IEM (primer bloque con estrella): el proceso no se puede leer', () => {
    const [p] = semaforoDeHipotesis({ ...base, hipotesis: { pectoral: { palanca: 'volumen' } }, estado: estado(60, 42), rm: { pectoral: 4 } });
    expect(p).toMatchObject({ proceso: 'sin_dato', resultado: 'en_camino', color: 'en_camino', iemMedioObjetivo: null, techo: null });
    expect(p.texto).toBe('IEM medio 60 · sin subidas todavía · RM +4 % de +5 % (a estas alturas, +3,8 %)');
  });

  it('recuperar: va en camino si el estímulo se queda bajo el tope y el RM no se pierde', () => {
    const h = { pectoral: { palanca: 'recuperar' as const, iemTecho: 30, rmObjetivoPct: 0 } };
    const [bien] = semaforoDeHipotesis({ ...base, hipotesis: h, estado: estado(31, 0), rm: { pectoral: -1 } });
    expect(bien).toMatchObject({ proceso: 'en_camino', resultado: 'en_camino', color: 'en_camino' });
    expect(bien.texto).toBe('IEM medio 31 (tope 30) · sin subidas todavía · RM −1 % (objetivo: no perder)');
    const [mal] = semaforoDeHipotesis({ ...base, hipotesis: h, estado: estado(40, 0), rm: { pectoral: -4 } });
    expect(mal).toMatchObject({ proceso: 'por_detras', resultado: 'por_detras' });
  });

  it('con el bloque ya cumplido se pide el objetivo entero', () => {
    const [p] = semaforoDeHipotesis({ ...base, semanaActual: 12, estado: estado(60, 42), rm: { pectoral: 4 }, subidas: { pectoral: { subidas: [], semanasSostenidas: 1 } } });
    expect(p).toMatchObject({ rmEsperadoPct: 5, resultado: 'por_detras' });
    expect(p.texto).toBe('IEM medio 60 de 58 · techo 64 · subió esta semana · RM +4 % de +5 %');
  });
});

describe('semaforoDelBloque · con los motores de verdad', () => {
  const motor = crearMotor(expandirCatalogo(catalogoPrueba as CdgCatalogoCompacto));
  const PRESS = 'Press banca plano con mancuernas (caja torácica amplia) - Pectoral, deltoides anterior, tríceps';
  const INICIO = '2026-08-24';
  const exercises = [{ id: 'press', name: 'Press banca', muscleGroup: 'pecho', cdgNombre: PRESS }] as Exercise[];
  const meso = (h: Mesocycle['hipotesis']): Mesocycle => ({
    id: 'm', athleteId: 'a', number: 1, weeks: 8, startDate: INICIO, objective: '', daysPerWeek: 1,
    groups: {} as Mesocycle['groups'], hipotesis: h,
  });
  // Cuatro semanas hechas: una sesión por semana, cada vez con un poco más de peso.
  const logs = Array.from({ length: 4 }, (_, i): WorkoutLog => ({
    id: `l${i}`, athleteId: 'a', workoutId: 'w', assignmentId: 'x', mesocycleId: 'm', date: addDays(INICIO, i * 7 + 1),
    completedAt: `${addDays(INICIO, i * 7 + 1)}T18:00:00.000Z`,
    entries: [{ exerciseId: 'press', sets: Array.from({ length: 4 }, () => ({ weight: 40 + i * 2, repsDone: 8, rir: 1 })) }],
  }));
  // Programado: 3 series y, desde la semana 3, una más.
  const programados: WorkoutExercise[] = [{
    exerciseId: 'press', order: 0, sets: 3, reps: '8-10', restSeconds: 120, rir: 1, weeklyProgression: [{ atWeek: 3, addSets: 1 }],
  }];
  const hoy = addDays(INICIO, 4 * 7 + 2); // semana 5 en curso

  it('sin hipótesis no hay semáforo', () => {
    expect(semaforoDelBloque({ motor, meso: meso(undefined), logs, exercises, programados, semanaActual: 5, vueltas: 8, hoy })).toEqual([]);
  });

  it('lee el IEM realizado hasta la semana pasada, el RM de la zona y las subidas programadas', () => {
    const [p] = semaforoDelBloque({
      motor, meso: meso({ pectoral: { palanca: 'volumen', iemMedioObjetivo: 1, iemTecho: 999, rmObjetivoPct: 5 } }),
      logs, exercises, programados, semanaActual: 5, vueltas: 8, hoy,
    });
    expect(p.zona).toBe('pectoral');
    expect(p.iemMedio).toBeGreaterThan(1);
    expect(p.proceso).toBe('en_camino');
    // Subió una serie en la semana 3: lleva tres semanas en ese nivel (3, 4 y 5).
    expect(p).toMatchObject({ subidas: 1, semanasDesdeLaSubida: 3 });
    // De 40 a 46 kg con las mismas repeticiones: el RM sube de sobra.
    expect(p.rmPct).toBeGreaterThan(5);
    expect(p).toMatchObject({ resultado: 'en_camino', color: 'en_camino' });
  });

  it('con un objetivo de estímulo que no se alcanza, va por detrás', () => {
    const [p] = semaforoDelBloque({
      motor, meso: meso({ pectoral: { palanca: 'volumen', iemMedioObjetivo: 9999, iemTecho: 9999 } }),
      logs, exercises, programados, semanaActual: 5, vueltas: 8, hoy,
    });
    expect(p).toMatchObject({ proceso: 'por_detras', color: 'por_detras' });
  });
});
