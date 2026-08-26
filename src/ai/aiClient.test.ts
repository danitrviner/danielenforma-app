import { describe, it, expect, beforeEach, vi } from 'vitest';

/* aiClient.ts consume el proxy en streaming (SSE) — estas pruebas simulan
   respuestas del proxy con Response/ReadableStream reales (disponibles en el
   entorno Node de Vitest) para comprobar que la reconstrucción de bloques
   (texto, tool_use con JSON parcial, coste) y la cancelación funcionan sin
   necesitar un servidor de verdad. */

vi.mock('../firebase', () => ({
  auth: {
    currentUser: {
      getIdToken: async () => 'token-de-prueba',
    },
  },
}));

vi.mock('./tools', () => ({
  TOOL_DEFINITIONS: [],
  toolStatusLabel: (name: string) => `Usando ${name}…`,
  executeTool: vi.fn(async (name: string) => ({ content: `resultado de ${name}`, isError: false })),
}));

import { runAgentTurn, TurnoCancelado } from './aiClient';
import { executeTool } from './tools';
import type { AiChatMessage } from '../types';

function eventoSSE(tipo: string, datos: unknown): string {
  return `event: ${tipo}\ndata: ${JSON.stringify(datos)}\n\n`;
}

/** Construye una Response con cuerpo en streaming a partir de una lista de
 *  eventos SSE — el mismo formato que envía api/ai-chat.ts. */
function respuestaSSE(eventos: Array<{ tipo: string; datos: unknown }>, status = 200): Response {
  const texto = eventos.map(e => eventoSSE(e.tipo, e.datos)).join('');
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(texto));
      controller.close();
    },
  });
  return new Response(stream, { status });
}

/** Igual que respuestaSSE, pero entregando los eventos en varios trozos de
 *  red separados — para comprobar que el parser no depende de que cada
 *  evento llegue de una vez. */
function respuestaSSEEnTrozos(eventos: Array<{ tipo: string; datos: unknown }>): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const e of eventos) controller.enqueue(new TextEncoder().encode(eventoSSE(e.tipo, e.datos)));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

const eventosTextoSimple = [
  { tipo: 'message_start', datos: { type: 'message_start', message: { id: 'msg_1' } } },
  { tipo: 'content_block_start', datos: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } } },
  { tipo: 'content_block_delta', datos: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hola' } } },
  { tipo: 'content_block_delta', datos: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: ' coach' } } },
  { tipo: 'content_block_stop', datos: { type: 'content_block_stop', index: 0 } },
  { tipo: 'message_delta', datos: { type: 'message_delta', delta: { stop_reason: 'end_turn' } } },
  { tipo: 'costo', datos: { usd: 0.0042, usage: { input_tokens: 100, output_tokens: 20 } } },
  { tipo: 'message_stop', datos: { type: 'message_stop' } },
];

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  (executeTool as unknown as ReturnType<typeof vi.fn>).mockClear();
});

