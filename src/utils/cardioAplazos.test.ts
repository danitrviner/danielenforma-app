import { describe, it, expect } from 'vitest';
import type { CardioAplazo, CardioAssignment } from '../types';
import { aplicarAplazos, aplazadoHoy, mananaDe, resumenDeAplazos, nombreDeAsignacion } from './cardioAplazos';
import { pickActiveZona2Assignment } from './cardioSession';

const asg = (id: string, over: Partial<CardioAssignment> = {}): CardioAssignment => ({
  id, athleteId: 'a@b.c', type: 'zona2', active: true, createdAt: '2026-10-01T00:00:00Z', ...over,
});
const aplazo = (over: Partial<CardioAplazo> = {}): CardioAplazo => ({
  id: 'a@b.c_2026-10-22', athleteId: 'a@b.c', desde: '2026-10-22', hasta: '2026-10-23', createdAt: '2026-10-22T08:00:00Z', ...over,
});

describe('mananaDe', () => {
  it('pasa al día siguiente, también al cambiar de mes', () => {
    expect(mananaDe('2026-10-22')).toBe('2026-10-23');
    expect(mananaDe('2026-10-31')).toBe('2026-11-01');
  });
});

describe('aplicarAplazos', () => {
  it('sin aplazos no cambia nada', () => {
    const lista = [asg('p', { date: '2026-10-22' }), asg('r')];
    expect(aplicarAplazos(lista, [], '2026-10-22')).toEqual(lista);
  });
  it('una puntual aplazada hoy desaparece hoy y aparece mañana', () => {
    const lista = [asg('p', { date: '2026-10-22' })];
    const ap = [aplazo({ assignmentId: 'p' })];
    expect(pickActiveZona2Assignment(aplicarAplazos(lista, ap, '2026-10-22'), '2026-10-22')).toBeUndefined();
    expect(pickActiveZona2Assignment(aplicarAplazos(lista, ap, '2026-10-23'), '2026-10-23')?.id).toBe('p');
  });
  it('una recurrente aplazada solo se oculta el día aplazado', () => {
    const lista = [asg('r', { timesPerWeek: 3 })];
    const ap = [aplazo({ assignmentId: 'r' })];
    expect(aplicarAplazos(lista, ap, '2026-10-22')).toEqual([]);
    expect(aplicarAplazos(lista, ap, '2026-10-23')).toHaveLength(1);
  });
  it('un aplazo de otra asignación no toca las demás', () => {
    const lista = [asg('p', { date: '2026-10-22' }), asg('q', { date: '2026-10-22', type: 'intervalos' })];
    const r = aplicarAplazos(lista, [aplazo({ assignmentId: 'p' })], '2026-10-22');
    expect(r.find(x => x.id === 'q')?.date).toBe('2026-10-22');
    expect(r.find(x => x.id === 'p')?.date).toBe('2026-10-23');
  });
});

describe('aplazadoHoy', () => {
  it('detecta el aplazo cuyo origen es hoy', () => {
    expect(aplazadoHoy([aplazo()], '2026-10-22')).toBeTruthy();
    expect(aplazadoHoy([aplazo()], '2026-10-23')).toBeUndefined();
  });
});

describe('resumenDeAplazos', () => {
  const hoy = '2026-10-23';
  it('sin aplazos no hay nada que enseñar', () => {
    expect(resumenDeAplazos([], [], hoy)).toEqual({ total: 0, lineas: [] });
  });
  it('del más reciente al más antiguo, con el nombre de la prescripción', () => {
    const r = resumenDeAplazos(
      [aplazo({ id: 'x1', desde: '2026-10-15', hasta: '2026-10-16', assignmentId: 'z' }), aplazo({ id: 'x2', desde: '2026-10-22', hasta: '2026-10-23', assignmentId: 'z' })],
      [asg('z')],
      hoy,
    );
    expect(r.total).toBe(2);
    expect(r.lineas.map(l => l.id)).toEqual(['x2', 'x1']);
    expect(r.lineas[0]).toEqual({ id: 'x2', texto: 'jue 22 oct → vie 23 oct', nombre: 'Zona 2' });
  });
  it('si la prescripción ya no está (o no se sabe cuál), se enseña sin nombre', () => {
    const r = resumenDeAplazos([aplazo({ assignmentId: 'borrada' }), aplazo({ id: 'y', desde: '2026-10-20', hasta: '2026-10-21' })], [asg('z')], hoy);
    expect(r.lineas.every(l => l.nombre === undefined)).toBe(true);
    expect(r.total).toBe(2);
  });
  it('solo cuenta los últimos 30 días: el borde entra y lo anterior no', () => {
    const r = resumenDeAplazos(
      [aplazo({ id: 'borde', desde: '2026-09-23', hasta: '2026-09-24' }), aplazo({ id: 'viejo', desde: '2026-09-22', hasta: '2026-09-23' })],
      [],
      hoy,
    );
    expect(r.lineas.map(l => l.id)).toEqual(['borde']);
  });
});

describe('nombreDeAsignacion', () => {
  it('usa el tipo, y el programa si lo hay', () => {
    expect(nombreDeAsignacion(asg('a', { type: 'intervalos' }))).toBe('Intervalos');
    expect(nombreDeAsignacion(asg('b', { program: { kind: 'zona2', startDate: '2026-10-01' } as CardioAssignment['program'] }))).toBe('Zona 2 progresiva');
  });
});
