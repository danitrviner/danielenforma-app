/* ═══════════════════════════════════════════════════════════════════════════
   Claves de atleta: UID vs EMAIL

   El proyecto identifica al atleta de DOS formas según la colección, y no es
   un descuido de un sitio: es la taxonomía real y hay que conocerla antes de
   tocar nada.

     · EMAIL  — `onboarding`, `diets`, `weeklyMenus`, `mesocycles`,
                `workoutLogs`, `exerciseNotes`, `bodyweightLogs`, `stepLogs`,
                `progressPhotos`, `bodyMeasurements`, `questionnaire*`,
                `weeklyChallenges`, `tasks`, `coachReports`, `cardio*`,
                `hrTests`, `gimnasios`… (~30 colecciones).
     · UID    — `workoutAssignments`, y SOLO esa.

   Por qué duele: la regla de Firestore de `workoutAssignments` exige
   `athleteId == request.auth.uid`, así que una consulta con el email no da
   error de permisos — devuelve CERO documentos. Al coach le aparece "este
   atleta no tiene entrenamientos asignados", que es indistinguible de la
   verdad. Un fallo que se lee como un dato.

   Este módulo no migra nada (reescribir `workoutAssignments` en producción es
   otra decisión, con sus datos de clientes reales de por medio): convierte ese
   fallo silencioso en un error ruidoso en el momento de la llamada.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Una cadena con `@` es un email; el UID de Firebase nunca lo lleva. */
export function pareceEmail(valor: string): boolean {
  return valor.includes('@');
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
