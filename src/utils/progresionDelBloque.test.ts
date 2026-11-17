import { describe, expect, it } from 'vitest';
import type { Exercise, MuscleGroup, WorkoutAssignment, WorkoutLog } from '../types';
import {
  buildProgresionDelBloque, notaDePocasSemanas, notaDeSemanasFuera, notaDeSesionesSinMarca, ventanasDeComparacion,
} from './progresionDelBloque';
import { rmDeSerie } from './oneRepMax';
import { addDays } from './trainingWeek';
import { RUIDO_RM_PCT } from './ruidoDeMedida';

const ex = (id: string, name: string, muscleGroup: MuscleGroup): Exercise => ({
  id, ownerId: 'coach', name, primaryFocus: '', muscleGroup, type: 'fuerza', isCustom: false,
});
const EJ = [
  ex('sent', 'Sentadilla', 'cuadriceps'),
  ex('press', 'Press banca', 'pecho'),
  ex('remo', 'Remo', 'dorsal'),
  ex('plancha', 'Dead bug', 'core'),
];

type S = { weight: number; repsDone: number; rir?: number; segmento?: boolean; rirApuntado?: boolean; alFallo?: boolean };
const log = (date: string, entries: Record<string, S[]>, extra: Partial<WorkoutLog> = {}): WorkoutLog => ({
  id: `l-${date}`, athleteId: 'a@b.c', workoutId: 'w', assignmentId: 'as', date, completedAt: `${date}T10:00:00.000Z`,
  entries: Object.entries(entries).map(([exerciseId, sets]) => ({ exerciseId, sets: sets.map(s => ({ rir: 2, ...s })) })),
  ...extra,
});

const base = { exercises: EJ, inicio: '2026-09-07', fin: '2026-10-04', semanas: 4 };

