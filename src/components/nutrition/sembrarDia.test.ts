import { describe, it, expect } from 'vitest';
import { sembrarDiaDelPlan } from './dietHelpers';
import type { Diet, DietCompletionLog } from '../../types';

const CUPO = { HC: 10, PROT: 8, GRASA: 4, MIX_HC: 0, MIX_GRASA: 0 };

const dietaDelCoach: Diet = {
  id: 'd_coach', athleteId: 'ana@x.com', name: 'Día alto',
  budget: CUPO,
  meals: [
    { id: 'm1', name: 'Desayuno', items: [{ category: 'HC', foodLabel: '40g pan', quantity: 2 }] },
    { id: 'm2', name: 'Comida',   items: [{ category: 'PROT', foodLabel: '100g pollo', quantity: 1 }] },
  ],
};

// El caso reproducido en producción: el registro del día existe, tiene sus
// marcas, pero es del formato anterior a 09-2026 (sin `meals`, apuntando a la
// dieta con `dietId`). La siembra vieja lo tiraba y pintaba el día en blanco.
const logAntiguo: DietCompletionLog = {
  id: 'ana@x.com_2026-09-04', athleteId: 'ana@x.com', date: '2026-09-04',
  dietId: 'd_coach', doneItemIds: ['m1_0'],
};

describe('sembrarDiaDelPlan', () => {
  it('rescata las comidas de un registro antiguo desde su dieta', () => {
    const { meals, budget } = sembrarDiaDelPlan(logAntiguo, [dietaDelCoach], null, null);
    expect(meals.map(m => m.id)).toEqual(['m1', 'm2']);       // los ids se conservan…
    expect(budget).toEqual(CUPO);
    // …que es lo que hace que la marca guardada («m1_0») siga señalando el pan.
    expect(meals[0].items[0].foodLabel).toBe('40g pan');
  });

  it('un registro nuevo manda sobre la dieta, aunque la dieta haya cambiado', () => {
    const logNuevo: DietCompletionLog = {
      ...logAntiguo,
      meals: [{ id: 'x1', name: 'Desayuno', items: [{ category: 'HC', foodLabel: '1 manzana', quantity: 1 }] }],
      budget: { HC: 1, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 },
    };
    const { meals, budget } = sembrarDiaDelPlan(logNuevo, [dietaDelCoach], null, CUPO);
    expect(meals[0].items[0].foodLabel).toBe('1 manzana');
    expect(budget.HC).toBe(1);
  });

  it('sin registro, monta el día con las comidas del alta y el cupo pautado', () => {
    const { meals, budget } = sembrarDiaDelPlan(null, [dietaDelCoach],
      [{ name: 'Desayuno', slot: 1 }, { name: 'Cena', slot: 5 }], CUPO);
    expect(meals.map(m => m.name)).toEqual(['Desayuno', 'Cena']);
    expect(meals.every(m => m.items.length === 0)).toBe(true);
    expect(budget).toEqual(CUPO);
  });

  it('un registro cuya dieta ya no existe no deja el día roto', () => {
    const { meals } = sembrarDiaDelPlan({ ...logAntiguo, dietId: 'borrada' }, [dietaDelCoach],
      [{ name: 'Desayuno', slot: 1 }], null);
    expect(meals.map(m => m.name)).toEqual(['Desayuno']);
  });

  it('si el día registrado no traía cupo, se cae al pautado de hoy', () => {
    const sinCupo: DietCompletionLog = { ...logAntiguo, dietId: 'borrada', meals: [] };
    expect(sembrarDiaDelPlan(sinCupo, [], null, CUPO).budget).toEqual(CUPO);
  });
});

describe('sembrarDiaDelPlan — la dieta del coach solo siembra días sin registro', () => {
  const programada: Diet = {
    id: 'd_prog', athleteId: 'ana@x.com', name: 'Volumen — Día alto',
    budget: CUPO,
    meals: [{ id: 'p1', name: 'Comida', items: [{ category: 'HC', foodLabel: '60g arroz', quantity: 2 }] }],
  };

  it('un día sin registro se carga con la que el coach programó', () => {
    const { meals, budget } = sembrarDiaDelPlan(null, [], null, null, programada);
    expect(meals[0].items[0].foodLabel).toBe('60g arroz');
    expect(budget).toEqual(CUPO);
    // Copiadas, no las mismas: editar el día del atleta no puede tocar la
    // dieta del coach (que además él no tiene permiso para escribir).
    expect(meals[0].id).not.toBe('p1');
  });

  it('lo que el atleta esté trabajando MANDA sobre la programada de hoy', () => {
    const suyo: DietCompletionLog = {
      id: 'ana@x.com_2026-09-07', athleteId: 'ana@x.com', date: '2026-09-07', dietId: 'd_prueba',
      doneItemIds: [],
      meals: [{ id: 'x', name: 'Comida', items: [{ category: 'PROT', foodLabel: '150g merluza', quantity: 1 }] }],
    };
    expect(sembrarDiaDelPlan(suyo, [], null, CUPO, programada).meals[0].items[0].foodLabel)
      .toBe('150g merluza');
  });

  // El día vaciado a propósito: `meals: []` es una respuesta, no un hueco.
  it('un día vaciado a mano no se repinta con la del coach', () => {
    const vaciado: DietCompletionLog = {
      id: 'ana@x.com_2026-09-07', athleteId: 'ana@x.com', date: '2026-09-07', dietId: '',
      doneItemIds: [], meals: [],
    };
    expect(sembrarDiaDelPlan(vaciado, [], null, CUPO, programada).meals).toEqual([]);
  });
});
