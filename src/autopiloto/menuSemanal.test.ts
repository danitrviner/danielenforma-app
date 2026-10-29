import { describe, it, expect } from 'vitest';
import { menusQuePublicar, planDePublicacion, HORAS_DE_BORRADOR } from './menuSemanal';
import type { WeeklyMenu } from '../types';

const AHORA = '2026-10-26T02:00:00.000Z'; // lunes 02:00, el latido
const menu = (p: Partial<WeeklyMenu>): WeeklyMenu => ({
  id: 'm', athleteId: 'a@x.com', status: 'draft', name: 'Menú semana 7 · generado solo', createdAt: '2026-10-24T10:00:00.000Z',
  varietyLevel: 3, days: [], swapHistory: [], semanaPrograma: 7, ...p,
} as WeeklyMenu);

describe('menusQuePublicar', () => {
  it('con política «borrador» nunca publica nada', () => {
    expect(menusQuePublicar([menu({})], { menuAutomatico: 'borrador' }, AHORA)).toEqual([]);
  });
  it('con «borrador24h» publica el generado solo que lleva más de 24 h sin tocar, y no uno de hace 3 h', () => {
    const sabado = menu({ id: 'viejo', createdAt: '2026-10-24T10:00:00.000Z' });
    const reciente = menu({ id: 'nuevo', createdAt: '2026-10-25T23:30:00.000Z', semanaPrograma: 8 });
    expect(menusQuePublicar([sabado, reciente], { menuAutomatico: 'borrador24h' }, AHORA).map(m => m.id)).toEqual(['viejo']);
    expect(HORAS_DE_BORRADOR).toBe(24);
  });
  it('un borrador que Dani renombró ya no es automático; un publicado tampoco cuenta', () => {
    expect(menusQuePublicar([menu({ name: 'Semana 7 ajustada' }), menu({ status: 'published' })], { menuAutomatico: 'publicar' }, AHORA)).toEqual([]);
  });
  it('con «publicar» no espera, y de dos semanas se queda con la más avanzada', () => {
    const s7 = menu({ id: 's7', createdAt: '2026-10-26T01:00:00.000Z', semanaPrograma: 7 });
    const s8 = menu({ id: 's8', createdAt: '2026-10-26T01:30:00.000Z', semanaPrograma: 8 });
    expect(menusQuePublicar([s7, s8], { menuAutomatico: 'publicar' }, AHORA).map(m => m.id)).toEqual(['s8']);
  });
});

describe('planDePublicacion', () => {
  it('archiva el publicado anterior y borra los archivados de hace más de 4 semanas', () => {
    const nuevo = menu({ id: 'nuevo' });
    const todos = [nuevo, menu({ id: 'pub', status: 'published' }), menu({ id: 'arch_viejo', status: 'archived', createdAt: '2026-08-01T00:00:00.000Z' }), menu({ id: 'arch_reciente', status: 'archived', createdAt: '2026-10-20T00:00:00.000Z' })];
    expect(planDePublicacion(nuevo, todos, AHORA)).toEqual({ publicar: { id: 'nuevo', publishedAt: AHORA }, archivar: ['pub'], borrar: ['arch_viejo'] });
  });
});
