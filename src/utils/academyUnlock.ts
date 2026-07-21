import { UnlockRule, AcademyProgress, UserProfile } from '../types';

export interface UnlockContext {
  profile: UserProfile;
  progress: AcademyProgress;
}

export interface UnlockResult {
  unlocked: boolean;
  reason?: string; // human-readable, shown under the blurred card
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

// Evaluated client-side against the athlete's own profile/progress — no
// server-side enforcement needed since the content itself (video ids) isn't
// sensitive, same trust model as the rest of the app's client-computed gating.
export function evaluateUnlockRule(rule: UnlockRule | undefined, ctx: UnlockContext, courseTitleById: (courseId: string) => string): UnlockResult {
  if (!rule || rule.type === 'immediate') return { unlocked: true };

  if (rule.type === 'daysSinceJoin') {
    if (!ctx.profile.createdAt) return { unlocked: true }; // sin fecha de alta registrada, no bloquear
    const elapsed = daysSince(ctx.profile.createdAt);
    if (elapsed >= rule.value) return { unlocked: true };
    return { unlocked: false, reason: `Se desbloquea en ${rule.value - elapsed} día${rule.value - elapsed === 1 ? '' : 's'}` };
  }

  if (rule.type === 'level') {
    if (ctx.profile.level >= rule.value) return { unlocked: true };
    return { unlocked: false, reason: `Nivel ${rule.value} requerido (vas por nivel ${ctx.profile.level})` };
  }

  if (rule.type === 'prerequisite') {
    const pct = ctx.progress.courseProgress[rule.value] ?? 0;
    if (pct >= 100) return { unlocked: true };
    return { unlocked: false, reason: `Completa antes "${courseTitleById(rule.value)}"` };
  }

  return { unlocked: true };
}
