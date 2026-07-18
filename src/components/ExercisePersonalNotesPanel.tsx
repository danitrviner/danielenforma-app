import React, { useEffect, useState } from 'react';
import { Exercise, ExercisePersonalNote } from '../types';
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
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [notes, setNotes] = useState<ExercisePersonalNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedExerciseId, setSelectedExerciseId] = useState('');
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([getExercises(), getExerciseNotesForAthlete(athleteEmail)])
      .then(([exs, ns]) => { setExercises(exs); setNotes(ns); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [athleteEmail]);

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
      setNotes(prev => [...prev.filter(n => n.exerciseId !== selectedExerciseId), note]);
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
    <div className="bg-[#181816] border border-white/7 rounded-2xl p-5">
      <h3 className="font-sans font-bold text-base text-white flex items-center gap-2 mb-3">
        <span className="material-symbols-outlined text-[#fbcb1a] text-base">edit_note</span>
        Observación personalizada por ejercicio
        <span className="ml-2 text-[9px] font-mono text-[#555] normal-case font-sans">(solo la ve este atleta)</span>
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
            className="w-full bg-[#0e0e0e] border border-white/7 rounded-lg px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#fbcb1a]"
          >
            <option value="">{inProgram ? 'Selecciona un ejercicio de su programa...' : 'Selecciona un ejercicio...'}</option>
            {selectable.map(ex => (
              <option key={ex.id} value={ex.id}>{withNotes.has(ex.id) ? '● ' : ''}{ex.name}</option>
            ))}
          </select>
          {inProgram && (
            <p className="font-mono text-[9px] text-[#555]">Mostrando los ejercicios de sus rutinas asignadas (y los que ya tienen observación).</p>
          )}

          {selectedExerciseId && (
            <>
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="ej. Utiliza elevación de talones..."
                rows={3}
                className="w-full bg-[#0e0e0e] border border-white/7 rounded-lg p-3 text-xs text-white focus:outline-none focus:border-[#fbcb1a] resize-none"
              />
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2.5 bg-[#fbcb1a] text-black font-sans font-bold text-xs uppercase rounded-lg hover:bg-[#d4a800] active:scale-95 transition-all disabled:opacity-50 shadow-sm"
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
