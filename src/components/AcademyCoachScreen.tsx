import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AcademyCourse, AcademyCategory, UnlockRule } from '../types';
import { getAllCourses, createCourse, updateCourse, deleteCourseWithLessons, getAllLessons } from '../dbService';
import { subirArchivo } from '../almacenamiento';
import { compressImage } from '../utils/compressImage';
import PortadaCurso from './academy/PortadaCurso';
import LeccionesCoach from './academy/LeccionesCoach';
import AccesoCoach from './academy/AccesoCoach';
import { moverElemento } from '../utils/academyAdmin';
import { useConfirm } from '../hooks/useConfirm';
import { Skeleton, Icon, Card, Tabs, Button } from './ui';

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
  if (r.type === 'immediate') return 'Sin condición';
  if (r.type === 'daysSinceJoin') return `${r.value} días desde el alta`;
  if (r.type === 'level') return `Nivel ${r.value}`;
  return `Requiere completar otro curso`;
};

export default function AcademyCoachScreen({ coachEmail }: Props) {
  const [tab, setTab] = useState<Tab>('cursos');
  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'cursos', label: 'Cursos', icon: 'video_library' },
    { id: 'lecciones', label: 'Lecciones', icon: 'play_lesson' },
    { id: 'acceso', label: 'Acceso', icon: 'admin_panel_settings' },
  ];

  return (
    <div className="space-y-6">
      {/* Sin cabecera propia: la pone Biblioteca (CoachLibraryScreen). */}

      <Tabs items={tabs} value={tab} onChange={id => setTab(id as Tab)} label="Secciones de TrainingLab" />

      {tab === 'cursos' && <CoursesTab />}
      {tab === 'lecciones' && <LeccionesCoach />}
      {tab === 'acceso' && <AccesoCoach coachEmail={coachEmail} />}
    </div>
  );
}

// ─── CURSOS ─────────────────────────────────────────────────────────────────

interface DatosCurso {
  title: string;
  description: string;
  category: AcademyCategory;
  unlockRule: UnlockRule;
  inicial: boolean;
}

