import { describe, it, expect } from 'vitest';
import { sanearHistorial, cierreDeToolUse, RESULTADO_INTERRUMPIDO } from './historial';
import type { AiChatMessage } from '../types';

/* El 400 que rompía chats enteros («tool_use ids were found without tool_result
   blocks») se reproduce aquí como estructura de datos: cada caso es un
   historial que Anthropic rechazaría, y lo que se comprueba es que después de
   sanearlo la regla se cumple. */

const texto = (t: string): AiChatMessage => ({ role: 'user', content: [{ type: 'text', text: t }] });
const pide = (...ids: string[]): AiChatMessage => ({
  role: 'assistant',
  content: [
    { type: 'text', text: 'Voy a mirarlo' },
    ...ids.map(id => ({ type: 'tool_use' as const, id, name: 'get_client_overview', input: {} })),
  ],
});
const responde = (...ids: string[]): AiChatMessage => ({
  role: 'user',
  content: ids.map(id => ({ type: 'tool_result' as const, tool_use_id: id, content: 'ok' })),
});

/** La regla que impone la Messages API: cada tool_use tiene su tool_result en
 *  el mensaje inmediatamente siguiente, y no sobra ninguno. */
function esValido(messages: AiChatMessage[]): boolean {
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.content.length === 0) return false;
    const pedidos = m.role === 'assistant'
      ? m.content.filter(b => b.type === 'tool_use').map(b => (b as { id: string }).id)
      : [];
    const siguiente = messages[i + 1];
    const respondidos = siguiente?.role === 'user'
      ? siguiente.content.filter(b => b.type === 'tool_result').map(b => (b as { tool_use_id: string }).tool_use_id)
      : [];
    if (pedidos.join('|') !== respondidos.join('|')) return false;
  }
  return true;
}

describe('sanearHistorial', () => {
  it('deja intacto un historial sano', () => {
    const sano = [texto('¿cómo va Ana?'), pide('t1'), responde('t1'), { role: 'assistant', content: [{ type: 'text', text: 'Bien' }] } as AiChatMessage];
    expect(sanearHistorial(sano)).toEqual(sano);
  });

  it('cierra las herramientas que quedaron sin respuesta (el chat roto de verdad)', () => {
    // Turno cortado por max_tokens: 3 tool_use y detrás el mensaje siguiente
    // del coach, sin ningún tool_result. Esto es el 400 exacto.
    const roto = [texto('hola'), pide('a', 'b', 'c'), texto('¿sigues ahí?')];
    const sano = sanearHistorial(roto);

    expect(esValido(sano)).toBe(true);
    const resultados = sano[2].content;
    expect(resultados.slice(0, 3)).toEqual([
      { type: 'tool_result', tool_use_id: 'a', content: RESULTADO_INTERRUMPIDO, is_error: true },
      { type: 'tool_result', tool_use_id: 'b', content: RESULTADO_INTERRUMPIDO, is_error: true },
      { type: 'tool_result', tool_use_id: 'c', content: RESULTADO_INTERRUMPIDO, is_error: true },
    ]);
    // El texto del coach no se pierde: se conserva detrás de los resultados.
    expect(resultados[3]).toEqual({ type: 'text', text: '¿sigues ahí?' });
    expect(sano).toHaveLength(3);
  });

  it('no borra ningún mensaje del coach al reparar', () => {
    const roto = [texto('uno'), pide('a'), texto('dos'), pide('b'), texto('tres')];
    const sano = sanearHistorial(roto);
    const textos = sano.flatMap(m => m.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text));
    expect(textos).toEqual(expect.arrayContaining(['uno', 'dos', 'tres']));
  });

  it('cierra el turno cuando el historial TERMINA pidiendo herramientas', () => {
    const sano = sanearHistorial([texto('hola'), pide('a', 'b')]);
    expect(esValido(sano)).toBe(true);
    expect(sano).toHaveLength(3);
    expect(sano[2].role).toBe('user');
    expect(sano[2].content).toHaveLength(2);
  });

  it('completa solo los resultados que faltan y respeta el orden pedido', () => {
    const sano = sanearHistorial([pide('a', 'b', 'c'), responde('c', 'a')]);
    expect(esValido(sano)).toBe(true);
    const ids = sano[1].content.map(b => (b as { tool_use_id: string }).tool_use_id);
    expect(ids).toEqual(['a', 'b', 'c']);
    expect((sano[1].content[1] as { content: string }).content).toBe(RESULTADO_INTERRUMPIDO);
    expect((sano[1].content[2] as { content: string }).content).toBe('ok');
  });

  it('descarta tool_result huérfanos y repetidos', () => {
    const sano = sanearHistorial([texto('hola'), responde('fantasma')]);
    expect(esValido(sano)).toBe(true);
    expect(sano).toHaveLength(1); // el mensaje se queda sin contenido y no se envía

    const conRepetido = sanearHistorial([pide('a'), responde('a', 'a')]);
    expect(esValido(conRepetido)).toBe(true);
    expect(conRepetido[1].content).toHaveLength(1);
  });

  it('cierra un assistant pendiente aunque le siga otro assistant', () => {
    const sano = sanearHistorial([pide('a'), { role: 'assistant', content: [{ type: 'text', text: 'ya está' }] }]);
    expect(esValido(sano)).toBe(true);
    expect(sano.map(m => m.role)).toEqual(['assistant', 'user', 'assistant']);
  });

  it('es idempotente', () => {
    const roto = [texto('hola'), pide('a', 'b'), texto('¿y?'), pide('c')];
    const una = sanearHistorial(roto);
    expect(sanearHistorial(una)).toEqual(una);
  });

  it('tolera un historial vacío', () => {
    expect(sanearHistorial([])).toEqual([]);
  });
});

