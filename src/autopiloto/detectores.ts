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
import { mesocycleWeekNumber, vueltasDelCiclo } from '../utils/progression.js';
import { cicloDiasDeMeso } from '../utils/asignacionMesociclo.js';
import { alertasDeRespuesta } from '../utils/alertasRevision.js';
import { resolveQuestions } from '../utils/questionnaireResolve.js';
import { addDays, isoLocal } from '../utils/trainingWeek.js';
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
  /** Para «semana nueva» y «revisión»: los bloques del atleta. Sin ellos no se detecta. */
  mesociclos?: Mesocycle[];
  /** Para «alta completada»: `onboarding.completedAt` presente y la fecha de inicio del plan del perfil. */
  onboardingCompletado?: boolean;
  planStartDate?: string;
  /** Para «renovación»: meses contratados (user_profiles.planDurationMonths). */
  planDurationMonths?: number;
}

/** Días tras acabar el bloque en los que aún se detecta el fin (por si el latido falló un día). */
export const DIAS_DE_VENTANA_FIN_BLOQUE = 3;
/** Con cuántos días de antelación se avisa de que el plan contratado vence. */
export const DIAS_AVISO_RENOVACION = 14;

/** Fin del plan contratado: inicio + meses, en fecha local. */
export function finDelPlan(planStartDate: string, meses: number): string {
  const [y, m, d] = planStartDate.split('-').map(Number);
  return isoLocal(new Date(y, m - 1 + meses, d));
}

/** Un alta de hace más de esto no es «nueva»: el plan lo montó Dani a mano. */
export const DIAS_DE_VENTANA_ALTA = 14;

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

/** Alta completada hace poco (consentimiento, alta cerrada y fecha de inicio puesta) → montar el primer mes. */
export function detectarAltaCompletada(f: FotoParaDetectar): Episodio[] {
  if (!f.consentimiento || !f.onboardingCompletado || !f.planStartDate) return [];
  if (f.planStartDate < addDays(f.hoy, -DIAS_DE_VENTANA_ALTA) || f.planStartDate > addDays(f.hoy, DIAS_DE_VENTANA_ALTA)) return [];
  return [nuevoEpisodio({
    tipo: 'alta_completada',
    athleteId: f.email,
    clave: f.email,
    disparador: { fuente: 'onboarding', docId: f.email, fecha: f.hoy },
    politica: f.politica,
    ahora: f.ahora,
  })];
}

/** Mitad del bloque (`floor(vueltas/2)`, si el bloque tiene al menos 4) y última semana → revisión. */
export function detectarRevision(f: FotoParaDetectar): Episodio[] {
  if (!f.consentimiento || !f.mesociclos?.length) return [];
  const meso = mesoEnCurso(f.mesociclos, f.hoy);
  if (!meso) return [];
  const ciclo = cicloDiasDeMeso(meso);
  const vueltas = vueltasDelCiclo(meso.weeks, ciclo);
  const semana = mesocycleWeekNumber(meso.startDate, f.hoy, ciclo);
  const mitad = vueltas >= 4 ? Math.floor(vueltas / 2) : 0;
  const momento = semana === vueltas ? 'fin' : semana === mitad ? 'mitad' : null;
  if (!momento) return [];
  return [nuevoEpisodio({
    tipo: 'revision',
    athleteId: f.email,
    clave: `${f.email}_${meso.id}_${momento}`,
    disparador: { fuente: 'mesocycles', docId: meso.id, fecha: f.hoy },
    politica: f.politica,
    ahora: f.ahora,
  })];
}

/** El bloque acabó ayer (o hace pocos días) y no hay otro posterior ya creado → cerrar y proponer el siguiente. */
export function detectarFinDeBloque(f: FotoParaDetectar): Episodio[] {
  if (!f.consentimiento || !f.mesociclos?.length) return [];
  const acabados = f.mesociclos.filter(m => {
    if (!m.startDate) return false;
    const fin = addDays(m.startDate, m.weeks * 7 - 1);
    return f.hoy > fin && f.hoy <= addDays(fin, DIAS_DE_VENTANA_FIN_BLOQUE);
  });
  return acabados
    .filter(m => !f.mesociclos!.some(o => o.id !== m.id && !!o.startDate && o.startDate > m.startDate))
    .map(m => {
      const vence = f.planStartDate && f.planDurationMonths ? finDelPlan(f.planStartDate, f.planDurationMonths) : null;
      const contexto = vence
        ? (vence <= addDays(f.hoy, DIAS_AVISO_RENOVACION) ? `El plan contratado ${vence < f.hoy ? 'VENCIÓ' : 'VENCE'} el ${vence}.` : `El plan contratado sigue vigente hasta el ${vence}.`)
        : 'Sin fecha de fin del plan contratado en el perfil.';
      return nuevoEpisodio({
        tipo: 'fin_de_bloque', athleteId: f.email, clave: `${f.email}_${m.id}`,
        disparador: { fuente: 'mesocycles', docId: m.id, fecha: f.hoy }, politica: f.politica, ahora: f.ahora, contexto,
      });
    });
}

/** El plan contratado vence en ≤ 14 días → resumen para Dani (humano: él decide). */
export function detectarRenovacion(f: FotoParaDetectar): Episodio[] {
  if (!f.consentimiento || !f.planStartDate || !f.planDurationMonths) return [];
  const vence = finDelPlan(f.planStartDate, f.planDurationMonths);
  if (vence < f.hoy || vence > addDays(f.hoy, DIAS_AVISO_RENOVACION)) return [];
  return [nuevoEpisodio({
    tipo: 'renovacion', athleteId: f.email, clave: `${f.email}_${vence}`,
    disparador: { fuente: 'user_profiles', docId: f.email, fecha: f.hoy }, politica: f.politica, ahora: f.ahora,
    contexto: `vence el ${vence}`,
  })];
}

/** Todos los detectores de hoy, en orden de prioridad. */
export function detectarEpisodios(f: FotoParaDetectar): Episodio[] {
  return [
    ...detectarCuestionariosRecibidos(f), ...detectarSemanaNueva(f), ...detectarRevision(f), ...detectarAltaCompletada(f),
    ...detectarFinDeBloque(f), ...detectarRenovacion(f),
  ]
    .sort((a, b) => a.prioridad - b.prioridad || a.creadoEn.localeCompare(b.creadoEn));
}
