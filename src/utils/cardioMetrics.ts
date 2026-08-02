// Motor de cálculo de F4 — docs/FITIV-analisis-y-plan.md §5. Todo esto es
// ciencia del ejercicio publicada, no lógica propietaria de FITIV: se
// reimplementa con precisión sin tocar su código. Donde el análisis verificó
// un número real de una sesión de Dani, se referencia en el test — el resto
// son fórmulas estándar (Keytel, Banister, Coggan/TrainingPeaks) con las que
// solo cabe esperar una aproximación, nunca un calco exacto de su app.

export type Sex = 'male' | 'female';

// ─── CALORÍAS (Keytel, Universidad de Ciudad del Cabo) ─────────────────────
//
// FITIV publica esta fórmula mal transcrita en su soporte: multiplica por
// 4,184 en vez de dividir, y en mujeres solo cambia la constante en vez de
// los cuatro coeficientes. Es la causa documentada de su queja histórica de
// "las calorías son groseramente inexactas". Aquí va la Keytel correcta.
export interface CaloriesInput {
  avgHR: number;
  weightKg: number;
  ageYears: number;
  sex: Sex;
  durationMin: number;
}

export function caloriesKeytel({ avgHR, weightKg, ageYears, sex, durationMin }: CaloriesInput): number {
  const kcalPerMin = sex === 'female'
    ? (-20.4022 + 0.4472 * avgHR - 0.1263 * weightKg + 0.0740 * ageYears) / 4.184
    : (-55.0969 + 0.6309 * avgHR + 0.1988 * weightKg + 0.2017 * ageYears) / 4.184;
  return Math.max(0, kcalPerMin) * durationMin;
}

/**
 * "Calorías activas" = Keytel total menos el gasto basal (Mifflin-St Jeor,
 * ya usado en `energyCalc.ts` para el mantenimiento nutricional — se reusa
 * la misma fórmula, ya validada en la app, en vez de inventar una nueva)
 * durante ese mismo tramo. Es la diferencia real observada en el informe de
 * FITIV (244 activas / 278 totales, §4bis.4): el metabolismo basal de los
 * ~24 min de sesión. Solo calculable con altura (Mifflin-St Jeor la exige).
 */
export function caloriesActive(totalKcal: number, bmrKcalPerDay: number, durationMin: number): number {
  const bmrForDuration = (bmrKcalPerDay / 1440) * durationMin;
  return Math.max(0, totalKcal - bmrForDuration);
}

// ─── METs Y PUNTOS FITIV ────────────────────────────────────────────────────
//
// 1 MET = ritmo metabólico en reposo ≈ 1 kcal/kg/hora (definición estándar de
// fisiología del ejercicio) — de ahí que FITIV diga "1 MET ≈ 70 kcal/h" para
// una persona de referencia de 70kg; aquí se individualiza por peso real.
export function metsFromCalories(totalKcal: number, durationMin: number, weightKg: number): number {
  if (durationMin <= 0 || weightKg <= 0) return 0;
  const kcalPerHour = totalKcal / (durationMin / 60);
  return kcalPerHour / weightKg;
}

const FITIV_POINTS_MET_THRESHOLD = 3.0; // §5.5: estiramientos/yoga suave no puntúan

/** METs medios × minutos — normaliza entre atletas de distinto peso/sexo/edad (§5.5). */
export function fitivPoints(mets: number, durationMin: number): number {
  if (mets <= FITIV_POINTS_MET_THRESHOLD) return 0;
  return Math.round(mets * durationMin);
}

