import type { UserProfile } from '../types';
import { updateUserProfile } from '../dbService';

/* ═══════════════════════════════════════════════════════════════════════════
   Avisos que solo salen N veces (guía de intercambios, coachmarks…)

   Antes la cuenta vivía solo en localStorage, y el cierre de sesión borra todo
   lo que empieza por `enforma_` (utils/cierreDeSesion.ts). Resultado: al atleta
   que entra y sale de la app —o la abre en otro móvil— la guía de intercambios
   le salía cada vez que pulsaba «Añadir» (Dani, 25-10-2026).

   Ahora la cuenta se guarda también en su perfil (`avisosVistos`), que es dato
   suyo y sobrevive a todo. localStorage se queda como caché inmediata: la
   escritura en Firestore puede tardar o fallar sin red, y entre tanto no debe
   volver a salir.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Valor que marca un aviso cerrado a mano: no vuelve, tenga las vistas que tenga. */
export const DESCARTADO = 999;

const claveLocal = (id: string, email: string) => `enforma_aviso_${id}_${email}`;

/** Lo que ya se ha escrito en esta sesión: el `profile` que llega por props no
 *  se refresca al escribir, y sin esto cada escritura pisaría a la anterior. */
const enMemoria = new Map<string, Record<string, number>>();

function leerLocal(id: string, email: string, legado?: string): number {
  try {
    const raw = localStorage.getItem(claveLocal(id, email));
    if (raw !== null) {
      const n = parseInt(raw, 10);
      return Number.isNaN(n) ? DESCARTADO : n;
    }
    // Formato de antes (Coachmark y guía): 'x' o '1' = cerrado; un número = vistas.
    const viejo = legado ? localStorage.getItem(legado) : null;
    if (viejo === null) return 0;
    if (viejo === 'x' || viejo === '1') return DESCARTADO;
    const n = parseInt(viejo, 10);
    return Number.isNaN(n) ? DESCARTADO : n;
  } catch {
    return 0;
  }
}

/** Veces que el atleta ha visto este aviso (DESCARTADO si lo cerró). */
export function vecesVisto(profile: Pick<UserProfile, 'email' | 'avisosVistos'>, id: string, legado?: string): number {
  const remoto = enMemoria.get(profile.email)?.[id] ?? profile.avisosVistos?.[id] ?? 0;
  return Math.max(remoto, leerLocal(id, profile.email, legado));
}

/** Apunta las vistas en el móvil y en el perfil. Un fallo de red no rompe nada. */
export function apuntarVisto(profile: Pick<UserProfile, 'email' | 'userId' | 'avisosVistos'>, id: string, veces: number): void {
  try { localStorage.setItem(claveLocal(id, profile.email), String(veces)); } catch { /* sin almacenamiento */ }
  const mapa = { ...(profile.avisosVistos ?? {}), ...(enMemoria.get(profile.email) ?? {}), [id]: veces };
  enMemoria.set(profile.email, mapa);
  if (!profile.userId) return;
  updateUserProfile(profile.userId, { avisosVistos: mapa }).catch(() => { /* queda en local */ });
}
