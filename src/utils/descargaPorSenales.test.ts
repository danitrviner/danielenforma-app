import { describe, it, expect } from 'vitest';
import type { Questionnaire, QuestionnaireResponse, WorkoutLog } from '../types';
import { avisosDeSesionesDuras, senalesActivas, SENALES_PARA_DESCARGA } from './descargaPorSenales';
import { senalesDelProtocolo } from './revisionCoach';

/* D6r (17-11-2026): el cansancio al salir, apuntado sesión a sesión, llega a
   las señales de descarga. Lo anterior (R3, con el
   cuestionario semanal) se prueba en bloqueS2S7.test.ts y revisionCoach.test.ts. */

describe('senalesActivas · cansancio por sesión', () => {
  it('con la sesión señalada dice la media y de cuál salió peor; sigue siendo UNA señal', () => {
    const t = senalesActivas({ cansancioAlSalir: 8.5, sesionMasCansada: { etiqueta: 'la del jueves, Pierna A', valor: 9 } });
    expect(t).toEqual(['sale muy cansado de las sesiones (8,5/10 de media; la del jueves, Pierna A: 9/10)']);
    expect(t.length).toBeLessThan(SENALES_PARA_DESCARGA);
  });

  it('por debajo de 8 de media no es señal, aunque una sesión suelta fuera dura', () => {
    expect(senalesActivas({ cansancioAlSalir: 6.5, sesionMasCansada: { etiqueta: 'la del jueves', valor: 9 } })).toEqual([]);
  });

  it('sin sesión señalada (cuestionario semanal) el texto no cambia', () => {
    expect(senalesActivas({ cansancioAlSalir: 8 })).toEqual(['sale muy cansado de las sesiones (8/10)']);
  });
});

/* Auditoría de cifras (17-11-2026): una sesión de 8 o más frena lo que se
   trabajó en ella, pero NO es señal de descarga (eso sigue siendo la media). */
describe('avisosDeSesionesDuras', () => {
  const pierna = { etiqueta: 'la del jueves, Pierna A', valor: 9, zonas: ['Cuádriceps', 'Isquiotibiales'] };

  it('con la media por debajo de 8 dice qué no subir y qué sesión aligerar, sin contar como señal', () => {
    const s = { cansancioAlSalir: 6.5, sesionesDuras: [pierna] };
    expect(avisosDeSesionesDuras(s)).toEqual(['salió con 9/10 de la del jueves, Pierna A: no subas cuádriceps e isquiotibiales sin bajarle antes la fatiga a esa sesión']);
    expect(senalesActivas(s)).toEqual([]);
  });

  it('con la media en 8 o más ya es señal de descarga y frena todo: no se repite por sesión', () => {
    expect(avisosDeSesionesDuras({ cansancioAlSalir: 8.5, sesionesDuras: [pierna] })).toEqual([]);
  });

  it('sin zonas conocidas lo dice igual; sin sesiones duras, nada', () => {
    expect(avisosDeSesionesDuras({ cansancioAlSalir: 6, sesionesDuras: [{ etiqueta: 'la del lunes', valor: 8, zonas: [] }] }))
      .toEqual(['salió con 8/10 de la del lunes: no subas lo que trabajó ese día sin bajarle antes la fatiga a esa sesión']);
    expect(avisosDeSesionesDuras({ cansancioAlSalir: 6 })).toEqual([]);
    expect(avisosDeSesionesDuras({})).toEqual([]);
  });
});

