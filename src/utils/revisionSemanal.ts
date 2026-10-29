import type {
  BodyweightLog, PhotoAssignment, PhotoView, ProgresoRevision, ProgressPhoto, Questionnaire,
  QuestionnaireAssignment, QuestionnaireResponse,
} from '../types.js';
import { hasAnsweredThisOccurrence, isOverdue, martesDeCaducidad, viernesDelCiclo } from './questionnaireSchedule.js';
import { resolveQuestions } from './questionnaireResolve.js';
import type { ScheduleContext } from './scheduleEngine.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Revisión de la semana (K-01)

   Junta lo que toca esta semana —peso, cuestionarios asignados, fotos— en UNA
   revisión con pasos y un estado. No decide QUÉ toca ni CUÁNDO vence: eso lo
   siguen decidiendo `questionnaireSchedule` (viernes, caduca el martes) y las
   asignaciones; aquí solo se agrupa y se cuenta.

   Función pura: no lee nada, recibe todo hecho. La pantalla del atleta (Check-in
   y Perfil › Revisión) y, más adelante, el contador del coach cuentan con ella.
   ═══════════════════════════════════════════════════════════════════════════ */

export type TipoPaso = 'peso' | 'cuestionario' | 'fotos';

export interface PasoRevision {
  id: string;
  tipo: TipoPaso;
  titulo: string;
  hecho: boolean;
  /** Frase corta bajo el título: «8 preguntas · 3 respondidas», «80,4 kg · hecho». */
  detalle: string;
  assignmentId?: string;
  /** Solo cuestionarios. */
  total?: number;
  respondidas?: number;
  /** Solo fotos: vistas aún sin subir. */
  vistasQueFaltan?: PhotoView[];
}

export type EstadoRevision = 'sin_revision' | 'pendiente' | 'en_curso' | 'completa' | 'incompleta';

export interface RevisionSemanal {
  /** Viernes del ciclo (YYYY-MM-DD). */
  ciclo: string;
  /** Martes en que caduca. */
  caduca: string;
  pasos: PasoRevision[];
  hechos: number;
  total: number;
  estado: EstadoRevision;
  /** El primer paso sin hacer, o null si no queda ninguno. */
  siguiente: PasoRevision | null;
}

export interface EntradaRevision {
  /** Hoy (YYYY-MM-DD). */
  hoy: string;
  assignments: QuestionnaireAssignment[];
  responses: QuestionnaireResponse[];
  templates: Map<string, Questionnaire>;
  scheduleCtx?: ScheduleContext;
  /** Asignaciones de fotos REALES del coach (sin la implícita por defecto). */
  photoAssignments?: PhotoAssignment[];
  /** Fotos del atleta (basta con las del ciclo). */
  fotos?: Pick<ProgressPhoto, 'date' | 'view'>[];
  /** Último peso registrado. */
  ultimoPeso?: Pick<BodyweightLog, 'date' | 'weight'> | null;
  progreso?: ProgresoRevision | null;
}

const VISTAS_POR_DEFECTO: PhotoView[] = ['front', 'side', 'back'];
const NOMBRE_DE_VISTA: Record<string, string> = { front: 'frente', side: 'lateral', back: 'espalda' };

const kg = (n: number) => `${String(n).replace('.', ',')} kg`;

/** Un `PhotoAssignment` tiene la misma forma de calendario que un cuestionario. */
const comoAsignacion = (p: PhotoAssignment): QuestionnaireAssignment =>
  ({ id: p.id, questionnaireId: '', athleteId: p.athleteId, schedule: p.schedule, startDate: p.startDate, active: p.active, createdAt: p.createdAt });

