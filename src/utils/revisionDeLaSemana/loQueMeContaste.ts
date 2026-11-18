import type {
  Questionnaire, QuestionnaireAssignment, QuestionnaireQuestion, QuestionnaireResponse, WeightCheckIn, WorkoutLog,
} from '../../types.js';
import { resolveQuestions } from '../questionnaireResolve.js';
import { textoDeRespuesta } from '../textoDeRespuesta.js';
import { cansancioDeSesiones } from '../cdg/senalesPorSemana.js';
import { addDays, fechaCorta } from '../trainingWeek.js';
import { diaLocal, enRango, num } from './ventana.js';

/* ═══════════════════════════════════════════════════════════════════════════
   «Lo que me contaste» — lo que dijo él, con el dato al lado (18-11-2026)

   Las respuestas de su cuestionario de la semana y su check-in, cada una con
   lo que dicen sus registros cuando lo hay: el sueño con sus horas, la energía
   con el cansancio con el que salió de las sesiones, «el jueves salí
   reventado» con la sesión de ese jueves. Si no hay dato que poner al lado, la
   respuesta va sola: nada se rellena.

   «La semana» aquí son los 7 días hasta el final de la ventana y el mismo día
   de la semana anterior: el cuestionario semanal se abre el viernes y se
   contesta hasta el martes, así que el de esta revisión puede caer justo en el
   día de corte.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface DatoAlLado {
  texto: string;
}

export interface RespuestaContada {
  questionId: string;
  pregunta: string;
  respuesta: string;
  /** Lo que contestó la vez anterior a la misma pregunta (escalas y números). */
  anterior: string | null;
  /** Texto libre: va como cita, no como cifra. */
  esTexto: boolean;
  dato: DatoAlLado | null;
}

export interface CuestionarioContado {
  responseId: string;
  titulo: string;
  fecha: string;
  respuestas: RespuestaContada[];
}

export interface CheckinContado {
  fecha: string;
  peso: number | null;
  animo: string | null;
  adherencia: string | null;
  nota: string | null;
  dato: DatoAlLado | null;
}

export interface LoQueMeContaste {
  cuestionarios: CuestionarioContado[];
  checkin: CheckinContado | null;
}

// ── Días de la semana dichos en el texto ────────────────────────────────────

const DIAS: [RegExp, number][] = [
  [/\blunes\b/, 1], [/\bmartes\b/, 2], [/\bmiercoles\b/, 3], [/\bjueves\b/, 4],
  [/\bviernes\b/, 5], [/\bsabado\b/, 6], [/\bdomingo\b/, 0],
];
const NOMBRE_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Días de la semana que menciona un texto, en el orden en que aparecen. */
export function diasMencionados(texto: string): number[] {
  const t = sinTildes(texto);
  return DIAS
    .map(([re, d]) => ({ d, i: t.search(re) }))
    .filter(x => x.i >= 0)
    .sort((a, b) => a.i - b.i)
    .map(x => x.d);
}

/** La fecha de ese día de la semana más reciente en o antes de `fecha`. */
export function fechaDelDia(diaSemana: number, fecha: string): string {
  const dia = new Date(`${fecha}T12:00:00`).getDay();
  return addDays(fecha, -((dia - diaSemana + 7) % 7));
}

type LogSesion = Pick<WorkoutLog, 'id' | 'date' | 'workoutId' | 'cansancioAlSalir'>;

/** «Jueves 12 nov: Pierna, salió con 8/10 de cansancio» o «sin sesión registrada». */
export function datoDelDia(o: {
  texto: string;
  fecha: string;
  logs: readonly LogSesion[];
  nombreDeSesion?: (workoutId: string) => string | undefined;
}): DatoAlLado | null {
  const dias = diasMencionados(o.texto);
  if (dias.length === 0) return null;
  const frases = dias.slice(0, 2).map(d => {
    const f = fechaDelDia(d, o.fecha);
    const delDia = o.logs.filter(l => l.date === f);
    const cabeza = `${NOMBRE_DIA[d][0].toUpperCase()}${NOMBRE_DIA[d].slice(1)} ${fechaCorta(f)}`;
    if (delDia.length === 0) return `${cabeza}: no hay sesión registrada`;
    return `${cabeza}: ${delDia.map(l => {
      const nombre = o.nombreDeSesion?.(l.workoutId)?.trim();
      const cansancio = typeof l.cansancioAlSalir === 'number' ? `salió con ${num(l.cansancioAlSalir)}/10 de cansancio` : null;
      return [nombre ? `entrenó ${nombre}` : 'entrenó', cansancio].filter(Boolean).join(', ');
    }).join('; ')}`;
  });
  return { texto: frases.join(' · ') };
}

// ── Qué dato va al lado de cada pregunta ────────────────────────────────────

const esDeSueño = (q: QuestionnaireQuestion) => q.signalKey === 'wellness.sleep_hours_weekly' || /sue[ñn]o|dorm|descans/i.test(q.label);
const esHorasDeSueño = (q: QuestionnaireQuestion) => q.signalKey === 'wellness.sleep_hours_weekly'
  || (q.type === 'numeric' && /hora/i.test(q.label) && /sue[ñn]o|dorm/i.test(q.label));
const esDeEnergia = (q: QuestionnaireQuestion) => q.signalKey === 'wellness.fatigue_post_weekly' || /energ|cansad|cansancio|fatiga|reventad/i.test(q.label);

