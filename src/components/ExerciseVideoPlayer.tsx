import React, { useRef, useState } from 'react';
import { embedSrcWithApi, setEmbedPlaybackRate, parseVideoUrl } from '../utils/embedPlayerControl';
import { SegmentedControl } from './ui';

interface Props {
  videoUrl: string;
}

/**
 * Vídeo demo embebido dentro de la sesión, con control 1×/2× que arranca en
 * 2× — un ejercicio se reconoce rápido a doble velocidad, y quien necesite
 * verlo con calma baja a 1× (antes era 0,5×/1×, F3.11; cambiado a petición
 * de Dani el 14-08). `Exercise.videoUrl` guarda la URL cruda (no provider/id
 * separados como Academia), de ahí `parseVideoUrl`.
 *
 * 14-08 (tarea 17, ampliación del catálogo). `parseVideoUrl` solo reconoce
 * YouTube/Vimeo — hasta ahora los únicos vídeos que existían de verdad. Con
 * los 1.681 de Firebase Storage (mp4 directo, sin proveedor) esta pantalla
 * se quedaba con el botón «Vídeo» sin hacer nada al pulsarlo: el componente
 * devolvía `null` porque `parsed` era `null`. El `<video>` nativo de abajo
 * es el fallback: mismo control de velocidad, pero de verdad — `.playbackRate`
 * del elemento es una API síncrona del navegador, no el postMessage
 * "fire and forget" que hace falta para un iframe ajeno.
 */
export default function ExerciseVideoPlayer({ videoUrl }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [speed, setSpeed] = useState('2');
  const parsed = parseVideoUrl(videoUrl);

  function tasa(value: string) {
    return value === '1' ? 1 : 2;
  }

  function changeSpeed(value: string) {
    setSpeed(value);
    const rate = tasa(value);
    if (parsed) {
      setEmbedPlaybackRate(iframeRef.current, parsed.provider, rate);
    } else if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  }

  return (
    <div className="p-4 bg-bg border-t border-hairline space-y-3">
      <div className="aspect-video w-full rounded-surface overflow-hidden bg-black">
        {parsed ? (
          <iframe
            ref={iframeRef}
            src={embedSrcWithApi(parsed.provider, parsed.id)}
            title="Vídeo demostrativo del ejercicio"
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            // El postMessage de velocidad solo llega si el player ya está listo
            // — mandarlo antes de onLoad no hace nada. Con esto arranca en 2×
            // en vez de necesitar que la persona toque el control primero.
            onLoad={() => setEmbedPlaybackRate(iframeRef.current, parsed.provider, tasa(speed))}
          />
        ) : (
          <video
            // Ref-callback, no onLoadedMetadata: con un vídeo pequeño/cacheado
            // el evento puede disparar antes de que React llegue a engancharlo
            // en el mismo commit — se veía en local (playbackRate se quedaba en
            // 1 aunque el control mostrara «2×» seleccionado). Fijar la tasa en
            // cuanto el nodo existe no tiene esa carrera: el valor se conserva
            // aunque los metadatos aún no hayan cargado.
            ref={el => { videoRef.current = el; if (el) el.playbackRate = tasa(speed); }}
            src={videoUrl}
            controls
            playsInline
            className="w-full h-full"
            title="Vídeo demostrativo del ejercicio"
            onLoadedMetadata={() => { if (videoRef.current) videoRef.current.playbackRate = tasa(speed); }}
          />
        )}
      </div>
      <SegmentedControl
        options={[{ value: '1', label: '1×' }, { value: '2', label: '2×' }]}
        value={speed}
        onChange={changeSpeed}
        label="Velocidad de reproducción"
        className="max-w-[160px]"
      />
    </div>
  );
}
