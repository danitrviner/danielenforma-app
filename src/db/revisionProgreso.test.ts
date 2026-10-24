import { describe, it, expect } from 'vitest';
import { progresoQueGana, idProgresoRevision } from './revisionProgreso';
import type { ProgresoRevision } from '../types';

const p = (actualizadoEn: string, nota: string): ProgresoRevision => ({
  id: 'a@a.com_2026-10-23', athleteId: 'a@a.com', ciclo: '2026-10-23', actualizadoEn,
  respuestas: { x: { stepIdx: 0, answers: { q: nota } } },
});

describe('progresoQueGana', () => {
  it('gana el más reciente y tolera que falte uno', () => {
    expect(progresoQueGana(p('2026-10-23T10:00:00Z', 'viejo'), p('2026-10-23T11:00:00Z', 'nuevo'))?.respuestas.x.answers.q).toBe('nuevo');
    expect(progresoQueGana(p('2026-10-23T12:00:00Z', 'remoto'), p('2026-10-23T11:00:00Z', 'local'))?.respuestas.x.answers.q).toBe('remoto');
    expect(progresoQueGana(null, p('2026-10-23T11:00:00Z', 'local'))?.respuestas.x.answers.q).toBe('local');
    expect(progresoQueGana(null, null)).toBeNull();
  });
  it('el id mezcla el email y el viernes del ciclo', () => {
    expect(idProgresoRevision('a@a.com', '2026-10-23')).toBe('a@a.com_2026-10-23');
  });
});
