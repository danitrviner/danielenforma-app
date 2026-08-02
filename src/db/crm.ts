// ─── CRM: contactos, servicios, pagos ────────────────────────────────────────
//
// ⚠️ ESTE FICHERO NO IMPLEMENTA FALLBACK A localStorage, A PROPÓSITO.
//
// Los otros 19 dominios de src/db/ hacen `catch → setLocalBypassMode(true) →
// guardar en localStorage → devolver éxito`. Para una nota del coach es una
// decisión defendible: mejor perder una nota que bloquear la app.
//
// Aquí NO. Un cobro que la UI da por registrado y que no existe en Firestore es
// dinero que no reclamas. Si la escritura falla, la excepción SUBE y la pantalla
// enseña el error. Que nadie "arregle" esto por consistencia con el resto.
//
// Sobre el offline: `persistentLocalCache` está activo (src/firebase.ts), así
// que una escritura sin conexión se encola en IndexedDB y sincroniza sola. Pero
// la promesa de addDoc/setDoc no resuelve hasta que el SERVIDOR confirma — sin
// red se queda pendiente indefinidamente. Por eso las escrituras van envueltas
// en `conTimeout`: pasados unos segundos lanzamos `EscrituraEncolada`, que la UI
// traduce a «guardado, pendiente de sincronizar» en vez de un spinner eterno.
// No es pérdida de dato: la mutación está en IndexedDB y llegará.

import {
  db, collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, runTransaction, writeBatch,
} from '../firebase';
import type {
  CrmContacto, CrmServicio, CrmPago, CrmSuscripcion, CrmReunion,
} from '../features/crm/types';
import type { UserProfile } from '../types';
import { stripUndefined, authReady } from './core';
import { avanzarPeriodo } from '../features/crm/lib/fechas';

const COL_CONTACTOS = 'crmContactos';
const COL_SERVICIOS = 'crmServicios';
const COL_PAGOS = 'crmPagos';
const COL_SUSCRIPCIONES = 'crmSuscripciones';
const COL_REUNIONES = 'crmReuniones';

// ── Escrituras con timeout ───────────────────────────────────────────────────

/**
 * Se lanza cuando una escritura no recibe confirmación del servidor a tiempo.
 * NO significa que se haya perdido: Firestore la tiene encolada en IndexedDB y
 * la enviará al recuperar conexión. La UI debe decir «pendiente de sincronizar»,
 * no «error al guardar».
 */
export class EscrituraEncolada extends Error {
  constructor(operacion: string) {
    super(`«${operacion}» está guardado en este dispositivo pero aún no ha llegado al servidor. Se enviará solo al recuperar la conexión.`);
    this.name = 'EscrituraEncolada';
  }
}

const TIMEOUT_MS = 8000;

function conTimeout<T>(operacion: string, p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new EscrituraEncolada(operacion)), TIMEOUT_MS)
    ),
  ]);
}

function ahora(): string {
  return new Date().toISOString();
}

// ── Contactos (clientes sin cuenta en la app) ────────────────────────────────

export async function getCrmContactos(): Promise<CrmContacto[]> {
  await authReady;
  const snap = await getDocs(collection(db, COL_CONTACTOS));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as CrmContacto));
}

export async function createCrmContacto(
  data: Omit<CrmContacto, 'id' | 'createdAt' | 'updatedAt'>
): Promise<CrmContacto> {
  await authReady;
  const payload = { ...data, createdAt: ahora(), updatedAt: ahora() };
  const ref = await conTimeout('Crear contacto', addDoc(collection(db, COL_CONTACTOS), stripUndefined(payload)));
  return { ...payload, id: ref.id };
}

export async function updateCrmContacto(id: string, updates: Partial<CrmContacto>): Promise<void> {
  await authReady;
  const payload = stripUndefined({ ...updates, updatedAt: ahora() }) as Record<string, unknown>;
  await conTimeout('Guardar contacto', updateDoc(doc(db, COL_CONTACTOS, id), payload));
}

export async function deleteCrmContacto(id: string): Promise<void> {
  await authReady;
  await conTimeout('Borrar contacto', deleteDoc(doc(db, COL_CONTACTOS, id)));
}

// Límite duro de Firestore: un writeBatch no admite más de 500 operaciones.
const TAMANO_LOTE = 500;

function enLotes<T>(items: T[], tamano: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < items.length; i += tamano) lotes.push(items.slice(i, i + tamano));
  return lotes;
}