// ─── TRIMP (Banister, ponderación exponencial de Morton) ───────────────────
export interface TrimpInput {
  avgHR: number;
  restingHR: number;
  maxHR: number;
  durationMin: number;
  sex: Sex;
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

export function trimpBanister({ avgHR, restingHR, maxHR, durationMin, sex }: TrimpInput): number {
  const span = maxHR - restingHR;
  if (span <= 0) return 0;
  const hrRatio = clamp01((avgHR - restingHR) / span);
  const weight = sex === 'female' ? 0.86 * Math.exp(1.67 * hrRatio) : 0.64 * Math.exp(1.92 * hrRatio);
  return durationMin * hrRatio * weight;
}

// ─── hrTSS (TrainingPeaks, análogo de TSS sin potenciómetro) ───────────────
//
// IF (Intensity Factor) = FC media / LTHR. Solo calculable si el atleta ya
// tiene LTHR de un test de umbral (§5 del análisis original, Test 2 — 30 min
// contrarreloj); sin LTHR no hay ancla fiable y se omite en vez de inventar.
export function hrTss(avgHR: number, lthr: number | undefined, durationSec: number): number | undefined {
  if (!lthr || lthr <= 0) return undefined;
  const intensityFactor = avgHR / lthr;
  const durationHours = durationSec / 3600;
  return durationHours * intensityFactor * intensityFactor * 100;
}

// ─── ESFUERZO PERCIBIDO (PE) ────────────────────────────────────────────────
export const PE_LABELS = [
  'Muy ligero', 'Ligero', 'Cómodo', 'Moderado', 'Exigente',
  'Duro', 'Intenso', 'Muy intenso', 'Casi máximo', 'Esfuerzo máximo',
] as const;

export function peLabel(pe: number): string {
  const index = Math.min(9, Math.max(0, Math.round(pe) - 1));
  return PE_LABELS[index];
}

/** Effort Minutes = PE × duración (§5.4) — la única carga válida también para fuerza. */
export function effortMinutes(pe: number, durationMin: number): number {
  return pe * durationMin;
}

/**
 * FITIV "autoestima el PE desde la FC y lo corrige aprendiendo del histórico
 * del usuario" (§5.4) — aquí, sin histórico propio todavía, se aproxima con
 * la zona que domina el tiempo de la sesión. Es solo una sugerencia inicial:
 * el atleta la ajusta con el selector.
 */
export function suggestedPerceivedEffort(timeInZoneSec: { z1: number; z2: number; z3: number; z4: number; z5: number }): number {
  const ZONE_PE: Record<'z1' | 'z2' | 'z3' | 'z4' | 'z5', number> = { z1: 2, z2: 4, z3: 6, z4: 8, z5: 10 };
  const zones = (['z1', 'z2', 'z3', 'z4', 'z5'] as const);
  const totalSec = zones.reduce((sum, z) => sum + timeInZoneSec[z], 0);
  if (totalSec === 0) return 5;
  const weighted = zones.reduce((sum, z) => sum + timeInZoneSec[z] * ZONE_PE[z], 0);
  return Math.round(weighted / totalSec);
}

// ─── TRAINING LOAD RATIO (ATL/CTL, Coggan/TrainingPeaks) ───────────────────
export type TrainingLoadState = 'undertraining' | 'optimal' | 'peaking' | 'overreaching' | 'at_risk';

export const TLR_LABEL: Record<TrainingLoadState, string> = {
  undertraining: 'Undertraining', optimal: 'Optimal', peaking: 'Peaking',
  overreaching: 'Overreaching', at_risk: 'At Risk',
};

/** Cortes exactos del §5.4 del análisis, confirmados visualmente en la app (§4bis.5). */
export function classifyTlr(tlr: number): TrainingLoadState {
  if (tlr < 0.8) return 'undertraining';
  if (tlr < 1.1) return 'optimal';
  if (tlr < 1.3) return 'peaking';
  if (tlr < 1.5) return 'overreaching';
  return 'at_risk';
}

export interface DailyLoadPoint { date: string; atl: number; ctl: number; tlr: number }

const ATL_DAYS = 7;
const CTL_DAYS = 42;
const ONE_DAY_MS = 86_400_000;

/**
 * Media móvil exponencial recursiva día a día (ATL a 7 días / CTL a 28–42
 * días, §5.4). `dailyLoads` no necesita ser continua: los huecos entre
 * sesiones se rellenan a carga 0 (día de descanso), que es justo lo que hace
 * bajar el ATL más rápido que el CTL tras parar de entrenar.
 */
export function computeTrainingLoad(dailyLoads: { date: string; load: number }[]): DailyLoadPoint[] {
  if (dailyLoads.length === 0) return [];
  const byDate = new Map(dailyLoads.map(d => [d.date, d.load]));
  const sortedDates = [...byDate.keys()].sort();
  const start = new Date(sortedDates[0] + 'T00:00:00Z').getTime();
  const end = new Date(sortedDates[sortedDates.length - 1] + 'T00:00:00Z').getTime();

  const points: DailyLoadPoint[] = [];
  let atl = 0;
  let ctl = 0;
  for (let t = start; t <= end; t += ONE_DAY_MS) {
    const date = new Date(t).toISOString().slice(0, 10);
    const load = byDate.get(date) ?? 0;
    atl = atl + (load - atl) / ATL_DAYS;
    ctl = ctl + (load - ctl) / CTL_DAYS;
    const tlr = ctl > 0 ? atl / ctl : 0;
    points.push({ date, atl, ctl, tlr });
  }
  return points;
}

/** Vista mínima de CardioSession que necesita el agregado de carga — evita acoplar este módulo al tipo completo. */
export interface CardioSessionLoadInput { date: string; trimp?: number }

/** Suma el TRIMP por día de un historial de sesiones — la entrada de `computeTrainingLoad`. */
export function dailyLoadFromSessions(sessions: CardioSessionLoadInput[]): { date: string; load: number }[] {
  const byDate = new Map<string, number>();
  for (const s of sessions) {
    if (!s.trimp) continue;
    byDate.set(s.date, (byDate.get(s.date) ?? 0) + s.trimp);
  }
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, load]) => ({ date, load }));
}

