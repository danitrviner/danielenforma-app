import React, { useRef, useState, useEffect, useCallback } from 'react';

interface Props {
  note: string;
  videoUrl?: string;            // existing saved URL
  onNoteChange: (note: string) => void;
  onVideoPending: (blob: Blob | null) => void;   // null = no pending video
  onRemoveVideo: (remove: boolean) => void;      // true = delete existing URL on save
}

type VideoTab = 'upload' | 'record';

export default function CoachNoteEditor({
  note, videoUrl, onNoteChange, onVideoPending, onRemoveVideo,
}: Props) {
  const [videoTab, setVideoTab] = useState<VideoTab>('upload');
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);
  const [pendingUrl, setPendingUrl]   = useState<string | null>(null);
  const [removed, setRemoved]         = useState(false);

  // Camera / recording
  const [hasStream, setHasStream]   = useState(false);
  const [recording, setRecording]   = useState(false);
  const [camError, setCamError]     = useState<string | null>(null);
  const liveRef    = useRef<HTMLVideoElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const chunksRef   = useRef<Blob[]>([]);

  // Cleanup pending object URL and stream on unmount
  useEffect(() => {
    return () => {
      if (pendingUrl) URL.revokeObjectURL(pendingUrl);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayUrl: string | null = pendingUrl ?? (!removed && videoUrl ? videoUrl : null);

  // ── File upload ────────────────────────────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (pendingUrl) URL.revokeObjectURL(pendingUrl);
    const blob = new Blob([file], { type: file.type });
    const url  = URL.createObjectURL(blob);
    setPendingBlob(blob);
    setPendingUrl(url);
    setRemoved(false);
    onVideoPending(blob);
    onRemoveVideo(false);
    e.target.value = '';
  };

  // ── Camera / MediaRecorder ─────────────────────────────────────────────────

  const startCamera = useCallback(async () => {
    setCamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (liveRef.current) {
        liveRef.current.srcObject = stream;
        liveRef.current.play().catch(() => {});
      }
      setHasStream(true);
    } catch {
      setCamError('No se pudo acceder a la cámara. Comprueba los permisos.');
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setHasStream(false);
    setRecording(false);
  }, []);

  const startRecording = useCallback(() => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9' : 'video/webm';
    const recorder = new MediaRecorder(streamRef.current, { mimeType });
    recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const url  = URL.createObjectURL(blob);
      if (pendingUrl) URL.revokeObjectURL(pendingUrl);
      setPendingBlob(blob);
      setPendingUrl(url);
      setRemoved(false);
      onVideoPending(blob);
      onRemoveVideo(false);
      stopCamera();
    };
    recorder.start();
    recorderRef.current = recorder;
    setRecording(true);
  }, [pendingUrl, onVideoPending, onRemoveVideo, stopCamera]);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    setRecording(false);
  }, []);

  // ── Remove / clear ─────────────────────────────────────────────────────────

  const clearVideo = () => {
    if (pendingUrl) {
      URL.revokeObjectURL(pendingUrl);
      setPendingBlob(null);
      setPendingUrl(null);
      onVideoPending(null);
      // If there was an existing URL behind the pending one, restore it
      if (!videoUrl || removed) {
        onRemoveVideo(removed);
      }
    } else if (videoUrl && !removed) {
      setRemoved(true);
      onRemoveVideo(true);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* Text note */}
      <div>
        <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase mb-1.5">
          Nota del coach
        </label>
        <textarea
          value={note}
          onChange={e => onNoteChange(e.target.value)}
          rows={3}
          placeholder="Indicaciones para el atleta: objetivos, recomendaciones, contexto…"
          className="w-full bg-[#0e0e0e] border border-[#2a2a2a] rounded-lg px-3 py-3 text-sm text-white placeholder:text-[#444] focus:outline-none focus:ring-1 focus:ring-[#e2ff00] resize-none"
        />
      </div>

      {/* Video section */}
      <div>
        <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase mb-2">
          Vídeo-nota
        </label>

        {/* Tab switcher */}
        <div className="flex gap-1 bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl p-1 mb-3">
          {(['upload', 'record'] as VideoTab[]).map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => { setVideoTab(tab); stopCamera(); setCamError(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg font-mono text-[10px] font-bold uppercase tracking-wide transition-all active:scale-95 ${
                videoTab === tab
                  ? 'bg-[#e2ff00] text-black shadow-sm'
                  : 'text-[#555] hover:text-[#c6c9ab]'
              }`}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>
                {tab === 'upload' ? 'upload_file' : 'videocam'}
              </span>
              {tab === 'upload' ? 'Subir archivo' : 'Grabar'}
            </button>
          ))}
        </div>

        {/* Upload tab */}
        {videoTab === 'upload' && !displayUrl && (
          <label className="flex items-center gap-3 px-4 py-4 bg-[#0e0e0e] border border-dashed border-[#2a2a2a] hover:border-[#e2ff00]/40 rounded-xl cursor-pointer transition-colors group">
            <span className="material-symbols-outlined text-[#555] group-hover:text-[#e2ff00] transition-colors" style={{ fontSize: '22px' }}>
              movie
            </span>
            <div className="flex-1 min-w-0">
              <span className="block font-mono text-[10px] text-[#c6c9ab] uppercase">Seleccionar vídeo</span>
              <span className="block font-mono text-[9px] text-[#444] mt-0.5">MP4 · MOV · WebM — máx. 100 MB</span>
            </div>
            <input type="file" accept="video/*" onChange={handleFileChange} className="sr-only" />
          </label>
        )}

        {/* Record tab – no stream yet */}
        {videoTab === 'record' && !hasStream && !displayUrl && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={startCamera}
              className="w-full flex items-center justify-center gap-2 py-4 bg-[#0e0e0e] border border-dashed border-[#2a2a2a] hover:border-[#e2ff00]/40 rounded-xl font-mono text-[10px] text-[#555] hover:text-[#e2ff00] transition-all"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>videocam</span>
              Activar cámara
            </button>
            {camError && (
              <p className="font-mono text-[9px] text-red-400">{camError}</p>
            )}
          </div>
        )}

        {/* Live camera view */}
        {hasStream && (
          <div className="space-y-2">
            <div
              className="relative w-full bg-black rounded-xl overflow-hidden"
              style={{ aspectRatio: '16/9' }}
            >
              <video ref={liveRef} muted playsInline className="w-full h-full object-cover" />
              {recording && (
                <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-red-500/90 text-white rounded-full px-2.5 py-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse block" />
                  <span className="font-mono text-[9px] font-bold">REC</span>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              {!recording ? (
                <button
                  type="button"
                  onClick={startRecording}
                  className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white font-mono font-bold text-xs uppercase rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-all"
                >
                  <span className="material-symbols-outlined text-sm">fiber_manual_record</span>
                  Grabar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="flex-1 py-2.5 bg-[#e2ff00] text-black font-mono font-bold text-xs uppercase rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-all"
                >
                  <span className="material-symbols-outlined text-sm">stop</span>
                  Detener y guardar
                </button>
              )}
              <button
                type="button"
                onClick={stopCamera}
                className="px-4 py-2.5 border border-[#2a2a2a] text-[#555] hover:text-white font-mono text-xs uppercase rounded-xl transition-all"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Video preview (pending or existing) */}
        {displayUrl && !hasStream && (
          <div className="space-y-2">
            <div
              className="relative w-full bg-black rounded-xl overflow-hidden"
              style={{ aspectRatio: '16/9' }}
            >
              <video
                src={displayUrl}
                controls
                playsInline
                className="w-full h-full"
              />
              {pendingBlob && (
                <div className="absolute top-2 right-2 bg-[#e2ff00] text-black text-[8px] font-mono font-bold px-2 py-0.5 rounded-full">
                  Pendiente de guardar
                </div>
              )}
            </div>
            <div className="flex gap-2">
              {videoTab === 'upload' && (
                <label className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-[#2a2a2a] text-[#555] hover:text-white font-mono text-xs uppercase rounded-xl cursor-pointer transition-all">
                  <span className="material-symbols-outlined text-sm">swap_horiz</span>
                  Reemplazar
                  <input type="file" accept="video/*" onChange={handleFileChange} className="sr-only" />
                </label>
              )}
              <button
                type="button"
                onClick={clearVideo}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-red-500/30 text-red-400 hover:text-red-300 font-mono text-xs uppercase rounded-xl transition-all"
              >
                <span className="material-symbols-outlined text-sm">delete</span>
                {pendingBlob ? 'Descartar' : 'Quitar vídeo'}
              </button>
            </div>
          </div>
        )}

        {/* Removed notice */}
        {removed && !pendingUrl && (
          <p className="font-mono text-[9px] text-[#555] mt-2 italic">
            El vídeo actual se eliminará al guardar la dieta.
          </p>
        )}
      </div>
    </div>
  );
}
