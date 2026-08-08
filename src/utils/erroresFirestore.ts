import { esFalloDePermisos, isLocalBypassActive } from '../db/core';

/* ═══════════════════════════════════════════════════════════════════════════
   Mensajes de error honestos — corrige P1-6 de la auditoría visual.

   Antes, cualquier fallo de escritura enseñaba «No se pudo guardar. Revisa tu
   conexión e inténtalo de nuevo.» Daba igual la causa: permisos denegados,
   sesión caducada, cuota agotada o un enlace de invitación mal configurado.
   El usuario revisaba su wifi, que estaba perfecta, y volvía a intentarlo con
   el mismo resultado. Y quien tenía que arreglarlo —Dani— no tenía forma de
   saber por dónde empezar, porque el mensaje apuntaba al sitio equivocado.

   Un mensaje de error tiene dos lectores: quien lo sufre y quien lo arregla.
   Estos textos intentan servir a los dos: dicen en cristiano qué ha pasado y
   qué se puede hacer, sin escupir un código de Firebase a la cara del atleta.
   El error completo sigue yendo a la consola en el `catch` de cada sitio, que
   es donde toca para depurar.
   ═══════════════════════════════════════════════════════════════════════════ */

const POR_CODIGO: Record<string, string> = {
  'permission-denied':
    'Tu cuenta no tiene permiso para guardar esto. Suele pasar cuando el acceso se creó sin la invitación de Dani. Escríbele y lo resuelve.',
  'unauthenticated':
    'Tu sesión ha caducado. Vuelve a entrar y lo intentamos otra vez.',
  'unavailable':
    'No hemos podido conectar. Revisa tu conexión e inténtalo de nuevo.',
  'deadline-exceeded':
    'La conexión ha tardado demasiado. Inténtalo de nuevo.',
  'resource-exhausted':
    'El servicio está saturado ahora mismo. Prueba en unos minutos.',
  'failed-precondition':
    'Falta configurar algo en la base de datos para guardar esto. Avisa a Dani.',
  'not-found':
    'No encontramos el documento que hay que actualizar. Avisa a Dani.',
  // Auth — el alta de un atleta pasa por un enlace de correo, y estos son los
  // fallos reales que se ven ahí.
  'auth/operation-not-allowed':
    'El acceso por enlace de correo está desactivado en Firebase. Hay que activarlo en Authentication › Método de acceso › Correo electrónico/contraseña › Vínculo del correo electrónico.',
  'auth/invalid-email':
    'Ese correo no tiene un formato válido.',
  'auth/expired-action-code':
    'El enlace de acceso ha caducado. Pide uno nuevo.',
  'auth/invalid-action-code':
    'Ese enlace de acceso ya no vale. Suele pasar si se abre en un dispositivo distinto al que lo recibió, o si ya se usó. Pide uno nuevo.',
  'auth/too-many-requests':
    'Demasiados intentos seguidos. Espera un momento y vuelve a probar.',
};

/**
 * Texto que se le enseña a la persona. `accion` es lo que se estaba
 * intentando, en infinitivo, para el caso en que no reconozcamos el código:
 * «No se pudo guardar tu ficha» dice más que «Error».
 */
export function mensajeDeErrorFirestore(err: unknown, accion = 'guardar'): string {
  const code = (err as { code?: string } | null)?.code;
  if (code && POR_CODIGO[code]) return POR_CODIGO[code];

  // Sin código reconocible: si el modo local está activo, la causa sí es de
  // conexión y el mensaje de siempre es el correcto. Si no lo está, no tenemos
  // derecho a echarle la culpa a la red.
  if (isLocalBypassActive()) {
    return `No se pudo ${accion}. Revisa tu conexión e inténtalo de nuevo.`;
  }
  const detalle = (err as { message?: string } | null)?.message;
  return detalle
    ? `No se pudo ${accion}. ${detalle}`
    : `No se pudo ${accion}. Inténtalo de nuevo.`;
}

/**
 * `true` si el error es de permisos y, por tanto, reintentar no va a servir de
 * nada. Lo usa la UI para no ofrecer un «Reintentar» que sabe que va a fallar.
 */
export function reintentarNoSirve(err: unknown): boolean {
  return esFalloDePermisos(err);
}
