import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AcademyAccess, AcademyCourse } from '../../types';
import {
  getAllCourses, getAllUserProfilesOrThrow, getAllAcademyAccess, setAcademyAccess, createNotificationDeduped,
} from '../../dbService';
import { atletasActivos } from '../../utils/atletas';
import { cursoVisible, cursosAlActivar, alternarCurso, cursosPublicados } from '../../utils/academyAdmin';
import { Avatar, Skeleton, Card } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Acceso a Training Lab, a mano y curso a curso (Dani, 23-10).

   Arriba se elige un curso; cada atleta tiene su acceso general (ve o no la
   pestaña) y la casilla «Ve este curso». Al dar acceso por primera vez se le
   abren solo los cursos marcados como «iniciales»; los accesos de antes, sin
   lista, siguen viendo todo lo publicado hasta que se toque un curso.
   ═══════════════════════════════════════════════════════════════════════════ */

export default function AccesoCoach({ coachEmail }: { coachEmail: string }) {
  const queryClient = useQueryClient();
  const { data: profiles = [], isPending: loadingProfiles } = useQuery({ queryKey: ['userProfiles'], queryFn: getAllUserProfilesOrThrow });
  const { data: accessList = [], isPending: loadingAccess } = useQuery({ queryKey: ['academyAccessAll'], queryFn: getAllAcademyAccess });
  const { data: courses = [], isPending: loadingCourses } = useQuery({ queryKey: ['academyCourses'], queryFn: getAllCourses });
  const [cursoElegido, setCursoElegido] = useState<string>('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const publicados = cursosPublicados(courses);
  const curso = publicados.find(c => c.id === cursoElegido) ?? publicados[0];
  const athletes = atletasActivos(profiles).filter(p => p.role === 'client');
  const accessByEmail = new Map(accessList.map(a => [a.athleteId, a]));

  const guardar = async (email: string, enabled: boolean, grantedCourses: string[] | undefined) => {
    const updated = await setAcademyAccess(email, enabled, coachEmail, grantedCourses);
    queryClient.setQueryData<AcademyAccess[]>(['academyAccessAll'], prev => [...(prev ?? []).filter(a => a.athleteId !== email), updated]);
    return updated;
  };
  const avisar = (email: string, updated: AcademyAccess, body: string, title = 'Training Lab desbloqueado 🎓') => {
    createNotificationDeduped(`notif_academy_access_${email}_${updated.grantedAt}`, {
      recipientEmail: email, type: 'academy_access_granted', title, body,
      link: 'academy', createdAt: new Date().toISOString(), read: false,
    }).catch(err => console.warn('createNotificationDeduped (academy access) failed:', err));
  };

  const toggleGeneral = async (email: string, enabled: boolean) => {
    const actual = accessByEmail.get(email) ?? null;
    const updated = await guardar(email, enabled, enabled ? cursosAlActivar(actual, courses) : actual?.grantedCourses);
    if (enabled) avisar(email, updated, 'Tu entrenador te ha dado acceso a Training Lab.');
  };

  const toggleCurso = async (email: string, c: AcademyCourse, abrir: boolean) => {
    const actual = accessByEmail.get(email) ?? null;
    const updated = await guardar(email, true, alternarCurso(actual, c.id, abrir, courses));
    if (abrir) avisar(email, updated, `Tu entrenador te ha abierto el curso «${c.title}».`, 'Nuevo curso en Training Lab 🎓');
  };

  const toggleSelected = (email: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email); else next.add(email);
      return next;
    });
  };
  const grantSelected = async () => {
    for (const email of selected) await toggleGeneral(email, true);
    setSelected(new Set());
  };

  if (loadingProfiles || loadingAccess || loadingCourses) {
    return <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>;
  }

  const hayInicial = publicados.some(c => c.inicial);

  return (
    <Card
      title="Acceso por atleta"
      action={selected.size > 0 && (
        <button onClick={grantSelected} className="text-caption font-sans font-bold uppercase text-accent-ink hover:text-accent-press">
          Dar acceso a {selected.size} seleccionado{selected.size === 1 ? '' : 's'}
        </button>
      )}
    >
      <div className="space-y-3">
        {publicados.length === 0 ? (
          <p className="font-sans text-label text-ink-3">No hay cursos publicados todavía: publica uno en la pestaña Cursos para poder abrirlo.</p>
        ) : (
          <>
            <label className="block">
              <span className="font-mono text-caption uppercase tracking-wider text-ink-2">Curso que abres</span>
              <select
                value={curso?.id ?? ''}
                onChange={e => setCursoElegido(e.target.value)}
                className="mt-1 w-full bg-bg border border-control-line rounded-control p-2 text-title-s text-ink focus:outline-none focus:border-accent"
              >
                {publicados.map(c => <option key={c.id} value={c.id}>{c.title}{c.inicial ? ' · inicial' : ''}</option>)}
              </select>
            </label>
            <p className="font-sans text-caption text-ink-3">
              {hayInicial
                ? 'Al dar acceso a un atleta nuevo se le abren solo los cursos «iniciales»; el resto los abres tú aquí.'
                : 'Ningún curso está marcado como inicial: un atleta nuevo verá todos los publicados. Márcalo en Cursos › Editar.'}
              {' '}Los atletas con acceso de antes, sin lista, ven todo lo publicado hasta que cambies un curso suyo.
            </p>
          </>
        )}

        {athletes.map(a => {
          const acceso = accessByEmail.get(a.email) ?? null;
          const enabled = acceso?.enabled ?? false;
          return (
            <div key={a.email} className="flex items-center gap-3 bg-raised border border-hairline rounded-surface p-3 flex-wrap">
              <input type="checkbox" checked={selected.has(a.email)} onChange={() => toggleSelected(a.email)} aria-label={`Seleccionar a ${a.displayName}`} className="w-4 h-4 accent-accent" />
              <Avatar src={a.avatarUrl} name={a.displayName} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
              <p className="flex-1 min-w-[8rem] font-sans font-bold text-body-s text-ink truncate">{a.displayName}</p>
              {curso && (
                <label className={`flex items-center gap-1.5 font-sans text-caption ${enabled ? 'text-ink-2' : 'text-ink-4'}`}>
                  <input
                    type="checkbox"
                    disabled={!enabled}
                    checked={cursoVisible(acceso, curso.id)}
                    onChange={e => void toggleCurso(a.email, curso, e.target.checked)}
                    aria-label={`${a.displayName} ve ${curso.title}`}
                    className="w-4 h-4 accent-accent"
                  />
                  Ve este curso
                </label>
              )}
              <button
                onClick={() => void toggleGeneral(a.email, !enabled)}
                className={`text-caption font-mono font-bold uppercase px-3 py-2 rounded-full transition-colors ${enabled ? 'bg-data/10 text-data' : 'bg-hairline text-ink-3'}`}
              >
                {enabled ? 'Acceso activo' : 'Sin acceso'}
              </button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
