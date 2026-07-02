import { QuestionnaireAssignment, QuestionnaireResponse } from '../types';
import { todayStr, isDueToday, isUpcoming } from './scheduleEngine';

// Shared "is this recurring questionnaire due, and has the athlete already answered
// this occurrence" logic — used by CheckInScreen (to show the pending list) and by
// the pending-tasks aggregator (to fold questionnaires into the dashboard).
// isDueToday/isUpcoming live in scheduleEngine.ts (generic over any {schedule,
// startDate} shape) — re-exported here so existing call sites don't change.

export { todayStr, isDueToday, isUpcoming };

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
