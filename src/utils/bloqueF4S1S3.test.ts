import { describe, it, expect } from 'vitest';
import type { WorkoutLog, WorkoutSetLog } from '../types';
import { cambiosDeTarea, sesionesDelEjercicio, historialComparable, tramoComparable, cambiosEnLaVentana, describirCambios } from './comparabilidad';
import { comprobarRir, calibracionDelAtleta, lecturaDeCalibracion, textoDeComprobacion } from './calibracionRir';
import { detectarEstancamiento, sesionesSinMejorar } from './estancamiento';

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
  const iguales = (k: number, sets = tres(80, 8)) => Array.from({ length: k }, (_, i) => press(`2026-10-${String(1 + i * 7).padStart(2, '0')}`, sets));

  it('cuenta las sesiones desde la última mejora', () => {
    expect(sesionesSinMejorar([100, 100, 100])).toBe(3);
    expect(sesionesSinMejorar([100, 103, 103])).toBe(2);
    expect(sesionesSinMejorar([100, 100, 104])).toBe(1);
  });

  it('dos sesiones iguales no son estancamiento', () => {
    expect(detectarEstancamiento(iguales(2), 'press')).toBeNull();
  });

  it('tres iguales con todo en orden: +1-2 series', () => {
    expect(detectarEstancamiento(iguales(3), 'press')).toMatchObject({ sesiones: 3, veredicto: 'subir_series' });
  });

  it('si la última mejora, no hay nada que decir', () => {
    const logs = [...iguales(3), press('2026-10-29', tres(80, 9))];
    expect(detectarEstancamiento(logs, 'press')).toBeNull();
  });

  it('un cambio de tarea reinicia la cuenta', () => {
    const remo = { exerciseId: 'remo', sets: tres(60, 10) };
    const logs = [...iguales(3), press('2026-10-29', tres(80, 7), [remo])];
    expect(detectarEstancamiento(logs, 'press')).toBeNull();
  });

  it('el veredicto sigue el orden: contexto, esfuerzo, limitante, volumen, variante', () => {
    const logs = iguales(3);
    expect(detectarEstancamiento(logs, 'press', { recuperacionMala: true, limitante: 'agarre' })?.veredicto).toBe('mantener');
    expect(detectarEstancamiento(logs, 'press', { desfaseRir: 3, limitante: 'agarre' })?.veredicto).toBe('apretar');
    expect(detectarEstancamiento(iguales(3, tres(80, 8, 4)), 'press')?.veredicto).toBe('apretar');
    const limitante = detectarEstancamiento(logs, 'press', { limitante: 'agarre', zona: 'mrv' });
    expect(limitante?.veredicto).toBe('arreglar_limitante');
    expect(limitante?.accion).toContain('straps');
    expect(detectarEstancamiento(logs, 'press', { zona: 'mrv' })?.veredicto).toBe('repartir_o_reducir');
    expect(detectarEstancamiento(iguales(4), 'press', { zona: 'mav' })?.veredicto).toBe('subir_series');
  });

  it('con seis sesiones igual toca cambiar la variante', () => {
    const logs = Array.from({ length: 6 }, (_, i) => press(`2026-09-${String(1 + i * 4).padStart(2, '0')}`, tres(80, 8)));
    expect(detectarEstancamiento(logs, 'press')?.veredicto).toBe('cambiar_variante');
  });
});