describe('cierreDeToolUse', () => {
  it('devuelve null si el assistant no pidió herramientas', () => {
    expect(cierreDeToolUse([{ type: 'text', text: 'hola' }])).toBeNull();
  });

  it('devuelve un user con un resultado por herramienta pedida', () => {
    const cierre = cierreDeToolUse(pide('a', 'b').content);
    expect(cierre?.role).toBe('user');
    expect(cierre?.content.map(b => (b as { tool_use_id: string }).tool_use_id)).toEqual(['a', 'b']);
  });
});

describe('bloques de razonamiento a medias', () => {
  it('descarta un thinking sin signature (stream cortado) y conserva el resto', () => {
    const salida = sanearHistorial([
      { role: 'user', content: [{ type: 'text', text: 'hola' }] },
      { role: 'assistant', content: [
        { type: 'thinking', thinking: 'a medio pensar' },
        { type: 'text', text: 'respuesta' },
      ] },
    ]);
    expect(salida[1].content).toEqual([{ type: 'text', text: 'respuesta' }]);
  });

  it('conserva un thinking que sí llegó firmado', () => {
    const firmado = { type: 'thinking' as const, thinking: 'pensado', signature: 'abc' };
    const salida = sanearHistorial([
      { role: 'user', content: [{ type: 'text', text: 'hola' }] },
      { role: 'assistant', content: [firmado, { type: 'text', text: 'ok' }] },
    ]);
    expect(salida[1].content).toEqual([firmado, { type: 'text', text: 'ok' }]);
  });

  it('tira el mensaje entero si solo tenía un thinking sin firmar', () => {
    const salida = sanearHistorial([
      { role: 'user', content: [{ type: 'text', text: 'hola' }] },
      { role: 'assistant', content: [{ type: 'thinking', thinking: 'a medias' }] },
    ]);
    expect(salida).toHaveLength(1);
  });

  it('un thinking sin firmar no se lleva por delante los tool_use del mismo mensaje', () => {
    const salida = sanearHistorial([
      { role: 'user', content: [{ type: 'text', text: 'hola' }] },
      { role: 'assistant', content: [
        { type: 'thinking', thinking: 'a medias' },
        { type: 'tool_use', id: 't1', name: 'get_diet', input: {} },
      ] },
    ]);
    expect(salida[1].content).toEqual([{ type: 'tool_use', id: 't1', name: 'get_diet', input: {} }]);
    // y sigue cerrándose la herramienta pendiente
    expect(salida[2].content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 't1', is_error: true });
  });
});
