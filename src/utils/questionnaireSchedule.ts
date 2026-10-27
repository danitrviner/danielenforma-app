import { QuestionnaireAssignment, QuestionnaireResponse } from '../types';
import { isoLocal } from './trainingWeek';
import {
  todayStr, isDueToday, isUpcoming, ScheduleContext,
  startOfDay, planWeekDueDate, mesocycleEndDate,
} from './scheduleEngine';
import {
  DIA_REVISION_POR_DEFECTO, diasDelCiclo, aperturaDelCiclo, caducidadDelCiclo, aperturaDesde,
  enPausa, fechasSemanaDelBloque,
} from './cicloRevision';

// Shared "is this recurring questionnaire due, and has the athlete already answered
// this occurrence" logic — used by CheckInScreen (to show the pending list) and by
// the pending-tasks aggregator (to fold questionnaires into the dashboard).
// isDueToday/isUpcoming live in scheduleEngine.ts (generic over any {schedule,
// startDate} shape) — re-exported here so existing call sites don't change.

export { todayStr, isDueToday, isUpcoming };
export type { ScheduleContext };

/* El día de los cuestionarios ya no es fijo (27-10): sale del día de revisión
   de cada atleta (`UserProfile.diaRevision`, ver utils/cicloRevision.ts). Sin
   día elegido es el lunes, así que todo lo de abajo se comporta como antes:
   se piden el viernes y caducan el martes. Estas dos constantes quedan como el
   valor por defecto para quien no pasa contexto. */
export const DIA_CADUCIDAD_PENDIENTE = diasDelCiclo(DIA_REVISION_POR_DEFECTO).caducidad;
export const DIA_CUESTIONARIO = diasDelCiclo(DIA_REVISION_POR_DEFECTO).apertura;

/** Apertura (viernes, con revisión el lunes) del ciclo al que pertenece `iso`. */
export function viernesDelCiclo(iso: string, diaRevision?: number): string {
  return aperturaDelCiclo(iso, diaRevision);
}

/** Día en que caduca la revisión que se abre en `apertura`. */
export function martesDeCaducidad(apertura: string): string {
  return caducidadDelCiclo(apertura);
}

type ConCalendario = Pick<QuestionnaireAssignment, 'schedule' | 'startDate'>;

function fijarAlDiaCon<T extends ConCalendario>(a: T, apertura: number, anclar: (iso: string) => string): T {
  const s = a.schedule;
  if (!s) return a;
  if (s.type === 'weekdays') {
    if ((s.weekdays ?? []).length === 0) return a;
    return { ...a, schedule: { ...s, weekdays: [apertura] } };
  }
  // Solo cadencias de semanas enteras: un «cada 10 días» no puede caer siempre el mismo día.
  if (s.type === 'interval' && (s.intervalDays ?? 7) % 7 === 0 && a.startDate) {
    return { ...a, startDate: anclar(a.startDate) };
  }
  return a;
}

/** Al LEER: lo ya asignado (lunes, domingo, mal configurado…) pasa al día de
 *  apertura de su misma semana de revisión, sin mover qué semanas le tocan. */
export function fijarAlViernes<T extends ConCalendario>(a: T, diaRevision?: number): T {
  return fijarAlDiaCon(a, diasDelCiclo(diaRevision).apertura, iso => aperturaDelCiclo(iso, diaRevision));
}

/** Al CREAR: arranca la primera apertura desde el día elegido, para que asignar
 *  un lunes no deje pendiente la revisión que ya pasó. */
export function fijarAlViernesAlCrear<T extends ConCalendario>(a: T, diaRevision?: number): T {
  return fijarAlDiaCon(a, diasDelCiclo(diaRevision).apertura, iso => aperturaDesde(iso, diaRevision));
}

/** La asignación vista con el día de revisión del atleta. */
function conDiaDelAtleta(a: QuestionnaireAssignment, ctx?: ScheduleContext): QuestionnaireAssignment {
  return ctx?.diaRevision == null ? a : fijarAlViernes(a, ctx.diaRevision);
}

/** Último día programado (hoy incluido) de un 'weekdays' o 'interval'. */
function ultimoPulso(a: QuestionnaireAssignment, today: string): Date | null {
  const s = a.schedule;
  const now = startOfDay(today);
  if (s.type === 'weekdays') {
    const weekdays = s.weekdays ?? [];
    if (weekdays.length === 0) return null;
    let daysBack = 0;
    while (daysBack < 7 && !weekdays.includes((now.getDay() - daysBack + 7) % 7)) daysBack++;
    if (daysBack >= 7) return null;
    const pulse = new Date(now);
    pulse.setDate(pulse.getDate() - daysBack);
    return pulse;
  }
  if (s.type === 'interval') {
    const intervalDays = s.intervalDays ?? 7;
    const start = startOfDay(a.startDate);
    // round, no floor: con el cambio de hora un día no son 24 h justas.
    const diff = Math.round((now.getTime() - start.getTime()) / 86400000);
    const sinceLastPulse = ((diff % intervalDays) + intervalDays) % intervalDays;
    const pulse = new Date(now);
    pulse.setDate(pulse.getDate() - sinceLastPulse);
    return pulse;
  }
  return null;
}

/** Fecha en que tocó el último 'mesocycle_week' (hoy incluido), o null. */
function ultimaSemanaDelBloque(a: QuestionnaireAssignment, ctx: ScheduleContext | undefined, today: string): string | null {
  const pasadas = fechasSemanaDelBloque(a.schedule, ctx?.mesocycles ?? [], ctx?.diaRevision).filter(f => f <= today);
  return pasadas.length > 0 ? pasadas[pasadas.length - 1] : null;
}

