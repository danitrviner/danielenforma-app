import { describe, it, expect } from 'vitest';
import type { AthleteDietConfig, Diet, NutritionProgram } from '../types';
import { objetivoDelDia, dietaDeReferencia, calendarioDeMenu, gramosDeIntercambios, TOLERANCIA_KCAL_FASE } from './objetivoDelDia';
import { dietaPautadaDelDia } from './nutritionSummary';
import { dietaDeLaSemana, diaDeLaSemana, kcalDeDieta } from './semanasNutricion';

const dieta = (id: string, budget: Partial<Diet['budget']>, over: Partial<Diet> = {}): Diet => ({
  id, athleteId: 'a@b.c', name: id,
  budget: { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0, ...budget },
  meals: [{ id: 'm1', name: 'Comida', items: [] }],
  ...over,
});

// 2.400 kcal: 10 HC + 8 PROT + 4 GRASA·(≈99) ≈ 2.396
const A = dieta('A', { HC: 10, PROT: 8, GRASA: 6 });
const B = dieta('B', { HC: 12, PROT: 8, GRASA: 6 });
const config = (over: Partial<AthleteDietConfig> = {}): AthleteDietConfig => ({ athleteId: 'a@b.c', activeDietIds: [], ...over });
const programa = (over: Partial<NutritionProgram> = {}): NutritionProgram => ({
  athleteId: 'a@b.c', startDate: '2026-10-05',
  phases: [{ id: 'f1', name: 'Déficit', weeks: 8, dietId: 'A' }], ...over,
});

const LUNES = '2026-10-19'; // lunes dentro de la fase 1

describe('objetivoDelDia · orden de elección', () => {
  it('1. el calendario semanal gana a todo', () => {
    const r = objetivoDelDia({ diets: [A, B], config: config({ weeklySchedule: { mon: 'B' }, activeDietIds: ['A'] }), program: programa(), fecha: LUNES });
    expect(r.origen).toBe('programada');
    expect(r.dieta?.id).toBe('B');
  });
  it('1b. un día libre (null) no tiene objetivo, aunque haya fase y dietas activas', () => {
    const r = objetivoDelDia({ diets: [A], config: config({ weeklySchedule: { mon: null }, activeDietIds: ['A'] }), program: programa(), fecha: LUNES });
    expect(r.origen).toBe('libre');
    expect(r.dieta).toBeNull();
    expect(r.kcal).toBeNull();
    expect(r.gramos).toBeNull();
  });
  it('2. sin calendario, la dieta de la fase en curso', () => {
    const r = objetivoDelDia({ diets: [A, B], config: config({ activeDietIds: ['B'] }), program: programa(), fecha: LUNES });
    expect(r.origen).toBe('fase');
    expect(r.dieta?.id).toBe('A');
    expect(r.faseId).toBe('f1');
  });
  it('3. sin calendario ni fase, la primera activa', () => {
    const r = objetivoDelDia({ diets: [A, B], config: config({ activeDietIds: ['B'] }), program: null, fecha: LUNES });
    expect(r.origen).toBe('activa');
    expect(r.dieta?.id).toBe('B');
  });
  it('4. sin nada, ninguna', () => {
    const r = objetivoDelDia({ diets: [A], config: config(), program: null, fecha: LUNES });
    expect(r.origen).toBe('ninguna');
    expect(r.kcal).toBeNull();
  });
  it('un id programado que no existe cae al siguiente criterio, no deja al atleta sin objetivo', () => {
    const r = objetivoDelDia({ diets: [A], config: config({ weeklySchedule: { mon: 'borrada' } }), program: programa(), fecha: LUNES });
    expect(r.origen).toBe('fase');
  });
});

describe('objetivoDelDia · lo que nunca cuenta', () => {
  it('un borrador no llega al atleta, ni programado, ni en la fase, ni activo', () => {
    const borrador = dieta('A', { HC: 10, PROT: 8, GRASA: 6 }, { isDraft: true });
    const r = objetivoDelDia({ diets: [borrador], config: config({ weeklySchedule: { mon: 'A' }, activeDietIds: ['A'] }), program: programa(), fecha: LUNES });
    expect(r.origen).toBe('ninguna');
  });
  it('una dieta del propio atleta (selfManaged) no marca su objetivo', () => {
    const suya = dieta('A', { HC: 10, PROT: 8, GRASA: 6 }, { selfManaged: true });
    const r = objetivoDelDia({ diets: [suya], config: config({ activeDietIds: ['A'] }), program: null, fecha: LUNES });
    expect(r.origen).toBe('ninguna');
  });
});

