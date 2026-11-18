import type { AppNotification, Mesocycle, Questionnaire, QuestionnaireAssignment, QuestionnaireResponse, UserProfile } from '../types.js';
import { isOverdue, hasAnsweredThisOccurrence, seAbreHoy, type ScheduleContext } from './questionnaireSchedule.js';
import { aperturaDelCiclo, caducidadDelCiclo, enPausa, idsDeCuestionariosDeCierre } from './cicloRevision.js';
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

/* ── Cuestionario nuevo (18-11-2026) ─────────────────────────────────────────
   Dani: «que mande una notificación si aparece un nuevo cuestionario». Un
   cuestionario que se le abre al atleta fuera del día de su revisión (un
   «Mandar ahora», una fecha movida, un hito o un bloque que empieza otro día)
   le deja un aviso propio. El día de la revisión no: ese día ya le llega «Tu
   revisión ya está abierta», que ahora nombra lo que se sale de lo semanal.

   La clave es la misma en el cliente (el botón «Mandar ahora» avisa en el
   acto) y en el latido del servidor: si los dos lo intentan, sale uno. */

/** Clave del aviso: una por asignación y día en que se abre. */
export function claveCuestionarioNuevo(email: string, assignmentId: string, desde: string): string {
  return `cuestionario_nuevo_${email}_${assignmentId}_${desde}`;
}

export function avisoDeCuestionarioNuevo(e: {
  email: string;
  assignmentId: string;
  /** Día en que se le abre (AAAA-MM-DD). */
  desde: string;
  titulo?: string | null;
  ahora?: string;
}): Recordatorio {
  const titulo = e.titulo?.trim();
  return {
    dedupeKey: claveCuestionarioNuevo(e.email, e.assignmentId, e.desde),
    notificacion: {
      recipientEmail: e.email,
      type: 'cuestionario_nuevo',
      title: 'Tienes un cuestionario nuevo',
      body: titulo
        ? `«${titulo}» ya está en Revisión. Unos minutos y listo.`
        : 'Ya está en Revisión. Unos minutos y listo.',
      link: 'checkin',
      createdAt: e.ahora ?? new Date().toISOString(),
      read: false,
    },
  };
}

/** «A y B», «A, B y C». */
function enLista(partes: string[]): string {
  if (partes.length <= 1) return partes[0] ?? '';
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
}

export function recordatoriosDeRevision(e: {
  hoy: string;
  perfil: Pick<UserProfile, 'email' | 'diaRevision' | 'pausaRevisiones'>;
  asignaciones: QuestionnaireAssignment[];
  respuestas: QuestionnaireResponse[];
  mesociclos?: Mesocycle[];
  /** Las plantillas: dicen cuál es el cierre de bloque (su semana se elige en
   *  el bloque) y dan el título para el aviso de cuestionario nuevo. */
  plantillas?: Pick<Questionnaire, 'id' | 'title' | 'questions'>[];
}): Recordatorio[] {
  const { hoy, perfil } = e;
  const ciclo = aperturaDelCiclo(hoy, perfil.diaRevision);
  // El ciclo en curso es el que se abrió hoy o antes (no el siguiente).
  const abierto = ciclo > hoy ? addDays(ciclo, -7) : ciclo;
  if (enPausa(abierto, perfil.pausaRevisiones)) return [];

  const plantillas = e.plantillas ?? [];
  const ctx: ScheduleContext = {
    mesocycles: e.mesociclos ?? [], diaRevision: perfil.diaRevision, pausa: perfil.pausaRevisiones,
    cuestionariosDeCierre: idsDeCuestionariosDeCierre(plantillas),
  };
  const pendientes = e.asignaciones.filter(a => a.active && isOverdue(a, ctx) && !hasAnsweredThisOccurrence(a, e.respuestas, ctx));
  if (pendientes.length === 0) return [];

  const tituloDe = (a: QuestionnaireAssignment) => plantillas.find(q => q.id === a.questionnaireId)?.title ?? null;
  const caduca = caducidadDelCiclo(abierto);
  const base = { recipientEmail: perfil.email, type: 'revision_recordatorio' as const, link: 'checkin', createdAt: new Date().toISOString(), read: false };
  if (hoy === abierto) {
    // Lo que se abre hoy y no es de todas las semanas (cierre, mediciones, un
    // hito): se nombra, para que no pase por la revisión de siempre.
    const semanal = (a: QuestionnaireAssignment) => a.schedule?.type === 'weekdays'
      || (a.schedule?.type === 'interval' && (a.schedule.intervalDays ?? 7) <= 7);
    const novedades = [...new Set(pendientes
      .filter(a => !semanal(a) && seAbreHoy(a, ctx, hoy))
      .map(tituloDe)
      .filter((t): t is string => !!t))];
    const extra = novedades.length > 0 ? ` Esta semana también: ${enLista(novedades)}.` : '';
    return [{
      dedupeKey: `rev_abre_${perfil.email}_${abierto}`,
      notificacion: { ...base, title: 'Tu revisión ya está abierta', body: `Unos minutos para contarme tu semana. Se guarda sola si lo dejas a medias.${extra}` },
    }];
  }
  const avisos: Recordatorio[] = pendientes
    .filter(a => seAbreHoy(a, ctx, hoy))
    .map(a => avisoDeCuestionarioNuevo({ email: perfil.email, assignmentId: a.id, desde: hoy, titulo: tituloDe(a) }));
  if (hoy === addDays(caduca, -1)) {
    avisos.push({
      dedupeKey: `rev_caduca_${perfil.email}_${abierto}`,
      notificacion: { ...base, title: 'Tu revisión caduca mañana', body: 'Te queda hoy para enviarla y que pueda revisarte.' },
    });
  }
  return avisos;
}
