import type { AcademyAccess, AcademyCourse, AcademyLesson, AcademyProgress } from '../types';

/* ═══════════════════════════════════════════════════════════════════════════
   Training Lab, lado coach: acceso por curso, orden y progreso.

   Acceso (Dani, 23-10): los cursos se abren a mano, curso a curso.
   `grantedCourses` ausente = ve todos los publicados (los accesos de antes, que
   no se tocan); presente = ve SOLO esos, y una lista vacía es «ninguno».
   ═══════════════════════════════════════════════════════════════════════════ */

export const cursosPublicados = (courses: readonly AcademyCourse[]): AcademyCourse[] =>
  courses.filter(c => c.published).sort((a, b) => a.order - b.order);

/** ¿Ve este curso? Sin acceso general, no. */
export function cursoVisible(access: Pick<AcademyAccess, 'enabled' | 'grantedCourses'> | null | undefined, courseId: string): boolean {
  if (!access?.enabled) return false;
  return Array.isArray(access.grantedCourses) ? access.grantedCourses.includes(courseId) : true;
}

/** Los cursos que ve un atleta con ese acceso (la pantalla del atleta y la del coach usan la misma regla). */
export function cursosVisibles(access: Pick<AcademyAccess, 'grantedCourses'> | null | undefined, courses: readonly AcademyCourse[]): AcademyCourse[] {
  const granted = access?.grantedCourses;
  return Array.isArray(granted) ? courses.filter(c => granted.includes(c.id)) : [...courses];
}

/**
 * Qué cursos tiene un atleta al darle (o devolverle) el acceso general: lo que
 * ya tuviera marcado o, si es la primera vez, los cursos «iniciales». Si no hay
 * ninguno marcado como inicial devuelve `undefined` (ve todos, como hasta ahora).
 */
export function cursosAlActivar(access: Pick<AcademyAccess, 'grantedCourses'> | null | undefined, courses: readonly AcademyCourse[]): string[] | undefined {
  if (Array.isArray(access?.grantedCourses)) return access!.grantedCourses;
  const iniciales = cursosPublicados(courses).filter(c => c.inicial).map(c => c.id);
  return iniciales.length > 0 ? iniciales : undefined;
}

/** La lista de cursos tras abrir o cerrar `courseId`. Un acceso «a todo» pasa a lista explícita (con todos los publicados) antes de cambiar. */
export function alternarCurso(
  access: Pick<AcademyAccess, 'grantedCourses'> | null | undefined,
  courseId: string,
  abrir: boolean,
  courses: readonly AcademyCourse[],
): string[] {
  const base = Array.isArray(access?.grantedCourses) ? access!.grantedCourses : cursosPublicados(courses).map(c => c.id);
  const sin = base.filter(id => id !== courseId);
  return abrir ? [...sin, courseId] : sin;
}

/** Nuevas posiciones (0…n-1) tras subir o bajar un elemento; solo los que cambian de sitio. */
export function moverElemento(items: readonly { id: string; order: number }[], id: string, delta: -1 | 1): { id: string; order: number }[] {
  const orden = [...items].sort((a, b) => a.order - b.order);
  const i = orden.findIndex(x => x.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= orden.length) return [];
  [orden[i], orden[j]] = [orden[j], orden[i]];
  const actual = new Map(items.map(x => [x.id, x.order]));
  return orden.map((x, k) => ({ id: x.id, order: k })).filter(x => actual.get(x.id) !== x.order);
}

export const leccionesDeCurso = (lessons: readonly AcademyLesson[], courseId: string): AcademyLesson[] =>
  lessons.filter(l => l.courseId === courseId).sort((a, b) => a.order - b.order);

/** % del curso con las lecciones que existen AHORA (no el guardado al completar la última). */
export function porcentajeDeCurso(lessonIds: readonly string[], completed: AcademyProgress['completed']): number {
  if (lessonIds.length === 0) return 0;
  return Math.round((lessonIds.filter(id => completed[id]).length / lessonIds.length) * 100);
}

/** El progreso con el % de cada curso recalculado: así añadir una lección a un curso terminado se nota al abrirlo. */
export function progresoRecalculado(progress: AcademyProgress, courses: readonly AcademyCourse[], lessons: readonly AcademyLesson[]): AcademyProgress {
  const courseProgress = { ...progress.courseProgress };
  for (const c of courses) {
    const ids = lessons.filter(l => l.courseId === c.id).map(l => l.id);
    if (ids.length > 0) courseProgress[c.id] = porcentajeDeCurso(ids, progress.completed);
  }
  return { ...progress, courseProgress };
}
