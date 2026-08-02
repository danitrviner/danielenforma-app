import { describe, it, expect } from 'vitest';
import {
  caloriesKeytel, caloriesActive, metsFromCalories, fitivPoints, trimpBanister, hrTss,
  peLabel, effortMinutes, suggestedPerceivedEffort, classifyTlr, computeTrainingLoad, trainingFocus,
  dailyLoadFromSessions, hrrEligibility, heartRateRecovery, sampleNearElapsed,
  rmssd, hrvBaseline, readinessScoreFromHrv, classifyReadiness,
} from './cardioMetrics';
import { mifflinBMR } from './energyCalc';

// Sesión real analizada en docs/FITIV-analisis-y-plan.md §4bis.4 (cinta de
// correr, 23:39 = 23,65 min, FC media 131 / máxima 171). Perfil de zonas de
// Dani confirmado en pantalla: FC reposo 60, FCmax 190. Edad/peso no están
// documentados con exactitud — se asumen ~30 años / 76,5kg (coincide con el
// peso de referencia visto en otros perfiles de la app) solo para contrastar
// que la fórmula cae en el rango correcto, no para un calco exacto.
const REAL_SESSION = { avgHR: 131, maxHR: 171, restingHR: 60, athleteMaxHR: 190, durationMin: 23.65 };

describe('caloriesKeytel — fórmula corregida (FITIV publica la suya mal transcrita, §5.3)', () => {
  it('cae dentro de ~2% de las 278 kcal totales reales de la sesión analizada', () => {
    const kcal = caloriesKeytel({ avgHR: REAL_SESSION.avgHR, weightKg: 76.5, ageYears: 30, sex: 'male', durationMin: REAL_SESSION.durationMin });
    expect(Math.abs(kcal - 278)).toBeLessThan(6);
  });

  it('nunca da negativo con FC muy baja (guarda ante extrapolaciones raras)', () => {
    const kcal = caloriesKeytel({ avgHR: 60, weightKg: 60, ageYears: 20, sex: 'female', durationMin: 5 });
    expect(kcal).toBeGreaterThanOrEqual(0);
  });

  it('mujeres usan los cuatro coeficientes propios, no solo la constante', () => {
    const male = caloriesKeytel({ avgHR: 140, weightKg: 70, ageYears: 30, sex: 'male', durationMin: 20 });
    const female = caloriesKeytel({ avgHR: 140, weightKg: 70, ageYears: 30, sex: 'female', durationMin: 20 });
    expect(male).not.toBeCloseTo(female, 0);
  });
});

describe('caloriesActive — el desglose real de FITIV (244 activas / 278 totales, §4bis.4)', () => {
  it('con un BMR diario plausible (Mifflin-St Jeor ya usado en energyCalc.ts), cae por debajo del total y cerca del rango real', () => {
    const total = 278;
    const bmrPerDay = mifflinBMR('male', 76.5, 178, 30); // altura no documentada — orden de magnitud, no calco exacto
    const active = caloriesActive(total, bmrPerDay, REAL_SESSION.durationMin);
    expect(active).toBeLessThan(total);
    expect(active).toBeGreaterThan(200); // la sesión real fue 244 activas
  });

  it('nunca da negativo en sesiones muy cortas frente a un BMR alto', () => {
    expect(caloriesActive(5, 2000, 10)).toBeGreaterThanOrEqual(0);
  });
});

describe('metsFromCalories', () => {
  it('individualiza por peso real (1 MET ≈ 1 kcal/kg/h), no un fijo de 70kg', () => {
    // 500 kcal en 1h a 100kg → 5 METs; a 50kg → 10 METs. Mismo gasto, MET distinto.
    expect(metsFromCalories(500, 60, 100)).toBeCloseTo(5, 1);
    expect(metsFromCalories(500, 60, 50)).toBeCloseTo(10, 1);
  });

  it('sin peso o duración, no divide por cero', () => {
    expect(metsFromCalories(500, 0, 70)).toBe(0);
    expect(metsFromCalories(500, 60, 0)).toBe(0);
  });
});

