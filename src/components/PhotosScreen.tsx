import React, { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserProfile, ProgressPhoto, PhotoView } from '../types';
import { getProgressPhotos, uploadProgressPhoto, deleteProgressPhoto } from '../dbService';
import { useToast } from '../hooks/useToast';
import Coachmark from './Coachmark';
import Skeleton from './Skeleton';
import { Icon, Button, PageHeader, Tabs, EmptyState } from './ui';

const VIEW_LABELS: Record<PhotoView, string> = {
  front: 'Frente',
  side: 'Lateral',
  back: 'Espalda',
};

const VIEW_ICONS: Record<PhotoView, string> = {
  front: 'person',
  side: 'accessibility_new',
  back: 'directions_walk',
};

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

interface Props {
  profile: UserProfile;
}

export default function PhotosScreen({ profile }: Props) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const photosKey = ['progressPhotos', profile.email] as const;
  const { data: photos = [], isPending: loading } = useQuery({
    queryKey: photosKey,
    queryFn: () => getProgressPhotos(profile.email),
  });
  const [selectedView, setSelectedView] = useState<PhotoView>('front');
  const [uploadDate, setUploadDate]   = useState(todayStr());
  const [uploading, setUploading]     = useState(false);
  const [deleting, setDeleting]       = useState<string | null>(null);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const visiblePhotos = photos
    .filter(p => p.view === selectedView)
    .sort((a, b) => b.date.localeCompare(a.date)); // newest first

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError('');
    try {
      const photo = await uploadProgressPhoto(profile.email, uploadDate, selectedView, file);
      queryClient.setQueryData<ProgressPhoto[]>(photosKey, prev => {
        // Replace existing photo for same date+view, or prepend
        const withoutOld = (prev ?? []).filter(p => !(p.date === photo.date && p.view === photo.view));
        return [...withoutOld, photo].sort((a, b) => a.date.localeCompare(b.date));
      });
    } catch (err) {
      console.error('Upload failed:', err);
      setUploadError('No se pudo subir la foto. Verifica tu conexión.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (photo: ProgressPhoto) => {
    setDeleting(photo.id);
    try {
      await deleteProgressPhoto(photo);
      queryClient.setQueryData<ProgressPhoto[]>(photosKey, prev => prev?.filter(p => p.id !== photo.id));
    } catch (err) {
      console.error('Delete failed:', err);
      showToast('No se pudo eliminar la foto.');
    } finally {
      setDeleting(null);
    }
  };

  const formatDate = (d: string) =>
    new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-2">
        <Skeleton className="aspect-square w-full" />
        <Skeleton className="aspect-square w-full" />
        <Skeleton className="aspect-square w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <PageHeader title="Fotos de Progreso" subtitle="Sube fotos por fecha para registrar tu evolución física." />

      <Coachmark
        id="photos_upload_hint"
        email={profile.email}
        icon="photo_camera"
        text="Sube una foto por cada ángulo — es la forma más clara de ver tu progreso real, más allá del peso."
      />

      {/* View selector */}
      <Tabs
        items={(['front', 'side', 'back'] as PhotoView[]).map(v => ({ id: v, label: VIEW_LABELS[v], icon: VIEW_ICONS[v] }))}
        value={selectedView}
        onChange={id => setSelectedView(id as PhotoView)}
        label="Ángulo de la foto"
      />

      {/* Upload bar */}
      <div className="bg-raised border border-hairline rounded-surface p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Icon name="calendar_today" size="s" className="text-ink-2" />
          <input
            type="date"
            value={uploadDate}
            onChange={e => setUploadDate(e.target.value)}
            className="bg-transparent border-none text-white font-mono text-title-s focus:outline-none focus:ring-0 min-w-0"
          />
        </div>
        <Button onClick={() => fileInputRef.current?.click()} disabled={uploading} loading={uploading} icon="upload">
          {uploading ? 'Subiendo…' : `Subir foto (${VIEW_LABELS[selectedView]})`}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
        {uploadError && (
          <p className="w-full font-sans text-label text-red-400">{uploadError}</p>
        )}
      </div>

      {/* Gallery */}
      {visiblePhotos.length === 0 ? (
        <div className="border border-dashed border-hairline rounded-surface">
          <EmptyState
            icon="photo_camera"
            title={`Sin fotos de ${VIEW_LABELS[selectedView].toLowerCase()} todavía.`}
            description="Sube tu primera foto para empezar a registrar tu evolución."
            actionLabel="Subir foto"
            onAction={() => fileInputRef.current?.click()}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {visiblePhotos.map((photo, idx) => (
            <div key={photo.id} className="relative group rounded-surface overflow-hidden border border-hairline bg-raised aspect-[3/4]">
              <img
                src={photo.url}
                alt={`${VIEW_LABELS[photo.view]} ${photo.date}`}
                className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
              />
              {/* Date badge */}
              <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm px-2 rounded-control text-white font-mono text-caption">
                {formatDate(photo.date)}
              </div>
              {/* Latest badge */}
              {idx === 0 && (
                <div className="absolute top-2 right-2 bg-accent px-2 rounded-control font-mono text-caption font-bold text-black">
                  ACTUAL
                </div>
              )}
              {/* Delete button */}
              <button
                onClick={() => handleDelete(photo)}
                disabled={deleting === photo.id}
                className="absolute bottom-2 right-2 w-7 h-7 rounded-full bg-black/70 backdrop-blur-sm flex items-center justify-center text-ink-2 hover:text-red-400 hover:bg-black/90 transition-all opacity-0 group-hover:opacity-100 disabled:opacity-50"
              >
                <Icon name={deleting === photo.id ? 'progress_activity' : 'delete'} size="s" className={deleting === photo.id ? 'animate-spin' : ''} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
