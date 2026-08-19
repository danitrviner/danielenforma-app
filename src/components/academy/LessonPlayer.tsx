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
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  lesson: AcademyLesson;
  course: AcademyCourse;
  courseLessons: AcademyLesson[];
  done: boolean;
  nextLesson?: AcademyLesson;
  onBack: () => void;
  onComplete: () => void;
  onOpenLesson: (id: string) => void;
}

export default function LessonPlayer({ lesson, course, courseLessons, done, nextLesson, onBack, onComplete, onOpenLesson }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [speed, setSpeed] = useState('1');

  function changeSpeed(value: string) {
    setSpeed(value);
    setEmbedPlaybackRate(iframeRef.current, lesson.videoProvider, value === '0.5' ? 0.5 : 1);
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="s" onClick={onBack} icon="arrow_back">{course.title}</Button>

      <div className="aspect-video w-full rounded-surface overflow-hidden bg-black">
        <iframe
          ref={iframeRef}
          src={embedSrcWithApi(lesson.videoProvider, lesson.videoId)}
          title={lesson.title}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>

      <SegmentedControl
        options={[{ value: '0.5', label: '0,5×' }, { value: '1', label: '1×' }]}
        value={speed}
        onChange={changeSpeed}
        label="Velocidad de reproducción"
        className="max-w-[160px]"
      />

      <div>
        <h2 className="font-sans font-bold text-title-m text-white">{lesson.title}</h2>
        {lesson.description && <p className="text-label text-ink-2 font-sans mt-1">{lesson.description}</p>}
      </div>

      {lesson.resources && lesson.resources.length > 0 && (
        <div className="space-y-2">
          {lesson.resources.map((r, i) => (
            <a key={i} href={r.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-label font-mono text-data hover:underline">
              <Icon name={r.kind === 'pdf' ? 'picture_as_pdf' : 'link'} size="s" />
              {r.title}
            </a>
          ))}
        </div>
      )}

      {/* "En este módulo" — siempre visible debajo del vídeo. */}
      <div className="space-y-2">
        <p className="text-caption font-mono uppercase text-ink-2">En este módulo</p>
        {courseLessons.map((l, i) => (
          <button
            key={l.id}
            onClick={() => onOpenLesson(l.id)}
            className={`w-full flex items-center gap-3 rounded-control border p-3 text-left transition-colors ${
              l.id === lesson.id ? 'bg-accent/10 border-accent-line' : 'bg-surface border-hairline hover:border-strong'
            }`}
          >
            <Icon name={l.id === lesson.id ? 'play_circle' : 'circle'} size="s" className={l.id === lesson.id ? 'text-accent' : 'text-ink-3'} />
            <span className="flex-1 min-w-0 truncate font-sans text-body-s text-ink">{i + 1}. {l.title}</span>
          </button>
        ))}
      </div>

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
