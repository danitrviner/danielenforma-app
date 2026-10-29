// El bucle de agente del AUTOPILOTO, en servidor y por rondas.
//
// El del navegador (src/ai/aiClient.ts) hace todas las rondas de un turno en
// una conexión, porque hay una persona delante y la función de Vercel puede
// vivir 300 s. Aquí no hay nadie delante y un episodio de «alta» son 13
// rondas de mediana (auditoría §B.2): no caben en una invocación. Así que la
// unidad es UNA RONDA — una llamada al modelo y la ejecución de las tools que
// pida — y el estado (historial, ronda, coste) vive en el propio documento del
// episodio. Quien llama (api/autopiloto.ts) encadena rondas mientras le quede
// tiempo y guarda después de cada una: si la función muere a mitad, la
// siguiente invocación retoma desde la última ronda guardada.
//
// Las tools son LAS MISMAS que en la app (src/ai/tools), con la fuente de datos
// de administración registrada por quien llama. Nada de aquí importa Firebase.
import { SYSTEM_PROMPT, buildContextSuffix } from '../../src/ai/systemPrompt.js';
import { buildDoctrinaBlock } from '../../src/ai/doctrina.js';
import { TOOL_DEFINITIONS, executeTool } from '../../src/ai/tools.server.js';
import { sanearHistorial, cierreDeToolUse } from '../../src/ai/historial.js';
import { conMarcaDeCacheAlFinal, CACHE_1H } from '../../src/ai/cache.js';
import { calcularCosteUsd, type UsoDeTokens } from '../../src/ai/costes.js';
import {
  MAX_RONDAS_POR_EPISODIO, TOPE_USD_POR_EPISODIO, extraerParaDani, promptDeEpisodio, type Episodio,
} from '../../src/autopiloto/episodios.js';
import type { AiChatMessage, AiContentBlock, AiToolUseBlock } from '../../src/types.js';
import { fijarContextoDeEpisodio } from './fuenteAdmin.js';

/** Lo justo de la Messages API que usa el bucle: inyectable para probarlo sin red. */
export interface ClienteModelo {
  crear(params: {
    model: string; max_tokens: number; system: unknown; messages: AiChatMessage[]; tools: unknown;
    output_config: { effort: 'low' | 'medium' | 'high' };
  }): Promise<{ content: AiContentBlock[]; stop_reason: string | null; usage: UsoDeTokens }>;
}

export interface SistemaDelEpisodio {
  doctrina: { entrenamiento: string; nutricion: string };
  volumeLandmarks?: Record<string, { mv: number; mev: number; mavMin: number; mavMax: number; mrv: number }>;
  instruccionesFijas: string;
}

export interface EntradaRonda {
  episodio: Episodio;
  modelo: string;
  cliente: ClienteModelo;
  sistema: SistemaDelEpisodio;
  /** Alias del atleta para el prompt (nunca el nombre completo). */
  alias: string;
  ahora: string;
  /** Qué hacer con cada propuesta que una tool acabe de crear: aplicarla si la
   *  política lo permite, o dejarla. Inyectable; sin él, nada se aplica. */
  aplicar?: (propuestaId: string) => Promise<unknown>;
}

export interface Auditoria {
  ts: string; model: string; inputTokens: number; outputTokens: number;
  cacheReadInputTokens: number; cacheCreationInputTokens: number; costoUsd: number;
  stopReason: string | null; toolNames: string[]; chatId: string; episodioId: string; tipo: string;
}

export interface ResultadoRonda {
  episodio: Episodio;
  auditoria: Auditoria | null;
}

const MAX_TOKENS = 8000;

function cerrar(ep: Episodio, estado: Episodio['estado'], ahora: string, extra: Partial<Episodio> = {}): Episodio {
  return { ...ep, ...extra, estado, actualizadoEn: ahora, cerradoEn: ahora };
}

