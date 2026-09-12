import { reportarError } from '../monitorizacion';

/* ═══════════════════════════════════════════════════════════════════════════
   Escribir en localStorage sin tumbar la app

   El fallo que motiva esto llegó a Sentry el 12-09 y venía encadenado:

   1. `enforma_ai_chats_v1` llenó los ~5 MB de localStorage. Desde que la IA
      monta el mes entero, cada chat pesa muchísimo, y el espejo local se
      reescribía ENTERO en cada turno.
   2. A partir de ahí, cualquier `setItem` de la app lanzaba QuotaExceededError.
   3. Y también los del SDK de Firestore, que guarda ahí sus `firestore_targets_*`.
      Cuando ese `setItem` falla, Firestore lanza
      `INTERNAL ASSERTION FAILED (ID: b815)` y **deja de funcionar en esa
      pestaña**: ni lee ni escribe hasta recargar.

   O sea que un chat de la IA demasiado gordo dejaba la app entera sin base de
   datos. La lección es que ninguna escritura local puede reventar, y que
   cuando no quepa hay que hacer sitio en vez de rendirse.

   ── Qué se purga y qué no ─────────────────────────────────────────────────
   Casi todo lo que hay en localStorage es un ESPEJO de Firestore: se puede
   borrar y se recupera solo en la siguiente lectura. Eso es lo que se sacrifica,
   de más gordo a menos, que es también el orden en que más sitio libera.

   Lo que NO se toca está en `esIntocable()`: dato que sólo existe aquí y que
   perder duele de verdad — la sesión de entrenamiento a medias, el borrador
   del alta, el borrador de un cuestionario — más las dos preferencias que
   `cierreDeSesion` también conserva.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Claves que nunca se purgan para hacer sitio: o son el único sitio donde vive
 * ese dato, o son baratas y molesta perderlas.
 */
const PREFIJOS_INTOCABLES = [
  'enforma_sesion_en_curso_v1',   // la serie que el atleta está haciendo ahora
  'enforma_descanso_en_curso_v1', // su temporizador de descanso
  'enforma_borrador_alta_v1',     // un alta a medio rellenar
  'questionnaireDraft_',          // un cuestionario a medio responder
  'enforma_migration_',           // repetir la migración cuesta una colección entera
  'enforma_query_cache_owner',    // de quién es la caché: borrarla mezcla usuarios
  'enforma_clients_grid_cols',    // preferencia de pantalla del coach
];

function esIntocable(clave: string): boolean {
  return PREFIJOS_INTOCABLES.some(p => clave.startsWith(p));
}

/** Un QuotaExceededError, se llame como se llame en este navegador. */
function esCuotaLlena(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  // Safari usa el nombre viejo y iOS en modo privado da código 22 sin nombre.
  return err.name === 'QuotaExceededError'
      || err.name === 'NS_ERROR_DOM_QUOTA_REACHED'
      || (err as { code?: number }).code === 22;
}

/**
 * Las claves purgables ordenadas de mayor a menor tamaño, para liberar el
 * máximo sitio con el mínimo de borrados.
 *
 * `exceptuando` es la clave que estamos intentando escribir: purgarla no sirve
 * de nada porque la vamos a reescribir a continuación.
 */
function purgablesPorTamaño(exceptuando: string): string[] {
  const candidatas: { clave: string; peso: number }[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || k === exceptuando || esIntocable(k)) continue;
    // Los `firestore_*` son del SDK: él los regenera, pero borrárselos por
    // debajo es justo el estado raro del que venimos. Que se los apañe él.
    if (k.startsWith('firestore')) continue;
    candidatas.push({ clave: k, peso: (localStorage.getItem(k) ?? '').length });
  }
  return candidatas.sort((a, b) => b.peso - a.peso).map(c => c.clave);
}

/** Para no llenar Sentry con el mismo aviso en cada tecla. */
let yaAvisadoDeCuota = false;

/**
 * Guarda en localStorage. Si no cabe, hace sitio borrando espejos y reintenta.
 *
 * No lanza nunca. Devuelve `false` si al final no se pudo guardar, por si quien
 * llama quiere hacer algo al respecto; la mayoría puede ignorarlo, porque la
 * fuente de verdad de casi todo esto es Firestore.
 */
export function escribirLocal(clave: string, valor: string): boolean {
  try {
    localStorage.setItem(clave, valor);
    return true;
  } catch (err) {
    if (!esCuotaLlena(err)) {
      // localStorage deshabilitado (modo privado, cookies bloqueadas). No hay
      // nada que purgar y no es un fallo nuestro: seguimos sin espejo local.
      return false;
    }
  }

  for (const purgable of purgablesPorTamaño(clave)) {
    try {
      localStorage.removeItem(purgable);
      localStorage.setItem(clave, valor);
      return true;
    } catch (err) {
      if (!esCuotaLlena(err)) return false;
      // Sigue sin caber: al siguiente candidato.
    }
  }

  // Vaciado todo lo prescindible y aún no cabe: lo que se intenta escribir es
  // más grande que el almacén entero. Eso es un fallo de diseño de quien llama
  // (algo que crece sin tope), y quiero enterarme.
  if (!yaAvisadoDeCuota) {
    yaAvisadoDeCuota = true;
    reportarError(
      new Error(`No cabe en localStorage ni purgando: ${clave} (${valor.length} caracteres)`),
      'almacenLocal',
      { clave, tamaño: valor.length },
    );
  }
  return false;
}

/** Sólo para los tests: olvida que ya se avisó de la cuota. */
export function _reiniciarAvisoDeCuota(): void {
  yaAvisadoDeCuota = false;
}
