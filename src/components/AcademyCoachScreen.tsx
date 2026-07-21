import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AcademyCourse, AcademyLesson, AcademyCategory, AcademyAccess, UnlockRule } from '../types';
import {
  getAllCourses, createCourse, updateCourse, deleteCourse,
  getAllLessons, createLesson, updateLesson, deleteLesson,
  getAllUserProfiles, getAllAcademyAccess, setAcademyAccess, createNotificationDeduped,
} from '../dbService';
import Skeleton from './Skeleton';

interface Props {
  coachId: string;
  coachEmail: string;
}

type Tab = 'cursos' | 'lecciones' | 'acceso';

const CATEGORY_LABEL: Record<AcademyCategory, string> = {
  entrenamiento: 'Entrenamiento', nutricion: 'Nutrición', fisiologia: 'Fisiología',
  biomecanica: 'Biomecánica', mentalidad: 'Mentalidad', recuperacion: 'Recuperación',
};
const CATEGORIES = Object.keys(CATEGORY_LABEL) as AcademyCategory[];

const UNLOCK_LABEL = (r: UnlockRule): string => {
  if (r.type === 'immediate') return 'Inmediato';
  if (r.type === 'daysSinceJoin') return `${r.value} días desde el alta`;
  if (r.type === 'level') return `Nivel ${r.value}`;
  return `Requiere completar otro curso`;
};

export default function AcademyCoachScreen({ coachId, coachEmail }: Props) {
  const [tab, setTab] = useState<Tab>('cursos');
  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'cursos', label: 'Cursos', icon: 'video_library' },
    { id: 'lecciones', label: 'Lecciones', icon: 'play_lesson' },
    { id: 'acceso', label: 'Acceso', icon: 'admin_panel_settings' },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 pb-4 border-b border-white/60">
        <span className="inline-flex items-center px-2 py-0.5 rounded bg-[#201f1f] text-[10px] font-sans border border-[#fbcb1a]/30 text-[#fbcb1a] font-bold uppercase tracking-wider w-fit">
          Consola de Entrenador
        </span>
        <h1 className="font-sans font-black text-3xl tracking-tight text-white uppercase">TrainingLab</h1>
      </header>

      <div className="overflow-x-auto -mx-1 px-1 pb-0.5">
        <div className="flex bg-[#181816] border border-white/7 p-1 rounded-lg gap-1 w-max sm:w-fit">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-md font-sans text-xs font-bold tracking-wider uppercase whitespace-nowrap transition-all ${
                tab === t.id ? 'bg-[#fbcb1a] text-black shadow-lg shadow-[#fbcb1a]/10' : 'text-[#c6c9ab] hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-base">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'cursos' && <CoursesTab />}
      {tab === 'lecciones' && <LessonsTab />}
      {tab === 'acceso' && <AccessTab coachEmail={coachEmail} />}
    </div>
  );
}

// ─── CURSOS ─────────────────────────────────────────────────────────────────

