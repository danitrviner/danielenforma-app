import { describe, expect, it } from 'vitest';
import { deduplicateByEmail } from './profiles';
import type { UserProfile } from '../types';

const perfil = (p: Partial<UserProfile>): UserProfile => ({
  userId: 'uid',
  email: 'a@b.com',
  displayName: 'X',
  role: 'client',
  avatarUrl: '',
  level: 1,
  xp: 0,
  currentStreak: 0,
  maxStreak: 0,
  initialWeight: 0,
  targetWeight: 0,
  actualWeight: 0,
  ...p,
} as UserProfile);

/* El fallo real que esto previene, visto en producción el 2026-08-30:
 * `user_profiles/inLfw7oXvVTE6wGqtN0eDokKs1y2` tenía solo pesos y fechas de
 * plan —sin `email`, sin `role`— porque su cuenta de Auth ya no existía. El
 * `p.email.toLowerCase()` de la deduplicación lanzaba un TypeError que subía
 * hasta el catch de `getAllUserProfiles`, y ese catch devuelve el atleta de
 * demo. Resultado: el coach dejaba de ver a TODOS sus atletas y en su lugar le
 * salía "Alex Rivera". Un fallo total disfrazado de lista con un elemento. */
describe('perfiles incompletos no tumban la lista del coach', () => {
  it('descarta un perfil sin email en vez de lanzar', () => {
    const perfiles = [
      perfil({ userId: 'u1', email: 'ana@x.com' }),
      { userId: 'roto', actualWeight: 75.1 } as unknown as UserProfile,
      perfil({ userId: 'u2', email: 'luis@x.com' }),
    ];
    const out = deduplicateByEmail(perfiles);
    expect(out.map(p => p.userId)).toEqual(['u1', 'u2']);
  });

  it('tampoco lanza con email vacío o no textual', () => {
    const perfiles = [
      perfil({ userId: 'u1', email: '' }),
      { userId: 'u2', email: null } as unknown as UserProfile,
      perfil({ userId: 'u3', email: 'ok@x.com' }),
    ];
    expect(deduplicateByEmail(perfiles).map(p => p.userId)).toEqual(['u3']);
  });

  it('sigue quedándose con el UID real frente al de sandbox', () => {
    const out = deduplicateByEmail([
      perfil({ userId: 'client_alex_default', email: 'ana@x.com' }),
      perfil({ userId: 'realUid123', email: 'ANA@x.com' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].userId).toBe('realUid123');
  });
});
