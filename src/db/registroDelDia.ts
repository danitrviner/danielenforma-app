/**
 * Qué gana cuando el servidor y el espejo local no dicen lo mismo sobre el día
 * de un atleta.
 *
 * El fallo que cierra esto (07-09-2026, queja real de una atleta): registraba
 * el desayuno, cerraba la app, volvía a entrar y el desayuno no estaba.
 *
 * El registro sí se guardaba —`saveDietCompletionLog` escribe SIEMPRE el espejo
 * local antes de tocar la red— pero la lectura lo tiraba: si el documento no
 * estaba en Firestore (escritura sin cobertura, app cerrada antes de que
 * confirmara, o permisos denegados) `getDietCompletionLog` devolvía `null` sin
 * mirar el espejo. El dato estaba en el móvil, entero, y la pantalla se pintaba
 * vacía encima.
 *
 * La regla es la de cualquier sincronización honesta: gana el más reciente, y
 * lo que solo esté en local se reintenta subir. `updatedAt` lo pone el propio
 * guardado; los documentos anteriores a esta fecha no lo traen y se tratan como
 * los más viejos de todos, que es lo que son.
 */
export interface RegistroSincronizable {
  updatedAt?: string;   // ISO
}

export interface QuienGana<T> {
  /** Lo que hay que enseñar. */
  log: T | null;
  /** El local es el bueno y el servidor no lo tiene (o lo tiene viejo). */
  hayQueSubir: boolean;
}

export function registroQueGana<T extends RegistroSincronizable>(
  remoto: T | null,
  local: T | null,
): QuienGana<T> {
  if (!remoto && !local) return { log: null, hayQueSubir: false };
  if (!remoto) return { log: local, hayQueSubir: true };
  if (!local) return { log: remoto, hayQueSubir: false };

  // Sin marca de tiempo en el local no hay forma de saber que es más nuevo, y
  // ante la duda manda el servidor: es lo que ven también el coach y los otros
  // dispositivos del atleta.
  if (!local.updatedAt) return { log: remoto, hayQueSubir: false };
  if (!remoto.updatedAt || local.updatedAt > remoto.updatedAt) {
    return { log: local, hayQueSubir: true };
  }
  return { log: remoto, hayQueSubir: false };
}
