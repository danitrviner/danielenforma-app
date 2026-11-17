import { describe, it, expect } from 'vitest';
import type { WorkoutLog, WorkoutSetLog } from '../types';
import { cambiosDeTarea, sesionesDelEjercicio, historialComparable, tramoComparable, cambiosEnLaVentana, describirCambios, marcaDelPunto } from './comparabilidad';
import { comprobarRir, calibracionDelAtleta, calibracionPorEjercicio, lecturaDeCalibracion, textoDeComprobacion } from './calibracionRir';
import { rmDeSerie } from './oneRepMax';
import { detectarEstancamiento, sesionesSinMejorar } from './estancamiento';
import { addDays } from './trainingWeek';

const s = (weight: number, repsDone: number, rir = 2, extra: Partial<WorkoutSetLog> = {}): WorkoutSetLog => ({ weight, repsDone, rir, ...extra });
let n = 0;
const log = (date: string, entries: WorkoutLog['entries']): WorkoutLog =>
  ({ id: `l${n++}`, athleteId: 'a', workoutId: 'w', assignmentId: 'x', date, completedAt: '', entries }) as WorkoutLog;
const press = (date: string, sets: WorkoutSetLog[], antes: WorkoutLog['entries'] = [], extra = {}) =>
  log(date, [...antes, { exerciseId: 'press', sets, ...extra }]);
const tres = (w: number, r: number, rir = 2) => [s(w, r, rir), s(w, r, rir), s(w, r, rir)];

describe('comparabilidad (S3)', () => {
  it('mismas series, mismo sitio: comparables', () => {
    const logs = [press('2026-10-01', tres(80, 8)), press('2026-10-08', tres(80, 9))];
    const [a, b] = sesionesDelEjercicio(logs, 'press');
    expect(cambiosDeTarea(a, b)).toEqual([]);
  });

  it('pasar de ir primero a ir detrás de otro ejercicio cambia el orden', () => {
    const remo = { exerciseId: 'remo', sets: tres(60, 10) };
    const logs = [press('2026-10-01', tres(80, 8)), press('2026-10-08', tres(80, 7), [remo])];
    expect(historialComparable(logs, 'press')[1].cambios).toEqual(['orden']);
  });

  it('menos reps con el mismo peso es rendir peor, no otro rango', () => {
    const logs = [press('2026-10-01', tres(80, 10)), press('2026-10-08', tres(80, 6))];
    expect(historialComparable(logs, 'press')[1].cambios).toEqual([]);
  });

  it('más peso y bastantes menos reps es otro rango', () => {
    const logs = [press('2026-10-01', tres(60, 14)), press('2026-10-08', tres(80, 7))];
    expect(historialComparable(logs, 'press')[1].cambios).toEqual(['rango']);
  });

  it('una repetición más de margen de media cambia el RIR', () => {
    const logs = [press('2026-10-01', tres(80, 8, 1)), press('2026-10-08', tres(80, 8, 3))];
    expect(historialComparable(logs, 'press')[1].cambios).toEqual(['rir']);
  });

  it('descansar la mitad cambia la tarea', () => {
    const hora = (seg: number) => new Date(Date.UTC(2026, 9, 1, 10, 0, seg)).toISOString();
    const con = (cada: number) => [0, 1, 2].map(i => s(80, 8, 2, { hechaEn: hora(i * cada) }));
    const logs = [press('2026-10-01', con(225)), press('2026-10-08', con(105))];
    expect(historialComparable(logs, 'press')[1].cambios).toEqual(['descanso']);
  });

  it('añadir bajadas o ir al fallo es otra técnica; la casilla, otra referencia', () => {
    const logs = [
      press('2026-10-01', tres(80, 8)),
      press('2026-10-08', [...tres(80, 8), s(60, 6, 0, { segmento: true })]),
      press('2026-10-15', [...tres(80, 8), s(60, 6, 0, { segmento: true })], [], { nuevaReferencia: true }),
    ];
    const h = historialComparable(logs, 'press');
    expect(h[1].cambios).toEqual(['tecnica']);
    expect(h[2].cambios).toEqual(['referencia']);
  });

  it('el tramo comparable empieza en el último cambio', () => {
    const logs = [
      press('2026-10-01', tres(60, 14)), press('2026-10-08', tres(80, 7)),
      press('2026-10-15', tres(80, 7)), press('2026-10-22', tres(80, 8)),
    ];
    expect(tramoComparable(logs, 'press').map(p => p.date)).toEqual(['2026-10-08', '2026-10-15', '2026-10-22']);
    expect(cambiosEnLaVentana(logs, ['press'], '2026-10-05', '2026-10-31')).toEqual({ press: { date: '2026-10-08', cambios: ['rango'] } });
    expect(cambiosEnLaVentana(logs, ['press'], '2026-10-10', '2026-10-31')).toEqual({});
  });

  it('describe los cambios en una frase', () => {
    expect(describirCambios(['orden', 'descanso'])).toBe('el orden en la sesión y el descanso');
  });
});

