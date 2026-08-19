/* ═══════════════════════════════════════════════════════════════════════════
   Mensajes de la pantalla de acceso — corrige 07-7.

   Antes, tres de los cuatro caminos de error de WelcomeScreen terminaban en
   `err.message` o en `err.code`, así que lo que veía la persona era literalmente
   «Error al iniciar sesión con Google (auth/unauthorized-domain)» o
   «Firebase: Error (auth/invalid-credential).». Un código de Firebase en la cara
   de alguien que solo quiere entrar en la app no le dice qué hacer, y a quien
   tiene que arreglarlo tampoco: nadie le manda una captura de eso a Dani.

   Mismo criterio que erroresFirestore.ts: el texto dice qué ha pasado y cuál es
   el siguiente paso; el error crudo sigue yendo a la consola en cada `catch`.
   ═══════════════════════════════════════════════════════════════════════════ */

const POR_CODIGO: Record<string, string> = {
  // ── Credenciales ──────────────────────────────────────────────────────────
  // Firebase devuelve invalid-credential desde que activó la protección de
  // enumeración de correos: no distingue «no existe» de «contraseña mal», y está
  // bien que no lo haga. El mensaje tiene que servir para los dos casos.
  'auth/invalid-credential':
    'El correo o la contraseña no son correctos. Si Dani te ha invitado, entra con el enlace que te mandó por correo en vez de con contraseña.',
  'auth/wrong-password':
    'El correo o la contraseña no son correctos. Si Dani te ha invitado, entra con el enlace que te mandó por correo en vez de con contraseña.',
  'auth/user-not-found':
    'No hay ninguna cuenta con ese correo. El acceso lo crea Dani: escríbele y te manda la invitación.',
  'auth/invalid-email':
    'Ese correo no tiene un formato válido. Repásalo.',
  'auth/user-disabled':
    'Esta cuenta está desactivada. Escribe a Dani.',
  'auth/weak-password':
    'La contraseña tiene que tener al menos 6 caracteres.',
  'auth/missing-password':
    'Escribe tu contraseña.',
  'auth/requires-recent-login':
    'Por seguridad, esto pide que hayas entrado hace poco. Cierra sesión, vuelve a entrar e inténtalo otra vez.',

  // ── Configuración de la consola ───────────────────────────────────────────
  // Estos dos no los puede arreglar el atleta. El texto lo dice claro para que
  // no se quede reintentando, y da la ruta exacta para quien sí puede.
  'auth/operation-not-allowed':
    'Este método de acceso está desactivado en el servidor. No es cosa tuya: avisa a Dani (Firebase › Authentication › Método de acceso).',
  'auth/unauthorized-domain':
    'Este dispositivo no está autorizado para entrar con Google. Entra con tu correo y contraseña, o con el enlace de invitación que te mandó Dani.',
  'auth/invalid-api-key':
    'La app está mal configurada y no puede conectar con el servidor. Avisa a Dani.',

  // ── Enlace de invitación ──────────────────────────────────────────────────
  'auth/expired-action-code':
    'El enlace de invitación ha caducado. Pídele a Dani que te mande uno nuevo.',
  'auth/invalid-action-code':
    'Este enlace de invitación ya no vale: o se ha usado ya, o se abrió en un dispositivo distinto al que lo recibió. Pídele a Dani uno nuevo.',

  // ── Red y ritmo ───────────────────────────────────────────────────────────
  'auth/network-request-failed':
    'No hemos podido conectar. Revisa tu conexión e inténtalo de nuevo.',
  'auth/too-many-requests':
    'Demasiados intentos seguidos. Espera un par de minutos y vuelve a probar.',
  'auth/internal-error':
    'El servidor de acceso ha fallado. Inténtalo de nuevo en un momento.',

  // ── Ventana emergente ─────────────────────────────────────────────────────
  'auth/popup-blocked':
    'Tu navegador ha bloqueado la ventana de Google. Permite las ventanas emergentes para este sitio, o entra con tu correo y contraseña.',
  'auth/cancelled-popup-request':
    'Se ha cancelado el intento anterior. Vuelve a pulsar el botón.',

  // ── Propio, no de Firebase ────────────────────────────────────────────────
  // 03-1 / B-4: en el WebView nativo no hay ventana emergente y el SDK rechaza
  // el origen `capacitor://localhost`, así que signInWithPopup se queda colgado
  // sin resolver ni rechazar. Sin este caso, el botón deja la app en «Entrando…»
  // para siempre y sin explicación.
  'app/google-sin-respuesta':
    'Google no ha respondido. Dentro de la app, entra con tu correo y contraseña o con el enlace de invitación que te mandó Dani.',
};

/**
 * Texto que se le enseña a la persona en la pantalla de acceso. Nunca devuelve
 * un código de Firebase: si no reconocemos el error, damos un mensaje genérico
 * accionable y dejamos el detalle en la consola.
 */
export function mensajeDeErrorAuth(err: unknown, accion = 'entrar'): string {
  const code = (err as { code?: string } | null)?.code;
  if (code && POR_CODIGO[code]) return POR_CODIGO[code];
  return `No se ha podido ${accion}. Inténtalo de nuevo; si sigue igual, escríbele a Dani.`;
}
