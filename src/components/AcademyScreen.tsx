import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserProfile, AcademyCourse, AcademyLesson, AcademyCategory } from '../types';
import { getAllCourses, getAllLessons, getAcademyProgress, markLessonComplete, getAcademyAccess } from '../dbService';
import { evaluateUnlockRule } from '../utils/academyUnlock';
import { addRoadmapMilestone } from '../utils/roadmapMilestones';
import LessonPlayer from './academy/LessonPlayer';
import PortadaCurso from './academy/PortadaCurso';
import TarjetaCurso from './academy/TarjetaCurso';
import { siguienteLeccion } from '../utils/academyContinuar';
import { Skeleton } from './ui';
import { Icon, Button, EmptyState, PageHeader, ListRow, ProgressBar } from './ui';

interface Props {
  profile: UserProfile;
}

const CATEGORY_LABEL: Record<AcademyCategory, string> = {
  entrenamiento: 'Entrenamiento', nutricion: 'Nutrición', fisiologia: 'Fisiología',
  biomecanica: 'Biomecánica', mentalidad: 'Mentalidad', recuperacion: 'Recuperación',
};

export default function AcademyScreen({ profile }: Props) {
  const queryClient = useQueryClient();
  const [openCourseId, setOpenCourseId] = useState<string | null>(null);
  const [openLessonId, setOpenLessonId] = useState<string | null>(null);

  const { data: access, isPending: loadingAccess } = useQuery({
    queryKey: ['academyAccess', profile.email],
    queryFn: () => getAcademyAccess(profile.email),
  });
  const { data: courses = [], isPending: loadingCourses } = useQuery({
    queryKey: ['academyCourses'],
    queryFn: getAllCourses,
  });
  const { data: lessons = [], isPending: loadingLessons } = useQuery({
    queryKey: ['academyLessons'],
    queryFn: getAllLessons,
  });
  const { data: progress, isPending: loadingProgress } = useQuery({
    queryKey: ['academyProgress', profile.email],
    queryFn: () => getAcademyProgress(profile.email),
  });

  const loading = loadingAccess || loadingCourses || loadingLessons || loadingProgress;

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full rounded-surface" />
        <Skeleton className="h-32 w-full rounded-surface" />
      </div>
    );
  }

  if (!access?.enabled) {
    return <EmptyState icon="lock" title="Training Lab aún no disponible" description="Tu entrenador todavía no te ha dado acceso a Training Lab." />;
  }

  const visibleCourses = access.grantedCourses?.length
    ? courses.filter(c => access.grantedCourses!.includes(c.id))
    : courses;
  const publishedCourses = visibleCourses.filter(c => c.published).sort((a, b) => a.order - b.order);
  const progressSafe = progress ?? { athleteId: profile.email, completed: {}, courseProgress: {} };
  const courseTitleById = (id: string) => courses.find(c => c.id === id)?.title ?? '';

  const openCourse = openCourseId ? publishedCourses.find(c => c.id === openCourseId) : null;
  const courseLessons = openCourse ? lessons.filter(l => l.courseId === openCourse.id).sort((a, b) => a.order - b.order) : [];
  const openLesson = openLessonId ? courseLessons.find(l => l.id === openLessonId) : null;

  const handleCompleteLesson = async (lesson: AcademyLesson) => {
    if (!openCourse) return;
    const courseLessonIds = courseLessons.map(l => l.id);
    const updated = await markLessonComplete(profile.email, lesson.id, openCourse.id, courseLessonIds);
    queryClient.setQueryData(['academyProgress', profile.email], updated);
    /* Aquí se recargaba el perfil para que se viera subir el XP de la lección.
       Sin XP, el perfil no cambia al completar una lección: la única marca de
       progreso es `academyProgress`, que ya se acaba de escribir arriba. */
    const justCompletedCourse = updated.courseProgress[openCourse.id] === 100 && progressSafe.courseProgress[openCourse.id] !== 100;
    if (justCompletedCourse) {
      addRoadmapMilestone(profile.email, `milestone_course_${openCourse.id}`, `Completaste el curso "${openCourse.title}"`)
        .catch(err => console.warn('addRoadmapMilestone (course) failed:', err));
    }
  };

  // ── DETALLE DE LECCIÓN ──────────────────────────────────────────────────
  if (openLesson && openCourse) {
    const done = !!progressSafe.completed[openLesson.id];
    const lessonIndex = courseLessons.findIndex(l => l.id === openLesson.id);
    const nextLesson = courseLessons[lessonIndex + 1];

    return (
      <LessonPlayer
        lesson={openLesson}
        course={openCourse}
        courseLessons={courseLessons}
        done={done}
        completedLessonIds={new Set(Object.keys(progressSafe.completed))}
        nextLesson={nextLesson}
        onBack={() => setOpenLessonId(null)}
        onComplete={() => handleCompleteLesson(openLesson)}
        onOpenLesson={id => setOpenLessonId(id)}
      />
    );
  }

  // ── DETALLE DE CURSO (lista de lecciones) ───────────────────────────────
  if (openCourse) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="s" onClick={() => setOpenCourseId(null)} icon="arrow_back">Training Lab</Button>
        {/* La misma portada que en la rejilla: al abrir un curso sigues viendo
            dónde estás, como en la ficha de cualquier plataforma de formación.
            Antes la ficha era un título sobre fondo vacío. */}
        <div className="relative overflow-hidden rounded-surface border border-hairline">
          <PortadaCurso
            category={openCourse.category}
            coverImageUrl={openCourse.coverImageUrl}
            title={openCourse.title}
            grande
            alto="h-48 sm:h-56"
          />
          <div className="absolute inset-0 flex flex-col justify-end p-4 sm:p-5">
            <span className="font-mono text-caption uppercase tracking-widest text-on-veil-2">{CATEGORY_LABEL[openCourse.category]}</span>
            <h2 className="font-sans font-bold text-title-l text-on-veil">{openCourse.title}</h2>
            <p className="text-label text-on-veil-2 font-sans mt-1 line-clamp-2">{openCourse.description}</p>
          </div>
        </div>
        {(() => {
          const hechas = courseLessons.filter(l => progressSafe.completed[l.id]).length;
          const pct = progressSafe.courseProgress[openCourse.id] ?? 0;
          return courseLessons.length > 0 ? (
            <div className="space-y-1.5">
              <ProgressBar value={pct} label={`Progreso de ${openCourse.title}, ${pct}%`} />
              <p className="font-mono text-caption text-ink-4">
                {hechas} de {courseLessons.length} lecciones · {pct} %
              </p>
            </div>
          ) : null;
        })()}
        <div className="space-y-2">
          {courseLessons.map((l, i) => {
            const done = !!progressSafe.completed[l.id];
            const rule = l.unlockRule ?? openCourse.unlockRule;
            const { unlocked, reason } = evaluateUnlockRule(rule, { profile, progress: progressSafe }, courseTitleById);
            return (
              <ListRow
                key={l.id}
                onClick={() => unlocked && setOpenLessonId(l.id)}
                disabled={!unlocked}
                className="rounded-control border bg-surface border-hairline"
                leading={<Icon name={!unlocked ? 'lock' : done ? 'check_circle' : 'play_circle'} size="l" className={done ? 'text-accent-ink' : 'text-ink-2'} />}
                title={`${i + 1}. ${l.title}`}
                subtitle={!unlocked ? reason : undefined}
              />
            );
          })}
        </div>
      </div>
    );
  }

  // ── REJILLA DE CURSOS POR CATEGORÍA ──────────────────────────────────────
  const byCategory = publishedCourses.reduce<Record<string, AcademyCourse[]>>((acc, c) => {
    (acc[c.category] ??= []).push(c);
    return acc;
  }, {});

  const desbloqueado = (c: AcademyCourse) =>
    evaluateUnlockRule(c.unlockRule, { profile, progress: progressSafe }, courseTitleById);

  // Por dónde iba. Solo entre los cursos que puede abrir de verdad: empujar a
  // uno con candado sería ofrecerle una puerta cerrada.
  const continuar = siguienteLeccion(
    progressSafe,
    publishedCourses.filter(c => desbloqueado(c).unlocked),
    lessons,
  );

  const abrirLeccion = (courseId: string, lessonId: string) => {
    setOpenCourseId(courseId);
    setOpenLessonId(lessonId);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Training Lab" subtitle="Formación — entrenamiento, nutrición y más" />

      {publishedCourses.length === 0 && (
        <p className="text-label text-ink-3 font-sans py-6 text-center">Todavía no hay cursos publicados.</p>
      )}

      {/* ── Seguir donde lo dejaste ──────────────────────────────────────────
          Lo primero que hace una plataforma de formación cuando vuelves: no te
          enseña el catálogo, te devuelve al vídeo. Es el ÚNICO oro relleno de
          la pantalla (regla del design system: uno por pantalla visible). */}
      {continuar && (
        <button
          type="button"
          onClick={() => abrirLeccion(continuar.course.id, continuar.lesson.id)}
          className="group relative block w-full text-left overflow-hidden rounded-surface border border-hairline hover:border-accent-line transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-accent/40"
        >
          <PortadaCurso
            category={continuar.course.category}
            coverImageUrl={continuar.course.coverImageUrl}
            title={continuar.course.title}
            grande
            alto="h-44 sm:h-52"
          />
          <div className="absolute inset-0 flex flex-col justify-end p-4 sm:p-5">
            <span className="font-mono text-caption uppercase tracking-widest text-on-veil-accent">
              {continuar.empezando ? 'Empieza por aquí' : 'Sigue donde lo dejaste'}
            </span>
            <p className="font-sans font-bold text-title-m text-on-veil mt-0.5 line-clamp-1">
              {continuar.lesson.title}
            </p>
            <p className="font-sans text-label text-on-veil-2 line-clamp-1">
              {continuar.course.title} · Lección {continuar.numero} de {continuar.total}
            </p>
            <span className="mt-3 inline-flex items-center gap-1.5 self-start rounded-control bg-accent px-3 py-2 font-sans font-bold text-caption text-on-accent">
              <Icon name="play_arrow" size="s" />
              {continuar.empezando ? 'Empezar' : 'Continuar'}
            </span>
          </div>
        </button>
      )}

      {(Object.keys(byCategory) as AcademyCategory[]).map(cat => (
        <section key={cat} className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-mono text-caption uppercase tracking-widest text-ink-2">{CATEGORY_LABEL[cat]}</h3>
            <span className="font-mono text-caption text-ink-4">
              {byCategory[cat].length} {byCategory[cat].length === 1 ? 'curso' : 'cursos'}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {byCategory[cat].map(c => {
              const { unlocked, reason } = desbloqueado(c);
              const delCurso = lessons.filter(l => l.courseId === c.id);
              return (
                <TarjetaCurso
                  key={c.id}
                  curso={c}
                  pct={progressSafe.courseProgress[c.id] ?? 0}
                  total={delCurso.length || c.lessonCount}
                  hechas={delCurso.filter(l => progressSafe.completed[l.id]).length}
                  unlocked={unlocked}
                  reason={reason}
                  onClick={() => setOpenCourseId(c.id)}
                />
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
