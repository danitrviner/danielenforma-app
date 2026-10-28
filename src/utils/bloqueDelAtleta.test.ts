import { describe, it, expect } from 'vitest';
import type { Mesocycle, WorkoutAssignment } from '../types';
import { addDays } from './trainingWeek';
import {
  vistaDelAtleta, mesoQueVeElAtleta, estadoDelMeso, sesionesQueEstorban, pendientesDesde, rangoDelMeso,
} from './bloqueDelAtleta';

// El caso real de Dani (28-10): «Hipertrofia 1» desde el lunes 19-10, 9 semanas
// de 5 sesiones, y las sesiones de un «Meso #1» que se borró pero cuyas
// asignaciones siguen ahí, de lunes a sábado hasta enero.
const H1: Mesocycle = {
  id: 'h1', athleteId: 'dani@enforma.app', number: 2, name: 'Hipertrofia 1', weeks: 9,
  startDate: '2026-10-19', objective: '', daysPerWeek: 5, groups: {} as Mesocycle['groups'],
};
const OFFSETS_H1 = [0, 1, 2, 4, 5];

function sesiones(mesoId: string, desde: string, semanas: number, offsets: number[], prefijo: string): WorkoutAssignment[] {
  const out: WorkoutAssignment[] = [];
  for (let s = 0; s < semanas; s++) {
    offsets.forEach((o, i) => out.push({
      id: `${prefijo}-${s}-${i}`, workoutId: `${prefijo}-w${i}`, athleteId: 'dani@enforma.app',
      date: addDays(desde, s * 7 + o), status: 'pending', mesocycleId: mesoId,
    }));
  }
  return out;
}

const DEL_H1 = sesiones('h1', '2026-10-19', 9, OFFSETS_H1, 'h1');
const DEL_BORRADO = sesiones('borrado', '2026-08-24', 20, [0, 1, 2, 3, 4, 5], 'm1');
const TODAS = [...DEL_H1, ...DEL_BORRADO];
const HOY = '2026-10-28';

describe('vistaDelAtleta', () => {
  it('con el bloque borrado cruzado, enseña Hipertrofia 1 semana 2 y cuenta las 6 de más', () => {
    const v = vistaDelAtleta(TODAS, [H1], HOY);
    expect(v.meso?.id).toBe('h1');
    expect(v.semana).toBe(2);
    expect(v.semanasTotal).toBe(9);
    expect(v.sesiones).toBe(5);
    expect(v.otras).toBe(6);
    expect(v.bloque?.inicio).toBe('2026-10-26');
    expect(v.bloque?.fin).toBe('2026-11-01');
  });

  it('cuando acaba el bloque, el atleta pasa a ver las sesiones sueltas del borrado', () => {
    const v = vistaDelAtleta(TODAS, [H1], '2026-12-22');
    expect(v.meso).toBeNull();
    expect(v.sesiones).toBe(6);
  });

  it('sin asignaciones no ve nada', () => {
    expect(vistaDelAtleta([], [H1], HOY)).toMatchObject({ bloque: null, meso: null, sesiones: 0 });
  });
});

describe('mesoQueVeElAtleta', () => {
  it('es el de la pantalla del atleta, no el último por fecha de inicio', () => {
    const H2: Mesocycle = { ...H1, id: 'h2', number: 3, name: 'Hipertrofia 2', startDate: '2026-12-21' };
    expect(mesoQueVeElAtleta(TODAS, [H1, H2], HOY)?.id).toBe('h1');
  });

  it('sin asignaciones, el que contiene hoy por fechas', () => {
    const viejo: Mesocycle = { ...H1, id: 'viejo', startDate: '2026-06-01', weeks: 4 };
    expect(mesoQueVeElAtleta([], [viejo, H1], HOY)?.id).toBe('h1');
  });
});

describe('estadoDelMeso', () => {
  it('borrador si no tiene ninguna sesión asignada', () => {
    expect(estadoDelMeso(H1, DEL_BORRADO, [H1], HOY)).toEqual({ tipo: 'borrador' });
  });

  it('en curso y visible, con su semana', () => {
    expect(estadoDelMeso(H1, TODAS, [H1], HOY)).toEqual({ tipo: 'en_curso', visible: true, semana: 2 });
  });

  it('programado si su primera sesión es futura', () => {
    const H2: Mesocycle = { ...H1, id: 'h2', startDate: '2026-11-02', weeks: 4 };
    const conH2 = [...TODAS, ...sesiones('h2', '2026-11-02', 4, OFFSETS_H1, 'h2')];
    expect(estadoDelMeso(H2, conH2, [H1, H2], HOY)).toEqual({ tipo: 'programado', desde: '2026-11-02', visible: false });
  });

  it('terminado cuando ha pasado su última semana, descanso incluido', () => {
    expect(estadoDelMeso(H1, DEL_H1, [H1], '2026-12-20')).toMatchObject({ tipo: 'en_curso' });
    expect(estadoDelMeso(H1, DEL_H1, [H1], '2026-12-21')).toMatchObject({ tipo: 'terminado', hasta: '2026-12-20' });
  });
});

describe('sesionesQueEstorban', () => {
  it('las del bloque borrado se cuentan todas desde el lunes de esta semana, también las de después de enero', () => {
    const g = sesionesQueEstorban(H1, TODAS, [H1], HOY);
    expect(g).toHaveLength(1);
    expect(g[0].mesocycleId).toBe('borrado');
    expect(g[0].meso).toBeNull();
    // 26 y 27 ya pasaron pero siguen pendientes: le salen en rojo esta semana.
    expect(g[0].asignaciones[0].date).toBe('2026-10-26');
    expect(g[0].asignaciones.every(a => a.date >= '2026-10-26' && a.status === 'pending')).toBe(true);
    expect(g[0].asignaciones.at(-1)?.date > rangoDelMeso(H1)!.hasta).toBe(true);
  });

  it('las de otro bloque vivo solo cuentan desde que empieza este', () => {
    const H2: Mesocycle = { ...H1, id: 'h2', name: 'Hipertrofia 2', startDate: '2026-11-09', weeks: 4 };
    const g = sesionesQueEstorban(H2, DEL_H1, [H1, H2], HOY);
    expect(g).toHaveLength(1);
    expect(g[0].meso?.id).toBe('h1');
    expect(g[0].asignaciones[0].date).toBe('2026-11-09');
  });

  it('no toca lo hecho ni lo de semanas anteriores', () => {
    const hecha: WorkoutAssignment = { ...DEL_BORRADO.find(a => a.date === '2026-10-29')!, status: 'completed' };
    const anterior = DEL_BORRADO.find(a => a.date === '2026-10-21')!;
    const g = sesionesQueEstorban(H1, [...DEL_H1, hecha, anterior], [H1], HOY);
    expect(g).toEqual([]);
  });
});

describe('pendientesDesde', () => {
  it('solo las pendientes del bloque de hoy en adelante', () => {
    const p = pendientesDesde('h1', TODAS, HOY);
    expect(p.every(a => a.mesocycleId === 'h1' && a.date >= HOY)).toBe(true);
    expect(p).toHaveLength(DEL_H1.filter(a => a.date >= HOY).length);
  });
});
