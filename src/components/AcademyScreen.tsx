import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserProfile, AcademyCourse, AcademyLesson, AcademyCategory } from '../types';
import { getAllCourses, getAllLessons, getAcademyProgress, markLessonComplete, getAcademyAccess } from '../dbService';
import { evaluateUnlockRule } from '../utils/academyUnlock';
import { grantXp } from '../utils/xp';
import { addRoadmapMilestone } from '../utils/roadmapMilestones';
import LessonPlayer from './academy/LessonPlayer';
import { Skeleton } from './ui';
import { Icon, Button, EmptyState, PageHeader, ListRow, ProgressBar } from './ui';

interface Props {
  profile: UserProfile;
}

const CATEGORY_LABEL: Record<AcademyCategory, string> = {
  entrenamiento: 'Entrenamiento', nutricion: 'Nutrición', fisiologia: 'Fisiología',
  biomecanica: 'Biomecánica', mentalidad: 'Mentalidad', recuperacion: 'Recuperación',
};

const XP_PER_LESSON = 20;

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
    return <EmptyState icon="lock" title="Academia aún no disponible" description="Tu entrenador todavía no te ha dado acceso a TrainingLab." />;
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
    const alreadyDone = !!progressSafe.completed[lesson.id];
    const courseLessonIds = courseLessons.map(l => l.id);
    const updated = await markLessonComplete(profile.email, lesson.id, openCourse.id, courseLessonIds);
    queryClient.setQueryData(['academyProgress', profile.email], updated);
    if (!alreadyDone) {
      await grantXp(profile, XP_PER_LESSON);
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    }
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
        <Button variant="ghost" size="s" onClick={() => setOpenCourseId(null)} icon="arrow_back">Academia</Button>
        <div>
          <span className="text-caption font-sans uppercase text-data">{CATEGORY_LABEL[openCourse.category]}</span>
          <h2 className="font-sans font-bold text-title-l text-white">{openCourse.title}</h2>
          <p className="text-label text-ink-2 font-sans mt-1">{openCourse.description}</p>
        </div>
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
                leading={<Icon name={!unlocked ? 'lock' : done ? 'check_circle' : 'play_circle'} size="l" className={done ? 'text-accent' : 'text-ink-2'} />}
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

  return (
    <div className="space-y-6">
      <PageHeader title="TrainingLab" subtitle="Academia de formación — entrenamiento, nutrición y más" />

      {publishedCourses.length === 0 && (
        <p className="text-label text-ink-3 font-sans py-6 text-center">Todavía no hay cursos publicados.</p>
      )}

      {(Object.keys(byCategory) as AcademyCategory[]).map(cat => (
        <div key={cat} className="space-y-2">
          <h3 className="text-caption font-sans uppercase text-data tracking-wider">{CATEGORY_LABEL[cat]}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {byCategory[cat].map(c => {
              const { unlocked, reason } = evaluateUnlockRule(c.unlockRule, { profile, progress: progressSafe }, courseTitleById);
              const pct = progressSafe.courseProgress[c.id] ?? 0;
              return (
                <button
                  key={c.id}
                  onClick={() => unlocked && setOpenCourseId(c.id)}
                  disabled={!unlocked}
                  className={`text-left bg-surface border border-hairline rounded-control p-4 transition-all ${unlocked ? 'hover:border-accent/40' : 'opacity-50'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-sans font-bold text-body-s text-white">{c.title}</p>
                    {!unlocked && <Icon name="lock" size="m" className="text-ink-3 flex-shrink-0" />}
                  </div>
                  <p className="text-label text-ink-2 font-sans mt-1 line-clamp-2">{c.description}</p>
                  {unlocked ? (
                    <ProgressBar value={pct} label={`Progreso de ${c.title}, ${pct}%`} className="mt-3" />
                  ) : (
                    <p className="text-caption text-ink-3 font-mono mt-3">{reason}</p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
