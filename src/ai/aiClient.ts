// Bucle de agente del asistente IA. Corre en el navegador: cada iteración llama
// al proxy de Vercel (que guarda la API key y verifica que somos el coach),
// ejecuta localmente las tools que pida el modelo (src/ai/tools.ts) y reenvía
// los resultados hasta que el modelo responde sin más tool calls.
import { auth } from '../firebase';
import { AiChatMessage, AiContentBlock, AiToolUseBlock } from '../types';
import { SYSTEM_PROMPT, buildContextSuffix } from './systemPrompt';
import { TOOL_DEFINITIONS, executeTool, toolStatusLabel } from './tools';

// En dev el front corre en vite (localhost:3000) sin funciones de Vercel:
// apunta VITE_AI_PROXY_URL al proxy desplegado (https://<proyecto>.vercel.app/api/ai-chat).
// En producción (misma origin de Vercel) basta el default relativo.
const PROXY_URL: string = (import.meta.env.VITE_AI_PROXY_URL as string | undefined) ?? '/api/ai-chat';

const DEFAULT_MODEL = 'claude-sonnet-5';
const MAX_TOOL_ROUNDS = 12;

export interface AgentCallbacks {
  // Se llama tras cada mensaje añadido (assistant o tool_results) — el panel lo
  // usa como fuente de verdad para que un error a mitad de turno no pierda nada.
  onUpdate?: (messages: AiChatMessage[]) => void;
  // Etiqueta de la tool en curso, o null cuando termina.
  onToolStatus?: (label: string | null) => void;
}

interface ProxyResponse {
  message?: {
    content: AiContentBlock[];
    stop_reason: string;
  };
  error?: string;
}

async function postToProxy(idToken: string, body: Record<string, unknown>): Promise<Response> {
  try {
    return await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('No se pudo conectar con el asistente (¿proxy desplegado y VITE_AI_PROXY_URL configurada?).');
  }
}

async function callProxy(body: Record<string, unknown>): Promise<ProxyResponse['message']> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sesión caducada — vuelve a iniciar sesión.');

  // El SDK de Firebase cachea el ID token (~1h de validez) y debería refrescarlo
  // solo, pero en pestañas de larga duración o tras suspender el portátil puede
  // quedarse enviando uno caducado. Ante un 401 del proxy, forzamos un refresco
  // real (getIdToken(true)) y reintentamos una vez antes de rendirnos.
  let res = await postToProxy(await user.getIdToken(), body);
  if (res.status === 401) {
    res = await postToProxy(await user.getIdToken(true), body);
  }

  let data: ProxyResponse;
  try {
    data = await res.json();
  } catch {
    throw new Error(`El asistente devolvió una respuesta inválida (HTTP ${res.status}).`);
  }
  if (!res.ok || !data.message) {
    throw new Error(data.error || `Error del asistente (HTTP ${res.status}).`);
  }
  return data.message;
}

export async function runAgentTurn(
  history: AiChatMessage[],
  userText: string,
  opts: { chatId: string; activeAthlete?: { email: string; name?: string } },
  cb: AgentCallbacks = {},
): Promise<AiChatMessage[]> {
  const messages: AiChatMessage[] = [
    ...history,
    { role: 'user', content: [{ type: 'text', text: userText }] },
  ];
  cb.onUpdate?.(messages);

  // Bloque estático cacheado + sufijo volátil (fecha, cliente activo) fuera de
  // la caché — ver shared prompt-caching: el prefijo debe ser byte-idéntico.
  const system = [
    { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: buildContextSuffix(opts.activeAthlete) },
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const message = await callProxy({
      model: DEFAULT_MODEL,
      max_tokens: 4096,
      system,
      messages,
      tools: TOOL_DEFINITIONS,
      output_config: { effort: 'low' },
      chatId: opts.chatId,
    });
    if (!message) throw new Error('Respuesta vacía del asistente.');

    // Contenido del assistant VERBATIM (incluidos bloques thinking con su
    // signature) — la API rechaza bloques modificados al reenviar el historial.
    messages.push({ role: 'assistant', content: message.content });
    cb.onUpdate?.(messages);

    if (message.stop_reason === 'refusal') {
      throw new Error('El modelo ha rechazado esta petición por políticas de seguridad.');
    }
    if (message.stop_reason === 'max_tokens') {
      throw new Error('La respuesta se cortó por longitud — pide algo más acotado o continúa con otro mensaje.');
    }
    if (message.stop_reason !== 'tool_use') {
      cb.onToolStatus?.(null);
      return messages;
    }

    // Ejecutar todas las tools del lote y devolver TODOS los resultados en un
    // único mensaje user (requisito de la API para tool use en paralelo).
    const toolUses = message.content.filter((b): b is AiToolUseBlock => b.type === 'tool_use');
    const results: AiContentBlock[] = [];
    for (const tu of toolUses) {
      cb.onToolStatus?.(toolStatusLabel(tu.name, tu.input));
      const { content, isError } = await executeTool(tu.name, tu.input, opts.chatId);
      results.push({ type: 'tool_result', tool_use_id: tu.id, content, ...(isError ? { is_error: true } : {}) });
    }
    cb.onToolStatus?.(null);
    messages.push({ role: 'user', content: results });
    cb.onUpdate?.(messages);
  }

  throw new Error(`El asistente superó el límite de ${MAX_TOOL_ROUNDS} rondas de herramientas en un solo turno.`);
}

// Texto plano de un mensaje para títulos/preview.
export function messageText(msg: AiChatMessage): string {
  return msg.content
    .filter((b): b is Extract<AiContentBlock, { type: 'text' }> => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim();
}
