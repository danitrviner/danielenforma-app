import { auth } from '../firebase';
import { apiUrl } from './apiBase';

/* ═══════════════════════════════════════════════════════════════════════════
   Acceso de un cliente a la app, decidido por el coach (api/gestionar-acceso.ts).

   Archivar en el CRM era solo esconder al cliente de las listas. Bloquear su
   usuario de Firebase Auth y revocar sus sesiones solo se puede hacer con el
   Admin SDK, así que el CRM pasa por aquí antes de marcar el archivado.
   ═══════════════════════════════════════════════════════════════════════════ */

const ENDPOINT: string = apiUrl('/api/gestionar-acceso');

export type AccionAcceso = 'bloquear' | 'desbloquear' | 'eliminar';

export interface ResultadoAcceso {
  ok: true;
  /** La persona no tenía usuario de acceso: no había nada que bloquear. */
  sinCuenta: boolean;
}

export async function gestionarAccesoCliente(
  email: string,
  accion: AccionAcceso,
  profileId?: string,
): Promise<ResultadoAcceso> {
  // `true` fuerza renovar el token: un token en caché que el servidor rechaza da
  // un 401 indistinguible de «no has iniciado sesión» (mismo motivo que en
  // inviteClient).
  const idToken = await auth.currentUser?.getIdToken(true);
  if (!idToken) {
    throw Object.assign(new Error('Tu sesión ha caducado. Vuelve a entrar.'), { code: 'unauthenticated' });
  }

  const respuesta = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ email, accion, profileId }),
  });

  if (!respuesta.ok) {
    const detalle = (await respuesta.json().catch(() => ({}))) as { error?: string };
    console.error(`gestionar-acceso (${accion}) respondió ${respuesta.status}:`, detalle.error ?? '(sin cuerpo)');
    throw Object.assign(
      new Error(detalle.error || 'No se pudo cambiar el acceso del cliente.'),
      { code: 'acceso/rechazado' },
    );
  }
  return (await respuesta.json()) as ResultadoAcceso;
}
