import { QuestionnaireAssignment, QuestionnaireResponse } from '../types';
import { isoLocal } from './trainingWeek';
import {
  todayStr, isDueToday, isUpcoming, ScheduleContext,
  startOfDay, planWeekDueDate, mesocycleEndDate,
} from './scheduleEngine';

// Shared "is this recurring questionnaire due, and has the athlete already answered
// this occurrence" logic — used by CheckInScreen (to show the pending list) and by
// the pending-tasks aggregator (to fold questionnaires into the dashboard).
// isDueToday/isUpcoming live in scheduleEngine.ts (generic over any {schedule,
// startDate} shape) — re-exported here so existing call sites don't change.

export { todayStr, isDueToday, isUpcoming };
export type { ScheduleContext };

/** Un cuestionario vencido y sin responder deja de salir como pendiente el
 *  primer martes después de su día (0=dom…6=sáb). Decisión de Dani: si no lo
 *  responde, vuelve a «programado» hasta su siguiente día. */
export const DIA_CADUCIDAD_PENDIENTE = 2;

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
    const diff = Math.floor((now.getTime() - start.getTime()) / 86400000);
    const sinceLastPulse = ((diff % intervalDays) + intervalDays) % intervalDays;
    const pulse = new Date(now);
    pulse.setDate(pulse.getDate() - sinceLastPulse);
    return pulse;
  }
  return null;
}

export function hasAnsweredThisOccurrence(
  a: QuestionnaireAssignment,
  responses: QuestionnaireResponse[],
  ctx?: ScheduleContext,
): boolean {
  if (!a.schedule) return false;
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
// responder tarde. 'weekdays'/'interval' caducan el martes siguiente a su día;
// 'monthly' a fin de mes; 'plan_week'/'mesocycle_end' siguen hasta responder.
// Solo 'once' equivale a isDueToday.
export function isOverdue(a: QuestionnaireAssignment, ctx?: ScheduleContext): boolean {
  if (!a.schedule) return false;
  const { type } = a.schedule;
  if (type === 'once') return isDueToday(a, ctx);
  const today = startOfDay(todayStr());
  const start = startOfDay(a.startDate);
  if (today.getTime() < start.getTime()) return false;
  if (type === 'interval' || type === 'weekdays') {
    // Pendiente desde su día hasta el martes siguiente (exclusive). Un día
    // anterior al alta no cuenta: asignar un domingo una revisión de viernes
    // no la deja pendiente por el viernes de antes.
    const pulse = ultimoPulso(a, todayStr());
    if (!pulse || pulse.getTime() < start.getTime()) return false;
    const caduca = new Date(pulse);
    caduca.setDate(caduca.getDate() + ((DIA_CADUCIDAD_PENDIENTE - pulse.getDay() + 7) % 7 || 7));
    return today.getTime() < caduca.getTime();
  }
  if (type === 'plan_week') return planWeekDueDate(a.schedule, start).getTime() <= today.getTime();
  if (type === 'monthly') return today.getDate() >= (a.schedule.dayOfMonth ?? 1);
  // mesocycle_end
  const offset = a.schedule.mesocycleOffsetDays ?? 0;
  return (ctx?.mesocycles ?? []).some(m => mesocycleEndDate(m, offset).getTime() <= today.getTime());
}
