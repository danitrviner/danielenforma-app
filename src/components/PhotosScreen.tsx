import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, ProgressPhoto, PhotoView } from '../types';
import { getProgressPhotos, uploadProgressPhoto, deleteProgressPhoto } from '../dbService';
import { useToast } from '../hooks/useToast';
import Coachmark from './Coachmark';
import Skeleton from './Skeleton';

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
  const [photos, setPhotos]           = useState<ProgressPhoto[]>([]);
  const [loading, setLoading]         = useState(true);
  const [selectedView, setSelectedView] = useState<PhotoView>('front');
  const [uploadDate, setUploadDate]   = useState(todayStr());
  const [uploading, setUploading]     = useState(false);
  const [deleting, setDeleting]       = useState<string | null>(null);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getProgressPhotos(profile.email).then(p => {
      setPhotos(p);
      setLoading(false);
    });
  }, [profile.email]);

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
      setPhotos(prev => {
        // Replace existing photo for same date+view, or prepend
        const withoutOld = prev.filter(p => !(p.date === photo.date && p.view === photo.view));
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
      setPhotos(prev => prev.filter(p => p.id !== photo.id));
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
      <div>
        <h1 className="font-sans font-extrabold text-3xl tracking-tight text-white">Fotos de Progreso</h1>
        <p className="text-[#c6c9ab] text-sm mt-1">Sube fotos por fecha para registrar tu evolución física.</p>
      </div>

      <Coachmark
        id="photos_upload_hint"
        email={profile.email}
        icon="photo_camera"
        text="Sube una foto por cada ángulo — es la forma más clara de ver tu progreso real, más allá del peso."
      />

      {/* View selector */}
      <div className="flex bg-[#181816] border border-white/7 p-1 rounded-2xl gap-1 w-fit">
        {(['front', 'side', 'back'] as PhotoView[]).map(v => (
          <button
            key={v}
            onClick={() => setSelectedView(v)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-xs font-bold uppercase tracking-wider transition-all ${
              selectedView === v
                ? 'bg-[#fbcb1a] text-black shadow-md'
                : 'text-[#c6c9ab] hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-sm">{VIEW_ICONS[v]}</span>
            {VIEW_LABELS[v]}
          </button>
        ))}
      </div>

      {/* Upload bar */}
      <div className="bg-[#1c1b1b] border border-white/7 rounded-xl p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="material-symbols-outlined text-[#c6c9ab] text-sm">calendar_today</span>
          <input
            type="date"
            value={uploadDate}
            onChange={e => setUploadDate(e.target.value)}
            className="bg-transparent border-none text-white font-mono text-sm focus:outline-none focus:ring-0 min-w-0"
          />
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 px-4 py-2 bg-[#fbcb1a] text-black font-sans text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-[#d4a800] disabled:opacity-50 active:scale-95 transition-all"
        >
          {uploading
            ? <><span className="material-symbols-outlined text-sm animate-spin">progress_activity</span> Subiendo…</>
            : <><span className="material-symbols-outlined text-sm">upload</span> Subir foto ({VIEW_LABELS[selectedView]})</>
          }
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
        {uploadError && (
          <p className="w-full font-mono text-xs text-red-400">{uploadError}</p>
        )}
      </div>

      {/* Gallery */}
      {visiblePhotos.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-white/7 rounded-2xl">
          <span className="material-symbols-outlined text-5xl text-[#2a2a2a] block mb-3">photo_camera</span>
          <p className="text-[#c6c9ab] text-sm font-sans">Sin fotos de {VIEW_LABELS[selectedView].toLowerCase()} todavía.</p>
          <p className="text-[#c6c9ab] text-xs font-mono mt-1 mb-4">Sube tu primera foto para empezar a registrar tu evolución.</p>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 mx-auto px-4 py-2 bg-[#fbcb1a] text-black font-sans text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-[#d4a800] disabled:opacity-50 active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-sm">upload</span>
            Subir foto
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {visiblePhotos.map((photo, idx) => (
            <div key={photo.id} className="relative group rounded-xl overflow-hidden border border-white/7 bg-[#1c1b1b] aspect-[3/4]">
              <img
                src={photo.url}
                alt={`${VIEW_LABELS[photo.view]} ${photo.date}`}
                className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
              />
              {/* Date badge */}
              <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm px-2 py-0.5 rounded text-white font-mono text-[9px]">
                {formatDate(photo.date)}
              </div>
              {/* Latest badge */}
              {idx === 0 && (
                <div className="absolute top-2 right-2 bg-[#fbcb1a] px-2 py-0.5 rounded font-mono text-[9px] font-black text-black">
                  ACTUAL
                </div>
              )}
              {/* Delete button */}
              <button
                onClick={() => handleDelete(photo)}
                disabled={deleting === photo.id}
                className="absolute bottom-2 right-2 w-7 h-7 rounded-full bg-black/70 backdrop-blur-sm flex items-center justify-center text-[#c6c9ab] hover:text-red-400 hover:bg-black/90 transition-all opacity-0 group-hover:opacity-100 disabled:opacity-50"
              >
                {deleting === photo.id
                  ? <span className="material-symbols-outlined text-xs animate-spin">progress_activity</span>
                  : <span className="material-symbols-outlined text-sm">delete</span>
                }
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
