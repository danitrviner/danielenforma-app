import type { QuestionnaireQuestion, QuestionnaireResponse } from '../types';
import { ZONA_POR_CLAVE, esZonaIem } from './cdg/zonas';

/* ═══════════════════════════════════════════════════════════════════════════
   Alertas de una revisión (27-10)

   Lo que no puede esperar al día de revisión del coach: una molestia o lesión,
   o un 5 de agujetas (freno agudo). Se avisa al coach EN EL MOMENTO de enviar.
   Y la retención baja (satisfacción o ganas de seguir ≤ 6) para el CRM.
   ═══════════════════════════════════════════════════════════════════════════ */

export const UMBRAL_RETENCION = 6;

export interface AlertaRevision { tipo: 'molestia' | 'agujetas' | 'retencion'; texto: string }

type Respuestas = QuestionnaireResponse['answers'];

export function alertasDeRespuesta(preguntas: QuestionnaireQuestion[], answers: Respuestas): AlertaRevision[] {
  const valor = new Map(answers.map(a => [a.questionId, a.value]));
  const out: AlertaRevision[] = [];
  const zonas5: string[] = [];
  for (const q of preguntas) {
    const v = valor.get(q.id);
    if (v === undefined) continue;
    const k = q.signalKey ?? '';
    if (k === 'alerta.molestia' && v === true) {
      const detalle = valor.get(`${q.id}__comentario`);
      out.push({ tipo: 'molestia', texto: typeof detalle === 'string' && detalle.trim() ? `Molestia: ${detalle.trim()}` : 'Ha marcado una molestia o lesión' });
    }
    if (k.startsWith('agujetas.') && Number(v) >= 5) {
      const z = k.slice('agujetas.'.length);
      zonas5.push(esZonaIem(z) ? ZONA_POR_CLAVE[z].nombre : z);
    }
    if ((k === 'retencion.satisfaccion' || k === 'retencion.continuar') && Number(v) <= UMBRAL_RETENCION) {
      out.push({ tipo: 'retencion', texto: `${k === 'retencion.satisfaccion' ? 'Satisfacción' : 'Ganas de seguir'}: ${v}/10` });
    }
  }
  if (zonas5.length > 0) out.push({ tipo: 'agujetas', texto: `Agujetas 5 en ${zonas5.join(', ')}` });
  return out;
}
