import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ExercisePersonalNote } from '../types';
import { getExercises, getExerciseNotesForAthlete, saveExerciseNote } from '../dbService';
import Skeleton from './Skeleton';

interface Props {
  athleteEmail: string;
  // Ejercicios del programa actual (rutinas asignadas). El selector se acota a
  // ellos — más los que ya tengan observación, para no dejar notas huérfanas
  // inaccesibles cuando cambia el programa. Vacío/ausente = biblioteca entera.
  programExerciseIds?: string[];
}

export default function ExercisePersonalNotesPanel({ athleteEmail, programExerciseIds }: Props) {
  const queryClient = useQueryClient();
  const notesQueryKey = ['exerciseNotesForAthlete', athleteEmail] as const;
  const { data: exercises = [], isPending: loadingExercises } = useQuery({
    queryKey: ['exercises'],
    queryFn: getExercises,
  });
  const { data: notes = [], isPending: loadingNotes } = useQuery({
    queryKey: notesQueryKey,
    queryFn: () => getExerciseNotesForAthlete(athleteEmail),
  });
  const loading = loadingExercises || loadingNotes;
  const [selectedExerciseId, setSelectedExerciseId] = useState('');
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const existing = notes.find(n => n.exerciseId === selectedExerciseId);
    setText(existing?.observation ?? '');
  }, [selectedExerciseId, notes]);

  const handleSave = async () => {
    if (!selectedExerciseId) return;
    setSaving(true);
    try {
      const note = await saveExerciseNote({
        exerciseId: selectedExerciseId, athleteId: athleteEmail,
        observation: text.trim(), updatedAt: new Date().toISOString(),
      });
      queryClient.setQueryData<ExercisePersonalNote[]>(notesQueryKey, prev =>
        [...(prev ?? []).filter(n => n.exerciseId !== selectedExerciseId), note]);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const withNotes = new Set(notes.filter(n => n.observation.trim()).map(n => n.exerciseId));

  const inProgram = programExerciseIds?.length ? new Set(programExerciseIds) : null;
  const selectable = inProgram
    ? exercises.filter(ex => inProgram.has(ex.id) || withNotes.has(ex.id))
    : exercises;

  return (
    <div className="bg-surface border border-hairline rounded-surface p-5">
      <h3 className="font-sans font-bold text-title-s text-white flex items-center gap-2 mb-3">
        <span className="material-symbols-outlined text-accent text-title-s">edit_note</span>
        Observación personalizada por ejercicio
        <span className="ml-2 text-caption font-sans text-ink-3 normal-case font-sans">(solo la ve este atleta)</span>
      </h3>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : (
        <div className="space-y-3">
          <select
            value={selectedExerciseId}
            onChange={e => setSelectedExerciseId(e.target.value)}
            className="w-full bg-bg border border-hairline rounded-control px-3 py-3 text-label text-white focus:outline-none focus:border-accent"
          >
            <option value="">{inProgram ? 'Selecciona un ejercicio de su programa...' : 'Selecciona un ejercicio...'}</option>
            {selectable.map(ex => (
              <option key={ex.id} value={ex.id}>{withNotes.has(ex.id) ? '● ' : ''}{ex.name}</option>
            ))}
          </select>
          {inProgram && (
            <p className="font-sans text-caption text-ink-3">Mostrando los ejercicios de sus rutinas asignadas (y los que ya tienen observación).</p>
          )}

          {selectedExerciseId && (
            <>
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="ej. Utiliza elevación de talones..."
                rows={3}
                className="w-full bg-bg border border-hairline rounded-control p-3 text-label text-white focus:outline-none focus:border-accent resize-none"
              />
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-3 bg-accent text-black font-sans font-bold text-label uppercase rounded-control hover:bg-accent-press active:scale-95 transition-all disabled:opacity-50"
              >
                {saving ? 'Guardando...' : 'Guardar observación'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
