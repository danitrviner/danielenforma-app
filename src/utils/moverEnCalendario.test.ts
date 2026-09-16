import { describe, it, expect } from 'vitest';
import { moviblesDelDia, ordenDeMovimiento, Movible } from './moverEnCalendario';
import type { Mesocycle, TaskItem, WorkoutAssignment } from '../types';
import type { PlanEvent } from './planEvents';

const ASIGNACION = { id: 'wa1', athleteId: 'ana@x.com', workoutId: 'w1', date: '2026-09-14', status: 'pending' } as WorkoutAssignment;

const HITO = {
  id: 't1', athleteId: 'ana@x.com', type: 'revision', title: 'Check-in',
  dueDate: '2026-09-14', status: 'pending', createdBy: 'coach', createdAt: '2026-09-01T00:00:00.000Z',
} as TaskItem;

const EVENTO = {
  id: 'pe1', date: '2026-09-14', title: 'Subir series de press', kind: 'volumen', status: 'programado',
  moveRef: { workoutId: 'w1', exerciseId: 'e1', atWeek: 3, mesocycleId: 'm1' },
} as unknown as PlanEvent;

const MESO = { id: 'm1', startDate: '2026-09-01', daysPerWeek: 4 } as Mesocycle;

const CTX = { fechaOrigen: '2026-09-14', volumeEvents: [EVENTO], mesocycles: [MESO] };

describe('moviblesDelDia', () => {
  it('devuelve lo que hay en ese día, y en el orden de prioridad de la celda', () => {
    const r = moviblesDelDia({
      fecha: '2026-09-14', workoutAssignments: [ASIGNACION], tasks: [HITO], volumeEvents: [EVENTO],
    });
    expect(r.map(m => m.tipo)).toEqual(['entreno', 'hito', 'volumen']);
    expect(r[1].etiqueta).toBe('Check-in');
  });

  it('un día vacío no tiene nada que mover', () => {
    const r = moviblesDelDia({
      fecha: '2026-09-20', workoutAssignments: [ASIGNACION], tasks: [HITO], volumeEvents: [EVENTO],
    });
    expect(r).toEqual([]);
  });

  it('un evento de volumen sin `moveRef` no se ofrece: no hay regla que reescribir', () => {
    const suelto = { ...EVENTO, moveRef: undefined } as PlanEvent;
    const r = moviblesDelDia({ fecha: '2026-09-14', workoutAssignments: [], tasks: [], volumeEvents: [suelto] });
    expect(r).toEqual([]);
  });
});

describe('ordenDeMovimiento', () => {
  const entreno: Movible = { tipo: 'entreno', id: 'wa1', etiqueta: 'Entreno' };
  const hito: Movible = { tipo: 'hito', id: 't1', etiqueta: 'Check-in' };
  const volumen: Movible = { tipo: 'volumen', id: 'pe1', etiqueta: 'Subir series' };

  it('el entreno y el hito viajan por fecha', () => {
    expect(ordenDeMovimiento(entreno, '2026-09-16', CTX)).toEqual({ tipo: 'entreno', assignmentId: 'wa1', fecha: '2026-09-16' });
    expect(ordenDeMovimiento(hito, '2026-09-16', CTX)).toEqual({ tipo: 'hito', taskId: 't1', fecha: '2026-09-16' });
  });

  it('mover al mismo día no es mover', () => {
    expect(ordenDeMovimiento(entreno, '2026-09-14', CTX)).toBeNull();
    expect(ordenDeMovimiento(volumen, '2026-09-14', CTX)).toBeNull();
  });

  it('una fecha que no es de calendario real no mueve nada', () => {
    // El campo de fecha de escritorio admite años de cinco cifras.
    expect(ordenDeMovimiento(entreno, '20026-03-01', CTX)).toBeNull();
    expect(ordenDeMovimiento(volumen, '20026-03-01', CTX)).toBeNull();
    expect(ordenDeMovimiento(hito, '2026-02-30', CTX)).toBeNull();
  });

  it('sin fecha de destino no hace nada', () => {
    expect(ordenDeMovimiento(entreno, '', CTX)).toBeNull();
  });

  it('el volumen no cambia de fecha: reescribe la semana de la regla', () => {
    // El meso empieza el 1-sep con ciclo de 7 días; el 29-sep cae en la semana 5.
    expect(ordenDeMovimiento(volumen, '2026-09-29', CTX)).toEqual({
      tipo: 'volumen', workoutId: 'w1', exerciseId: 'e1', semanaVieja: 3, semanaNueva: 5,
    });
  });

  it('mover el volumen dentro de su misma semana no es mover nada', () => {
    // El 17-sep sigue siendo la semana 3 del bloque, igual que el 14.
    expect(ordenDeMovimiento(volumen, '2026-09-17', CTX)).toBeNull();
  });

  it('sin el mesociclo de la regla no se inventa una semana', () => {
    expect(ordenDeMovimiento(volumen, '2026-09-29', { ...CTX, mesocycles: [] })).toBeNull();
  });

  it('un movible de volumen que ya no está en la lista de eventos se descarta', () => {
    expect(ordenDeMovimiento(volumen, '2026-09-29', { ...CTX, volumeEvents: [] })).toBeNull();
  });
});
