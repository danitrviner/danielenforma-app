import { describe, it, expect } from 'vitest';
import { validateMesocyclePayload, type MesocycleProposalPayload } from './validators';

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
