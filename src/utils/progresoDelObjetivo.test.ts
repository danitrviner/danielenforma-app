import { describe, it, expect } from 'vitest';
import type { Exercise, Mesocycle, Workout, WorkoutLog, WorkoutSetLog } from '../types';
import { addDays } from './trainingWeek';
import { empujonDelObjetivo, mesoDelObjetivo, progresoDelObjetivo, zonasQueSuben } from './progresoDelObjetivo';

/* El objetivo del bloque con cuánto falta (A1). Bloque de 12 semanas que
   empezó un lunes; tres días por semana (lunes, miércoles y viernes). */

const INICIO = '2026-09-07';
const EMAIL = 'ana@x.com';

const EJERCICIOS = [
  { id: 'press', name: 'Press inclinado', muscleGroup: 'pecho' },
  { id: 'aperturas', name: 'Aperturas en polea', muscleGroup: 'pecho' },
  { id: 'laterales', name: 'Elevaciones laterales', muscleGroup: 'deltoide_lat' },
  { id: 'sentadilla', name: 'Sentadilla', muscleGroup: 'cuadriceps' },
] as unknown as Exercise[];

const meso = (extra: Partial<Mesocycle> = {}): Mesocycle => ({
  id: 'm1', athleteId: EMAIL, number: 1, name: 'Bloque 1', startDate: INICIO, weeks: 12, daysPerWeek: 3,
  tipoBloque: 'desarrollo', hipotesis: { pectoral: { palanca: 'volumen', rmObjetivoPct: 5 } },
  ...extra,
} as unknown as Mesocycle);

const serie = (weight: number, repsDone: number, rir = 1, extra: Partial<WorkoutSetLog> = {}): WorkoutSetLog =>
  ({ weight, repsDone, rir, rirApuntado: true, ...extra });

/** Una sesión el lunes de la semana `semana` (1 = la primera). */
const log = (semana: number, entradas: Record<string, WorkoutSetLog[]>, dia = 0): WorkoutLog => {
  const date = addDays(INICIO, (semana - 1) * 7 + dia);
  return {
    id: `l_${date}`, athleteId: EMAIL, workoutId: 'w1', mesocycleId: 'm1', date, completedAt: `${date}T19:00:00.000Z`,
    entries: Object.entries(entradas).map(([exerciseId, sets]) => ({ exerciseId, sets })),
  } as unknown as WorkoutLog;
};

/** Hoy = el lunes de la semana `n`: las semanas anteriores están cerradas. */
const lunesDe = (n: number) => addDays(INICIO, (n - 1) * 7);

/** `semanas` semanas seguidas de press, con el peso que diga `kgDe(semana)`. */
const pressPorSemana = (semanas: number, kgDe: (s: number) => number, id = 'press') =>
  Array.from({ length: semanas }, (_, i) => log(i + 1, { [id]: [serie(kgDe(i + 1), 8), serie(kgDe(i + 1), 8)] }));

