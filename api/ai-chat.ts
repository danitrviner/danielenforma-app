// Proxy autenticado hacia la Messages API de Anthropic para el asistente IA del
// coach. La ANTHROPIC_API_KEY vive solo aquí (env var de Vercel), nunca en el
// bundle del navegador. El cliente ejecuta las tools; esta función solo:
//   1. verifica el ID token de Firebase y exige el email del coach
//   2. aplica whitelist de modelos + clamp de max_tokens (guardarraíl de coste)
//   3. reenvía la petición a Anthropic y devuelve el mensaje completo
//   4. escribe una fila de auditoría en aiAuditLog (admin SDK, el cliente no puede)
import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';

export const config = { maxDuration: 60 };

const COACH_EMAIL = 'danitrviner@gmail.com';
const PROJECT_ID = 'fleet-operator-z5xj8';
const DATABASE_ID = 'ai-studio-b38fc63b-000e-4d2c-b774-20351883e870';
const ALLOWED_MODELS = new Set(['claude-sonnet-5', 'claude-haiku-4-5']);
const MAX_TOKENS_CAP = 8192;
const DAILY_CALL_LIMIT = 400;

// El service account (JSON en FIREBASE_SERVICE_ACCOUNT) habilita las escrituras
// de auditoría; sin él la verificación de tokens sigue funcionando (solo
// necesita el projectId) y la auditoría se omite con un warning.
function getAdminApp(): App {
  const existing = getApps();
  if (existing.length > 0) return existing[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw) {
    return initializeApp({ credential: cert(JSON.parse(raw)), projectId: PROJECT_ID });
  }
  return initializeApp({ projectId: PROJECT_ID });
}

function getDb(): Firestore | null {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) return null;
  return getFirestore(getAdminApp(), DATABASE_ID);
}

function setCors(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Método no permitido' }); return; }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurada en Vercel' });
    return;
  }

  // ── Autenticación: solo el coach ──────────────────────────────────────────
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) { res.status(401).json({ error: 'Falta el token de autenticación' }); return; }
  try {
    const decoded = await getAuth(getAdminApp()).verifyIdToken(idToken);
    if ((decoded.email || '').toLowerCase() !== COACH_EMAIL) {
      res.status(403).json({ error: 'Solo el coach puede usar el asistente' });
      return;
    }
  } catch {
    res.status(401).json({ error: 'Token inválido o caducado' });
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
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  if (db) {
    try {
      const counterRef = db.collection('aiUsage').doc(`daily_${today}`);
      const snap = await counterRef.get();
      const count = (snap.exists ? (snap.data()?.count as number) : 0) || 0;
      if (count >= DAILY_CALL_LIMIT) {
        res.status(429).json({ error: `Límite diario de ${DAILY_CALL_LIMIT} llamadas alcanzado` });
        return;
      }
      await counterRef.set({ count: FieldValue.increment(1), date: today }, { merge: true });
    } catch (err) {
      console.warn('Contador diario no disponible:', err);
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
