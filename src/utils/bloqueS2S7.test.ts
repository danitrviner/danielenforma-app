import { describe, it, expect } from 'vitest';
import type { Exercise, WorkoutLog, WorkoutSetLog } from '../types';
import { clasificarCaida } from './patronDeCaida';
import { seriesEfectivas } from './seriesEfectivas';
import { senalesActivas, ultimaFrenteAPrimera, recortesPosibles, zonasQueNoSeRecuperan, SENALES_PARA_DESCARGA } from './descargaPorSenales';

const ej = (id: string, muscleGroup: string, secundarios: string[] = []) =>
  ({ id, name: id, muscleGroup, secondaryMuscleGroups: secundarios }) as unknown as Exercise;
const CATALOGO = [
  ej('remo', 'dorsal', ['biceps']), ej('jalon', 'dorsal', ['biceps']), ej('curl', 'biceps'),
  ej('press', 'pecho', ['triceps']), ej('prensa', 'cuadriceps', ['gluteo']), ej('gemelo', 'gemelo'),
  ej('extension', 'cuadriceps'),
];

describe('patrón de la caída (S2)', () => {
  it('nada cae: no hay patrón', () => {
    expect(clasificarCaida([], CATALOGO)).toBeNull();
  });

  it('un ejercicio suelto es local', () => {
    expect(clasificarCaida(['press'], CATALOGO)?.tipo).toBe('local');
  });

  it('varios que comparten músculo son regional, y dice cuál', () => {
    const p = clasificarCaida(['remo', 'jalon', 'curl'], CATALOGO)!;
    expect(p.tipo).toBe('regional');
    expect(p.zona).toBe('biceps');
    expect(p.ejercicios).toEqual(['remo', 'jalon', 'curl']);
    expect(p.lectura).toContain('bíceps');
  });

  it('sin relación y con el contexto mal es transversal', () => {
    expect(clasificarCaida(['press', 'prensa', 'gemelo'], CATALOGO, { contextoMalo: true })?.tipo).toBe('transversal');
  });

  it('sin relación y con el contexto en orden: casos sueltos', () => {
    expect(clasificarCaida(['press', 'prensa', 'gemelo'], CATALOGO)?.tipo).toBe('local');
  });

  it('si cae más de la mitad de lo que entrena es transversal aunque no haya cuestionario', () => {
    expect(clasificarCaida(['press', 'prensa', 'gemelo'], CATALOGO, { enLaVentana: 5 })?.tipo).toBe('transversal');
  });

  it('cae casi todo y encima duerme mal: manda lo general sobre la zona compartida', () => {
    expect(clasificarCaida(['remo', 'jalon', 'curl'], CATALOGO, { enLaVentana: 4, contextoMalo: true })?.tipo).toBe('transversal');
  });
});