describe('progresoDelObjetivo', () => {
  it('sin hipótesis en el bloque no hay nada que enseñar', () => {
    expect(progresoDelObjetivo({ meso: meso({ hipotesis: undefined }), logs: [], exercises: EJERCICIOS, hoy: lunesDe(3) })).toBeNull();
    expect(progresoDelObjetivo({ meso: meso({ hipotesis: {} }), logs: [], exercises: EJERCICIOS, hoy: lunesDe(3) })).toBeNull();
    expect(progresoDelObjetivo({ meso: null, logs: [], exercises: EJERCICIOS, hoy: lunesDe(3) })).toBeNull();
  });

  it('trae la frase del objetivo y la semana del bloque, la misma cuenta que Rutinas', () => {
    const p = progresoDelObjetivo({ meso: meso(), logs: [], exercises: EJERCICIOS, hoy: lunesDe(3) })!;
    expect(p.frase).toBe('Este bloque va de pecho. Lo daremos por bueno si en 12 semanas mueves un 5 % más en tus ejercicios de pecho.');
    expect(p.semana).toBe(3);
    expect(p.semanas).toBe(12);
    expect(p.semanaTexto).toBe('Semana 3 de 12');
  });

  it('con un ciclo de 14 días la semana es la vuelta del ciclo, no días/7', () => {
    const p = progresoDelObjetivo({ meso: meso({ daysPerWeek: 10, cycleDays: 14 }), logs: [], exercises: EJERCICIOS, hoy: addDays(INICIO, 21) })!;
    expect(p.semanaTexto).toBe('Semana 2 de 6');
  });

  it('mientras no haya dos semanas con marca, todavía es pronto', () => {
    const p = progresoDelObjetivo({ meso: meso(), logs: pressPorSemana(1, () => 60), exercises: EJERCICIOS, hoy: lunesDe(2) })!;
    expect(p.estado).toBe('pronto');
    expect(p.fraccion).toBe(0);
    expect(p.mejoraPct).toBeNull();
    expect(p.titular).toBe('Todavía es pronto para medirlo');
  });

  it('la semana en curso a medias no cuenta: con una cerrada y otra empezada sigue siendo pronto', () => {
    const logs = [...pressPorSemana(1, () => 60), log(2, { press: [serie(70, 8)] })];
    const p = progresoDelObjetivo({ meso: meso(), logs, exercises: EJERCICIOS, hoy: lunesDe(2) })!;
    expect(p.estado).toBe('pronto');
  });

  it('por debajo del ruido (3 %) no se dice que ha mejorado y la barra no se mueve', () => {
    // 60 → 61 kg con las mismas repeticiones: +1,7 % de RM estimado.
    const p = progresoDelObjetivo({ meso: meso(), logs: pressPorSemana(4, s => (s <= 2 ? 60 : 61)), exercises: EJERCICIOS, hoy: lunesDe(5) })!;
    expect(p.estado).toBe('igual');
    expect(p.fraccion).toBe(0);
    expect(p.titular).toBe('De momento mueves lo mismo que al empezar');
    expect(`${p.titular} ${p.detalle}`).not.toMatch(/mejora|llevas/i);
  });

  it('mejora por encima del ruido y por debajo del objetivo: dice cuánto lleva de cuánto', () => {
    // 60 → 62,5 kg: +4,2 %.
    const p = progresoDelObjetivo({ meso: meso(), logs: pressPorSemana(4, s => (s <= 2 ? 60 : 62.5)), exercises: EJERCICIOS, hoy: lunesDe(5) })!;
    expect(p.estado).toBe('mejora');
    expect(p.mejoraPct).toBe(4.2);
    expect(p.objetivoPct).toBe(5);
    expect(p.titular).toBe('Llevas un 4,2 % de 5 %');
    expect(p.fraccion).toBeCloseTo(0.84, 2);
  });

  it('al llegar al objetivo la barra se llena, pero no promete el bloque: hay que sostenerlo', () => {
    const p = progresoDelObjetivo({ meso: meso(), logs: pressPorSemana(4, s => (s <= 2 ? 60 : 65)), exercises: EJERCICIOS, hoy: lunesDe(5) })!;
    expect(p.estado).toBe('conseguido');
    expect(p.fraccion).toBe(1);
    expect(p.titular).toBe('Vas por encima del objetivo: +8,3 %');
    expect(p.detalle).toMatch(/sostenerlo hasta el final/);
  });

  it('si mueve menos que al empezar lo dice sin dramatizar y sin barra', () => {
    const p = progresoDelObjetivo({ meso: meso(), logs: pressPorSemana(4, s => (s <= 2 ? 60 : 55)), exercises: EJERCICIOS, hoy: lunesDe(5) })!;
    expect(p.estado).toBe('baja');
    expect(p.fraccion).toBe(0);
  });

  it('solo cuentan los ejercicios de las zonas con estrella: la sentadilla no mueve el objetivo de pecho', () => {
    const logs = pressPorSemana(4, s => (s <= 2 ? 100 : 120), 'sentadilla');
    const p = progresoDelObjetivo({ meso: meso(), logs, exercises: EJERCICIOS, hoy: lunesDe(5) })!;
    expect(p.estado).toBe('pronto');
    expect(p.zonas[0].ejercicios).toBe(0);
  });

  it('con dos zonas va por zona: una mejora y la otra aún no se puede medir', () => {
    const m = meso({ hipotesis: { pectoral: { palanca: 'volumen' }, deltoides: { palanca: 'intensidad', rmObjetivoPct: 4 } } });
    const p = progresoDelObjetivo({ meso: m, logs: pressPorSemana(4, s => (s <= 2 ? 60 : 62.5)), exercises: EJERCICIOS, hoy: lunesDe(5) })!;
    expect(p.zonas.map(z => [z.nombre, z.estado, z.objetivoPct])).toEqual([['pecho', 'mejora', 5], ['hombro', 'pronto', 4]]);
    expect(p.estado).toBe('mejora');
    expect(p.mejoraPct).toBeNull();
    expect(p.fraccion).toBeCloseTo(0.42, 2);
    expect(p.titular).toBe('Pecho +4,2 % · Hombro: todavía es pronto');
    expect(p.detalle).toBe('Vas bien. Falta que arranque hombro.');
  });

  it('si las series del grupo no dan marca (15 repeticiones), no dice «todavía es pronto» semana tras semana', () => {
    const m = meso({ hipotesis: { deltoides: { palanca: 'volumen' } } });
    const logs = Array.from({ length: 4 }, (_, i) => log(i + 1, { laterales: [serie(10, 15), serie(10, 15)] }));
    const p = progresoDelObjetivo({ meso: m, logs, exercises: EJERCICIOS, hoy: lunesDe(5) })!;
    expect(p.zonas[0]).toMatchObject({ estado: 'pronto', sinMarcas: true, fraccion: 0, texto: 'Hombro: aún no se puede medir' });
    expect(p.titular).toBe('Aún no se puede medir');
    // Con dos sesiones todavía es pronto de verdad.
    const pronto = progresoDelObjetivo({ meso: m, logs: logs.slice(0, 2), exercises: EJERCICIOS, hoy: lunesDe(3) })!;
    expect(pronto.zonas[0].sinMarcas).toBe(false);
    expect(pronto.titular).toBe('Todavía es pronto para medirlo');
  });

  it('una zona que se recupera no es «de qué va» el bloque ni se mide', () => {
    const m = meso({ hipotesis: { pectoral: { palanca: 'volumen' }, deltoides: { palanca: 'recuperar' } } });
    expect(zonasQueSuben(m)).toEqual(['pectoral']);
    const p = progresoDelObjetivo({ meso: m, logs: [], exercises: EJERCICIOS, hoy: lunesDe(2) })!;
    expect(p.zonas.map(z => z.zona)).toEqual(['pectoral']);
  });

  it('las semanas de descarga no entran en la comparación', () => {
    // Semana 4 de descarga con menos peso: sin excluirla, parecería una caída.
    const logs = pressPorSemana(4, s => (s === 4 ? 40 : s <= 2 ? 60 : 62.5));
    const p = progresoDelObjetivo({ meso: meso({ semanasDescarga: [4] }), logs, exercises: EJERCICIOS, hoy: lunesDe(5) })!;
    expect(p.estado).not.toBe('baja');
  });

  it('el texto del atleta no lleva tecnicismos', () => {
    const p = progresoDelObjetivo({ meso: meso(), logs: pressPorSemana(4, s => (s <= 2 ? 60 : 62.5)), exercises: EJERCICIOS, hoy: lunesDe(5) })!;
    const todo = [p.frase, p.titular, p.detalle, ...p.zonas.map(z => z.texto)].join(' ');
    expect(todo).not.toMatch(/IEM|índice|hipótesis|veredicto|RM\b|zona|tipo de bloque|\bIA\b/i);
  });
});

