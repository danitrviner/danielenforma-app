import { describe, it, expect } from 'vitest';
import { describirEdicion, motivoParaNoAprobar } from './edicionPropuesta';
import { resumirPatrones, type Deriva } from './derivaPropuestas';
import type { AiProposal, Diet, LevelLadder, Mesocycle, MuscleGroup, MuscleGroupConfig, NutritionProgramProposalPayload, WorkoutDaysProposalPayload } from '../types';

/* Editar la propuesta antes de aprobarla es la corrección más barata que hay.
   Si no queda escrita en la ficha, la IA vuelve a proponer lo mismo la semana
   que viene y Dani vuelve a corregirlo. */

const grupos = (series: Partial<Record<MuscleGroup, number>>): Record<MuscleGroup, MuscleGroupConfig> =>
  Object.fromEntries(Object.entries(series).map(([g, s]) => [g, { series: s as number, priority: 'media' }])) as Record<MuscleGroup, MuscleGroupConfig>;

const propuesta = (kind: AiProposal['kind'], payload: unknown): AiProposal => ({
  id: 'p1', athleteId: 'ana@x.com', kind, status: 'proposed', chatId: 'c1',
  summary: 's', rationale: '', payload: payload as AiProposal['payload'],
  createdAt: '2026-09-07T10:00:00Z',
});

const meso = (weeks: number, series: Partial<Record<MuscleGroup, number>>): Omit<Mesocycle, 'id'> => ({
  athleteId: 'ana@x.com', number: 4, weeks, startDate: '2026-09-08',
  objective: 'Hipertrofia', daysPerWeek: 4, groups: grupos(series),
});

describe('describirEdicion — mesociclo', () => {
  it('cuenta las series que subió y las semanas que cambió', () => {
    const p = propuesta('mesocycle', meso(8, { dorsal: 14, pecho: 12 }));
    const texto = describirEdicion(p, meso(10, { dorsal: 18, pecho: 12 }));
    expect(texto).toContain('semanas 8 → 10');
    expect(texto).toContain('dorsal 14 → 18 series');
    expect(texto).not.toContain('pecho');
  });

  it('no inventa cambios cuando se aprueba tal cual', () => {
    const p = propuesta('mesocycle', meso(8, { dorsal: 14 }));
    expect(describirEdicion(p, meso(8, { dorsal: 14 }))).toBe('retoques menores');
  });
});

describe('describirEdicion — sesiones', () => {
  const sesion = (sets: number, conRemo: boolean): WorkoutDaysProposalPayload => ({
    mesocycleId: 'm1',
    days: [{
      dayIndex: 0,
      exercises: [
        { exerciseId: 'e1', exerciseName: 'Press banca', sets, reps: '8-10', rir: 2, restSeconds: 90 },
        ...(conRemo ? [{ exerciseId: 'e3', exerciseName: 'Remo con barra', sets: 4, reps: '10', rir: 2, restSeconds: 90 }] : []),
      ],
    }],
  });

  it('dice qué ejercicio quitó y qué series cambió', () => {
    const p = propuesta('workoutDays', sesion(4, true));
    const texto = describirEdicion(p, sesion(3, false));
    expect(texto).toContain('quitó Remo con barra');
    expect(texto).toContain('Press banca 4 → 3 series');
  });
});

describe('describirEdicion — escalera', () => {
  const escalera = (nombre: string, objetivo: number): LevelLadder => ({
    levels: [{
      id: 'lvl-club', order: 0, name: nombre, icon: 'group',
      criteria: [{ id: 'lvl-club-c0', kind: 'peso_perdido_kg', label: 'Perder 5 kg', targetValue: objetivo }],
    }],
  });

  it('recoge el nivel renombrado y el objetivo movido', () => {
    const p = propuesta('levelLadder', escalera('Club', 5));
    const texto = describirEdicion(p, escalera('Arranque', 7));
    expect(texto).toContain('"Club" → "Arranque"');
    expect(texto).toContain('objetivo 5 → 7');
  });
});

describe('resumirPatrones', () => {
  const deriva = (cambios: string[], fecha: string): Deriva => ({ proposalId: 'p', fecha, que: 'Mesociclo #1', cambios });

  it('saca el patrón cuando la misma corrección se repite', () => {
    const patrones = resumirPatrones([
      deriva(['dorsal 14 → 16 series'], '2026-09-01'),
      deriva(['dorsal 12 → 15 series'], '2026-08-01'),
      deriva(['dorsal 10 → 12 series'], '2026-07-01'),
    ]);
    expect(patrones[0]).toContain('dorsal: sube series sobre lo propuesto (3 veces)');
  });

  it('ignora lo que solo pasó una vez: es una anécdota, no criterio', () => {
    expect(resumirPatrones([deriva(['pecho 12 → 14 series'], '2026-09-01')])).toEqual([]);
  });

  it('distingue subir de bajar intercambios', () => {
    const patrones = resumirPatrones([
      deriva(['GRASA 5 → 4 intercambios'], '2026-09-01'),
      deriva(['GRASA 6 → 4 intercambios'], '2026-08-01'),
    ]);
    expect(patrones[0]).toContain('GRASA: baja intercambios');
  });
});

