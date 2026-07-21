import { UserProfile } from '../types';
import { updateUserProfile } from '../dbService';

export const XP_PER_LEVEL = 100;

export function levelForXp(xp: number): number {
  return Math.floor(xp / XP_PER_LEVEL) + 1;
}

// Suma XP y recalcula el nivel — misma fuente (`UserProfile.xp`/`level`) que ya
// usaba el resto de la app (roadmap, ladder de niveles), sin inventar una
// colección `athleteProgression` aparte (§7 del plan, simplificado).
export async function grantXp(profile: UserProfile, amount: number): Promise<{ xp: number; level: number }> {
  const xp = profile.xp + amount;
  const level = levelForXp(xp);
  await updateUserProfile(profile.userId, { xp, level });
  return { xp, level };
}
