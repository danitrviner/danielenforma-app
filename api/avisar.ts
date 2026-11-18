// Notificación push en el acto para un aviso que el coach acaba de crear.
//
// ── Por qué existe ──────────────────────────────────────────────────────────
// Los avisos del coach (un «Mandar ahora» de un cuestionario, una fecha movida
// a hoy, la respuesta a una revisión, un mensaje, una nota del día…) los crea
// el NAVEGADOR del coach directamente en `notifications`. Para que además le
// suene al atleta en el móvil hay que mandarlo por FCM con la cuenta de
// servicio, y eso solo puede hacerse en un servidor: los tokens del atleta no
// los puede leer nadie más (firestore.rules, `pushTokens`).
//
// Una sola función para TODOS los avisos del coach: el cliente la llama desde
// `createNotificationDeduped` (src/db/notifications.ts) justo después de crear
// el aviso, con su id. Aquí se lee el aviso de Firestore —no se fía del texto
// que mande el navegador— y se manda.
//
// ── Quién puede llamarla ────────────────────────────────────────────────────
// Solo el coach (mismo patrón que gestionar-acceso: ID token verificado con
// jose + `esCoach`, que exige el correo verificado). La app es de un solo
// coach, así que «el coach de ese atleta» es él. Y solo para avisos dirigidos a
// un atleta, creados hace poco: no es un botón para volver a mandar avisos
// viejos. Cada aviso suena una vez como mucho (api/_lib/push.ts, `pushEnviados`).
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { AppNotification } from '../src/types.js';
import {
  COACH_EMAIL,
  esCoach,
  getAdminDb,
  setCors,
  tokenDeLaCabecera,
  verifyFirebaseIdToken,
} from './_lib/auth.js';
import { avisarPorPush, obtenerMensajeria } from './_lib/push.js';

export const config = { maxDuration: 30 };

/** Un aviso más antiguo que esto no se notifica: ya no es «ahora». */
const VENTANA_MS = 30 * 60 * 1000;

/** Los ids de aviso son claves deterministas (letras, números, _ - . @ +). */
export function idDeAvisoValido(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= 400 && !id.includes('/');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req.headers.origin, (k, v) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Método no permitido' }); return; }

  const idToken = tokenDeLaCabecera(req.headers.authorization);
  if (!idToken) { res.status(401).json({ error: 'Falta el token de autenticación' }); return; }
  const decoded = await verifyFirebaseIdToken(idToken);
  if (!decoded) { res.status(401).json({ error: 'Token inválido o caducado' }); return; }
  if (!esCoach(decoded)) {
    console.warn(`avisar: 403 para ${decoded.email || '(sin email)'}`);
    res.status(403).json({ error: 'Solo el coach puede mandar avisos' });
    return;
  }

  const avisoId = (req.body ?? {}).avisoId as unknown;
  if (!idDeAvisoValido(avisoId)) { res.status(400).json({ error: 'Falta el id del aviso' }); return; }

  const db = await getAdminDb();
  if (!db) { res.status(503).json({ error: 'Falta configurar FIREBASE_SERVICE_ACCOUNT en Vercel.' }); return; }

  const snap = await db.collection('notifications').doc(avisoId).get();
  if (!snap.exists) { res.status(404).json({ error: 'El aviso no existe' }); return; }
  const aviso = { ...(snap.data() as Omit<AppNotification, 'id'>), id: avisoId } as AppNotification;

  const destinatario = (aviso.recipientEmail ?? '').toLowerCase();
  if (!destinatario || destinatario === COACH_EMAIL) {
    // Los avisos para el propio coach se quedan en su campana.
    res.status(200).json({ enviados: 0, motivo: 'no_es_para_un_atleta' });
    return;
  }
  const creado = Date.parse(aviso.createdAt ?? '');
  if (!Number.isFinite(creado) || Math.abs(Date.now() - creado) > VENTANA_MS) {
    res.status(200).json({ enviados: 0, motivo: 'aviso_antiguo' });
    return;
  }

  try {
    const resultado = await avisarPorPush(db, await obtenerMensajeria(), aviso.recipientEmail, [aviso]);
    res.status(200).json(resultado);
  } catch (err) {
    console.error('avisar: fallo al mandar el push:', (err as Error)?.message ?? err);
    res.status(500).json({ error: 'No se pudo mandar la notificación' });
  }
}