describe('buildProgresionDelBloque', () => {
  it('compara la mediana de las dos primeras semanas con la de las dos últimas (D2b)', () => {
    const p = buildProgresionDelBloque({
      ...base,
      logs: [
        log('2026-09-07', { sent: [{ weight: 100, repsDone: 6 }, { weight: 90, repsDone: 8 }] }),
        log('2026-09-14', { sent: [{ weight: 105, repsDone: 6 }] }),
        log('2026-09-21', { sent: [{ weight: 110, repsDone: 6 }] }),
        log('2026-09-28', { sent: [{ weight: 115, repsDone: 6 }] }),
      ],
    });
    const s = p.ejercicios.find(e => e.exerciseId === 'sent')!;
    // Dos marcas a cada lado: la mediana es su media, y la serie que se enseña,
    // la más baja de las dos centrales (a los dos lados igual).
    const rm = (kg: number) => rmDeSerie({ weight: kg, repsDone: 6, rir: 2 });
    expect(s.inicio).toMatchObject({ kg: 100, reps: 6, semana: 1 });
    expect(Math.abs(s.inicio!.e1rm - (rm(100) + rm(105)) / 2)).toBeLessThan(0.06); // redondeada a un decimal
    expect(s.final).toMatchObject({ kg: 110, reps: 6, semana: 3 });
    expect(Math.abs(s.final!.e1rm - (rm(110) + rm(115)) / 2)).toBeLessThan(0.06);
    expect(s.estado).toBe('mejora');
    expect(s.via).toBe('mas_carga');
    expect(s.lectura).toBe('100 kg × 6 → 110 kg × 6');
    expect(s.comoMejora).toBe('+10 kg con las mismas reps');
    // 112,5 contra 102,5: +9,8 %, no el +15 % de comparar los extremos.
    expect(s.deltaPct).toBeGreaterThan(9);
    expect(s.deltaPct).toBeLessThan(10.5);
    expect(s.pico).toMatchObject({ kg: 115, semana: 4 });
    expect(s.semanal.every(v => v != null)).toBe(true);
    expect(p.resumen).toMatchObject({ comparables: 1, mejoran: 1 });
  });

  it('una semana de descarga al final no tapa lo ganado', () => {
    const p = buildProgresionDelBloque({
      ...base,
      semanasDescarga: [4],
      logs: [
        log('2026-09-07', { press: [{ weight: 80, repsDone: 8 }] }),
        log('2026-09-21', { press: [{ weight: 90, repsDone: 8 }] }),
        log('2026-09-28', { press: [{ weight: 60, repsDone: 8 }] }),
      ],
    });
    const e = p.ejercicios[0];
    expect(e.final).toMatchObject({ kg: 90, semana: 3 });
    expect(e.estado).toBe('mejora');
    expect(p.semanas[3].esDescarga).toBe(true);
  });

  it('mismo peso con más repeticiones es mejora por reps', () => {
    const p = buildProgresionDelBloque({
      ...base,
      logs: [
        log('2026-09-07', { remo: [{ weight: 50, repsDone: 8 }] }),
        log('2026-09-28', { remo: [{ weight: 50, repsDone: 11 }] }),
      ],
    });
    expect(p.ejercicios[0]).toMatchObject({ via: 'mas_reps', comoMejora: '+3 reps con el mismo peso' });
  });

  it('marca como baja lo que cae y no compara lo que solo aparece una semana', () => {
    const p = buildProgresionDelBloque({
      ...base,
      logs: [
        log('2026-09-07', { press: [{ weight: 80, repsDone: 8 }], remo: [{ weight: 50, repsDone: 8 }] }),
        log('2026-09-28', { press: [{ weight: 70, repsDone: 8 }] }),
      ],
    });
    expect(p.ejercicios.find(e => e.exerciseId === 'press')!.estado).toBe('baja');
    const remo = p.ejercicios.find(e => e.exerciseId === 'remo')!;
    expect(remo.estado).toBe('sin_referencia');
    expect(remo.deltaPct).toBeNull();
    // Los que no se pueden comparar van al final de la lista.
    expect(p.ejercicios[p.ejercicios.length - 1].exerciseId).toBe('remo');
  });

  it('sin peso compara repeticiones', () => {
    const p = buildProgresionDelBloque({
      ...base,
      logs: [
        log('2026-09-07', { plancha: [{ weight: 0, repsDone: 15 }] }),
        log('2026-09-28', { plancha: [{ weight: 0, repsDone: 20 }] }),
      ],
    });
    expect(p.ejercicios[0]).toMatchObject({ metrica: 'reps', deltaPct: 33.3, lectura: '15 reps → 20 reps' });
  });

  it('resume las semanas: sesiones hechas y programadas, tonelaje, RIR e índice de fuerza', () => {
    const asig = (date: string): WorkoutAssignment => ({ id: date, workoutId: 'w', athleteId: 'a@b.c', date, status: 'completed' });
    const p = buildProgresionDelBloque({
      ...base,
      assignments: [asig('2026-09-07'), asig('2026-09-09'), asig('2026-09-14')],
      logs: [
        log('2026-09-07', { sent: [{ weight: 100, repsDone: 5, rir: 2 }] }, { duracionSeg: 3600 }),
        log('2026-09-14', { sent: [{ weight: 110, repsDone: 5, rir: 1 }] }),
      ],
    });
    expect(p.semanas).toHaveLength(4);
    expect(p.semanas[0]).toMatchObject({ semana: 1, inicio: '2026-09-07', sesionesHechas: 1, sesionesProgramadas: 2, tonelaje: 500, rirMedio: 2, indiceFuerza: 100, duracionMediaMin: 60 });
    expect(p.semanas[1].indiceFuerza).toBeGreaterThan(100);
    expect(p.resumen.rir).toEqual({ inicio: 2, final: 1 });
    expect(p.resumen.tonelajeSemanal).toMatchObject({ inicio: 500, final: 550 });
  });

  it('los segmentos (drop/myo) no cuentan como serie ni como mejor serie', () => {
    const p = buildProgresionDelBloque({
      ...base,
      logs: [
        log('2026-09-07', { press: [{ weight: 80, repsDone: 8 }, { weight: 100, repsDone: 4, segmento: true }] }),
        log('2026-09-28', { press: [{ weight: 82.5, repsDone: 8 }] }),
      ],
    });
    expect(p.ejercicios[0].series).toBe(2);
    expect(p.ejercicios[0].inicio?.kg).toBe(80);
  });

  it('agrega por patrón y por grupo con la media de sus ejercicios', () => {
    const p = buildProgresionDelBloque({
      ...base,
      logs: [
        log('2026-09-07', { press: [{ weight: 80, repsDone: 8 }], remo: [{ weight: 60, repsDone: 8 }] }),
        log('2026-09-28', { press: [{ weight: 88, repsDone: 8 }], remo: [{ weight: 60, repsDone: 8 }] }),
      ],
    });
    const empuje = p.porPatron.find(f => f.clave === 'empuje_torso')!;
    expect(empuje).toMatchObject({ ejercicios: 1, mejoran: 1, mejor: { nombre: 'Press banca' } });
    expect(p.porPatron[0].clave).toBe('empuje_torso'); // ordenado de más a menos
    expect(p.porGrupo.find(f => f.clave === 'dorsal')!.deltaMedioPct).toBe(0);
  });

  // ── F4: la semana en curso a medias no entra en los kg por semana ─────────
  describe('kg por semana con el bloque en curso (F4)', () => {
    const asig = (date: string): WorkoutAssignment => ({ id: date, workoutId: 'w', athleteId: 'a@b.c', date, status: 'pending' });
    const dosPorSemana = [asig('2026-09-07'), asig('2026-09-10'), asig('2026-09-14'), asig('2026-09-17'), asig('2026-09-21'), asig('2026-09-24')];
    const sesion = { sent: [{ weight: 100, repsDone: 5 }] }; // 500 kg

    it('con media semana hecha no dice «mueve menos kg»: compara solo semanas enteras', () => {
      const p = buildProgresionDelBloque({
        ...base, assignments: dosPorSemana, hoy: '2026-09-22', // martes de la semana 3
        logs: [log('2026-09-07', sesion), log('2026-09-10', sesion), log('2026-09-14', sesion), log('2026-09-17', sesion), log('2026-09-21', sesion)],
      });
      expect(p.semanas[2]).toMatchObject({ enCurso: true, incompleta: true, tonelaje: 500 });
      // Semana 1 (1.000 kg) → semana 2 (1.000 kg): igual, no −50 %.
      expect(p.resumen.tonelajeSemanal).toEqual({ inicio: 1000, final: 1000, deltaPct: 0 });
    });

    it('con solo una semana entera no hay comparación que dar', () => {
      const p = buildProgresionDelBloque({
        ...base, assignments: dosPorSemana, hoy: '2026-09-15',
        logs: [log('2026-09-07', sesion), log('2026-09-10', sesion), log('2026-09-14', sesion)],
      });
      expect(p.resumen.tonelajeSemanal).toBeNull();
    });

    it('la semana en curso sí cuenta cuando ya se ha hecho todo lo programado', () => {
      const p = buildProgresionDelBloque({
        ...base, assignments: dosPorSemana.slice(0, 4), hoy: '2026-09-18', // viernes de la semana 2, las dos hechas
        logs: [log('2026-09-07', sesion), log('2026-09-10', sesion), log('2026-09-14', sesion), log('2026-09-17', { sent: [{ weight: 110, repsDone: 5 }] })],
      });
      expect(p.semanas[1]).toMatchObject({ enCurso: true, incompleta: false });
      expect(p.resumen.tonelajeSemanal).toMatchObject({ inicio: 1000, final: 1050 });
    });

    it('con el bloque terminado la última semana no queda «en curso»', () => {
      const p = buildProgresionDelBloque({
        ...base, hoy: '2026-10-05',
        logs: [log('2026-09-07', sesion), log('2026-09-28', sesion)],
      });
      expect(p.semanas.every(s => !s.enCurso && !s.incompleta)).toBe(true);
      expect(p.resumen.tonelajeSemanal).toMatchObject({ inicio: 500, final: 500 });
    });
  });

  // ── F21: una serie sin RIR no es una serie al fallo ───────────────────────
  describe('RIR medio (F21)', () => {
    it('las series sin RIR apuntado no entran en la media', () => {
      const p = buildProgresionDelBloque({
        ...base,
        logs: [
          log('2026-09-07', { sent: [{ weight: 100, repsDone: 5, rir: 3 }, { weight: 100, repsDone: 5, rir: undefined }] }),
          log('2026-09-14', { sent: [{ weight: 100, repsDone: 5, rir: 2 }, { weight: 100, repsDone: 5, rir: '' as unknown as number }] }),
        ],
      });
      expect(p.semanas[0].rirMedio).toBe(3); // antes: (3 + 0) / 2 = 1,5
      expect(p.semanas[1].rirMedio).toBe(2);
      expect(p.resumen.rir).toEqual({ inicio: 3, final: 2 });
    });

    it('un bloque registrado sin RIR no «acaba al fallo»: no hay RIR medio', () => {
      const p = buildProgresionDelBloque({
        ...base,
        logs: [
          log('2026-09-07', { sent: [{ weight: 100, repsDone: 5, rir: undefined }] }),
          log('2026-09-28', { sent: [{ weight: 105, repsDone: 5, rir: undefined }] }),
        ],
      });
      expect(p.semanas.every(s => s.rirMedio === null)).toBe(true);
      expect(p.resumen.rir).toBeNull();
      expect(p.ejercicios[0].inicio!.rir).toBeNull();
    });

    it('un RIR 0 apuntado y una serie al fallo sí cuentan como 0', () => {
      const p = buildProgresionDelBloque({
        ...base,
        logs: [{
          ...log('2026-09-07', {}),
          entries: [{ exerciseId: 'sent', sets: [{ weight: 100, repsDone: 5, rir: 0 }, { weight: 100, repsDone: 5, rir: 4, alFallo: true }, { weight: 100, repsDone: 5, rir: 2 }] }],
        }],
      });
      expect(p.semanas[0].rirMedio).toBe(0.7); // (0 + 0 + 2) / 3
    });
  });

  // ── F10: por debajo del ruido de medida no hay mejora ni caída ────────────
  it('un cambio de RM estimado menor que el ruido (3 %) es «estable» (F10)', () => {
    const p = buildProgresionDelBloque({
      ...base,
      logs: [
        log('2026-09-07', { press: [{ weight: 100, repsDone: 8 }], remo: [{ weight: 100, repsDone: 8 }], sent: [{ weight: 100, repsDone: 8 }] }),
        log('2026-09-28', { press: [{ weight: 102.5, repsDone: 8 }], remo: [{ weight: 97.5, repsDone: 8 }], sent: [{ weight: 103, repsDone: 8 }] }),
      ],
    });
    const de = (id: string) => p.ejercicios.find(e => e.exerciseId === id)!;
    expect(de('press')).toMatchObject({ deltaPct: 2.5, estado: 'estable', via: 'ninguna' });
    expect(de('remo')).toMatchObject({ deltaPct: -2.5, estado: 'estable' });
    expect(de('sent')).toMatchObject({ deltaPct: 3, estado: 'mejora' });
    expect(p.resumen).toMatchObject({ comparables: 3, mejoran: 1, estables: 2, bajan: 0 });
  });
  // ── D2: la marca de una sesión es su mejor serie VÁLIDA ───────────────────
  describe('marca de sesión con series válidas (D2)', () => {
    it('una serie a 20 repeticiones o a RIR 4 no es la marca, aunque dé más RM', () => {
      const p = buildProgresionDelBloque({
        ...base,
        logs: [
          log('2026-09-07', { press: [{ weight: 80, repsDone: 8 }] }),
          // Semana 4: la misma serie de siempre y, además, una de 20 a RIR 4.
          log('2026-09-28', { press: [{ weight: 80, repsDone: 8 }, { weight: 70, repsDone: 20, rir: 4 }] }),
        ],
      });
      expect(p.ejercicios[0]).toMatchObject({ estado: 'estable', deltaPct: 0, lectura: '80 kg × 8 → 80 kg × 8' });
    });

    it('una sesión sin series válidas no tiene marca: no es un 0 ni una caída', () => {
      const p = buildProgresionDelBloque({
        ...base,
        logs: [
          log('2026-09-07', { press: [{ weight: 80, repsDone: 8 }] }),
          log('2026-09-14', { press: [{ weight: 80, repsDone: 8, rir: 4 }, { weight: 80, repsDone: 8, rir: 3 }] }), // lejos del fallo
          log('2026-09-21', { press: [{ weight: 82.5, repsDone: 8 }] }),
        ],
      });
      const e = p.ejercicios[0];
      expect(e.semanal).toEqual([rmDeSerie({ weight: 80, repsDone: 8, rir: 2 }), null, rmDeSerie({ weight: 82.5, repsDone: 8, rir: 2 }), null]);
      expect(e).toMatchObject({ sesionesSinMarca: 1, semanasConMarca: 2, lectura: '80 kg × 8 → 82,5 kg × 8' });
      expect(p.resumen.sinMarca).toEqual({ registros: 3, sinMarca: 1, porMotivo: { rir_lejos: 1 }, motivoPrincipal: 'rir_lejos' });
    });

    it('cuenta las sesiones sin marca y su motivo más frecuente, para que el coach sepa con qué dato decide (D4c)', () => {
      const p = buildProgresionDelBloque({
        ...base,
        logs: [
          log('2026-09-07', { press: [{ weight: 80, repsDone: 8 }], remo: [{ weight: 40, repsDone: 15 }], sent: [{ weight: 100, repsDone: 8, rirApuntado: false }] }),
          log('2026-09-14', { press: [{ weight: 80, repsDone: 8 }], remo: [{ weight: 40, repsDone: 16 }], sent: [{ weight: 100, repsDone: 8, rir: 4 }] }),
          log('2026-09-21', { press: [{ weight: 80, repsDone: 8 }], remo: [{ weight: 40, repsDone: 15 }], plancha: [{ weight: 0, repsDone: 20 }] }),
        ],
      });
      // 8 registros con peso (el dead bug, sin peso, no entra): 3 con marca y 5 sin ella.
      expect(p.resumen.sinMarca).toEqual({
        registros: 8, sinMarca: 5, porMotivo: { reps_altas: 3, rir_sin_apuntar: 1, rir_lejos: 1 }, motivoPrincipal: 'reps_altas',
      });
      expect(notaDeSesionesSinMarca(p.resumen.sinMarca)).toBe(
        'Sin marca de fuerza en 5 de las 8 veces que hizo un ejercicio con peso: ninguna serie válida para estimar el RM '
        + '(de 3 a 12 repeticiones y RIR 2 o menos, apuntado; lo más frecuente, más de 12 repeticiones).',
      );
      // Con peso y sin ninguna serie válida no pasa a compararse por repeticiones: se queda sin marca, y dice por qué.
      const remo = p.ejercicios.find(e => e.exerciseId === 'remo')!;
      expect(remo).toMatchObject({ metrica: 'e1rm', estado: 'sin_referencia', sinComparar: 'sin_marca', deltaPct: null, sesionesSinMarca: 3 });
      expect(remo.lectura).toBe('Sin marca: ninguna serie válida (más de 12 repeticiones)');
      expect(p.resumen.comparables).toBe(1);
    });

    it('con todas las sesiones con marca no hay nota', () => {
      const p = buildProgresionDelBloque({ ...base, logs: [log('2026-09-07', { press: [{ weight: 80, repsDone: 8 }] })] });
      expect(notaDeSesionesSinMarca(p.resumen.sinMarca)).toBeNull();
    });
  });

  // ── D2b: mediana contra mediana, no dato único contra máximo ──────────────
  describe('ventanas de comparación (D2b)', () => {
    it('dos primeras semanas contra dos últimas; con menos de cuatro, mitad contra mitad; con menos de dos, nada', () => {
      expect(ventanasDeComparacion([1, 2, 4, 5, 7, 8])).toEqual({ inicio: [1, 2], final: [7, 8] });
      expect(ventanasDeComparacion([1, 2, 3, 4])).toEqual({ inicio: [1, 2], final: [3, 4] });
      expect(ventanasDeComparacion([2, 3, 5])).toEqual({ inicio: [2], final: [5] }); // la de en medio no entra
      expect(ventanasDeComparacion([1, 4])).toEqual({ inicio: [1], final: [4] });
      expect(ventanasDeComparacion([3])).toBeNull();
      expect(ventanasDeComparacion([])).toBeNull();
    });

    it('un día muy bueno al final no hace «mejora» si el resto de la ventana es como al empezar', () => {
      const normal = { press: [{ weight: 80, repsDone: 8 }] };
      const p = buildProgresionDelBloque({
        ...base,
        logs: [
          log('2026-09-07', normal), log('2026-09-10', normal), log('2026-09-14', normal), log('2026-09-17', normal),
          log('2026-09-21', normal), log('2026-09-24', normal), log('2026-09-28', normal),
          log('2026-10-01', { press: [{ weight: 80, repsDone: 11 }] }), // el día bueno
        ],
      });
      const e = p.ejercicios[0];
      // Antes: mejor de la semana 1 (80 × 8) contra el máximo de las dos últimas (80 × 11) = +8 %.
      expect(e).toMatchObject({ estado: 'estable', deltaPct: 0, via: 'ninguna' });
      expect(e.pico).toMatchObject({ reps: 11, semana: 4 }); // la marca del bloque sí lo recoge
    });

    it('la mejora se cuenta con las series representativas de cada ventana', () => {
      const p = buildProgresionDelBloque({
        ...base,
        logs: [
          log('2026-09-07', { press: [{ weight: 80, repsDone: 8 }] }), log('2026-09-14', { press: [{ weight: 80, repsDone: 8 }] }),
          log('2026-09-21', { press: [{ weight: 80, repsDone: 10 }] }), log('2026-09-28', { press: [{ weight: 80, repsDone: 10 }] }),
        ],
      });
      expect(p.ejercicios[0]).toMatchObject({ estado: 'mejora', via: 'mas_reps', lectura: '80 kg × 8 → 80 kg × 10', comoMejora: '+2 reps con el mismo peso' });
    });
  });

  // ── D3: semanas que no son comparables ────────────────────────────────────
  describe('semanas no comparables (D3)', () => {
    const ocho = { exercises: EJ, inicio: '2026-09-07', fin: '2026-11-01', semanas: 8 };
    // Una sesión por semana; `kg(semana)` da el peso de esa semana (1-indexada).
    const bloque = (kg: (semana: number) => number, rir: (semana: number) => number = () => 2) =>
      Array.from({ length: 8 }, (_, i) => log(addDays('2026-09-07', i * 7), { press: [{ weight: kg(i + 1), repsDone: 8, rir: rir(i + 1) }] }));

    it('una descarga en la semana 1 no infla el resultado', () => {
      // Fuerza constante (100 kg), y la semana 1 de descarga a 80 kg.
      const logs = bloque(s => (s === 1 ? 80 : 100));
      // Antes: 80 × 8 (la primera semana con datos) contra 100 × 8 = +25 %.
      const sinMarcar = buildProgresionDelBloque({ ...ocho, logs });
      const p = buildProgresionDelBloque({ ...ocho, logs, semanasDescarga: [1] });
      expect(p.semanas[0]).toMatchObject({ comparable: false, motivoNoComparable: 'descarga' });
      expect(p.ejercicios[0]).toMatchObject({ estado: 'estable', deltaPct: 0, lectura: '100 kg × 8 → 100 kg × 8' });
      expect(p.ejercicios[0].inicio!.semana).toBe(2);
      expect(p.resumen).toMatchObject({ medianaPct: 0, mejoran: 0, semanasComparables: 7 });
      // Y aun sin marcarla, la mediana de dos semanas ya amortigua: +12,5 % en vez de +25 %.
      expect(sinMarcar.ejercicios[0].deltaPct).toBeLessThan(13);
    });

    it('la semana 1 de la vuelta de un parón tampoco: ni por el RIR ni por el peso', () => {
      // A RIR 2 pero con menos peso: sus series son válidas, y aun así no es la referencia.
      const p = buildProgresionDelBloque({ ...ocho, logs: bloque(s => (s === 1 ? 75 : 100)), semanasVueltaDeParon: [1] });
      expect(p.semanas[0].motivoNoComparable).toBe('vuelta_de_paron');
      expect(p.resumen.medianaPct).toBe(0);
      // A RIR 4, como manda la guía: esa semana ni siquiera da marca.
      const aRir4 = buildProgresionDelBloque({ ...ocho, logs: bloque(() => 100, s => (s === 1 ? 4 : 2)), semanasVueltaDeParon: [1] });
      expect(aRir4.ejercicios[0]).toMatchObject({ deltaPct: 0, sesionesSinMarca: 1, semanasConMarca: 7 });
    });

    it('puente y test quedan fuera de las dos ventanas', () => {
      // Semana 2 puente (la mitad de peso) y semana 8 de test (AMRAP: una marca que no es del día a día).
      const logs = bloque(s => (s === 2 ? 60 : s === 8 ? 115 : 100));
      const p = buildProgresionDelBloque({ ...ocho, logs, semanasPuente: [2], semanasTest: [8] });
      expect(p.semanas.filter(s => !s.comparable).map(s => [s.semana, s.motivoNoComparable])).toEqual([[2, 'puente'], [8, 'test']]);
      const e = p.ejercicios[0];
      expect(e).toMatchObject({ deltaPct: 0, estado: 'estable', semanasConMarca: 6, semanasConDatos: 8 });
      expect([e.inicio!.semana, e.final!.semana]).toEqual([1, 6]); // ventanas: 1 y 3 contra 6 y 7
      expect(notaDeSemanasFuera(p.semanas)).toBe('No entran en la comparación de fuerza: S2 (puente), S8 (test).');
      expect(notaDeSemanasFuera(buildProgresionDelBloque({ ...ocho, logs }).semanas)).toBeNull();
    });

    it('la semana en curso a medias no es el «final»', () => {
      const asig = (date: string): WorkoutAssignment => ({ id: date, workoutId: 'w', athleteId: 'a@b.c', date, status: 'pending' });
      const p = buildProgresionDelBloque({
        ...base, hoy: '2026-09-29', // martes de la semana 4
        assignments: [asig('2026-09-28'), asig('2026-10-01')],
        logs: [
          log('2026-09-07', { press: [{ weight: 80, repsDone: 8 }] }),
          log('2026-09-14', { press: [{ weight: 80, repsDone: 8 }] }),
          log('2026-09-21', { press: [{ weight: 80, repsDone: 8 }] }),
          log('2026-09-28', { press: [{ weight: 70, repsDone: 8 }] }), // un mal lunes, con la semana por terminar
        ],
      });
      expect(p.semanas[3]).toMatchObject({ incompleta: true, comparable: false, motivoNoComparable: 'incompleta' });
      expect(p.ejercicios[0]).toMatchObject({ deltaPct: 0, estado: 'estable' });
      expect(p.ejercicios[0].final!.semana).toBe(3);
    });

    it('descargas, tests y la vuelta de un parón tampoco cuentan para los kg por semana ni para el RIR medio', () => {
      const logs = bloque(s => (s === 1 ? 50 : 100), s => (s === 1 ? 4 : s === 8 ? 0 : 2));
      const p = buildProgresionDelBloque({ ...ocho, logs, semanasVueltaDeParon: [1], semanasTest: [8] });
      expect(p.resumen.tonelajeSemanal).toEqual({ inicio: 800, final: 800, deltaPct: 0 }); // no 400 → 800
      expect(p.resumen.rir).toEqual({ inicio: 2, final: 2 }); // no 4 → 0
    });
  });

  // ── D4: solo cuentan los ejercicios con marca en más de la mitad de las semanas ──
  describe('pocas semanas para comparar (D4)', () => {
    const seis = { exercises: EJ, inicio: '2026-09-07', fin: '2026-10-18', semanas: 6 };
    const semana = (i: number) => addDays('2026-09-07', i * 7);

    it('con marca en la mitad o menos de las semanas comparables, no cuenta ni a favor ni en contra', () => {
      const logs = Array.from({ length: 6 }, (_, i) => log(semana(i), {
        press: [{ weight: 80 + i, repsDone: 8 }],
        // El remo solo se hace las semanas 1, 5 y 6 (3 de 6), y «sube» un 20 %.
        ...(i === 0 || i >= 4 ? { remo: [{ weight: i === 0 ? 50 : 60, repsDone: 8 }] } : {}),
        // El curl, dos semanas.
        ...(i < 2 ? { sent: [{ weight: 100, repsDone: 8 }] } : {}),
      }));
      const p = buildProgresionDelBloque({ ...seis, logs });
      const remo = p.ejercicios.find(e => e.exerciseId === 'remo')!;
      expect(remo).toMatchObject({ estado: 'sin_referencia', sinComparar: 'pocas_semanas', deltaPct: null, semanasConMarca: 3, inicio: null, final: null });
      expect(remo.lectura).toBe('Pocas semanas para comparar: con marca en 3 de 6');
      expect(p.resumen).toMatchObject({ comparables: 1, semanasComparables: 6 });
      expect(p.resumen.pocasSemanas).toEqual([
        { exerciseId: 'remo', nombre: 'Remo', semanasConMarca: 3 },
        { exerciseId: 'sent', nombre: 'Sentadilla', semanasConMarca: 2 },
      ]);
      // Ni en la mediana del bloque ni en los agregados: el dorsal no sale «+20 %».
      expect(p.porGrupo.map(g => g.clave)).toEqual(['pecho']);
      expect(p.porGrupo[0]).toMatchObject({ ejercicios: 1 });
      expect(p.porPatron.every(f => f.mejor?.nombre !== 'Remo')).toBe(true);
      expect(notaDePocasSemanas(p.resumen)).toBe(
        'Pocas semanas para comparar, no cuentan a favor ni en contra (hace falta marca en más de la mitad de las 6 comparables): Remo (3 sem.), Sentadilla (2 sem.).',
      );
    });

    it('con una más (4 de 6) ya cuenta', () => {
      const logs = Array.from({ length: 6 }, (_, i) => log(semana(i), {
        press: [{ weight: 80, repsDone: 8 }],
        ...(i < 2 || i >= 4 ? { remo: [{ weight: i < 2 ? 50 : 60, repsDone: 8 }] } : {}),
      }));
      const p = buildProgresionDelBloque({ ...seis, logs });
      expect(p.ejercicios.find(e => e.exerciseId === 'remo')).toMatchObject({ estado: 'mejora', deltaPct: 20, sinComparar: null });
      expect(p.resumen.pocasSemanas).toEqual([]);
      expect(notaDePocasSemanas(p.resumen)).toBeNull();
    });

    it('una semana sin ninguna sesión no deja a todos los ejercicios sin contar', () => {
      // Entrena las semanas 1, 2, 5 y 6 (dos de viaje): 4 comparables con sesiones, y el press tiene marca en las 4.
      const logs = [0, 1, 4, 5].map(i => log(semana(i), { press: [{ weight: 80 + i, repsDone: 8 }] }));
      const p = buildProgresionDelBloque({ ...seis, logs });
      expect(p.resumen).toMatchObject({ semanasComparables: 4, comparables: 1 });
    });
  });

  // ── El sesgo que motivó el cambio ─────────────────────────────────────────
  describe('fuerza constante con ruido de ±1 repetición (el sesgo del cierre)', () => {
    // Generador con semilla (mulberry32): la prueba es determinista.
    const azar = (semilla: number) => {
      let a = semilla >>> 0;
      return () => {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    };
    const OCHO_EJ = Array.from({ length: 8 }, (_, i) => ex(`e${i}`, `Ejercicio ${i + 1}`, i % 2 ? 'pecho' : 'dorsal'));
    const ocho = { exercises: OCHO_EJ, inicio: '2026-09-07', fin: '2026-11-01', semanas: 8 };
    // 8 semanas, una sesión por semana y una serie por ejercicio: siempre el
    // mismo peso a RIR 1, y 7, 8 o 9 repeticiones al azar. Nadie mejora.
    const bloque = (semilla: number, kgSemana1 = 1) => {
      const r = azar(semilla);
      return Array.from({ length: 8 }, (_, w) => log(addDays('2026-09-07', w * 7), Object.fromEntries(
        OCHO_EJ.map((e, i) => [e.id, [{ weight: (40 + i * 10) * (w === 0 ? kgSemana1 : 1), repsDone: 8 + Math.floor(r() * 3) - 1, rir: 1 }]]),
      )));
    };
    // El método anterior, tal cual era: la mejor serie de la primera semana
    // contra la mejor de las dos últimas.
    const medianaAntigua = (logs: WorkoutLog[]) => {
      const deltas = OCHO_EJ.map(e => {
        const rm = (l: WorkoutLog) => Math.max(...l.entries.find(en => en.exerciseId === e.id)!.sets.map(rmDeSerie));
        return ((Math.max(rm(logs[6]), rm(logs[7])) - rm(logs[0])) / rm(logs[0])) * 100;
      }).sort((a, b) => a - b);
      return (deltas[3] + deltas[4]) / 2;
    };
    const SEMILLAS = Array.from({ length: 40 }, (_, i) => i + 1);
    const media = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

    it('la mediana queda por debajo del ruido en todos los bloques, y casi nadie «mejora»', () => {
      const bloques = SEMILLAS.map(s => buildProgresionDelBloque({ ...ocho, logs: bloque(s) }).resumen);
      for (const res of bloques) {
        expect(res.comparables).toBe(8);
        expect(Math.abs(res.medianaPct!)).toBeLessThan(RUIDO_RM_PCT);
        expect(res.mejoran * 2).toBeLessThan(res.comparables); // nunca «mejora la mayoría»
      }
      // Sin sesgo: de media no sube ni baja, y «mejoran» tantos como «bajan».
      expect(Math.abs(media(bloques.map(r => r.medianaPct!)))).toBeLessThan(0.3);
      const mejoran = media(bloques.map(r => r.mejoran / r.comparables));
      const bajan = media(bloques.map(r => r.bajan / r.comparables));
      expect(mejoran).toBeLessThan(0.12);
      expect(Math.abs(mejoran - bajan)).toBeLessThan(0.05);
    });

    it('el método anterior, con los mismos datos, sí se inventaba una subida', () => {
      const antiguo = media(SEMILLAS.map(s => medianaAntigua(bloque(s))));
      const nuevo = media(SEMILLAS.map(s => buildProgresionDelBloque({ ...ocho, logs: bloque(s) }).resumen.medianaPct!));
      expect(antiguo).toBeGreaterThan(0.7); // dato único contra máximo de dos
      expect(Math.abs(nuevo)).toBeLessThan(antiguo / 3);
    });

    it('con la semana 1 de descarga (o de vuelta de un parón) el resultado no se infla', () => {
      for (const semilla of SEMILLAS.slice(0, 15)) {
        const logs = bloque(semilla, 0.8); // semana 1 con el 80 % del peso
        expect(medianaAntigua(logs)).toBeGreaterThan(20); // antes: «+25 % de fuerza»
        for (const marca of [{ semanasDescarga: [1] }, { semanasVueltaDeParon: [1] }]) {
          const res = buildProgresionDelBloque({ ...ocho, logs, ...marca }).resumen;
          expect(Math.abs(res.medianaPct!)).toBeLessThan(RUIDO_RM_PCT);
          expect(res.mejoran * 2).toBeLessThan(res.comparables);
        }
      }
    });
  });
});

describe('fuera de su gimnasio (17-11-2026)', () => {
  it('las series fuera cuentan como series pero no suman tonelaje, y su motivo sin marca es «fuera»', () => {
    const p = buildProgresionDelBloque({
      ...base,
      logs: [
        log('2026-09-07', { press: [{ weight: 80, repsDone: 8 }] }),
        log('2026-09-14', { press: [{ weight: 30, repsDone: 10, fuera: true } as S] }, { fuera: true }),
      ],
    });
    expect(p.semanas[0].tonelaje).toBe(640);
    expect(p.semanas[1].tonelaje).toBe(0);
    expect(p.semanas[1].series).toBe(1);
    expect(p.resumen.sinMarca).toMatchObject({ registros: 2, sinMarca: 1, porMotivo: { fuera: 1 }, motivoPrincipal: 'fuera' });
    expect(notaDeSesionesSinMarca(p.resumen.sinMarca)).toContain('fuera de su gimnasio');
  });
});