export function hasAnsweredThisOccurrence(
  original: QuestionnaireAssignment,
  responses: QuestionnaireResponse[],
  ctx?: ScheduleContext,
): boolean {
  if (!original.schedule) return false;
  const a = conDiaDelAtleta(original, ctx);
  const mine = responses.filter(r => r.assignmentId === a.id);
  if (mine.length === 0) return false;
  const { type } = a.schedule;

  // Ocurrencia única en la vida de la asignación: cualquier respuesta ya enviada la cierra.
  if (type === 'once' || type === 'plan_week') return true;

  const today = todayStr();

  if (type === 'weekdays' || type === 'interval') {
    // Ventana de la ocurrencia actual: desde el último día programado (no
    // forzosamente hoy) hasta hoy. Responder tarde la cierra igual, y lo
    // respondido cuenta hasta que llega el siguiente día programado.
    const pulse = ultimoPulso(a, today);
    if (!pulse) return false;
    const pulseStr = isoLocal(pulse);
    return mine.some(r => {
      const d = r.submittedAt.slice(0, 10);
      return d >= pulseStr && d <= today;
    });
  }

  if (type === 'monthly') {
    const ym = today.slice(0, 7);
    return mine.some(r => r.submittedAt.slice(0, 7) === ym);
  }

  if (type === 'mesocycle_week') {
    const ultima = ultimaSemanaDelBloque(a, ctx, today);
    return !!ultima && mine.some(r => r.submittedAt.slice(0, 10) >= ultima);
  }

  if (type === 'mesocycle_end') {
    // Cada mesociclo genera su propia ocurrencia. Sin mesociclos en el
    // contexto no podemos delimitar la ventana — se cae al comportamiento
    // conservador de comparar contra hoy exacto en vez de bloquear para siempre.
    const mesos = ctx?.mesocycles ?? [];
    if (mesos.length === 0) return mine.some(r => r.submittedAt.slice(0, 10) === today);
    const offset = a.schedule.mesocycleOffsetDays ?? 0;
    const now = startOfDay(today);
    const pastEnds = mesos
      .map(m => mesocycleEndDate(m, offset))
      .filter(d => d.getTime() <= now.getTime())
      .sort((x, y) => y.getTime() - x.getTime());
    if (pastEnds.length === 0) return false;
    const lastEnd = isoLocal(pastEnds[0]);
    return mine.some(r => r.submittedAt.slice(0, 10) >= lastEnd);
  }

  return false;
}

// "Vencido y sin responder": no solo el día exacto, para que se pueda
// responder tarde. 'weekdays'/'interval' caducan el día después de la revisión
// del atleta; 'mesocycle_week' al abrirse el ciclo siguiente; 'monthly' a fin
// de mes; 'plan_week'/'mesocycle_end' siguen hasta responder. Solo 'once'
// equivale a isDueToday. Dentro de una pausa no se pide nada.
export function isOverdue(original: QuestionnaireAssignment, ctx?: ScheduleContext): boolean {
  if (!original.schedule) return false;
  const a = conDiaDelAtleta(original, ctx);
  const { type } = a.schedule;
  if (type === 'once') return isDueToday(a, ctx);
  const hoyStr = todayStr();
  const today = startOfDay(hoyStr);
  // El alta real, no la anclada: anclar puede llevar el inicio unos días atrás.
  const start = startOfDay(original.startDate);
  if (today.getTime() < start.getTime()) return false;
  if (type === 'interval' || type === 'weekdays') {
    // Pendiente desde su día hasta la caducidad (exclusive). Un día anterior al
    // alta no cuenta: asignar un domingo una revisión de viernes no la deja
    // pendiente por el viernes de antes.
    const pulse = ultimoPulso(a, hoyStr);
    if (!pulse || pulse.getTime() < start.getTime()) return false;
    if (enPausa(isoLocal(pulse), ctx?.pausa)) return false;
    const caducidad = diasDelCiclo(ctx?.diaRevision).caducidad;
    const caduca = new Date(pulse);
    caduca.setDate(caduca.getDate() + ((caducidad - pulse.getDay() + 7) % 7 || 7));
    return today.getTime() < caduca.getTime();
  }
  if (type === 'mesocycle_week') {
    const ultima = ultimaSemanaDelBloque(a, ctx, hoyStr);
    if (!ultima || ultima < original.startDate || enPausa(ultima, ctx?.pausa)) return false;
    // Una semana entera para responder: hasta que se abre el ciclo siguiente.
    const limite = startOfDay(ultima);
    limite.setDate(limite.getDate() + 7);
    return today.getTime() < limite.getTime();
  }
  if (type === 'plan_week') {
    // Los hitos («semana 4 del plan») entran en la revisión de esa semana: se
    // piden el día que se abre el ciclo que contiene su fecha, no un día suelto
    // a mitad de semana. Nunca antes del alta.
    const due = aperturaDelCiclo(isoLocal(planWeekDueDate(a.schedule, start)), ctx?.diaRevision);
    const desde = due < original.startDate ? original.startDate : due;
    return desde <= hoyStr;
  }
  if (type === 'monthly') return today.getDate() >= (a.schedule.dayOfMonth ?? 1);
  // mesocycle_end
  const offset = a.schedule.mesocycleOffsetDays ?? 0;
  return (ctx?.mesocycles ?? []).some(m => mesocycleEndDate(m, offset).getTime() <= today.getTime());
}
