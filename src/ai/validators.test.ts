import { describe, it, expect } from 'vitest';
import { validateMesocyclePayload, validateNutritionPhases, type MesocycleProposalPayload } from './validators';

/* El tope de volumen total era days × 12 y rechazaba repartos normales: con el
   criterio de Dani (8-12 series por músculo y sesión), un día de torso que toca
   tres músculos ya son ~30 series. Subido a days × 25 el 2026-09-02, y sigue
   BLOQUEANDO por encima — un error del modelo no debe colar 200 series. */

const base = (groups: MesocycleProposalPayload['groups'], daysPerWeek = 4): MesocycleProposalPayload => ({
  weeks: 8,
  daysPerWeek,
  objective: 'Hipertrofia — énfasis espalda',
  groups,
});

describe('validateMesocyclePayload — tope de volumen', () => {
  it('acepta un reparto realista que el tope viejo (días × 12) habría rechazado', () => {
    // 76 series/semana en 4 días: imposible con el tope de 12 (48), normal con 25 (100).
    const payload = base({
      pecho: { series: 12, priority: 'alta' },
      dorsal: { series: 16, priority: 'alta' },
      cuadriceps: { series: 12 },
      isquios: { series: 10 },
      gluteo: { series: 12 },
      deltoide_lat: { series: 14, priority: 'alta' },
    });
    expect(validateMesocyclePayload(payload)).toEqual([]);
  });

  it('sigue bloqueando lo que no cabe en los días que entrena', () => {
    const payload = base({ pecho: { series: 25 }, dorsal: { series: 25 }, cuadriceps: { series: 25 } }, 2);
    const issues = validateMesocyclePayload(payload);
    expect(issues).toHaveLength(1);
    expect(issues[0].field).toBe('groups');
    expect(issues[0].message).toContain('máx ≈ 50');
  });

  it('el límite por grupo sigue en 25', () => {
    const issues = validateMesocyclePayload(base({ dorsal: { series: 26 } }));
    expect(issues.some(i => i.message.includes('25'))).toBe(true);
  });

  it('rechaza grupos que no existen', () => {
    const issues = validateMesocyclePayload(base({ pectoral: { series: 10 } } as unknown as MesocycleProposalPayload['groups']));
    expect(issues.some(i => i.field === 'groups')).toBe(true);
  });
});


/* La periodización nutricional es lo más fácil de romper: cada fase va enlazada
   a una dieta, y una fase sin dieta no le enseña nada al atleta. Se rechaza aquí
   con el motivo, para que el modelo se corrija solo en vez de que Dani apruebe
   un plan roto. */
describe('validateNutritionPhases', () => {
  const DIETAS = ['d1', 'd2'];

  it('acepta una cadena de fases con dietas que ya existen', () => {
    const issues = validateNutritionPhases([
      { name: 'Déficit', weeks: 8, diet_id: 'd1' },
      { name: 'Mantenimiento', weeks: 2, diet_id: 'd2' },
    ], DIETAS);
    expect(issues).toEqual([]);
  });

  it('exige al menos una fase', () => {
    expect(validateNutritionPhases([], DIETAS)[0].field).toBe('phases');
  });

  it('rechaza una fase sin dieta enlazada', () => {
    const [issue] = validateNutritionPhases([{ name: 'Déficit', weeks: 8 }], DIETAS);
    expect(issue.message).toContain('necesita diet_id');
  });

  it('rechaza una dieta que no es de este atleta', () => {
    const issues = validateNutritionPhases([{ name: 'Déficit', weeks: 8, diet_id: 'de-otro' }], DIETAS);
    expect(issues.some(i => i.message.includes('no es de este atleta'))).toBe(true);
  });

  it('no deja mandar las dos cosas a la vez', () => {
    const issues = validateNutritionPhases(
      [{ name: 'X', weeks: 4, diet_id: 'd1', diet: { name: 'Y', budget: {}, meals: [] } }], DIETAS);
    expect(issues.some(i => i.message.includes('no las dos'))).toBe(true);
  });

  it('rechaza semanas imposibles', () => {
    expect(validateNutritionPhases([{ name: 'X', weeks: 0, diet_id: 'd1' }], DIETAS).some(i => i.field.endsWith('weeks'))).toBe(true);
    expect(validateNutritionPhases([{ name: 'X', weeks: 99, diet_id: 'd1' }], DIETAS).some(i => i.field.endsWith('weeks'))).toBe(true);
  });

  it('valida la dieta que viene dentro de la fase, no solo su forma', () => {
    const issues = validateNutritionPhases([{
      name: 'Déficit', weeks: 8,
      diet: {
        name: 'Baja en HC',
        budget: { HC: 8, PROT: 6, GRASA: 4 },
        meals: [{ name: 'Desayuno', items: [{ category: 'HC', foodLabel: 'inventado que no existe', quantity: 1 }] }],
      },
    }], DIETAS);
    expect(issues.some(i => i.message.includes('no reconocido'))).toBe(true);
    expect(issues.every(i => i.message.startsWith('Fase "Déficit"'))).toBe(true);
  });
});