describe('calibración del RIR (F4)', () => {
  it('entre sesiones: salen más de las que creía posibles', () => {
    const c = comprobarRir([s(100, 13, 0, { alFallo: true })], [s(100, 8, 2)]);
    expect(c).toMatchObject({ desfase: 3, entreSesiones: true, repsReales: 13, repsEstimacion: 8, rirEstimado: 2 });
    expect(lecturaDeCalibracion(c!.desfase)).toBe('se_queda_lejos');
    expect(textoDeComprobacion(c!)).toContain('3 repeticiones más lejos');
  });

  it('entre sesiones también detecta al que aprieta más de lo que apunta', () => {
    const c = comprobarRir([s(100, 8, 0)], [s(100, 7, 3)]);
    expect(c?.desfase).toBe(-2);
    expect(lecturaDeCalibracion(-2)).toBe('se_pasa');
  });

  it('con otro peso no se compara', () => {
    expect(comprobarRir([s(102.5, 12, 0)], [s(100, 8, 2)])).toBeNull();
  });

  it('dentro de la sesión solo cuenta si sale a favor (el cansancio lo tapa)', () => {
    expect(comprobarRir([s(100, 8, 2), s(100, 8, 2), s(100, 12, 0, { alFallo: true })])).toMatchObject({ desfase: 2, entreSesiones: false });
    expect(comprobarRir([s(100, 8, 2), s(100, 8, 0)])).toBeNull();
  });

  it('calibrado si la diferencia es de una repetición', () => {
    const c = comprobarRir([s(100, 11, 0)], [s(100, 8, 2)]);
    expect(lecturaDeCalibracion(c!.desfase)).toBe('calibrado');
    expect(textoDeComprobacion(c!)).toContain('va fino');
  });

  it('resume el historial del atleta y no cruza una referencia nueva ni sesiones lejanas', () => {
    const logs = [
      press('2026-10-01', tres(100, 8, 2)),
      press('2026-10-08', [s(100, 13, 0, { alFallo: true })]),
      press('2026-10-15', [s(100, 14, 0)], [], { nuevaReferencia: true }),
      press('2026-12-20', [s(100, 20, 0)]),
    ];
    const c = calibracionDelAtleta(logs);
    expect(c).toMatchObject({ comprobaciones: 1, desfaseMedio: 3, lectura: 'se_queda_lejos' });
    expect(calibracionDelAtleta([press('2026-10-01', tres(100, 8))])).toBeNull();
  });
});