describe('senalesDelProtocolo · con lo apuntado en cada sesión', () => {
  const Q: Questionnaire = {
    id: 'q_s', ownerId: 'coach', title: 'Tu semana',
    questions: [
      { id: 'cansancio', label: 'Cansancio al salir', type: 'scale', required: false, scaleMin: 0, scaleMax: 10, signalKey: 'wellness.fatigue_post_weekly' },
      { id: 'ag_gluteo', label: 'Agujetas glúteo', type: 'scale', required: false, scaleMin: 1, scaleMax: 5, signalKey: 'agujetas.gluteo' },
    ],
  } as Questionnaire;
  const semana = (fecha: string, cansancio: number, gluteo: number): QuestionnaireResponse => ({
    id: `s_${fecha}`, questionnaireId: 'q_s', assignmentId: 'a', athleteId: 'ana@x.com', submittedAt: `${fecha}T19:00:00.000Z`,
    answers: [{ questionId: 'cansancio', value: cansancio }, { questionId: 'ag_gluteo', value: gluteo }],
  });
  const log = (id: string, date: string, extra: Partial<WorkoutLog>): WorkoutLog => ({
    id, athleteId: 'ana@x.com', workoutId: 'pierna', assignmentId: `as_${id}`, date, completedAt: `${date}T18:00:00.000Z`, entries: [], ...extra,
  });
  const responses = [semana('2026-09-04', 5, 4), semana('2026-09-11', 5, 2)];

  it('el cansancio es la media de las sesiones de los 7 días que acaban en `hasta`, con la más dura', () => {
    const logs = [
      log('viejo', '2026-09-05', { cansancioAlSalir: 1 }),
      log('a', '2026-09-08', { cansancioAlSalir: 8 }),
      log('b', '2026-09-10', { cansancioAlSalir: 9 }),
      log('futuro', '2026-09-16', { cansancioAlSalir: 0 }),
    ];
    const r = senalesDelProtocolo({ responses, questionnaires: [Q], hasta: '2026-09-14', logs, nombreDeSesion: () => 'Pierna A' });
    expect(r.cansancioAlSalir).toBe(8.5);
    expect(r.sesionMasCansada).toEqual({ etiqueta: 'la del jueves, Pierna A', valor: 9 });
    expect(senalesActivas(r)).toEqual(['sale muy cansado de las sesiones (8,5/10 de media; la del jueves, Pierna A: 9/10)']);
  });

  it('una sesión de 8 o más sale con las zonas que trabajó, si se pasa el grupo de cada ejercicio', () => {
    const series = [{ weight: 100, repsDone: 8, rir: 1 }];
    const logs = [
      log('a', '2026-09-08', { cansancioAlSalir: 4, entries: [{ exerciseId: 'press', sets: series }] }),
      log('b', '2026-09-10', { cansancioAlSalir: 9, entries: [{ exerciseId: 'sentadilla', sets: series }, { exerciseId: 'curl_femoral', sets: series }] }),
    ];
    const grupoDe = (id: string) => ({ press: 'pecho', sentadilla: 'cuadriceps', curl_femoral: 'isquios' } as const)[id];
    const r = senalesDelProtocolo({ responses, questionnaires: [Q], hasta: '2026-09-14', logs, nombreDeSesion: () => 'Pierna A', grupoDe });
    expect(r.cansancioAlSalir).toBe(6.5);
    expect(r.sesionesDuras).toEqual([{ etiqueta: 'la del jueves, Pierna A', valor: 9, zonas: ['Cuádriceps', 'Isquiotibiales'] }]);
    // No es señal de descarga, pero sí un aviso con nombre y zonas.
    expect(senalesActivas(r)).toEqual([]);
    expect(avisosDeSesionesDuras(r)).toHaveLength(1);
    // Sin sesiones de 8 o más, el campo ni aparece.
    expect('sesionesDuras' in senalesDelProtocolo({ responses, questionnaires: [Q], hasta: '2026-09-14', logs: [logs[0]] })).toBe(false);
  });

  it('sin cansancio apuntado en las sesiones cae al cuestionario semanal, sin sesión señalada', () => {
    const r = senalesDelProtocolo({ responses, questionnaires: [Q], hasta: '2026-09-14', logs: [log('a', '2026-09-10', {})] });
    expect(r.cansancioAlSalir).toBe(5);
    expect(r.sesionMasCansada).toBeUndefined();
    expect('sesionMasCansada' in r).toBe(false);
  });
});
