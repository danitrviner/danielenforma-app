/* ═══════════════════════════════════════════════════════════════════════════
   DETECTORES — qué episodios tocan hoy para un atleta.

   Puros: reciben la foto del atleta y devuelven episodios en estado
   `pendiente`. Quien los llama (el latido, o el cliente al enviar un
   cuestionario) los escribe con `create` sobre su id determinista, así que
   detectar dos veces lo mismo no duplica nada.

   Un atleta sin consentimiento aceptado no genera episodios: el autopiloto no
   lo toca (decisión de Dani, 28-10-2026). Lo determinista del latido sigue
   corriendo para él como siempre.
   ═══════════════════════════════════════════════════════════════════════════ */
import type { Mesocycle, PoliticaPropuesta, Questionnaire, QuestionnaireAssignment, QuestionnaireResponse } from '../types.js';
import { mesocycleWeekNumber } from '../utils/progression.js';
import { cicloDiasDeMeso } from '../utils/asignacionMesociclo.js';
import { alertasDeRespuesta } from '../utils/alertasRevision.js';
import { resolveQuestions } from '../utils/questionnaireResolve.js';
import { addDays } from '../utils/trainingWeek.js';
import { nuevoEpisodio, type Episodio } from './episodios.js';

/** Cuántos días atrás se miran las respuestas al detectar (el latido corre a diario). */
export const DIAS_DE_VENTANA_CUESTIONARIO = 3;

export interface FotoParaDetectar {
  email: string;
  hoy: string;
  ahora: string;
  consentimiento: boolean;
  politica: PoliticaPropuesta;
  respuestas: QuestionnaireResponse[];
  plantillas: Questionnaire[];
  asignaciones: QuestionnaireAssignment[];
  /** Para «semana nueva»: los bloques del atleta. Sin ellos no se detecta. */
  mesociclos?: Mesocycle[];
}

/** Una revisión (cuestionario) recibida en los últimos días → episodio. */
export function detectarCuestionariosRecibidos(f: FotoParaDetectar): Episodio[] {
  if (!f.consentimiento) return [];
  const desde = addDays(f.hoy, -DIAS_DE_VENTANA_CUESTIONARIO);
  const plantillaDe = new Map(f.plantillas.map(p => [p.id, p]));
  const asignacionDe = new Map(f.asignaciones.map(a => [a.id, a]));
  return f.respuestas
    .filter(r => (r.submittedAt ?? '').slice(0, 10) >= desde)
    .map(r => {
      const plantilla = plantillaDe.get(r.questionnaireId);
      const asignacion = asignacionDe.get(r.assignmentId);
      const preguntas = plantilla ? (asignacion ? resolveQuestions(plantilla, asignacion) : plantilla.questions) : [];
      const alertas = preguntas.length ? alertasDeRespuesta(preguntas, r.answers).map(a => a.texto) : [];
      return nuevoEpisodio({
        tipo: 'cuestionario_recibido',
        athleteId: f.email,
        clave: r.id,
        disparador: { fuente: 'questionnaireResponses', docId: r.id, fecha: r.submittedAt.slice(0, 10) },
        politica: f.politica,
        ahora: f.ahora,
        alertas,
      });
    });
}

/** El bloque que está en curso hoy (empezado y no acabado), si lo hay. */
export function mesoEnCurso(mesociclos: Mesocycle[], hoy: string): Mesocycle | null {
  return mesociclos.find(m => !!m.startDate && hoy >= m.startDate && hoy <= addDays(m.startDate, m.weeks * 7 - 1)) ?? null;
}

/** El día que el bloque cambia de semana (hoy es otra semana que ayer) → episodio. */
export function detectarSemanaNueva(f: FotoParaDetectar): Episodio[] {
  if (!f.consentimiento || !f.mesociclos?.length) return [];
  const meso = mesoEnCurso(f.mesociclos, f.hoy);
  if (!meso || f.hoy === meso.startDate) return []; // la semana 1 es el alta, no una semana nueva
  const ciclo = cicloDiasDeMeso(meso);
  const semana = mesocycleWeekNumber(meso.startDate, f.hoy, ciclo);
  const ayer = mesocycleWeekNumber(meso.startDate, addDays(f.hoy, -1), ciclo);
  if (semana === ayer) return [];
  return [nuevoEpisodio({
    tipo: 'semana_nueva',
    athleteId: f.email,
    clave: `${f.email}_${meso.id}_S${semana}`,
    disparador: { fuente: 'mesocycles', docId: meso.id, fecha: f.hoy },
    politica: f.politica,
    ahora: f.ahora,
  })];
}

/** Todos los detectores de hoy, en orden de prioridad. */
export function detectarEpisodios(f: FotoParaDetectar): Episodio[] {
  return [...detectarCuestionariosRecibidos(f), ...detectarSemanaNueva(f)]
    .sort((a, b) => a.prioridad - b.prioridad || a.creadoEn.localeCompare(b.creadoEn));
}