describe('estancamiento honesto (S1)', () => {
  // Dos sesiones por semana (lunes y jueves), como en un bloque de frecuencia 2.
  const fecha = (i: number) => addDays('2026-09-01', Math.floor(i / 2) * 7 + (i % 2) * 3);
  const iguales = (k: number, sets = tres(80, 8)) => Array.from({ length: k }, (_, i) => press(fecha(i), sets));

  it('cuenta las sesiones desde la última mejora, y un 3 % o menos no es mejora (ruido)', () => {
    expect(sesionesSinMejorar([100, 100, 100])).toBe(3);
    expect(sesionesSinMejorar([100, 104, 104])).toBe(2);
    expect(sesionesSinMejorar([100, 100, 104])).toBe(1);
    // +1 % y +2,5 %: una repetición más o menos, no una marca nueva.
    expect(sesionesSinMejorar([100, 101, 102.5])).toBe(3);
    // Subiendo poco a poco sí acaba superando la referencia.
    expect(sesionesSinMejorar([100, 101, 102, 104])).toBe(1);
  });

  it('tres o cinco sesiones iguales (semana y media o dos y media) no son estancamiento', () => {
    expect(detectarEstancamiento(iguales(2), 'press')).toBeNull();
    expect(detectarEstancamiento(iguales(3), 'press')).toBeNull();
    expect(detectarEstancamiento(iguales(5), 'press')).toBeNull();
  });

  it('seis iguales (unas tres semanas) con todo en orden: +1-2 series', () => {
    expect(detectarEstancamiento(iguales(6), 'press')).toMatchObject({ sesiones: 6, veredicto: 'subir_series' });
  });

  it('si la última mejora, no hay nada que decir', () => {
    const logs = [...iguales(6), press(fecha(6), tres(80, 10))];
    expect(detectarEstancamiento(logs, 'press')).toBeNull();
  });

  it('una mejora por debajo del ruido (un kilo más, +1,25 %) no rompe el estancamiento', () => {
    const logs = [...iguales(6), press(fecha(6), tres(81, 8))];
    expect(detectarEstancamiento(logs, 'press')).toMatchObject({ sesiones: 7 });
  });

  it('un cambio de tarea reinicia la cuenta', () => {
    const remo = { exerciseId: 'remo', sets: tres(60, 10) };
    const logs = [...iguales(6), press(fecha(6), tres(80, 7), [remo])];
    expect(detectarEstancamiento(logs, 'press')).toBeNull();
  });

  it('el veredicto sigue el orden: contexto, esfuerzo, limitante, volumen, variante', () => {
    const logs = iguales(6);
    expect(detectarEstancamiento(logs, 'press', { recuperacionMala: true, limitante: 'agarre' })?.veredicto).toBe('mantener');
    expect(detectarEstancamiento(logs, 'press', { desfaseRir: 3, limitante: 'agarre' })?.veredicto).toBe('apretar');
    expect(detectarEstancamiento(iguales(6, tres(80, 8, 4)), 'press')?.veredicto).toBe('apretar');
    const limitante = detectarEstancamiento(logs, 'press', { limitante: 'agarre', zona: 'mrv' });
    expect(limitante?.veredicto).toBe('arreglar_limitante');
    expect(limitante?.accion).toContain('straps');
    expect(detectarEstancamiento(logs, 'press', { zona: 'mrv' })?.veredicto).toBe('repartir_o_reducir');
    expect(detectarEstancamiento(iguales(8), 'press', { zona: 'mav' })?.veredicto).toBe('subir_series');
  });

  it('con once sesiones igual todavía es dosis; con doce (unas seis semanas) toca cambiar la variante', () => {
    expect(detectarEstancamiento(iguales(11), 'press')?.veredicto).toBe('subir_series');
    expect(detectarEstancamiento(iguales(12), 'press')?.veredicto).toBe('cambiar_variante');
  });
});

// ── 17-11-2026: qué series cuentan (D2 y D4b) ───────────────────────────────

describe('la marca de una sesión del historial (D2)', () => {
  it('es el RM de su mejor serie válida; sin ninguna, no hay marca', () => {
    const logs = [
      press('2026-10-01', [s(80, 8), s(70, 20, 4)]),          // la de 20 a RIR 4 daría más RM
      press('2026-10-08', tres(80, 8, 4)),                     // todo lejos del fallo
      press('2026-10-15', [s(80, 8, 2, { rirApuntado: false })]), // RIR pautado sin tocar
    ];
    const [a, b, c] = sesionesDelEjercicio(logs, 'press');
    expect(marcaDelPunto(a)).toBe(rmDeSerie(s(80, 8)));
    expect(marcaDelPunto(b)).toBeNull();
    expect(marcaDelPunto(c)).toBeNull();
  });

  it('el RIR pautado sin tocar no marca un «cambio de RIR» que no existe', () => {
    const pautado = (rir: number) => [0, 1, 2].map(() => s(80, 8, rir, { rirApuntado: false }));
    // Apuntó RIR 1 una semana; la siguiente dejó el 3 que venía pautado.
    expect(historialComparable([press('2026-10-01', tres(80, 8, 1)), press('2026-10-08', pautado(3))], 'press')[1].cambios).toEqual([]);
    // Con el RIR apuntado en las dos, el cambio sí se ve (y basta una serie apuntada en cada una).
    const mixto = [s(80, 8, 3), ...pautado(1).slice(1)];
    expect(historialComparable([press('2026-10-01', tres(80, 8, 1)), press('2026-10-08', mixto)], 'press')[1].cambios).toEqual(['rir']);
  });
});