function datoDeCansancio(logs: readonly LogSesion[], desde: string, hasta: string, nombreDeSesion?: (id: string) => string | undefined): DatoAlLado | null {
  const c = cansancioDeSesiones(logs, { desde, hasta, nombreDe: nombreDeSesion });
  if (!c) return null;
  const peor = c.sesiones > 1 ? ` · la más dura fue ${c.peor.etiqueta} (${num(c.peor.valor)}/10)` : '';
  return {
    texto: `Salió de ${c.sesiones === 1 ? 'su sesión' : `sus ${c.sesiones} sesiones`} con un ${num(c.media)}/10 de cansancio${c.sesiones > 1 ? ' de media' : ''}${peor}`,
  };
}

function valorNumerico(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.')) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function loQueMeContaste(o: {
  hasta: string;
  responses: readonly QuestionnaireResponse[];
  questionnaires: readonly Questionnaire[];
  /** Para aplicar las preguntas propias del atleta (`overrides`). */
  asignaciones?: readonly Pick<QuestionnaireAssignment, 'id' | 'overrides'>[];
  checkins?: readonly WeightCheckIn[];
  logs: readonly LogSesion[];
  nombreDeSesion?: (workoutId: string) => string | undefined;
}): LoQueMeContaste {
  const desde = addDays(o.hasta, -7);
  const porId = new Map(o.questionnaires.map(q => [q.id, q]));
  const asignacionDe = new Map((o.asignaciones ?? []).map(a => [a.id, a]));
  const conFecha = o.responses
    .map(r => ({ r, fecha: diaLocal(r.submittedAt) }))
    .filter((x): x is { r: QuestionnaireResponse; fecha: string } => x.fecha != null);

  const cuestionarios: CuestionarioContado[] = conFecha
    .filter(x => enRango(x.fecha, desde, o.hasta) && porId.has(x.r.questionnaireId))
    .sort((a, b) => b.r.submittedAt.localeCompare(a.r.submittedAt))
    .map(({ r, fecha }) => {
      const q = porId.get(r.questionnaireId)!;
      const asignacion = asignacionDe.get(r.assignmentId);
      const preguntas = asignacion ? resolveQuestions(q, asignacion) : q.questions;
      const preguntaDe = new Map(preguntas.map(p => [p.id, p]));
      // La vez anterior que contestó este mismo cuestionario.
      const previa = conFecha
        .filter(x => x.r.questionnaireId === r.questionnaireId && x.r.submittedAt < r.submittedAt)
        .sort((a, b) => b.r.submittedAt.localeCompare(a.r.submittedAt))[0]?.r;
      const valorDe = (resp: QuestionnaireResponse | undefined, id: string) => resp?.answers.find(a => a.questionId === id)?.value;
      // La semana de la respuesta: los 7 días que acaban el día que la mandó.
      const semanaDesde = addDays(fecha, -6);

      const respuestas: RespuestaContada[] = [];
      for (const p of preguntas) {
        if (p.type === 'media') continue;
        const valor = valorDe(r, p.id);
        if (valor === undefined || valor === null || valor === '') continue;
        const comentario = valorDe(r, `${p.id}__comentario`);
        const esTexto = p.type === 'text';
        // Las horas de sueño sin unidad en la pregunta: «7,5 h», no «7.5».
        const texto = (v: unknown) => (esHorasDeSueño(p) && !p.unit && valorNumerico(v) != null
          ? `${num(valorNumerico(v)!)} h` : textoDeRespuesta(p, v as string | number | boolean));
        let respuesta = texto(valor);
        if (typeof comentario === 'string' && comentario.trim()) respuesta += ` — «${comentario.trim()}»`;
        const previo = valorDe(previa, p.id);
        const anterior = (p.type === 'scale' || p.type === 'numeric' || p.type === 'metric') && previo !== undefined && previo !== ''
          ? texto(previo) : null;

        let dato: DatoAlLado | null = null;
        if (esTexto) {
          dato = datoDelDia({ texto: String(valor), fecha, logs: o.logs, nombreDeSesion: o.nombreDeSesion });
        } else if (esDeSueño(p) && !esHorasDeSueño(p)) {
          // Una pregunta de calidad del sueño: al lado, las horas que dijo.
          const horas = preguntas.find(x => esHorasDeSueño(x) && x.id !== p.id);
          const h = horas ? valorNumerico(valorDe(r, horas.id)) : null;
          if (h != null) dato = { texto: `Duerme ${num(h)} h de media` };
        } else if (esDeEnergia(p)) {
          dato = datoDeCansancio(o.logs, semanaDesde, fecha, o.nombreDeSesion);
        }
        respuestas.push({ questionId: p.id, pregunta: p.label, respuesta, anterior: anterior === respuesta ? null : anterior, esTexto, dato });
      }
      return { responseId: r.id, titulo: q.title, fecha, respuestas };
    })
    .filter(c => c.respuestas.length > 0);

  const checkins = (o.checkins ?? [])
    .map(c => ({ c, fecha: diaLocal(c.timestamp) }))
    .filter((x): x is { c: WeightCheckIn; fecha: string } => x.fecha != null && enRango(x.fecha, desde, o.hasta))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  const ultimo = checkins[0];
  const nota = ultimo?.c.notes?.trim() || null;
  const checkin: CheckinContado | null = ultimo ? {
    fecha: ultimo.fecha,
    peso: Number.isFinite(ultimo.c.weight) && ultimo.c.weight > 0 ? ultimo.c.weight : null,
    animo: ultimo.c.mood || null,
    adherencia: ultimo.c.adherence || null,
    nota,
    dato: nota ? datoDelDia({ texto: nota, fecha: ultimo.fecha, logs: o.logs, nombreDeSesion: o.nombreDeSesion }) : null,
  } : null;

  return { cuestionarios, checkin };
}

export function hayAlgoQueContar(l: LoQueMeContaste): boolean {
  return l.cuestionarios.length > 0 || l.checkin != null;
}