describe('empujonDelObjetivo', () => {
  const rutina = (ejercicios: Array<{ exerciseId: string; reps?: string; rir?: number; sets?: number }>): Workout => ({
    id: 'w1', mesocycleId: 'm1', name: 'Día 1', dayIndex: 0,
    exercises: ejercicios.map((e, i) => ({ exerciseId: e.exerciseId, order: i, sets: e.sets ?? 2, reps: e.reps ?? '8-10', restSeconds: 120, rir: e.rir ?? 1 })),
  } as unknown as Workout);
  const base = { meso: meso(), exercises: EJERCICIOS, hoy: lunesDe(3) };

  it('le dice lo que le falta en el ejercicio más cerca de subir, en sus palabras', () => {
    // Salto de 2,5 kg sobre 60 (4 %): con el rango 8-10 basta con llegar a 10.
    const logs = [log(1, { press: [serie(57.5, 10), serie(57.5, 10)] }), log(2, { press: [serie(60, 9), serie(60, 8)], aperturas: [serie(15, 9), serie(15, 9)] })];
    const e = empujonDelObjetivo({ ...base, workouts: [rutina([{ exerciseId: 'press' }, { exerciseId: 'aperturas', reps: '12-15' }])], logs })!;
    expect(e).toMatchObject({ exerciseId: 'press', tipo: 'faltan_reps', faltan: 1, peso: 60 });
    expect(e.texto).toBe('Te falta 1 repetición en press inclinado para pasar de 60 kg.');
  });

  it('si ya llegó al tope con margen, le toca subir y le dice a cuánto', () => {
    const logs = [log(1, { press: [serie(57.5, 10)] }), log(2, { press: [serie(60, 10), serie(60, 10)] })];
    const e = empujonDelObjetivo({ ...base, workouts: [rutina([{ exerciseId: 'press' }])], logs })!;
    expect(e).toMatchObject({ tipo: 'sube', faltan: 0, peso: 60, pesoNuevo: 62.5 });
    expect(e.texto).toBe('En press inclinado ya te toca subir: prueba con 62,5 kg.');
  });

  it('las repeticiones se llevan al esfuerzo pautado: 10 al fallo con RIR 1 pautado son 9', () => {
    const logs = [log(1, { press: [serie(57.5, 10)] }), log(2, { press: [serie(60, 10, 0, { alFallo: true })] })];
    const e = empujonDelObjetivo({ ...base, workouts: [rutina([{ exerciseId: 'press', sets: 1 }])], logs })!;
    expect(e).toMatchObject({ tipo: 'faltan_reps', faltan: 1 });
  });

  it('con el salto de carga grande pide las repeticiones de margen antes de subir', () => {
    // Laterales de 8 a 10 kg: un 25 % de golpe. Con el rango 12-15 (3 de ancho) pide 5 más.
    const m = meso({ hipotesis: { deltoides: { palanca: 'volumen' } } });
    const logs = [log(1, { laterales: [serie(8, 15)] }), log(2, { laterales: [serie(10, 14)] })];
    const e = empujonDelObjetivo({ ...base, meso: m, workouts: [rutina([{ exerciseId: 'laterales', reps: '12-15', sets: 1 }])], logs })!;
    expect(e.tipo).toBe('faltan_reps');
    expect(e.faltan).toBe(6);
    expect(e.texto).toBe('Te faltan 6 repeticiones en elevaciones laterales para pasar de 10 kg.');
  });

  it('no mira ejercicios de otras zonas ni rutinas de otros bloques', () => {
    const logs = [log(2, { sentadilla: [serie(100, 10)] })];
    expect(empujonDelObjetivo({ ...base, workouts: [rutina([{ exerciseId: 'sentadilla' }])], logs })).toBeNull();
    const deOtro = { ...rutina([{ exerciseId: 'press' }]), mesocycleId: 'otro' } as Workout;
    expect(empujonDelObjetivo({ ...base, workouts: [deOtro], logs: [log(2, { press: [serie(60, 9)] })] })).toBeNull();
  });

  it('en descarga, puente o vuelta de parón no se empuja a subir', () => {
    const logs = [log(2, { press: [serie(60, 9)] })];
    const workouts = [rutina([{ exerciseId: 'press' }])];
    expect(empujonDelObjetivo({ ...base, meso: meso({ semanasDescarga: [3] }), workouts, logs })).toBeNull();
    expect(empujonDelObjetivo({ ...base, meso: meso({ semanasPivot: [3] }), workouts, logs })).toBeNull();
    expect(empujonDelObjetivo({ ...base, hoy: lunesDe(1), meso: meso({ vuelveDeParon: true }), workouts, logs: [log(1, { press: [serie(60, 9)] }, -7)] })).toBeNull();
  });

  it('sin ninguna serie anterior no se inventa nada', () => {
    expect(empujonDelObjetivo({ ...base, workouts: [rutina([{ exerciseId: 'press' }])], logs: [] })).toBeNull();
  });

  it('va dentro de progresoDelObjetivo cuando se le pasan las rutinas', () => {
    const logs = [log(1, { press: [serie(57.5, 10)] }), log(2, { press: [serie(60, 9)] })];
    const sin = progresoDelObjetivo({ meso: meso(), logs, exercises: EJERCICIOS, hoy: lunesDe(3) })!;
    const con = progresoDelObjetivo({ meso: meso(), logs, exercises: EJERCICIOS, hoy: lunesDe(3), workouts: [rutina([{ exerciseId: 'press', sets: 1 }])] })!;
    expect(sin.empujon).toBeNull();
    expect(con.empujon?.texto).toBe('Te falta 1 repetición en press inclinado para pasar de 60 kg.');
  });
});

describe('mesoDelObjetivo', () => {
  it('el bloque que contiene hoy; con dos solapados, el que empezó más tarde; fuera de fechas, ninguno', () => {
    const a = meso({ id: 'a' });
    const b = meso({ id: 'b', startDate: addDays(INICIO, 77) });
    expect(mesoDelObjetivo([a, b], lunesDe(3))?.id).toBe('a');
    expect(mesoDelObjetivo([a, b], addDays(INICIO, 80))?.id).toBe('b');
    expect(mesoDelObjetivo([a], addDays(INICIO, 12 * 7))).toBeNull();
    expect(mesoDelObjetivo([a], addDays(INICIO, -1))).toBeNull();
  });
});