/** Crear y editar un curso con el mismo formulario. El desbloqueo es a mano (Dani, 23-10): «Sin condición» y se abre curso a curso en Acceso; las reglas por días, nivel o prerrequisito siguen ahí por si se usan. */
function CursoForm({ inicial, cursos, guardando, onSubmit, onCancel }: {
  inicial?: AcademyCourse;
  cursos: AcademyCourse[];
  guardando: boolean;
  onSubmit: (d: DatosCurso) => void;
  onCancel: () => void;
  /** Sin `@types/react` en el repo, TS no excluye `key` por su cuenta (ver Chip). */
  key?: React.Key;
}) {
  const [title, setTitle] = useState(inicial?.title ?? '');
  const [description, setDescription] = useState(inicial?.description ?? '');
  const [category, setCategory] = useState<AcademyCategory>(inicial?.category ?? 'entrenamiento');
  const [unlockType, setUnlockType] = useState<UnlockRule['type']>(inicial?.unlockRule.type ?? 'immediate');
  const [unlockValue, setUnlockValue] = useState(inicial && inicial.unlockRule.type !== 'immediate' ? String(inicial.unlockRule.value) : '');
  const [esInicial, setEsInicial] = useState(!!inicial?.inicial);

  const regla = (): UnlockRule => {
    if (unlockType === 'daysSinceJoin') return { type: 'daysSinceJoin', value: Number(unlockValue) || 0 };
    if (unlockType === 'level') return { type: 'level', value: Number(unlockValue) || 1 };
    if (unlockType === 'prerequisite') return { type: 'prerequisite', value: unlockValue };
    return { type: 'immediate' };
  };
  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({ title: title.trim(), description: description.trim(), category, unlockRule: regla(), inicial: esInicial });
  };
  const CAMPO = 'max-w-full bg-bg border border-hairline rounded-control p-2 text-title-s text-ink focus:outline-none focus:border-accent';

  return (
    <form onSubmit={enviar} className="bg-raised border border-hairline rounded-surface p-3 space-y-2">
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título del curso" required className={`w-full ${CAMPO}`} />
      <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Descripción" rows={2} className={`w-full ${CAMPO}`} />
      <div className="flex gap-2 flex-wrap">
        <select value={category} onChange={e => setCategory(e.target.value as AcademyCategory)} className={CAMPO} aria-label="Categoría">
          {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
        </select>
        <select value={unlockType} onChange={e => setUnlockType(e.target.value as UnlockRule['type'])} className={CAMPO} aria-label="Condición de desbloqueo">
          <option value="immediate">Sin condición (lo abres tú en Acceso)</option>
          <option value="daysSinceJoin">Días desde el alta</option>
          <option value="level">Nivel mínimo de su escalera</option>
          <option value="prerequisite">Requiere completar otro curso</option>
        </select>
        {unlockType === 'prerequisite' ? (
          <select value={unlockValue} onChange={e => setUnlockValue(e.target.value)} className={`flex-1 min-w-[140px] ${CAMPO}`} aria-label="Curso requerido">
            <option value="">Elige el curso...</option>
            {cursos.filter(c => c.id !== inicial?.id).map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        ) : unlockType !== 'immediate' && (
          <input value={unlockValue} onChange={e => setUnlockValue(e.target.value)} placeholder="Número" inputMode="numeric" className={`flex-1 min-w-[100px] ${CAMPO}`} />
        )}
      </div>
      <label className="flex items-center gap-2 font-sans text-label text-ink-2">
        <input type="checkbox" checked={esInicial} onChange={e => setEsInicial(e.target.checked)} className="w-4 h-4 accent-accent" />
        Curso inicial: se abre solo al dar acceso a un atleta nuevo
      </label>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={onCancel} className="flex-1">Cancelar</Button>
        <Button type="submit" disabled={guardando} className="flex-1">{guardando ? 'Guardando...' : inicial ? 'Guardar cambios' : 'Crear curso'}</Button>
      </div>
    </form>
  );
}

function CoursesTab() {
  const queryClient = useQueryClient();
  const { confirm, ConfirmDialog } = useConfirm();
  const { data: courses = [], isPending } = useQuery({ queryKey: ['academyCourses'], queryFn: getAllCourses });
  const { data: lessons = [] } = useQuery({ queryKey: ['academyLessons'], queryFn: getAllLessons });
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const ordenados = [...courses].sort((a, b) => a.order - b.order);
  const setCursos = (fn: (prev: AcademyCourse[]) => AcademyCourse[]) =>
    queryClient.setQueryData<AcademyCourse[]>(['academyCourses'], prev => fn(prev ?? []));

  const crear = async (d: DatosCurso) => {
    setGuardando(true);
    try {
      const order = ordenados.length > 0 ? ordenados[ordenados.length - 1].order + 1 : 0;
      const course = await createCourse({ ...d, order, published: false, lessonCount: 0 });
      setCursos(prev => [...prev, course]);
      setCreando(false);
    } finally { setGuardando(false); }
  };

  const guardarEdicion = async (c: AcademyCourse, d: DatosCurso) => {
    setGuardando(true);
    try {
      await updateCourse(c.id, d);
      setCursos(prev => prev.map(x => (x.id === c.id ? { ...x, ...d } : x)));
      setEditando(null);
    } finally { setGuardando(false); }
  };

  const togglePublished = async (c: AcademyCourse) => {
    setCursos(prev => prev.map(x => (x.id === c.id ? { ...x, published: !x.published } : x)));
    await updateCourse(c.id, { published: !c.published });
  };

  const mover = async (c: AcademyCourse, delta: -1 | 1) => {
    const cambios = moverElemento(ordenados, c.id, delta);
    if (cambios.length === 0) return;
    const orden = new Map(cambios.map(x => [x.id, x.order]));
    setCursos(prev => prev.map(x => (orden.has(x.id) ? { ...x, order: orden.get(x.id)! } : x)));
    for (const x of cambios) await updateCourse(x.id, { order: x.order });
  };

  const borrar = async (c: AcademyCourse) => {
    const n = lessons.filter(l => l.courseId === c.id).length;
    const aviso = n > 0
      ? `Este curso tiene ${n} lección${n === 1 ? '' : 'es'}: se borrarán también. ¿Borrar «${c.title}»?`
      : `¿Borrar el curso «${c.title}»?`;
    if (!await confirm(aviso)) return;
    setCursos(prev => prev.filter(x => x.id !== c.id));
    await deleteCourseWithLessons(c.id);
    queryClient.setQueryData(['academyLessons'], (prev: unknown) => (Array.isArray(prev) ? prev.filter((l: { courseId: string }) => l.courseId !== c.id) : prev));
  };

  return (
    <Card
      title="Cursos"
      action={
        <button onClick={() => setCreando(v => !v)} className="flex items-center gap-1 text-caption font-mono font-bold uppercase text-accent-ink hover:text-accent-press">
          <Icon name={creando ? 'close' : 'add'} size="s" />
          {creando ? 'Cancelar' : 'Nuevo curso'}
        </button>
      }
    >
      <ConfirmDialog />
      {creando && <CursoForm cursos={ordenados} guardando={guardando} onSubmit={d => void crear(d)} onCancel={() => setCreando(false)} />}

      {isPending ? (
        <div className="space-y-2"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>
      ) : ordenados.length === 0 ? (
        <p className="text-label text-ink-3 font-sans py-2">Todavía no hay cursos.</p>
      ) : (
        <div className="space-y-2">
          {ordenados.map((c, i) => (
            editando === c.id ? (
              <CursoForm key={c.id} inicial={c} cursos={ordenados} guardando={guardando} onSubmit={d => void guardarEdicion(c, d)} onCancel={() => setEditando(null)} />
            ) : (
              <div key={c.id} className="flex items-center gap-3 flex-wrap bg-raised border border-hairline rounded-surface p-3">
                <div className="flex flex-col flex-shrink-0">
                  <button onClick={() => void mover(c, -1)} disabled={i === 0} aria-label={`Subir ${c.title}`} className="text-ink-3 hover:text-accent-ink disabled:opacity-20"><Icon name="keyboard_arrow_up" size="s" /></button>
                  <button onClick={() => void mover(c, 1)} disabled={i === ordenados.length - 1} aria-label={`Bajar ${c.title}`} className="text-ink-3 hover:text-accent-ink disabled:opacity-20"><Icon name="keyboard_arrow_down" size="s" /></button>
                </div>
                <PortadaPicker curso={c} />
                <div className="flex-1 min-w-[9rem]">
                  <p className="font-sans font-bold text-body-s text-ink">
                    {c.title}
                    {c.inicial && <span className="ml-2 align-middle font-mono text-caption font-bold uppercase text-accent-ink">inicial</span>}
                  </p>
                  <p className="text-caption text-ink-2 font-mono">{CATEGORY_LABEL[c.category]} · {c.lessonCount} lecciones · {UNLOCK_LABEL(c.unlockRule)}</p>
                </div>
                <div className="flex items-center gap-2 ml-auto">
                <button onClick={() => void togglePublished(c)} className={`text-caption font-mono font-bold uppercase px-2 py-1 rounded-control ${c.published ? 'bg-data/10 text-data' : 'bg-hairline text-ink-3'}`}>
                  {c.published ? 'Publicado' : 'Borrador'}
                </button>
                <button onClick={() => setEditando(c.id)} aria-label={`Editar ${c.title}`} className="text-ink-2 hover:text-accent-ink flex-shrink-0"><Icon name="edit" size="s" /></button>
                <button onClick={() => void borrar(c)} aria-label={`Borrar ${c.title}`} className="text-ink-2 hover:text-danger flex-shrink-0"><Icon name="delete" size="s" /></button>
                </div>
              </div>
            )
          ))}
        </div>
      )}
    </Card>
  );
}

/* Portada del curso. La miniatura ES el botón: pulsarla abre el selector de
   archivo, y lo que se ve ahí es exactamente lo que verá el atleta —incluida
   la portada generada por categoría cuando todavía no hay foto, que no es un
   hueco vacío sino una portada válida.

   La imagen se comprime antes de subir (mismo criterio que fotos de progreso
   y recetas): una portada a 1600 px de ancho sobra para una tarjeta 16:9, y
   subir el original de 6 MB del móvil se lo tragaría el atleta en datos cada
   vez que abre Training Lab. */
function PortadaPicker({ curso }: { curso: AcademyCourse }) {
  const queryClient = useQueryClient();
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const elegir = async (file: File | undefined) => {
    if (!file) return;
    setSubiendo(true);
    setError(null);
    try {
      const comprimida = await compressImage(file, 1600, 0.82);
      // Sufijo de tiempo: sin él, reemplazar la portada deja la misma URL y el
      // atleta sigue viendo la vieja hasta que caduque su caché.
      const url = await subirArchivo(`academyCovers/${curso.id}_${Date.now()}.jpg`, comprimida);
      await updateCourse(curso.id, { coverImageUrl: url });
      queryClient.setQueryData<AcademyCourse[]>(['academyCourses'], prev =>
        prev?.map(x => (x.id === curso.id ? { ...x, coverImageUrl: url } : x)));
    } catch (err) {
      // En voz alta y en su sitio: una subida que falla en silencio deja al
      // coach creyendo que la portada está puesta.
      setError(err instanceof Error ? err.message : 'No se ha podido subir');
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <label
      className="relative w-24 shrink-0 cursor-pointer overflow-hidden rounded-control border border-hairline hover:border-accent-line transition-colors"
      title={curso.coverImageUrl ? 'Cambiar portada' : 'Subir portada'}
    >
      <PortadaCurso category={curso.category} coverImageUrl={curso.coverImageUrl} title={curso.title} />
      <span className="absolute inset-0 flex items-center justify-center bg-veil/55 opacity-0 hover:opacity-100 transition-opacity">
        <span className="material-symbols-outlined text-title-s text-ink">
          {subiendo ? 'hourglass_top' : 'photo_camera'}
        </span>
      </span>
      {subiendo && <span className="absolute inset-0 bg-veil/60" aria-hidden="true" />}
      {error && <span className="absolute inset-x-0 bottom-0 bg-danger/90 px-1 text-caption font-mono text-on-fill truncate">{error}</span>}
      <input
        type="file"
        accept="image/*"
        className="sr-only"
        disabled={subiendo}
        aria-label={`Portada de ${curso.title}`}
        onChange={e => { void elegir(e.target.files?.[0]); e.target.value = ''; }}
      />
    </label>
  );
}
