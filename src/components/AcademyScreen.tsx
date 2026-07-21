import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserProfile, AcademyCourse, AcademyLesson, AcademyCategory } from '../types';
import { getAllCourses, getAllLessons, getAcademyProgress, markLessonComplete, getAcademyAccess } from '../dbService';
import { evaluateUnlockRule } from '../utils/academyUnlock';
import { grantXp } from '../utils/xp';
import Skeleton from './Skeleton';

interface Props {
  profile: UserProfile;
}

const CATEGORY_LABEL: Record<AcademyCategory, string> = {
  entrenamiento: 'Entrenamiento', nutricion: 'Nutrición', fisiologia: 'Fisiología',
  biomecanica: 'Biomecánica', mentalidad: 'Mentalidad', recuperacion: 'Recuperación',
};

const XP_PER_LESSON = 20;

function embedUrl(l: AcademyLesson): string {
  return l.videoProvider === 'youtube'
    ? `https://www.youtube.com/embed/${l.videoId}`
    : `https://player.vimeo.com/video/${l.videoId}`;
}

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
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    );
  }

  if (!access?.enabled) {
    return (
      <div className="flex flex-col items-center justify-center text-center gap-3 py-20">
        <span className="material-symbols-outlined text-5xl text-[#555]">lock</span>
        <p className="font-sans font-bold text-white">Academia aún no disponible</p>
        <p className="text-xs text-[#c6c9ab] font-mono max-w-xs">Tu entrenador todavía no te ha dado acceso a TrainingLab.</p>
      </div>
    );
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
  };

  // ── DETALLE DE LECCIÓN ──────────────────────────────────────────────────
  if (openLesson && openCourse) {
    const done = !!progressSafe.completed[openLesson.id];
    return (
      <div className="space-y-4">
        <button onClick={() => setOpenLessonId(null)} className="flex items-center gap-1 text-xs font-mono text-[#c6c9ab] hover:text-white transition-colors">
          <span className="material-symbols-outlined text-base">arrow_back</span> {openCourse.title}
        </button>
        <div className="aspect-video w-full rounded-xl overflow-hidden bg-black">
          <iframe
            src={embedUrl(openLesson)}
            title={openLesson.title}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
        <div>
          <h2 className="font-sans font-bold text-lg text-white">{openLesson.title}</h2>
          {openLesson.description && <p className="text-xs text-[#c6c9ab] font-mono mt-1">{openLesson.description}</p>}
        </div>
        {openLesson.resources && openLesson.resources.length > 0 && (
          <div className="space-y-1.5">
            {openLesson.resources.map((r, i) => (
              <a key={i} href={r.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs font-mono text-[#00eefc] hover:underline">
                <span className="material-symbols-outlined text-sm">{r.kind === 'pdf' ? 'picture_as_pdf' : 'link'}</span>
                {r.title}
              </a>
            ))}
          </div>
        )}
        <button
          onClick={() => handleCompleteLesson(openLesson)}
          disabled={done}
          className={`w-full py-3 rounded-lg font-sans font-bold text-xs uppercase transition-all ${done ? 'bg-white/7 text-[#c6c9ab]' : 'bg-[#fbcb1a] text-black hover:bg-[#d4a800] active:scale-95'}`}
        >
          {done ? 'Lección completada ✓' : 'Marcar como completada (+20 XP)'}
        </button>
      </div>
    );
  }

  // ── DETALLE DE CURSO (lista de lecciones) ───────────────────────────────
  if (openCourse) {
    return (
      <div className="space-y-4">
        <button onClick={() => setOpenCourseId(null)} className="flex items-center gap-1 text-xs font-mono text-[#c6c9ab] hover:text-white transition-colors">
          <span className="material-symbols-outlined text-base">arrow_back</span> Academia
        </button>
        <div>
          <span className="text-[10px] font-mono uppercase text-[#00eefc]">{CATEGORY_LABEL[openCourse.category]}</span>
          <h2 className="font-sans font-black text-2xl text-white">{openCourse.title}</h2>
          <p className="text-xs text-[#c6c9ab] font-mono mt-1">{openCourse.description}</p>
        </div>
        <div className="space-y-2">
          {courseLessons.map((l, i) => {
            const done = !!progressSafe.completed[l.id];
            const rule = l.unlockRule ?? openCourse.unlockRule;
            const { unlocked, reason } = evaluateUnlockRule(rule, { profile, progress: progressSafe }, courseTitleById);
            return (
              <button
                key={l.id}
                onClick={() => unlocked && setOpenLessonId(l.id)}
                disabled={!unlocked}
                className={`w-full flex items-center gap-3 bg-[#181816] border border-white/7 rounded-xl p-3 text-left transition-colors ${unlocked ? 'hover:border-[#fbcb1a]/40' : 'opacity-50'}`}
              >
                <span className={`material-symbols-outlined ${done ? 'text-[#fbcb1a]' : 'text-[#c6c9ab]'}`}>
                  {!unlocked ? 'lock' : done ? 'check_circle' : 'play_circle'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-sans font-semibold text-sm text-white truncate">{i + 1}. {l.title}</p>
                  {!unlocked && reason && <p className="text-[10px] text-[#888] font-mono">{reason}</p>}
                </div>
              </button>
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
      <header>
        <h1 className="font-sans font-black text-3xl tracking-tight text-white uppercase">TrainingLab</h1>
        <p className="text-xs text-[#c6c9ab] font-mono mt-1">Academia de formación — entrenamiento, nutrición y más</p>
      </header>

      {publishedCourses.length === 0 && (
        <p className="text-xs text-[#555] font-mono py-6 text-center">Todavía no hay cursos publicados.</p>
      )}

      {(Object.keys(byCategory) as AcademyCategory[]).map(cat => (
        <div key={cat} className="space-y-2">
          <h3 className="text-[10px] font-mono uppercase text-[#00eefc] tracking-wider">{CATEGORY_LABEL[cat]}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {byCategory[cat].map(c => {
              const { unlocked, reason } = evaluateUnlockRule(c.unlockRule, { profile, progress: progressSafe }, courseTitleById);
              const pct = progressSafe.courseProgress[c.id] ?? 0;
              return (
                <button
                  key={c.id}
                  onClick={() => unlocked && setOpenCourseId(c.id)}
                  disabled={!unlocked}
                  className={`text-left bg-[#181816] border border-white/7 rounded-2xl p-4 transition-all ${unlocked ? 'hover:border-[#fbcb1a]/40' : 'opacity-50'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-sans font-bold text-sm text-white">{c.title}</p>
                    {!unlocked && <span className="material-symbols-outlined text-[#888] text-base flex-shrink-0">lock</span>}
                  </div>
                  <p className="text-xs text-[#c6c9ab] font-mono mt-1 line-clamp-2">{c.description}</p>
                  {unlocked ? (
                    <div className="mt-3 h-1.5 bg-white/7 rounded-full overflow-hidden">
                      <div className="h-full bg-[#fbcb1a]" style={{ width: `${pct}%` }} />
                    </div>
                  ) : (
                    <p className="text-[10px] text-[#888] font-mono mt-3">{reason}</p>
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
