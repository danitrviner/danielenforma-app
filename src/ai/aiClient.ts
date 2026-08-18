// Bucle de agente del asistente IA. Corre en el navegador: cada iteración llama
// al proxy de Vercel (que guarda la API key y verifica que somos el coach),
// ejecuta localmente las tools que pida el modelo (src/ai/tools.ts) y reenvía
// los resultados hasta que el modelo responde sin más tool calls.
import { auth } from '../firebase';
import { AiChatMessage, AiContentBlock, AiToolUseBlock } from '../types';
import { SYSTEM_PROMPT, buildContextSuffix } from './systemPrompt';
import { buildDoctrinaBlock } from './doctrina';
import { TOOL_DEFINITIONS, executeTool, toolStatusLabel } from './tools';
import { apiUrl } from '../db/apiBase';

// VITE_AI_PROXY_URL sigue teniendo prioridad (dev contra un despliegue
// concreto). Sin ella, `apiUrl` decide: ruta relativa en web, y absoluta a
// producción en la app nativa — donde una relativa apuntaría al bundle local
// del WebView y la llamada no saldría del móvil.
const PROXY_URL: string =
  (import.meta.env.VITE_AI_PROXY_URL as string | undefined)?.trim() || apiUrl('/api/ai-chat');

const DEFAULT_MODEL = 'claude-sonnet-5';
const MAX_TOOL_ROUNDS = 12;
// api/ai-chat.ts declara maxDuration: 60 — sin un timeout de cliente por
// encima, una función de Vercel colgada deja el chat "Pensando…" para
// siempre, sin error ni forma de reintentar.
const PROXY_TIMEOUT_MS = 65_000;
const NETWORK_RETRY_DELAY_MS = 1500;

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

/** Fallo de red/timeout, distinto de una respuesta HTTP de error — el único
 *  caso en el que tiene sentido reintentar solo. */
class FalloDeRed extends Error {}

async function postToProxy(idToken: string, body: Record<string, unknown>, round: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);
  try {
    return await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    // Antes esto era un `catch {}` sin parámetro: tiraba el error original a
    // la basura, así que era imposible distinguir CORS de un timeout, de
    // estar sin cobertura, o de la función de Vercel cortando la conexión.
    console.error(`[aiClient] fetch a ${PROXY_URL} falló en la ronda ${round}:`, err);
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new FalloDeRed('Sin conexión. El asistente necesita internet.');
    }
    if ((err as { name?: string })?.name === 'AbortError') {
      throw new FalloDeRed(`El asistente no respondió a tiempo (ronda ${round + 1}).`);
    }
    throw new FalloDeRed(
      `No se pudo conectar con el asistente (ronda ${round + 1}): ${(err as Error)?.message ?? 'error de red'}.`
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function callProxy(body: Record<string, unknown>, round: number): Promise<ProxyResponse['message']> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sesión caducada — vuelve a iniciar sesión.');

  // Un reintento si el fallo fue de RED (no si fue un 4xx/5xx del servidor,
  // que no se arregla repitiendo). 1,5s de espera: ni instantáneo (un hipo de
  // wifi de medio segundo ya se ha resuelto solo) ni tan largo que el atleta
  // crea que se ha colgado.
  let res: Response;
  try {
    res = await postToProxy(await user.getIdToken(), body, round);
  } catch (err) {
    if (!(err instanceof FalloDeRed)) throw err;
    console.warn(`[aiClient] reintentando ronda ${round} tras fallo de red...`);
    await new Promise(r => setTimeout(r, NETWORK_RETRY_DELAY_MS));
    res = await postToProxy(await user.getIdToken(), body, round);
  }

  // El SDK de Firebase cachea el ID token (~1h de validez) y debería refrescarlo
  // solo, pero en pestañas de larga duración o tras suspender el portátil puede
  // quedarse enviando uno caducado. Ante un 401 del proxy, forzamos un refresco
  // real (getIdToken(true)) y reintentamos una vez antes de rendirnos.
  if (res.status === 401) {
    res = await postToProxy(await user.getIdToken(true), body, round);
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

/** Diagnóstico que Dani puede ejecutar desde el móvil (menú de ajustes del
 *  panel del asistente) sin acceso a los logs de Vercel: un OPTIONS y un POST
 *  mínimo a PROXY_URL, con el código HTTP y el cuerpo de error en claro. */
export interface DiagnosticoConexion {
  url: string;
  optionsOk: boolean;
  optionsError?: string;
  postStatus?: number;
  postBody?: string;
  postError?: string;
}

export async function probarConexionProxy(): Promise<DiagnosticoConexion> {
  const resultado: DiagnosticoConexion = { url: PROXY_URL, optionsOk: false };

  try {
    await fetch(PROXY_URL, { method: 'OPTIONS' });
    resultado.optionsOk = true;
  } catch (err) {
    resultado.optionsError = (err as Error)?.message ?? 'error de red';
  }

  try {
    const user = auth.currentUser;
    const idToken = user ? await user.getIdToken() : '';
    const res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ model: DEFAULT_MODEL, max_tokens: 1, messages: [], chatId: 'diagnostico' }),
    });
    resultado.postStatus = res.status;
    resultado.postBody = (await res.text()).slice(0, 500);
  } catch (err) {
    resultado.postError = (err as Error)?.message ?? 'error de red';
  }

  return resultado;
}

export async function runAgentTurn(
  history: AiChatMessage[],
  // `null` reanuda un turno que falló a mitad de camino: `history` YA
  // termina en el mensaje `user` pendiente (el texto del atleta, o los
  // tool_results de una ronda anterior — `postToProxy` solo puede fallar al
  // principio de una ronda, con `messages` siempre en ese estado), así que
  // no hay que volver a añadir nada. Usarlo con un texto nuevo duplicaría el
  // turno del usuario en vez de reanudarlo.
  userText: string | null,
  opts: {
    chatId: string;
    activeAthlete?: { email: string; name?: string };
    coachInstructions?: string;
    doctrina?: { entrenamiento: string; nutricion: string };
  },
  cb: AgentCallbacks = {},
): Promise<AiChatMessage[]> {
  const messages: AiChatMessage[] = userText === null
    ? [...history]
    : [...history, { role: 'user', content: [{ type: 'text', text: userText }] }];
  cb.onUpdate?.(messages);

  // Tres bloques, de más estable a más volátil — el prefijo cacheado debe ser
  // byte-idéntico entre turnos:
  //   1. SYSTEM_PROMPT: modelo de dominio, solo cambia con un despliegue.
  //   2. Doctrina del coach: cambia cuando Dani edita su criterio (raro), así que
  //      también se cachea. Va DESPUÉS del prompt para no invalidar su caché
  //      cuando la edite.
  //   3. Sufijo volátil (fecha, cliente activo, instrucciones fijas): fuera de caché.
  const doctrinaBlock = opts.doctrina
    ? buildDoctrinaBlock(opts.doctrina.entrenamiento, opts.doctrina.nutricion)
    : '';
  const system = [
    { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ...(doctrinaBlock
      ? [{ type: 'text', text: doctrinaBlock, cache_control: { type: 'ephemeral' } }]
      : []),
    { type: 'text', text: buildContextSuffix(opts.activeAthlete, opts.coachInstructions) },
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
    }, round);
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
