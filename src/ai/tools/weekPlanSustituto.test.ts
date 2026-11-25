import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Exercise, Mesocycle, Workout, WeekPlanProposalPayload } from '../../types';
import { usarFuenteDeDatos, type FuenteDeDatos } from './datos';
import { proposeWeekPlan } from './propuestas';
import { addDays, hoyIsoLocal } from '../../utils/trainingWeek';

/* Sustituir un ejercicio desde una semana con propose_week_plan (25-11-2026).
   El guion de molestia del autopiloto pedía «cambia X por Y» con esta tool y
   `cambios` solo sabía tocar series, reps y RIR: el modelo no tenía cómo
   hacerlo. El modelo de datos sí (`CambiosDeSemana.exerciseId`, lo mismo que
   escribe la barra de semanas del mesociclo); faltaba la puerta. */

const HOY = hoyIsoLocal();
const ej = (id: string, name: string): Exercise => ({ id, ownerId: 'c', name, primaryFocus: '', type: 'fuerza', muscleGroup: 'pecho' } as Exercise);
const EJERCICIOS = [ej('banca', 'Press banca'), ej('inclinado', 'Press inclinado con mancuernas'), ej('maquina', 'Press en máquina')];
// Bloque de 8 semanas que empezó hace 14 días: hoy es su semana 3.
const MESO = { id: 'm1', athleteId: 'ana@x.com', number: 1, weeks: 8, startDate: addDays(HOY, -14), objective: 'H', daysPerWeek: 2, groups: {} } as unknown as Mesocycle;
const SESION: Workout = {
  id: 'w0', ownerId: 'c', name: 'Torso', mesocycleId: 'm1', dayIndex: 0,
  exercises: [{ exerciseId: 'banca', order: 0, sets: 3, reps: '8-10', rir: 2, restSeconds: 120 }],
};

const creadas: Record<string, unknown>[] = [];
const fuente = {
  getExercises: async () => EJERCICIOS,
  getMesocycles: async () => [MESO],
  getWorkouts: async () => [SESION],
  createAiProposal: vi.fn(async (d: Record<string, unknown>) => { creadas.push(d); return { id: 'prop_1', ...d }; }),
  appendDossierFacts: vi.fn(async () => ({})),
  coachActual: () => ({ uid: 'coach', email: 'danitrviner@gmail.com' }),
  isLocalBypassActive: () => false,
};
usarFuenteDeDatos(fuente as unknown as FuenteDeDatos);
beforeEach(() => { creadas.length = 0; });

const cambiosDe = () => (creadas[0].payload as WeekPlanProposalPayload).cambios!;

describe('propose_week_plan · sustituir un ejercicio', () => {
  it('resuelve el sustituto por su nombre exacto del catálogo y lo guarda con id y nombre', async () => {
    const r = JSON.parse(await proposeWeekPlan('ana@x.com', { cambios: [{ ejercicio: 'Press banca', semana: 4, sustituto: 'press inclinado con mancuernas' }] }, 'molestia de hombro', 'chat'));
    expect(r.proposalCreated).toBe(true);
    expect(cambiosDe()).toEqual([{ workoutId: 'w0', exerciseId: 'banca', ejercicio: 'Press banca', semana: 4, sustitutoId: 'inclinado', sustituto: 'Press inclinado con mancuernas' }]);
  });

  it('sin semana, el cambio entra en la semana en curso del mesociclo', async () => {
    await proposeWeekPlan('ana@x.com', { cambios: [{ ejercicio: 'Press banca', sustituto: 'Press en máquina' }] }, '', 'chat');
    expect(cambiosDe()[0]).toMatchObject({ semana: 3, sustitutoId: 'maquina' });
  });

  it('un sustituto que no está en el catálogo con ese nombre no crea la propuesta y lo dice', async () => {
    const r = JSON.parse(await proposeWeekPlan('ana@x.com', { cambios: [{ ejercicio: 'Press banca', semana: 4, sustituto: 'Press inclinado' }] }, '', 'chat'));
    expect(r.error).toMatch(/no está en el catálogo/);
    expect(creadas).toHaveLength(0);
  });

  it('sustituir un ejercicio por sí mismo es un error, no una propuesta vacía', async () => {
    const r = JSON.parse(await proposeWeekPlan('ana@x.com', { cambios: [{ ejercicio: 'Press banca', semana: 4, sustituto: 'Press banca' }] }, '', 'chat'));
    expect(r.error).toMatch(/mismo ejercicio/);
    expect(creadas).toHaveLength(0);
  });
});
