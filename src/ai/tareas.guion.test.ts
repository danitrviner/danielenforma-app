import { describe, it, expect } from 'vitest';
import { TAREAS } from './tareas';
import { motivoParaNoAprobar } from '../utils/edicionPropuesta';
import type {
  AiProposal, AiProposalPayload, WorkoutDaysProposalPayload,
  NutritionProgramProposalPayload,
} from '../types';

/* ═══════════════════════════════════════════════════════════════════════════
   El guion y el aprobador tienen que estar de acuerdo.

   El asistente propone y Dani aprueba, pero entre las dos cosas hay un
   portero: `motivoParaNoAprobar`. Si el guion le pide al asistente algo que el
   portero rechaza —un mesociclo con un grupo a cero series, unos días sin
   ejercicios— el asistente hace el trabajo, Dani ve la propuesta, le da a
   aprobar y salta un mensaje. Eso es un turno entero de crédito tirado, y no
   hay nada que avise de que las dos reglas se han separado.

   Este test fija esa frontera con propuestas de ejemplo del tipo que cada
   tarea produce: las que deben pasar, pasan, y las que deben pararse, se
   paran, y con el motivo que dice por qué.
   ═══════════════════════════════════════════════════════════════════════════ */

const EJERCICIO = {
  exerciseId: 'e1', exerciseName: 'Sentadilla', sets: 4, reps: '6-8', rir: 2, restSeconds: 150,
};

const DIAS_BIEN: WorkoutDaysProposalPayload = {
  mesocycleId: 'm1',
  days: [
    { dayIndex: 0, name: 'Empuje', exercises: [EJERCICIO] },
    { dayIndex: 1, name: 'Tirón', exercises: [{ ...EJERCICIO, exerciseId: 'e2', exerciseName: 'Remo' }] },
  ],
};

const PROGRAMA_BIEN: NutritionProgramProposalPayload = {
  athleteId: 'ana@x.com',
  startDate: '2026-09-16',
  phases: [{ id: 'f1', type: 'deficit', weeks: 6, dietId: 'd1', targetKcal: 2100 }],
} as unknown as NutritionProgramProposalPayload;

/* La dieta es la que tiene la regla más fina: lo colocado en las comidas tiene
   que cuadrar con el presupuesto con un margen de 0,26 intercambios (los
   redondeos de 0,25 repartidos entre varias comidas). Es también la propuesta
   que más veces hace el asistente. */
const DIETA_BIEN = {
  athleteId: 'ana@x.com', name: 'Día medio',
  budget: { HC: 4, PROT: 2, GRASA: 2, MIX_HC: 0, MIX_GRASA: 0 },
  meals: [{
    id: 'm1', name: 'Comida', items: [
      { category: 'HC', foodLabel: '30g arroz', quantity: 4 },
      { category: 'PROT', foodLabel: '100g pollo', quantity: 2 },
      { category: 'GRASA', foodLabel: '11g aceite', quantity: 2 },
    ],
  }],
} as unknown as AiProposalPayload;

function aprueba(kind: AiProposal['kind'], payload: AiProposalPayload): string | null {
  return motivoParaNoAprobar(kind, payload);
}

describe('lo que el guion pide se puede aprobar', () => {
  it('las tres tareas siguen siendo las tres, y ninguna pide nada raro', () => {
    expect(TAREAS.map(t => t.id)).toEqual(['mes_nuevo', 'revision', 'renovar_mes']);
  });

  it('una tanda de sesiones bien formada pasa el portero', () => {
    expect(aprueba('workoutDays', DIAS_BIEN)).toBeNull();
  });

  it('un programa de nutrición con sus fases pasa el portero', () => {
    expect(aprueba('nutritionProgram', PROGRAMA_BIEN)).toBeNull();
  });

  it('una dieta cuadrada con su presupuesto pasa el portero', () => {
    expect(aprueba('diet', DIETA_BIEN)).toBeNull();
  });
});

describe('y lo que NO se debe aprobar se para, diciendo por qué', () => {
  it('un día sin ejercicios señala cuál', () => {
    const roto: WorkoutDaysProposalPayload = {
      ...DIAS_BIEN,
      days: [DIAS_BIEN.days[0], { dayIndex: 1, name: 'Tirón', exercises: [] }],
    };
    const motivo = aprueba('workoutDays', roto);
    expect(motivo).toBeTruthy();
    expect(motivo).toContain('2');   // el número del día, tal y como lo ve Dani
  });

  it('todos los días vacíos lo dice de otra forma, no repite la lista', () => {
    const roto: WorkoutDaysProposalPayload = {
      ...DIAS_BIEN,
      days: DIAS_BIEN.days.map(d => ({ ...d, exercises: [] })),
    };
    expect(aprueba('workoutDays', roto)).toContain('Todos');
  });

  it('un programa de nutrición sin fases se para', () => {
    const roto = { ...PROGRAMA_BIEN, phases: [] };
    expect(aprueba('nutritionProgram', roto)).toBeTruthy();
  });

  it('una dieta descuadrada dice QUÉ categoría no cuadra, no «revísala»', () => {
    const roto = JSON.parse(JSON.stringify(DIETA_BIEN));
    roto.meals[0].items[0].quantity = 1;   // 4 HC de presupuesto, 1 puesto
    const motivo = aprueba('diet', roto);
    expect(motivo).toContain('HC');
    expect(motivo).toContain('presupuesto 4');
  });

  it('pero aguanta el redondeo de un cuarto de intercambio sin protestar', () => {
    const casi = JSON.parse(JSON.stringify(DIETA_BIEN));
    casi.meals[0].items[0].quantity = 4.25;
    expect(aprueba('diet', casi)).toBeNull();
  });
});
