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
