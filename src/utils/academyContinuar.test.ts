import { describe, it, expect } from 'vitest';
import { siguienteLeccion } from './academyContinuar';
import type { AcademyCourse, AcademyLesson, AcademyProgress } from '../types';

const curso = (id: string): AcademyCourse => ({
  id, title: id, description: '', category: 'entrenamiento',
  order: 0, published: true, unlockRule: { type: 'immediate' }, lessonCount: 3,
} as AcademyCourse);

const leccion = (id: string, courseId: string, order: number): AcademyLesson => ({
  id, courseId, title: id, order, videoProvider: 'youtube', videoId: 'x',
} as AcademyLesson);

const LECCIONES = [
  leccion('l1', 'c1', 0), leccion('l2', 'c1', 1), leccion('l3', 'c1', 2),
  leccion('otra', 'c2', 0),
];

const progreso = (p: Partial<AcademyProgress>): AcademyProgress => ({
  athleteId: 'a@x.com', completed: {}, courseProgress: {}, ...p,
});

describe('siguienteLeccion', () => {
  it('lleva a la primera sin completar, no a la última completada', () => {
    const r = siguienteLeccion(
      progreso({ lastCourseId: 'c1', lastLessonId: 'l1', completed: { l1: 'ayer' } }),
      [curso('c1')], LECCIONES,
    );
    expect(r?.lesson.id).toBe('l2');
    expect(r?.numero).toBe(2);
    expect(r?.total).toBe(3);
    expect(r?.empezando).toBe(false);
  });

  it('sin nada visto, marca que se está empezando', () => {
    const r = siguienteLeccion(progreso({ lastCourseId: 'c1' }), [curso('c1')], LECCIONES);
    expect(r?.lesson.id).toBe('l1');
    expect(r?.empezando).toBe(true);
  });

  it('con el curso terminado no ofrece nada', () => {
    const r = siguienteLeccion(
      progreso({ lastCourseId: 'c1', completed: { l1: 'x', l2: 'x', l3: 'x' } }),
      [curso('c1')], LECCIONES,
    );
    expect(r).toBeNull();
  });

  it('si el último curso ya no es visible, no empuja a otro', () => {
    const r = siguienteLeccion(progreso({ lastCourseId: 'c1' }), [curso('c2')], LECCIONES);
    expect(r).toBeNull();
  });

  it('sin historial, no hay nada que continuar', () => {
    expect(siguienteLeccion(progreso({}), [curso('c1')], LECCIONES)).toBeNull();
  });

  it('un curso sin lecciones no se ofrece', () => {
    expect(siguienteLeccion(progreso({ lastCourseId: 'c1' }), [curso('c1')], [])).toBeNull();
  });
});
