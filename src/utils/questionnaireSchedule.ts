import { QuestionnaireAssignment, QuestionnaireResponse } from '../types';

// Shared "is this recurring questionnaire due, and has the athlete already answered
// this occurrence" logic — used by CheckInScreen (to show the pending list) and by
// the pending-tasks aggregator (to fold questionnaires into the dashboard).

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isDueToday(a: QuestionnaireAssignment): boolean {
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

export function hasAnsweredThisOccurrence(a: QuestionnaireAssignment, responses: QuestionnaireResponse[]): boolean {
  if (!a.schedule) return false;
  const mine = responses.filter(r => r.assignmentId === a.id);
  if (mine.length === 0) return false;
  const { type } = a.schedule;
  if (type === 'once') return true;
  const today = todayStr();
  if (type === 'weekdays' || type === 'interval') {
    return mine.some(r => r.submittedAt.slice(0, 10) === today);
  }
  if (type === 'monthly') {
    const ym = today.slice(0, 7);
    return mine.some(r => r.submittedAt.slice(0, 7) === ym);
  }
  return false;
}

// A schedule is "upcoming" (not due today, but will recur) — used to list
// "cuestionarios futuros" separately from today's pending ones.
export function isUpcoming(a: QuestionnaireAssignment): boolean {
  if (!a.schedule) return false;
  if (isDueToday(a)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(a.startDate + 'T00:00:00');
  return today <= start || a.schedule.type !== 'once';
}
