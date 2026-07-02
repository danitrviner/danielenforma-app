import { QSchedule } from '../types';

// Generic recurring-schedule evaluation, extracted from questionnaireSchedule.ts
// so it can be reused for anything scheduled with a QSchedule (currently
// questionnaires and photo check-ins) without duplicating the date math.

export interface Scheduled {
  schedule: QSchedule;
  startDate: string; // YYYY-MM-DD
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isDueToday(a: Scheduled): boolean {
  if (!a.schedule) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(a.startDate + 'T00:00:00');
  if (today < start) return false;

  const { type } = a.schedule;
  if (type === 'once') return a.startDate === todayStr();
  if (type === 'weekdays') return (a.schedule.weekdays ?? []).includes(today.getDay());
  if (type === 'interval') {
    const diff = Math.floor((today.getTime() - start.getTime()) / 86400000);
    return diff % (a.schedule.intervalDays ?? 7) === 0;
  }
  if (type === 'monthly') return today.getDate() === (a.schedule.dayOfMonth ?? 1);
  return false;
}

// A schedule is "upcoming" (not due today, but will recur).
export function isUpcoming(a: Scheduled): boolean {
  if (!a.schedule) return false;
  if (isDueToday(a)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(a.startDate + 'T00:00:00');
  return today <= start || a.schedule.type !== 'once';
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
    default:         return '—';
  }
}