// ─── HEART RATE RECOVERY ─────────────────────────────────────────────────
//
// Caída de FC al minuto 1 y al minuto 2 de vuelta a la calma tras terminar
// (§5.6). Con banda BLE hace falta grabar 2 min extra después de "terminar"
// — la sesión en sí no trae esos datos, por eso es un paso aparte en la UI
// (CooldownPrompt), no un cálculo sobre las muestras ya guardadas.
export interface HrrEligibilityInput { durationSec: number; maxHR?: number; avgHR?: number; athleteMaxHR?: number }
export type HrrEligibility = { eligible: true } | { eligible: false; reason: string };

export function hrrEligibility({ durationSec, maxHR, avgHR, athleteMaxHR }: HrrEligibilityInput): HrrEligibility {
  if (durationSec < 600) return { eligible: false, reason: 'La sesión debe durar al menos 10 minutos.' };
  if (!maxHR || !avgHR || !athleteMaxHR) return { eligible: false, reason: 'Faltan datos de FC para calcularlo.' };
  if (maxHR < athleteMaxHR * 0.7) return { eligible: false, reason: 'La intensidad máxima fue demasiado baja.' };
  if (avgHR < athleteMaxHR * 0.5) return { eligible: false, reason: 'La intensidad media fue demasiado baja.' };
  return { eligible: true };
}

export function heartRateRecovery(peakHR: number, hrAt1Min: number | undefined, hrAt2Min: number | undefined): { hrr1Min?: number; hrr2Min?: number } {
  return {
    hrr1Min: hrAt1Min !== undefined ? peakHR - hrAt1Min : undefined,
    hrr2Min: hrAt2Min !== undefined ? peakHR - hrAt2Min : undefined,
  };
}

const HRR_SAMPLE_TOLERANCE_MS = 15_000;

/**
 * La muestra de la vuelta a la calma más cercana a `targetSec` desde que
 * empezó el cronómetro de recuperación. Si el atleta saltó el cooldown antes
 * de llegar ahí, no hay ninguna muestra suficientemente cerca — se omite en
 * vez de usar un dato de otro instante y llamarlo "minuto 2".
 */
