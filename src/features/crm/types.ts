// Tipos del módulo CRM. Los campos comerciales del CLIENTE viven en
// `UserProfile` (src/types.ts) — aquí solo está lo que no cabe ahí.
//
// Convención de dinero, importante: TODOS los importes son enteros en
// CÉNTIMOS (`importeCents`), nunca euros en coma flotante. Sumar 30 pagos de
// 49,90 € en float acumula error, y una vez tienes miles de documentos
// escritos migrar la unidad es caro. Formatear con `formatEuros` de lib/dinero.
//
// Las fechas son ISO 'YYYY-MM-DD' (día) o ISO completo (instantes). No se usa
// `Timestamp` de Firestore: el resto de la app (checkins, mesociclos, roadmap,
// pagos de plan) ya guarda strings ISO, y mezclar los dos formatos obliga a
// convertir en cada lectura. Ordenar strings ISO en Firestore funciona igual.

import type { EstadoCrm, MotivoBaja } from '../../types';

export type { EstadoCrm, MotivoBaja };

export type Periodicidad = 'mensual' | 'trimestral' | 'semestral' | 'anual' | 'unico';

/**
 * Qué clase de dinero es un movimiento. Es la columna que faltaba para poder
 * separar «facturación de altas» de «facturación de renovaciones», y de ahí
 * salen el LTV por servicio, el ticket medio de alta y la tasa de renovación.
 * Ver docs/crm-modelo-v2.md.
 *
 * `descuento` y `devolucion` llevan `importeCents` NEGATIVO a propósito: así
 * toda la facturación sigue siendo una suma simple y ningún informe tiene que
 * acordarse de restar.
 */
export type TipoMovimiento = 'alta' | 'renovacion' | 'upsell' | 'descuento' | 'devolucion';

/** Qué clase de venta es un contrato. Un cliente empieza con un `alta`. */
export type TipoServicio = 'alta' | 'renovacion' | 'upsell';

export type MetodoPago = 'transferencia' | 'tarjeta' | 'bizum' | 'efectivo' | 'stripe' | 'otro';

/**
 * `pendiente` es «aún no toca o aún no ha llegado»; `impagado` es «tenía que
 * haber llegado y no ha llegado». Son cosas distintas y el CRM no podía
 * distinguirlas, así que no se podía contestar cuánto había impagado.
 *
 * El paso de `pendiente` a `impagado` LO MARCA EL COACH, nunca el reloj:
 * deducirlo de los días de retraso convertiría un olvido en una deuda.
 *
 * NO hay estado `devuelto`, y es a propósito. Una devolución es su propio
 * movimiento (`tipo: 'devolucion'`, importe negativo) y el cobro original se
 * queda `pagado`: el dinero entró de verdad y luego salió. Marcar además el
 * original como devuelto lo restaría DOS veces —una por sacarlo de la
 * facturación y otra por el movimiento negativo—, que es justo el tipo de
 * fallo que no se ve hasta que los números no cuadran meses después.
 */
export type EstadoPago = 'pendiente' | 'pagado' | 'impagado' | 'parcial';

export type EstadoSuscripcion = 'activa' | 'pausada';

export type TipoReunion = 'optimizacion' | 'graduacion';

// ── Contacto CRM sin cuenta en la app ────────────────────────────────────────
// Por qué existe (y por qué NO es una colección `clientes` paralela):
// `user_profiles` tiene docId = UID de Firebase Auth. Un lead o un cliente
// importado de una hoja de cálculo no tiene cuenta, así que no puede vivir ahí
// sin inventarle un UID falso — y en cuanto esa persona se registre de verdad,
// `getOrCreateUserProfile` creará un SEGUNDO documento (el bug de perfiles
// duplicados que `deduplicateByEmail` lleva parcheando). Peor: cuando dos docs
// comparten email, `getAllUserProfiles` borra uno de los dos en silencio
// (src/db/profiles.ts:243) y ese borrado alcanzaría a datos importados.
//
// Así que: quien tiene cuenta vive en `user_profiles` (extendido). Quien no,
// vive aquí, y `userId` los une en cuanto se registra.
export interface CrmContacto {
  id: string;
  nombre: string;
  email?: string;
  dni?: string;
  direccion?: string;
  telefono?: { prefijo: string; numero: string };
  estadoCrm: EstadoCrm;
  userId?: string;          // UID de user_profiles cuando el contacto ya se registró
  origen?: string;          // 'instagram' | 'referido' | 'ads' | 'importacion' | ...
  notas?: string;
  // Mismo par que UserProfile — ver la nota ahí. Se capturan juntos al marcar
  // estadoCrm = 'baja', nunca por separado.
  fechaBaja?: string;
  motivoBaja?: MotivoBaja;
  motivoBajaDetalle?: string;
  // Archivado: desaparece de las listas del CRM hasta que se desarchiva. No es
  // `estadoCrm: 'baja'` (eso es un hecho comercial que cuenta para el churn);
  // esto es «quítamelo de delante». El espejo en `user_profiles` se llama
  // `archivadoCrm` — ahí `archivado` a secas se confundiría con otras cosas.
  archivado?: boolean;
  createdAt: string;        // ISO
  updatedAt: string;        // ISO
}

