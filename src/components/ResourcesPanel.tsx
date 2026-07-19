import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Resource, ResourceKind } from '../types';
import { getAllResources, createResource, deleteResource } from '../dbService';
import Skeleton from './Skeleton';

interface Props {
  coachId?: string; // required only when isCoach (used to tag newly created resources)
  isCoach: boolean;
}

const KIND_LABEL: Record<ResourceKind, string> = {
  pdf: 'PDF', video: 'Vídeo', image: 'Imagen', doc: 'Documento', link: 'Enlace', guide: 'Guía',
};

const KIND_ICON: Record<ResourceKind, string> = {
  pdf: 'picture_as_pdf', video: 'play_circle', image: 'image', doc: 'description', link: 'link', guide: 'menu_book',
};

const resourcesQueryKey = ['resources'];

export default function ResourcesPanel({ coachId, isCoach }: Props) {
  const queryClient = useQueryClient();
  const { data: resources = [], isPending: loading } = useQuery({
    queryKey: resourcesQueryKey,
    queryFn: getAllResources,
  });
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<ResourceKind>('link');
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !url.trim() || !coachId) return;
    setSaving(true);
    try {
      const resource = await createResource({
        coachId, title: title.trim(), kind, url: url.trim(), createdAt: new Date().toISOString(),
      });
      queryClient.setQueryData<Resource[]>(resourcesQueryKey, prev => [...(prev ?? []), resource]);
      setTitle(''); setUrl(''); setKind('link'); setShowForm(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    queryClient.setQueryData<Resource[]>(resourcesQueryKey, prev => prev?.filter(r => r.id !== id));
    try { await deleteResource(id); } catch (err) { console.error(err); }
  };

  return (
    <section className="bg-[#181816] border border-white/7 rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-white/7">
        <h2 className="font-sans font-bold text-base text-white flex items-center gap-2">
          <span className="material-symbols-outlined text-[#00eefc]">folder_open</span>
          Recursos
        </h2>
        {isCoach && (
          <button
            onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-1 text-[10px] font-mono font-bold uppercase text-[#fbcb1a] hover:text-[#d4a800] transition-colors"
          >
            <span className="material-symbols-outlined text-sm">{showForm ? 'close' : 'add'}</span>
            {showForm ? 'Cancelar' : 'Nuevo'}
          </button>
        )}
      </div>

      {isCoach && showForm && (
        <form onSubmit={handleCreate} className="bg-[#1e1e1b] border border-white/7 rounded-xl p-3 mb-3 space-y-2">
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Título del recurso"
            className="w-full bg-[#0e0e0e] border border-white/7 rounded p-2 text-xs text-white focus:outline-none focus:border-[#fbcb1a]"
            required
          />
          <div className="flex gap-2">
            <select
              value={kind}
              onChange={e => setKind(e.target.value as ResourceKind)}
              className="bg-[#0e0e0e] border border-white/7 rounded p-2 text-xs text-white focus:outline-none focus:border-[#fbcb1a]"
            >
              {(Object.keys(KIND_LABEL) as ResourceKind[]).map(k => (
                <option key={k} value={k}>{KIND_LABEL[k]}</option>
              ))}
            </select>
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://..."
              className="flex-1 bg-[#0e0e0e] border border-white/7 rounded p-2 text-xs text-white focus:outline-none focus:border-[#fbcb1a]"
              required
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 bg-[#fbcb1a] text-black font-sans font-bold text-xs uppercase rounded hover:bg-[#d4a800] active:scale-95 transition-all disabled:opacity-50 shadow-sm"
          >
            {saving ? 'Guardando...' : 'Compartir recurso'}
          </button>
        </form>
      )}

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : resources.length === 0 ? (
        <p className="text-xs text-[#555] font-mono py-2">
          {isCoach ? 'Todavía no compartiste ningún recurso.' : 'Tu entrenador no compartió recursos todavía.'}
        </p>
      ) : (
        <div className="space-y-2">
          {resources.map(r => (
            <div key={r.id} className="flex items-center gap-3 bg-[#1e1e1e] border border-white/7 rounded-lg p-3">
              <span className="material-symbols-outlined text-[#00eefc] flex-shrink-0">{KIND_ICON[r.kind]}</span>
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0">
                <p className="font-sans font-semibold text-sm text-white hover:text-[#fbcb1a] transition-colors truncate">{r.title}</p>
                <p className="font-mono text-[10px] text-[#c6c9ab]">{KIND_LABEL[r.kind]}</p>
              </a>
              {isCoach && (
                <button onClick={() => handleDelete(r.id)} className="text-[#c6c9ab] hover:text-red-400 transition-colors flex-shrink-0">
                  <span className="material-symbols-outlined text-base">delete</span>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