/**
 * Escribe contactos importados en lotes de máx. 500. Los clientes se AÑADEN,
 * nunca se reemplazan — cada llamada crea documentos nuevos, no toca los que
 * ya existen. La detección de duplicados (lib/importar.ts) es responsabilidad
 * de la pantalla, que decide qué filas llegan aquí; esta función no vuelve a
 * comprobar nada, solo escribe lo que le pasan.
 *
 * Cada lote es su propio `writeBatch` (atómico dentro del lote, no entre
 * lotes): con 1200 filas, un fallo a mitad de importación deja los lotes ya
 * confirmados escritos y el resto sin escribir — se informa cuántos han
 * entrado antes de que la excepción suba, para que la pantalla pueda decir
 * exactamente dónde se cortó en vez de un error mudo.
 */
export async function importarCrmContactosBatch(
  contactos: Omit<CrmContacto, 'id' | 'createdAt' | 'updatedAt'>[]
): Promise<number> {
  await authReady;
  const ts = ahora();
  const lotes = enLotes(contactos, TAMANO_LOTE);
  let escritos = 0;

  for (const lote of lotes) {
    const batch = writeBatch(db);
    for (const c of lote) {
      const ref = doc(collection(db, COL_CONTACTOS));
      batch.set(ref, stripUndefined({ ...c, createdAt: ts, updatedAt: ts }));
    }
    try {
      await conTimeout(`Importar clientes (${escritos + 1}–${escritos + lote.length})`, batch.commit());
    } catch (err) {
      throw new Error(
        `Se importaron ${escritos} de ${contactos.length} clientes antes de fallar. ` +
        `Revisa la conexión y reintenta solo con el resto.`,
        { cause: err }
      );
    }
    escritos += lote.length;
  }
  return escritos;
}

// ── Campos CRM sobre user_profiles ───────────────────────────────────────────

/**
 * Escribe los campos comerciales de un cliente QUE SÍ tiene cuenta.
 *
 * Existe en vez de reutilizar `updateUserProfile` porque esa función hace el
 * `catch → localStorage → return` del patrón general (src/db/profiles.ts:326):
 * un fallo al marcar a alguien de baja se guardaría solo en el navegador del
 * coach y Firestore seguiría diciendo que está activo. Aquí no hay catch.
 *
 * Deliberadamente acotada a los cinco campos del CRM: no es una vía alternativa
 * para escribir el perfil entero.
 */
export async function updateClienteCrmFields(
  userId: string,
  updates: Partial<Pick<UserProfile, 'displayName' | 'dni' | 'direccion' | 'telefono' | 'estadoCrm'>>
): Promise<void> {
  await authReady;
  const payload = stripUndefined(updates) as Record<string, unknown>;
  if (Object.keys(payload).length === 0) return;
  await conTimeout('Guardar cliente', updateDoc(doc(db, 'user_profiles', userId), payload));
}

// ── Servicios ────────────────────────────────────────────────────────────────

export async function getCrmServicios(): Promise<CrmServicio[]> {
  await authReady;
  const snap = await getDocs(collection(db, COL_SERVICIOS));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as CrmServicio));
}

export async function getCrmServiciosByCliente(clientId: string): Promise<CrmServicio[]> {
  await authReady;
  const snap = await getDocs(query(collection(db, COL_SERVICIOS), where('clientId', '==', clientId)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as CrmServicio));
}

/**
 * Crea un servicio y, si `importeCents > 0`, su pago pendiente asociado — los
 * DOS documentos o NINGUNO. Sin la transacción, un fallo entre las dos
 * escrituras deja un servicio contratado sin cobro que reclamar, y eso no se
 * nota hasta que cuadras las cuentas a fin de mes.
 */
export async function createCrmServicioConPago(
  data: Omit<CrmServicio, 'id' | 'createdAt' | 'updatedAt'>,
  opciones: { generarPago: boolean }
): Promise<{ servicio: CrmServicio; pago: CrmPago | null }> {
  await authReady;
  const ts = ahora();
  const servicioRef = doc(collection(db, COL_SERVICIOS));
  const pagoRef = doc(collection(db, COL_PAGOS));

  const servicio: CrmServicio = { ...data, id: servicioRef.id, createdAt: ts, updatedAt: ts };
  const debeGenerarPago = opciones.generarPago && data.importeCents > 0;

  const pago: CrmPago | null = debeGenerarPago
    ? {
        id: pagoRef.id,
        clientId: data.clientId,
        clientNombre: data.clientNombre,
        servicioId: servicioRef.id,
        concepto: data.nombre,
        importeCents: data.importeCents,
        estado: 'pendiente',
        fechaEmision: data.fechaContratacion,
        createdAt: ts,
        updatedAt: ts,
        createdBy: data.createdBy,
      }
    : null;

  await conTimeout('Crear servicio', runTransaction(db, async tx => {
    const { id: _sid, ...servicioDoc } = servicio;
    tx.set(servicioRef, stripUndefined(servicioDoc));
    if (pago) {
      const { id: _pid, ...pagoDoc } = pago;
      tx.set(pagoRef, stripUndefined(pagoDoc));
    }
  }));

  return { servicio, pago };
}

