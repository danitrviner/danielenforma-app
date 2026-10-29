import { describe, it, expect } from 'vitest';
import type { AiProposal, Mesocycle } from '../types';
import type { Episodio } from './episodios';
import { construirLineaDeTiempo, desenlaceDe, semanaDelPlan, autorDelPaso, textoDeAutor } from './lineaDeTiempo';

/* La línea de tiempo de un atleta con un alta, una semana nueva automática,
   una molestia escalada y una propuesta del chat. Lo que se comprueba: una
   entrada por episodio con sus decisiones y desenlace, las sueltas aparte, el
   orden (lo más reciente primero), los recuentos y «plan inicial vs ahora». */

const prop = (id: string, p: Partial<AiProposal>): AiProposal => ({
  id, athleteId: 'ana@x.com', kind: 'diet', status: 'proposed', chatId: 'c', createdAt: '2026-10-06T10:00:00.000Z',
  summary: `S ${id}`, rationale: '', payload: {} as never, ...p,
} as AiProposal);
const ep = (id: string, e: Partial<Episodio>): Episodio => ({
  id, tipo: 'semana_nueva', athleteId: 'ana@x.com', disparador: { fuente: 'latido', fecha: '2026-10-13' }, estado: 'hecho',
  prioridad: 5, politica: 'automatico', ronda: 1, propuestas: [], paraDani: '', coste: { usd: 0.2, llamadas: 2, modelo: 'm' },
  creadoEn: '2026-10-13T06:00:00.000Z', actualizadoEn: '2026-10-13T06:01:00.000Z', ...e,
});

const MESO_PROPUESTO = { number: 1, weeks: 12, daysPerWeek: 4, startDate: '2026-10-06', objective: 'H', groups: { gluteo: { series: 6 } } };
const MESO_REAL = { id: 'm1', athleteId: 'ana@x.com', ...MESO_PROPUESTO, groups: { gluteo: { series: 0 } } } as unknown as Mesocycle;

const PROPUESTAS: AiProposal[] = [
  prop('alta_meso', { kind: 'mesocycle', status: 'approved', episodioId: 'ep_alta', politica: 'proponer', reviewedAt: '2026-10-06T12:00:00.000Z', resultEntityId: 'm1', payload: MESO_PROPUESTO as never, expediente: { datos: '', huecos: '', preguntas: [], esperado: '', notaAlAprobar: 'glúteo fuera' } }),
  prop('alta_dieta', { kind: 'diet', status: 'approved', episodioId: 'ep_alta', politica: 'proponer', reviewedAt: '2026-10-06T12:01:00.000Z' }),
  prop('menu_s2', { kind: 'weeklyChallenge', status: 'aplicada', episodioId: 'ep_s2', politica: 'automatico', aplicadaEn: '2026-10-13T06:01:00.000Z', autor: 'asistente', resultado: { comprobadoEn: '2026-10-20T06:00:00.000Z', cumplioEsperado: true, nota: 'registró 6 días' }, cambios: ['Reto: 4 de 4 sesiones'] }),
  prop('dolor_cambio', { kind: 'workoutDays', status: 'rejected', episodioId: 'ep_dolor', politica: 'proponer', reviewedAt: '2026-10-22T18:00:00.000Z' }),
  prop('chat_kcal', { kind: 'diet', status: 'approved', politica: 'proponer', reviewedAt: '2026-10-27T18:00:00.000Z', autor: 'asistente' }),
  prop('latido_1', { kind: 'latido', status: 'aplicada', autor: 'latido', politica: 'automatico', aplicadaEn: '2026-10-15T05:00:00.000Z' }),
  prop('latido_2', { kind: 'latido', status: 'aplicada', autor: 'latido', politica: 'automatico', aplicadaEn: '2026-10-15T05:00:01.000Z' }),
];
const EPISODIOS: Episodio[] = [
  ep('ep_alta', { tipo: 'alta_completada', disparador: { fuente: 'onboarding', fecha: '2026-10-06' }, estado: 'hecho', politica: 'proponer', propuestas: ['alta_meso', 'alta_dieta'], paraDani: 'Plan montado.' }),
  ep('ep_s2', { tipo: 'semana_nueva', disparador: { fuente: 'latido', fecha: '2026-10-13' }, propuestas: ['menu_s2'] }),
  ep('ep_dolor', { tipo: 'dolor', disparador: { fuente: 'questionnaireResponses', fecha: '2026-10-22' }, estado: 'escalado', politica: 'proponer', propuestas: ['dolor_cambio'], alertas: ['molestia hombro'], paraDani: 'Hombro: te lo paso.' }),
];