// ── Vista unificada que consume TODA la UI del CRM ───────────────────────────
// `useClientes` fusiona `user_profiles` (clientes con cuenta) y `crmContactos`
// (sin cuenta) en esta forma. Ninguna pantalla del CRM debe saber de cuál de
// las dos colecciones viene un cliente — salvo para decidir si enseña el botón
// «Abrir en ClientHub», que solo tiene sentido si `userId` existe.
export interface Cliente {
  id: string;                        // userId si tiene cuenta, id del contacto si no
  fuente: 'perfil' | 'contacto';     // de qué colección salió (para saber dónde escribir)
  userId?: string;                   // presente ⇒ es usuario de la app
  contactoId?: string;               // presente ⇒ tiene doc en crmContactos
  nombre: string;
  email?: string;
  dni?: string;
  direccion?: string;
  telefono?: { prefijo: string; numero: string };
  estadoCrm: EstadoCrm;
  origen?: string;                   // canal de captación: 'instagram' | 'referido' | 'ads' | ...
  fechaBaja?: string;
  motivoBaja?: MotivoBaja;
  motivoBajaDetalle?: string;
  avatarUrl?: string;
  createdAt?: string;
  /** Archivado por el coach: fuera de listas, contadores y selectores del CRM. */
  archivado?: boolean;
  /**
   * Perfil de una cuenta ya borrada (`api/delete-account.ts` lo deja como
   * `borrado_xxxx@anonimo.local`). Se conserva para no reescribir el histórico
   * del negocio, pero no es una persona con la que se pueda trabajar: se trata
   * como archivado en toda la UI del CRM.
   */
  anonimizado?: boolean;
}

// ── Servicio contratado ──────────────────────────────────────────────────────
// Un cliente PUEDE tener varios servicios activos a la vez (asesoría + sesiones
// sueltas, por ejemplo). El modelo lo permite; si tu negocio no lo hace, es una
// validación de UI, no un cambio de esquema. Al revés no funciona: un modelo
// que asume uno solo no puede representar dos sin migración.
export interface CrmServicio {
  id: string;
  clientId: string;
  clientNombre: string;       // denormalizado — evita N lecturas para pintar una tabla
  nombre: string;
  importeCents: number;
  /**
   * Qué clase de venta es. Opcional solo por los documentos escritos antes de
   * 09-2026: `scripts/migrarCrmTipos.mjs` los rellena, y la UI de creación lo
   * pide siempre. Trátalo como obligatorio en código nuevo.
   */
  tipo?: TipoServicio;
  /**
   * OJO: `periodicidad` NO genera nada. Quien crea los movimientos es el número
   * de cuotas que se pide al dar de alta el servicio (pago único = 1 cuota,
   * fraccionado = N). Esto es solo la DURACIÓN del contrato, y sirve para
   * sugerir la fecha de fin y para la etiqueta de la tabla. Había dos ejes
   * diciendo lo mismo a medias y este es el que no manda.
   */
  periodicidad: Periodicidad;
  fechaContratacion: string;  // ISO 'YYYY-MM-DD'
  fechaInicio: string;        // ISO 'YYYY-MM-DD'
  fechaFin?: string;          // ISO 'YYYY-MM-DD'; ausente en servicios sin fin previsto
  descripcion?: string;
  archivado?: boolean;        // baja lógica: un servicio pasado sigue contando en el historial
  /** Se renueva solo al llegar a `proximoCobro`. Absorbe lo que era `CrmSuscripcion`. */
  renovacionAutomatica?: boolean;
  /** Solo con `renovacionAutomatica`. ISO 'YYYY-MM-DD'. */
  proximoCobro?: string;
  /**
   * Cómo acabó este contrato al llegar a su fin. Es lo que llena la pantalla de
   * Renovaciones (previsto / renovado / pendiente / perdido) sin necesitar una
   * colección aparte: se pregunta sobre los servicios que caducan.
   */
  resultadoRenovacion?: ResultadoRenovacion;
  /**
   * Por qué no renovó. Reutiliza los seis motivos de baja (decidido con Dani el
   * 10-09-2026) pero es un campo DISTINTO: terminar el programa y no seguir no
   * es lo mismo que darse de baja a mitad. «Terminó su objetivo» va como
   * `otro` + detalle.
   */
  motivoNoRenovacion?: MotivoBaja;
  motivoNoRenovacionDetalle?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;          // email del coach — trazabilidad
}

