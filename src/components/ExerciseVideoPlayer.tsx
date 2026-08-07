import React, { useRef, useState } from 'react';
import { embedSrcWithApi, setEmbedPlaybackRate, parseVideoUrl } from '../utils/embedPlayerControl';
import { SegmentedControl } from './ui';

interface Props {
  videoUrl: string;
}

/**
 * Vídeo demo embebido dentro de la sesión, con el mismo control 0,5×/1× que
 * `academy/LessonPlayer.tsx` (F3.11) — el tutorial (paso "biblioteca",
 * `steps.ts`) ya le dice al atleta "aquí tienes el vídeo a 0,5× o a velocidad
 * normal" apuntando a esta tarjeta, pero hasta ahora solo había una miniatura
 * estática. `Exercise.videoUrl` guarda la URL cruda (no provider/id
 * separados como Academia), de ahí `parseVideoUrl`.
 */
export default function ExerciseVideoPlayer({ videoUrl }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [speed, setSpeed] = useState('1');
  const parsed = parseVideoUrl(videoUrl);
  if (!parsed) return null;

  function changeSpeed(value: string) {
    setSpeed(value);
    setEmbedPlaybackRate(iframeRef.current, parsed!.provider, value === '0.5' ? 0.5 : 1);
  }

  return (
    <div className="p-4 bg-bg border-t border-hairline space-y-3">
      <div className="aspect-video w-full rounded-surface overflow-hidden bg-black">
        <iframe
          ref={iframeRef}
          src={embedSrcWithApi(parsed.provider, parsed.id)}
          title="Vídeo demostrativo del ejercicio"
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
    </div>
  );
}