describe('fitivPoints — solo puntúan entrenos >3.0 METs (§5.5)', () => {
  it('METs × minutos', () => {
    expect(fitivPoints(8.0, 20)).toBe(160);
  });

  it('yoga suave o estiramientos (≤3.0 METs) no dan puntos', () => {
    expect(fitivPoints(2.5, 45)).toBe(0);
    expect(fitivPoints(3.0, 45)).toBe(0);
  });
});

describe('trimpBanister — Banister con ponderación exponencial de Morton', () => {
  it('cae en el orden de magnitud del TRIMP 24.8 real (TRIMP con FC media infravalora frente a integrar muestra a muestra — esperable)', () => {
    const trimp = trimpBanister({ avgHR: REAL_SESSION.avgHR, restingHR: REAL_SESSION.restingHR, maxHR: REAL_SESSION.athleteMaxHR, durationMin: REAL_SESSION.durationMin, sex: 'male' });
    expect(trimp).toBeGreaterThan(15);
    expect(trimp).toBeLessThan(30);
  });

  it('a más intensidad relativa, más TRIMP por minuto (ponderación exponencial, no lineal)', () => {
    const easy = trimpBanister({ avgHR: 110, restingHR: 60, maxHR: 190, durationMin: 30, sex: 'male' });
    const hard = trimpBanister({ avgHR: 170, restingHR: 60, maxHR: 190, durationMin: 30, sex: 'male' });
    expect(hard).toBeGreaterThan(easy * 2); // no solo proporcional: la curva se dispara
  });

  it('sin rango de FC (maxHR = restingHR), no explota', () => {
    expect(trimpBanister({ avgHR: 100, restingHR: 100, maxHR: 100, durationMin: 20, sex: 'male' })).toBe(0);
  });
});

describe('hrTss — IF = FC media / LTHR (§5.4)', () => {
  it('a FC media = LTHR (IF=1), hrTSS = horas × 100', () => {
    expect(hrTss(150, 150, 3600)).toBeCloseTo(100, 5);
  });

  it('sin LTHR en el perfil, no inventa un valor', () => {
    expect(hrTss(150, undefined, 3600)).toBeUndefined();
  });
});

describe('effortMinutes — PE × duración', () => {
  it('reproduce EXACTO los 177.4 min de esfuerzo reales (7.5 × 23.65)', () => {
    expect(effortMinutes(7.5, REAL_SESSION.durationMin)).toBeCloseTo(177.4, 1);
  });
});

describe('peLabel', () => {
  it('mapea 1..10 a las diez etiquetas, en orden', () => {
    expect(peLabel(1)).toBe('Muy ligero');
    expect(peLabel(7.5)).toBe('Muy intenso'); // redondea a 8 → índice 7
    expect(peLabel(10)).toBe('Esfuerzo máximo');
  });

  it('no rompe fuera de rango', () => {
    expect(peLabel(0)).toBe('Muy ligero');
    expect(peLabel(15)).toBe('Esfuerzo máximo');
  });
});

describe('suggestedPerceivedEffort — sugerencia inicial por zona dominante', () => {
  it('una sesión toda en Z2 sugiere PE bajo-medio', () => {
    expect(suggestedPerceivedEffort({ z1: 0, z2: 1800, z3: 0, z4: 0, z5: 0 })).toBe(4);
  });

  it('una sesión toda en Z5 sugiere PE máximo', () => {
    expect(suggestedPerceivedEffort({ z1: 0, z2: 0, z3: 0, z4: 0, z5: 600 })).toBe(10);
  });

  it('sin ninguna muestra en zona, sugiere un punto medio neutro', () => {
    expect(suggestedPerceivedEffort({ z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 })).toBe(5);
  });
});

