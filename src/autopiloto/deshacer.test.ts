import { describe, it, expect } from 'vitest';
import { planDeDeshacer, coleccionesDe } from './deshacer';
import type { AiProposal } from '../types';

const base: AiProposal = { id: 'p', athleteId: 'a@x.com', kind: 'diet', status: 'approved', chatId: 'c', summary: 'Dieta', rationale: '', payload: {} as never, createdAt: '2026-10-29T10:00:00.000Z' };

describe('planDeDeshacer', () => {
  it('sin snapshot no hay deshacer, y se explica (propuestas anteriores al 28-10)', () => {
    expect(planDeDeshacer(base)).toEqual({ ok: false, motivo: expect.stringMatching(/anterior al 28-10-2026/) });
  });

  it('solo se deshace lo aplicado', () => {
    expect(planDeDeshacer({ ...base, status: 'proposed', snapshotAntes: [{ coleccion: 'diets', id: 'd', datos: {} }] }).ok).toBe(false);
    expect(planDeDeshacer({ ...base, status: 'deshecha', snapshotAntes: [{ coleccion: 'diets', id: 'd', datos: {} }] }).ok).toBe(false);
  });

  it('devuelve las fotos en orden inverso y un resumen en castellano', () => {
    const r = planDeDeshacer({ ...base, status: 'aplicada', snapshotAntes: [
      { coleccion: 'workouts', id: 'w0', datos: { name: 'Torso' } },
      { coleccion: 'workouts', id: 'w2', datos: null },
      { coleccion: 'workoutAssignments', id: 'as9', datos: null },
    ] });
    if (r.ok === false) throw new Error(r.motivo);
    expect(r.fotos.map(f => f.id)).toEqual(['as9', 'w2', 'w0']);
    expect(r.resumen).toBe('1 documento vuelve a como estaba · 2 creados se borran');
    expect(coleccionesDe(r.fotos)).toEqual(['workoutAssignments', 'workouts']);
  });
});
