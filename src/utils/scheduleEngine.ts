import { QSchedule, Mesocycle } from '../types';

// Generic recurring-schedule evaluation, extracted from questionnaireSchedule.ts
// so it can be reused for anything scheduled with a QSchedule (currently
// questionnaires and photo check-ins) without duplicating the date math.

export interface Scheduled {
  schedule: QSchedule;
  startDate: string; // YYYY-MM-DD
}

// Contexto opcional para los disparadores por evento ('plan_week' y
// 'mesocycle_end'). El caller debe pasar los mesociclos ya filtrados al
// atleta dueño de `a` — scheduleEngine no conoce el athleteId de `a`.
export interface ScheduleContext {
  mesocycles?: Mesocycle[];
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function startOfDay(dateStr: string): Date {
  const d = new Date(dateStr + 'T00:00:00');
  d.setHours(0, 0, 0, 0);
  return d;
}

// Fecha objetivo de un disparador 'plan_week': la semana N (1-indexada) desde
// startDate, en el día de la semana indicado (por defecto, el mismo día de la
// semana que startDate). Exportada para que questionnaireSchedule.ts pueda
// calcular ventanas de ocurrencia "vencido hasta responder" sin duplicar la
// aritmética de fechas.
export function planWeekDueDate(schedule: QSchedule, start: Date): Date {
  const week = schedule.planWeek ?? 1;
  const weekday = schedule.planWeekday ?? start.getDay();
  const due = new Date(start);
  due.setDate(due.getDate() + (week - 1) * 7);
  const shift = (weekday - due.getDay() + 7) % 7;
  due.setDate(due.getDate() + shift);
  return due;
}

// Último día (inclusive) de un mesociclo, menos un offset opcional en días
// (offset positivo = antes del cierre, negativo = después). Exportada por el
// mismo motivo que planWeekDueDate.
export function mesocycleEndDate(m: Mesocycle, offsetDays: number): Date {
  const start = startOfDay(m.startDate);
  const end = new Date(start);
  end.setDate(end.getDate() + m.weeks * 7 - 1 - offsetDays);
  return end;
}

export function isDueToday(a: Scheduled, ctx?: ScheduleContext): boolean {
  if (!a.schedule) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = startOfDay(a.startDate);
  if (today < start) return false;

  const { type } = a.schedule;
  if (type === 'once') return a.startDate === todayStr();
  if (type === 'weekdays') return (a.schedule.weekdays ?? []).includes(today.getDay());
  if (type === 'interval') {
    const diff = Math.floor((today.getTime() - start.getTime()) / 86400000);
    return diff % (a.schedule.intervalDays ?? 7) === 0;
  }
  if (type === 'monthly') return today.getDate() === (a.schedule.dayOfMonth ?? 1);
  if (type === 'plan_week') {
    return planWeekDueDate(a.schedule, start).getTime() === today.getTime();
  }
  if (type === 'mesocycle_end') {
    const offset = a.schedule.mesocycleOffsetDays ?? 0;
    return (ctx?.mesocycles ?? []).some(m => mesocycleEndDate(m, offset).getTime() === today.getTime());
  }
  return false;
}

// A schedule is "upcoming" (not due today, but will recur).
export function isUpcoming(a: Scheduled, ctx?: ScheduleContext): boolean {
  if (!a.schedule) return false;
  if (isDueToday(a, ctx)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = startOfDay(a.startDate);
  const { type } = a.schedule;
  if (type === 'plan_week') {
    return planWeekDueDate(a.schedule, start).getTime() > today.getTime();
  }
  if (type === 'mesocycle_end') {
    const offset = a.schedule.mesocycleOffsetDays ?? 0;
    return (ctx?.mesocycles ?? []).some(m => mesocycleEndDate(m, offset).getTime() > today.getTime());
  }
  return today <= start || type !== 'once';
}

// Short human label for an "active assignments" list row — shared by the
// questionnaire and photo check-in assignment UIs in ClientHub.
export function scheduleLabel(schedule: QSchedule): string {
  const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  switch (schedule?.type) {
    case 'once':     return 'Una vez';
    case 'weekdays': return (schedule.weekdays ?? []).map(d => DAYS[d]).join(', ') || '—';
    case 'interval': return `Cada ${schedule.intervalDays ?? 1}d`;
    case 'monthly':  return `Día ${schedule.dayOfMonth ?? 1}/mes`;
    case 'plan_week': return `Semana ${schedule.planWeek ?? 1} del plan`;
    case 'mesocycle_end': {
      const off = schedule.mesocycleOffsetDays ?? 0;
      if (off === 0) return 'Fin de bloque';
      return off > 0 ? `${off}d antes de fin de bloque` : `${-off}d después de fin de bloque`;
    }
    default:         return '—';
  }
}
