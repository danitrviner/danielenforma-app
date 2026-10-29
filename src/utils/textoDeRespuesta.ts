import type { QuestionnaireQuestion } from '../types.js';

/** ¿Es la respuesta-comentario de otra pregunta (`${id}__comentario`)? */
export const esComentario = (questionId: string) => questionId.endsWith('__comentario');

/** Cómo se lee una respuesta para el coach: «8/10», «Lo mantengo», «Sí», «81,5 kg». */
export function textoDeRespuesta(q: QuestionnaireQuestion | undefined, valor: string | number | boolean): string {
  if (!q) return String(valor);
  switch (q.type) {
    case 'scale': return `${valor}/${q.scaleMax ?? 10}`;
    case 'keep_change': return valor === 'mantener' ? (q.labelTrue ?? 'Lo mantengo') : valor === 'cambiar' ? (q.labelFalse ?? 'Quiere un cambio') : String(valor);
    case 'boolean': return valor ? (q.labelTrue ?? 'Sí') : (q.labelFalse ?? 'No');
    case 'metric': return `${String(valor).replace('.', ',')} ${q.metricKey === 'bodyweight' ? 'kg' : 'cm'}`;
    case 'choice': return String(valor).split(',').join(', ');
    default: return `${String(valor)}${q.unit ? ` ${q.unit}` : ''}`;
  }
}
