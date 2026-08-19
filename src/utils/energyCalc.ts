import { ActivityLevel, GoalBody } from '../types';

// Shared with OnboardingForm.tsx's auto-calc so the periodization engine's
// "mantenimiento estimado" always matches the number the coach saw at onboarding.
export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentario:  1.2,
  poco_activo: 1.375,
  activo:      1.55,
  muy_activo:  1.725,
};

export const GOAL_ADJUSTMENTS: Record<GoalBody, number> = {
  reducir_grasa:    0.80,
  mantener:         1.00,
  aumentar_musculo: 1.10,
};

// 1kg of bodyweight change ≈ 7700 kcal of cumulative energy balance.
export const KCAL_PER_KG = 7700;

export function calcAge(birthDate: string): number {
  const dob = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  if (now.getMonth() < dob.getMonth() ||
    (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate())) age--;
  return Math.max(0, age);
}

export function mifflinBMR(sex: 'male' | 'female', w: number, h: number, age: number): number {
  return Math.round(10 * w + 6.25 * h - 5 * age + (sex === 'male' ? 5 : -161));
}

interface MaintenanceInput {
  sex?: 'male' | 'female';
  birthDate?: string;
  heightCm?: number;
  activityLevel?: ActivityLevel;
}

// Mifflin-St Jeor BMR × activity factor. Pass the athlete's most recent known
// weight (e.g. their latest bodyweight log) so the estimate stays current as
// their body changes over the periodization; falls back to the onboarding
// weight when no more recent value is available.
export function estimateMaintenanceKcal(onboarding: MaintenanceInput, weightKg: number | undefined): number | null {
  if (!onboarding.sex || !onboarding.birthDate || !onboarding.heightCm || !onboarding.activityLevel || !weightKg) return null;
  const age = calcAge(onboarding.birthDate);
  const bmr = mifflinBMR(onboarding.sex, weightKg, onboarding.heightCm, age);
  return Math.round(bmr * ACTIVITY_FACTORS[onboarding.activityLevel]);
}

export interface AutoCalc {
  bmr: number; tdee: number; kcal: number;
  protG: number; grasaG: number; hcG: number;
  protPct: number; grasaPct: number; hcPct: number;
}

// Vivía dentro de OnboardingForm.tsx (el alta que rellena el coach). Sube aquí
// porque el asistente de alta del ATLETA tiene que producir exactamente el mismo
// número: antes escribía 2000 kcal fijas para todo el mundo (05-8), y ese número
// es el que ve el atleta en Nutrición, el que ve el coach en el hub y el que
// consume el asistente de IA. Una sola definición, dos llamantes.
export function computeAuto(
  sex: 'male' | 'female', birthDate: string,
  w: number, h: number, level: ActivityLevel, goal: GoalBody,
): AutoCalc {
  const age    = calcAge(birthDate);
  const bmr    = mifflinBMR(sex, w, h, age);
  const tdee   = Math.round(bmr * ACTIVITY_FACTORS[level]);
  const kcal   = Math.round(tdee * GOAL_ADJUSTMENTS[goal]);
  const protG  = Math.round(2 * w);
  const pKcal  = protG * 4;
  const gKcal  = Math.round(kcal * 0.25);
  const grasaG = Math.round(gKcal / 9);
  const hcKcal = Math.max(0, kcal - pKcal - gKcal);
  const hcG    = Math.round(hcKcal / 4);
  const tot    = pKcal + gKcal + hcKcal;
  const protPct  = Math.round((pKcal / tot) * 100);
  const grasaPct = Math.round((gKcal / tot) * 100);
  const hcPct    = 100 - protPct - grasaPct;
  return { bmr, tdee, kcal, protG, grasaG, hcG, protPct, grasaPct, hcPct };
}
