import React, { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserProfile, ProgressPhoto, PhotoView } from '../types';
import { getProgressPhotos, uploadProgressPhoto, deleteProgressPhoto } from '../dbService';
import { useToast } from '../hooks/useToast';
import Coachmark from './Coachmark';
import PhotoCompareCurtain from './progress/PhotoCompareCurtain';
import { Skeleton } from './ui';
import { Icon, Badge, EmptyState } from './ui';

const VIEWS: PhotoView[] = ['front', 'side', 'back'];

const VIEW_LABELS: Record<PhotoView, string> = {
  front: 'Frente',
  side: 'Lateral',
  back: 'Espalda',
};

// Iconos de silueta por ángulo (handoff §7). "accessibility" a secas no es un
// nombre real de Material Symbols —Google lo descarta al generar el
// subconjunto (`npm run iconos:generar`) y el navegador cae al texto de la
// ligadura sin avisar— así que "Espalda" usa `directions_run`, ya en el
// subconjunto, en vez de repetir ese fallo.
const VIEW_ICONS: Record<PhotoView, string> = {
  front: 'accessibility_new',
  side: 'directions_walk',
  back: 'directions_run',
};

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function fmtDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

function fmtDateLong(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
}

interface Props {
  profile: UserProfile;
}

export default function PhotosScreen({ profile }: Props) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const photosKey = ['progressPhotos', profile.email] as const;
  // 05-11. `isError` importa tanto como `data`: la lectura solo falla cuando no
  // hay ni respuesta del servidor ni copia local en este dispositivo, y en ese
  // caso la pantalla NO puede decir «no tienes fotos» — es justo la frase que
  // hacía creer a un atleta que se habían borrado seis meses de fotos suyas.
  const { data: photos = [], isPending: loading, isError, refetch } = useQuery({
    queryKey: photosKey,
    queryFn: () => getProgressPhotos(profile.email),
  });
  const [uploadingView, setUploadingView] = useState<PhotoView | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState('');
  // Ángulo cuyo histórico está abierto en el panel — null = panel cerrado.
  const [historyView, setHistoryView] = useState<PhotoView | null>(null);
  // Ids seleccionados para comparar dentro del histórico (máx. 2).
  const [compareIds, setCompareIds] = useState<string[]>([]);
  // Una URL de Storage que falla al cargar (permisos, red) no debe dejar el
  // alt-text roto ocupando la fila — se cae al icono placeholder igual que si
  // no hubiera foto.
  const [brokenPhotoIds, setBrokenPhotoIds] = useState<Set<string>>(new Set());
  const fileInputRefs = useRef<Partial<Record<PhotoView, HTMLInputElement | null>>>({});

  // Todas las fotos por ángulo, de la más reciente a la más antigua. El
  // histórico completo vive aquí; la fila solo enseña `[0]` (estado actual).
  const photosByView = useMemo(() => {
    const map: Record<PhotoView, ProgressPhoto[]> = { front: [], side: [], back: [] };
    for (const p of photos) map[p.view].push(p);
    for (const v of VIEWS) map[v].sort((a, b) => b.date.localeCompare(a.date));
    return map;
  }, [photos]);

  const handleFileChange = async (view: PhotoView, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingView(view);
    setUploadError('');
    try {
      const photo = await uploadProgressPhoto(profile.email, todayStr(), view, file);
      queryClient.setQueryData<ProgressPhoto[]>(photosKey, prev => {
        const withoutOld = (prev ?? []).filter(p => !(p.date === photo.date && p.view === photo.view));
        return [...withoutOld, photo];
      });
    } catch (err) {
      console.error('Upload failed:', err);
      setUploadError('No se pudo subir la foto. Verifica tu conexión.');
    } finally {
      setUploadingView(null);
      const input = fileInputRefs.current[view];
      if (input) input.value = '';
    }
  };

  const handleDelete = async (photo: ProgressPhoto) => {
    setDeletingId(photo.id);
    try {
      await deleteProgressPhoto(photo);
      queryClient.setQueryData<ProgressPhoto[]>(photosKey, prev => prev?.filter(p => p.id !== photo.id));
      setCompareIds(prev => prev.filter(id => id !== photo.id));
    } catch (err) {
      console.error('Delete failed:', err);
      showToast('No se pudo eliminar la foto.');
    } finally {
      setDeletingId(null);
    }
  };

  const openHistory = (view: PhotoView) => {
    setCompareIds([]);
    setHistoryView(view);
  };

  const toggleCompare = (id: string) => {
    setCompareIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-[90px] w-full rounded-field" />
        <Skeleton className="h-[90px] w-full rounded-field" />
        <Skeleton className="h-[90px] w-full rounded-field" />
      </div>
    );
  }

  if (isError) {
    // 05-11. Un fallo de lectura NO es una galería vacía. Se dice lo que ha
    // pasado, se deja claro que las fotos siguen ahí, y se ofrece reintentar
    // — que aquí sí sirve, a diferencia del aviso de permisos.
    return (
      <div className="border border-dashed border-hairline rounded-field">
        <EmptyState
          icon="cloud_off"
          title="No hemos podido cargar tus fotos."
          description="Es un problema de conexión, no de tus fotos: siguen guardadas. Inténtalo otra vez en un momento."
          actionLabel="Reintentar"
          onAction={() => { void refetch(); }}
        />
      </div>
    );
  }

  const historyPhotos = historyView ? photosByView[historyView] : [];
  const comparePair = compareIds
    .map(id => historyPhotos.find(p => p.id === id))
    .filter((p): p is ProgressPhoto => !!p)
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-3">
      <Coachmark
        id="photos_upload_hint"
        email={profile.email}
        icon="photo_camera"
        text="Sube una foto por cada ángulo — es la forma más clara de ver tu progreso real, más allá del peso."
      />

      {/* Una fila por ángulo (handoff §7) — miniatura de la última, badge ACTUAL,
          fecha, y acceso al histórico completo. Nada se sobrescribe: cada fecha
          es una foto nueva que se guarda aparte. */}
      <div className="flex flex-col gap-2.5">
        {VIEWS.map(view => {
          const all = photosByView[view];
          const photo = all[0];
          const isUploading = uploadingView === view;
          return (
            <div key={view} className="bg-surface border border-hairline rounded-field p-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() => photo && openHistory(view)}
                disabled={!photo}
                className="w-[50px] h-[66px] rounded-control shrink-0 flex items-center justify-center overflow-hidden disabled:cursor-default"
                style={{ backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,.05) 0 6px, rgba(255,255,255,.015) 6px 12px)' }}
                aria-label={photo ? `Ver histórico de ${VIEW_LABELS[view]}` : undefined}
              >
                {photo && !brokenPhotoIds.has(photo.id) ? (
                  <img
                    src={photo.url}
                    alt={VIEW_LABELS[view]}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover object-top"
                    onError={() => setBrokenPhotoIds(prev => new Set(prev).add(photo.id))}
                  />
                ) : (
                  <Icon name={VIEW_ICONS[view]} size="m" className="text-ink-4" />
                )}
              </button>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-sans font-bold text-body-s text-white">{VIEW_LABELS[view]}</span>
                  {photo && <Badge tone="success">ACTUAL</Badge>}
                </div>
                <p className="font-mono text-caption text-ink-2 mt-1">
                  {photo ? `Actualizada ${fmtDate(photo.date)}` : 'Sin foto todavía'}
                </p>
                {all.length > 1 && (
                  <button
                    type="button"
                    onClick={() => openHistory(view)}
                    className="mt-1 inline-flex items-center gap-1 font-sans text-caption text-accent"
                  >
                    <Icon name="history" size="s" />
                    Ver {all.length} fotos
                  </button>
                )}
              </div>

              <button
                onClick={() => fileInputRefs.current[view]?.click()}
                disabled={isUploading}
                className="w-[34px] h-[34px] rounded-control bg-inset border border-hairline flex items-center justify-center text-accent shrink-0 disabled:opacity-50"
                title="Subir foto"
              >
                <Icon name={isUploading ? 'progress_activity' : 'upload'} size="s" className={isUploading ? 'animate-spin' : ''} />
              </button>
              <input
                ref={el => { fileInputRefs.current[view] = el; }}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => handleFileChange(view, e)}
              />
            </div>
          );
        })}
      </div>

      {uploadError && (
        <p className="font-sans text-label text-danger">{uploadError}</p>
      )}

      {historyView && (
        <div
          className="fixed inset-0 z-50 bg-bg/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setHistoryView(null)}
        >
          <div
            className="bg-surface border border-hairline rounded-t-surface sm:rounded-surface w-full sm:max-w-md max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-hairline">
              <div>
                <p className="font-sans font-bold text-body-s text-white">{VIEW_LABELS[historyView]}</p>
                <p className="font-mono text-caption text-ink-2 mt-0.5">
                  {historyPhotos.length} {historyPhotos.length === 1 ? 'foto guardada' : 'fotos guardadas'}
                </p>
              </div>
              <button
                onClick={() => setHistoryView(null)}
                aria-label="Cerrar"
                className="text-ink-3 hover:text-white -m-1 p-1"
              >
                <Icon name="close" size="m" />
              </button>
            </div>

            {comparePair.length === 2 && (
              <div className="p-4 border-b border-hairline">
                <PhotoCompareCurtain
                  antes={{ url: comparePair[0].url, date: comparePair[0].date }}
                  ahora={{ url: comparePair[1].url, date: comparePair[1].date }}
                  height={320}
                />
                <p className="font-sans text-caption text-ink-2 mt-2 text-center">
                  Arrastra para comparar · toca una foto para cambiar la selección
                </p>
              </div>
            )}

            <div className="overflow-y-auto p-4 space-y-2">
              {historyPhotos.length >= 2 && comparePair.length < 2 && (
                <p className="font-sans text-caption text-ink-2">
                  Toca dos fotos para compararlas lado a lado.
                </p>
              )}
              {historyPhotos.map(p => {
                const selected = compareIds.includes(p.id);
                const isDeleting = deletingId === p.id;
                return (
                  <div
                    key={p.id}
                    className={`flex items-center gap-3 rounded-field border p-2 transition-colors ${selected ? 'border-accent bg-accent/8' : 'border-hairline'}`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleCompare(p.id)}
                      className="w-[46px] h-[60px] rounded-control shrink-0 overflow-hidden bg-inset"
                    >
                      {brokenPhotoIds.has(p.id) ? (
                        <Icon name={VIEW_ICONS[historyView]} size="m" className="text-ink-4" />
                      ) : (
                        <img
                          src={p.url}
                          alt={fmtDate(p.date)}
                          loading="lazy"
                          className="w-full h-full object-cover object-top"
                          onError={() => setBrokenPhotoIds(prev => new Set(prev).add(p.id))}
                        />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleCompare(p.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="font-sans text-body-s text-white capitalize">{fmtDateLong(p.date)}</p>
                      <p className="font-mono text-caption text-ink-2 mt-0.5">
                        {selected ? 'Seleccionada para comparar' : 'Toca para comparar'}
                      </p>
                    </button>
                    <button
                      onClick={() => handleDelete(p)}
                      disabled={isDeleting}
                      className="text-ink-3 hover:text-danger transition-colors shrink-0 disabled:opacity-40 -m-1 p-1"
                      title="Eliminar esta foto"
                      aria-label={`Eliminar foto del ${fmtDate(p.date)}`}
                    >
                      <Icon name={isDeleting ? 'progress_activity' : 'delete'} size="m" className={isDeleting ? 'animate-spin' : ''} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
