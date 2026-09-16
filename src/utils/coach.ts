/* ═══════════════════════════════════════════════════════════════════════════
   Quién es el coach.

   Estaba escrito ocho veces a mano —cinco `COACH_EMAIL`, tres `OWNER_EMAIL`—
   en ficheros que no se miran entre sí, más el `role === 'coach' || email ===
   OWNER` repetido cinco veces dentro de App.tsx. Con un correo suelto por
   fichero, cambiarlo es encontrarlos todos; olvidarse de uno no rompe nada de
   forma visible, solo deja una pantalla creyendo que quien está delante no es
   el coach.

   **No está en Firestore a propósito.** `firestore.rules` tiene este mismo
   correo escrito dentro de `isCoach()`, y las reglas son la autoridad de
   verdad: son ellas las que dejan leer y escribir. Si el cliente lo sacara de
   un documento, podría creer que el coach es otro mientras el servidor dice
   que no — una app que enseña la pantalla del coach y falla cada escritura.
   Cuando cambie, cambian los tres a la vez: este fichero, `api/_lib/auth.ts`
   y `firestore.rules`.
   ═══════════════════════════════════════════════════════════════════════════ */

export const COACH_EMAIL = 'danitrviner@gmail.com';

/** El dueño de la app, por correo. Compara en minúsculas: Firebase conserva
 *  las mayúsculas con las que se escribió el correo al registrarse. */
export function esElCoachPermanente(email: string | null | undefined): boolean {
  return (email ?? '').toLowerCase() === COACH_EMAIL;
}

/** Trabaja como coach en esta sesión: o tiene el rol, o es el dueño. Los dos
 *  caminos existen porque el rol se puede conceder a otra persona, pero el
 *  dueño nunca puede quedarse fuera aunque su documento de perfil se pierda. */
export function esCoach(perfil: { role?: string; email?: string } | null | undefined): boolean {
  if (!perfil) return false;
  return perfil.role === 'coach' || esElCoachPermanente(perfil.email);
}
