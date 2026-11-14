// La lista de atletas activos, de solo lectura, para que Clips sepa a quién
// asignarle un vídeo.
//
// ── Qué problema resuelve ───────────────────────────────────────────────────
// Clips (el clon de Loom con el que Dani manda feedback en vídeo) tenía su
// propia lista de clientes, escrita a mano y siempre desfasada. La lista de
// verdad es el CRM de En Forma. Las dos formas de que Clips la vea eran:
// darle una clave de servicio de Firestore —una llave de PRODUCCIÓN en otra
// app, por ahorrarse un endpoint— o que En Forma publique exactamente lo que
// quiere enseñar. Esto es la segunda: Clips nunca tiene credenciales de En
// Forma y aquí se decide, campo a campo, qué sale.
//
// ── Qué NO hace ─────────────────────────────────────────────────────────────
// No escribe NADA, nunca: solo hace un `get()` sobre `user_profiles`. Y no
// devuelve el documento del atleta, sino un objeto nuevo con dos campos,
// `nombre` y `email`. Es una lista blanca, no una lista negra: si mañana se
// añade un teléfono, un DNI o un dato de salud al perfil, no se cuela aquí por
// olvido, porque nada se copia salvo lo que está escrito más abajo.
//
// ── Quién es «activo» ───────────────────────────────────────────────────────
// `estadoCrm` con valor 'activo' o AUSENTE (los perfiles anteriores al CRM no
// lo tienen y son clientes de pago normales; ver src/types.ts). Fuera: lead,
// llamada agendada, pausado y baja. Y fuera también los anonimizados por el
// borrado de cuenta y los archivados del CRM, con el mismo criterio que las
// pantallas del coach (src/utils/atletas.ts).
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { timingSafeEqual } from 'node:crypto';
import type { UserProfile } from '../src/types.js';
import { esAnonimizado, esArchivado } from '../src/utils/atletas.js';
import { getAdminDb } from './_lib/auth.js';

/** Lo ÚNICO que sale de aquí. */
export interface AtletaParaClips {
  nombre: string;
  email: string;
}

/**
 * Comparación en tiempo constante: un `===` sobre un secreto lo va filtrando
 * por el reloj, carácter a carácter. Mismo patrón que `api/latido-diario.ts`.
 */
function secretoValido(recibido: string | undefined, esperado: string): boolean {
  if (!recibido) return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * El filtro y el recorte, en una función pura para poder probarla sin
 * Firestore. Devuelve objetos NUEVOS: el perfil original no se reenvía.
 */
export function atletasParaClips(perfiles: UserProfile[]): AtletaParaClips[] {
  return perfiles
    .filter(p => p.role === 'client')
    .filter(p => !!p.email)
    .filter(p => p.estadoCrm === undefined || p.estadoCrm === 'activo')
    .filter(p => !esAnonimizado(p) && !esArchivado(p))
    .map(p => ({
      // Sin nombre se enseña el email: Clips necesita SIEMPRE una etiqueta que
      // pintar en el selector, y una fila vacía es peor que una fea.
      nombre: (p.displayName ?? '').trim() || p.email,
      email: p.email,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Sin CORS a propósito: esto lo llama el servidor de Clips, no un navegador.
  // Si se le pusiera CORS, el secreto tendría que viajar en el front.
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  const secreto = process.env.CLIPS_API_SECRET;
  if (!secreto) {
    // Sin secreto configurado NO se responde. Una lista de los correos de los
    // clientes de pago abierta a internet no es un endpoint, es una fuga.
    res.status(503).json({ error: 'CLIPS_API_SECRET no configurado' });
    return;
  }
  const cabecera = req.headers.authorization ?? '';
  const recibido = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : undefined;
  if (!secretoValido(recibido, secreto)) {
    res.status(401).json({ error: 'No autorizado' });
    return;
  }

  const db = await getAdminDb();
  if (!db) {
    res.status(503).json({ error: 'Sin cuenta de servicio configurada' });
    return;
  }

  let perfiles: UserProfile[];
  try {
    const snap = await db.collection('user_profiles').where('role', '==', 'client').get();
    // El id del documento (el UID) ni se mira: aquí solo hace falta el
    // contenido, y lo que se devuelve se construye campo a campo más abajo.
    perfiles = snap.docs.map(d => d.data() as UserProfile);
  } catch (err) {
    console.error('atletas-activos: no se pudieron leer los perfiles', err);
    res.status(500).json({ error: 'No se pudieron leer los atletas' });
    return;
  }

  const atletas = atletasParaClips(perfiles);
  // Que no se cachee en ningún intermediario: son datos personales y la lista
  // cambia en cuanto el coach toca el CRM.
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ atletas, total: atletas.length });
}