describe('describirEdicion — periodización nutricional', () => {
  const programa = (semanas: number, conRecarga: boolean): NutritionProgramProposalPayload => ({
    startDate: '2026-09-08',
    phases: [
      { name: 'Déficit', weeks: semanas, targetKcal: 2000 },
      { name: 'Mantenimiento', weeks: 2, targetKcal: 2400 },
    ],
    refeedDays: conRecarga ? [{ date: '2026-10-01', note: 'sube 500 kcal de HC' }] : [],
  });

  it('recoge las semanas movidas y la recarga quitada', () => {
    const p = propuesta('nutritionProgram', programa(8, true));
    const texto = describirEdicion(p, programa(10, false));
    expect(texto).toContain('Déficit 8 → 10 semanas');
    expect(texto).toContain('recargas 1 → 0');
  });
});

describe('motivoParaNoAprobar', () => {
  it('no deja aprobar una periodización sin fases', () => {
    const vacio: NutritionProgramProposalPayload = { startDate: '2026-09-08', phases: [] };
    expect(motivoParaNoAprobar('nutritionProgram', vacio)).toContain('todas las fases');
  });

  it('avisa del día que se ha quedado sin ejercicios', () => {
    const dias: WorkoutDaysProposalPayload = {
      mesocycleId: 'm1',
      days: [
        { dayIndex: 0, exercises: [{ exerciseId: 'e1', exerciseName: 'Press banca', sets: 4, reps: '8-10', rir: 2, restSeconds: 90 }] },
        { dayIndex: 1, exercises: [] },
      ],
    };
    expect(motivoParaNoAprobar('workoutDays', dias)).toContain('2');
  });

  it('deja pasar lo que está bien', () => {
    const ok: NutritionProgramProposalPayload = { startDate: '2026-09-08', phases: [{ name: 'Déficit', weeks: 8 }] };
    expect(motivoParaNoAprobar('nutritionProgram', ok)).toBeNull();
  });

  it('no deja una escalera de un solo nivel', () => {
    const escalera: LevelLadder = { levels: [{ id: 'l1', order: 0, name: 'Club', icon: 'group', criteria: [] }] };
    expect(motivoParaNoAprobar('levelLadder', escalera)).toContain('escalera');
  });
});

describe('motivoParaNoAprobar — lo que Dani puede romper editando', () => {
  /* Los validadores de la IA corren ANTES de crear la propuesta y no vuelven a
     correr sobre lo editado. Sin esto, mover el presupuesto de una dieta en la
     tarjeta la guardaba descuadrada y el atleta se la encontraba así. */

  const dieta = (hc: number): Omit<Diet, 'id'> => ({
    athleteId: 'ana@x.com',
    name: 'Déficit',
    budget: { HC: hc, PROT: 6, GRASA: 4 },
    meals: [{
      id: 'm1', name: 'Comida',
      items: [
        { category: 'HC', foodLabel: 'Arroz', quantity: 8 },
        { category: 'PROT', foodLabel: 'Pollo', quantity: 6 },
        { category: 'GRASA', foodLabel: 'Aceite', quantity: 4 },
      ],
    }],
  } as unknown as Omit<Diet, 'id'>);

  it('deja aprobar la dieta mientras el presupuesto cuadra con lo puesto', () => {
    expect(motivoParaNoAprobar('diet', dieta(8))).toBeNull();
  });

  it('no deja aprobar una dieta cuyo presupuesto ya no cuadra con las comidas', () => {
    const motivo = motivoParaNoAprobar('diet', dieta(14));
    expect(motivo).toContain('no cuadran');
    expect(motivo).toContain('HC');
  });

  it('para las series fuera de rango en una sesión', () => {
    const dias: WorkoutDaysProposalPayload = {
      mesocycleId: 'm1',
      days: [{ dayIndex: 0, exercises: [{ exerciseId: 'e1', exerciseName: 'Press banca', sets: 99, reps: '8-10', rir: 2, restSeconds: 90 }] }],
    };
    expect(motivoParaNoAprobar('workoutDays', dias)).toContain('Press banca');
  });

  it('para un criterio de nivel que se ha quedado sin objetivo', () => {
    const escalera: LevelLadder = {
      levels: [
        { id: 'l1', order: 0, name: 'Club', icon: 'group', criteria: [{ id: 'c1', kind: 'peso_perdido_kg', label: 'Perder 5 kg', targetValue: 0 }] },
        { id: 'l2', order: 1, name: 'Fuerte', icon: 'bolt', criteria: [{ id: 'c2', kind: 'manual', label: 'Dominadas' }] },
      ],
    };
    expect(motivoParaNoAprobar('levelLadder', escalera)).toContain('sin objetivo');
  });

  it('para un mesociclo que se ha quedado sin series', () => {
    const meso: Omit<Mesocycle, 'id'> = {
      athleteId: 'ana@x.com', number: 1, weeks: 8, startDate: '2026-09-08',
      objective: 'x', daysPerWeek: 4, groups: grupos({ dorsal: 0 }),
    };
    expect(motivoParaNoAprobar('mesocycle', meso)).toContain('sin series');
  });
});
