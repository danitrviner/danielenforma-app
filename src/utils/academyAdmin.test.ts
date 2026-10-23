import { describe, it, expect } from 'vitest';
import type { AcademyCourse, AcademyLesson } from '../types';
import {
  cursoVisible, cursosVisibles, cursosAlActivar, alternarCurso, moverElemento, porcentajeDeCurso, progresoRecalculado, leccionesDeCurso,
} from './academyAdmin';

const curso = (id: string, order: number, over: Partial<AcademyCourse> = {}): AcademyCourse => ({
  id, title: id, description: '', category: 'entrenamiento', order, published: true, unlockRule: { type: 'immediate' }, lessonCount: 0, ...over,
});
const leccion = (id: string, courseId: string, order: number): AcademyLesson => ({ id, courseId, title: id, order, videoProvider: 'youtube', videoId: 'x' });
const C = [curso('c1', 0, { inicial: true }), curso('c2', 1), curso('c3', 2, { published: false })];

describe('acceso por curso', () => {
  it('sin lista guardada ve todo (accesos de antes); con lista, solo esos; lista vacía = ninguno', () => {
    expect(cursoVisible({ enabled: true }, 'c2')).toBe(true);
    expect(cursoVisible({ enabled: true, grantedCourses: ['c1'] }, 'c2')).toBe(false);
    expect(cursoVisible({ enabled: true, grantedCourses: [] }, 'c1')).toBe(false);
    expect(cursoVisible({ enabled: false }, 'c1')).toBe(false);
    expect(cursoVisible(null, 'c1')).toBe(false);
    expect(cursosVisibles({ grantedCourses: [] }, C)).toEqual([]);
    expect(cursosVisibles({}, C)).toHaveLength(3);
  });
  it('al dar acceso por primera vez, solo los cursos iniciales', () => {
    expect(cursosAlActivar(null, C)).toEqual(['c1']);
    expect(cursosAlActivar({}, C)).toEqual(['c1']);
  });
  it('si no hay ningún curso inicial, ve todo (undefined)', () => {
    expect(cursosAlActivar(null, [curso('a', 0), curso('b', 1)])).toBeUndefined();
  });
  it('al devolverle el acceso conserva lo que ya tenía marcado', () => {
    expect(cursosAlActivar({ grantedCourses: ['c2'] }, C)).toEqual(['c2']);
  });
  it('un inicial sin publicar no se abre solo', () => {
    expect(cursosAlActivar(null, [curso('a', 0, { inicial: true, published: false })])).toBeUndefined();
  });
  it('abrir y cerrar cursos; un acceso «a todo» pasa a lista explícita sin perder lo que veía', () => {
    expect(alternarCurso({ grantedCourses: ['c1'] }, 'c2', true, C)).toEqual(['c1', 'c2']);
    expect(alternarCurso({ grantedCourses: ['c1', 'c2'] }, 'c1', false, C)).toEqual(['c2']);
    expect(alternarCurso({}, 'c2', false, C)).toEqual(['c1']);   // veía c1 y c2 (publicados): cierra c2
    expect(alternarCurso({ grantedCourses: ['c1'] }, 'c1', false, C)).toEqual([]);
  });
  it('abrir un curso ya abierto no lo duplica', () => {
    expect(alternarCurso({ grantedCourses: ['c1'] }, 'c1', true, C)).toEqual(['c1']);
  });
});

describe('moverElemento', () => {
  const L = [leccion('a', 'c', 0), leccion('b', 'c', 1), leccion('c', 'c', 2)];
  it('intercambia con el vecino y solo devuelve lo que cambia', () => {
    expect(moverElemento(L, 'b', -1)).toEqual([{ id: 'b', order: 0 }, { id: 'a', order: 1 }]);
    expect(moverElemento(L, 'b', 1)).toEqual([{ id: 'c', order: 1 }, { id: 'b', order: 2 }]);
  });
  it('en los extremos no hace nada', () => {
    expect(moverElemento(L, 'a', -1)).toEqual([]);
    expect(moverElemento(L, 'c', 1)).toEqual([]);
    expect(moverElemento(L, 'zzz', 1)).toEqual([]);
  });
  it('normaliza órdenes con huecos o repetidos', () => {
    const raro = [leccion('a', 'c', 5), leccion('b', 'c', 5), leccion('c', 'c', 9)];
    const r = moverElemento(raro, 'c', -1);
    expect(r.find(x => x.id === 'c')?.order).toBe(1);
  });
});

describe('porcentaje del curso', () => {
  it('se calcula con las lecciones que hay ahora', () => {
    expect(porcentajeDeCurso(['a', 'b'], { a: 'x', b: 'x' })).toBe(100);
    expect(porcentajeDeCurso(['a', 'b', 'c'], { a: 'x', b: 'x' })).toBe(67);
    expect(porcentajeDeCurso([], {})).toBe(0);
  });
  it('añadir una lección a un curso terminado baja el % guardado al abrirlo', () => {
    const lessons = [leccion('a', 'c1', 0), leccion('b', 'c1', 1), leccion('nueva', 'c1', 2)];
    const r = progresoRecalculado({ athleteId: 'x', completed: { a: 'x', b: 'x' }, courseProgress: { c1: 100, c9: 40 } }, C, lessons);
    expect(r.courseProgress.c1).toBe(67);
    expect(r.courseProgress.c9).toBe(40);
  });
  it('lecciones de un curso ordenadas', () => {
    expect(leccionesDeCurso([leccion('b', 'c', 1), leccion('a', 'c', 0), leccion('z', 'otro', 0)], 'c').map(l => l.id)).toEqual(['a', 'b']);
  });
});
