// Lee la tabla nutricional de una foto de etiqueta y devuelve lo que pone por
// 100 g (o 100 ml). Lo usa «Crear alimento desde su etiqueta»: rellena el
// formulario y el atleta lo revisa antes de guardar, así que un error de
// lectura nunca entra solo en el diario.
//
//   1. verifica el ID token de Firebase y que sea un usuario de la app;
//   2. aplica un tope diario por usuario (transacción, fail-closed);
//   3. manda la foto al asistente con una salida JSON con esquema fijo.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { getAdminDb, setCors, tokenDeLaCabecera, verifyFirebaseIdToken } from './_lib/auth.js';
import { hoyIsoLocal } from '../src/utils/trainingWeek.js';

export const config = { maxDuration: 60 };

const MODELO = 'claude-opus-5-5';
const LECTURAS_POR_DIA = 20;
/** La foto llega ya reducida desde el móvil (≤ 1600 px); esto es un tope de seguridad. */
const MAX_BASE64 = 4_000_000;
const TIPOS = new Set(['image/jpeg', 'image/png', 'image/webp']);

const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['legible', 'nombre', 'unidad', 'kcal', 'hidratos', 'proteinas', 'grasas', 'soloPorRacion', 'aviso'],
  properties: {
    legible: { type: 'boolean', description: 'true si se ve una tabla de información nutricional legible' },
    nombre: { type: ['string', 'null'], description: 'Nombre del producto si aparece en la foto; si no, null' },
    unidad: { type: 'string', enum: ['g', 'ml'] },
    kcal: { type: ['number', 'null'] },
    hidratos: { type: ['number', 'null'] },
    proteinas: { type: ['number', 'null'] },
    grasas: { type: ['number', 'null'] },
    soloPorRacion: { type: 'boolean', description: 'true si la etiqueta solo da valores por ración, sin columna por 100' },
    aviso: { type: ['string', 'null'], description: 'Una frase corta en español si algo no se lee bien; si no, null' },
  },
} as const;

const INSTRUCCIONES = `Lees fotos de etiquetas de alimentos (normalmente en español) y copias la tabla de información nutricional.

- Copia la columna «por 100 g» o «por 100 ml». Nunca la de por ración ni la de %IR.
- kcal: el valor en kcal. Si la etiqueta solo da kJ, divide entre 4,184.
- hidratos: «Hidratos de carbono», no «de los cuales azúcares».
- grasas: «Grasas» totales, no «de las cuales saturadas».
- proteinas: «Proteínas».
- unidad: «ml» si la columna es por 100 ml; si no, «g».
- Si un valor no se lee con seguridad, pon null en vez de adivinarlo y explícalo en «aviso».
- Si solo hay valores por ración, pon soloPorRacion true y los cuatro valores a null.
- Si la foto no muestra una tabla nutricional, legible false y todo lo demás a null.`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req.headers.origin, (k, v) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Método no permitido' }); return; }
  if (!process.env.ANTHROPIC_API_KEY) { res.status(500).json({ error: 'Falta la clave del asistente en el servidor' }); return; }

  const idToken = tokenDeLaCabecera(req.headers.authorization);
  if (!idToken) { res.status(401).json({ error: 'Falta el token de autenticación' }); return; }
  const usuario = await verifyFirebaseIdToken(idToken);
  if (!usuario) { res.status(401).json({ error: 'Token inválido o caducado' }); return; }

  const body = (req.body ?? {}) as { imagen?: unknown; tipo?: unknown };
  const imagen = typeof body.imagen === 'string' ? body.imagen : '';
  const tipo = typeof body.tipo === 'string' && TIPOS.has(body.tipo) ? body.tipo as 'image/jpeg' | 'image/png' | 'image/webp' : null;
  if (!imagen || !tipo || imagen.length > MAX_BASE64 || !/^[A-Za-z0-9+/=]+$/.test(imagen)) {
    res.status(400).json({ error: 'La foto no es válida' });
    return;
  }

  // Solo usuarios de la app, y con tope diario. Sin Firestore no se sabe ni lo
  // uno ni lo otro: se rechaza (fail-closed), igual que el chat del coach.
  const db = await getAdminDb();
  if (!db) { res.status(503).json({ error: 'El servicio no está disponible. Inténtalo en un rato.' }); return; }
  try {
    const perfil = await db.collection('user_profiles').doc(usuario.uid).get();
    if (!perfil.exists) { res.status(403).json({ error: 'Solo para usuarios de la app' }); return; }
    const ref = db.collection('lecturasEtiqueta').doc(`${usuario.uid}_${hoyIsoLocal()}`);
    const permitido = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const n = (snap.data()?.count as number) || 0;
      if (n >= LECTURAS_POR_DIA) return false;
      tx.set(ref, { count: n + 1, userId: usuario.uid, fecha: hoyIsoLocal() }, { merge: true });
      return true;
    });
    if (!permitido) { res.status(429).json({ error: `Has llegado a las ${LECTURAS_POR_DIA} lecturas de hoy. Copia los datos a mano o vuelve mañana.` }); return; }
  } catch (err) {
    console.error('leer-etiqueta: control de uso no disponible:', err);
    res.status(503).json({ error: 'El servicio no está disponible. Inténtalo en un rato.' });
    return;
  }

  const client = new Anthropic();
  try {
    const respuesta = await client.beta.messages.create({
      model: MODELO,
      max_tokens: 2000,
      // Si el modelo declina, la API repite la petición en el de reserva dentro de la misma llamada.
      betas: ['server-side-fallback-2026-06-01'],
      fallbacks: [{ model: 'claude-opus-4-8' }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: ESQUEMA } },
      system: INSTRUCCIONES,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: tipo, data: imagen } },
          { type: 'text', text: 'Copia la información nutricional de esta etiqueta.' },
        ],
      }],
    });
    if (respuesta.stop_reason === 'refusal') { res.status(422).json({ error: 'No se ha podido leer esta foto. Copia los datos a mano.' }); return; }
    const texto = respuesta.content.find(b => b.type === 'text');
    if (!texto || texto.type !== 'text') throw new Error('Respuesta sin texto');
    const datos = JSON.parse(texto.text) as Record<string, unknown>;
    res.status(200).json(datos);
  } catch (err) {
    console.error('leer-etiqueta: fallo del asistente:', err);
    res.status(502).json({ error: 'No se ha podido leer la etiqueta. Inténtalo otra vez o copia los datos a mano.' });
  }
}
