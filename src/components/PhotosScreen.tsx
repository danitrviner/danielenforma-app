import React, { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserProfile, ProgressPhoto, PhotoView } from '../types';
import { getProgressPhotos, uploadProgressPhoto, deleteProgressPhoto } from '../dbService';
import { useToast } from '../hooks/useToast';
import Coachmark from './Coachmark';
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
  const [deletingView, setDeletingView] = useState<PhotoView | null>(null);
  const [uploadError, setUploadError] = useState('');
  // Una URL de Storage que falla al cargar (permisos, red) no debe dejar el
  // alt-text roto ocupando la fila — se cae al icono placeholder igual que si
  // no hubiera foto.
  const [brokenPhotoIds, setBrokenPhotoIds] = useState<Set<string>>(new Set());
  const fileInputRefs = useRef<Partial<Record<PhotoView, HTMLInputElement | null>>>({});

  // Última foto por ángulo — es lo único que muestra la fila (handoff §7:
  // estado actual por ángulo, no el histórico completo).
  const latestByView = useMemo(() => {
    const map: Partial<Record<PhotoView, ProgressPhoto>> = {};
    for (const p of photos) {
      const cur = map[p.view];
      if (!cur || p.date > cur.date) map[p.view] = p;
    }
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
    setDeletingView(photo.view);
    try {
      await deleteProgressPhoto(photo);
      queryClient.setQueryData<ProgressPhoto[]>(photosKey, prev => prev?.filter(p => p.id !== photo.id));
    } catch (err) {
      console.error('Delete failed:', err);
      showToast('No se pudo eliminar la foto.');
    } finally {
      setDeletingView(null);
    }
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

  return (
    <div className="space-y-3">
      <Coachmark
        id="photos_upload_hint"
        email={profile.email}
        icon="photo_camera"
        text="Sube una foto por cada ángulo — es la forma más clara de ver tu progreso real, más allá del peso."
      />

      {/* Una fila por ángulo (handoff §7) — icono placeholder, badge ACTUAL,
          fecha de la última actualización, subir/borrar. */}
      <div className="flex flex-col gap-2.5">
        {VIEWS.map(view => {
          const photo = latestByView[view];
          const isUploading = uploadingView === view;
          const isDeleting = deletingView === view;
          return (
            <div key={view} className="bg-surface border border-hairline rounded-field p-3 flex items-center gap-3">
              <div
                className="w-[50px] h-[66px] rounded-control shrink-0 flex items-center justify-center overflow-hidden"
                style={{ backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,.05) 0 6px, rgba(255,255,255,.015) 6px 12px)' }}
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
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-sans font-bold text-body-s text-white">{VIEW_LABELS[view]}</span>
                  {photo && <Badge tone="success">ACTUAL</Badge>}
                </div>
                <p className="font-mono text-caption text-ink-2 mt-1">
                  {photo ? `Actualizada ${fmtDate(photo.date)}` : 'Sin foto todavía'}
                </p>
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

              {photo && (
                <button
                  onClick={() => handleDelete(photo)}
                  disabled={isDeleting}
                  className="text-ink-3 hover:text-danger transition-colors shrink-0 disabled:opacity-40"
                  title="Eliminar"
                >
                  <Icon name={isDeleting ? 'progress_activity' : 'delete'} size="m" className={isDeleting ? 'animate-spin' : ''} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {uploadError && (
        <p className="font-sans text-label text-danger">{uploadError}</p>
      )}
    </div>
  );
}
