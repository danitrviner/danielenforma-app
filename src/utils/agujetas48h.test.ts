import { describe, it, expect } from 'vitest';
import type { Exercise, Workout, WorkoutLog } from '../types';
import {
  sesionParaAgujetas48h, zonasTrabajadas, agujetasContestadas, enPausaTrasAhoraNo, respuestaDeAgujetas,
  VENTANA_AGUJETAS_48H, HORAS_DE_PAUSA_AHORA_NO,
} from './agujetas48h';

const AHORA = Date.parse('2026-11-17T18:00:00.000Z');
const hace = (horas: number) => new Date(AHORA - horas * 3_600_000).toISOString();

const ej = (id: string, muscleGroup?: Exercise['muscleGroup']) => ({ id, muscleGroup });
const EJERCICIOS = [
  ej('sentadilla', 'cuadriceps'), ej('prensa', 'cuadriceps'), ej('curl_femoral', 'isquios'), ej('hip_thrust', 'gluteo'),
  ej('aductor', 'aductores'), ej('gemelo', 'gemelo'), ej('plancha', 'core'), ej('press', 'pecho'), ej('lateral', 'deltoide_lat'),
  ej('pajaros', 'deltoide_post'), ej('rotadores', 'rotadores'), ej('sin_grupo'),
];
const serie = (repsDone = 8, extra: Partial<WorkoutLog['entries'][number]['sets'][number]> = {}) => ({ weight: 50, repsDone, rir: 2, ...extra });
const entrada = (exerciseId: string, series: number) => ({ exerciseId, sets: Array.from({ length: series }, () => serie()) });

const log = (id: string, horas: number, entries: WorkoutLog['entries'], extra: Partial<WorkoutLog> = {}): WorkoutLog => ({
  id, athleteId: 'a@b.c', workoutId: 'pierna_a', assignmentId: `as_${id}`, date: hace(horas).slice(0, 10), completedAt: hace(horas), entries, ...extra,
});
const RUTINAS: Pick<Workout, 'id' | 'name' | 'exercises'>[] = [{ id: 'pierna_a', name: 'Pierna A', exercises: [] }];
const PIERNA = [entrada('sentadilla', 4), entrada('curl_femoral', 3), entrada('hip_thrust', 2)];

describe('sesionParaAgujetas48h', () => {
  const pedir = (logs: WorkoutLog[], ahora: number | Date | string = AHORA) => sesionParaAgujetas48h({ logs, workouts: RUTINAS, exercises: EJERCICIOS, ahora });

  it('pregunta por la sesión terminada hace 36-72 h, con sus zonas de más a menos series', () => {
    const p = pedir([log('l1', 48, PIERNA)]);
    expect(p).toMatchObject({ logId: 'l1', workoutId: 'pierna_a', sesion: 'Pierna A', fecha: hace(48).slice(0, 10) });
    expect(p!.zonas).toEqual([{ zona: 'cuadriceps', series: 4 }, { zona: 'isquios', series: 3 }, { zona: 'gluteo', series: 2 }]);
    expect(p!.caduca).toBe(hace(48 - 72));
  });

  it('antes de las 36 h todavía no, y pasadas las 72 h ya no', () => {
    expect(pedir([log('pronto', 35.9, PIERNA)])).toBeNull();
    expect(pedir([log('justo', 36, PIERNA)])?.logId).toBe('justo');
    expect(pedir([log('limite', 72, PIERNA)])?.logId).toBe('limite');
    expect(pedir([log('tarde', 72.1, PIERNA)])).toBeNull();
    expect(VENTANA_AGUJETAS_48H).toMatchObject({ desdeHoras: 36, hastaHoras: 72, maxZonas: 5 });
  });

  it('una sesión ya contestada no se vuelve a preguntar', () => {
    expect(pedir([log('l1', 48, PIERNA, { agujetas48h: { cuadriceps: 2 }, agujetas48hAt: hace(1) })])).toBeNull();
    expect(agujetasContestadas({ agujetas48h: { cuadriceps: 2 } })).toBe(true);
    expect(agujetasContestadas({ agujetas48hAt: hace(1) })).toBe(true);
    expect(agujetasContestadas({ agujetas48h: {} })).toBe(false);
    expect(agujetasContestadas({})).toBe(false);
  });

  it('con varias en la ventana, la más antigua primero; contestada esa, la siguiente', () => {
    const nueva = log('nueva', 40, [entrada('press', 3)], { workoutId: 'torso' });
    const vieja = log('vieja', 60, PIERNA);
    expect(pedir([nueva, vieja])?.logId).toBe('vieja');
    expect(pedir([nueva, { ...vieja, agujetas48h: { cuadriceps: 1 }, agujetas48hAt: hace(0) }])?.logId).toBe('nueva');
  });

  it('como mucho las 5 zonas con más series', () => {
    const p = pedir([log('l1', 48, [
      entrada('gemelo', 1), entrada('sentadilla', 5), entrada('curl_femoral', 4), entrada('hip_thrust', 3),
      entrada('aductor', 2), entrada('plancha', 2), entrada('press', 6),
    ])]);
    expect(p!.zonas.map(z => z.zona)).toEqual(['pectoral', 'cuadriceps', 'isquios', 'gluteo', 'abdomen']);
    expect(p!.zonas).toHaveLength(5);
  });

  it('una sesión sin zonas reconocibles se salta y no tapa a la siguiente', () => {
    const sinZonas = log('movilidad', 60, [entrada('rotadores', 3), entrada('sin_grupo', 2)]);
    expect(pedir([sinZonas])).toBeNull();
    expect(pedir([sinZonas, log('l2', 40, PIERNA)])?.logId).toBe('l2');
  });

  it('un completedAt ilegible no rompe nada', () => {
    expect(pedir([{ ...log('raro', 48, PIERNA), completedAt: 'ayer' }])).toBeNull();
    expect(pedir([log('l1', 48, PIERNA)], 'no es una fecha')).toBeNull();
  });

  it('acepta «ahora» como fecha, número o ISO', () => {
    const logs = [log('l1', 48, PIERNA)];
    expect(pedir(logs, new Date(AHORA))?.logId).toBe('l1');
    expect(pedir(logs, new Date(AHORA).toISOString())?.logId).toBe('l1');
  });
});

