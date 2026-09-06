import { describe, it, expect } from 'vitest';
import { esSerieDeAgujetas, serieAgregable } from './QuestionnaireChartsPanel';
import { QuestionnaireQuestion } from '../types';

const pregunta = (extra: Partial<QuestionnaireQuestion> = {}): QuestionnaireQuestion => ({
  id: 'q1', label: 'CUÁDRICEPS', type: 'scale', required: true, ...extra,
});

describe('esSerieDeAgujetas', () => {
  it('reconoce las series por su señal doms.<grupo>', () => {
    expect(esSerieDeAgujetas(pregunta({ signalKey: 'doms.cuadriceps' }), 'Lo que sea')).toBe(true);
  });

  it('reconoce los cuestionarios antiguos sin señal, por el título', () => {
    expect(esSerieDeAgujetas(pregunta(), 'DOM’s o "agujetas"')).toBe(true);
    expect(esSerieDeAgujetas(pregunta(), "DOM's o \"agujetas\"")).toBe(true);
    expect(esSerieDeAgujetas(pregunta(), 'Agujetas tras pierna')).toBe(true);
  });

  it('no esconde un cuestionario que solo CONTIENE esas letras', () => {
    expect(esSerieDeAgujetas(pregunta({ label: 'Ritmo' }), "Freedom's Reach")).toBe(false);
    expect(esSerieDeAgujetas(pregunta({ label: 'Ritmo' }), 'Sabiduría y wisdoms')).toBe(false);
  });

  it('no se lleva por delante otras series', () => {
    expect(esSerieDeAgujetas(pregunta({ label: 'Energía', signalKey: 'energia' }), 'Revisión semanal')).toBe(false);
    expect(esSerieDeAgujetas(pregunta({ label: 'Perímetro de abdomen' }), 'Mediciones')).toBe(false);
  });
});

describe('serieAgregable', () => {
  const resp = (fechas: string[]) => fechas.map((f, i) => ({
    id: `r${i}`, questionnaireId: 'q', assignmentId: 'a', athleteId: 'x@y.z',
    submittedAt: `${f}T10:00:00.000Z`, answers: [{ questionId: 'q1', value: i + 1 }],
  }));

  it('no hay media semanal cuando cae una respuesta por semana', () => {
    // Lunes de cuatro semanas seguidas.
    expect(serieAgregable('q1', resp(['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24']))).toBe(false);
  });

  it('sí la hay cuando dos respuestas caen en la misma semana', () => {
    expect(serieAgregable('q1', resp(['2026-08-03', '2026-08-05', '2026-08-10']))).toBe(true);
  });
});