describe('objetivoDelDia · derivados del cupo', () => {
  it('kcal y gramos salen de los intercambios del cupo (1 int. = 100 kcal; 25/25/11 g)', () => {
    const r = objetivoDelDia({ diets: [dieta('A', { HC: 10, PROT: 8, GRASA: 6 })], config: config({ activeDietIds: ['A'] }), program: null, fecha: LUNES });
    expect(r.intercambios).toEqual({ HC: 10, PROT: 8, GRASA: 6 });
    expect(r.gramos).toEqual({ p: 200, hc: 250, g: 66 });
    expect(r.kcal).toBe(1000 + 800 + 594);
  });
  it('los intercambios mixtos se reparten por la mitad', () => {
    const r = objetivoDelDia({ diets: [dieta('A', { HC: 4, MIX_HC: 2, PROT: 4, MIX_GRASA: 2 })], config: config({ activeDietIds: ['A'] }), program: null, fecha: LUNES });
    // MIX_HC 2 → +1 HC +1 PROT; MIX_GRASA 2 → +1 GRASA +1 PROT
    expect(r.intercambios).toEqual({ HC: 5, PROT: 6, GRASA: 1 });
  });
  it('gramosDeIntercambios redondea a gramos enteros', () => {
    expect(gramosDeIntercambios({ HC: 6.25, PROT: 7.5, GRASA: 2.75 })).toEqual({ p: 188, hc: 156, g: 30 });
  });
});

describe('objetivoDelDia · lo programado de la semana', () => {
  it('aplica el ciclado de hidratos del día de entreno y no el de descanso', () => {
    const prog = programa({ ciclado: { entreno: 2, descanso: -1, desde: 1 } });
    const base = { diets: [A], config: config({ activeDietIds: ['A'] }), program: prog, fecha: LUNES };
    const entreno = objetivoDelDia({ ...base, entrena: true });
    const descanso = objetivoDelDia({ ...base, entrena: false });
    expect(entreno.intercambios!.HC).toBe(12);
    expect(descanso.intercambios!.HC).toBe(9);
    // sin saber si entrena, no se aplica nada
    expect(objetivoDelDia(base).intercambios!.HC).toBe(10);
  });
  it('la semana de mantenimiento suma el hidrato extra en cada comida', () => {
    const conItems = dieta('A', { HC: 10, PROT: 8, GRASA: 6 }, { meals: [{ id: 'm1', name: 'C', items: [{ category: 'HC', foodLabel: 'x', quantity: 1 }] }] });
    const prog = programa({ semanasMantenimiento: [3] }); // 19-oct = semana 3 (empieza 5-oct)
    const r = objetivoDelDia({ diets: [conItems], config: config({ activeDietIds: ['A'] }), program: prog, fecha: LUNES });
    expect(r.dieta).not.toBe(r.dietaBase);
  });
});

describe('objetivoDelDia · avisos', () => {
  it('avisa si la fase pide otras kcal que el cupo', () => {
    const prog = programa({ phases: [{ id: 'f1', name: 'Déficit', weeks: 8, dietId: 'A', targetKcal: 2000 }] });
    const r = objetivoDelDia({ diets: [A], config: config(), program: prog, fecha: LUNES });
    expect(r.avisos).toEqual([{ tipo: 'fase_difiere', kcalDieta: kcalDeDieta(A), kcalFase: 2000 }]);
  });
  it('no avisa dentro de la tolerancia', () => {
    const prog = programa({ phases: [{ id: 'f1', name: 'Déficit', weeks: 8, dietId: 'A', targetKcal: kcalDeDieta(A) + TOLERANCIA_KCAL_FASE }] });
    expect(objetivoDelDia({ diets: [A], config: config(), program: prog, fecha: LUNES }).avisos).toEqual([]);
  });
  it('el ciclado no cuenta como discrepancia con la fase', () => {
    const prog = programa({
      phases: [{ id: 'f1', name: 'Déficit', weeks: 8, dietId: 'A', targetKcal: kcalDeDieta(A) }],
      ciclado: { entreno: 3, descanso: 0, desde: 1 },
    });
    expect(objetivoDelDia({ diets: [A], config: config(), program: prog, fecha: LUNES, entrena: true }).avisos).toEqual([]);
  });
  it('avisa cuando el calendario tapa a la dieta de la fase', () => {
    const r = objetivoDelDia({ diets: [A, B], config: config({ weeklySchedule: { mon: 'B' } }), program: programa(), fecha: LUNES });
    expect(r.avisos).toEqual([{ tipo: 'calendario_tapa_fase', dietaProgramada: 'B', dietaDeFase: 'A' }]);
  });
});