describe('estancamiento solo con sesiones con marca (D2)', () => {
  const fecha = (i: number) => addDays('2026-09-01', Math.floor(i / 2) * 7 + (i % 2) * 3);

  it('una sesión sin marca en medio no cuenta ni como mejora ni como sesión parada', () => {
    // Cinco iguales y, en medio, una guardada con el RIR pautado sin tocar (misma
    // tarea, pero sin marca): son cinco sesiones medibles, no seis.
    const sinApuntar = [0, 1, 2].map(() => s(80, 8, 2, { rirApuntado: false }));
    const logs = [0, 1, 2, 3, 4, 5].map(i => press(fecha(i), i === 2 ? sinApuntar : tres(80, 8)));
    expect(tramoComparable(logs, 'press')).toHaveLength(6);
    expect(detectarEstancamiento(logs, 'press')).toBeNull();
    // Con una sexta con marca, ya sí: seis sesiones medibles sin mejorar.
    expect(detectarEstancamiento([...logs, press(fecha(6), tres(80, 8))], 'press')).toMatchObject({ sesiones: 6, veredicto: 'subir_series' });
  });

  it('una serie de muchas repeticiones no rompe un estancamiento de verdad', () => {
    // Seis sesiones iguales; en la última añade una serie de 20 a RIR 2, que
    // sin filtro daba un RM más alto y «mejoraba».
    const logs = [0, 1, 2, 3, 4].map(i => press(fecha(i), tres(80, 8)));
    const ultima = press(fecha(5), [...tres(80, 8), s(70, 20, 2)]);
    expect(rmDeSerie(s(70, 20, 2))).toBeGreaterThan(rmDeSerie(s(80, 8)) * 1.03);
    expect(detectarEstancamiento([...logs, ultima], 'press')).toMatchObject({ sesiones: 6, veredicto: 'subir_series' });
  });

  it('quien para siempre a 4 del fallo no tiene marcas: solo se le dice que apriete, y si lo apuntado tampoco sube', () => {
    const lejos = (k: number, kg: (i: number) => number) => Array.from({ length: k }, (_, i) => press(fecha(i), tres(kg(i), 8, 4)));
    expect(detectarEstancamiento(lejos(6, () => 80), 'press')).toMatchObject({ sesiones: 6, veredicto: 'apretar' });
    expect(detectarEstancamiento(lejos(6, () => 80), 'press', { recuperacionMala: true })?.veredicto).toBe('mantener');
    expect(detectarEstancamiento(lejos(5, () => 80), 'press')).toBeNull();
    // Sube 5 kg cada sesión, aunque lejos del fallo: no está parado.
    expect(detectarEstancamiento(lejos(6, i => 80 + i * 5), 'press')).toBeNull();
    // Con el RIR pautado sin tocar no se sabe si aprieta o no: no se dice nada.
    const sinApuntar = Array.from({ length: 6 }, (_, i) => press(fecha(i), [0, 1, 2].map(() => s(80, 8, 4, { rirApuntado: false }))));
    expect(detectarEstancamiento(sinApuntar, 'press')).toBeNull();
  });
});

describe('calibración del RIR: solo el RIR que apuntó el atleta (D4b)', () => {
  it('una serie con el RIR pautado sin tocar no vale de estimación', () => {
    const pautada = [s(80, 8, 2, { rirApuntado: false })];
    expect(comprobarRir([s(80, 13, 0, { alFallo: true })], pautada)).toBeNull();
    // Con el RIR apuntado (o en un registro antiguo, sin la marca) sí.
    expect(comprobarRir([s(80, 13, 0, { alFallo: true })], [s(80, 8, 2, { rirApuntado: true })])).toMatchObject({ desfase: 3 });
    expect(comprobarRir([s(80, 13, 0, { alFallo: true })], [s(80, 8, 2)])).toMatchObject({ desfase: 3 });
  });

  it('un RIR 0 que venía pautado y no se tocó no es una serie al máximo; el fallo marcado sí', () => {
    expect(comprobarRir([s(80, 13, 0, { rirApuntado: false })], [s(80, 8, 2)])).toBeNull();
    expect(comprobarRir([s(80, 13, 3, { alFallo: true, rirApuntado: false })], [s(80, 8, 2)])).toMatchObject({ desfase: 3 });
  });

  it('dentro de la sesión tampoco se usa de estimación una serie sin RIR apuntado', () => {
    expect(comprobarRir([s(80, 8, 2, { rirApuntado: false }), s(80, 12, 0, { alFallo: true })])).toBeNull();
    expect(comprobarRir([s(80, 8, 2), s(80, 12, 0, { alFallo: true })])).toMatchObject({ desfase: 2, entreSesiones: false });
  });

  it('el historial ignora las sesiones guardadas con el RIR pautado', () => {
    const logs = [
      press('2026-10-01', [s(80, 8, 2, { rirApuntado: false })]),
      press('2026-10-08', [s(80, 13, 0, { alFallo: true })]),
    ];
    expect(calibracionDelAtleta(logs)).toBeNull();
  });
});

