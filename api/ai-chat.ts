// Proxy autenticado hacia la Messages API de Anthropic para el asistente IA del
// coach. La ANTHROPIC_API_KEY vive solo aquí (env var de Vercel), nunca en el
// bundle del navegador. El cliente ejecuta las tools; esta función solo:
//   1. verifica el ID token de Firebase y exige el email del coach
//   2. aplica whitelist de modelos + clamp de max_tokens (guardarraíl de coste)
//   3. reenvía la petición a Anthropic y devuelve el mensaje completo
//   4. escribe una fila de auditoría en aiAuditLog (admin SDK, el cliente no puede)
//
// La verificación de identidad, la lista blanca de CORS y los clientes admin
// viven en ./_lib/auth para que no haya dos definiciones de «quién es el coach».
import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { esCoach, getAdminDb, setCors, tokenDeLaCabecera, verifyFirebaseIdToken } from './_lib/auth';

export const config = { maxDuration: 60 };

const ALLOWED_MODELS = new Set(['claude-sonnet-5', 'claude-haiku-4-5']);
const MAX_TOKENS_CAP = 8192;
const DAILY_CALL_LIMIT = 400;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req.headers.origin, (k, v) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Método no permitido' }); return; }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurada en Vercel' });
    return;
  }

  // ── Autenticación: solo el coach ──────────────────────────────────────────
  const idToken = tokenDeLaCabecera(req.headers.authorization);
  if (!idToken) { res.status(401).json({ error: 'Falta el token de autenticación' }); return; }
  const decoded = await verifyFirebaseIdToken(idToken);
  if (!decoded) { res.status(401).json({ error: 'Token inválido o caducado' }); return; }
  if (!esCoach(decoded)) {
    res.status(403).json({ error: 'Solo el coach puede usar el asistente' });
    return;
  }

  // ── Validación del payload ────────────────────────────────────────────────
  const body = (req.body ?? {}) as {
    model?: string;
    max_tokens?: number;
    system?: unknown;
    messages?: unknown;
    tools?: unknown;
    output_config?: { effort?: string };
    chatId?: string;
  };
  const model = ALLOWED_MODELS.has(body.model || '') ? (body.model as string) : 'claude-sonnet-5';
  const maxTokens = Math.min(Math.max(1, body.max_tokens ?? 4096), MAX_TOKENS_CAP);
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    res.status(400).json({ error: 'messages vacío' });
    return;
  }
  const effort = ['low', 'medium', 'high'].includes(body.output_config?.effort || '')
    ? (body.output_config!.effort as 'low' | 'medium' | 'high')
    : 'low';

  // ── Guardarraíl de coste: contador diario ─────────────────────────────────
  // 04-13. El contador tenía dos problemas. Uno: leer y luego escribir sin
  // transacción deja una ventana en la que N peticiones simultáneas leen el
  // mismo valor y todas pasan, así que el tope no era un tope. Dos: cualquier
  // fallo de Firestore caía en el catch y la petición seguía adelante
  // (fail-open), o sea que tumbar el contador levantaba el límite de gasto.
  // Ahora la comprobación y el incremento van en una transacción, y un fallo
  // corta la petición (fail-closed) en vez de abrir la barra libre.
  const db = await getAdminDb();
  const today = new Date().toISOString().slice(0, 10);
  if (db) {
    try {
      const counterRef = db.collection('aiUsage').doc(`daily_${today}`);
      const withinLimit = await db.runTransaction(async tx => {
        const snap = await tx.get(counterRef);
        const count = (snap.exists ? (snap.data()?.count as number) : 0) || 0;
        if (count >= DAILY_CALL_LIMIT) return false;
        tx.set(counterRef, { count: count + 1, date: today }, { merge: true });
        return true;
      });
      if (!withinLimit) {
        res.status(429).json({ error: `Límite diario de ${DAILY_CALL_LIMIT} llamadas alcanzado` });
        return;
      }
    } catch (err) {
      console.error('Contador diario no disponible, se rechaza la llamada:', err);
      res.status(503).json({ error: 'El control de gasto no está disponible. Inténtalo en un minuto.' });
      return;
    }
  }

  // ── Llamada a Anthropic ───────────────────────────────────────────────────
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  try {
    const message = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      system: body.system as never,
      messages: body.messages as never,
      tools: (body.tools ?? undefined) as never,
      output_config: { effort },
    } as never);

    // ── Auditoría server-side (el cliente no puede escribirla ni saltársela) ─
    if (db) {
      db.collection('aiAuditLog').add({
        ts: new Date().toISOString(),
        model,
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        cacheReadInputTokens: message.usage.cache_read_input_tokens ?? 0,
        cacheCreationInputTokens: message.usage.cache_creation_input_tokens ?? 0,
        stopReason: message.stop_reason ?? null,
        toolNames: message.content.filter(b => b.type === 'tool_use').map(b => b.name),
        chatId: body.chatId ?? null,
      }).catch(err => console.warn('aiAuditLog write failed:', err));
    }

    res.status(200).json({ message });
  } catch (err) {
    const e = err as { status?: number; message?: string };
    console.error('Anthropic API error:', e);
    res.status(e.status && e.status >= 400 && e.status < 600 ? e.status : 502)
      .json({ error: e.message || 'Error llamando a la API de Anthropic' });
  }
}