function CoursesTab() {
  const queryClient = useQueryClient();
  const { data: courses = [], isPending } = useQuery({ queryKey: ['academyCourses'], queryFn: getAllCourses });
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<AcademyCategory>('entrenamiento');
  const [unlockType, setUnlockType] = useState<UnlockRule['type']>('immediate');
  const [unlockValue, setUnlockValue] = useState('');
  const [saving, setSaving] = useState(false);

  const buildRule = (): UnlockRule => {
    if (unlockType === 'daysSinceJoin') return { type: 'daysSinceJoin', value: Number(unlockValue) || 0 };
    if (unlockType === 'level') return { type: 'level', value: Number(unlockValue) || 1 };
    if (unlockType === 'prerequisite') return { type: 'prerequisite', value: unlockValue };
    return { type: 'immediate' };
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      const course = await createCourse({
        title: title.trim(), description: description.trim(), category, order: courses.length,
        published: false, unlockRule: buildRule(), lessonCount: 0,
      });
      queryClient.setQueryData<AcademyCourse[]>(['academyCourses'], prev => [...(prev ?? []), course]);
      setTitle(''); setDescription(''); setUnlockValue(''); setShowForm(false);
    } finally { setSaving(false); }
  };

  const togglePublished = async (c: AcademyCourse) => {
    queryClient.setQueryData<AcademyCourse[]>(['academyCourses'], prev => prev?.map(x => x.id === c.id ? { ...x, published: !x.published } : x));
    await updateCourse(c.id, { published: !c.published });
  };

  const handleDelete = async (id: string) => {
    queryClient.setQueryData<AcademyCourse[]>(['academyCourses'], prev => prev?.filter(c => c.id !== id));
    await deleteCourse(id);
  };

  return (
    <section className="bg-[#181816] border border-white/7 rounded-2xl p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-sans font-bold text-base text-white">Cursos</h2>
        <button onClick={() => setShowForm(v => !v)} className="flex items-center gap-1 text-[10px] font-mono font-bold uppercase text-[#fbcb1a] hover:text-[#d4a800]">
          <span className="material-symbols-outlined text-sm">{showForm ? 'close' : 'add'}</span>
          {showForm ? 'Cancelar' : 'Nuevo curso'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-[#1e1e1b] border border-white/7 rounded-xl p-3 space-y-2">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título del curso" required
            className="w-full bg-[#0e0e0e] border border-white/7 rounded p-2 text-xs text-white focus:outline-none focus:border-[#fbcb1a]" />
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Descripción" rows={2}
            className="w-full bg-[#0e0e0e] border border-white/7 rounded p-2 text-xs text-white focus:outline-none focus:border-[#fbcb1a]" />
          <div className="flex gap-2 flex-wrap">
            <select value={category} onChange={e => setCategory(e.target.value as AcademyCategory)}
              className="bg-[#0e0e0e] border border-white/7 rounded p-2 text-xs text-white focus:outline-none focus:border-[#fbcb1a]">
              {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </select>
            <select value={unlockType} onChange={e => setUnlockType(e.target.value as UnlockRule['type'])}
              className="bg-[#0e0e0e] border border-white/7 rounded p-2 text-xs text-white focus:outline-none focus:border-[#fbcb1a]">
              <option value="immediate">Desbloqueo inmediato</option>
              <option value="daysSinceJoin">Días desde el alta</option>
              <option value="level">Nivel mínimo</option>
              <option value="prerequisite">Requiere otro curso (ID)</option>
            </select>
            {unlockType !== 'immediate' && (
              <input value={unlockValue} onChange={e => setUnlockValue(e.target.value)} placeholder={unlockType === 'prerequisite' ? 'ID de curso' : 'Número'}
                className="flex-1 min-w-[100px] bg-[#0e0e0e] border border-white/7 rounded p-2 text-xs text-white focus:outline-none focus:border-[#fbcb1a]" />
            )}
          </div>
          <button type="submit" disabled={saving} className="w-full py-2.5 bg-[#fbcb1a] text-black font-sans font-bold text-xs uppercase rounded hover:bg-[#d4a800] active:scale-95 transition-all disabled:opacity-50">
            {saving ? 'Guardando...' : 'Crear curso'}
          </button>
        </form>
      )}

      {isPending ? (
        <div className="space-y-2"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>
      ) : courses.length === 0 ? (
        <p className="text-xs text-[#555] font-mono py-2">Todavía no hay cursos.</p>
      ) : (
        <div className="space-y-2">
          {courses.map(c => (
            <div key={c.id} className="flex items-center gap-3 bg-[#1e1e1e] border border-white/7 rounded-lg p-3">
              <div className="flex-1 min-w-0">
                <p className="font-sans font-semibold text-sm text-white truncate">{c.title}</p>
                <p className="text-[10px] text-[#c6c9ab] font-mono">{CATEGORY_LABEL[c.category]} · {c.lessonCount} lecciones · {UNLOCK_LABEL(c.unlockRule)}</p>
              </div>
              <button onClick={() => togglePublished(c)} className={`text-[10px] font-mono font-bold uppercase px-2 py-1 rounded ${c.published ? 'bg-[#00eefc]/10 text-[#00eefc]' : 'bg-white/7 text-[#888]'}`}>
                {c.published ? 'Publicado' : 'Borrador'}
              </button>
              <button onClick={() => handleDelete(c.id)} className="text-[#c6c9ab] hover:text-red-400 flex-shrink-0">
                <span className="material-symbols-outlined text-base">delete</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── LECCIONES ──────────────────────────────────────────────────────────────

function LessonsTab() {
  const queryClient = useQueryClient();
  const { data: courses = [] } = useQuery({ queryKey: ['academyCourses'], queryFn: getAllCourses });
  const { data: lessons = [], isPending } = useQuery({ queryKey: ['academyLessons'], queryFn: getAllLessons });
  const [showForm, setShowForm] = useState(false);
  const [courseId, setCourseId] = useState('');
  const [title, setTitle] = useState('');
  const [videoProvider, setVideoProvider] = useState<'youtube' | 'vimeo'>('youtube');
  const [videoId, setVideoId] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !videoId.trim() || !courseId) return;
    setSaving(true);
    try {
      const lessonsInCourse = lessons.filter(l => l.courseId === courseId);
      const lesson = await createLesson({
        courseId, title: title.trim(), order: lessonsInCourse.length,
        videoProvider, videoId: videoId.trim(),
      });
      queryClient.setQueryData<AcademyLesson[]>(['academyLessons'], prev => [...(prev ?? []), lesson]);
      const course = courses.find(c => c.id === courseId);
      if (course) {
        await updateCourse(courseId, { lessonCount: lessonsInCourse.length + 1 });
        queryClient.setQueryData<AcademyCourse[]>(['academyCourses'], prev => prev?.map(c => c.id === courseId ? { ...c, lessonCount: lessonsInCourse.length + 1 } : c));
      }
      setTitle(''); setVideoId(''); setShowForm(false);
    } finally { setSaving(false); }
  };

  const handleDelete = async (l: AcademyLesson) => {
    queryClient.setQueryData<AcademyLesson[]>(['academyLessons'], prev => prev?.filter(x => x.id !== l.id));
    await deleteLesson(l.id);
    const remaining = lessons.filter(x => x.courseId === l.courseId && x.id !== l.id).length;
    await updateCourse(l.courseId, { lessonCount: remaining });
    queryClient.setQueryData<AcademyCourse[]>(['academyCourses'], prev => prev?.map(c => c.id === l.courseId ? { ...c, lessonCount: remaining } : c));
  };

  return (
    <section className="bg-[#181816] border border-white/7 rounded-2xl p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-sans font-bold text-base text-white">Lecciones</h2>
        <button onClick={() => setShowForm(v => !v)} className="flex items-center gap-1 text-[10px] font-mono font-bold uppercase text-[#fbcb1a] hover:text-[#d4a800]">
          <span className="material-symbols-outlined text-sm">{showForm ? 'close' : 'add'}</span>
          {showForm ? 'Cancelar' : 'Nueva lección'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-[#1e1e1b] border border-white/7 rounded-xl p-3 space-y-2">
          <select value={courseId} onChange={e => setCourseId(e.target.value)} required
            className="w-full bg-[#0e0e0e] border border-white/7 rounded p-2 text-xs text-white focus:outline-none focus:border-[#fbcb1a]">
            <option value="">Selecciona curso...</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título de la lección" required
            className="w-full bg-[#0e0e0e] border border-white/7 rounded p-2 text-xs text-white focus:outline-none focus:border-[#fbcb1a]" />
          <div className="flex gap-2">
            <select value={videoProvider} onChange={e => setVideoProvider(e.target.value as 'youtube' | 'vimeo')}
              className="bg-[#0e0e0e] border border-white/7 rounded p-2 text-xs text-white focus:outline-none focus:border-[#fbcb1a]">
              <option value="youtube">YouTube</option>
              <option value="vimeo">Vimeo</option>
            </select>
            <input value={videoId} onChange={e => setVideoId(e.target.value)} placeholder="ID del vídeo" required
              className="flex-1 bg-[#0e0e0e] border border-white/7 rounded p-2 text-xs text-white focus:outline-none focus:border-[#fbcb1a]" />
          </div>
          <button type="submit" disabled={saving} className="w-full py-2.5 bg-[#fbcb1a] text-black font-sans font-bold text-xs uppercase rounded hover:bg-[#d4a800] active:scale-95 transition-all disabled:opacity-50">
            {saving ? 'Guardando...' : 'Crear lección'}
          </button>
        </form>
      )}

      {isPending ? (
        <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
      ) : lessons.length === 0 ? (
        <p className="text-xs text-[#555] font-mono py-2">Todavía no hay lecciones.</p>
      ) : (
        <div className="space-y-2">
          {lessons.map(l => (
            <div key={l.id} className="flex items-center gap-3 bg-[#1e1e1e] border border-white/7 rounded-lg p-3">
              <span className="material-symbols-outlined text-[#00eefc]">play_circle</span>
              <div className="flex-1 min-w-0">
                <p className="font-sans font-semibold text-sm text-white truncate">{l.title}</p>
                <p className="text-[10px] text-[#c6c9ab] font-mono">{courses.find(c => c.id === l.courseId)?.title ?? '—'}</p>
              </div>
              <button onClick={() => handleDelete(l)} className="text-[#c6c9ab] hover:text-red-400 flex-shrink-0">
                <span className="material-symbols-outlined text-base">delete</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── ACCESO (capa 1: quién ve la pestaña Academia) ─────────────────────────

function AccessTab({ coachEmail }: { coachEmail: string }) {
  const queryClient = useQueryClient();
  const { data: profiles = [], isPending: loadingProfiles } = useQuery({ queryKey: ['userProfiles'], queryFn: getAllUserProfiles });
  const { data: accessList = [], isPending: loadingAccess } = useQuery({ queryKey: ['academyAccessAll'], queryFn: getAllAcademyAccess });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const athletes = profiles.filter(p => p.role === 'client');
  const accessByEmail = new Map(accessList.map(a => [a.athleteId, a]));

  const toggle = async (email: string, enabled: boolean) => {
    const updated = await setAcademyAccess(email, enabled, coachEmail);
    queryClient.setQueryData<AcademyAccess[]>(['academyAccessAll'], prev => [...(prev ?? []).filter(a => a.athleteId !== email), updated]);
    if (enabled) {
      createNotificationDeduped(`notif_academy_access_${email}_${updated.grantedAt}`, {
        recipientEmail: email, type: 'academy_access_granted', title: 'Academia desbloqueada 🎓',
        body: 'Tu entrenador te ha dado acceso a TrainingLab.',
        link: 'academy', createdAt: new Date().toISOString(), read: false,
      }).catch(err => console.warn('createNotificationDeduped (academy access) failed:', err));
    }
  };

  const toggleSelected = (email: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(email) ? next.delete(email) : next.add(email);
      return next;
    });
  };

  const grantSelected = async () => {
    for (const email of selected) await toggle(email, true);
    setSelected(new Set());
  };

  if (loadingProfiles || loadingAccess) {
    return <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>;
  }

  return (
    <section className="bg-[#181816] border border-white/7 rounded-2xl p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-sans font-bold text-base text-white">Acceso por atleta</h2>
        {selected.size > 0 && (
          <button onClick={grantSelected} className="text-[10px] font-mono font-bold uppercase text-[#fbcb1a] hover:text-[#d4a800]">
            Conceder a {selected.size} seleccionado{selected.size === 1 ? '' : 's'}
          </button>
        )}
      </div>
      <div className="space-y-2">
        {athletes.map(a => {
          const enabled = accessByEmail.get(a.email)?.enabled ?? false;
          return (
            <div key={a.email} className="flex items-center gap-3 bg-[#1e1e1e] border border-white/7 rounded-lg p-3">
              <input type="checkbox" checked={selected.has(a.email)} onChange={() => toggleSelected(a.email)} className="w-4 h-4 accent-[#fbcb1a]" />
              <img src={a.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
              <p className="flex-1 min-w-0 font-sans font-semibold text-sm text-white truncate">{a.displayName}</p>
              <button
                onClick={() => toggle(a.email, !enabled)}
                className={`text-[10px] font-mono font-bold uppercase px-3 py-1.5 rounded-full transition-colors ${enabled ? 'bg-[#00eefc]/10 text-[#00eefc]' : 'bg-white/7 text-[#888]'}`}
              >
                {enabled ? 'Acceso activo' : 'Sin acceso'}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
