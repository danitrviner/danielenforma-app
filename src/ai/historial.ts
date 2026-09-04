// Reparación del historial de un chat del asistente antes de enviarlo a la
// Messages API (y antes de guardarlo en Firestore).
//
// La API exige que cada bloque `tool_use` del assistant tenga su `tool_result`
// en el mensaje INMEDIATAMENTE siguiente. Un historial que lo incumpla se
// rechaza entero con un 400 («tool_use ids were found without tool_result
// blocks») antes de generar un solo token — y como el chat se guarda en
// Firestore, el fallo no es de un turno: el chat queda inservible PARA SIEMPRE,
// porque cada mensaje nuevo vuelve a reenviar el historial roto.
//
// Ese estado lo producía cualquier turno que se cortara justo después de que el
// modelo pidiera herramientas: respuesta truncada por `max_tokens` (fácil con
// varias herramientas en paralelo), rechazo del modelo, o un fallo de red en
// medio. El bucle guardaba el mensaje del assistant y lanzaba el error sin
// llegar a añadir los resultados.
//
// Aquí se repara en vez de recortar: se rellenan los resultados que faltan con
// un marcador de «interrumpido». Es información verdadera para el modelo (esa
// herramienta no llegó a ejecutarse) y conserva todo lo que el coach ya ve
// escrito en su chat, que es lo que perdería un recorte.

//
// El mismo problema lo tiene un bloque `thinking` que se quedó sin su
// `signature` porque el stream se cortó a mitad: la API lo rechaza con un 400
// («thinking.signature: Field required») y el chat vuelve a quedar inservible.
// Ese sí se descarta, porque un razonamiento a medias no le sirve a nadie y el
// coach no lo ve en pantalla.

import type { AiChatMessage, AiContentBlock, AiToolResultBlock } from '../types';

export const RESULTADO_INTERRUMPIDO =
  'Interrumpido: el turno se cortó antes de ejecutar esta herramienta, así que no se ejecutó nada. Vuelve a pedirla si todavía hace falta.';

function resultadoSintetico(id: string): AiToolResultBlock {
  return { type: 'tool_result', tool_use_id: id, content: RESULTADO_INTERRUMPIDO, is_error: true };
}

/** Un bloque de razonamiento SIN `signature` es un bloque a medias: el stream
 *  se cortó antes de que llegara su `signature_delta` (la función de Vercel
 *  muere a los 60 s, se va la red...). La API lo rechaza con
 *  «thinking.signature: Field required», y como el chat se guarda en Firestore
 *  ese 400 se repite en CADA mensaje nuevo: el chat queda muerto igual que con
 *  un `tool_use` sin resultado. Aquí se descarta el bloque incompleto — el
 *  razonamiento no se le enseña al coach, así que no pierde nada visible. */
function bloqueUtilizable(b: AiContentBlock): boolean {
  return b.type !== 'thinking' || Boolean(b.signature);
}

function idsPedidos(content: AiContentBlock[]): string[] {
  return content.filter((b): b is Extract<AiContentBlock, { type: 'tool_use' }> => b.type === 'tool_use').map(b => b.id);
}

/** El mensaje `user` que cierra las herramientas que pidió un assistant y que
 *  no se van a ejecutar, o `null` si no pidió ninguna. Lo usa el bucle de
 *  agente para no dejar nunca el historial a medias al abortar un turno. */
export function cierreDeToolUse(content: AiContentBlock[]): AiChatMessage | null {
  const ids = idsPedidos(content);
  if (ids.length === 0) return null;
  return { role: 'user', content: ids.map(resultadoSintetico) };
}

/**
 * Devuelve un historial que la API acepta:
 *  - cada `tool_use` recibe su `tool_result` en el mensaje siguiente (los que
 *    falten se rellenan como «interrumpido»),
 *  - los `tool_result` huérfanos o repetidos se descartan (la API los rechaza
 *    igual que los que faltan),
 *  - los `tool_result` abren el mensaje, en el mismo orden en que el modelo
 *    pidió las herramientas,
 *  - no quedan mensajes con contenido vacío.
 *
 * Es idempotente: sanear un historial ya sano lo deja igual.
 */
export function sanearHistorial(messages: AiChatMessage[]): AiChatMessage[] {
  const salida: AiChatMessage[] = [];
  // Herramientas que el último assistant de `salida` dejó sin responder.
  let pendientes: string[] = [];

  const cerrarPendientes = () => {
    if (pendientes.length === 0) return;
    salida.push({ role: 'user', content: pendientes.map(resultadoSintetico) });
    pendientes = [];
  };

  for (const msg of messages) {
    if (msg.role === 'assistant') {
      // Dos assistant seguidos: el primero se quedó sin sus resultados.
      cerrarPendientes();
      const contenido = msg.content.filter(bloqueUtilizable);
      if (contenido.length === 0) continue;
      salida.push(contenido.length === msg.content.length ? msg : { ...msg, content: contenido });
      pendientes = idsPedidos(contenido);
      continue;
    }

    const esperados = new Set(pendientes);
    const vistos = new Set<string>();
    const resultados = new Map<string, AiToolResultBlock>();
    const resto: AiContentBlock[] = [];
    for (const b of msg.content) {
      if (b.type !== 'tool_result') { if (bloqueUtilizable(b)) resto.push(b); continue; }
      if (!esperados.has(b.tool_use_id) || vistos.has(b.tool_use_id)) continue;
      vistos.add(b.tool_use_id);
      resultados.set(b.tool_use_id, b);
    }
    const content: AiContentBlock[] = [
      ...pendientes.map(id => resultados.get(id) ?? resultadoSintetico(id)),
      ...resto,
    ];
    pendientes = [];
    if (content.length === 0) continue;
    salida.push({ ...msg, content });
  }

  // El historial terminaba con el assistant pidiendo herramientas: cerrarlas
  // deja el chat en el mismo estado que un turno interrumpido normal, que es
  // justo el que sabe reanudar el botón «Reintentar» del panel.
  cerrarPendientes();

  return salida;
}
