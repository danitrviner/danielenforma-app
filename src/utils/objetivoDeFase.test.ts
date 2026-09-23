import { describe, it, expect } from 'vitest';
import { NutritionProgram } from '../types';
import {
  cambiarObjetivo, corregirObjetivoDeFase, faseEnCurso, objetivoDeFase, ritmoSugeridoKg,
} from './objetivoDeFase';
import { computePhaseStartDate } from './fasesNutricion';

const EMAIL = 'a@b.com';
const programa = (): NutritionProgram => ({
  athleteId: EMAIL, startDate: '2026-06-01',
  phases: [
    { id: 'f1', name: 'Déficit', weeks: 8, dietId: 'd1', targetKcal: 2100, targetRateKgWeek: -0.4, targetWeight: 78 },
    { id: 'f2', name: 'Mant', weeks: 4, dietId: 'd2', targetKcal: 2500 },
  ],
});

describe('objetivoDeFase', () => {
  it('lo marcado manda; lo viejo se deduce de las kcal y se avisa', () => {
    const p = programa();
    expect(objetivoDeFase(p, 1)).toEqual({ tipo: 'volumen', deducido: true }); // 2100 → 2500 = superávit
    expect(objetivoDeFase(p, 0)).toBeNull();                                  // sin anterior ni tipo
    p.phases[0].objetivo = 'deficit_acelerado';
    expect(objetivoDeFase(p, 0)).toEqual({ tipo: 'deficit_acelerado', deducido: false });
  });
});

describe('cambiarObjetivo', () => {
  it('sin programa crea uno desde la fecha dada', () => {
    const p = cambiarObjetivo({ program: null, athleteEmail: EMAIL, tipo: 'volumen', hoy: '2026-09-01', pesoKg: 80, nuevoId: 'n' });
    expect(p.startDate).toBe('2026-09-01');
    expect(p.phases).toHaveLength(1);
    expect(p.phases[0]).toMatchObject({ objetivo: 'volumen', phaseType: 'superavit', weeks: 8, dietId: '' });
    expect(p.phases[0].targetRateKgWeek).toBeCloseTo(0.25, 2); // centro 0,325 % de 80 kg = 0,26 → 0,25
  });

  it('a mitad de fase: recorta a lo vivido, inserta la nueva y conserva las siguientes', () => {
    const hoy = '2026-06-25'; // 3 semanas y 3 días dentro de f1
    const p = cambiarObjetivo({ program: programa(), athleteEmail: EMAIL, tipo: 'mantenimiento', hoy, nuevoId: 'n' });
    expect(p.phases.map(f => [f.id, f.weeks])).toEqual([['f1', 3], ['n', 8], ['f2', 4]]);
    expect(p.phases[0].targetRateKgWeek).toBeUndefined();      // no se re-alarga al guardar el panel
    expect(p.phases[0].targetKcal).toBe(2100);                  // el resto de la fase intacto
    expect(p.phases[1].dietId).toBe('d1');                      // sigue con la dieta que tenía
    // La nueva está en curso hoy, empezando en el corte de semana (≤ 6 días antes).
    const en = faseEnCurso(p, hoy)!;
    expect(en.fase.id).toBe('n');
    expect(en.desde).toBe(computePhaseStartDate(p, 1));
    expect(en.desde <= hoy).toBe(true);
  });

  it('en la primera semana de una fase solo cambia su objetivo', () => {
    const p = cambiarObjetivo({ program: programa(), athleteEmail: EMAIL, tipo: 'deficit_acelerado', hoy: '2026-06-03' });
    expect(p.phases).toHaveLength(2);
    expect(p.phases[0]).toMatchObject({ objetivo: 'deficit_acelerado', phaseType: 'deficit', weeks: 8 });
    expect(p.phases[0].targetRateKgWeek).toBe(-0.4);  // ritmo del coach en la misma dirección: se respeta
  });

  it('programa terminado: rellena el hueco y añade la nueva en curso', () => {
    const hoy = '2026-09-20'; // termina el 24-08
    const p = cambiarObjetivo({ program: programa(), athleteEmail: EMAIL, tipo: 'volumen', hoy, nuevoId: 'n' });
    expect(p.phases.map(f => f.id)).toEqual(['f1', 'f2', 'n_hueco', 'n']);
    expect(faseEnCurso(p, hoy)!.fase.id).toBe('n');
  });

  it('programa sin empezar: cambia la primera fase', () => {
    const p = cambiarObjetivo({ program: programa(), athleteEmail: EMAIL, tipo: 'volumen', hoy: '2026-05-20', pesoKg: 80 });
    expect(p.phases[0].objetivo).toBe('volumen');
    expect(p.phases[0].targetRateKgWeek!).toBeGreaterThan(0); // el −0,4 iba en contra: se sustituye
  });
});

describe('corregirObjetivoDeFase', () => {
  it('franja: quita el ritmo, no parte la fase', () => {
    const p = corregirObjetivoDeFase(programa(), 0, 'recomposicion');
    expect(p.phases).toHaveLength(2);
    expect(p.phases[0]).toMatchObject({ objetivo: 'recomposicion', phaseType: 'mantenimiento', weeks: 8 });
    expect(p.phases[0].targetRateKgWeek).toBeUndefined();
  });
  it('ritmos sugeridos', () => {
    expect(ritmoSugeridoKg('deficit', 80)).toBeCloseTo(-0.4, 2);
    expect(ritmoSugeridoKg('mantenimiento', 80)).toBeUndefined();
  });
});