export function sampleNearElapsed(samples: { bpm: number; atMs: number }[], startMs: number, targetSec: number): number | undefined {
  if (samples.length === 0) return undefined;
  const targetMs = startMs + targetSec * 1000;
  let best = samples[0];
  let bestDiff = Math.abs(samples[0].atMs - targetMs);
  for (const s of samples) {
    const diff = Math.abs(s.atMs - targetMs);
    if (diff < bestDiff) { best = s; bestDiff = diff; }
  }
  return bestDiff > HRR_SAMPLE_TOLERANCE_MS ? undefined : best.bpm;
}

// ─── HRV MATINAL Y READINESS (F8 — solo viable con banda que expone RR) ────
//
// §7 del análisis: con banda de pecho el HRV solo es viable como medición
// matinal puntual (3 min tumbado), no continua como el "Recovery" de FITIV.
// El resto de su score (sueño, SpO2, temperatura) no es alcanzable — no se
// intenta reproducir, solo la parte real: RMSSD + comparación con línea base.

/** RMSSD (ms) — la métrica estándar de HRV de corto plazo a partir de los intervalos RR consecutivos. */
export function rmssd(rrIntervalsMs: number[]): number | undefined {
  if (rrIntervalsMs.length < 2) return undefined;
  let sumSquaredDiffs = 0;
  for (let i = 1; i < rrIntervalsMs.length; i++) {
    const diff = rrIntervalsMs[i] - rrIntervalsMs[i - 1];
    sumSquaredDiffs += diff * diff;
  }
  return Math.sqrt(sumSquaredDiffs / (rrIntervalsMs.length - 1));
}

export interface HrvBaseline { mean: number; sd: number }

/** Media y desviación típica del RMSSD de las últimas lecturas — la HRV es muy individual, se compara contra uno mismo, no contra una tabla. */
export function hrvBaseline(pastRmssdValues: number[]): HrvBaseline | undefined {
  if (pastRmssdValues.length < 3) return undefined; // hacen falta varios días para que la línea base signifique algo
  const mean = pastRmssdValues.reduce((a, b) => a + b, 0) / pastRmssdValues.length;
  const variance = pastRmssdValues.reduce((sum, v) => sum + (v - mean) ** 2, 0) / pastRmssdValues.length;
  return { mean, sd: Math.sqrt(variance) };
}

/** 0–100, centrado en 50 = "en tu línea base". ±2 desviaciones típicas cubre toda la escala. */
export function readinessScoreFromHrv(todayRmssd: number, baseline: HrvBaseline): number {
  if (baseline.sd <= 0) return 50;
  const z = (todayRmssd - baseline.mean) / baseline.sd;
  return Math.round(Math.min(100, Math.max(0, 50 + z * 25)));
}

export type ReadinessBand = 'poor' | 'low' | 'moderate' | 'high' | 'prime';

/** Cortes confirmados visualmente en la app (§4bis.5): Pobre 0-24 · Bajo 25-49 · Moderado 50-74 · Alto 75-89 · Prime 90-100. */
export const READINESS_LABEL: Record<ReadinessBand, string> = {
  poor: 'Pobre', low: 'Bajo', moderate: 'Moderado', high: 'Alto', prime: 'Prime',
};

export function classifyReadiness(score: number): ReadinessBand {
  if (score < 25) return 'poor';
  if (score < 50) return 'low';
  if (score < 75) return 'moderate';
  if (score < 90) return 'high';
  return 'prime';
}

// ─── TRAINING FOCUS (reparto por bloques de zona, §5.7) ────────────────────
export interface TrainingFocus { anaerobicPct: number; highAerobicPct: number; lowAerobicPct: number }

export function trainingFocus(timeInZoneSec: { z1: number; z2: number; z3: number; z4: number; z5: number }): TrainingFocus {
  const { z2, z3, z4, z5 } = timeInZoneSec;
  const total = timeInZoneSec.z1 + z2 + z3 + z4 + z5;
  if (total === 0) return { anaerobicPct: 0, highAerobicPct: 0, lowAerobicPct: 0 };
  return {
    anaerobicPct: Math.round((z5 / total) * 100),
    highAerobicPct: Math.round((z4 / total) * 100),
    lowAerobicPct: Math.round(((z2 + z3) / total) * 100),
  };
}
