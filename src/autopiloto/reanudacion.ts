/* ═══════════════════════════════════════════════════════════════════════════
   ESPERAR A DANI Y REANUDAR (diseño §2.3, episodio «alta_completada», H13).

   Un alta son 19 piezas en orden y cada una necesita la anterior aplicada: las
   sesiones exigen un mesociclo REAL, publicar exige sesiones, el calendario
   de dietas exige dietas. En rodaje (y para lo que la política no aplica sola)
   el mesociclo se queda PROPUESTO, así que el bucle no puede seguir: el modelo
   termina la ronda con una línea «ESPERO: …» y el episodio pasa a `escalado`
   con las propuestas que faltan en `esperaPropuestas`. Cuando Dani decide
   sobre todas (aprueba o rechaza, desde la bandeja de siempre), el consumidor
   reanuda el episodio con un mensaje que cuenta qué pasó con cada una, y el
   bucle continúa por donde iba.

   Puro: nada de Firestore. Quien llama lee las propuestas y guarda el episodio.
   ═══════════════════════════════════════════════════════════════════════════ */
import type { AiProposal } from '../types.js';
import { extraerParaDani, type Episodio } from './episodios.js';

/** La línea con la que el modelo pide parar hasta que Dani decida. */
export const MARCA_ESPERA = /^ESPERO:/im;

/** Propuestas del episodio que no se han aplicado (ni por política ni por Dani). */
export function pendientesDe(ep: Pick<Episodio, 'propuestas' | 'aplicadas'>): string[] {
  const aplicadas = new Set(ep.aplicadas ?? []);
  return ep.propuestas.filter(id => !aplicadas.has(id));
}

/**
 * Qué hacer con un episodio cuyo turno acaba (`end_turn`) con la marca de espera.
 *   · sin marca → null: el que llama cierra como siempre;
 *   · todo aplicado ya (política automática) → sigue en curso con un mensaje que lo dice;
 *   · en sombra → se cierra: nada se aplica y no hay a qué esperar;
 *   · si no → `escalado` esperando esas propuestas.
 */
export function esperaTrasTurno(ep: Episodio, textoFinal: string, ahora: string): Episodio | null {
  if (!MARCA_ESPERA.test(textoFinal)) return null;
  const pendientes = pendientesDe(ep);
  const paraDani = extraerParaDani(textoFinal);
  if (pendientes.length === 0) {
    return {
      ...ep, estado: 'en_curso', actualizadoEn: ahora, paraDani,
      historial: [...(ep.historial ?? []), { role: 'user', content: [{ type: 'text', text: 'Todo lo que propusiste ya está aplicado (política automática). Continúa con el siguiente paso del guion.' }] }],
    };
  }
  if (ep.politica === 'sombra') {
    return { ...ep, estado: 'hecho', actualizadoEn: ahora, cerradoEn: ahora, paraDani: `(sombra) parado antes de aplicar: ${paraDani}` };
  }
  return { ...ep, estado: 'escalado', actualizadoEn: ahora, esperaPropuestas: pendientes, paraDani: `Esperando tu decisión sobre ${pendientes.length} propuesta${pendientes.length === 1 ? '' : 's'}: ${paraDani}` };
}

const DECIDIDAS = new Set<AiProposal['status']>(['approved', 'aplicada', 'rejected', 'caducada', 'deshecha']);

/**
 * Reanuda un episodio en espera si Dani ya decidió sobre TODAS sus propuestas.
 * Devuelve null si alguna sigue propuesta (o no se encuentra: se espera).
 */
export function reanudar(ep: Episodio, propuestas: AiProposal[], ahora: string): Episodio | null {
  const ids = ep.esperaPropuestas ?? [];
  if (ep.estado !== 'escalado' || ids.length === 0) return null;
  const porId = new Map(propuestas.map(p => [p.id, p]));
  const decididas = ids.map(id => porId.get(id)).filter((p): p is AiProposal => !!p && DECIDIDAS.has(p.status));
  if (decididas.length < ids.length) return null;

  const lineas = decididas.map(p => {
    const ok = p.status === 'approved' || p.status === 'aplicada';
    const comentarios = (p.comentarios ?? []).map(c => c.text).join(' · ');
    return ok
      ? `- APROBADA «${p.summary}»${p.resultEntityId ? ` (id de lo creado: ${p.resultEntityId})` : ''}${comentarios ? ` · comentario de Dani: ${comentarios}` : ''}`
      : `- ${p.status === 'deshecha' ? 'DESHECHA' : 'RECHAZADA'} «${p.summary}»${comentarios ? `: ${comentarios}` : ''}`;
  });
  const aprobadas = decididas.filter(p => p.status === 'approved' || p.status === 'aplicada').map(p => p.id);
  const texto = `Dani ha decidido sobre lo que esperabas:\n${lineas.join('\n')}\n\n`
    + 'Continúa con el siguiente paso del guion desde donde lo dejaste. Lo rechazado no lo vuelvas a proponer igual: si su comentario pide otra cosa, hazla; si no, pasa al paso siguiente que no dependa de ello. Vuelve a comprobar get_setup_status antes de cada pieza.';
  const { esperaPropuestas: _e, ...resto } = ep;
  return {
    ...resto, estado: 'en_curso', actualizadoEn: ahora,
    aplicadas: [...new Set([...(ep.aplicadas ?? []), ...aprobadas])],
    historial: [...(ep.historial ?? []), { role: 'user', content: [{ type: 'text', text: texto }] }],
  };
}