export function revisionDeLaSemana(e: EntradaRevision): RevisionSemanal {
  const ciclo = viernesDelCiclo(e.hoy, e.scheduleCtx?.diaRevision);
  const caduca = martesDeCaducidad(ciclo);
  const progreso = e.progreso?.ciclo === ciclo ? e.progreso : null;
  // Desde cuándo vale un peso o una foto como «de esta revisión». Entre martes y
  // jueves el viernes del ciclo aún no ha llegado (un cuestionario mensual o de
  // plan puede vencer cualquier día): ahí solo cuenta lo de hoy, no lo de la
  // semana pasada.
  const desde = e.hoy < ciclo ? e.hoy : ciclo;

  // Cuestionarios de este ciclo: los vencidos (hechos o no). Orden estable: el
  // de asignación y, a igualdad, el título.
  const delCiclo = e.assignments
    .filter(a => a.active && isOverdue(a, e.scheduleCtx))
    .sort((x, y) => x.createdAt.localeCompare(y.createdAt)
      || (e.templates.get(x.questionnaireId)?.title ?? '').localeCompare(e.templates.get(y.questionnaireId)?.title ?? ''));

  const fotosAsignadas = (e.photoAssignments ?? []).filter(p => p.active && isOverdue(comoAsignacion(p), e.scheduleCtx));
  const cicloAbierto = delCiclo.length > 0 || fotosAsignadas.length > 0;
  if (!cicloAbierto) {
    return { ciclo, caduca, pasos: [], hechos: 0, total: 0, estado: 'sin_revision', siguiente: null };
  }

  const pasos: PasoRevision[] = [];

  // Fotos: las que pide el coach o, si no ha asignado ninguna, las tres de siempre.
  const sinAsignarFotos = (e.photoAssignments ?? []).filter(p => p.active).length === 0;
  const vistas: PhotoView[] = fotosAsignadas.length > 0
    ? [...new Set(fotosAsignadas.flatMap(p => p.views))]
    : sinAsignarFotos ? VISTAS_POR_DEFECTO : [];

  const pideSuPeso = vistas.length > 0 || delCiclo.some(a =>
    e.templates.get(a.questionnaireId)?.questions.some(q => q.type === 'metric' && q.metricKey === 'bodyweight'));
  if (pideSuPeso) {
    const hecho = !!e.ultimoPeso && e.ultimoPeso.date >= desde;
    pasos.push({
      id: 'peso', tipo: 'peso', titulo: 'Peso de hoy', hecho,
      detalle: hecho && e.ultimoPeso ? `${kg(e.ultimoPeso.weight)} · hecho` : 'Pésate en ayunas',
    });
  }

  for (const a of delCiclo) {
    const plantilla = e.templates.get(a.questionnaireId);
    const preguntas = plantilla ? resolveQuestions(plantilla, a) : [];
    const ids = new Set(preguntas.map(q => q.id));
    const hecho = hasAnsweredThisOccurrence(a, e.responses, e.scheduleCtx);
    const respondidas = hecho
      ? preguntas.length
      : Object.keys(progreso?.respuestas[a.id]?.answers ?? {}).filter(id => ids.has(id)).length;
    pasos.push({
      id: `cuestionario_${a.id}`, tipo: 'cuestionario', assignmentId: a.id,
      titulo: plantilla?.title ?? 'Cuestionario', hecho,
      total: preguntas.length, respondidas,
      detalle: hecho
        ? `${preguntas.length} preguntas · enviado`
        : respondidas > 0 ? `${preguntas.length} preguntas · ${respondidas} ${respondidas === 1 ? 'respondida' : 'respondidas'}` : `${preguntas.length} preguntas`,
    });
  }

  if (vistas.length > 0) {
    const subidas = new Set((e.fotos ?? []).filter(f => f.date >= desde).map(f => f.view));
    const faltan = vistas.filter(v => !subidas.has(v));
    pasos.push({
      id: 'fotos', tipo: 'fotos', titulo: 'Fotos de progreso', hecho: faltan.length === 0,
      vistasQueFaltan: faltan,
      detalle: faltan.length === 0 ? 'Subidas' : faltan.length === vistas.length
        ? vistas.map(v => NOMBRE_DE_VISTA[v] ?? v).join(', ')
        : `Falta ${faltan.map(v => NOMBRE_DE_VISTA[v] ?? v).join(', ')}`,
    });
  }

  const hechos = pasos.filter(p => p.hecho).length;
  const algoEmpezado = hechos > 0 || Object.values(progreso?.respuestas ?? {}).some(r => Object.keys(r.answers).length > 0);
  const estado: EstadoRevision =
    hechos === pasos.length ? 'completa'
      : progreso?.enviadaEn ? 'incompleta'
        : algoEmpezado ? 'en_curso' : 'pendiente';

  return { ciclo, caduca, pasos, hechos, total: pasos.length, estado, siguiente: pasos.find(p => !p.hecho) ?? null };
}

