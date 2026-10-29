import { describe, it, expect } from 'vitest';
import { construirRoadmap, hitosAutomaticos, caminoDeFases } from './roadmapDelAtleta';
import type { Mesocycle, NutritionProgram, WorkoutAssignment, WorkoutLog } from '../types';
import type { SemanaDelPlan, EvaluacionDelPlan } from './seguimientoPlan';
import { addDays, getWeekStart } from './trainingWeek';

const HOY = '2026-10-29'; // jueves
const PROGRAMA = {
  athleteId: 'a@x.com', startDate: '2026-09-21',
  phases: [
    { id: 'f1', name: 'Déficit', weeks: 4, dietId: 'd1', objetivo: 'deficit', targetWeight: 83 },
    { id: 'f2', name: 'Déficit 2', weeks: 6, dietId: 'd2', objetivo: 'deficit', targetWeight: 79 },
    { id: 'f3', name: 'Mantenimiento', weeks: 2, dietId: 'd3', objetivo: 'mantenimiento' },
  ],
} as unknown as NutritionProgram;

/** 12 semanas desde el 21-09: f1 semanas 1-4, f2 5-10, f3 11-12. Hoy cae en la semana 6 (f2). */
function semanas(): SemanaDelPlan[] {
  return Array.from({ length: 12 }, (_, i) => {
    const desde = addDays('2026-09-21', i * 7), hasta = addDays(desde, 6);
    const faseIdx = i < 4 ? 0 : i < 10 ? 1 : 2;
    const esperado = 84 - i * 0.45;
    const futura = desde > HOY, enCurso = desde <= HOY && HOY <= hasta;
    return {
      semana: i + 1, desde, hasta, faseIdx, fase: PROGRAMA.phases[faseIdx], kcalPlan: 2100, kcalRegistradas: null, diasRegistrados: 0, kcalFiables: false,
      adherencia: null, pasosPlan: 9000, pasosReales: null, esperado, franja: [esperado - 0.4, esperado + 0.4], real: futura ? null : 84 - i * 0.4,
      estado: futura ? null : 'en-plan', futura, enCurso,
    };
  });
}

describe('caminoDeFases y dondeEstas', () => {
  it('todas las fases del plan, con la actual, y el objetivo en su idioma', () => {
    const r = construirRoadmap({ program: PROGRAMA, semanas: semanas(), mesociclos: [], assignments: [], workoutLogs: [], respuestas: [], stepLogs: [], stepGoal: 9000, hoy: HOY });
    expect(r.camino.map(f => [f.nombre, f.estado, f.semanas])).toEqual([['Déficit', 'pasada', 4], ['Déficit 2', 'actual', 6], ['Mantenimiento', 'futura', 2]]);
    expect(r.camino[1].objetivoTexto).toBe('Déficit · bajar a 79,0 kg antes del 29 nov');
    expect(r.dondeEstas).toMatchObject({ semanaDeFase: 2, pesoReal: 82, faltanKg: 3 });
    expect(r.dondeEstas!.franja).toEqual([81.35, 82.15]);
    expect(r.estaSemana).toMatchObject({ kcal: 2100, pasos: 9000 });
  });

  it('el mensaje del peso nunca es un reproche: en plan, lento con acción, rápido', () => {
    const ev = (estado: EvaluacionDelPlan['estado'], extra: Partial<EvaluacionDelPlan> = {}): EvaluacionDelPlan =>
      ({ estado, ritmo: -0.2, ritmoPlan: -0.45, pasosPlan: 9000, pasosMedios: 6000, ...extra } as EvaluacionDelPlan);
    const con = (e: EvaluacionDelPlan | null) => construirRoadmap({ program: PROGRAMA, semanas: semanas(), evaluacion: e, mesociclos: [], assignments: [], workoutLogs: [], respuestas: [], stepLogs: [], stepGoal: 9000, hoy: HOY }).dondeEstas!.mensaje;
    expect(con(ev('en-plan'))).toBe('Vas en el plan. Sigue igual esta semana.');
    expect(con(ev('por-encima'))).toBe('Esta semana: registra la comida todos los días y llega a los 9.000 pasos. Con eso Dani ajusta el lunes si hace falta.');
    expect(con(ev('por-debajo'))).toMatch(/más rápido de lo previsto/);
    expect(con(null)).toMatch(/Pésate tres mañanas/);
    for (const m of [con(ev('por-encima')), con(ev('por-debajo'))]) expect(m).not.toMatch(/desv[ií]o|mal|fall/i);
  });

  it('sin programa no hay camino ni dónde estás, y no revienta', () => {
    const r = construirRoadmap({ program: null, semanas: [], mesociclos: [], assignments: [], workoutLogs: [], respuestas: [], stepLogs: [], stepGoal: 8000, hoy: HOY });
    expect(r.camino).toEqual([]);
    expect(r.dondeEstas).toBeNull();
    expect(r.proximoHito).toBeNull();
  });
});

