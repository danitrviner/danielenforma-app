import { AcademyCourse, AcademyLesson, AcademyProgress } from '../types';

export interface Continuacion {
  course: AcademyCourse;
  lesson: AcademyLesson;
  /** Posición de la lección dentro del curso, 1-indexada, para «Lección 3 de 8». */
  numero: number;
  total: number;
  /** true si aún no ha visto ninguna lección del curso: «Empezar» y no «Seguir». */
  empezando: boolean;
}

/**
 * Por dónde retomar Training Lab.
 *
 * `academyProgress.lastLessonId` guarda la última lección COMPLETADA, no la
 * siguiente: apuntar ahí sin más devolvería al atleta a un vídeo que ya ha
 * visto. Así que se busca la primera lección sin completar del último curso
 * tocado, que es lo que de verdad significa «seguir».
 *
 * Y si ese curso está entero, no se ofrece nada: mandar al primer curso de la
 * lista sería inventarse una intención que el atleta no ha tenido. Mejor que
 * elija él en la rejilla.
 *
 * `cursosVisibles` son los que el atleta puede abrir de verdad (publicados y
 * desbloqueados). Sin ese filtro, el hero podría empujar a un curso que la
 * rejilla pinta con candado.
 */
export function siguienteLeccion(
  progress: AcademyProgress,
  cursosVisibles: AcademyCourse[],
  lecciones: AcademyLesson[],
): Continuacion | null {
  const course = cursosVisibles.find(c => c.id === progress.lastCourseId);
  if (!course) return null;

  const delCurso = lecciones
    .filter(l => l.courseId === course.id)
    .sort((a, b) => a.order - b.order);
  if (delCurso.length === 0) return null;

  const indice = delCurso.findIndex(l => !progress.completed[l.id]);
  if (indice === -1) return null; // curso terminado: nada que continuar

  return {
    course,
    lesson: delCurso[indice],
    numero: indice + 1,
    total: delCurso.length,
    empezando: delCurso.every(l => !progress.completed[l.id]),
  };
}