/**
 * Pasos que le faltan al atleta para el contador del «+»: solo mientras la
 * revisión está sin empezar o en curso. Si ya la envió (completa o incompleta)
 * o esta semana no hay revisión, no hay nada que contar (0).
 */
export function pasosQueFaltan(r: Pick<RevisionSemanal, 'estado' | 'total' | 'hechos'>): number {
  return r.estado === 'pendiente' || r.estado === 'en_curso' ? Math.max(0, r.total - r.hechos) : 0;
}

/* ── Historial (Perfil › Revisión) ────────────────────────────────────────── */

export type EstadoHistorial = 'leida' | 'enviada' | 'incompleta';

export interface RevisionDelHistorial {
  /** Viernes del ciclo. */
  ciclo: string;
  cuestionarios: number;
  estado: EstadoHistorial;
}

/**
 * Una fila por semana en la que el atleta envió algo, de la más reciente a la
 * más antigua. Sale de las respuestas enviadas (agrupadas por su ciclo) y, si
 * existe, del progreso de esa semana, que dice si se envió incompleta.
 */
export function historialDeRevisiones(
  responses: Pick<QuestionnaireResponse, 'submittedAt' | 'reviewedAt'>[],
  progresos: Pick<ProgresoRevision, 'ciclo' | 'incompleta'>[] = [],
): RevisionDelHistorial[] {
  const porCiclo = new Map<string, Pick<QuestionnaireResponse, 'submittedAt' | 'reviewedAt'>[]>();
  for (const r of responses) {
    const ciclo = viernesDelCiclo(r.submittedAt.slice(0, 10));
    porCiclo.set(ciclo, [...(porCiclo.get(ciclo) ?? []), r]);
  }
  return [...porCiclo.entries()]
    .map(([ciclo, rs]) => ({
      ciclo,
      cuestionarios: rs.length,
      estado: (progresos.some(p => p.ciclo === ciclo && p.incompleta) ? 'incompleta'
        : rs.every(r => r.reviewedAt) ? 'leida' : 'enviada') as EstadoHistorial,
    }))
    .sort((a, b) => b.ciclo.localeCompare(a.ciclo));
}

/* ── Contador del coach (K-05) ─────────────────────────────────────────────── */

/**
 * Cuántas revisiones sin leer tiene cada atleta. Una revisión es una semana
 * (un ciclo viernes→lunes) en la que envió algo que el coach aún no ha dado por
 * visto: cinco cuestionarios de la misma semana son UNA revisión, no cinco.
 * Clave: el email del atleta en minúsculas.
 */
export function revisionesSinLeerPorAtleta(
  responses: Pick<QuestionnaireResponse, 'athleteId' | 'submittedAt' | 'reviewedAt'>[],
): Map<string, number> {
  const ciclos = new Map<string, Set<string>>();
  for (const r of responses) {
    if (r.reviewedAt) continue;
    const atleta = r.athleteId.toLowerCase();
    const set = ciclos.get(atleta) ?? new Set<string>();
    set.add(viernesDelCiclo(r.submittedAt.slice(0, 10)));
    ciclos.set(atleta, set);
  }
  return new Map([...ciclos].map(([atleta, set]) => [atleta, set.size]));
}
