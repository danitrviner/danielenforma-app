import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserProfile, CoachNote } from '../types';
import { getCoachNotes, createCoachNote, updateCoachNote, deleteCoachNote } from '../dbService';
import { useToast } from '../hooks/useToast';
import { Skeleton } from './ui';
import { ListRow, Button } from './ui';

interface AthleteWithPendingNotes {
  userId: string;
  displayName: string;
  pendingNotesCount: number;
}

interface Props {
  athletes: UserProfile[];
  /** Atletas con notas de entreno sin leer — sección "Del atleta". */
  athletesWithPendingNotes?: AthleteWithPendingNotes[];
  onOpenAthleteNotes?: (userId: string) => void;
}

// Tarjeta unificada de "Pendientes": dos fuentes de datos separadas por
// diseño — notas del atleta sin leer (WorkoutLog.note/noteCoachSeen) y el
// to-do privado del coach (CoachNote, colección `coachNotes`) — pero una
// sola tarjeta visual para no fragmentar la atención del coach en el
// dashboard. Nada de esta sección es visible para los atletas.
export default function CoachNotesPanel({ athletes, athletesWithPendingNotes = [], onOpenAthleteNotes }: Props) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const queryKey = ['coachNotes'] as const;
  const { data: notes = [], isPending: loading } = useQuery({
    queryKey,
    queryFn: getCoachNotes,
  });
  const [showForm, setShowForm] = useState(false);
  const [text, setText] = useState('');
  const [relatedEmail, setRelatedEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    try {
      const relatedAthlete = athletes.find(a => a.email === relatedEmail);
      const note = await createCoachNote({
        text: text.trim(),
        relatedAthleteEmail: relatedAthlete?.email,
        relatedAthleteName: relatedAthlete?.displayName,
        done: false,
        createdAt: new Date().toISOString(),
      });
      queryClient.setQueryData<CoachNote[]>(queryKey, prev => [...(prev ?? []), note]);
      setText('');
      setRelatedEmail('');
      setShowForm(false);
    } catch (err) {
      console.error(err);
      showToast('No se pudo crear la nota.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (note: CoachNote) => {
    queryClient.setQueryData<CoachNote[]>(queryKey, prev =>
      prev?.map(n => n.id === note.id ? { ...n, done: !n.done } : n));
    try { await updateCoachNote(note.id, { done: !note.done }); } catch (err) { console.error(err); showToast('No se pudo actualizar la nota.'); }
  };

  const handleDelete = async (id: string) => {
    queryClient.setQueryData<CoachNote[]>(queryKey, prev => prev?.filter(n => n.id !== id));
    try { await deleteCoachNote(id); } catch (err) { console.error(err); showToast('No se pudo eliminar la nota.'); }
  };

  const pending = notes.filter(n => !n.done);
  const done = notes.filter(n => n.done);

  const totalPendingAthleteNotes = athletesWithPendingNotes.reduce((n, a) => n + a.pendingNotesCount, 0);

  return (
    <div className="bg-surface border border-hairline rounded-surface p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-sans font-bold text-title-s text-white flex items-center gap-2">
          <span className="material-symbols-outlined text-amber-300 text-title-s">sticky_note_2</span>
          Pendientes
        </h3>
      </div>

      {/* Del atleta — notas de entreno sin leer (WorkoutLog.note/noteCoachSeen) */}
      <div className="mb-4 pb-4 border-b border-hairline">
        <div className="flex items-center justify-between mb-2">
          <span className="font-sans text-label uppercase tracking-wider font-bold text-ink-2">Del atleta</span>
          {totalPendingAthleteNotes > 0 ? (
            <span className="text-caption bg-amber-500/10 text-amber-300 px-3 border border-amber-500/25 rounded-control font-sans uppercase font-bold">
              {totalPendingAthleteNotes} por leer
            </span>
          ) : (
            <span className="text-caption bg-accent/10 text-accent px-3 border border-accent/20 rounded-control font-sans uppercase font-bold">Al día</span>
          )}
        </div>
        {totalPendingAthleteNotes === 0 ? (
          <p className="text-label text-ink-3 font-sans">Sin notas nuevas de ejercicios o entrenamientos.</p>
        ) : (
          <div className="space-y-2">
            {athletesWithPendingNotes.filter(a => a.pendingNotesCount > 0).slice(0, 3).map(a => (
              <button
                key={a.userId}
                onClick={() => onOpenAthleteNotes?.(a.userId)}
                className="w-full flex items-center justify-between bg-raised/50 hover:bg-raised px-3 py-2 rounded-control border border-hairline text-left transition-colors"
              >
                <span className="text-label text-white font-sans truncate">{a.displayName}</span>
                <span className="text-caption font-mono font-bold text-amber-300 flex-shrink-0 ml-2">{a.pendingNotesCount}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Mías — to-do privado del coach */}
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-sans font-bold text-label uppercase tracking-wider text-ink-2 flex items-center gap-2">
          Mías
          {pending.length > 0 && (
            <span className="bg-accent text-black text-caption font-bold px-2 rounded-full">{pending.length}</span>
          )}
        </h4>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1 font-mono text-caption text-ink-2 hover:text-accent transition-colors border border-hairline px-3 py-2 rounded-control"
        >
          <span className="material-symbols-outlined text-body-s">{showForm ? 'close' : 'add'}</span>
          {showForm ? 'Cancelar' : 'Nueva nota'}
        </button>
      </div>
      <p className="font-sans text-caption text-ink-3 mb-3">
        Privadas — solo tú las ves. Ej: "Enviar mensaje a Ana sobre la dieta", "Cambiar rutina a Marcos".
      </p>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-raised border border-hairline rounded-surface p-3 mb-3 space-y-2">
          <input
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Escribe la nota..."
            className="w-full bg-bg border border-hairline rounded-control p-2 text-title-s text-white focus:outline-none focus:border-accent"
            required
            autoFocus
          />
          <select
            value={relatedEmail}
            onChange={e => setRelatedEmail(e.target.value)}
            className="w-full bg-bg border border-hairline rounded-control p-2 text-title-s text-white focus:outline-none focus:border-accent"
          >
            <option value="">— Sin cliente asociado —</option>
            {athletes.map(a => (
              <option key={a.email} value={a.email}>{a.displayName}</option>
            ))}
          </select>
          <Button type="submit" disabled={saving} fullWidth>
            {saving ? 'Guardando...' : 'Guardar nota'}
          </Button>
        </form>
      )}

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : notes.length === 0 ? (
        <p className="text-label text-ink-3 font-sans py-2">Sin notas.</p>
      ) : (
        <div className="space-y-2">
          {[...pending, ...done].map(n => (
            <ListRow
              key={n.id}
              className={`border rounded-surface ${n.done ? 'bg-surface border-hairline opacity-60' : 'bg-raised border-hairline'}`}
              leading={
                <button
                  onClick={() => handleToggle(n)}
                  className={`w-5 h-5 rounded-control flex-shrink-0 border-2 flex items-center justify-center transition-colors ${n.done ? 'bg-accent border-accent' : 'border-hairline'}`}
                >
                  {n.done && <span className="material-symbols-outlined text-black" style={{ fontSize: '13px' }}>check</span>}
                </button>
              }
              title={n.text}
              subtitle={n.relatedAthleteName}
              trailing={
                <button
                  onClick={() => handleDelete(n.id)}
                  className="text-ink-2 hover:text-red-400 transition-colors flex-shrink-0 p-1"
                >
                  <span className="material-symbols-outlined text-body-s">delete</span>
                </button>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
