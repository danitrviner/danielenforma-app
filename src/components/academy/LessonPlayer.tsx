import React, { useRef, useState } from 'react';
import { AcademyCourse, AcademyLesson } from '../../types';
import { embedSrcWithApi, setEmbedPlaybackRate } from '../../utils/embedPlayerControl';
import { Icon, Button, SegmentedControl } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   LessonPlayer (F3.11, módulo 10 — reproductor de lección)

   Control 0,5×/1× sobre el vídeo (mismo patrón previsto para la ficha de
   ejercicio, F3.10, que quedó fuera de alcance porque esa pantalla de
   atleta todavía no existe). "En este módulo" siempre visible debajo del
   vídeo, con la lección actual resaltada.

   El handoff pide "al terminar se marca vista sola, sin botón de
   confirmar" — no se implementa: detectar el fin de un vídeo de YouTube/
   Vimeo sin cargar su script de la IFrame API completa depende de un
   protocolo postMessage no documentado que no hay forma de verificar
   contra un vídeo real en este entorno. El botón "Marcar como completada"
   se queda como la única vía, garantizada. Una vez completada, el primario
   pasa a "Siguiente lección" — esa parte del handoff sí se cumple.

   Auditoría visual vs. `Academia - Experiencia.dc.html`: control de
   velocidad pasa a flotar sobre el vídeo (mismo sitio que la maqueta),
   título sube a `text-headline`, y "En este módulo" gana minutos + estado
   completada por lección (antes solo sabía cuál era "la actual" — ahora
   recibe `completedLessonIds` del padre, que sí tiene el progreso de todo
   el curso). Al completar, gana la franja de progreso del curso y una
   tarjeta de vista previa de la siguiente lección, no solo el botón.

   Fuera de alcance a propósito: la maqueta pide una pestaña "Puntos clave"
   con 3-5 frases por lección — no hay ningún campo de datos para eso en
   `AcademyLesson` (solo `description`), así que inventarlo sería product,
   no reskin. Tampoco se sustituye el vídeo por la celebración a pantalla
   completa del panel 02 al completar — perdería la posibilidad de volver a
   verlo, que no hay razón de producto para quitar.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  lesson: AcademyLesson;
  course: AcademyCourse;
  courseLessons: AcademyLesson[];
  done: boolean;
  completedLessonIds: Set<string>;
  nextLesson?: AcademyLesson;
  onBack: () => void;
  onComplete: () => void;
  onOpenLesson: (id: string) => void;
}

function minLabel(durationSec?: number): string | null {
  return durationSec ? `${Math.round(durationSec / 60)} min` : null;
}

