import { auth, EmailAuthProvider, reauthenticateWithCredential, signOut } from '../firebase';

/* ═══════════════════════════════════════════════════════════════════════════
   Borrado de cuenta desde la app (B-1).

   Apple lo exige a cualquier app que cree cuentas (5.1.1.v) y no admite
   «desactivar temporalmente» ni «escríbenos y lo hacemos»: tiene que ser un
   camino dentro de la app. El trabajo real lo hace `api/delete-account.ts` con
   el Admin SDK, porque `firestore.rules` no da permiso de borrado al propio
   atleta sobre casi ninguna colección — y abrirlo sería crear superficie de
   ataque nueva para resolver algo que el servidor ya puede hacer.

   Aquí solo vive lo que tiene que pasar en el cliente: la reautenticación.
   ═══════════════════════════════════════════════════════════════════════════ */

const ENDPOINT_BORRADO: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)
    ? `${(import.meta.env.VITE_API_BASE_URL as string).replace(/\/$/, '')}/api/delete-account`
    : '/api/delete-account';

export interface ResultadoBorrado {
  documentos: number;
  ficheros: number;
  crmAnonimizados: number;
  restos: number;
}

/**
 * Elimina la cuenta de quien está dentro. Irreversible.
 *
 * @param password La contraseña actual. Se usa para reautenticar justo antes de
 *   llamar: el servidor rechaza el borrado si el inicio de sesión tiene más de
 *   10 minutos, porque si no, un móvil desbloqueado olvidado en una mesa basta
 *   para borrarle la cuenta a alguien.
 */
export async function eliminarMiCuenta(password: string): Promise<ResultadoBorrado> {
  const usuario = auth.currentUser;
  if (!usuario?.email) {
    throw Object.assign(new Error('No hay ninguna sesión abierta.'), { code: 'unauthenticated' });
  }

  // 1. Reautenticar. Si la contraseña es incorrecta, esto lanza con un código
  //    de Firebase que la UI traduce con mensajeDeErrorAuth.
  const credencial = EmailAuthProvider.credential(usuario.email, password);
  await reauthenticateWithCredential(usuario, credencial);

  // 2. Token recién emitido. `true` fuerza el refresco: sin él seguiríamos
  //    mandando el token anterior, con el `auth_time` viejo, y el servidor
  //    rechazaría el borrado por antigüedad justo después de reautenticar.
  const idToken = await usuario.getIdToken(true);

  // 3. El borrado en sí.
  const respuesta = await fetch(ENDPOINT_BORRADO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
  });

  if (!respuesta.ok) {
    const detalle = (await respuesta.json().catch(() => ({}))) as { error?: string; code?: string };
    throw Object.assign(
      new Error(detalle.error || 'No se pudo eliminar la cuenta.'),
      { code: detalle.code || 'cuenta/borrado-fallido' }
    );
  }

  const resultado = (await respuesta.json()) as ResultadoBorrado;

  // 4. La sesión local. El usuario de Auth ya no existe, así que el token que
  //    tenemos en memoria es papel mojado; sin este signOut la app se quedaría
  //    intentando leer datos de un usuario borrado y enseñando errores de
  //    permisos en vez de la pantalla de acceso.
  //    No se deja que un fallo aquí parezca un fallo del borrado: el borrado ya
  //    está hecho y es irreversible.
  try {
    await signOut(auth);
  } catch (err) {
    console.warn('signOut tras el borrado falló (la cuenta ya está eliminada):', err);
  }

  return resultado;
}
