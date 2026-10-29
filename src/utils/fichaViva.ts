/* La ficha viva como TEXTO y su forma vacía: lo puro de `db/dossier.ts`, sin
   Firestore, para que el servidor (api/) pueda renderizar la ficha igual que
   la app sin arrastrar el SDK de cliente. */
import type { AthleteDossier } from '../types.js';
import { describirTipificacion, ESCALAS, type TipificacionCliente } from './cdg/tipificacion.js';
import type { DossierFact } from '../types.js';

export const DOSSIER_VACIO: AthleteDossier = {
  note: '', objetivos: '', evaluacion: '', esperado: '', foco: '',
  preguntasAbiertas: [], hechos: [], updatedAt: '',
};

/** Texto plano de la ficha, tal y como lo lee la IA y lo lee Dani. */
export function renderDossier(ficha: AthleteDossier): string {
  const bloques: string[] = [];
  const seccion = (titulo: string, cuerpo: string) => {
    if (cuerpo.trim()) bloques.push(`${titulo}\n${cuerpo.trim()}`);
  };
  seccion('OBJETIVOS', ficha.objetivos);
  seccion('DÓNDE ESTÁ HOY', ficha.evaluacion);
  seccion('QUÉ ESPERAMOS EN LAS PRÓXIMAS SEMANAS', ficha.esperado);
  seccion('FOCO DE LA SIGUIENTE REVISIÓN', ficha.foco);
  if (ficha.preguntasAbiertas.length) {
    seccion('PREGUNTAS ABIERTAS', ficha.preguntasAbiertas.map(q => `- ${q}`).join('\n'));
  }
  seccion('TIPIFICACIÓN DEL CLIENTE', describirTipificacion(ficha.tipificacion));
  seccion('NOTA DEL COACH', ficha.note);
  if (ficha.hechos.length) {
    const ultimos = ficha.hechos.slice(-25)
      .map(h => `- ${h.at.slice(0, 10)} · ${h.kind}: ${h.text}`)
      .join('\n');
    seccion('QUÉ SE HA HECHO (lo más reciente al final)', ultimos);
  }
  return bloques.join('\n\n');
}

/** Solo las escalas conocidas y con valor 1-5: lo demás se descarta. */
export function tipificacionValida(t: unknown): TipificacionCliente | null {
  if (!t || typeof t !== 'object') return null;
  const out: TipificacionCliente = {};
  for (const e of ESCALAS) {
    const v = (t as Record<string, unknown>)[e.clave];
    if (typeof v === 'number' && v >= 1 && v <= 5) out[e.clave] = Math.round(v);
  }
  return Object.keys(out).length ? out : null;
}

/** Una ficha leída de Firestore (o un documento viejo que solo trae la nota)
 *  como `AthleteDossier` completo. La usan el cliente y el servidor. */
export function normalizarFicha(datos: Record<string, unknown> | undefined): AthleteDossier {
  return {
    ...DOSSIER_VACIO,
    note: typeof datos?.note === 'string' ? datos.note : '',
    objetivos: typeof datos?.objetivos === 'string' ? datos.objetivos : '',
    evaluacion: typeof datos?.evaluacion === 'string' ? datos.evaluacion : '',
    esperado: typeof datos?.esperado === 'string' ? datos.esperado : '',
    foco: typeof datos?.foco === 'string' ? datos.foco : '',
    preguntasAbiertas: Array.isArray(datos?.preguntasAbiertas)
      ? (datos.preguntasAbiertas as unknown[]).filter((x): x is string => typeof x === 'string')
      : [],
    hechos: Array.isArray(datos?.hechos) ? (datos.hechos as DossierFact[]) : [],
    updatedAt: typeof datos?.updatedAt === 'string' ? datos.updatedAt : '',
    ...(tipificacionValida(datos?.tipificacion) ? { tipificacion: tipificacionValida(datos?.tipificacion)! } : {}),
  };
}

/** Cuántos hechos se conservan por atleta. Sin tope, un año de propuestas
 *  engorda el documento y el prompt; con 60 entran de sobra los últimos meses. */
export const MAX_HECHOS_FICHA = 60;