describe('runAgentTurn — reconstrucción del streaming', () => {
  it('junta los text_delta en un único bloque de texto', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(respuestaSSE(eventosTextoSimple));

    const mensajes = await runAgentTurn([], '¿Cómo va el mesociclo?', { chatId: 'chat1' });

    expect(mensajes).toHaveLength(2); // user + assistant
    const assistant = mensajes[1];
    expect(assistant.role).toBe('assistant');
    expect(assistant.content).toEqual([{ type: 'text', text: 'Hola coach' }]);
  });

  it('da igual que los eventos lleguen todos juntos o en trozos de red', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(respuestaSSEEnTrozos(eventosTextoSimple));

    const mensajes = await runAgentTurn([], 'hola', { chatId: 'chat1' });

    expect(mensajes[1].content).toEqual([{ type: 'text', text: 'Hola coach' }]);
  });

  it('llama a onUpdate con el texto creciendo en vivo, no solo al final', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(respuestaSSE(eventosTextoSimple));
    const snapshots: string[] = [];

    await runAgentTurn([], 'hola', { chatId: 'chat1' }, {
      onUpdate: msgs => {
        const ultimo = msgs[msgs.length - 1];
        if (ultimo?.role === 'assistant') {
          const bloque = ultimo.content[0];
          if (bloque?.type === 'text') snapshots.push(bloque.text);
        }
      },
    });

    // Al menos una actualización a medias («Hola», antes de « coach») y la final.
    expect(snapshots).toContain('Hola');
    expect(snapshots.at(-1)).toBe('Hola coach');
  });

  it('reporta el coste de la ronda y el acumulado del turno', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(respuestaSSE(eventosTextoSimple));
    const costes: Array<[number, number]> = [];

    await runAgentTurn([], 'hola', { chatId: 'chat1' }, {
      onCost: (ronda, acumulado) => costes.push([ronda, acumulado]),
    });

    expect(costes).toEqual([[0.0042, 0.0042]]);
  });

  it('reconstruye un tool_use a partir de los input_json_delta y ejecuta la tool', async () => {
    const eventosConTool = [
      { tipo: 'content_block_start', datos: { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tu_1', name: 'buscar_atleta' } } },
      { tipo: 'content_block_delta', datos: { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"em' } } },
      { tipo: 'content_block_delta', datos: { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: 'ail":"ana@x.com"}' } } },
      { tipo: 'content_block_stop', datos: { type: 'content_block_stop', index: 0 } },
      { tipo: 'message_delta', datos: { type: 'message_delta', delta: { stop_reason: 'tool_use' } } },
      { tipo: 'costo', datos: { usd: 0.001 } },
    ];
    (fetch as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(respuestaSSE(eventosConTool))
      .mockResolvedValueOnce(respuestaSSE(eventosTextoSimple)); // segunda ronda: responde tras el tool_result

    const mensajes = await runAgentTurn([], 'busca a Ana', { chatId: 'chat1' });

    expect(executeTool).toHaveBeenCalledWith('buscar_atleta', { email: 'ana@x.com' }, 'chat1');
    // user, assistant(tool_use), user(tool_result), assistant(texto)
    expect(mensajes).toHaveLength(4);
    const toolUseMsg = mensajes[1];
    expect(toolUseMsg.content).toEqual([{ type: 'tool_use', id: 'tu_1', name: 'buscar_atleta', input: { email: 'ana@x.com' } }]);
    const toolResultMsg = mensajes[2];
    expect(toolResultMsg.content).toEqual([{ type: 'tool_result', tool_use_id: 'tu_1', content: 'resultado de buscar_atleta' }]);
  });

  it('un evento `error` del proxy se convierte en excepción', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      respuestaSSE([{ tipo: 'error', datos: { error: 'Límite diario de llamadas alcanzado' } }])
    );

    await expect(runAgentTurn([], 'hola', { chatId: 'chat1' })).rejects.toThrow('Límite diario de llamadas alcanzado');
  });

  it('un error a mitad de ronda revierte onUpdate al último estado válido (sin el texto a medias)', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      respuestaSSE([
        { tipo: 'content_block_start', datos: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } } },
        { tipo: 'content_block_delta', datos: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'a medias' } } },
        { tipo: 'error', datos: { error: 'fallo del modelo' } },
      ])
    );
    const historial: AiChatMessage[] = [];
    let ultimaActualizacion: AiChatMessage[] = [];

    await expect(
      runAgentTurn(historial, 'hola', { chatId: 'chat1' }, { onUpdate: msgs => { ultimaActualizacion = msgs; } })
    ).rejects.toThrow('fallo del modelo');

    // La última actualización que vio el panel es SOLO el mensaje del
    // usuario — el texto "a medias" no debe quedar como si fuera válido.
    expect(ultimaActualizacion).toHaveLength(1);
    expect(ultimaActualizacion[0].role).toBe('user');
  });

  it('cancelar a mitad de la petición (botón «Detener») lanza TurnoCancelado', async () => {
    const controller = new AbortController();
    const rechazoAbortado = (): never => {
      const err = new Error('The operation was aborted.');
      err.name = 'AbortError';
      throw err;
    };
    (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce((_url: string, init: RequestInit) => {
      // Por si la señal ya estaba abortada cuando fetch() por fin se llama
      // (getIdToken() de por medio cede el turno al menos una vez) y por si
      // se aborta mientras el fetch está pendiente — un servidor lento real
      // puede cortarse en cualquiera de los dos momentos.
      if (init.signal?.aborted) return Promise.resolve().then(rechazoAbortado);
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted.');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    const turno = runAgentTurn([], 'hola', { chatId: 'chat1', signal: controller.signal });
    controller.abort();

    await expect(turno).rejects.toBeInstanceOf(TurnoCancelado);
  });

  it('sin mensaje de assistant final (stop_reason distinto de tool_use) termina el turno', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(respuestaSSE(eventosTextoSimple));

    const mensajes = await runAgentTurn([], 'hola', { chatId: 'chat1' });

    expect(mensajes[mensajes.length - 1].role).toBe('assistant');
  });

  it('un HTTP no-2xx ANTES de abrir el stream se lee como JSON de error', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Límite diario de 400 llamadas alcanzado' }), { status: 429 })
    );

    await expect(runAgentTurn([], 'hola', { chatId: 'chat1' })).rejects.toThrow('Límite diario de 400 llamadas alcanzado');
  });
});
