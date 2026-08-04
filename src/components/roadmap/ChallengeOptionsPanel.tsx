import React, { useMemo, useState } from 'react';
import { Roadmap, WeeklyChallenge, ChallengeKind } from '../../types';
import { saveWeeklyChallenge } from '../../dbService';
import {
  generateChallengeOptions, buildChallengeFromOption, eligibleLiftIds,
  ChallengeData, ChallengeOption,
} from '../../utils/challengeOptions';
import { addDays } from '../../utils/trainingWeek';

interface Props {
  athleteEmail: string;
  challengeData: ChallengeData; // ya trae liftExerciseIds desde roadmap.challengeConfig
  roadmap: Roadmap;
  onSaveRoadmap: (updated: Roadmap) => Promise<void>;
  previousKind?: ChallengeKind;
  currentChallenge: WeeklyChallenge | null; // reto de "esta semana" ya cargado por ChallengeManager
  nextChallenge: WeeklyChallenge | null;
  onAssigned: (target: 'esta' | 'siguiente', challenge: WeeklyChallenge) => void;
}

export default function ChallengeOptionsPanel({
  athleteEmail, challengeData, roadmap, onSaveRoadmap, previousKind,
  currentChallenge, nextChallenge, onAssigned,
}: Props) {
  const today = new Date().toISOString().split('T')[0];
  const nextWeekDay = addDays(today, 7);
  const [weekTarget, setWeekTarget] = useState<'esta' | 'siguiente'>('esta');
  const [assigning, setAssigning] = useState<string | null>(null);
  const [showEligible, setShowEligible] = useState(false);
  const [savingEligible, setSavingEligible] = useState(false);

  const targetDay = weekTarget === 'esta' ? today : nextWeekDay;
  const existingForTarget = weekTarget === 'esta' ? currentChallenge : nextChallenge;
  const overwriting = existingForTarget?.origin === 'auto' && (existingForTarget.progressValue ?? 0) > 0;

  const options = useMemo(
    () => generateChallengeOptions({ ...challengeData, athleteId: athleteEmail, today: targetDay, previousKind }),
    [challengeData, athleteEmail, targetDay, previousKind],
  );

  async function assignOption(opt: ChallengeOption) {
    setAssigning(opt.kind);
    try {
      const challenge = buildChallengeFromOption(opt, { athleteId: athleteEmail, today: targetDay, origin: 'coach' });
      await saveWeeklyChallenge(challenge);
      onAssigned(weekTarget, challenge);
    } finally {
      setAssigning(null);
    }
  }

  // Ejercicios candidatos: los que tienen al menos una serie registrada.
  const loggedExerciseIds = useMemo(() => {
    const ids = new Set<string>();
    for (const log of challengeData.workoutLogs) {
      for (const entry of log.entries) if (entry.sets.length > 0) ids.add(entry.exerciseId);
    }
    return ids;
  }, [challengeData.workoutLogs]);
  const candidateExercises = useMemo(
    () => challengeData.exercises.filter(e => loggedExerciseIds.has(e.id)),
    [challengeData.exercises, loggedExerciseIds],
  );
  const defaultEligible = useMemo(
    () => eligibleLiftIds(candidateExercises, undefined),
    [candidateExercises],
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(roadmap.challengeConfig?.liftExerciseIds ?? [...defaultEligible]),
  );

  function toggleExercise(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function saveEligible() {
    setSavingEligible(true);
    try {
      await onSaveRoadmap({ ...roadmap, challengeConfig: { ...roadmap.challengeConfig, liftExerciseIds: [...selectedIds] } });
    } finally {
      setSavingEligible(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-mono text-caption uppercase tracking-widest text-ink-2">Opciones de reto</p>
        <select
          value={weekTarget}
          onChange={e => setWeekTarget(e.target.value as 'esta' | 'siguiente')}
          className="bg-bg border border-hairline rounded-control p-2 text-title-s text-white focus:outline-none focus:border-accent"
        >
          <option value="esta">Esta semana</option>
          <option value="siguiente">Semana que viene</option>
        </select>
      </div>

      {overwriting && (
        <p className="font-sans text-caption text-orange-400">
          Ya hay un reto automático en curso con progreso — enviar una opción lo sobrescribirá.
        </p>
      )}

      {options.length === 0 ? (
        <p className="text-label text-ink-3 font-sans">Sin datos suficientes todavía para proponer opciones.</p>
      ) : (
        <div className="space-y-2">
          {options.map(opt => (
            <div
              key={opt.kind}
              className="bg-surface border rounded-surface p-3 space-y-2"
              style={{ borderColor: opt.isMilestone ? '#fbcb1a55' : 'rgba(255,255,255,0.07)' }}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-sans font-bold text-white text-body-s">{opt.title}</p>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {opt.isMilestone && (
                    <span className="font-mono text-caption uppercase px-2 rounded-full bg-accent/15 text-accent">HITO</span>
                  )}
                  <span className="font-mono text-caption text-ink-2">{opt.score}</span>
                </div>
              </div>
              <p className="text-label text-ink-2 font-sans leading-relaxed">{opt.description}</p>
              <p className="text-caption text-ink-3 font-mono">Por qué: {opt.reason}</p>
              <button
                onClick={() => assignOption(opt)}
                disabled={assigning !== null}
                className="w-full py-2 bg-accent text-black font-sans font-bold text-label uppercase rounded-control hover:bg-accent-press active:scale-95 transition-all disabled:opacity-50"
              >
                {assigning === opt.kind ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="text-caption text-ink-3 font-sans">
        Si no eliges ninguna antes del martes, se enviará automáticamente la de mayor puntuación.
      </p>

      <div className="pt-2 border-t border-hairline">
        <button onClick={() => setShowEligible(v => !v)} className="font-mono text-caption text-data hover:underline">
          {showEligible ? 'Ocultar' : 'Ver'} ejercicios elegibles para retos de carga
        </button>
        {showEligible && (
          <div className="mt-2 space-y-2">
            {candidateExercises.length === 0 ? (
              <p className="text-label text-ink-3 font-sans">Aún no hay ejercicios con series registradas.</p>
            ) : (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {candidateExercises.map(ex => (
                  <label key={ex.id} className="flex items-center gap-2 text-label text-ink-2 font-mono">
                    <input type="checkbox" checked={selectedIds.has(ex.id)} onChange={() => toggleExercise(ex.id)} />
                    {ex.name}
                  </label>
                ))}
              </div>
            )}
            <button
              onClick={saveEligible}
              disabled={savingEligible}
              className="py-2 px-3 bg-surface border border-hairline text-ink-2 font-mono text-title-s rounded-control hover:text-white disabled:opacity-50"
            >
              {savingEligible ? 'Guardando...' : 'Guardar elegibles'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
