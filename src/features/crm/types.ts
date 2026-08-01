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

import type { EstadoCrm } from '../../types';

export type { EstadoCrm };

export type Periodicidad = 'mensual' | 'trimestral' | 'semestral' | 'anual' | 'unico';

export type EstadoPago = 'pendiente' | 'pagado';

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
  origen: 'perfil' | 'contacto';     // de qué colección salió (para saber dónde escribir)
  userId?: string;                   // presente ⇒ es usuario de la app
  contactoId?: string;               // presente ⇒ tiene doc en crmContactos
  nombre: string;
  email?: string;
  dni?: string;
  direccion?: string;
  telefono?: { prefijo: string; numero: string };
  estadoCrm: EstadoCrm;
  avatarUrl?: string;
  createdAt?: string;
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
  periodicidad: Periodicidad;
  fechaContratacion: string;  // ISO 'YYYY-MM-DD'
  fechaInicio: string;        // ISO 'YYYY-MM-DD'
  fechaFin?: string;          // ISO 'YYYY-MM-DD'; ausente en servicios sin fin previsto
  descripcion?: string;
  archivado?: boolean;        // baja lógica: un servicio pasado sigue contando en el historial
  createdAt: string;
  updatedAt: string;
  createdBy: string;          // email del coach — trazabilidad
}

export interface CrmPago {
  id: string;
  clientId: string;
  clientNombre: string;
  servicioId?: string;
  suscripcionId?: string;
  concepto: string;
  importeCents: number;
  estado: EstadoPago;
  fechaEmision: string;       // ISO 'YYYY-MM-DD'
  fechaCobro?: string;        // ISO 'YYYY-MM-DD'; presente solo si estado === 'pagado'
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

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

export interface CrmReunion {
  id: string;
  clientId: string;
  clientNombre: string;
  tipo: TipoReunion;
  fecha: string;              // ISO 'YYYY-MM-DD'
  realizada: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}