describe('classifyTlr — cortes confirmados visualmente en la app (§4bis.5 / §5.4)', () => {
  it.each([
    [0.5, 'undertraining'], [0.9, 'optimal'], [1.2, 'peaking'], [1.4, 'overreaching'], [1.6, 'at_risk'],
  ] as const)('%s → %s', (tlr, expected) => {
    expect(classifyTlr(tlr)).toBe(expected);
  });
});

describe('computeTrainingLoad — ATL a 7 días / CTL a 42 días (Coggan/TrainingPeaks)', () => {
  it('un solo día de carga: ATL sube más rápido que CTL (ventana más corta)', () => {
    const points = computeTrainingLoad([{ date: '2026-01-01', load: 70 }]);
    expect(points).toHaveLength(1);
    expect(points[0].atl).toBeGreaterThan(points[0].ctl);
  });

  it('rellena los huecos entre sesiones con carga 0, no los salta', () => {
    const points = computeTrainingLoad([{ date: '2026-01-01', load: 70 }, { date: '2026-01-05', load: 70 }]);
    expect(points).toHaveLength(5); // 1,2,3,4,5 de enero
    expect(points[2].date).toBe('2026-01-03');
  });

  it('sin sesiones, no devuelve nada', () => {
    expect(computeTrainingLoad([])).toEqual([]);
  });
});

describe('dailyLoadFromSessions', () => {
  it('suma el TRIMP de varias sesiones del mismo día', () => {
    const load = dailyLoadFromSessions([
      { date: '2026-01-01', trimp: 20 },
      { date: '2026-01-01', trimp: 15 },
      { date: '2026-01-02', trimp: 30 },
    ]);
    expect(load).toEqual([{ date: '2026-01-01', load: 35 }, { date: '2026-01-02', load: 30 }]);
  });

  it('ignora sesiones sin TRIMP calculado (sin datos de anamnesis suficientes)', () => {
    expect(dailyLoadFromSessions([{ date: '2026-01-01' }, { date: '2026-01-01', trimp: 10 }])).toEqual([{ date: '2026-01-01', load: 10 }]);
  });
});

describe('hrrEligibility — condiciones del §5.6, con motivo si no se calcula', () => {
  it('sesión demasiado corta', () => {
    const r = hrrEligibility({ durationSec: 300, maxHR: 170, avgHR: 140, athleteMaxHR: 190 });
    expect(r.eligible).toBe(false);
  });

  it('intensidad máxima insuficiente (<70% FCmax)', () => {
    const r = hrrEligibility({ durationSec: 900, maxHR: 120, avgHR: 110, athleteMaxHR: 190 });
    expect(r.eligible).toBe(false);
  });

  it('intensidad media insuficiente (<50% FCmax)', () => {
    const r = hrrEligibility({ durationSec: 900, maxHR: 150, avgHR: 90, athleteMaxHR: 190 });
    expect(r.eligible).toBe(false);
  });

  it('cumple las cuatro condiciones', () => {
    const r = hrrEligibility({ durationSec: 900, maxHR: 171, avgHR: 131, athleteMaxHR: 190 });
    expect(r.eligible).toBe(true);
  });

  it('sin datos de FC del perfil, no calcula (y no lo confunde con "sesión corta")', () => {
    const r = hrrEligibility({ durationSec: 900 });
    expect(r.eligible).toBe(false);
  });
});

describe('heartRateRecovery — caída de FC al min 1 y min 2', () => {
  it('resta el pico menos la FC en cada punto', () => {
    expect(heartRateRecovery(171, 130, 110)).toEqual({ hrr1Min: 41, hrr2Min: 61 });
  });

  it('si se saltó el cooldown antes del minuto 2, ese campo queda sin dato', () => {
    expect(heartRateRecovery(171, 130, undefined)).toEqual({ hrr1Min: 41, hrr2Min: undefined });
  });
});

