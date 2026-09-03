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
  db, collection, doc, addDoc, updateDoc, deleteDoc,
  runTransaction, writeBatch,
} from '../firebase';
import type {
  CrmContacto, CrmServicio, CrmPago, CrmSuscripcion, CrmReunion,
} from '../features/crm/types';
import type { UserProfile } from '../types';
import { stripUndefined, authReady, conTimeout } from './core';
import { leerCatalogo, marcarCatalogoCambiado } from './catalogoVersionado';
import { avanzarPeriodo, sumarMeses } from '../features/crm/lib/fechas';
import { repartirEnCuotas } from '../features/crm/lib/dinero';

const COL_CONTACTOS = 'crmContactos';
const COL_SERVICIOS = 'crmServicios';
const COL_PAGOS = 'crmPagos';
const COL_SUSCRIPCIONES = 'crmSuscripciones';
const COL_REUNIONES = 'crmReuniones';

// ── Sello de versión ─────────────────────────────────────────────────────────
//
// Las cinco colecciones se leían ENTERAS cada vez que se abría el CRM. Son
// solo-coach, así que no multiplican por número de atletas como `exercises` o
// `workouts` — pero crecen monótonamente con el negocio y no se borra nada
// nunca (un pago cobrado no se puede borrar ni por reglas), así que el coste
// por sesión sube para siempre: cada mes de facturación son más pagos que
// releer. Con el sello son 1 lectura por catálogo mientras nadie escriba.
//
// Aquí hay dos cosas que NO pasan en los otros catálogos y que obligan a
// hilar más fino:
//
//   · Se escriben también desde el servidor. `api/delete-account.ts` anonimiza
//     las cinco al borrarse una cuenta y `api/create-athlete.ts` enlaza el
//     contacto — con el Admin SDK, que no pasa por este fichero. Si esas
//     escrituras no tocaran el sello, el navegador del coach seguiría sirviendo
//     de su caché los datos personales de alguien que pidió que lo borraran.
//     Por eso ambos endpoints marcan el sello (api/_lib/catalogos.ts).
//
//   · `getCrmXByCliente` ya no consulta a Firestore. Filtra sobre el catálogo
//     completo, que a estas alturas está en la caché local a coste cero; ir al
//     servidor a por el subconjunto de un cliente costaría lecturas cada vez
//     que se abre una ficha, teniendo la respuesta ya al lado.
//
// El nombre del sello coincide con el de la colección, así que las constantes
// `COL_*` de arriba sirven para los dos argumentos de `leerCatalogo`.

// ── Escrituras con timeout ───────────────────────────────────────────────────
//
// `conTimeout` y `EscrituraEncolada` nacieron aquí, para el dinero del coach, y
// desde `05-2` viven en `./core` porque el problema no era del CRM: era de
// cualquier escritura de la app con la caché persistente activa. Se reexporta
// la clase para que los seis modales del CRM que hacen `instanceof` sigan
// importándola de donde siempre — es el mismo objeto, no una copia.
export { EscrituraEncolada } from './core';

function ahora(): string {
  return new Date().toISOString();
}

// ── Contactos (clientes sin cuenta en la app) ────────────────────────────────

export async function getCrmContactos(): Promise<CrmContacto[]> {
  await authReady;
  return leerCatalogo(COL_CONTACTOS, COL_CONTACTOS, d => ({ id: d.id, ...d.data() } as CrmContacto));
}

export async function createCrmContacto(
  data: Omit<CrmContacto, 'id' | 'createdAt' | 'updatedAt'>
): Promise<CrmContacto> {
  await authReady;
  const payload = { ...data, createdAt: ahora(), updatedAt: ahora() };
  const ref = await conTimeout('Crear contacto', addDoc(collection(db, COL_CONTACTOS), stripUndefined(payload)));
  void marcarCatalogoCambiado(COL_CONTACTOS);
  return { ...payload, id: ref.id };
}

export async function updateCrmContacto(id: string, updates: Partial<CrmContacto>): Promise<void> {
  await authReady;
  const payload = stripUndefined({ ...updates, updatedAt: ahora() }) as Record<string, unknown>;
  await conTimeout('Guardar contacto', updateDoc(doc(db, COL_CONTACTOS, id), payload));
  void marcarCatalogoCambiado(COL_CONTACTOS);
}