export type ResultadoRenovacion = 'renovado' | 'perdido' | 'pendiente';

/**
 * UN MOVIMIENTO ECONÓMICO. Se sigue llamando `CrmPago` y viviendo en
 * `crmPagos` —renombrar una colección con documentos dentro no compra nada—
 * pero conceptualmente es la tabla de movimientos de docs/crm-modelo-v2.md: de
 * aquí sale cualquier informe sin volver a tocar la estructura.
 */
export interface CrmPago {
  id: string;
  clientId: string;
  clientNombre: string;
  /**
   * De qué servicio cuelga. Opcional solo por los huérfanos ya escritos (los
   * que creaba «Registrar pago» suelto y los que generaba una suscripción):
   * un movimiento sin servicio no se puede atribuir a nada, ni a un canal ni al
   * LTV de un servicio, y es la razón por la que no se podía contestar qué
   * servicio genera más dinero. `scripts/migrarCrmTipos.mjs` les crea uno.
   */
  servicioId?: string;
  suscripcionId?: string;
  concepto: string;
  /** En céntimos. NEGATIVO en `descuento` y `devolucion` — ver `TipoMovimiento`. */
  importeCents: number;
  /** Qué clase de dinero es. Opcional solo por los documentos ya escritos. */
  tipo?: TipoMovimiento;
  metodoPago?: MetodoPago;
  estado: EstadoPago;
  /** Cuánto se ha cobrado de verdad. Solo con `estado: 'parcial'`. */
  importeCobradoCents?: number;
  fechaEmision: string;       // ISO 'YYYY-MM-DD'
  fechaCobro?: string;        // ISO 'YYYY-MM-DD'; presente solo si el dinero ha entrado
  // Presentes solo si el pago viene de fraccionar un servicio en N cuotas
  // (p.ej. el 3× 329€ de la oferta de 12 semanas) — un mismo `servicioId`
  // puede tener varios `CrmPago`, cada uno con su cuota/total y su propia
  // fechaEmision escalonada un mes.
  numeroCuota?: number;       // 1-indexado
  totalCuotas?: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

/**
 * @deprecated Desde 09-2026 no se escribe: una suscripción es un servicio con
 * `renovacionAutomatica` y `proximoCobro`. Se sigue LEYENDO para no perder las
 * que ya existen, y la pantalla de Renovaciones las muestra junto a los
 * servicios que caducan. No crear ninguna nueva.
 */
export interface CrmSuscripcion {
  id: string;
  clientId: string;
  clientNombre: string;
  concepto: string;
  importeCents: number;
  periodicidad: Periodicidad;
  proximoCobro: string;             // ISO 'YYYY-MM-DD'
  estado: EstadoSuscripcion;
  ultimoCobroGeneradoEn?: string;   // ISO completo — idempotencia del botón «Registrar cobro»
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export type ResultadoGraduacion = 'continua' | 'no_continua';

export interface CrmReunion {
  id: string;
  clientId: string;
  clientNombre: string;
  tipo: TipoReunion;
  fecha: string;              // ISO 'YYYY-MM-DD'
  realizada: boolean;
  // Solo tiene sentido cuando tipo === 'graduacion'. Es la medición directa de
  // "conversión a continuidad" — la palanca de negocio más grande según
  // objetivo-100k-desglose.md (40% de continuidad baja las ventas nuevas
  // necesarias de ~10/mes a ~6-7/mes). Se pregunta al marcar la graduación
  // como realizada; queda undefined si aún no se ha realizado o si es de tipo
  // 'optimizacion' (donde no aplica).
  resultadoGraduacion?: ResultadoGraduacion;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}