describe('construirLineaDeTiempo', () => {
  const linea = construirLineaDeTiempo(EPISODIOS, PROPUESTAS, { inicioPlan: '2026-10-06', mesociclos: [MESO_REAL], dietas: [] });

  it('una entrada por episodio, las sueltas aparte y el latido agrupado por día, lo más reciente primero', () => {
    expect(linea.entradas.map(e => e.id)).toEqual(['p_chat_kcal', 'ep_dolor', 'latido_2026-10-15', 'ep_s2', 'ep_alta']);
    expect(linea.episodios).toBe(3);
    expect(linea.entradas.find(e => e.id === 'latido_2026-10-15')!.decisiones).toHaveLength(2);
  });
  it('numera la semana del plan y lleva etiqueta, estado, alertas y coste', () => {
    const dolor = linea.entradas.find(e => e.id === 'ep_dolor')!;
    expect(dolor).toMatchObject({ semana: 3, etiqueta: 'molestia', estado: 'escalado', alertas: ['molestia hombro'], costeUsd: 0.2 });
    expect(linea.entradas.find(e => e.id === 'ep_alta')!.semana).toBe(1);
  });
  it('cada decisión dice cómo acabó y si cumplió lo esperado', () => {
    const s2 = linea.entradas.find(e => e.id === 'ep_s2')!.decisiones[0];
    expect(s2).toMatchObject({ desenlace: 'automatico', esperado: true, nota: 'registró 6 días', cambios: ['Reto: 4 de 4 sesiones'] });
    const meso = linea.entradas.find(e => e.id === 'ep_alta')!.decisiones.find(d => d.proposalId === 'alta_meso')!;
    expect(meso).toMatchObject({ desenlace: 'editada', esperado: null, nota: 'glúteo fuera' });
    expect(linea.porDesenlace).toEqual({ editada: 1, aprobada: 2, automatico: 3, rechazada: 1 });
    expect(linea.esperado).toEqual({ comprobadas: 1, cumplidas: 1 });
  });
  it('«plan inicial vs ahora» sale de las propuestas del alta', () => {
    expect(linea.derivasDelAlta).toHaveLength(1);
    expect(linea.derivasDelAlta[0].cambios.join(' ')).toMatch(/gluteo 6 → 0 series/);
  });
  it('sin inicio del plan no numera semanas; sin mesociclos no calcula derivas', () => {
    const sin = construirLineaDeTiempo(EPISODIOS, PROPUESTAS);
    expect(sin.entradas.every(e => e.semana === undefined)).toBe(true);
    expect(sin.derivasDelAlta).toEqual([]);
  });
});

describe('desenlaceDe y semanaDelPlan', () => {
  it('traduce el estado y la política a una palabra', () => {
    expect(desenlaceDe(prop('a', { status: 'aplicada', politica: 'aviso' }))).toBe('aviso');
    expect(desenlaceDe(prop('a', { status: 'aplicada', politica: 'automatico' }))).toBe('automatico');
    expect(desenlaceDe(prop('a', { status: 'approved' }), new Set(['a']))).toBe('editada');
    expect(desenlaceDe(prop('a', { status: 'approved' }))).toBe('aprobada');
    expect(desenlaceDe(prop('a', { status: 'sombra' }))).toBe('sombra');
    expect(desenlaceDe(prop('a', { status: 'proposed' }))).toBe('pendiente');
  });
  it('la semana 1 es la del inicio; antes del inicio no hay semana', () => {
    expect(semanaDelPlan('2026-10-06', '2026-10-06')).toBe(1);
    expect(semanaDelPlan('2026-10-12', '2026-10-06')).toBe(1);
    expect(semanaDelPlan('2026-10-13', '2026-10-06')).toBe(2);
    expect(semanaDelPlan('2026-10-01', '2026-10-06')).toBeUndefined();
    expect(semanaDelPlan('2026-10-01', undefined)).toBeUndefined();
  });
});

describe('autorDelPaso', () => {
  const items = [{ id: 'prog_mesociclo', status: 'done' as const }, { id: 'prog_sesiones', status: 'pending' as const }];
  it('la última propuesta aplicada o aprobada de los tipos del paso dice quién lo cerró', () => {
    const a = autorDelPaso(items, PROPUESTAS)!;
    expect(a).toMatchObject({ autor: 'asistente', politica: 'proponer', editada: true, proposalId: 'alta_meso' });
    expect(textoDeAutor(a)).toMatch(/^Propuso el asistente, lo aprobaste con cambios · 2026-10-06/);
  });
  it('sin propuesta de esos tipos, lo hizo Dani a mano: null', () => {
    expect(autorDelPaso(items, PROPUESTAS.filter(p => p.kind !== 'mesocycle'))).toBeNull();
    expect(autorDelPaso([{ id: 'prog_mesociclo', status: 'pending' }], PROPUESTAS)).toBeNull();
    expect(autorDelPaso([{ id: 'w1_contacto_diario', status: 'done' }], PROPUESTAS)).toBeNull();
  });
  it('los textos distinguen automático, con aviso, latido y tú', () => {
    const base = { fecha: '2026-10-13T06:00:00.000Z', editada: false, proposalId: 'x' } as const;
    expect(textoDeAutor({ ...base, autor: 'asistente', politica: 'automatico' })).toMatch(/^El asistente, automático/);
    expect(textoDeAutor({ ...base, autor: 'asistente', politica: 'aviso' })).toMatch(/^El asistente, con aviso/);
    expect(textoDeAutor({ ...base, autor: 'latido', politica: 'automatico' })).toMatch(/^Lo hizo el latido/);
    expect(textoDeAutor({ ...base, autor: 'coach', politica: 'proponer' })).toMatch(/^Lo hiciste tú/);
  });
});
