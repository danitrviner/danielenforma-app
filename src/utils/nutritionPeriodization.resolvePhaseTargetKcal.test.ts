import { describe, it, expect } from 'vitest';
import { resolvePhaseTargetKcal, buildPhaseEnergyPlans } from './nutritionPeriodization';
import type { Diet, NutritionPhase, NutritionProgram } from '../types';

/* Las kcal de una fase que no las declara salen de su dieta. Hasta el
 * 26-10-2026 se sumaban los intercambios puros (`exchangeToKcal(budget)`), sin
 * mixtos y sin el `objetivo` en kcal de las dietas nuevas: una dieta vieja con
 * mixtos salía a 1.297 kcal en el panel de periodización mientras Nutrición
 * enseñaba 1.896. Ahora es el mismo número que ve el atleta. */

const fase: NutritionPhase = { id: 'f1', name: 'Déficit', weeks: 4, dietId: 'd1' };
const vieja: Diet = {
  id: 'd1', athleteId: 'ana@x.com', name: 'Déficit',
  budget: { HC: 6, PROT: 4, GRASA: 3, MIX_HC: 4, MIX_GRASA: 2 }, meals: [],
};

describe('resolvePhaseTargetKcal', () => {
  it('una dieta vieja con mixtos vale lo mismo que en Nutrición', () => {
    expect(resolvePhaseTargetKcal(fase, vieja)).toEqual({ kcal: 1896, source: 'diet' });
  });

  it('una dieta nueva usa su objetivo en kcal, no el cupo', () => {
    const nueva: Diet = { ...vieja, budget: { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 }, objetivo: { kcal: 2150, p: 160, hc: 220, g: 70 } };
    expect(resolvePhaseTargetKcal(fase, nueva).kcal).toBe(2150);
  });

  it('las kcal manuales de la fase mandan y sin dieta no hay dato', () => {
    expect(resolvePhaseTargetKcal({ ...fase, targetKcal: 2400 }, vieja)).toEqual({ kcal: 2400, source: 'manual' });
    expect(resolvePhaseTargetKcal(fase, undefined)).toEqual({ kcal: null, source: 'none' });
  });

  it('el plan de energía por fases lleva ese mismo número', () => {
    const program: NutritionProgram = { athleteId: 'ana@x.com', startDate: '2026-09-07', phases: [fase] };
    expect(buildPhaseEnergyPlans(program, [vieja])[0]).toMatchObject({ targetKcal: 1896, targetExchanges: 19, source: 'diet' });
  });
});