describe('descarga por señales (S7)', () => {
  it('una señal sola no llega; dos, sí', () => {
    expect(senalesActivas({ contextoDesfavorable: ['estrés 8/10'] }).length).toBeLessThan(SENALES_PARA_DESCARGA);
    expect(senalesActivas({ contextoDesfavorable: ['estrés 8/10'], caidaTransversal: true })).toHaveLength(2);
    expect(senalesActivas({ ejerciciosConDiasMalos: 1, gruposConAgujetasCronicas: 1 })).toEqual([]);
    expect(senalesActivas({ ejerciciosConDiasMalos: 2, gruposConAgujetasCronicas: 3 })).toHaveLength(2);
  });

  it('R3 · salir muy cansado de las sesiones es señal a partir de 8 de 10', () => {
    expect(senalesActivas({ cansancioAlSalir: 7 })).toEqual([]);
    expect(senalesActivas({ cansancioAlSalir: 8 })).toEqual(['sale muy cansado de las sesiones (8/10)']);
    expect(senalesActivas({})).toEqual([]);
  });

  it('R3 · agujetas de 4 o más (1-5) solo si se repiten dos semanas seguidas en la misma zona', () => {
    expect(zonasQueNoSeRecuperan([{ nombre: 'Isquiotibiales', valor: 4 }])).toEqual([]);
    expect(zonasQueNoSeRecuperan([{ nombre: 'Isquiotibiales', valor: 4, anterior: 3 }])).toEqual([]);
    expect(zonasQueNoSeRecuperan([{ nombre: 'Isquiotibiales', valor: 3, anterior: 5 }])).toEqual([]);
    expect(zonasQueNoSeRecuperan([{ nombre: 'Isquiotibiales', valor: 4, anterior: 5 }, { nombre: 'Glúteo', valor: 2, anterior: 2 }])).toEqual(['Isquiotibiales']);
    expect(senalesActivas({ agujetasPorZona: [{ nombre: 'Isquiotibiales', valor: 4, anterior: 4 }, { nombre: 'Pectoral', valor: 5, anterior: 4 }] }))
      .toEqual(['agujetas de 4 o más dos semanas seguidas en isquiotibiales y pectoral']);
    expect(senalesActivas({ agujetasPorZona: [{ nombre: 'Pectoral', valor: 5 }] })).toEqual([]);
  });

  it('R3 · el aviso de salto de carga cuenta como una señal, diga lo que diga la lista', () => {
    expect(senalesActivas({ saltoDeCarga: [] })).toEqual([]);
    const t = senalesActivas({ saltoDeCarga: ['Glúteo', 'Total de la semana'] });
    expect(t).toHaveLength(1);
    expect(t[0]).toContain('salto de carga');
    expect(t[0]).toContain('glúteo y total de la semana');
    expect(t[0]).not.toMatch(/lesi/i);
  });

  it('R3 · las señales nuevas suman como las demás: dos piden descarga, una no', () => {
    expect(senalesActivas({ cansancioAlSalir: 9 }).length).toBeLessThan(SENALES_PARA_DESCARGA);
    expect(senalesActivas({ cansancioAlSalir: 9, agujetasPorZona: [{ nombre: 'Glúteo', valor: 4, anterior: 4 }] }).length).toBe(SENALES_PARA_DESCARGA);
    expect(senalesActivas({ contextoDesfavorable: ['estrés 8/10'], saltoDeCarga: ['Total de la semana'] }).length).toBe(SENALES_PARA_DESCARGA);
  });

  it('el contexto desfavorable dice sus motivos; vacío no es señal (sustituye a la disposición, 18-11-2026)', () => {
    expect(senalesActivas({ contextoDesfavorable: ['estrés 8/10', '5,5 h de sueño'] })).toEqual(['contexto desfavorable (estrés 8/10 y 5,5 h de sueño)']);
    expect(senalesActivas({ contextoDesfavorable: [] })).toEqual([]);
  });

  const s = (weight: number, repsDone: number): WorkoutSetLog => ({ weight, repsDone, rir: 1 });
  it('la última serie frente a la primera, solo con el mismo peso y tres series o más', () => {
    expect(ultimaFrenteAPrimera([s(80, 10), s(80, 8), s(80, 6)])).toBeCloseTo(0.6);
    expect(ultimaFrenteAPrimera([s(80, 10), s(80, 6)])).toBeNull();
    expect(ultimaFrenteAPrimera([s(80, 10), s(80, 8), s(70, 10)])).toBeNull();
  });

  let n = 0;
  const log = (date: string, entries: WorkoutLog['entries']): WorkoutLog =>
    ({ id: `l${n++}`, athleteId: 'a', workoutId: 'w', assignmentId: 'x', date, completedAt: '', entries }) as WorkoutLog;

  it('ordena los recortes: última serie, redundante y mantenimiento', () => {
    const sesion = (date: string) => log(date, [
      { exerciseId: 'prensa', sets: [s(200, 10), s(200, 8), s(200, 6)] },
      { exerciseId: 'remo', sets: [s(60, 10), s(60, 10), s(60, 9)] },
      { exerciseId: 'jalon', sets: [s(50, 10), s(50, 10), s(50, 9)] },
    ]);
    const r = recortesPosibles({
      logs: [sesion('2026-10-01'), sesion('2026-10-08')],
      ejercicios: ['prensa', 'remo', 'jalon'],
      catalogo: CATALOGO,
      mantenimiento: [{ grupo: 'gemelo', hechas: 8, bastan: 4 }, { grupo: 'pecho', hechas: 5, bastan: 4 }],
    });
    expect(r.map(x => x.tipo)).toEqual(['ultima_serie', 'redundante', 'mantenimiento']);
    expect(r[0].texto).toContain('prensa');
    expect(r[1].ejercicios).toEqual(['remo', 'jalon']);
    expect(r[2].grupo).toBe('gemelo');
  });

  it('una sola sesión con la última serie caída no basta', () => {
    const r = recortesPosibles({
      logs: [log('2026-10-01', [{ exerciseId: 'prensa', sets: [s(200, 10), s(200, 8), s(200, 6)] }])],
      ejercicios: ['prensa'], catalogo: CATALOGO,
    });
    expect(r).toEqual([]);
  });
});

describe('series efectivas (S10)', () => {
  const s = (rir: number, extra: Partial<WorkoutSetLog> = {}): WorkoutSetLog => ({ weight: 50, repsDone: 10, rir, ...extra });
  const log = (sets: WorkoutSetLog[], exerciseId = 'press') =>
    ({ id: 'l', athleteId: 'a', workoutId: 'w', assignmentId: 'x', date: '2026-10-01', completedAt: '', entries: [{ exerciseId, sets }] }) as WorkoutLog;

  it('cuenta las que llegan a RIR 4 o menos, y el fallo aunque el RIR diga otra cosa', () => {
    const r = seriesEfectivas([log([s(1), s(4), s(5), s(6), s(5, { alFallo: true })]), log(Array.from({ length: 6 }, () => s(2)), 'remo')]);
    expect(r).toMatchObject({ hechas: 11, efectivas: 9, pct: 82 });
    expect(r.dondeSePierden).toEqual([{ exerciseId: 'press', lejos: 2 }]);
  });

  it('con pocas series no da porcentaje, y las bajadas no cuentan', () => {
    const r = seriesEfectivas([log([s(6), s(6), s(0, { segmento: true })])]);
    expect(r).toMatchObject({ hechas: 2, efectivas: 0, pct: null });
  });
});
