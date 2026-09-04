// Bucle de agente del asistente IA. Corre en el navegador: cada iteración llama
// al proxy de Vercel (que guarda la API key y verifica que somos el coach),
// ejecuta localmente las tools que pida el modelo (src/ai/tools.ts) y reenvía
// los resultados hasta que el modelo responde sin más tool calls.
//
// api/ai-chat.ts responde en streaming (Server-Sent Events): el texto llega
// token a token en vez de esperar la respuesta completa, y el turno se puede
// cancelar a mitad de camino con el `signal` que pasa AiChatPanel (botón
// «Detener»).
import { auth } from '../firebase';
import { AiChatMessage, AiContentBlock, AiTextBlock, AiThinkingBlock, AiToolUseBlock } from '../types';
import { SYSTEM_PROMPT, buildContextSuffix } from './systemPrompt';
import { buildDoctrinaBlock } from './doctrina';
import { TOOL_DEFINITIONS, executeTool, toolStatusLabel } from './tools';
import { cierreDeToolUse } from './historial';
import { apiUrl } from '../db/apiBase';

// VITE_AI_PROXY_URL sigue teniendo prioridad (dev contra un despliegue
// concreto). Sin ella, `apiUrl` decide: ruta relativa en web, y absoluta a
// producción en la app nativa — donde una relativa apuntaría al bundle local
// del WebView y la llamada no saldría del móvil.
const PROXY_URL: string =
  (import.meta.env.VITE_AI_PROXY_URL as string | undefined)?.trim() || apiUrl('/api/ai-chat');

const DEFAULT_MODEL = 'claude-sonnet-5';
const MAX_TOOL_ROUNDS = 12;
// Antes esto era un plazo único de 65s para la respuesta ENTERA — con
// streaming eso penalizaría sin motivo una respuesta larga que va llegando
// con normalidad. Ahora es un plazo de SILENCIO: se reinicia con cada trozo
// que llega de verdad, y solo salta si el servidor deja de mandar nada en
// absoluto (función de Vercel colgada, conexión cortada a medias...).
const SILENCIO_MAX_MS = 30_000;
// El primer byte tarda más que los siguientes: arranque en frío de la función
// de Vercel, verificación del token de Firebase y contador diario pasan antes
// de que el proxy escriba nada. A partir de ahí el proxy manda un latido cada
// 10s, así que el plazo corto de arriba solo salta si la conexión muere de
// verdad.
const APERTURA_MAX_MS = 60_000;
const NETWORK_RETRY_DELAY_MS = 1500;

export interface AgentCallbacks {
  // Se llama tras cada mensaje añadido o actualizado (assistant en curso,
  // assistant final, o tool_results) — el panel lo usa como fuente de verdad
  // para pintar el texto según va llegando, y para que un error a mitad de
  // turno no deje nada a medias (ver el try/catch dentro de runAgentTurn).
  onUpdate?: (messages: AiChatMessage[]) => void;
  // Etiqueta de la tool en curso, o null cuando termina.
  onToolStatus?: (label: string | null) => void;
  // Coste en USD de CADA llamada al proxy (una por ronda), y el acumulado del
  // turno hasta ese momento — para que el panel enseñe lo que cuesta cada
  // petición sin recalcular precios en el navegador.
  onCost?: (rondaUsd: number, acumuladoUsd: number) => void;
}

interface MensajeStreameado {
  content: AiContentBlock[];
  stop_reason: string;
}

/** Fallo de red al ABRIR la conexión, distinto de un corte a mitad de
 *  streaming — es el único caso en el que tiene sentido reintentar solo,
 *  porque todavía no se ha mostrado nada al atleta. */
class FalloDeRed extends Error {}

/** El propio atleta/coach ha pulsado «Detener» — no es un fallo. */
export class TurnoCancelado extends Error {
  constructor(cause?: unknown) { super('Cancelado.', cause ? { cause } : undefined); this.name = 'TurnoCancelado'; }
}

async function abrirConexion(
  idToken: string, body: Record<string, unknown>, round: number,
  controller: AbortController, reiniciarSilencio: (ms?: number) => void, señalExterna?: AbortSignal,
): Promise<Response> {
  reiniciarSilencio(APERTURA_MAX_MS);
  try {
    return await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (señalExterna?.aborted) throw new TurnoCancelado(err);
    // Antes esto era un `catch {}` sin parámetro: tiraba el error original a
    // la basura, así que era imposible distinguir CORS de un timeout, de
    // estar sin cobertura, o de la función de Vercel cortando la conexión.
    console.error(`[aiClient] fetch a ${PROXY_URL} falló en la ronda ${round}:`, err);
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new FalloDeRed('Sin conexión. El asistente necesita internet.', { cause: err });
    }
    if ((err as { name?: string })?.name === 'AbortError') {
      throw new FalloDeRed(`El asistente no respondió a tiempo (ronda ${round + 1}).`, { cause: err });
    }
    throw new FalloDeRed(
      `No se pudo conectar con el asistente (ronda ${round + 1}): ${(err as Error)?.message ?? 'error de red'}.`,
      { cause: err }
    );
  }
}

