import { describe, it, expect } from 'vitest';
import { CoachClientTask } from '../types';
import {
  clasificarAviso, avisosActivos, cuentaUrgentes, claveDeAviso, diasHasta,
} from './avisosDelCoach';

const HOY = '2026-09-14';

const tarea = (id: string, dueDate?: string, done = false): CoachClientTask => ({
  id, athleteId: 'a@b.com', title: id, done, dueDate,
  createdBy: 'coach', createdAt: '2026-09-01T00:00:00.000Z',
});

describe('diasHasta', () => {
  it('cuenta días naturales en los dos sentidos', () => {
    expect(diasHasta(HOY, '2026-09-16')).toBe(2);
    expect(diasHasta(HOY, '2026-09-14')).toBe(0);
    expect(diasHasta(HOY, '2026-09-11')).toBe(-3);
  });

  it('no se despista con el cambio de mes', () => {
    expect(diasHasta('2026-08-30', '2026-09-02')).toBe(3);
  });
});

describe('clasificarAviso', () => {
  it('una tarea sin fecha no es un aviso', () => {
    expect(clasificarAviso(tarea('t'), HOY)).toBeNull();
  });

  it('una tarea HECHA deja de avisar aunque se haya pasado', () => {
    expect(clasificarAviso(tarea('t', '2026-09-01', true), HOY)).toBeNull();
  });

  it('habla en cristiano en vez de escupir la fecha', () => {
    expect(clasificarAviso(tarea('t', '2026-09-13'), HOY)?.texto).toBe('Se pasó ayer');
    expect(clasificarAviso(tarea('t', '2026-09-11'), HOY)?.texto).toBe('Se pasó hace 3 días');
    expect(clasificarAviso(tarea('t', HOY), HOY)?.texto).toBe('Hoy');
    expect(clasificarAviso(tarea('t', '2026-09-15'), HOY)?.texto).toBe('Mañana');
    expect(clasificarAviso(tarea('t', '2026-09-17'), HOY)?.texto).toBe('En 3 días');
  });

  it('lo de dentro de tres semanas es una nota, no un aviso', () => {
    expect(clasificarAviso(tarea('t', '2026-10-05'), HOY)?.estado).toBe('lejano');
  });
});

describe('avisosActivos', () => {
  const lista = [
    tarea('lejana', '2026-10-30'),
    tarea('manana', '2026-09-15'),
    tarea('vencida', '2026-09-05'),
    tarea('hoy', HOY),
    tarea('sin_fecha'),
    tarea('hecha', '2026-09-01', true),
  ];

  it('ordena de lo más pasado a lo más lejano', () => {
    expect(avisosActivos(lista, HOY).map(a => a.tarea.id)).toEqual(['vencida', 'hoy', 'manana']);
  });

  it('deja fuera lo lejano, lo hecho y lo que no tiene fecha', () => {
    const ids = avisosActivos(lista, HOY).map(a => a.tarea.id);
    expect(ids).not.toContain('lejana');
    expect(ids).not.toContain('hecha');
    expect(ids).not.toContain('sin_fecha');
  });
});

describe('cuentaUrgentes', () => {
  it('solo cuenta lo vencido y lo de hoy: mañana todavía no urge', () => {
    expect(cuentaUrgentes([
      tarea('a', '2026-09-05'), tarea('b', HOY), tarea('c', '2026-09-15'),
    ], HOY)).toBe(2);
  });

  it('cero sin nada que hacer', () => {
    expect(cuentaUrgentes([tarea('a'), tarea('b', '2026-09-01', true)], HOY)).toBe(0);
  });
});

describe('claveDeAviso', () => {
  it('lleva la fecha de VENCIMIENTO, para no crear un aviso nuevo cada día', () => {
    const t = tarea('t1', '2026-09-20');
    expect(claveDeAviso(t)).toBe('notif_task_t1_2026-09-20');
    // La clave no depende de hoy: abrir la app tres días seguidos da la misma.
    expect(claveDeAviso(t)).toBe(claveDeAviso(t));
  });

  it('cambia si el coach mueve la fecha — ese sí es un aviso nuevo', () => {
    expect(claveDeAviso(tarea('t1', '2026-09-20')))
      .not.toBe(claveDeAviso(tarea('t1', '2026-09-27')));
  });
});
