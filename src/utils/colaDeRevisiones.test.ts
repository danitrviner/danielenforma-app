import { describe, it, expect } from 'vitest';
import { colaDeRevisiones, sinResponderDosCiclos } from './colaDeRevisiones';
import type { UserProfile } from '../types';

const atleta = (email: string, extra: Partial<UserProfile> = {}) =>
  ({ email, displayName: email, userId: email, planStartDate: '2026-08-01', ...extra }) as UserProfile;
const plantillas = [{ questions: [
  { id: 'ag', signalKey: 'agujetas.biceps' }, { id: 'mo', signalKey: 'alerta.molestia' }, { id: 'ad', signalKey: 'adherencia.entrenos' },
] }] as never;

// 2026-10-26 lunes · 2026-10-27 martes.
describe('colaDeRevisiones', () => {
  it('solo los que se revisan hoy y ordenados por prioridad', () => {
    const cola = colaDeRevisiones({
      hoy: '2026-10-26', soloHoy: true, questionnaires: plantillas,
      atletas: [atleta('a@x'), atleta('b@x'), atleta('c@x', { diaRevision: 2 })],
      responses: [
        { athleteId: 'a@x', questionnaireId: 'q', submittedAt: '2026-10-24T10:00:00Z', answers: [{ questionId: 'ad', value: 4 }] },
        { athleteId: 'b@x', questionnaireId: 'q', submittedAt: '2026-10-25T10:00:00Z', answers: [{ questionId: 'ag', value: 5 }, { questionId: 'mo', value: true }] },
        { athleteId: 'a@x', questionnaireId: 'q', submittedAt: '2026-10-17T10:00:00Z', answers: [] },
        { athleteId: 'b@x', questionnaireId: 'q', submittedAt: '2026-10-17T10:00:00Z', answers: [] },
      ],
    });
    expect(cola.map(f => f.atleta.email)).toEqual(['b@x', 'a@x']);
    expect(cola[0].avisos.map(a => a.clave)).toEqual(['molestia', 'agujetas']);
    expect(cola[1].avisos).toEqual([]);
  });

  it('sin enviar y riesgo de abandono tras dos ciclos en blanco', () => {
    const cola = colaDeRevisiones({
      hoy: '2026-10-26', soloHoy: true, questionnaires: plantillas,
      atletas: [atleta('a@x')], responses: [],
    });
    expect(cola[0].enviada).toBe(false);
    expect(cola[0].riesgoAbandono).toBe(true);
    expect(cola[0].avisos[0].clave).toBe('abandono');
  });

  it('en pausa no sale', () => {
    const cola = colaDeRevisiones({
      hoy: '2026-10-26', soloHoy: true, questionnaires: plantillas,
      atletas: [atleta('a@x', { pausaRevisiones: { desde: '2026-10-20', hasta: '2026-11-02' } })], responses: [],
    });
    expect(cola).toHaveLength(0);
  });

  it('un atleta recién llegado no está en riesgo', () => {
    expect(sinResponderDosCiclos([], '2026-10-23', '2026-10-15')).toBe(false);
  });
});