/** Trocea el cuerpo de la respuesta en eventos `event: X\ndata: Y\n\n` — el
 *  mismo formato SSE que usa la propia API de Anthropic (ver api/ai-chat.ts,
 *  que reenvía sus eventos tal cual bajo ese formato). Reinicia el plazo de
 *  silencio con cada trozo que llega de verdad, no con cada evento parseado —
 *  un solo trozo de red puede traer varios eventos SSE juntos. */
async function* leerEventosSSE(
  response: Response, reiniciarSilencio: (ms?: number) => void,
): AsyncGenerator<{ tipo: string; datos: any }> {
  if (!response.body) throw new Error('El servidor no devolvió un cuerpo de respuesta.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      reiniciarSilencio();
      buffer += decoder.decode(value, { stream: true });

      let corte: number;
      while ((corte = buffer.indexOf('\n\n')) !== -1) {
        const bloque = buffer.slice(0, corte);
        buffer = buffer.slice(corte + 2);
        let tipo = '';
        let datosCrudos = '';
        for (const linea of bloque.split('\n')) {
          if (linea.startsWith('event:')) tipo = linea.slice(6).trim();
          else if (linea.startsWith('data:')) datosCrudos += linea.slice(5).trim();
        }
        if (!tipo || !datosCrudos) continue;
        try {
          yield { tipo, datos: JSON.parse(datosCrudos) };
        } catch (err) {
          console.warn('[aiClient] evento SSE con JSON inválido, se descarta:', err);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** Consume el stream de UNA llamada al proxy, reconstruyendo el mensaje del
 *  assistant bloque a bloque y avisando a `cb.onUpdate` con cada trozo de
 *  texto que llega — así el panel enseña el texto según se genera en vez de
 *  esperar a que termine el turno entero. */
async function leerRespuestaEnStreaming(
  response: Response,
  mensajesPrevios: AiChatMessage[],
  reiniciarSilencio: (ms?: number) => void,
  cb: AgentCallbacks,
): Promise<{ message: MensajeStreameado; costoUsd: number }> {
  const contenido: AiContentBlock[] = [];
  const jsonParcialPorIndice: Record<number, string> = {};
  let stopReason = 'end_turn';
  let costoUsd = 0;
  // Un turno que termina de verdad se despide: `message_delta` con su
  // `stop_reason`, `message_stop`, y el `costo` del proxy (o un `error`, que
  // lanza abajo). Si el stream se acaba sin nada de eso, la respuesta se cortó
  // a mitad — típicamente la función de Vercel muriendo a los 60 s. Antes eso
  // devolvía un mensaje incompleto como si fuera bueno: el panel se quedaba
  // mudo y el bloque de razonamiento a medias envenenaba el chat para siempre.
  let cerradoPorElServidor = false;
  const mensajeEnCurso = (): AiChatMessage => ({ role: 'assistant', content: contenido });

  for await (const { tipo, datos } of leerEventosSSE(response, reiniciarSilencio)) {
    switch (tipo) {
      case 'error':
        throw new Error(datos?.error || 'El asistente falló a mitad de la respuesta.');

      case 'costo':
        costoUsd = typeof datos?.usd === 'number' ? datos.usd : 0;
        cerradoPorElServidor = true;
        break;

      case 'content_block_start': {
        const bloque = datos.content_block;
        const nuevo: AiContentBlock | null =
          bloque?.type === 'text' ? { type: 'text', text: '' } :
          bloque?.type === 'thinking' ? { type: 'thinking', thinking: '' } :
          bloque?.type === 'tool_use' ? { type: 'tool_use', id: bloque.id, name: bloque.name, input: {} } :
          null;
        if (nuevo) {
          contenido[datos.index] = nuevo;
          if (nuevo.type === 'tool_use') jsonParcialPorIndice[datos.index] = '';
        }
        break;
      }

      case 'content_block_delta': {
        const bloque = contenido[datos.index];
        if (!bloque) break;
        const delta = datos.delta;
        if (delta?.type === 'text_delta' && bloque.type === 'text') {
          (bloque as AiTextBlock).text += delta.text ?? '';
          cb.onUpdate?.([...mensajesPrevios, mensajeEnCurso()]);
        } else if (delta?.type === 'thinking_delta' && bloque.type === 'thinking') {
          (bloque as AiThinkingBlock).thinking += delta.thinking ?? '';
        } else if (delta?.type === 'signature_delta' && bloque.type === 'thinking') {
          (bloque as AiThinkingBlock).signature = ((bloque as AiThinkingBlock).signature ?? '') + (delta.signature ?? '');
        } else if (delta?.type === 'input_json_delta' && bloque.type === 'tool_use') {
          jsonParcialPorIndice[datos.index] = (jsonParcialPorIndice[datos.index] ?? '') + (delta.partial_json ?? '');
        }
        break;
      }

      case 'content_block_stop': {
        const bloque = contenido[datos.index];
        if (bloque?.type === 'tool_use') {
          try {
            (bloque as AiToolUseBlock).input = JSON.parse(jsonParcialPorIndice[datos.index] || '{}');
          } catch (err) {
            console.warn('[aiClient] input de tool_use con JSON inválido:', err);
            (bloque as AiToolUseBlock).input = {};
          }
        }
        break;
      }

      case 'message_delta':
        if (datos.delta?.stop_reason) { stopReason = datos.delta.stop_reason; cerradoPorElServidor = true; }
        break;

      case 'message_stop':
        cerradoPorElServidor = true;
        break;

      default:
        break; // message_start / eventos futuros: nada que reconstruir aquí.
    }
  }

  if (!cerradoPorElServidor) {
    throw new Error(
      'La respuesta se cortó antes de terminar (el servidor corta a los 60 segundos). ' +
      'Puedes reintentar; si pasa siempre, pídeselo por partes.'
    );
  }

  return { message: { content: contenido, stop_reason: stopReason }, costoUsd };
}

async function callProxy(
  body: Record<string, unknown>, round: number, mensajesPrevios: AiChatMessage[],
  señalExterna: AbortSignal | undefined, cb: AgentCallbacks,
): Promise<{ message: MensajeStreameado; costoUsd: number }> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sesión caducada — vuelve a iniciar sesión.');
  if (señalExterna?.aborted) throw new TurnoCancelado();

  // UN controller para TODA la ronda (conexión + lectura del stream): abortar
  // aquí es lo único que de verdad corta un `fetch` con el cuerpo a medio
  // leer. Se combina con `señalExterna` reenviando su cancelación aquí, y con
  // un plazo de silencio que `reiniciarSilencio` va posponiendo mientras
  // lleguen trozos de verdad.
  const controller = new AbortController();
  const reenviarCancelacion = () => controller.abort();
  señalExterna?.addEventListener('abort', reenviarCancelacion, { once: true });
  let temporizadorSilencio: ReturnType<typeof setTimeout> | undefined;
  const reiniciarSilencio = (ms: number = SILENCIO_MAX_MS) => {
    clearTimeout(temporizadorSilencio);
    temporizadorSilencio = setTimeout(() => controller.abort(), ms);
  };

  try {
    // Un reintento si el fallo fue de RED al ABRIR la conexión (no si fue un
    // 4xx/5xx del servidor, que no se arregla repitiendo). 1,5s de espera: ni
    // instantáneo (un hipo de wifi de medio segundo ya se ha resuelto solo)
    // ni tan largo que el atleta crea que se ha colgado.
    let res: Response;
    try {
      res = await abrirConexion(await user.getIdToken(), body, round, controller, reiniciarSilencio, señalExterna);
    } catch (err) {
      if (err instanceof TurnoCancelado) throw err;
      if (!(err instanceof FalloDeRed)) throw err;
      console.warn(`[aiClient] reintentando ronda ${round} tras fallo de red...`);
      await new Promise(r => setTimeout(r, NETWORK_RETRY_DELAY_MS));
      res = await abrirConexion(await user.getIdToken(), body, round, controller, reiniciarSilencio, señalExterna);
    }

    // El SDK de Firebase cachea el ID token (~1h de validez) y debería
    // refrescarlo solo, pero en pestañas de larga duración o tras suspender
    // el portátil puede quedarse enviando uno caducado. Ante un 401 del
    // proxy, forzamos un refresco real (getIdToken(true)) y reintentamos una
    // vez antes de rendirnos.
    if (res.status === 401) {
      res = await abrirConexion(await user.getIdToken(true), body, round, controller, reiniciarSilencio, señalExterna);
    }

    if (!res.ok) {
      // Un error de ANTES de abrir el stream (auth, payload, límite diario)
      // sigue llegando como JSON — api/ai-chat.ts solo cambia a eventos SSE
      // una vez decide que sí va a llamar a Anthropic.
      let mensaje = `Error del asistente (HTTP ${res.status}).`;
      try {
        const data = await res.json();
        if (data?.error) mensaje = data.error;
      } catch { /* cuerpo no-JSON: se queda el mensaje genérico */ }
      throw new Error(mensaje);
    }

    return await leerRespuestaEnStreaming(res, mensajesPrevios, reiniciarSilencio, cb);
  } catch (err) {
    if (err instanceof TurnoCancelado || err instanceof FalloDeRed) throw err;
    if (señalExterna?.aborted) throw new TurnoCancelado(err);
    if ((err as { name?: string })?.name === 'AbortError') {
      throw new Error(
        `El asistente dejó de responder a mitad de la ronda ${round + 1} (demasiado silencio). Puedes reintentar.`,
        { cause: err }
      );
    }
    throw err;
  } finally {
    clearTimeout(temporizadorSilencio);
    señalExterna?.removeEventListener('abort', reenviarCancelacion);
  }
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
  // tool_results de una ronda anterior — un fallo o cancelación solo puede
  // pasar con `messages` en ese estado, ver el try/catch de más abajo), así
  // que no hay que volver a añadir nada. Usarlo con un texto nuevo
  // duplicaría el turno del usuario en vez de reanudarlo.
  userText: string | null,
  opts: {
    chatId: string;
    activeAthlete?: { email: string; name?: string };
    coachInstructions?: string;
    doctrina?: { entrenamiento: string; nutricion: string };
    volumeLandmarks?: Record<string, { mv: number; mev: number; mavMin: number; mavMax: number; mrv: number }>;
    // Botón «Detener» del panel — cancela la ronda en curso.
    signal?: AbortSignal;
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
    ? buildDoctrinaBlock(opts.doctrina.entrenamiento, opts.doctrina.nutricion, opts.volumeLandmarks)
    : '';
  const system = [
    { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ...(doctrinaBlock
      ? [{ type: 'text', text: doctrinaBlock, cache_control: { type: 'ephemeral' } }]
      : []),
    { type: 'text', text: buildContextSuffix(opts.activeAthlete, opts.coachInstructions) },
  ];

  let costoAcumuladoUsd = 0;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let message: MensajeStreameado;
    let costoUsd: number;
    try {
      ({ message, costoUsd } = await callProxy({
        model: DEFAULT_MODEL,
        // 8192 es el tope que aplica el proxy (MAX_TOKENS_CAP en api/ai-chat.ts).
        // Con 4096 una ronda con varias herramientas en paralelo se cortaba a
        // media petición: `stop_reason: 'max_tokens'` con tool_use ya emitidos,
        // que es el estado que rompía el historial (ver ./historial.ts).
        max_tokens: 8192,
        system,
        messages,
        tools: TOOL_DEFINITIONS,
        output_config: { effort: 'low' },
        chatId: opts.chatId,
      }, round, messages, opts.signal, cb));
    } catch (err) {
      // Lo que se haya enseñado en vivo durante esta ronda (texto a medias,
      // un tool_use sin terminar) no es un estado válido para reanudar ni
      // para reenviar a la API — se revierte la vista al último punto bueno
      // conocido (justo antes de esta ronda) para que un reintento
      // posterior (o simplemente escribir un mensaje nuevo) parta de ahí.
      cb.onUpdate?.(messages);
      throw err;
    }
    if (!message) throw new Error('Respuesta vacía del asistente.');
    costoAcumuladoUsd += costoUsd;
    cb.onCost?.(costoUsd, costoAcumuladoUsd);

    // Contenido del assistant VERBATIM (incluidos bloques thinking con su
    // signature) — la API rechaza bloques modificados al reenviar el historial.
    messages.push({ role: 'assistant', content: message.content });
    cb.onUpdate?.(messages);

    // Abortar el turno con herramientas ya pedidas dejaba el historial
    // inválido para la API — y el panel lo guarda igual en su `finally`, así
    // que el chat quedaba roto para siempre. Se cierran esas herramientas con
    // un resultado de «interrumpido» ANTES de avisar del error.
    const abortarTurno = (aviso: string): never => {
      const cierre = cierreDeToolUse(message.content);
      if (cierre) {
        messages.push(cierre);
        cb.onUpdate?.(messages);
      }
      cb.onToolStatus?.(null);
      throw new Error(aviso);
    };

    if (message.stop_reason === 'refusal') {
      abortarTurno('El modelo ha rechazado esta petición por políticas de seguridad.');
    }
    if (message.stop_reason === 'max_tokens') {
      abortarTurno('La respuesta se cortó por longitud — pide algo más acotado o continúa con otro mensaje.');
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
