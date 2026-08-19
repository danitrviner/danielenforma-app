/* ═══════════════════════════════════════════════════════════════════════════
   Qué aviso de conexión toca enseñar · `05-3`

   Se saca del componente porque es la única parte con criterio de verdad —qué
   gana sobre qué, y qué se le dice exactamente a la persona— y porque el banner
   solo se monta con sesión iniciada, así que probarlo montado costaría un
   entorno de DOM y un usuario falso para verificar tres `if`.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Las dos banderas de módulo de `db/core` que el banner ya vigilaba. */
export type EstadoFirestore = 'ok' | 'red' | 'permisos';

export type Aviso = 'ok' | 'red' | 'permisos' | 'encolado';

export interface Señales {
  /** `isLocalBypassActive()` / `hayFalloDePermisos()`, ya resueltos. */
  estado: EstadoFirestore;
  /** Escrituras que vencieron el plazo y siguen sin confirmar. */
  pendientes: number;
  /** El navegador dice que no hay red (`navigator.onLine === false`). */
  sinRed: boolean;
}

/**
 * Prioridad, de más a menos grave. No es orden estético: es orden de daño.
 *
 * 1. `permisos` — el dato NO se guarda y la persona no puede arreglarlo sola.
 * 2. `red`      — el dato NO se guarda; se ha caído a modo local.
 * 3. `encolado` — el dato SÍ está guardado, solo que aún no ha salido del móvil.
 */
export function decidirAviso({ estado, pendientes, sinRed }: Señales): Aviso {
  if (estado !== 'ok') return estado;
  if (pendientes > 0 || sinRed) return 'encolado';
  return 'ok';
}

/**
 * El texto exacto. Vive junto a la decisión porque el error que este hallazgo
 * describe era precisamente de texto: decir «los cambios NO se están guardando»
 * cuando sí lo están —o no decir nada en absoluto— es lo que hacía que la
 * persona no supiera si su entrenamiento existía.
 */
export function textoDelAviso(aviso: Aviso, pendientes: number): string {
  switch (aviso) {
    case 'permisos':
      return 'Tu cuenta no tiene permiso para guardar — los cambios NO se están guardando. Avisa a Dani.';
    case 'red':
      return 'Sin conexión con el servidor — los cambios NO se están guardando.';
    case 'encolado':
      return pendientes > 0
        ? `Guardado en el móvil — ${pendientes} ${pendientes === 1 ? 'cambio pendiente' : 'cambios pendientes'} de enviar. Se enviará solo al recuperar la conexión.`
        : 'Sin conexión — puedes seguir. Lo que guardes se enviará solo al recuperar la cobertura.';
    default:
      return '';
  }
}
