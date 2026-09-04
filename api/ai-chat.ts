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
import { esCoach, getAdminDb, setCors, tokenDeLaCabecera, verifyFirebaseIdToken } from './_lib/auth.js';
import { sanearHistorial } from '../src/ai/historial.js';
import type { AiChatMessage } from '../src/types.js';

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
  // Red de seguridad del historial. Un `tool_use` sin su `tool_result` detrás
  // hace que Anthropic rechace la conversación ENTERA con un 400, y el cliente
  // guarda el chat en Firestore: una vez roto, cada mensaje nuevo de ese chat
  // vuelve a fallar. El cliente ya lo repara (src/ai/historial.ts), pero la web
  // va empotrada en el binario nativo: las instalaciones con un bundle anterior
  // a esa corrección seguirían mandando historiales rotos hasta que Apple
  // publique una versión nueva. Repararlo también aquí las cura hoy mismo.
  const mensajesValidos = body.messages.every(
    m => m && typeof m === 'object' && Array.isArray((m as AiChatMessage).content),
  );
  const messages = mensajesValidos
    ? sanearHistorial(body.messages as AiChatMessage[])
    : (body.messages as AiChatMessage[]); // forma inesperada: que la rechace Anthropic, no nosotros
  if (mensajesValidos && JSON.stringify(messages) !== JSON.stringify(body.messages)) {
    console.warn(`Historial reparado en el proxy (chat ${body.chatId ?? '?'}): ${body.messages.length} → ${messages.length} mensajes`);
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

  // ── Coste en USD, para que el coach vea lo que cuesta cada petición ───────
  // Precios oficiales por millón de tokens (ver la whitelist ALLOWED_MODELS,
  // arriba) — si Anthropic cambia precios, esto es lo único que hay que tocar.
  // Multiplicadores de caché fijos según la documentación de Anthropic: 1,25×
  // el precio de entrada al ESCRIBIR en caché (TTL de 5 min, el que usa
  // aiClient.ts con `cache_control: {type: 'ephemeral'}`), 0,1× al LEER.
  const PRECIOS_POR_MTOK: Record<string, { input: number; output: number }> = {
    'claude-sonnet-5': { input: 2, output: 10 },
    'claude-haiku-4-5': { input: 1, output: 5 },
  };
  function calcularCosteUsd(modelo: string, usage: {
    input_tokens: number; output_tokens: number;
    cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null;
  }): number {
    const precio = PRECIOS_POR_MTOK[modelo];
    if (!precio) return 0;
    const MTOK = 1_000_000;
    return (
      (usage.input_tokens * precio.input) / MTOK +
      (usage.output_tokens * precio.output) / MTOK +
      ((usage.cache_creation_input_tokens ?? 0) * precio.input * 1.25) / MTOK +
      ((usage.cache_read_input_tokens ?? 0) * precio.input * 0.1) / MTOK
    );
  }

  // ── Llamada a Anthropic, en streaming ─────────────────────────────────────
  // A partir de aquí cualquier fallo SOLO puede comunicarse dentro del propio
  // stream (evento `error`), nunca con un res.status().json() — las cabeceras
  // de la respuesta ya se han enviado, así que el código HTTP ya es 200 y no
  // se puede cambiar. El cliente (aiClient.ts) sabe leer un evento `error`
  // dentro de un 200 como el fallo que es.
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Sin esto, un proxy delante de la función (o la propia plataforma)
    // puede bufferizar la respuesta y el cliente no ve nada hasta el final —
    // exactamente lo que el streaming se supone que evita.
    'X-Accel-Buffering': 'no',
  });
  const enviarEvento = (tipo: string, datos: unknown) => {
    res.write(`event: ${tipo}\ndata: ${JSON.stringify(datos)}\n\n`);
  };
  // Las cabeceras salen YA, sin esperar al primer evento de Anthropic: el
  // cliente vigila un plazo de silencio (aiClient.ts) y hasta aquí no había
  // recibido ni un byte desde que abrió la conexión — arranque en frío,
  // verificación del token y contador diario iban todos dentro de su plazo.
  res.flushHeaders?.();
  enviarEvento('abierto', { ts: Date.now() });

  // Anthropic puede tardar en soltar el primer token (razonamiento, prompt
  // grande, cola). Sin nada en la línea, el cliente lo interpretaba como que
  // la función se había colgado y cortaba el turno a mitad de la ronda. Un
  // latido cada 10s (comentario SSE: el parseador del cliente lo ignora)
  // mantiene viva la conexión y reinicia ese plazo.
  const latido = setInterval(() => { res.write(': latido\n\n'); }, 10_000);

  try {
    const stream = anthropic.messages.stream({
      model,
      max_tokens: maxTokens,
      system: body.system as never,
      messages: messages as never,
      tools: (body.tools ?? undefined) as never,
      output_config: { effort },
    } as never);

    for await (const event of stream) {
      enviarEvento(event.type, event);
    }

    const message = await stream.finalMessage();
    const costoUsd = calcularCosteUsd(model, message.usage);

    // ── Auditoría server-side (el cliente no puede escribirla ni saltársela) ─
    if (db) {
      db.collection('aiAuditLog').add({
        ts: new Date().toISOString(),
        model,
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        cacheReadInputTokens: message.usage.cache_read_input_tokens ?? 0,
        cacheCreationInputTokens: message.usage.cache_creation_input_tokens ?? 0,
        costoUsd,
        stopReason: message.stop_reason ?? null,
        toolNames: message.content.filter(b => b.type === 'tool_use').map(b => b.name),
        chatId: body.chatId ?? null,
      }).catch(err => console.warn('aiAuditLog write failed:', err));
    }

    // Último evento: el coste de ESTA llamada, para que el panel lo enseñe
    // sin tener que recalcular precios en el navegador.
    enviarEvento('costo', { usd: costoUsd, usage: message.usage });
  } catch (err) {
    const e = err as { status?: number; message?: string };
    console.error('Anthropic stream error:', e);
    enviarEvento('error', { error: e.message || 'Error llamando a la API de Anthropic' });
  } finally {
    clearInterval(latido);
    res.end();
  }
}
