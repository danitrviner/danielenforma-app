// Proxy autenticado hacia la Messages API de Anthropic para el asistente IA del
// coach. La ANTHROPIC_API_KEY vive solo aquí (env var de Vercel), nunca en el
// bundle del navegador. El cliente ejecuta las tools; esta función solo:
//   1. verifica el ID token de Firebase y exige el email del coach
//   2. aplica whitelist de modelos + clamp de max_tokens (guardarraíl de coste)
//   3. reenvía la petición a Anthropic y devuelve el mensaje completo
//   4. escribe una fila de auditoría en aiAuditLog (admin SDK, el cliente no puede)
import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { createRemoteJWKSet, jwtVerify } from 'jose';

export const config = { maxDuration: 60 };

const COACH_EMAIL = 'danitrviner@gmail.com';
const PROJECT_ID = 'fleet-operator-z5xj8';
const ALLOWED_MODELS = new Set(['claude-sonnet-5', 'claude-haiku-4-5']);
const MAX_TOKENS_CAP = 8192;
const DAILY_CALL_LIMIT = 400;

// Verificación manual del ID token de Firebase con `jose` en vez de
// firebase-admin/auth: esa vía depende de jwks-rsa, que intenta un require()
// CJS de `jose` (ESM-only) y revienta con ERR_REQUIRE_ESM en el runtime de
// Vercel. La verificación manual sigue el esquema documentado por Firebase
// (JWKS público de Google + comprobación de iss/aud/exp) sin esa dependencia rota.
const FIREBASE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.google.com')
);

async function verifyFirebaseIdToken(idToken: string): Promise<{ email: string } | null> {
  try {
    const { payload } = await jwtVerify(idToken, FIREBASE_JWKS, {
      issuer: `https://securetoken.google.com/${PROJECT_ID}`,
      audience: PROJECT_ID,
    });
    if (typeof payload.sub !== 'string' || !payload.sub) return null;
    if (typeof payload.auth_time === 'number' && payload.auth_time * 1000 > Date.now()) return null;
    const email = typeof payload.email === 'string' ? payload.email : '';
    return { email };
  } catch {
    return null;
  }
}

// Firestore admin (auditoría + contador diario) es opcional: sin
// FIREBASE_SERVICE_ACCOUNT configurada en Vercel se omite sin romper el resto.
// Se importa de forma perezosa (import() dinámico) para no arrastrar
// firebase-admin/app en el bundle cuando no hace falta.
async function getDb() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  const { initializeApp, getApps, cert } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = getApps()[0] ?? initializeApp({ credential: cert(JSON.parse(raw)), projectId: PROJECT_ID });
  return getFirestore(app, 'ai-studio-b38fc63b-000e-4d2c-b774-20351883e870');
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
  const decoded = await verifyFirebaseIdToken(idToken);
  if (!decoded) { res.status(401).json({ error: 'Token inválido o caducado' }); return; }
  if (decoded.email.toLowerCase() !== COACH_EMAIL) {
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
  const db = await getDb();
  const today = new Date().toISOString().slice(0, 10);
  if (db) {
    try {
      const { FieldValue } = await import('firebase-admin/firestore');
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
