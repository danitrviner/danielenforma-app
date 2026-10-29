import type { Questionnaire, QuestionnaireResponse, UserProfile } from '../types.js';
import { aperturaDelCiclo, enPausa, normalizarDiaRevision } from './cicloRevision.js';
import { addDays } from './trainingWeek.js';
import { UMBRAL_RETENCION } from './alertasRevision.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Cola de revisiones del día (27-10)

   El día de revisión, cada coach ve a los atletas que le tocan ordenados por
   prioridad, con un semáforo sacado de lo que contestaron en este ciclo:
   agujetas en 5, molestias, adherencia baja, ganas bajas, estrés alto, o que
   aún no han enviado nada. Y el riesgo de abandono: dos revisiones seguidas
   sin responder, o la satisfacción / ganas de seguir ≤ 6 en un hito.

   Puro: recibe atletas, respuestas y plantillas ya leídas.
   ═══════════════════════════════════════════════════════════════════════════ */

export type TonoAviso = 'rojo' | 'ambar' | 'gris';
export interface AvisoCola { clave: string; texto: string; tono: TonoAviso; peso: number }

export interface FilaCola {
  atleta: UserProfile;
  /** Apertura del ciclo que se revisa hoy. */
  ciclo: string;
  enviada: boolean;
  avisos: AvisoCola[];
  prioridad: number;
  riesgoAbandono: boolean;
}

type Resp = Pick<QuestionnaireResponse, 'athleteId' | 'submittedAt' | 'answers' | 'questionnaireId'>;

/** signalKey de cada pregunta, de todas las plantillas. */
function señales(questionnaires: Pick<Questionnaire, 'questions'>[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const q of questionnaires) for (const p of q.questions) if (p.signalKey) m.set(p.id, p.signalKey);
  return m;
}

/** Los avisos que salen de las respuestas de un ciclo. */
export function avisosDeRespuestas(rs: Resp[], señalDe: Map<string, string>): AvisoCola[] {
  const out = new Map<string, AvisoCola>();
  const poner = (a: AvisoCola) => { if (!out.has(a.clave) || out.get(a.clave)!.peso < a.peso) out.set(a.clave, a); };
  for (const r of rs) {
    for (const a of r.answers) {
      const k = señalDe.get(a.questionId);
      if (!k) continue;
      const n = Number(a.value);
      if (k === 'alerta.molestia' && a.value === true) poner({ clave: 'molestia', texto: 'Molestia', tono: 'rojo', peso: 5 });
      if (k.startsWith('agujetas.') && n >= 5) poner({ clave: 'agujetas', texto: 'Agujetas 5', tono: 'rojo', peso: 4 });
      if (k.startsWith('doms.') && n >= 9) poner({ clave: 'agujetas', texto: 'Agujetas altas', tono: 'rojo', peso: 4 });
      if (k.startsWith('adherencia.') && n <= 2) poner({ clave: 'adherencia', texto: 'Adherencia baja', tono: 'ambar', peso: 3 });
      if (k === 'wellness.motivation_weekly' && n <= 4) poner({ clave: 'ganas', texto: 'Pocas ganas', tono: 'ambar', peso: 2 });
      if ((k === 'retencion.satisfaccion' || k === 'retencion.continuar') && n <= UMBRAL_RETENCION) poner({ clave: 'retencion', texto: 'Retención baja', tono: 'rojo', peso: 4 });
      if (k === 'wellness.stress_weekly' && n >= 8) poner({ clave: 'estres', texto: 'Estrés alto', tono: 'ambar', peso: 2 });
      if (k === 'wellness.fatigue_post_weekly' && n >= 8) poner({ clave: 'cansancio', texto: 'Muy cansado', tono: 'ambar', peso: 2 });
    }
  }
  return [...out.values()].sort((a, b) => b.peso - a.peso);
}

/** ¿Dos ciclos seguidos (los dos anteriores al de hoy) sin responder nada? */
export function sinResponderDosCiclos(rs: Pick<Resp, 'submittedAt'>[], cicloHoy: string, alta?: string, pausa?: UserProfile['pausaRevisiones']): boolean {
  const anteriores = [addDays(cicloHoy, -7), addDays(cicloHoy, -14)];
  if (alta && anteriores[1] < alta) return false;          // aún no lleva tanto
  if (anteriores.some(c => enPausa(c, pausa))) return false;
  return anteriores.every(c => !rs.some(r => { const d = r.submittedAt.slice(0, 10); return d >= c && d < addDays(c, 7); }));
}

export function colaDeRevisiones(e: {
  hoy: string;
  atletas: UserProfile[];
  responses: Resp[];
  questionnaires: Pick<Questionnaire, 'questions'>[];
  /** Solo los que revisa hoy (por defecto) o todos. */
  soloHoy?: boolean;
}): FilaCola[] {
  const diaHoy = new Date(e.hoy + 'T00:00:00').getDay();
  const señalDe = señales(e.questionnaires);
  const porAtleta = new Map<string, Resp[]>();
  for (const r of e.responses) {
    const k = r.athleteId.toLowerCase();
    porAtleta.set(k, [...(porAtleta.get(k) ?? []), r]);
  }
  return e.atletas
    .filter(a => !e.soloHoy || normalizarDiaRevision(a.diaRevision) === diaHoy)
    .filter(a => !enPausa(aperturaDelCiclo(e.hoy, a.diaRevision), a.pausaRevisiones))
    .map(atleta => {
      const ciclo = aperturaDelCiclo(e.hoy, atleta.diaRevision);
      // El ciclo que se revisa hoy: si hoy ya pasó la apertura, es este; si no
      // (revisar un jueves la revisión que se abrió el domingo…), el anterior.
      const delCiclo = ciclo > e.hoy ? addDays(ciclo, -7) : ciclo;
      const rs = porAtleta.get(atleta.email.toLowerCase()) ?? [];
      const enCiclo = rs.filter(r => r.submittedAt.slice(0, 10) >= delCiclo);
      const avisos = avisosDeRespuestas(enCiclo, señalDe);
      const enviada = enCiclo.length > 0;
      if (!enviada) avisos.push({ clave: 'sin_enviar', texto: 'Sin enviar', tono: 'gris', peso: 1 });
      const riesgoAbandono = sinResponderDosCiclos(rs, delCiclo, atleta.planStartDate ?? atleta.createdAt?.slice(0, 10), atleta.pausaRevisiones)
        || avisos.some(a => a.clave === 'retencion');
      if (riesgoAbandono && !avisos.some(a => a.clave === 'retencion')) avisos.unshift({ clave: 'abandono', texto: 'Riesgo de abandono', tono: 'rojo', peso: 6 });
      const prioridad = avisos.reduce((s, a) => s + a.peso, 0);
      return { atleta, ciclo: delCiclo, enviada, avisos, prioridad, riesgoAbandono };
    })
    // Primero lo urgente; a igualdad, los que ya enviaron (hay algo que leer).
    .sort((x, y) => y.prioridad - x.prioridad || Number(y.enviada) - Number(x.enviada) || x.atleta.displayName.localeCompare(y.atleta.displayName));
}

/** Nombre del día de revisión, para cabeceras («lunes»). */
export function nombreDelDia(dia: number): string {
  return ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][dia] ?? '';
}

