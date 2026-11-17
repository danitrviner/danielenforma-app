import { describe, it, expect } from 'vitest';
import type { Questionnaire, QuestionnaireResponse, WorkoutLog } from '../types';
import { senalesActivas, SENALES_PARA_DESCARGA } from './descargaPorSenales';
import { senalesDelProtocolo } from './revisionCoach';

/* D6r y D7 (17-11-2026): el cansancio al salir y las agujetas a 48 h, apuntados
   sesión a sesión, llegan a las señales de descarga. Lo anterior (R3, con el
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

  it('sin cansancio apuntado en las sesiones cae al cuestionario semanal, sin sesión señalada', () => {
    const r = senalesDelProtocolo({ responses, questionnaires: [Q], hasta: '2026-09-14', logs: [log('a', '2026-09-10', {})] });
    expect(r.cansancioAlSalir).toBe(5);
    expect(r.sesionMasCansada).toBeUndefined();
    expect('sesionMasCansada' in r).toBe(false);
  });

  it('las agujetas a 48 h mandan si son más recientes, con la lectura previa venga de donde venga', () => {
    const logs = [log('a', '2026-09-10', { agujetas48h: { gluteo: 4 }, agujetas48hAt: '2026-09-12T10:00:00.000Z' })];
    const r = senalesDelProtocolo({ responses: [semana('2026-09-04', 5, 4)], questionnaires: [Q], hasta: '2026-09-14', logs });
    expect(r.agujetasPorZona).toEqual([{ nombre: 'Glúteo (mayor y medio)', valor: 4, anterior: 4 }]);
    expect(senalesActivas(r)).toEqual(['agujetas de 4 o más dos semanas seguidas en glúteo (mayor y medio)']);
  });

  it('lo contestado después de `hasta` no entra en una revisión de antes', () => {
    const logs = [log('a', '2026-09-10', { agujetas48h: { gluteo: 5 }, agujetas48hAt: '2026-09-12T10:00:00.000Z' })];
    const r = senalesDelProtocolo({ responses, questionnaires: [Q], hasta: '2026-09-11', logs });
    expect(r.agujetasPorZona).toEqual([{ nombre: 'Glúteo (mayor y medio)', valor: 2, anterior: 4 }]);
  });
});
