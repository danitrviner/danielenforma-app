// Notificaciones push desde el servidor (fase 1: web push con FCM, 18-11-2026).
//
// Vercel ignora en el enrutado todo lo que empiece por `_`, así que esto es un
// módulo, no un endpoint. Lo usan dos sitios:
//
//   · api/latido-diario.ts — los avisos que crea por la noche.
//   · api/avisar.ts        — el aviso que el coach acaba de crear desde la app.
//
// Las decisiones (texto, agrupado, qué token está muerto) viven en
// `src/utils/avisosPush.ts`, que no sabe nada de Firestore ni de FCM. Aquí solo
// se lee, se manda y se limpia.
//
// ── Por qué `pushEnviados` ──────────────────────────────────────────────────
// El aviso de la campana NO sirve para recordar si ya se mandó el push: el
// cliente lo crea con `setDoc` a ciegas (db/notifications.ts), así que el
// coach que vuelve a abrir una pantalla reescribe el documento entero. Un
// campo «pushEnviado» dentro desaparecería con cada reescritura y el atleta
// recibiría la misma notificación cada vez. Por eso cada envío reclama antes
// un documento propio con `create` (atómico: si ya existe, falla), cuyo id es
// un resumen del id del aviso. Lleva el email para que el borrado de cuenta
// lo encuentre (api/_lib/borrarCuenta.ts, POR_CAMPO).
import { createHash } from 'node:crypto';
import type { AppNotification } from '../../src/types.js';
import { mensajeDelDia, tokensMuertos, type MensajePush } from '../../src/utils/avisosPush.js';
import { PROJECT_ID, type getAdminDb } from './auth.js';

type Firestore = NonNullable<Awaited<ReturnType<typeof getAdminDb>>>;

/** Lo mínimo de `firebase-admin/messaging` que se usa: así se simula en las pruebas. */
export interface Mensajeria {
  sendEachForMulticast(mensaje: {
    tokens: string[];
    data: Record<string, string>;
    webpush?: { headers?: Record<string, string> };
  }): Promise<{ successCount: number; failureCount: number; responses: Array<{ success: boolean; error?: { code?: string } }> }>;
}

/** Cuánto aguanta FCM un push sin entregar (móvil apagado): un día. */
const TTL_SEGUNDOS = 24 * 60 * 60;
/** Tope de FCM por llamada multicast. Un atleta no tiene 500 móviles, pero por si acaso. */
const TOPE_MULTICAST = 500;

/** FCM con la cuenta de servicio. `null` si no está configurada (local, pruebas). */
export async function obtenerMensajeria(): Promise<Mensajeria | null> {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  const { initializeApp, getApps, cert } = await import('firebase-admin/app');
  const { getMessaging } = await import('firebase-admin/messaging');
  const app = getApps()[0] ?? initializeApp({ credential: cert(JSON.parse(raw)), projectId: PROJECT_ID });
  return getMessaging(app) as unknown as Mensajeria;
}

/** Id del documento de `pushEnviados` para un aviso: sin el correo a la vista. */
export function idDeEnvio(avisoId: string): string {
  return createHash('sha256').update(avisoId).digest('hex').slice(0, 40);
}

/** Los payloads de datos de FCM solo admiten cadenas. */
export function datosDelMensaje(m: MensajePush): Record<string, string> {
  return { titulo: m.titulo, cuerpo: m.cuerpo, enlace: m.enlace, etiqueta: m.etiqueta };
}

interface TokenGuardado { ref: { delete(): Promise<unknown> }; token: string }

async function leerTokens(db: Firestore, email: string): Promise<TokenGuardado[]> {
  // En minúsculas: así lo guarda el cliente y así lo exigen las reglas.
  const snap = await db.collection('pushTokens').where('email', '==', email.toLowerCase()).get();
  const salida: TokenGuardado[] = [];
  for (const d of snap.docs) {
    const token = (d.data() as { token?: unknown }).token;
    if (typeof token === 'string' && token.length > 0) salida.push({ ref: d.ref, token });
  }
  return salida;
}

