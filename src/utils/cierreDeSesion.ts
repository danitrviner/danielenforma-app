import type { QueryClient } from '@tanstack/react-query';
import { db, terminate, clearIndexedDbPersistence } from '../firebase';

/* ═══════════════════════════════════════════════════════════════════════════
   Cerrar sesión de verdad · `03-5` / `04-14`

   Cerrar sesión hacía `signOut(auth)` y `setCurrentUser(null)`, y nada más. Lo
   que quedaba en el dispositivo después:

   · La caché de react-query entera, con el `QueryClient` creado UNA vez en
     main.tsx y nunca vaciado.
   · ~50 claves `enforma_*` en localStorage, y muchas de ellas GLOBALES, no por
     usuario: `enforma_checkins`, `enforma_workout_logs`, `enforma_onboarding_v1`,
     `enforma_bodyweight_v1`, `enforma_coach_reports_v1`, `enforma_ai_chats_v1`.
   · La caché persistente de Firestore en IndexedDB: peso, perímetros,
     cuestionarios, dietas y notas del coach.

   En un móvil compartido —o en el propio iPhone de Dani cuando entra con una
   cuenta de atleta de prueba y luego vuelve a la suya— eso es una fuga real de
   datos de salud de otra persona. Y con la app en las tiendas, es de las cosas
   que un revisor puede reproducir sin proponérselo.

   Por qué termina en `reload()` y no en volver a pintar: media app guarda
   estado en variables de módulo (cachés de ejercicios, la bandera de modo
   local, el contador de escrituras pendientes) que ningún barrido de
   localStorage toca. Recargar es la única forma barata de garantizar que no
   queda nada del usuario anterior en memoria.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Todo lo que empiece por uno de estos prefijos es dato de sesión y se va. */
const PREFIJOS_A_BORRAR = ['enforma_', 'questionnaire', 'photoAssignments'];

/**
 * Lo único que se conserva. Ninguna de las dos es dato personal, y las dos
 * cuestan algo si se pierden: la de migración volvería a recorrer la colección
 * de ejercicios en el siguiente arranque, y la de columnas es una preferencia
 * de pantalla del coach en ese dispositivo.
 */
const CLAVES_QUE_SOBREVIVEN = new Set([
  'enforma_migration_muscleGroup_v1',
  'enforma_clients_grid_cols',
]);

/** Exportada para poder probarla: equivocarse aquí es o dejar datos de salud de
 *  otra persona en el móvil, o borrar algo que hacía falta. */
export function debeBorrarse(clave: string): boolean {
  if (CLAVES_QUE_SOBREVIVEN.has(clave)) return false;
  return PREFIJOS_A_BORRAR.some(p => clave.startsWith(p));
}

function barrer(almacen: Storage): number {
  let borradas = 0;
  // Hacia atrás: borrar mientras se recorre hacia delante se salta claves,
  // porque los índices se recolocan en cuanto desaparece una.
  for (let i = almacen.length - 1; i >= 0; i--) {
    const k = almacen.key(i);
    if (k && debeBorrarse(k)) { almacen.removeItem(k); borradas++; }
  }
  return borradas;
}

/**
 * Borra del dispositivo todo rastro del usuario que se va y recarga.
 *
 * No lanza nunca: si algo falla a mitad, lo que NO puede pasar es quedarse sin
 * cerrar sesión. Cada paso protege al siguiente y la recarga va en `finally`.
 */
export async function limpiarDatosDeSesion(queryClient: QueryClient): Promise<void> {
  try {
    queryClient.clear();
  } catch (err) {
    console.warn('No se pudo vaciar la caché de consultas:', err);
  }

  try {
    const enLocal = barrer(localStorage);
    const enSesión = barrer(sessionStorage);
    console.info(`Cierre de sesión: ${enLocal + enSesión} claves borradas del dispositivo`);
  } catch (err) {
    console.warn('No se pudo barrer el almacenamiento local:', err);
  }

  try {
    // El orden importa: Firestore no deja borrar su IndexedDB con la instancia
    // viva. `clearIndexedDbPersistence` además falla si hay otra pestaña
    // abierta con la app; ahí no hay nada que hacer salvo no romper el cierre
    // de sesión por ello, y la recarga de abajo deja esa pestaña sin sesión
    // igualmente.
    await terminate(db);
    await clearIndexedDbPersistence(db);
  } catch (err) {
    console.warn('No se pudo borrar la caché de Firestore (¿otra pestaña abierta?):', err);
  } finally {
    // Lo último, siempre: sin esto quedan en memoria las variables de módulo
    // con datos del usuario anterior, y además Firestore acaba de terminarse,
    // así que la app no puede seguir funcionando tal cual.
    window.location.reload();
  }
}