describe('paridad con lo que Nutrición mostraba hasta ahora', () => {
  // Cuando hay calendario o dieta activa, el resultado es el mismo que daba
  // dietaPautadaDelDia + dietaDeLaSemana. Solo cambia (a propósito) lo que antes
  // era incoherente: el día libre y la dieta de la fase sin activar.
  const casos: [string, AthleteDietConfig, NutritionProgram | null][] = [
    ['programada', config({ weeklySchedule: { mon: 'B' }, activeDietIds: ['A'] }), programa()],
    ['activa sin programa', config({ activeDietIds: ['B'] }), null],
    ['programada con ajustes de semana', config({ weeklySchedule: { mon: 'A' } }), programa({ ciclado: { entreno: 1, descanso: 0, desde: 1 } })],
  ];
  for (const [nombre, cfg, prog] of casos) {
    it(nombre, () => {
      const antes = dietaPautadaDelDia([A, B], cfg, diaDeLaSemana(LUNES));
      const antesEfectiva = antes ? dietaDeLaSemana(antes, prog, LUNES, true) : null;
      const ahora = objetivoDelDia({ diets: [A, B], config: cfg, program: prog, fecha: LUNES, entrena: true });
      expect(ahora.dieta?.budget).toEqual(antesEfectiva?.budget);
    });
  }
});

describe('dietaDeReferencia (informes sin día concreto)', () => {
  it('la de la fase, aunque nadie haya reescrito activeDietIds', () => {
    expect(dietaDeReferencia([A, B], config({ activeDietIds: ['B'] }), programa(), LUNES)?.id).toBe('A');
  });
  it('sin fase, la primera activa; sin activa, la primera del coach', () => {
    expect(dietaDeReferencia([A, B], config({ activeDietIds: ['B'] }), null, LUNES)?.id).toBe('B');
    expect(dietaDeReferencia([A, B], config(), null, LUNES)?.id).toBe('A');
  });
  it('un borrador nunca es la dieta de referencia', () => {
    const borrador = dieta('X', { HC: 5 }, { isDraft: true });
    expect(dietaDeReferencia([borrador, B], config({ activeDietIds: ['X'] }), null, LUNES)?.id).toBe('B');
    expect(dietaDeReferencia([borrador], config(), null, LUNES)).toBeNull();
  });
});

describe('calendarioDeMenu (menú automático)', () => {
  const semana1 = { semana: 1 };
  it('el calendario manda y un día libre (null) sigue libre', () => {
    const r = calendarioDeMenu({ diets: [A, B], config: config({ weeklySchedule: { mon: 'B', tue: null }, activeDietIds: ['A'] }), program: programa(), ...semana1 });
    expect(r.schedule.mon).toBe('B');
    expect(r.schedule.tue).toBeNull();
  });
  it('un día sin calendario cae a la fase, igual que en Nutrición', () => {
    const r = calendarioDeMenu({ diets: [A, B], config: config({ weeklySchedule: { mon: 'B' } }), program: programa(), ...semana1 });
    expect(r.schedule.wed).toBe('A');
  });
  it('sin calendario ni fase, la primera activa', () => {
    const r = calendarioDeMenu({ diets: [A, B], config: config({ activeDietIds: ['B'] }), program: programa({ phases: [] }), ...semana1 });
    expect(Object.values(r.schedule)).toEqual(Array(7).fill('B'));
  });
  it('cubre los siete días de la semana, empiece el programa el día que empiece', () => {
    const r = calendarioDeMenu({ diets: [A], config: config(), program: programa({ startDate: '2026-10-07' }), semana: 2 });
    expect(Object.keys(r.schedule).sort()).toEqual(['fri', 'mon', 'sat', 'sun', 'thu', 'tue', 'wed']);
  });
  it('un borrador o una dieta del propio atleta se ignoran, aunque el calendario apunte a ellas', () => {
    const borrador = dieta('Bor', { HC: 9 }, { isDraft: true });
    const propia = dieta('Mia', { HC: 9 }, { selfManaged: true });
    const r = calendarioDeMenu({ diets: [A, borrador, propia], config: config({ weeklySchedule: { mon: 'Bor', tue: 'Mia' } }), program: programa(), ...semana1 });
    expect(r.schedule.mon).toBe('A');
    expect(r.schedule.tue).toBe('A');
    expect(r.dietas.map(d => d.id)).toEqual(['A']);
  });
  it('sin dietas válidas, todos los días quedan libres', () => {
    const r = calendarioDeMenu({ diets: [dieta('Bor', {}, { isDraft: true })], config: config(), program: programa(), ...semana1 });
    expect(Object.values(r.schedule).every(v => v === null)).toBe(true);
  });
});