/** Reclama el envío de un aviso. `true` si es la primera vez. */
async function reclamar(db: Firestore, avisoId: string, email: string, tipo: string): Promise<boolean> {
  try {
    const ahora = new Date();
    await db.collection('pushEnviados').doc(idDeEnvio(avisoId)).create({
      email: email.toLowerCase(),
      tipo,
      enviadoEn: ahora.toISOString(),
      // Para una política TTL de Firestore, si algún día se activa: pasado un
      // mes ya nadie va a reescribir ese aviso.
      expiraEn: new Date(ahora.getTime() + 30 * 86_400_000),
    });
    return true;
  } catch (err) {
    if ((err as { code?: number }).code === 6) return false; // ALREADY_EXISTS
    // Mismo criterio que crearAvisoUnaVez: cualquier fallo de `create` se
    // trata como «ya estaba». Mejor un push de menos que uno repetido.
    return false;
  }
}

export interface ResultadoPush {
  /** Notificaciones entregadas a FCM (una por dispositivo). */
  enviados: number;
  /** Tokens borrados por muertos. */
  borrados: number;
  /** Por qué no se mandó nada, si no se mandó. */
  motivo?: 'sin_mensajeria' | 'sin_tokens' | 'ya_enviado' | 'sin_avisos';
}

/**
 * Manda UNA notificación a todos los dispositivos de un destinatario con los
 * avisos nuevos que se le pasan (agrupados si son varios), y borra los tokens
 * que FCM rechace por muertos.
 *
 * Todos los avisos deben ser del mismo destinatario; los de otro se ignoran.
 * Nunca lanza por un fallo de FCM: el aviso de la campana ya existe, el push
 * es un extra.
 */
export async function avisarPorPush(
  db: Firestore,
  mensajeria: Mensajeria | null,
  destinatario: string,
  avisos: AppNotification[],
): Promise<ResultadoPush> {
  const suyos = avisos.filter(a => a.recipientEmail === destinatario);
  if (suyos.length === 0) return { enviados: 0, borrados: 0, motivo: 'sin_avisos' };
  if (!mensajeria) return { enviados: 0, borrados: 0, motivo: 'sin_mensajeria' };

  // Primero los tokens: sin dispositivos no se reclama nada (y no se gasta
  // una escritura por aviso en quien nunca activó los avisos).
  const tokens = await leerTokens(db, destinatario);
  if (tokens.length === 0) return { enviados: 0, borrados: 0, motivo: 'sin_tokens' };

  const nuevos: AppNotification[] = [];
  for (const a of suyos) if (await reclamar(db, a.id, destinatario, a.type)) nuevos.push(a);
  const mensaje = mensajeDelDia(nuevos);
  if (!mensaje) return { enviados: 0, borrados: 0, motivo: 'ya_enviado' };

  let enviados = 0;
  let borrados = 0;
  for (let i = 0; i < tokens.length; i += TOPE_MULTICAST) {
    const tanda = tokens.slice(i, i + TOPE_MULTICAST);
    const lista = tanda.map(t => t.token);
    let respuesta;
    try {
      respuesta = await mensajeria.sendEachForMulticast({
        tokens: lista,
        // Solo datos, sin bloque `notification`: la notificación la pinta
        // nuestro service worker (public/firebase-messaging-sw.js), que así
        // decide si hace falta (con la app delante, basta la campana).
        data: datosDelMensaje(mensaje),
        webpush: { headers: { Urgency: 'high', TTL: String(TTL_SEGUNDOS) } },
      });
    } catch (err) {
      console.warn('avisarPorPush: FCM rechazó el envío:', (err as Error)?.message ?? err);
      continue;
    }
    enviados += respuesta.successCount;
    const muertos = new Set(tokensMuertos(lista, respuesta.responses));
    for (const t of tanda) {
      if (!muertos.has(t.token)) continue;
      try { await t.ref.delete(); borrados++; } catch (err) {
        console.warn('avisarPorPush: no se pudo borrar un token muerto:', (err as Error)?.message ?? err);
      }
    }
  }
  return { enviados, borrados };
}
