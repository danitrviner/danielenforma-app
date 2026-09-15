import { describe, it, expect } from 'vitest';
import { CoachClientTask } from '../types';
import { SetupItem, SetupResult, SetupStatus } from './clientSetup';
import { PASOS_DEL_RECORRIDO, idDePaso } from './recorridoDelPlan';
import { construirRecorrido, estadoDeItems, tareaDePaso } from './implantacion';

const item = (id: string, status: SetupStatus, detail?: string): SetupItem =>
  ({ id, phase: 'programacion', title: id, status, detail }) as SetupItem;

/** Un `SetupResult` mínimo con los ítems que hagan falta. */
function resultado(items: SetupItem[]): SetupResult {
  return {
    phases: [{ id: 'programacion', title: 'P', items, donePct: 0 }],
    alerts: [], globalPct: 0, attentionCount: 0, nextStep: null,
  } as SetupResult;
}

const tarea = (itemId: string, done: boolean, dueDate?: string): CoachClientTask => ({
  id: `t_${itemId}`, athleteId: 'a@b.com', itemId, title: itemId, done,
  createdBy: 'seed', createdAt: '2026-09-01T00:00:00.000Z', dueDate,
});

describe('estadoDeItems', () => {
  it('hecho solo si TODOS lo están', () => {
    expect(estadoDeItems([item('a', 'done'), item('b', 'done')])).toBe('done');
    expect(estadoDeItems([item('a', 'done'), item('b', 'pending')])).toBe('pending');
  });

  it('«atención» gana a «pendiente»: algo puesto y mal urge más que algo sin poner', () => {
    expect(estadoDeItems([item('a', 'pending'), item('b', 'attention')])).toBe('attention');
    expect(estadoDeItems([item('a', 'done'), item('b', 'attention')])).toBe('attention');
  });

  it('los «no aplica» no cuentan, y si todos lo son el paso tampoco aplica', () => {
    expect(estadoDeItems([item('a', 'done'), item('b', 'na')])).toBe('done');
    expect(estadoDeItems([item('a', 'na'), item('b', 'na')])).toBe('na');
    expect(estadoDeItems([])).toBe('na');
  });
});

describe('construirRecorrido', () => {
  it('devuelve los seis bloques con todos sus pasos', () => {
    const r = construirRecorrido(resultado([]), []);
    expect(r.bloques.map(b => b.id)).toEqual(
      ['alta', 'entrenamiento', 'nutricion', 'configuracion', 'roadmap', 'cierre'],
    );
    expect(r.bloques.flatMap(b => b.pasos)).toHaveLength(PASOS_DEL_RECORRIDO.length);
  });

  it('un paso con rastro comprobable NO se marca a mano: lo dicen los datos', () => {
    const r = construirRecorrido(resultado([item('prog_mesociclo', 'done')]), []);
    const meso = r.bloques.flatMap(b => b.pasos).find(p => p.paso.numero === '1')!;
    expect(meso.manual).toBe(false);
    expect(meso.estado).toBe('done');
  });

  it('un paso sin rastro se marca a mano y recuerda que se marcó', () => {
    const paso17 = PASOS_DEL_RECORRIDO.find(p => p.numero === '17')!;
    const sinMarcar = construirRecorrido(resultado([]), []);
    expect(sinMarcar.bloques.flatMap(b => b.pasos).find(p => p.paso.numero === '17')!)
      .toMatchObject({ manual: true, estado: 'pending' });

    const marcado = construirRecorrido(resultado([]), [tarea(idDePaso(paso17), true)]);
    expect(marcado.bloques.flatMap(b => b.pasos).find(p => p.paso.numero === '17')!.estado).toBe('done');
  });

  it('junta el detalle de sus ítems para no tener que abrir el editor a comprobar', () => {
    const r = construirRecorrido(resultado([item('prog_calendario_dietas', 'attention', '4/7 días')]), []);
    const paso = r.bloques.flatMap(b => b.pasos).find(p => p.paso.numero === '8')!;
    expect(paso.detalle).toBe('4/7 días');
    expect(paso.estado).toBe('attention');
  });

  it('«siguiente» apunta a lo que reclama atención antes que a lo que falta', () => {
    const r = construirRecorrido(resultado([
      item('prog_mesociclo', 'pending'),
      item('prog_periodizacion', 'attention'),
    ]), []);
    expect(r.siguiente?.paso.numero).toBe('4'); // periodización, aunque va después
  });

  it('sin nada que reclame atención, «siguiente» es el primer pendiente en orden', () => {
    const r = construirRecorrido(resultado([
      item('prog_mesociclo', 'done'),
      item('prog_entrenos_semana', 'pending'),
    ]), []);
    expect(r.siguiente?.paso.numero).toBe('0'); // el repaso del alta va antes
  });

  it('el porcentaje no cuenta los «no aplica» ni divide por cero', () => {
    const vacio = construirRecorrido(resultado([]), []);
    expect(Number.isFinite(vacio.pct)).toBe(true);
    expect(vacio.pct).toBeGreaterThanOrEqual(0);
    expect(vacio.pct).toBeLessThanOrEqual(100);
    expect(vacio.bloques.every(b => b.donePct >= 0 && b.donePct <= 100)).toBe(true);
  });

  it('trae la fecha del aviso que el coach se puso', () => {
    const paso17 = PASOS_DEL_RECORRIDO.find(p => p.numero === '17')!;
    const r = construirRecorrido(resultado([]), [tarea(idDePaso(paso17), false, '2026-09-30')]);
    expect(r.bloques.flatMap(b => b.pasos).find(p => p.paso.numero === '17')!.aviso).toBe('2026-09-30');
  });
});

describe('tareaDePaso', () => {
  it('empareja por el id estable del paso, no por el título', () => {
    const paso = PASOS_DEL_RECORRIDO[0];
    const t = tarea(idDePaso(paso), false);
    expect(tareaDePaso([t], paso)).toBe(t);
    expect(tareaDePaso([tarea('otra_cosa', false)], paso)).toBeUndefined();
  });
});