export async function deleteCrmContacto(id: string): Promise<void> {
  await authReady;
  await conTimeout('Borrar contacto', deleteDoc(doc(db, COL_CONTACTOS, id)));
  void marcarCatalogoCambiado(COL_CONTACTOS);
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
      void marcarCatalogoCambiado(COL_CONTACTOS);
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

// ── Borrado definitivo de un cliente ─────────────────────────────────────────

/**
 * Se lanza al intentar borrar un cliente que tiene cobros YA cobrados. No es
 * un capricho de la UI: la regla de Firestore prohíbe borrar un `crmPagos` con
 * `estado == 'pagado'`, así que el lote fallaría entero a mitad. Un cliente
 * facturado se archiva, no se borra — si no, el mes que ya cuadraste deja de
 * cuadrar.
 */
export class ClienteConCobros extends Error {
  constructor(public readonly cobros: number, public readonly importeCents: number) {
    super(
      `Este cliente tiene ${cobros} ${cobros === 1 ? 'cobro' : 'cobros'} ya cobrados. ` +
      `No se puede borrar sin descuadrar lo facturado: archívalo en su lugar.`
    );
    this.name = 'ClienteConCobros';
  }
}

/**
 * Borra un cliente y TODO su rastro comercial (servicios, pagos pendientes,
 * suscripciones y reuniones) en lotes atómicos de 500.
 *
 * Solo para contactos sin cuenta y para perfiles ya anonimizados —quien tiene
 * cuenta viva se borra desde `api/delete-account.ts`, que además limpia Auth,
 * Storage y sus datos de entreno; borrar aquí su `user_profiles` dejaría todo
 * eso huérfano y la app le crearía un perfil nuevo en su siguiente arranque.
 * Esa comprobación vive en el hook que llama aquí (useEliminarCliente).
 *
 * Lo que NO se borra: nada con dinero ya cobrado — ver `ClienteConCobros`.
 */
export async function eliminarClienteDelCrm(objetivo: {
  clientId: string;
  contactoId?: string;
  userId?: string;
}): Promise<number> {
  await authReady;

  // Se filtra sobre los catálogos (ya en caché local a coste cero) en vez de
  // consultar cinco veces a Firestore, igual que `getCrmXByCliente`.
  const [servicios, pagos, suscripciones, reuniones] = await Promise.all([
    getCrmServicios(), getCrmPagos(), getCrmSuscripciones(), getCrmReuniones(),
  ]);

  const mios = <T extends { clientId: string }>(xs: T[]) => xs.filter(x => x.clientId === objetivo.clientId);
  const pagosDelCliente = mios(pagos);
  const cobrados = pagosDelCliente.filter(p => p.estado === 'pagado');
  if (cobrados.length > 0) {
    throw new ClienteConCobros(cobrados.length, cobrados.reduce((t, p) => t + p.importeCents, 0));
  }

  const refs = [
    ...mios(servicios).map(x => doc(db, COL_SERVICIOS, x.id)),
    ...pagosDelCliente.map(x => doc(db, COL_PAGOS, x.id)),
    ...mios(suscripciones).map(x => doc(db, COL_SUSCRIPCIONES, x.id)),
    ...mios(reuniones).map(x => doc(db, COL_REUNIONES, x.id)),
    ...(objetivo.contactoId ? [doc(db, COL_CONTACTOS, objetivo.contactoId)] : []),
    ...(objetivo.userId ? [doc(db, 'user_profiles', objetivo.userId)] : []),
  ];

  for (const lote of enLotes(refs, TAMANO_LOTE)) {
    const batch = writeBatch(db);
    for (const ref of lote) batch.delete(ref);
    await conTimeout('Borrar cliente', batch.commit());
  }

  // Se marcan los cinco sellos aunque no todos hayan cambiado: es una escritura
  // puntual y manual, no un camino caliente, y equivocarse por defecto aquí
  // significa dejarle al coach su propia caché mostrando a alguien que borró.
  for (const col of [COL_CONTACTOS, COL_SERVICIOS, COL_PAGOS, COL_SUSCRIPCIONES, COL_REUNIONES]) {
    void marcarCatalogoCambiado(col);
  }
  return refs.length;
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
  updates: Partial<Pick<UserProfile,
    'displayName' | 'dni' | 'direccion' | 'telefono' | 'estadoCrm' |
    'fechaBaja' | 'motivoBaja' | 'motivoBajaDetalle' | 'origen' | 'archivadoCrm'
  >>
): Promise<void> {
  await authReady;
  const payload = stripUndefined(updates) as Record<string, unknown>;
  if (Object.keys(payload).length === 0) return;
  await conTimeout('Guardar cliente', updateDoc(doc(db, 'user_profiles', userId), payload));
}

// ── Servicios ────────────────────────────────────────────────────────────────

export async function getCrmServicios(): Promise<CrmServicio[]> {
  await authReady;
  return leerCatalogo(COL_SERVICIOS, COL_SERVICIOS, d => ({ id: d.id, ...d.data() } as CrmServicio));
}

export async function getCrmServiciosByCliente(clientId: string): Promise<CrmServicio[]> {
  return (await getCrmServicios()).filter(s => s.clientId === clientId);
}

/**
 * Crea un servicio y, si `importeCents > 0`, su(s) pago(s) pendiente(s)
 * asociado(s) — el servicio y TODAS sus cuotas, o ninguno. Sin la
 * transacción, un fallo a medias deja un servicio contratado con cobros
 * incompletos, y eso no se nota hasta que cuadras las cuentas a fin de mes.
 *
 * `cuotas` fracciona el importe en pagos mensuales sucesivos (el 3× 329 €/mes
 * de la oferta de 12 semanas) — 1 o ausente es el caso de siempre, un pago
 * único por el importe completo.
 */
export async function createCrmServicioConPago(
  data: Omit<CrmServicio, 'id' | 'createdAt' | 'updatedAt'>,
  opciones: { generarPago: boolean; cuotas?: number; primerCobro?: string }
): Promise<{ servicio: CrmServicio; pagos: CrmPago[] }> {
  await authReady;
  const ts = ahora();
  const servicioRef = doc(collection(db, COL_SERVICIOS));

  const servicio: CrmServicio = { ...data, id: servicioRef.id, createdAt: ts, updatedAt: ts };
  const debeGenerarPago = opciones.generarPago && data.importeCents > 0;
  const numCuotas = Math.max(1, opciones.cuotas ?? 1);

  const pagos: CrmPago[] = [];
  if (debeGenerarPago) {
    const importes = repartirEnCuotas(data.importeCents, numCuotas);
    // La emisión del primer cobro es la fecha en que TOCA cobrar, que no tiene
    // por qué ser hoy: un plan que empieza el lunes que viene se cobra ese
    // lunes. Antes se anclaba siempre a `fechaContratacion` y un servicio
    // contratado hoy para empezar en dos semanas nacía ya con su cobro
    // «pendiente desde hoy» — y a los ocho días, marcado en rojo por retraso.
    let fechaCuota = opciones.primerCobro || data.fechaInicio || data.fechaContratacion;
    for (let i = 0; i < numCuotas; i++) {
      const pagoRef = doc(collection(db, COL_PAGOS));
      pagos.push({
        id: pagoRef.id,
        clientId: data.clientId,
        clientNombre: data.clientNombre,
        servicioId: servicioRef.id,
        concepto: numCuotas > 1 ? `${data.nombre} (${i + 1}/${numCuotas})` : data.nombre,
        importeCents: importes[i],
        estado: 'pendiente',
        fechaEmision: fechaCuota,
        ...(numCuotas > 1 ? { numeroCuota: i + 1, totalCuotas: numCuotas } : {}),
        createdAt: ts,
        updatedAt: ts,
        createdBy: data.createdBy,
      });
      fechaCuota = sumarMeses(fechaCuota, 1);
    }
  }

  await conTimeout('Crear servicio', runTransaction(db, async tx => {
    const { id: _sid, ...servicioDoc } = servicio;
    tx.set(servicioRef, stripUndefined(servicioDoc));
    for (const pago of pagos) {
      const { id: pagoId, ...pagoDoc } = pago;
      tx.set(doc(db, COL_PAGOS, pagoId), stripUndefined(pagoDoc));
    }
  }));

  void marcarCatalogoCambiado(COL_SERVICIOS);
  if (pagos.length > 0) void marcarCatalogoCambiado(COL_PAGOS);

  return { servicio, pagos };
}

export async function updateCrmServicio(id: string, updates: Partial<CrmServicio>): Promise<void> {
  await authReady;
  const payload = stripUndefined({ ...updates, updatedAt: ahora() }) as Record<string, unknown>;
  await conTimeout('Guardar servicio', updateDoc(doc(db, COL_SERVICIOS, id), payload));
  void marcarCatalogoCambiado(COL_SERVICIOS);
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
  return leerCatalogo(COL_PAGOS, COL_PAGOS, d => ({ id: d.id, ...d.data() } as CrmPago));
}

export async function getCrmPagosByCliente(clientId: string): Promise<CrmPago[]> {
  return (await getCrmPagos()).filter(p => p.clientId === clientId);
}

export async function createCrmPago(
  data: Omit<CrmPago, 'id' | 'createdAt' | 'updatedAt'>
): Promise<CrmPago> {
  await authReady;
  const payload = { ...data, createdAt: ahora(), updatedAt: ahora() };
  const ref = await conTimeout('Registrar pago', addDoc(collection(db, COL_PAGOS), stripUndefined(payload)));
  void marcarCatalogoCambiado(COL_PAGOS);
  return { ...payload, id: ref.id };
}

export async function updateCrmPago(id: string, updates: Partial<CrmPago>): Promise<void> {
  await authReady;
  const payload = stripUndefined({ ...updates, updatedAt: ahora() }) as Record<string, unknown>;
  await conTimeout('Guardar pago', updateDoc(doc(db, COL_PAGOS, id), payload));
  void marcarCatalogoCambiado(COL_PAGOS);
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
  void marcarCatalogoCambiado(COL_PAGOS);
}

// ── Suscripciones ────────────────────────────────────────────────────────────

export async function getCrmSuscripciones(): Promise<CrmSuscripcion[]> {
  await authReady;
  return leerCatalogo(COL_SUSCRIPCIONES, COL_SUSCRIPCIONES, d => ({ id: d.id, ...d.data() } as CrmSuscripcion));
}

export async function getCrmSuscripcionesByCliente(clientId: string): Promise<CrmSuscripcion[]> {
  return (await getCrmSuscripciones()).filter(s => s.clientId === clientId);
}

/**
 * Da de alta una suscripción y, si `generarPrimerCobro`, su primer cobro
 * pendiente en el MISMO lote — con `fechaEmision` en la fecha de ese primer
 * cobro (que puede ser futura) y `proximoCobro` ya avanzado un periodo.
 *
 * Por qué existe la opción: sin ella, una suscripción que empieza el lunes que
 * viene no aparecía en ningún sitio como dinero por cobrar hasta que alguien
 * se acordara de pulsar «Registrar cobro» — el cobro no existía, así que ni
 * salía en Pagos, ni en «Pendiente de cobro», ni en el resumen. Se cobra
 * pronto o tarde, pero se ve desde el minuto uno.
 */
export async function createCrmSuscripcion(
  data: Omit<CrmSuscripcion, 'id' | 'createdAt' | 'updatedAt' | 'ultimoCobroGeneradoEn'>,
  opciones: { generarPrimerCobro?: boolean } = {}
): Promise<CrmSuscripcion> {
  await authReady;
  const ts = ahora();
  const generar = Boolean(opciones.generarPrimerCobro) && data.importeCents > 0;

  if (!generar) {
    const payload = { ...data, createdAt: ts, updatedAt: ts };
    const ref = await conTimeout('Crear suscripción', addDoc(collection(db, COL_SUSCRIPCIONES), stripUndefined(payload)));
    void marcarCatalogoCambiado(COL_SUSCRIPCIONES);
    return { ...payload, id: ref.id };
  }

  const subRef = doc(collection(db, COL_SUSCRIPCIONES));
  const pagoRef = doc(collection(db, COL_PAGOS));
  const suscripcion: CrmSuscripcion = {
    ...data,
    id: subRef.id,
    // El ciclo que se acaba de emitir ya no es el próximo: el siguiente es un
    // periodo después. Es exactamente lo que hace `registrarCobroSuscripcion`.
    proximoCobro: avanzarPeriodo(data.proximoCobro, data.periodicidad),
    ultimoCobroGeneradoEn: ts,
    createdAt: ts,
    updatedAt: ts,
  };

  const batch = writeBatch(db);
  const { id: _sid, ...subDoc } = suscripcion;
  batch.set(subRef, stripUndefined(subDoc));
  batch.set(pagoRef, stripUndefined({
    clientId: data.clientId,
    clientNombre: data.clientNombre,
    suscripcionId: subRef.id,
    concepto: data.concepto,
    importeCents: data.importeCents,
    estado: 'pendiente' as const,
    fechaEmision: data.proximoCobro,
    createdAt: ts,
    updatedAt: ts,
    createdBy: data.createdBy,
  }));
  await conTimeout('Crear suscripción', batch.commit());

  void marcarCatalogoCambiado(COL_SUSCRIPCIONES);
  void marcarCatalogoCambiado(COL_PAGOS);
  return suscripcion;
}

export async function updateCrmSuscripcion(id: string, updates: Partial<CrmSuscripcion>): Promise<void> {
  await authReady;
  const payload = stripUndefined({ ...updates, updatedAt: ahora() }) as Record<string, unknown>;
  await conTimeout('Guardar suscripción', updateDoc(doc(db, COL_SUSCRIPCIONES, id), payload));
  void marcarCatalogoCambiado(COL_SUSCRIPCIONES);
}

/**
 * Borra una suscripción. Los pagos que YA generó no se tocan: son cobros que
 * existieron (algunos ya cobrados), y borrarlos descuadraría meses cerrados.
 * Se borra la regla de recurrencia, no su historial — si además sobra algún
 * cobro pendiente que generó, se borra uno a uno desde la tabla de pagos.
 */
export async function deleteCrmSuscripcion(id: string): Promise<void> {
  await authReady;
  await conTimeout('Borrar suscripción', deleteDoc(doc(db, COL_SUSCRIPCIONES, id)));
  void marcarCatalogoCambiado(COL_SUSCRIPCIONES);
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

  const pago = await conTimeout('Registrar cobro', runTransaction(db, async tx => {
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

  // Solo si la transacción confirmó: cuando pierde la carrera lanza
  // `CobroYaRegistrado` desde dentro y no se llega aquí — que es lo correcto,
  // porque en ese caso quien ganó ya marcó los dos sellos.
  void marcarCatalogoCambiado(COL_PAGOS);
  void marcarCatalogoCambiado(COL_SUSCRIPCIONES);
  return pago;
}

// ── Reuniones ────────────────────────────────────────────────────────────────

export async function getCrmReuniones(): Promise<CrmReunion[]> {
  await authReady;
  return leerCatalogo(COL_REUNIONES, COL_REUNIONES, d => ({ id: d.id, ...d.data() } as CrmReunion));
}

export async function getCrmReunionesByCliente(clientId: string): Promise<CrmReunion[]> {
  return (await getCrmReuniones()).filter(r => r.clientId === clientId);
}

export async function createCrmReunion(
  data: Omit<CrmReunion, 'id' | 'createdAt' | 'updatedAt'>
): Promise<CrmReunion> {
  await authReady;
  const payload = { ...data, createdAt: ahora(), updatedAt: ahora() };
  const ref = await conTimeout('Crear reunión', addDoc(collection(db, COL_REUNIONES), stripUndefined(payload)));
  void marcarCatalogoCambiado(COL_REUNIONES);
  return { ...payload, id: ref.id };
}

export async function updateCrmReunion(id: string, updates: Partial<CrmReunion>): Promise<void> {
  await authReady;
  const payload = stripUndefined({ ...updates, updatedAt: ahora() }) as Record<string, unknown>;
  await conTimeout('Guardar reunión', updateDoc(doc(db, COL_REUNIONES, id), payload));
  void marcarCatalogoCambiado(COL_REUNIONES);
}