export async function updateCrmServicio(id: string, updates: Partial<CrmServicio>): Promise<void> {
  await authReady;
  const payload = stripUndefined({ ...updates, updatedAt: ahora() }) as Record<string, unknown>;
  await conTimeout('Guardar servicio', updateDoc(doc(db, COL_SERVICIOS, id), payload));
}

/**
 * Baja LÓGICA. Un servicio pasado sigue formando parte del historial del
 * cliente y de lo facturado; borrarlo de verdad desharía las cuentas de meses
 * ya cerrados. El borrado duro no se expone.
 */
export async function archivarCrmServicio(id: string): Promise<void> {
  return updateCrmServicio(id, { archivado: true });
}

export async function desarchivarCrmServicio(id: string): Promise<void> {
  return updateCrmServicio(id, { archivado: false });
}

// ── Pagos ────────────────────────────────────────────────────────────────────

export async function getCrmPagos(): Promise<CrmPago[]> {
  await authReady;
  const snap = await getDocs(collection(db, COL_PAGOS));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as CrmPago));
}

export async function getCrmPagosByCliente(clientId: string): Promise<CrmPago[]> {
  await authReady;
  const snap = await getDocs(query(collection(db, COL_PAGOS), where('clientId', '==', clientId)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as CrmPago));
}

export async function createCrmPago(
  data: Omit<CrmPago, 'id' | 'createdAt' | 'updatedAt'>
): Promise<CrmPago> {
  await authReady;
  const payload = { ...data, createdAt: ahora(), updatedAt: ahora() };
  const ref = await conTimeout('Registrar pago', addDoc(collection(db, COL_PAGOS), stripUndefined(payload)));
  return { ...payload, id: ref.id };
}

export async function updateCrmPago(id: string, updates: Partial<CrmPago>): Promise<void> {
  await authReady;
  const payload = stripUndefined({ ...updates, updatedAt: ahora() }) as Record<string, unknown>;
  await conTimeout('Guardar pago', updateDoc(doc(db, COL_PAGOS, id), payload));
}

/**
 * Solo funciona mientras el pago siga `pendiente` — la regla de Firestore es
 * quien realmente lo impone (`allow delete: if ... resource.data.estado ==
 * 'pendiente'`); esta función no repite esa comprobación en el cliente, así
 * que un intento de borrar uno ya `pagado` llega a Firestore y vuelve como
 * `permission-denied` en vez de fallar en silencio antes de salir de aquí.
 * Un cobro ya cobrado no desaparece nunca: se corrige editándolo.
 */
export async function deleteCrmPago(id: string): Promise<void> {
  await authReady;
  await conTimeout('Borrar pago', deleteDoc(doc(db, COL_PAGOS, id)));
}

// ── Suscripciones ────────────────────────────────────────────────────────────

export async function getCrmSuscripciones(): Promise<CrmSuscripcion[]> {
  await authReady;
  const snap = await getDocs(collection(db, COL_SUSCRIPCIONES));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as CrmSuscripcion));
}

export async function getCrmSuscripcionesByCliente(clientId: string): Promise<CrmSuscripcion[]> {
  await authReady;
  const snap = await getDocs(query(collection(db, COL_SUSCRIPCIONES), where('clientId', '==', clientId)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as CrmSuscripcion));
}

export async function createCrmSuscripcion(
  data: Omit<CrmSuscripcion, 'id' | 'createdAt' | 'updatedAt' | 'ultimoCobroGeneradoEn'>
): Promise<CrmSuscripcion> {
  await authReady;
  const payload = { ...data, createdAt: ahora(), updatedAt: ahora() };
  const ref = await conTimeout('Crear suscripción', addDoc(collection(db, COL_SUSCRIPCIONES), stripUndefined(payload)));
  return { ...payload, id: ref.id };
}

