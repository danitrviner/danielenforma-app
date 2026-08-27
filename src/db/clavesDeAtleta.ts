/* ═══════════════════════════════════════════════════════════════════════════
   Claves de atleta: UID vs EMAIL

   El proyecto identifica al atleta de DOS formas según la colección, y no es
   un descuido de un sitio: es la taxonomía real y hay que conocerla antes de
   tocar nada.

     · EMAIL  — TODAS. Desde la migración del 24-08, `workoutAssignments`
                incluida (`scripts/migrarAsignacionesAEmail.mjs`).
     · UID    — ninguna ya. Era `workoutAssignments`, y SOLO esa.

   MIENTRAS DURE EL PASO en producción conviven documentos con las dos claves,
   así que las consultas de esa colección piden las dos (`ClavesDeAtleta` +
   `clavesDelAtleta`) y las reglas aceptan ambas. Al terminar: dejar el email.

   Por qué duele: la regla de Firestore de `workoutAssignments` exige
   `athleteId == request.auth.uid`, así que una consulta con el email no da
   error de permisos — devuelve CERO documentos. Al coach le aparece "este
   atleta no tiene entrenamientos asignados", que es indistinguible de la
   verdad. Un fallo que se lee como un dato.

   Este módulo convierte ese fallo silencioso en un error ruidoso en el momento
   de la llamada, y sigue haciendo falta después de la migración: el caso
   simétrico (pasar un UID donde va el email) falla igual de callado.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Las dos claves del mismo atleta. `workoutAssignments` está migrando de UID a
 * email (24-08) y durante el paso conviven documentos con una y con otra, así
 * que sus consultas piden LAS DOS y filtran con un `in` de dos valores. Cuando
 * `migrarAsignacionesAEmail.mjs` haya terminado en producción y las reglas
 * hayan soltado la rama del uid, esto se reduce a pasar el email.
 */
export interface ClavesDeAtleta {
  uid: string;
  email: string;
}

/** Una cadena con `@` es un email; el UID de Firebase nunca lo lleva. */
export function pareceEmail(valor: string): boolean {
  return valor.includes('@');
}

/**
 * Los valores que puede llevar hoy `workoutAssignments.athleteId`, para el
 * `where(..., 'in', ...)`. Se comprueba que cada clave es del tipo que dice
 * ser: invertirlas devolvería 0 documentos sin dar ningún error.
 */
export function clavesDelAtleta(claves: ClavesDeAtleta): string[] {
  exigeEmail(claves.email, 'clavesDelAtleta(email)');
  exigeUid(claves.uid, 'clavesDelAtleta(uid)');
  return [claves.email, claves.uid];
}

/**
 * Para las funciones de `workoutAssignments`. Si le llega un email, la consulta
 * devolvería 0 documentos sin error: mejor romper aquí, con el nombre de la
 * función y qué hay que pasarle.
 */
export function exigeUid(valor: string, contexto: string): string {
  if (pareceEmail(valor)) {
    throw new Error(
      `${contexto}: se esperaba el UID del atleta y llegó un email ("${valor}"). ` +
      'workoutAssignments es la única colección con athleteId = UID; la consulta ' +
      'con email devolvería 0 asignaciones sin dar error. Usa `userProfile.userId`.',
    );
  }
  return valor;
}

/**
 * Para el resto de colecciones. El caso simétrico: un UID donde se espera el
 * email también devuelve 0 documentos en silencio.
 */
export function exigeEmail(valor: string, contexto: string): string {
  if (!pareceEmail(valor)) {
    throw new Error(
      `${contexto}: se esperaba el email del atleta y llegó lo que parece un UID ("${valor}"). ` +
      'Esta colección usa athleteId = email; la consulta con UID devolvería 0 ' +
      'documentos sin dar error. Usa `userProfile.email`.',
    );
  }
  return valor;
}