describe('bloque y próximo hito', () => {
  const meso = (id: string, startDate: string, weeks: number, name = 'Hipertrofia 1'): Mesocycle => ({ id, athleteId: 'a@x.com', startDate, weeks, name } as Mesocycle);
  it('semana N de M del bloque en curso y el hito más cercano', () => {
    const r = construirRoadmap({ program: PROGRAMA, semanas: semanas(), mesociclos: [meso('m1', '2026-10-12', 8)], assignments: [], workoutLogs: [], respuestas: [], stepLogs: [], stepGoal: 9000, hoy: HOY });
    expect(r.bloque).toMatchObject({ nombre: 'Hipertrofia 1', semana: 3, semanas: 8, hasta: '2026-12-06' });
    // La fase de mantenimiento empieza el 30-11, antes que el fin del bloque (06-12).
    expect(r.proximoHito).toMatchObject({ tipo: 'fase', fecha: '2026-11-30', texto: 'Mantenimiento en 5 semanas' });
  });
  it('un bloque terminado es un hito', () => {
    const r = construirRoadmap({ program: PROGRAMA, semanas: semanas(), mesociclos: [meso('m0', '2026-08-03', 6, 'Adaptación')], assignments: [], workoutLogs: [], respuestas: [], stepLogs: [], stepGoal: 9000, hoy: HOY });
    expect(r.hitos.find(h => h.tipo === 'bloque')).toMatchObject({ titulo: 'Bloque «Adaptación» terminado', fecha: '2026-09-13' });
  });
});

describe('hitos automáticos', () => {
  const camino = caminoDeFases(PROGRAMA, semanas(), HOY);
  const base = { camino, semanas: semanas(), mesociclos: [], assignments: [], workoutLogs: [], respuestas: [], stepLogs: [], stepGoal: 9000, hoy: HOY };

  it('fase completada y su peso objetivo conseguido', () => {
    const h = hitosAutomaticos(base);
    expect(h.map(x => x.id)).toEqual(['fase_0', 'peso_0']);
    expect(h[0]).toMatchObject({ titulo: 'Fase «Déficit» completada', fecha: '2026-10-18' });
    expect(h[1]).toMatchObject({ titulo: 'Peso objetivo de la fase: 83,0 kg' });
  });

  it('4 semanas seguidas con todos los entrenos, 4 revisiones y 4 de pasos', () => {
    const lunes = Array.from({ length: 4 }, (_, i) => addDays(getWeekStart(HOY), -7 * (4 - i)));
    const assignments: WorkoutAssignment[] = lunes.flatMap(l => [0, 2].map(d => ({ id: `a_${l}_${d}`, athleteId: 'a@x.com', workoutId: 'w', date: addDays(l, d), status: 'completed' as const })));
    const logs: WorkoutLog[] = [];
    const respuestas = lunes.map(l => ({ submittedAt: `${addDays(l, 4)}T18:00:00.000Z` }));
    const stepLogs = lunes.flatMap(l => Array.from({ length: 5 }, (_, d) => ({ date: addDays(l, d), steps: 9500 })));
    const h = hitosAutomaticos({ ...base, assignments, workoutLogs: logs, respuestas, stepLogs });
    const titulos = h.filter(x => x.tipo === 'constancia').map(x => x.titulo).sort();
    expect(titulos).toEqual(['4 revisiones seguidas', '4 semanas cumpliendo los pasos', '4 semanas seguidas con todos los entrenos']);
    expect(h.find(x => x.tipo === 'constancia')!.fecha).toBe(addDays(lunes[3], 6));
  });

  it('una semana sin todos los entrenos corta la racha', () => {
    const lunes = Array.from({ length: 4 }, (_, i) => addDays(getWeekStart(HOY), -7 * (4 - i)));
    const assignments: WorkoutAssignment[] = lunes.map((l, i) => ({ id: `a_${l}`, athleteId: 'a@x.com', workoutId: 'w', date: l, status: i === 1 ? 'perdido' as const : 'completed' as const }));
    expect(hitosAutomaticos({ ...base, assignments }).filter(x => x.tipo === 'constancia')).toEqual([]);
  });
});
