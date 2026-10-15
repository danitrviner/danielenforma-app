import { describe, it, expect } from 'vitest';
import type { Questionnaire, QuestionnaireQuestion, QuestionnaireResponse } from '../types';
import { agujetasPorGrupo, ultimasMediciones, gruposMasCargados, fechasDeMedicion } from './agujetasConjuntas';

const preg = (id: string, label: string, signalKey?: string): QuestionnaireQuestion =>
  ({ id, label, type: 'scale', signalKey } as QuestionnaireQuestion);
const cuest = (id: string, title: string, questions: QuestionnaireQuestion[]): Questionnaire =>
  ({ id, title, questions } as Questionnaire);
const resp = (qid: string, fecha: string, answers: [string, number][]): QuestionnaireResponse =>
  ({ id: `${qid}-${fecha}`, questionnaireId: qid, athleteId: 'a', submittedAt: `${fecha}T10:00:00Z`,
     answers: answers.map(([questionId, value]) => ({ questionId, value })) } as QuestionnaireResponse);

describe('agujetasPorGrupo', () => {
  it('une por grupo aunque el cuestionario se haya recreado con otros ids', () => {
    const viejo = cuest('q1', 'Agujetas', [preg('x1', 'Cuádriceps', 'doms.cuadriceps')]);
    const nuevo = cuest('q2', 'Agujetas', [preg('y9', 'Cuádriceps', 'doms.cuadriceps')]);
    const s = agujetasPorGrupo([viejo, nuevo], [
      resp('q1', '2026-09-01', [['x1', 3]]),
      resp('q2', '2026-09-15', [['y9', 6]]),
    ]);
    expect(s).toHaveLength(1);
    expect(s[0].grupo).toBe('cuadriceps');
    expect(s[0].puntos.map(p => p.date)).toEqual(['2026-09-01', '2026-09-15']);
    expect(s[0].ultimo).toBe(6);
  });

  it('reconoce los cuestionarios viejos sin señal por el título y la etiqueta', () => {
    const q = cuest('q', "DOM's", [preg('a', 'Isquiotibiales'), preg('b', 'Energía')]);
    const s = agujetasPorGrupo([q], [resp('q', '2026-09-01', [['a', 4], ['b', 7]])]);
    expect(s.map(x => x.grupo)).toEqual(['isquios']);
  });

  it('ignora cuestionarios que no son de agujetas y promedia el mismo día', () => {
    const q = cuest('q', 'Revisión semanal', [preg('a', 'Cuádriceps')]);
    expect(agujetasPorGrupo([q], [resp('q', '2026-09-01', [['a', 4]])])).toEqual([]);
    const d = cuest('d', 'Agujetas', [preg('a', 'Cuádriceps', 'doms.cuadriceps')]);
    const s = agujetasPorGrupo([d], [resp('d', '2026-09-01', [['a', 2]]), resp('d', '2026-09-01', [['a', 4]])]);
    expect(s[0].puntos).toEqual([{ date: '2026-09-01', value: 3 }]);
  });
});

describe('ventana de mediciones', () => {
  const d = cuest('d', 'Agujetas', [preg('a', 'Cuádriceps', 'doms.cuadriceps'), preg('b', 'Isquios', 'doms.isquios')]);
  const respuestas = ['01', '08', '15', '22', '29'].map((dia, i) =>
    resp('d', `2026-09-${dia}`, [['a', i], ...(i % 2 === 0 ? ([['b', 5]] as [string, number][]) : [])]));
  const series = agujetasPorGrupo([d], respuestas);

  it('las últimas N mediciones valen para todas las series a la vez', () => {
    expect(fechasDeMedicion(series)).toHaveLength(5);
    const t = ultimasMediciones(series, 2);
    expect(t.find(s => s.grupo === 'cuadriceps')!.puntos.map(p => p.date)).toEqual(['2026-09-22', '2026-09-29']);
    // Isquios solo respondió el 29 en esa ventana.
    expect(t.find(s => s.grupo === 'isquios')!.puntos.map(p => p.date)).toEqual(['2026-09-29']);
  });

  it('0 y N mayor que el historial devuelven todo', () => {
    expect(ultimasMediciones(series, 0)).toBe(series);
    expect(ultimasMediciones(series, 99)[0].puntos).toHaveLength(5);
  });

  it('elige los grupos con más agujetas ahora', () => {
    expect(gruposMasCargados(series, 1)).toEqual(['isquios']);
  });
});
