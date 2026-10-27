import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AcademyCourse, AcademyLesson, AcademyLessonResource } from '../../types';
import { getAllCourses, getAllLessons, createLesson, updateLesson, deleteLesson, updateCourse } from '../../dbService';
import { parseVideoUrl } from '../../utils/embedPlayerControl';
import { leccionesDeCurso, moverElemento } from '../../utils/academyAdmin';
import { useConfirm } from '../../hooks/useConfirm';
import { Card, Button, Icon, Skeleton } from '../ui';

const CAMPO = 'w-full bg-bg border border-hairline rounded-control p-2 text-title-s text-ink focus:outline-none focus:border-accent';

interface DatosLeccion {
  courseId: string;
  title: string;
  videoProvider: 'youtube' | 'vimeo';
  videoId: string;
  description: string;
  durationSec: number;
  resources: AcademyLessonResource[];
}

/** Crear y editar una lección con el mismo formulario. Descripción, duración y descargables se guardan siempre (vacíos = «sin»), porque Firestore no borra un campo con `undefined`. */
function LessonForm({ cursos, inicial, courseIdInicial, guardando, onSubmit, onCancel }: {
  cursos: AcademyCourse[];
  inicial?: AcademyLesson;
  courseIdInicial?: string;
  guardando: boolean;
  onSubmit: (d: DatosLeccion) => void;
  onCancel: () => void;
  /** Sin `@types/react` en el repo, TS no excluye `key` por su cuenta (ver Chip). */
  key?: React.Key;
}) {
  const [courseId, setCourseId] = useState(inicial?.courseId ?? courseIdInicial ?? '');
  const [title, setTitle] = useState(inicial?.title ?? '');
  const [provider, setProvider] = useState<'youtube' | 'vimeo'>(inicial?.videoProvider ?? 'youtube');
  const [video, setVideo] = useState(inicial?.videoId ?? '');
  const [description, setDescription] = useState(inicial?.description ?? '');
  const [minutos, setMinutos] = useState(inicial?.durationSec ? String(Math.round(inicial.durationSec / 60)) : '');
  const [resources, setResources] = useState<AcademyLessonResource[]>(inicial?.resources ?? []);

  const cambiarRecurso = (i: number, patch: Partial<AcademyLessonResource>) =>
    setResources(prev => prev.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !video.trim() || !courseId) return;
    const parsed = parseVideoUrl(video);
    onSubmit({
      courseId, title: title.trim(),
      videoProvider: parsed?.provider ?? provider, videoId: parsed?.id ?? video.trim(),
      description: description.trim(),
      durationSec: Math.max(0, Math.round((parseFloat(minutos.replace(',', '.')) || 0) * 60)),
      resources: resources.map(r => ({ ...r, title: r.title.trim(), url: r.url.trim() })).filter(r => r.url),
    });
  };

  return (
    <form onSubmit={enviar} className="bg-raised border border-hairline rounded-surface p-3 space-y-2">
      <select value={courseId} onChange={e => setCourseId(e.target.value)} required disabled={!!inicial} className={CAMPO} aria-label="Curso">
        <option value="">Selecciona curso...</option>
        {cursos.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
      </select>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título de la lección" required className={CAMPO} />
      <div className="flex gap-2">
        <select value={provider} onChange={e => setProvider(e.target.value as 'youtube' | 'vimeo')} className="bg-bg border border-control-line rounded-control p-2 text-title-s text-ink focus:outline-none focus:border-accent" aria-label="Plataforma del vídeo">
          <option value="youtube">YouTube</option>
          <option value="vimeo">Vimeo</option>
        </select>
        <input value={video} onChange={e => setVideo(e.target.value)} placeholder="ID o URL del vídeo" required className={`flex-1 ${CAMPO}`} />
      </div>
      <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Descripción (se ve bajo el vídeo)" rows={2} className={CAMPO} />
      <label className="flex items-center gap-2 font-sans text-label text-ink-2">
        Duración (minutos)
        <input value={minutos} onChange={e => setMinutos(e.target.value)} placeholder="0" inputMode="decimal" className={`w-20 ${CAMPO}`} />
      </label>

      <div className="space-y-2">
        <p className="font-mono text-caption uppercase tracking-wider text-ink-2">Descargables</p>
        {resources.map((r, i) => (
          <div key={i} className="flex gap-2 flex-wrap items-center">
            <select value={r.kind} onChange={e => cambiarRecurso(i, { kind: e.target.value as 'pdf' | 'link' })} className="bg-bg border border-control-line rounded-control p-2 text-title-s text-ink" aria-label="Tipo de descargable">
              <option value="pdf">PDF</option>
              <option value="link">Enlace</option>
            </select>
            <input value={r.title} onChange={e => cambiarRecurso(i, { title: e.target.value })} placeholder="Título" className={`flex-1 min-w-[6rem] ${CAMPO}`} />
            <input value={r.url} onChange={e => cambiarRecurso(i, { url: e.target.value })} placeholder="https://…" className={`flex-[2] min-w-[8rem] ${CAMPO}`} />
            <button type="button" onClick={() => setResources(prev => prev.filter((_, k) => k !== i))} aria-label="Quitar descargable" className="text-ink-2 hover:text-danger">
              <Icon name="close" size="s" />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setResources(prev => [...prev, { kind: 'pdf', title: '', url: '' }])} className="font-sans text-caption font-bold text-accent-ink hover:text-accent-press">
          + Añadir descargable
        </button>
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={onCancel} className="flex-1">Cancelar</Button>
        <Button type="submit" disabled={guardando} className="flex-1">{guardando ? 'Guardando...' : inicial ? 'Guardar cambios' : 'Crear lección'}</Button>
      </div>
    </form>
  );
}

export default function LeccionesCoach() {
  const queryClient = useQueryClient();
  const { confirm, ConfirmDialog } = useConfirm();
  const { data: courses = [] } = useQuery({ queryKey: ['academyCourses'], queryFn: getAllCourses });
  const { data: lessons = [], isPending } = useQuery({ queryKey: ['academyLessons'], queryFn: getAllLessons });
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cursosOrdenados = [...courses].sort((a, b) => a.order - b.order);
  const setLecciones = (fn: (prev: AcademyLesson[]) => AcademyLesson[]) =>
    queryClient.setQueryData<AcademyLesson[]>(['academyLessons'], prev => fn(prev ?? []));
  const setLessonCount = (courseId: string, n: number) =>
    queryClient.setQueryData<AcademyCourse[]>(['academyCourses'], prev => prev?.map(c => (c.id === courseId ? { ...c, lessonCount: n } : c)));

  const crear = async (d: DatosLeccion) => {
    setGuardando(true);
    try {
      const delCurso = leccionesDeCurso(lessons, d.courseId);
      const order = delCurso.length > 0 ? delCurso[delCurso.length - 1].order + 1 : 0;
      const lesson = await createLesson({ ...d, order });
      setLecciones(prev => [...prev, lesson]);
      await updateCourse(d.courseId, { lessonCount: delCurso.length + 1 });
      setLessonCount(d.courseId, delCurso.length + 1);
      setCreando(false);
    } finally { setGuardando(false); }
  };

  const guardarEdicion = async (l: AcademyLesson, d: DatosLeccion) => {
    setGuardando(true);
    try {
      const { courseId: _fijo, ...cambios } = d;
      await updateLesson(l.id, cambios);
      setLecciones(prev => prev.map(x => (x.id === l.id ? { ...x, ...cambios } : x)));
      setEditando(null);
    } finally { setGuardando(false); }
  };

  const mover = async (l: AcademyLesson, delta: -1 | 1) => {
    const cambios = moverElemento(leccionesDeCurso(lessons, l.courseId), l.id, delta);
    if (cambios.length === 0) return;
    const orden = new Map(cambios.map(c => [c.id, c.order]));
    setLecciones(prev => prev.map(x => (orden.has(x.id) ? { ...x, order: orden.get(x.id)! } : x)));
    for (const c of cambios) await updateLesson(c.id, { order: c.order });
  };

  const borrar = async (l: AcademyLesson) => {
    if (!await confirm(`¿Borrar la lección «${l.title}»?`)) return;
    setLecciones(prev => prev.filter(x => x.id !== l.id));
    await deleteLesson(l.id);
    if (courses.some(c => c.id === l.courseId)) {
      const quedan = lessons.filter(x => x.courseId === l.courseId && x.id !== l.id).length;
      await updateCourse(l.courseId, { lessonCount: quedan });
      setLessonCount(l.courseId, quedan);
    }
  };

  const fila = (l: AcademyLesson, i: number, total: number) => (
    editando === l.id ? (
      <LessonForm key={l.id} cursos={cursosOrdenados} inicial={l} guardando={guardando} onSubmit={d => void guardarEdicion(l, d)} onCancel={() => setEditando(null)} />
    ) : (
      <div key={l.id} className="flex items-center gap-2 bg-raised border border-hairline rounded-surface p-3">
        <div className="flex flex-col flex-shrink-0">
          <button onClick={() => void mover(l, -1)} disabled={i === 0} aria-label={`Subir ${l.title}`} className="text-ink-3 hover:text-accent-ink disabled:opacity-20"><Icon name="keyboard_arrow_up" size="s" /></button>
          <button onClick={() => void mover(l, 1)} disabled={i === total - 1} aria-label={`Bajar ${l.title}`} className="text-ink-3 hover:text-accent-ink disabled:opacity-20"><Icon name="keyboard_arrow_down" size="s" /></button>
        </div>
        <span className="font-mono text-caption text-ink-3 w-5 text-center flex-shrink-0">{i + 1}</span>
        <div className="flex-1 min-w-0">
          <p className="font-sans font-bold text-body-s text-ink truncate">{l.title}</p>
          <p className="text-caption text-ink-2 font-mono">
            {l.durationSec ? `${Math.round(l.durationSec / 60)} min` : 'sin duración'}
            {l.resources?.length ? ` · ${l.resources.length} descargable${l.resources.length === 1 ? '' : 's'}` : ''}
          </p>
        </div>
        <button onClick={() => setEditando(l.id)} aria-label={`Editar ${l.title}`} className="text-ink-2 hover:text-accent-ink flex-shrink-0"><Icon name="edit" size="s" /></button>
        <button onClick={() => void borrar(l)} aria-label={`Borrar ${l.title}`} className="text-ink-2 hover:text-danger flex-shrink-0"><Icon name="delete" size="s" /></button>
      </div>
    )
  );

  const sueltas = lessons.filter(l => !courses.some(c => c.id === l.courseId)).sort((a, b) => a.order - b.order);

  return (
    <Card
      title="Lecciones"
      action={
        <button onClick={() => setCreando(v => !v)} className="flex items-center gap-1 text-caption font-mono font-bold uppercase text-accent-ink hover:text-accent-press">
          <Icon name={creando ? 'close' : 'add'} size="s" />
          {creando ? 'Cancelar' : 'Nueva lección'}
        </button>
      }
    >
      <ConfirmDialog />
      {creando && <LessonForm cursos={cursosOrdenados} guardando={guardando} onSubmit={d => void crear(d)} onCancel={() => setCreando(false)} />}

      {isPending ? (
        <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
      ) : lessons.length === 0 ? (
        <p className="text-label text-ink-3 font-sans py-2">Todavía no hay lecciones.</p>
      ) : (
        <div className="space-y-5">
          {cursosOrdenados.map(c => {
            const delCurso = leccionesDeCurso(lessons, c.id);
            if (delCurso.length === 0) return null;
            return (
              <section key={c.id} className="space-y-2">
                <h4 className="font-sans font-bold text-body-s text-ink flex items-center gap-2">
                  {c.title}
                  <span className="font-mono text-caption font-normal text-ink-3">{delCurso.length} lección{delCurso.length === 1 ? '' : 'es'}</span>
                </h4>
                {delCurso.map((l, i) => fila(l, i, delCurso.length))}
              </section>
            );
          })}
          {sueltas.length > 0 && (
            <section className="space-y-2">
              <h4 className="font-sans font-bold text-body-s text-warning">Sin curso (quedaron al borrar un curso)</h4>
              {sueltas.map(l => (
                <div key={l.id} className="flex items-center gap-2 bg-raised border border-hairline rounded-surface p-3">
                  <p className="flex-1 min-w-0 font-sans font-bold text-body-s text-ink truncate">{l.title}</p>
                  <button onClick={() => void borrar(l)} aria-label={`Borrar ${l.title}`} className="text-ink-2 hover:text-danger flex-shrink-0"><Icon name="delete" size="s" /></button>
                </div>
              ))}
            </section>
          )}
        </div>
      )}
    </Card>
  );
}
