import { PhotoAssignment, ProgressPhoto } from '../types';
import { todayStr, isDueToday, isUpcoming } from './scheduleEngine';

// Same "is this recurring photo check-in due, has the athlete already covered
// this occurrence" pattern as questionnaireSchedule.ts, but checking uploaded
// ProgressPhoto views instead of QuestionnaireResponse answers.
export { todayStr, isDueToday, isUpcoming };

export function hasUploadedThisOccurrence(a: PhotoAssignment, photos: ProgressPhoto[]): boolean {
  if (!a.schedule || a.views.length === 0) return false;
  const mine = photos.filter(p => p.athleteId === a.athleteId);
  const { type } = a.schedule;
  const today = todayStr();

  const inWindow = (date: string): boolean => {
    if (type === 'once') return true;
    if (type === 'weekdays' || type === 'interval') return date === today;
    if (type === 'monthly') return date.slice(0, 7) === today.slice(0, 7);
    return false;
  };

  return a.views.every(view => mine.some(p => p.view === view && inWindow(p.date)));
}
