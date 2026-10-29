/* Marcas de caché de la Messages API, compartidas por el bucle del navegador
   (aiClient.ts) y el del servidor (api/_lib/agente.ts). Sin Firebase. */
import type { AiChatMessage } from '../types.js';

export const CACHE_1H = { type: 'ephemeral', ttl: '1h' } as const;

/** El historial con una marca de caché en el último bloque del último mensaje.
 *
 *  Sin esto solo se cacheaba el prompt de sistema, y cada ronda de tools
 *  reenviaba TODO el historial (brief, resultados anteriores, propuestas) como
 *  entrada normal: en un chat de 31 llamadas, 1,47 millones de tokens sin
 *  caché frente a 0,74 leídos de ella. La marca va en el último mensaje `user`
 *  (el texto de Dani o los tool_results de la ronda anterior) y avanza con
 *  cada ronda, así que cada llamada solo paga de nuevo lo que ha cambiado desde
 *  la anterior.
 *
 *  Se marca en una COPIA: el historial que se guarda en Firestore no lleva la
 *  marca (la API admite cuatro como máximo por petición, y un chat de treinta
 *  mensajes acumularía treinta). TTL de 5 minutos, que es el que hay entre dos
 *  rondas de un mismo turno; las entradas de 1h (el sistema) van antes, como
 *  exige la API. */
export function conMarcaDeCacheAlFinal(messages: AiChatMessage[]): AiChatMessage[] {
  const ultimo = messages[messages.length - 1];
  if (!ultimo || ultimo.role !== 'user' || ultimo.content.length === 0) return messages;
  const content = ultimo.content.map((bloque, i) =>
    i === ultimo.content.length - 1 ? { ...bloque, cache_control: { type: 'ephemeral' } } : bloque,
  );
  return [...messages.slice(0, -1), { ...ultimo, content: content as AiChatMessage['content'] }];
}
