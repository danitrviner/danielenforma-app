import { useMemo } from 'react';

export interface PlanExpiry {
  daysLeft: number | null;
  expired: boolean;
  expiringSoon: boolean; // 0-30 days left, not yet expired
  /** Semana actual del plan (1-based) y semanas totales — null sin plan
   * fechado. "Semana 11 de 24" mide el plan en semanas de programa en vez
   * de días restantes (patrón "Week X of Y" de HubFit) — más útil que
   * daysLeft a la hora de programar entrenos/dietas. weekNumber está
   * clampado a [1, totalWeeks]: nunca semana 0 el día de inicio, nunca una
   * semana fuera de rango tras vencer el plan. */
  weekNumber: number | null;
  totalWeeks: number | null;
}

// Pure calc, safe to call directly inside a .map() (list of many athletes)
// where the hook form below can't be used. Single source of truth — replaces
// the identical planStartDate/planDurationMonths → days-left math
// reimplemented separately in ClientsScreen's athlete cards and ClientHub's
// header badge.
export function calcPlanExpiry(profile: { planStartDate?: string; planDurationMonths?: 3 | 6 | 12 }): PlanExpiry {
  if (!profile.planStartDate || !profile.planDurationMonths) {
    return { daysLeft: null, expired: false, expiringSoon: false, weekNumber: null, totalWeeks: null };
  }
  const [y, m, d] = profile.planStartDate.split('-').map(Number);
  const start = new Date(y, m - 1, d);
  const end = new Date(y, m - 1 + profile.planDurationMonths, d);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const daysLeft = Math.floor((end.getTime() - today.getTime()) / 86_400_000);
  const totalWeeks = Math.max(1, Math.round((end.getTime() - start.getTime()) / (7 * 86_400_000)));
  const daysSinceStart = Math.floor((today.getTime() - start.getTime()) / 86_400_000);
  const weekNumber = Math.min(Math.max(Math.floor(daysSinceStart / 7) + 1, 1), totalWeeks);
  return {
    daysLeft,
    expired: daysLeft < 0,
    expiringSoon: daysLeft >= 0 && daysLeft <= 30,
    weekNumber,
    totalWeeks,
  };
}

export function usePlanExpiry(profile: { planStartDate?: string; planDurationMonths?: 3 | 6 | 12 }): PlanExpiry {
  // Deps narrowed a propósito a los dos campos que importan: `profile` cambia
  // de identidad en cada render del padre, así que depender del objeto entero
  // recalcularía en cada render sin motivo.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => calcPlanExpiry(profile), [profile.planStartDate, profile.planDurationMonths]);
}
