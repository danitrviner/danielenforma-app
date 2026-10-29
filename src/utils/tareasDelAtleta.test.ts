import { describe, it, expect } from 'vitest';
import { tareasVigentes, DIAS_CADUCIDAD_TAREA_DE_CICLO } from './tareasDelAtleta';
import type { TaskItem } from '../types';

const HOY = '2026-10-28';
const tarea = (p: Partial<TaskItem>): TaskItem => ({
  id: 'x', athleteId: 'a@x.com', type: 'manual', title: 't', status: 'pending', createdBy: 'coach', createdAt: '', ...p,
});

describe('tareasVigentes', () => {
  it('una revisión vencida hace semanas caduca sola', () => {
    expect(tareasVigentes([tarea({ type: 'revision', dueDate: '2026-09-27' })], HOY)).toEqual([]);
  });
  it('una revisión de hace pocos días sigue', () => {
    const t = tarea({ type: 'revision', dueDate: '2026-10-25' });
    expect(tareasVigentes([t], HOY)).toEqual([t]);
  });
  it('justo en el límite todavía se enseña', () => {
    const t = tarea({ type: 'cuestionario', dueDate: `2026-10-${28 - DIAS_CADUCIDAD_TAREA_DE_CICLO}` });
    expect(tareasVigentes([t], HOY)).toEqual([t]);
  });
  it('las manuales del coach no caducan aunque estén vencidas', () => {
    const t = tarea({ type: 'manual', dueDate: '2026-08-01' });
    expect(tareasVigentes([t], HOY)).toEqual([t]);
  });
  it('las hechas no salen', () => {
    expect(tareasVigentes([tarea({ status: 'done' })], HOY)).toEqual([]);
  });
  it('sin fecha, una de ciclo se queda', () => {
    const t = tarea({ type: 'revision' });
    expect(tareasVigentes([t], HOY)).toEqual([t]);
  });
});
