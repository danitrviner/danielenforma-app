import { describe, it, expect } from 'vitest';
import { computeAuto, estimateMaintenanceKcal, mifflinBMR, calcAge } from './energyCalc';

// Fecha de nacimiento que da una edad estable independientemente del día en que
// se ejecute el test: se calcula hacia atrás desde hoy.
function birthDateForAge(age: number): string {
  const now = new Date();
  return new Date(now.getFullYear() - age, now.getMonth(), now.getDate()).toISOString().slice(0, 10);
}

describe('mifflinBMR', () => {
  it('aplica la constante correcta según el sexo', () => {
    // 10·70 + 6.25·175 − 5·30 = 1643.75 → +5 hombre / −161 mujer
    expect(mifflinBMR('male', 70, 175, 30)).toBe(Math.round(1643.75 + 5));
    expect(mifflinBMR('female', 70, 175, 30)).toBe(Math.round(1643.75 - 161));
  });
});

describe('calcAge', () => {
  it('no cuenta el cumpleaños que aún no ha llegado', () => {
    expect(calcAge(birthDateForAge(40))).toBe(40);
  });
});

describe('computeAuto', () => {
  // El caso concreto del informe (05-8): las 2000 kcal fijas que escribía el
  // asistente de alta estaban ~700 por encima del mantenimiento de esta persona.
  const mujer = { sex: 'female' as const, w: 55, h: 160, edad: 52 };

  it('a una mujer de 55 kg, 52 años y sedentaria NO le asigna 2000 kcal', () => {
    const r = computeAuto(
      mujer.sex, birthDateForAge(mujer.edad), mujer.w, mujer.h, 'sedentario', 'reducir_grasa'
    );
    expect(r.kcal).toBeLessThan(1500);
    expect(r.kcal).not.toBe(2000);
  });

  it('mantenimiento = BMR × factor de actividad, y la meta ajusta sobre él', () => {
    const bd = birthDateForAge(mujer.edad);
    const bmr = mifflinBMR(mujer.sex, mujer.w, mujer.h, mujer.edad);
    const tdee = Math.round(bmr * 1.2); // sedentario

    const mantener = computeAuto(mujer.sex, bd, mujer.w, mujer.h, 'sedentario', 'mantener');
    expect(mantener.tdee).toBe(tdee);
    expect(mantener.kcal).toBe(tdee); // ajuste ×1.00

    const deficit = computeAuto(mujer.sex, bd, mujer.w, mujer.h, 'sedentario', 'reducir_grasa');
    expect(deficit.kcal).toBe(Math.round(tdee * 0.80));

    const superavit = computeAuto(mujer.sex, bd, mujer.w, mujer.h, 'sedentario', 'aumentar_musculo');
    expect(superavit.kcal).toBe(Math.round(tdee * 1.10));
  });

  it('los tres porcentajes de macros suman exactamente 100', () => {
    const casos: Array<Parameters<typeof computeAuto>> = [
      ['female', birthDateForAge(52), 55, 160, 'sedentario', 'reducir_grasa'],
      ['male', birthDateForAge(30), 85, 183, 'muy_activo', 'aumentar_musculo'],
      ['male', birthDateForAge(45), 70, 170, 'activo', 'mantener'],
      ['female', birthDateForAge(22), 62, 168, 'poco_activo', 'mantener'],
    ];
    for (const c of casos) {
      const r = computeAuto(...c);
      expect(r.protPct + r.grasaPct + r.hcPct).toBe(100);
      expect(r.kcal).toBeGreaterThan(0);
      expect(r.hcG).toBeGreaterThanOrEqual(0);
    }
  });

  it('la proteína son 2 g por kg de peso', () => {
    const r = computeAuto('male', birthDateForAge(30), 80, 180, 'activo', 'mantener');
    expect(r.protG).toBe(160);
  });

  it('el mantenimiento coincide con estimateMaintenanceKcal, que usa el motor de periodización', () => {
    const bd = birthDateForAge(38);
    const r = computeAuto('male', bd, 78, 178, 'activo', 'reducir_grasa');
    const est = estimateMaintenanceKcal(
      { sex: 'male', birthDate: bd, heightCm: 178, activityLevel: 'activo' }, 78
    );
    // Si estas dos definiciones se separan, el atleta ve un número en Nutrición
    // y el coach ve otro distinto en el panel de periodización.
    expect(est).toBe(r.tdee);
  });
});

describe('estimateMaintenanceKcal', () => {
  it('devuelve null en vez de inventar una cifra cuando falta un dato', () => {
    const completo = { sex: 'male' as const, birthDate: birthDateForAge(30), heightCm: 180, activityLevel: 'activo' as const };
    expect(estimateMaintenanceKcal(completo, 80)).toBeGreaterThan(0);
    expect(estimateMaintenanceKcal(completo, undefined)).toBeNull();
    expect(estimateMaintenanceKcal({ ...completo, sex: undefined }, 80)).toBeNull();
    expect(estimateMaintenanceKcal({ ...completo, heightCm: undefined }, 80)).toBeNull();
    expect(estimateMaintenanceKcal({ ...completo, activityLevel: undefined }, 80)).toBeNull();
  });
});