/** Una ronda: llama al modelo, ejecuta lo que pida, devuelve el episodio actualizado. */
export async function ejecutarRonda(e: EntradaRonda): Promise<ResultadoRonda> {
  const { ahora } = e;
  let ep = e.episodio;
  if (ep.estado !== 'pendiente' && ep.estado !== 'en_curso') return { episodio: ep, auditoria: null };
  if (ep.coste.usd >= TOPE_USD_POR_EPISODIO[ep.tipo]) {
    return { episodio: cerrar(ep, 'fallido', ahora, { error: `Tope de gasto del episodio (${TOPE_USD_POR_EPISODIO[ep.tipo]} $) alcanzado tras ${ep.ronda} rondas.` }), auditoria: null };
  }
  if (ep.ronda >= MAX_RONDAS_POR_EPISODIO) {
    return { episodio: cerrar(ep, 'fallido', ahora, { error: `Más de ${MAX_RONDAS_POR_EPISODIO} rondas sin terminar.` }), auditoria: null };
  }

  const historial: AiChatMessage[] = ep.historial?.length
    ? sanearHistorial(ep.historial)
    : [{ role: 'user', content: [{ type: 'text', text: promptDeEpisodio(ep, { alias: e.alias }) }] }];

  // Mismos cuatro bloques y mismo orden que el navegador, para compartir caché
  // con el chat del coach cuando coinciden en el tiempo.
  const doctrinaBlock = buildDoctrinaBlock(e.sistema.doctrina.entrenamiento, e.sistema.doctrina.nutricion, e.sistema.volumeLandmarks);
  const system = [
    { type: 'text', text: SYSTEM_PROMPT, cache_control: CACHE_1H },
    ...(doctrinaBlock ? [{ type: 'text', text: doctrinaBlock, cache_control: CACHE_1H }] : []),
    { type: 'text', text: `${buildContextSuffix(undefined, e.sistema.instruccionesFijas)}\nEstás en un EPISODIO del autopiloto, sin Dani delante: no preguntes, decide con lo que hay y escala lo que no puedas decidir con add_coach_task.` },
  ];

  const respuesta = await e.cliente.crear({
    model: e.modelo,
    max_tokens: MAX_TOKENS,
    system,
    messages: conMarcaDeCacheAlFinal(historial),
    tools: TOOL_DEFINITIONS,
    output_config: { effort: 'low' },
  });

  const costoUsd = calcularCosteUsd(e.modelo, respuesta.usage);
  const toolUses = respuesta.content.filter((b): b is AiToolUseBlock => b.type === 'tool_use');
  const auditoria: Auditoria = {
    ts: ahora, model: e.modelo,
    inputTokens: respuesta.usage.input_tokens, outputTokens: respuesta.usage.output_tokens,
    cacheReadInputTokens: respuesta.usage.cache_read_input_tokens ?? 0,
    cacheCreationInputTokens: respuesta.usage.cache_creation_input_tokens ?? 0,
    costoUsd, stopReason: respuesta.stop_reason, toolNames: toolUses.map(t => t.name),
    chatId: ep.id, episodioId: ep.id, tipo: ep.tipo,
  };

  const mensajes: AiChatMessage[] = [...historial, { role: 'assistant', content: respuesta.content }];
  ep = {
    ...ep,
    estado: 'en_curso',
    ronda: ep.ronda + 1,
    coste: { usd: ep.coste.usd + costoUsd, llamadas: ep.coste.llamadas + 1, modelo: e.modelo },
    actualizadoEn: ahora,
  };

  if (respuesta.stop_reason === 'refusal') {
    const cierre = cierreDeToolUse(respuesta.content);
    return { episodio: cerrar(ep, 'fallido', ahora, { historial: cierre ? [...mensajes, cierre] : mensajes, error: 'El modelo rechazó la petición.' }), auditoria };
  }
  if (respuesta.stop_reason === 'max_tokens') {
    const cierre = cierreDeToolUse(respuesta.content);
    return { episodio: cerrar(ep, 'fallido', ahora, { historial: cierre ? [...mensajes, cierre] : mensajes, error: 'La respuesta se cortó por longitud.' }), auditoria };
  }

  if (respuesta.stop_reason === 'tool_use' && toolUses.length > 0) {
    fijarContextoDeEpisodio({ episodioId: ep.id, autor: 'asistente', politica: ep.politica });
    const resultados: AiContentBlock[] = [];
    const propuestas = [...ep.propuestas];
    try {
      for (const tu of toolUses) {
        const { content, isError } = await executeTool(tu.name, tu.input, ep.id);
        resultados.push({ type: 'tool_result', tool_use_id: tu.id, content, ...(isError ? { is_error: true } : {}) });
        try {
          const parsed = JSON.parse(content) as { proposalId?: string };
          if (parsed.proposalId) propuestas.push(parsed.proposalId);
        } catch { /* el resultado no es JSON: lectura de texto */ }
      }
    } finally {
      fijarContextoDeEpisodio(null);
    }
    // Las propuestas recién creadas pasan por la política: en sombra y rodaje
    // se quedan; con automático o aviso se aplican ya (aplicarEnServidor.ts).
    if (e.aplicar) {
      for (const id of propuestas.filter(id => !ep.propuestas.includes(id))) {
        try { await e.aplicar(id); } catch (err) { console.warn(`autopiloto: no se pudo aplicar ${id}`, err); }
      }
    }
    return { episodio: { ...ep, historial: [...mensajes, { role: 'user', content: resultados }], propuestas }, auditoria };
  }

  // end_turn: el modelo ha terminado. La última línea «PARA DANI:» es lo que
  // Dani ve en la bandeja; el resto queda en el historial del episodio.
  const texto = respuesta.content.filter((b): b is Extract<AiContentBlock, { type: 'text' }> => b.type === 'text').map(b => b.text).join('\n');
  const paraDani = extraerParaDani(texto);
  const estado: Episodio['estado'] = ep.alertas?.length ? 'escalado' : 'hecho';
  return { episodio: cerrar(ep, estado, ahora, { historial: mensajes, paraDani }), auditoria };
}