export default function LessonPlayer({ lesson, course, courseLessons, done, completedLessonIds, nextLesson, onBack, onComplete, onOpenLesson }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [speed, setSpeed] = useState('1');

  function changeSpeed(value: string) {
    setSpeed(value);
    setEmbedPlaybackRate(iframeRef.current, lesson.videoProvider, value === '0.5' ? 0.5 : 1);
  }

  const lessonIndex = courseLessons.findIndex(l => l.id === lesson.id);
  const doneCount = courseLessons.filter(l => completedLessonIds.has(l.id)).length;
  const coursePct = courseLessons.length > 0 ? Math.round((doneCount / courseLessons.length) * 100) : 0;

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="s" onClick={onBack} icon="arrow_back">{course.title}</Button>

      <div className="relative aspect-video w-full rounded-surface overflow-hidden bg-black">
        <iframe
          ref={iframeRef}
          src={embedSrcWithApi(lesson.videoProvider, lesson.videoId)}
          title={lesson.title}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-end bg-gradient-to-t from-black/70 to-transparent p-3">
          <div className="pointer-events-auto">
            <SegmentedControl
              options={[{ value: '0.5', label: '0,5×' }, { value: '1', label: '1×' }]}
              value={speed}
              onChange={changeSpeed}
              label="Velocidad de reproducción"
            />
          </div>
        </div>
      </div>

      <div>
        {lessonIndex >= 0 && (
          <span className="inline-block rounded-control bg-accent/14 px-2.5 py-1 font-mono text-caption font-bold uppercase tracking-wider text-accent">
            Módulo {course.order + 1} · {course.title}
          </span>
        )}
        <h2 className="font-display text-headline font-black uppercase text-ink mt-3">{lesson.title}</h2>
        {lessonIndex >= 0 && (
          <p className="font-mono text-caption text-ink-2 mt-2">
            Lección {lessonIndex + 1} de {courseLessons.length}{minLabel(lesson.durationSec) && ` · ${minLabel(lesson.durationSec)}`}
          </p>
        )}
        {lesson.description && <p className="text-body-s text-ink-2 font-sans mt-3 leading-relaxed">{lesson.description}</p>}
      </div>

      {lesson.resources && lesson.resources.length > 0 && (
        <div className="space-y-2">
          <p className="text-caption font-mono uppercase text-ink-2">Descargable{lesson.resources.length > 1 ? 's' : ''}</p>
          {lesson.resources.map((r, i) => (
            <a
              key={i}
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-field border border-hairline bg-raised p-3.5 transition-colors hover:border-strong"
            >
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-control bg-white/6">
                <Icon name={r.kind === 'pdf' ? 'picture_as_pdf' : 'link'} size="m" className="text-ink" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-sans text-body-s font-bold text-ink">{r.title}</span>
                <span className="font-mono text-caption text-ink-2 uppercase">{r.kind === 'pdf' ? 'PDF' : 'Enlace'}</span>
              </span>
              <Icon name="download" size="m" className="text-accent shrink-0" />
            </a>
          ))}
        </div>
      )}

      {/* "En este módulo" — siempre visible debajo del vídeo. */}
      <div className="space-y-2">
        <p className="text-caption font-mono uppercase text-ink-2">En este módulo</p>
        {courseLessons.map((l, i) => {
          const isCurrent = l.id === lesson.id;
          const isDone = completedLessonIds.has(l.id);
          return (
            <button
              key={l.id}
              onClick={() => onOpenLesson(l.id)}
              className={`w-full flex items-center gap-3 rounded-control border p-3 text-left transition-colors ${
                isCurrent ? 'bg-accent/10 border-accent-line' : 'bg-surface border-hairline hover:border-strong'
              }`}
            >
              <Icon
                name={isCurrent ? 'play_circle' : isDone ? 'check_circle' : 'circle'}
                size="s"
                className={isCurrent || isDone ? 'text-accent' : 'text-ink-3'}
              />
              <span className="flex-1 min-w-0 truncate font-sans text-body-s text-ink">{i + 1}. {l.title}</span>
              <span className={`font-mono text-caption shrink-0 ${isCurrent ? 'text-accent' : 'text-ink-3'}`}>
                {isCurrent ? 'Ahora' : minLabel(l.durationSec)}
              </span>
            </button>
          );
        })}
      </div>

      {done && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-caption uppercase tracking-wider text-ink-2">Progreso del módulo</span>
            <span className="font-mono text-caption font-bold text-accent">{doneCount}/{courseLessons.length}</span>
          </div>
          <div className="h-[5px] rounded-full bg-track overflow-hidden">
            <div className="h-full rounded-full bg-accent" style={{ width: `${coursePct}%` }} />
          </div>
          {nextLesson && (
            <button
              onClick={() => onOpenLesson(nextLesson.id)}
              className="w-full flex items-center gap-3 rounded-field border border-hairline bg-surface p-4 text-left transition-colors hover:border-accent-line"
            >
              <span className="flex h-11 w-11 flex-none items-center justify-center rounded-control bg-raised">
                <Icon name="play_arrow" size="l" className="text-accent" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-caption uppercase tracking-wider text-ink-2">Siguiente lección</span>
                <span className="block truncate font-sans text-body font-bold text-ink mt-0.5">{nextLesson.title}</span>
              </span>
              <Icon name="chevron_right" size="m" className="text-ink-3 shrink-0" />
            </button>
          )}
        </div>
      )}

      {done ? (
        nextLesson ? (
          <Button onClick={() => onOpenLesson(nextLesson.id)} fullWidth size="l" iconTrailing="arrow_forward">Siguiente lección</Button>
        ) : (
          <Button onClick={onBack} fullWidth size="l">Volver al curso</Button>
        )
      ) : (
        <Button onClick={onComplete} fullWidth size="l">Marcar como completada (+20 XP)</Button>
      )}
    </div>
  );
}
