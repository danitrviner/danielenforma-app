import { QuestionnaireAssignment, QuestionnaireResponse } from '../types';
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

  if (type === 'weekdays') {
    return mine.some(r => r.submittedAt.slice(0, 10) === today);
  }

  if (type === 'interval') {
    // Ventana de la ocurrencia actual: desde el último pulso (múltiplo de
    // intervalDays desde startDate, no forzosamente hoy) hasta hoy inclusive.
    // Antes se comparaba solo contra el día exacto del pulso, así que
    // responder con un día de retraso dejaba la ocurrencia sin cerrar para
    // siempre — con la ventana, una respuesta tardía la cierra igual.
    const intervalDays = a.schedule.intervalDays ?? 7;
    const start = startOfDay(a.startDate);
    const now = startOfDay(today);
    const diff = Math.floor((now.getTime() - start.getTime()) / 86400000);
    const sinceLastPulse = ((diff % intervalDays) + intervalDays) % intervalDays;
    const pulse = new Date(now);
    pulse.setDate(pulse.getDate() - sinceLastPulse);
    const pulseStr = pulse.toISOString().slice(0, 10);
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
    const lastEnd = pastEnds[0].toISOString().slice(0, 10);
    return mine.some(r => r.submittedAt.slice(0, 10) >= lastEnd);
  }

  return false;
}

// "Vencido y sin responder": para 'interval', 'plan_week' y 'mesocycle_end' se
// queda vencido desde su fecha objetivo hasta que se responde (no solo el día
// exacto), igual que hasAnsweredThisOccurrence considera la ventana completa —
// de lo contrario un cuestionario sin responder desaparecería de "pendientes"
// en cuanto pasara el día exacto, sin que el atleta pudiera responderlo tarde.
// Para el resto de tipos ('once'/'weekdays'/'monthly') equivale a isDueToday.
export function isOverdue(a: QuestionnaireAssignment, ctx?: ScheduleContext): boolean {
  if (!a.schedule) return false;
  const { type } = a.schedule;
  if (type !== 'interval' && type !== 'plan_week' && type !== 'mesocycle_end') {
    return isDueToday(a, ctx);
  }
  const today = startOfDay(todayStr());
  const start = startOfDay(a.startDate);
  if (type === 'interval') return today.getTime() >= start.getTime();
  if (type === 'plan_week') return planWeekDueDate(a.schedule, start).getTime() <= today.getTime();
  // mesocycle_end
  const offset = a.schedule.mesocycleOffsetDays ?? 0;
  return (ctx?.mesocycles ?? []).some(m => mesocycleEndDate(m, offset).getTime() <= today.getTime());
}
