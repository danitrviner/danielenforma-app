import type { UserProfile } from '../types';
import { updateUserProfile, fusionarConsentimientoIA } from '../dbService';
import { conTimeout, EscrituraEncolada } from '../db/core';
import {
  consentimientoIADesdeLegal,
  type AceptacionesLegales,
} from './aceptacion';

/* ═══════════════════════════════════════════════════════════════════════════
   Dónde vive la prueba del consentimiento

   En `user_profiles/{uid}`, campo `legal`. No en el onboarding, porque el muro
   se enseña ANTES del alta y el documento de onboarding todavía no existe; y
   no en localStorage, porque una prueba de consentimiento que se borra al
   reinstalar la app no prueba nada.

   El consentimiento del análisis asistido se guarda además dentro del
   onboarding, que es de donde lo leen las herramientas del asistente
   (`ai/tools.ts` → `estadoConsentimiento`). Son dos escrituras del mismo hecho
   a propósito: la de `legal` es la prueba y la que decide si se vuelve a
   preguntar; la del onboarding es la que corta el envío de datos. Si la
   segunda falla, no se tumba la primera —el atleta ya ha contestado— pero
   tampoco se da por buena: sin ella, `estadoConsentimiento` sigue devolviendo
   `sin_responder` y el asistente sigue sin poder leer nada. Falla cerrado.
   ═══════════════════════════════════════════════════════════════════════════ */

export async function guardarAceptaciones(
  profile: UserProfile,
  nuevas: AceptacionesLegales,
): Promise<AceptacionesLegales> {
  const legal: AceptacionesLegales = { ...(profile.legal ?? {}), ...nuevas };
  /* Sin plazo, con mala cobertura este `await` no resolvía nunca (Firestore
     no confirma hasta que el servidor responde, y sin red tampoco lanza): el
     botón del muro se quedaba girando para siempre y la única salida era
     cerrar la app y volver a marcarlo todo. Pasado el plazo se da por
     guardado: la escritura ya está en la cola de este dispositivo y Firestore
     la manda sola al recuperar conexión. */
  try {
    await conTimeout('Tu aceptación', updateUserProfile(profile.userId, { legal }));
  } catch (err) {
    if (!(err instanceof EscrituraEncolada)) throw err;
    console.warn(err.message);
  }

  const consentimiento = consentimientoIADesdeLegal(legal);
  if (consentimiento) {
    try {
      await conTimeout('El consentimiento del asistente', fusionarConsentimientoIA(profile.email, consentimiento));
    } catch (err) {
      // No se le vuelve a plantar el muro por esto: su decisión ya está
      // guardada donde se demuestra. Lo que queda es que el asistente no
      // podrá leerle hasta que se sincronice, que es el lado seguro.
      console.warn('No se pudo replicar el consentimiento de IA en el onboarding:', err);
    }
  }
  return legal;
}