export async function updateCrmSuscripcion(id: string, updates: Partial<CrmSuscripcion>): Promise<void> {
  await authReady;
  const payload = stripUndefined({ ...updates, updatedAt: ahora() }) as Record<string, unknown>;
  await conTimeout('Guardar suscripción', updateDoc(doc(db, COL_SUSCRIPCIONES, id), payload));
}

/**
 * Se lanza cuando `registrarCobroSuscripcion` pierde la carrera: otra
 * invocación (doble clic, dos pestañas abiertas, un reintento de red) ya
 * generó el cobro de este ciclo antes de que esta llegara a confirmar. NO es
 * un fallo — el cobro SÍ se generó, solo que por la otra invocación. La UI
 * debe refrescar y avisar, no mostrar un error.
 */
export class CobroYaRegistrado extends Error {
  constructor() {
    super('Este cobro ya se había registrado — actualizando.');
    this.name = 'CobroYaRegistrado';
  }
}

/**
 * Genera el pago pendiente del ciclo actual de una suscripción y avanza su
 * `proximoCobro`, atómicamente e IDEMPOTENTE frente a doble clic.
 *
 * El guardado de idempotencia es un compare-and-swap sobre `proximoCobro`:
 * dentro de la transacción se relee el documento y, si su `proximoCobro` ya
 * no coincide con el que tenía la UI cuando se pulsó el botón, es que otra
 * invocación ya lo avanzó primero — Firestore serializa las transacciones que
 * tocan el mismo documento, así que este re-read siempre ve el estado ya
 * confirmado por la que ganó la carrera. En vez de generar un segundo pago,
 * se lanza `CobroYaRegistrado` y la UI refresca en paz.
 *
 * `fechaEmision` del pago = `sub.proximoCobro` (la fecha del ciclo de
 * facturación), no la fecha en la que el coach tuvo tiempo de pulsar el
 * botón — así el histórico de facturación refleja cuándo tocaba cobrar.
 */
export async function registrarCobroSuscripcion(
  suscripcion: CrmSuscripcion,
  coachEmail: string,
): Promise<CrmPago> {
  await authReady;
  const subRef = doc(db, COL_SUSCRIPCIONES, suscripcion.id);
  const pagoRef = doc(collection(db, COL_PAGOS));
  const ts = ahora();

  return conTimeout('Registrar cobro', runTransaction(db, async tx => {
    const snap = await tx.get(subRef);
    if (!snap.exists()) throw new Error('La suscripción ya no existe.');
    const sub = snap.data() as CrmSuscripcion;
    if (sub.proximoCobro !== suscripcion.proximoCobro) throw new CobroYaRegistrado();

    const pagoDoc = {
      clientId: sub.clientId,
      clientNombre: sub.clientNombre,
      suscripcionId: suscripcion.id,
      concepto: sub.concepto,
      importeCents: sub.importeCents,
      estado: 'pendiente' as const,
      fechaEmision: sub.proximoCobro,
      createdAt: ts,
      updatedAt: ts,
      createdBy: coachEmail,
    };
    tx.set(pagoRef, stripUndefined(pagoDoc));
    tx.update(subRef, stripUndefined({
      proximoCobro: avanzarPeriodo(sub.proximoCobro, sub.periodicidad),
      ultimoCobroGeneradoEn: ts,
      updatedAt: ts,
    }));
    return { ...pagoDoc, id: pagoRef.id };
  }));
}

// ── Reuniones ────────────────────────────────────────────────────────────────

export async function getCrmReuniones(): Promise<CrmReunion[]> {
  await authReady;
  const snap = await getDocs(collection(db, COL_REUNIONES));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as CrmReunion));
}

export async function getCrmReunionesByCliente(clientId: string): Promise<CrmReunion[]> {
  await authReady;
  const snap = await getDocs(query(collection(db, COL_REUNIONES), where('clientId', '==', clientId)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as CrmReunion));
}

export async function createCrmReunion(
  data: Omit<CrmReunion, 'id' | 'createdAt' | 'updatedAt'>
): Promise<CrmReunion> {
  await authReady;
  const payload = { ...data, createdAt: ahora(), updatedAt: ahora() };
  const ref = await conTimeout('Crear reunión', addDoc(collection(db, COL_REUNIONES), stripUndefined(payload)));
  return { ...payload, id: ref.id };
}

export async function updateCrmReunion(id: string, updates: Partial<CrmReunion>): Promise<void> {
  await authReady;
  const payload = stripUndefined({ ...updates, updatedAt: ahora() }) as Record<string, unknown>;
  await conTimeout('Guardar reunión', updateDoc(doc(db, COL_REUNIONES, id), payload));
}
