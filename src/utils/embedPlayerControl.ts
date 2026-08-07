// Control de velocidad 0,5×/1× sobre el iframe de vídeo embebido (Academia,
// F3.11 módulo 10 — "mismo patrón que la ficha de ejercicio", que en F3.10
// se dejó fuera de alcance porque esa ficha de atleta todavía no existe;
// esta es la primera pantalla real que la usa).
//
// Deliberadamente NO intenta detectar el fin del vídeo ("se marca vista
// sola, sin botón de confirmar" del handoff): el protocolo postMessage de
// YouTube para escuchar cambios de estado sin cargar su script de la IFrame
// API es un formato no documentado, y no hay forma de probarlo contra un
// vídeo real en este entorno (sin credenciales de atleta, sin lecciones con
// vídeo verificables). El botón manual "Marcar como completada" se queda
// como la ruta garantizada — ver README F3.11 en el commit.
//
// El comando de velocidad SÍ está documentado por ambos proveedores y es
// "fire and forget": si el iframe no responde (bloqueado, sin red), no pasa
// nada visible — el vídeo sigue a 1× normal.

export type EmbedProvider = 'youtube' | 'vimeo';

// `Exercise.videoUrl` (a diferencia de `AcademyLesson`) guarda la URL cruda que
// pegó el coach — "URL de vídeo YouTube" en el formulario, sin provider/id
// separados — así que hace falta extraerlos antes de poder embeber con
// control de velocidad. Cubre los formatos que de verdad se pegan: watch?v=,
// youtu.be/ y shorts/ de YouTube, y vimeo.com/ID.
export function parseVideoUrl(url: string): { provider: EmbedProvider; id: string } | null {
  const trimmed = url.trim();
  const yt = trimmed.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{6,})/);
  if (yt) return { provider: 'youtube', id: yt[1] };
  const vimeo = trimmed.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return { provider: 'vimeo', id: vimeo[1] };
  return null;
}

export function embedSrcWithApi(provider: EmbedProvider, id: string): string {
  return provider === 'youtube'
    ? `https://www.youtube.com/embed/${id}?enablejsapi=1&playsinline=1`
    : `https://player.vimeo.com/video/${id}?api=1`;
}

export function setEmbedPlaybackRate(iframe: HTMLIFrameElement | null, provider: EmbedProvider, rate: number): void {
  if (!iframe?.contentWindow) return;
  try {
    const message = provider === 'youtube'
      ? { event: 'command', func: 'setPlaybackRate', args: [rate] }
      : { method: 'setPlaybackRate', value: rate };
    iframe.contentWindow.postMessage(JSON.stringify(message), '*');
  } catch {
    // best-effort: el vídeo se queda a velocidad normal si el mensaje falla
  }
}
