import type { AppNotification, Mesocycle, QuestionnaireAssignment, QuestionnaireResponse, UserProfile } from '../types.js';
import { isOverdue, hasAnsweredThisOccurrence, type ScheduleContext } from './questionnaireSchedule.js';
import { aperturaDelCiclo, caducidadDelCiclo, enPausa } from './cicloRevision.js';
import { addDays } from './trainingWeek.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Recordatorios de la revisión (27-10)

   Dos avisos al atleta, los dos solo si tiene algo sin responder: el día que
   se le abre la revisión y la víspera de que caduque (su día de revisión). En
   pausa o vacaciones, ninguno. Lo ejecuta el latido diario del servidor
   (api/latido-diario.ts); aquí solo se decide, sin Firestore.

   La clave de cada aviso lleva el ciclo, así que pasar el latido dos veces el
   mismo día no duplica nada.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface Recordatorio { dedupeKey: string; notificacion: Omit<AppNotification, 'id'> }

export function recordatoriosDeRevision(e: {
  hoy: string;
  perfil: Pick<UserProfile, 'email' | 'diaRevision' | 'pausaRevisiones'>;
  asignaciones: QuestionnaireAssignment[];
  respuestas: QuestionnaireResponse[];
  mesociclos?: Mesocycle[];
}): Recordatorio[] {
  const { hoy, perfil } = e;
  const ciclo = aperturaDelCiclo(hoy, perfil.diaRevision);
  // El ciclo en curso es el que se abrió hoy o antes (no el siguiente).
  const abierto = ciclo > hoy ? addDays(ciclo, -7) : ciclo;
  if (enPausa(abierto, perfil.pausaRevisiones)) return [];

  const ctx: ScheduleContext = { mesocycles: e.mesociclos ?? [], diaRevision: perfil.diaRevision, pausa: perfil.pausaRevisiones };
  const pendientes = e.asignaciones.filter(a => a.active && isOverdue(a, ctx) && !hasAnsweredThisOccurrence(a, e.respuestas, ctx));
  if (pendientes.length === 0) return [];

  const caduca = caducidadDelCiclo(abierto);
  const base = { recipientEmail: perfil.email, type: 'revision_recordatorio' as const, link: 'checkin', createdAt: new Date().toISOString(), read: false };
  if (hoy === abierto) {
    return [{
      dedupeKey: `rev_abre_${perfil.email}_${abierto}`,
      notificacion: { ...base, title: 'Tu revisión ya está abierta', body: 'Unos minutos para contarme tu semana. Se guarda sola si lo dejas a medias.' },
    }];
  }
  if (hoy === addDays(caduca, -1)) {
    return [{
      dedupeKey: `rev_caduca_${perfil.email}_${abierto}`,
      notificacion: { ...base, title: 'Tu revisión caduca mañana', body: 'Te queda hoy para enviarla y que pueda revisarte.' },
    }];
  }
  return [];
}