describe('sampleNearElapsed', () => {
  const start = 1_000_000;
  const samples = [
    { bpm: 171, atMs: start }, { bpm: 150, atMs: start + 30_000 },
    { bpm: 130, atMs: start + 60_000 }, { bpm: 110, atMs: start + 120_000 },
  ];

  it('coge la muestra más cercana al minuto pedido', () => {
    expect(sampleNearElapsed(samples, start, 60)).toBe(130);
    expect(sampleNearElapsed(samples, start, 120)).toBe(110);
  });

  it('si se saltó el cooldown antes de llegar, no inventa un dato lejano', () => {
    const early = samples.slice(0, 2); // solo hasta los 30s
    expect(sampleNearElapsed(early, start, 120)).toBeUndefined();
  });

  it('sin ninguna muestra, no hay nada que devolver', () => {
    expect(sampleNearElapsed([], start, 60)).toBeUndefined();
  });
});

describe('rmssd — HRV de corto plazo a partir de los RR consecutivos', () => {
  it('calcula la raíz cuadrada media de las diferencias sucesivas al cuadrado', () => {
    expect(rmssd([800, 820, 810, 850])).toBeCloseTo(26.46, 1);
  });

  it('RR perfectamente regular da RMSSD 0 (sin variabilidad)', () => {
    expect(rmssd([1000, 1000, 1000])).toBe(0);
  });

  it('con menos de 2 intervalos, no hay nada que calcular', () => {
    expect(rmssd([900])).toBeUndefined();
    expect(rmssd([])).toBeUndefined();
  });
});

describe('hrvBaseline — media/SD de lecturas pasadas, no una tabla poblacional', () => {
  it('calcula media y desviación típica', () => {
    const b = hrvBaseline([40, 42, 38]);
    expect(b?.mean).toBeCloseTo(40, 5);
    expect(b?.sd).toBeCloseTo(1.633, 2);
  });

  it('con menos de 3 lecturas, no hay línea base fiable todavía', () => {
    expect(hrvBaseline([40, 42])).toBeUndefined();
  });
});

describe('readinessScoreFromHrv + classifyReadiness — cortes confirmados en la app (§4bis.5)', () => {
  it('en la línea base exacta, score 50 (Moderado)', () => {
    const score = readinessScoreFromHrv(40, { mean: 40, sd: 4 });
    expect(score).toBe(50);
    expect(classifyReadiness(score)).toBe('moderate');
  });

  it('una desviación típica por encima, sube el score', () => {
    const score = readinessScoreFromHrv(44, { mean: 40, sd: 4 });
    expect(score).toBe(75);
    expect(classifyReadiness(score)).toBe('high');
  });

  it('por debajo de la línea base, baja el score', () => {
    const score = readinessScoreFromHrv(32, { mean: 40, sd: 4 });
    expect(score).toBe(0); // -2 SD, saturado al mínimo de la escala
    expect(classifyReadiness(score)).toBe('poor');
  });

  it.each([[10, 'poor'], [30, 'low'], [60, 'moderate'], [80, 'high'], [95, 'prime']] as const)(
    'score %s → %s', (score, band) => { expect(classifyReadiness(score)).toBe(band); },
  );

  it('sin variación en la línea base (SD=0), punto neutro por seguridad', () => {
    expect(readinessScoreFromHrv(50, { mean: 40, sd: 0 })).toBe(50);
  });
});

describe('trainingFocus — reparto real vs objetivo del §5.7', () => {
  it('reparte los porcentajes por bloque', () => {
    const focus = trainingFocus({ z1: 0, z2: 600, z3: 300, z4: 90, z5: 10 });
    // total 1000s: (z2+z3)=900→90% · z4=90→9% · z5=10→1%
    expect(focus.lowAerobicPct).toBe(90);
    expect(focus.highAerobicPct).toBe(9);
    expect(focus.anaerobicPct).toBe(1);
  });

  it('sesión vacía no divide por cero', () => {
    expect(trainingFocus({ z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 })).toEqual({ anaerobicPct: 0, highAerobicPct: 0, lowAerobicPct: 0 });
  });
});