describe('mejorar no es calibrar mal (D4b)', () => {
  const alMaximo = (reps: number) => [s(80, reps, 0, { alFallo: true })];

  it('si sus «posibles» ya venían subiendo con el mismo peso, eso se descuenta del desfase', () => {
    // 8 a RIR 2 (10 posibles) → 9 a RIR 2 (11 posibles) → hoy, al máximo, 13.
    // Sin mirar atrás: 13 − 11 = 2, «se queda lejos». Pero ya subía 1 por sesión:
    // se esperaban 12, y el desfase es 1 (calibrado).
    const c = comprobarRir(alMaximo(13), [s(80, 9, 2)], [s(80, 8, 2)]);
    expect(c).toMatchObject({ desfase: 1, mejoraDescontada: 1, entreSesiones: true });
    expect(lecturaDeCalibracion(c!.desfase)).toBe('calibrado');
    expect(comprobarRir(alMaximo(13), [s(80, 9, 2)])).toMatchObject({ desfase: 2 });
  });

  it('si no venía subiendo, todo el exceso es desfase', () => {
    const c = comprobarRir(alMaximo(13), [s(80, 8, 2)], [s(80, 8, 2)]);
    expect(c).toMatchObject({ desfase: 3 });
    expect(c!.mejoraDescontada).toBeUndefined();
  });

  it('no descuenta más de lo que hay, ni toca el caso de quien aprieta más de lo que apunta', () => {
    // Subía 3 por sesión y hoy salen solo 2 más: desfase 0, no negativo.
    expect(comprobarRir(alMaximo(13), [s(80, 9, 2)], [s(80, 6, 2)])).toMatchObject({ desfase: 0, mejoraDescontada: 2 });
    // Salen menos de las que creía: se deja como está.
    expect(comprobarRir(alMaximo(8), [s(80, 9, 2)], [s(80, 8, 2)])).toMatchObject({ desfase: -3 });
  });

  it('sin una sesión anterior con el mismo peso y RIR apuntado no se puede separar: se deja', () => {
    expect(comprobarRir(alMaximo(13), [s(80, 9, 2)], [s(75, 8, 2)])).toMatchObject({ desfase: 2 });
    expect(comprobarRir(alMaximo(13), [s(80, 9, 2)], [s(80, 8, 2, { rirApuntado: false })])).toMatchObject({ desfase: 2 });
  });

  it('el historial pasa la sesión de antes, salvo referencia nueva o si queda lejos', () => {
    const tres_ = (d1: string, d2: string, d3: string, extra = {}) => [
      press(d1, [s(80, 8, 2)]), press(d2, [s(80, 9, 2)], [], extra), press(d3, alMaximo(13)),
    ];
    expect(calibracionPorEjercicio(tres_('2026-10-01', '2026-10-08', '2026-10-15'))[0]).toMatchObject({ comprobaciones: 1, desfaseMedio: 1 });
    // La de en medio estrena máquina: lo de antes no vale de tendencia.
    expect(calibracionPorEjercicio(tres_('2026-10-01', '2026-10-08', '2026-10-15', { nuevaReferencia: true }))[0]).toMatchObject({ desfaseMedio: 2 });
    // La primera es de hace dos meses.
    expect(calibracionPorEjercicio(tres_('2026-08-01', '2026-10-08', '2026-10-15'))[0]).toMatchObject({ desfaseMedio: 2 });
  });
});