describe('zonasTrabajadas', () => {
  it('suma los grupos de una misma zona y no cuenta bajadas ni filas sin repeticiones', () => {
    const z = zonasTrabajadas({ entries: [
      entrada('lateral', 3), entrada('pajaros', 2),
      { exerciseId: 'sentadilla', sets: [serie(), serie(), serie(6, { segmento: true }), serie(0)] },
    ] }, undefined, EJERCICIOS);
    expect(z).toEqual([{ zona: 'deltoides', series: 5 }, { zona: 'cuadriceps', series: 2 }]);
  });

  it('manda el grupo que el coach puso en la rutina', () => {
    const rutina = { exercises: [{ exerciseId: 'hip_thrust', order: 0, sets: 3, reps: '8-10', restSeconds: 120, rir: 2, muscleGroup: 'isquios' as const }] };
    expect(zonasTrabajadas({ entries: [entrada('hip_thrust', 3)] }, rutina, EJERCICIOS)).toEqual([{ zona: 'isquios', series: 3 }]);
  });

  it('a igualdad de series, el orden de las zonas del IEM', () => {
    const z = zonasTrabajadas({ entries: [entrada('hip_thrust', 3), entrada('press', 3), entrada('sentadilla', 3)] }, undefined, EJERCICIOS);
    expect(z.map(x => x.zona)).toEqual(['pectoral', 'cuadriceps', 'gluteo']);
  });
});

describe('«ahora no»', () => {
  it('calla la tarjeta unas horas y luego vuelve a salir', () => {
    expect(enPausaTrasAhoraNo(null, AHORA)).toBe(false);
    expect(enPausaTrasAhoraNo(hace(1), AHORA)).toBe(true);
    expect(enPausaTrasAhoraNo(hace(HORAS_DE_PAUSA_AHORA_NO), AHORA)).toBe(false);
    expect(enPausaTrasAhoraNo('basura', AHORA)).toBe(false);
    // Un reloj cambiado hacia atrás no la deja callada para siempre.
    expect(enPausaTrasAhoraNo(hace(-10), AHORA)).toBe(false);
  });
});

describe('respuestaDeAgujetas', () => {
  const pregunta = { zonas: [{ zona: 'cuadriceps' as const, series: 4 }, { zona: 'isquios' as const, series: 3 }] };

  it('solo hay respuesta con todas las zonas contestadas', () => {
    expect(respuestaDeAgujetas(pregunta, { cuadriceps: 2 }, AHORA)).toBeNull();
    expect(respuestaDeAgujetas(pregunta, { cuadriceps: 2, isquios: 4 }, AHORA)).toEqual({
      agujetas48h: { cuadriceps: 2, isquios: 4 }, agujetas48hAt: new Date(AHORA).toISOString(),
    });
  });

  it('no guarda notas fuera de la escala ni zonas por las que no se preguntó', () => {
    expect(respuestaDeAgujetas(pregunta, { cuadriceps: 0, isquios: 4 }, AHORA)).toBeNull();
    expect(respuestaDeAgujetas(pregunta, { cuadriceps: 6, isquios: 4 }, AHORA)).toBeNull();
    expect(respuestaDeAgujetas(pregunta, { cuadriceps: 2.5, isquios: 4 }, AHORA)).toBeNull();
    expect(respuestaDeAgujetas(pregunta, { cuadriceps: 2, isquios: 4, gluteo: 5 }, AHORA)?.agujetas48h).toEqual({ cuadriceps: 2, isquios: 4 });
    expect(respuestaDeAgujetas({ zonas: [] }, {}, AHORA)).toBeNull();
  });
});
