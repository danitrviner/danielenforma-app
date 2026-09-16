import { PhotoAssignment, ProgressPhoto } from '../types';
import { todayStr, isDueToday, isUpcoming } from './scheduleEngine';
import { addDays } from './trainingWeek';

// Same "is this recurring photo check-in due, has the athlete already covered
// this occurrence" pattern as questionnaireSchedule.ts, but checking uploaded
// ProgressPhoto views instead of QuestionnaireResponse answers.
export { todayStr, isDueToday, isUpcoming };

/* Margen para las fotos recurrentes. La foto lleva la fecha que el atleta
   elige, no la de la subida: la hace el domingo y la sube el lunes, o la sube
   la víspera. Con la comparación exacta contra hoy que había antes, ninguna de
   las dos contaba, la tarea seguía «pendiente» y le volvía a pedir lo que
   acababa de mandar. Dos días a cada lado cubre ese desfase sin llegar a
   solapar una ocurrencia con la siguiente, que como mínimo va semanal. */
export const MARGEN_DIAS_FOTO = 2;

export function hasUploadedThisOccurrence(a: PhotoAssignment, photos: ProgressPhoto[]): boolean {
  if (!a.schedule || a.views.length === 0) return false;
  const mine = photos.filter(p => p.athleteId === a.athleteId);
  const { type } = a.schedule;
  const today = todayStr();
  const desde = addDays(today, -MARGEN_DIAS_FOTO);
  const hasta = addDays(today, MARGEN_DIAS_FOTO);

  const inWindow = (date: string): boolean => {
    if (type === 'once') return true;
    if (type === 'weekdays' || type === 'interval') return date >= desde && date <= hasta;
    if (type === 'monthly') return date.slice(0, 7) === today.slice(0, 7);
    return false;
  };

  return a.views.every(view => mine.some(p => p.view === view && inWindow(p.date)));
}
