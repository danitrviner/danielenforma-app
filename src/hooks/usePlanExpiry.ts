import { useMemo } from 'react';

export interface PlanExpiry {
  daysLeft: number | null;
  expired: boolean;
  expiringSoon: boolean; // 0-30 days left, not yet expired
}

// Pure calc, safe to call directly inside a .map() (list of many athletes)
// where the hook form below can't be used. Single source of truth — replaces
// the identical planStartDate/planDurationMonths → days-left math
// reimplemented separately in ClientsScreen's athlete cards and ClientHub's
// header badge.
export function calcPlanExpiry(profile: { planStartDate?: string; planDurationMonths?: 3 | 6 | 12 }): PlanExpiry {
  if (!profile.planStartDate || !profile.planDurationMonths) {
    return { daysLeft: null, expired: false, expiringSoon: false };
  }
  const [y, m, d] = profile.planStartDate.split('-').map(Number);
  const end = new Date(y, m - 1 + profile.planDurationMonths, d);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const daysLeft = Math.floor((end.getTime() - today.getTime()) / 86_400_000);
  return {
    daysLeft,
    expired: daysLeft < 0,
    expiringSoon: daysLeft >= 0 && daysLeft <= 30,
  };
}

export function usePlanExpiry(profile: { planStartDate?: string; planDurationMonths?: 3 | 6 | 12 }): PlanExpiry {
  return useMemo(() => calcPlanExpiry(profile), [profile.planStartDate, profile.planDurationMonths]);
}
