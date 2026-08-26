import React, { useEffect, useMemo, useState } from 'react';
import {
  UserProfile, WorkoutAssignment, Workout, WorkoutEntryLog, WorkoutLog, Exercise, CardioAssignment,
} from '../../types';
import { Button, Icon, Dialog } from '../ui';
import Pager from '../ui/Pager';
import Coachmark from '../Coachmark';
import ExerciseBestSetCard from '../ExerciseBestSetCard';
import { exerciseSessionHistory, ExerciseBestProgress } from '../../utils/athleteMetrics';
import { allTimeBestBefore } from '../../utils/trainingReport';
import { startRestTimer, stopRestTimer } from '../../services/restTimer';
import { haptics } from '../../services/haptics';
import { formatDate } from '../../utils/trainingWeek';
import { SetInput } from './setInput';
import ExerciseCard from './ExerciseCard';
import ExerciseCloseCard from './ExerciseCloseCard';

export interface SessionCelebration {
  isFirstEver: boolean;
  totalSets: number;
  tonnage: number;
  prs: { exerciseId: string; name: string; newBest: number }[];
}

interface Props {
  profile: UserProfile;
  activeAssignment: WorkoutAssignment;
  activeWorkout: Workout;
  playerSets: SetInput[][];
  updateSet: (exIdx: number, sIdx: number, field: keyof SetInput, value: string | boolean) => void;
  addSetRow: (exIdx: number) => void;
  prevEntries: WorkoutEntryLog[];
  exerciseNoteInputs: string[];
  updateExerciseNote: (exIdx: number, value: string) => void;
  getExercise: (id: string) => Exercise | undefined;
  getPersonalNote: (exerciseId: string) => string | undefined;
  logs: WorkoutLog[];
  exerciseProgressById: Map<string, { progress: ExerciseBestProgress; trend: number[] }>;
  handleFinish: () => void | Promise<void>;
  isFinishing: boolean;
  canFinish: boolean;
  celebration: SessionCelebration | null;
  dismissCelebration: () => void;
  cerrarPlayer: () => void;
  onSkipSession: () => void | Promise<void>;
  sameDayCardio: CardioAssignment | null;
  videoTargetRef?: (el: HTMLElement | null) => void;
  setEditorTargetRef?: (el: HTMLElement | null) => void;
  firstSetRowTargetRef?: (el: HTMLElement | null) => void;
  onMarkActionDone: () => void;
}

/**
 * Sesión de entrenamiento activa — "Entreno · Serie en curso v2" del mockup.
 * Un ejercicio a la vez con swipe (Pager de ui/Pager.tsx), y al completar
 * todas sus series se sustituye por la tarjeta de cierre con récord/volumen.
 * Toda la lógica de negocio (autoguardado, prefill, cálculo de PR, guardado
 * final) vive en TrainingScreen.tsx — este componente es solo interacción.
 */
export default function WorkoutSessionPlayer({
  profile, activeAssignment, activeWorkout, playerSets, updateSet, addSetRow, prevEntries,
  exerciseNoteInputs, updateExerciseNote,
  getExercise, getPersonalNote, logs, exerciseProgressById, handleFinish, isFinishing, canFinish,
  celebration, dismissCelebration, cerrarPlayer, onSkipSession, sameDayCardio,
  videoTargetRef, setEditorTargetRef, firstSetRowTargetRef, onMarkActionDone,
}: Props) {
  const orderedExercises = activeWorkout.exercises.slice().sort((a, b) => a.order - b.order);
  const doneSetsTotal = playerSets.flat().filter(s => s.done).length;
  const totalSetsAll = playerSets.flat().length;

  const [pageIdx, setPageIdx] = useState(0);
  const [openVideoIdx, setOpenVideoIdx] = useState<number | null>(null);
  const [historyExId, setHistoryExId] = useState<string | null>(null);

  // Cronómetro de descanso — vive aquí (antes en TrainingScreen) porque solo
  // el player lo usa; se arranca al marcar una serie como hecha con el
  // `restSeconds` prescrito del ejercicio.
  //
  // Reloj de pared, no cuenta de ticks (Dani, 26-08: «bloqueas el móvil y el
  // temporizador se queda pillado»). El descuento anterior era un
  // `setTimeout` encadenado de 1 s: con la pantalla bloqueada o la app en
  // segundo plano, iOS y Android estrangulan o congelan los temporizadores de
  // JS, así que al volver el descanso seguía marcando los segundos que
  // faltaban cuando se apagó la pantalla. Aquí se guarda el INSTANTE de fin
  // (`endsAtMs`) y lo que falta se calcula contra `Date.now()`: se congele lo
  // que se congele, al volver el número es el correcto. Es el mismo criterio
  // que ya usaba la sesión de cardio (utils/cardioSession.ts).
  const [restTimer, setRestTimer] = useState<{ totalSeconds: number; endsAtMs: number; exerciseName: string } | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!restTimer) return;
    const marcarAhora = () => setNowMs(Date.now());
    marcarAhora();
    // 500 ms para que el segundo cambie a tiempo sin depender de que el tick
    // caiga justo en el borde; el coste es el mismo re-render que ya había.
    const id = window.setInterval(marcarAhora, 500);
    // Al volver de segundo plano el intervalo puede tardar en retomarse: se
    // recalcula en cuanto la pantalla vuelve a estar visible o la ventana
    // recupera el foco, sin esperar al siguiente tick.
    const alVolver = () => { if (document.visibilityState === 'visible') marcarAhora(); };
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('focus', marcarAhora);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('focus', marcarAhora);
    };
  }, [restTimer]);

  const restSecondsLeft = restTimer ? Math.max(0, Math.ceil((restTimer.endsAtMs - nowMs) / 1000)) : null;

  useEffect(() => {
    if (restSecondsLeft !== 0) return;
    navigator.vibrate?.([150, 80, 150]);
    stopRestTimer().catch(() => {});
    const id = setTimeout(() => setRestTimer(null), 3000);
    return () => clearTimeout(id);
  }, [restSecondsLeft]);

  // Igual que antes: se calcula una sola vez para toda la sesión, no dentro
  // del .map() de tarjetas (Rules of Hooks / coste).
  const priorBestByExercise = useMemo(
    () => allTimeBestBefore(logs, activeAssignment.date),
    [logs, activeAssignment.date],
  );

  const handleMarkDone = (exIdx: number, sIdx: number, markingDone: boolean) => {
    const we = orderedExercises[exIdx];
    const ex = getExercise(we.exerciseId);
    void haptics.light();
    updateSet(exIdx, sIdx, 'done', markingDone);
    if (markingDone) onMarkActionDone();
    if (markingDone && we.restSeconds) {
      const nombre = ex?.name || 'tu ejercicio';
      setRestTimer({ totalSeconds: we.restSeconds, endsAtMs: Date.now() + we.restSeconds * 1000, exerciseName: nombre });
      startRestTimer(nombre, we.restSeconds).catch(() => {});
    } else if (!markingDone) {
      stopRestTimer().catch(() => {});
    }
  };

  const addRestSeconds = (s: number) => {
    if (!restTimer) return;
    // Si el descanso ya había llegado a 0, los segundos se suman desde AHORA,
    // no desde un fin que ya quedó atrás.
    const endsAtMs = Math.max(Date.now(), restTimer.endsAtMs) + s * 1000;
    setRestTimer({ ...restTimer, totalSeconds: restTimer.totalSeconds + s, endsAtMs });
    // Y se reprograma el aviso nativo: si no, la notificación seguiría sonando
    // a la hora vieja, que es justo cuando el móvil está bloqueado y el atleta
    // depende de ella.
    startRestTimer(restTimer.exerciseName, Math.round((endsAtMs - Date.now()) / 1000)).catch(() => {});
  };

  const pages = orderedExercises.map((we, exIdx) => {
    const ex = getExercise(we.exerciseId);
    const exSets = playerSets[exIdx] || [];
    const prevEntry = prevEntries.find(e => e.exerciseId === we.exerciseId);
    const cerrado = exSets.length > 0 && exSets.every(s => s.done);
    const isLast = exIdx === orderedExercises.length - 1;

    if (cerrado) {
      return (
        <ExerciseCloseCard
          key={`${we.exerciseId}-${exIdx}`}
          we={we}
          ex={ex}
          exSets={exSets}
          priorBestOrm={priorBestByExercise.get(we.exerciseId)}
          noteValue={exerciseNoteInputs[exIdx] || ''}
          onNoteChange={v => updateExerciseNote(exIdx, v)}
          isLast={isLast}
          nextExerciseName={!isLast ? (getExercise(orderedExercises[exIdx + 1]?.exerciseId)?.name) : undefined}
          onNext={() => setPageIdx(i => Math.min(i + 1, orderedExercises.length - 1))}
          sameDayCardio={sameDayCardio}
        />
      );
    }

    return (
      <ExerciseCard
        key={`${we.exerciseId}-${exIdx}`}
        we={we}
        exIdx={exIdx}
        ex={ex}
        exSets={exSets}
        prevEntry={prevEntry}
        personalNote={getPersonalNote(we.exerciseId)}
        isVideoOpen={openVideoIdx === exIdx}
        onToggleVideo={() => setOpenVideoIdx(v => (v === exIdx ? null : exIdx))}
        onOpenHistory={() => setHistoryExId(we.exerciseId)}
        onUpdateSet={(sIdx, field, value) => updateSet(exIdx, sIdx, field, value)}
        onMarkDone={(sIdx, markingDone) => handleMarkDone(exIdx, sIdx, markingDone)}
        onAddRow={() => addSetRow(exIdx)}
        noteValue={exerciseNoteInputs[exIdx] || ''}
        onNoteChange={v => updateExerciseNote(exIdx, v)}
        restTimer={pageIdx === exIdx && restTimer && restSecondsLeft !== null
          ? { totalSeconds: restTimer.totalSeconds, secondsLeft: restSecondsLeft }
          : null}
        onSkipRest={() => { setRestTimer(null); stopRestTimer().catch(() => {}); }}
        onAddRestSeconds={s => addRestSeconds(s)}
        videoTargetRef={exIdx === 0 ? videoTargetRef : undefined}
        setEditorTargetRef={exIdx === 0 ? setEditorTargetRef : undefined}
        firstSetRowTargetRef={exIdx === 0 ? firstSetRowTargetRef : undefined}
      />
    );
  });

  return (
    <div className="space-y-6">
      <header className="pb-4 border-b border-hairline sticky top-[var(--header-h)] bg-bg/92 backdrop-blur-md z-[var(--z-sticky)] pt-2 space-y-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="s" icon="arrow_back" label="Volver" onClick={cerrarPlayer} className="shrink-0" />
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-title-l font-black uppercase tracking-tight text-ink truncate">{activeWorkout.name}</h1>
            <p className="font-mono text-caption text-ink-2">
              {formatDate(activeAssignment.date)} · EJERCICIO {String(pageIdx + 1).padStart(2, '0')}/{orderedExercises.length}
            </p>
          </div>
          <div className="flex-shrink-0 text-right">
            <span className="font-mono text-label text-accent font-bold">{doneSetsTotal}/{totalSetsAll}</span>
            <span className="block font-mono text-caption text-ink-2 uppercase">series hechas</span>
          </div>
        </div>

        {/* Barra segmentada — un tramo por ejercicio (mockup frame 01), sustituye
            al contador de texto como referencia visual rápida de dónde vas. */}
        <div className="flex gap-1.5" role="group" aria-label={`Ejercicio ${pageIdx + 1} de ${orderedExercises.length}`}>
          {orderedExercises.map((_, i) => {
            const exSets = playerSets[i] || [];
            const cerrado = exSets.length > 0 && exSets.every(s => s.done);
            return (
              <span
                key={i}
                className={`h-[3px] flex-1 rounded-full ${
                  i === pageIdx ? 'bg-accent' : cerrado ? 'bg-accent/45' : 'bg-hairline'
                }`}
              />
            );
          })}
        </div>
      </header>

      <Coachmark
        id="training_player_mark_set"
        email={profile.email}
        icon="touch_app"
        text="Marca el círculo al terminar cada serie — es lo que usa tu coach para progresarte."
      />

      <Pager value={pageIdx} onChange={setPageIdx} label="Ejercicios de la sesión" dots="none">
        {pages}
      </Pager>

      {/* Player action bar — ya no fija ni pegajosa: en el flujo normal, solo
          en la página del último ejercicio programado. En el resto de
          páginas no hay forma de terminar/saltar la sesión desde aquí. */}
      {pageIdx === orderedExercises.length - 1 && (
        <div className="px-4 pt-4">
          <div className="flex justify-center gap-3">
            <Button variant="secondary" size="l" icon="skip_next" label="Saltar sesión" onClick={onSkipSession} />
            <Button
              variant="primary" size="l" icon="flag" loading={isFinishing} loadingLabel="Guardando"
              disabled={!canFinish || !!celebration} onClick={handleFinish} className="flex-1 max-w-xs"
            >
              Terminar sesión
            </Button>
          </div>
        </div>
      )}

      {celebration && (
        <Dialog
          open
          onClose={dismissCelebration}
          size="s"
          label={celebration.isFirstEver ? 'Primera sesión registrada' : 'Entreno completado'}
          footer={<Button onClick={dismissCelebration} fullWidth>Genial</Button>}
        >
          <div className="space-y-5 text-center">
            <div className="w-16 h-16 mx-auto rounded-surface bg-accent/10 border border-accent/30 flex items-center justify-center">
              <Icon name={celebration.isFirstEver ? 'celebration' : 'bolt'} size="xl" filled className="text-accent" />
            </div>
            <div>
              <h2 className="font-sans font-bold text-title-m text-ink">
                {celebration.isFirstEver ? '¡Primera sesión registrada! 💪' : '¡Entreno completado! 💪'}
              </h2>
              <p className="text-body-s text-ink-2 mt-1">
                {celebration.isFirstEver ? 'Así se empieza — a partir de aquí, todo suma.' : 'Buen trabajo. Sigue así.'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-raised rounded-surface p-3">
                <p className="font-mono text-title-l font-bold text-ink tabular-nums">{celebration.totalSets}</p>
                <p className="font-mono text-caption text-ink-2 uppercase tracking-wide">Series</p>
              </div>
              <div className="bg-raised rounded-surface p-3">
                <p className="font-mono text-title-l font-bold text-ink tabular-nums">{Math.round(celebration.tonnage).toLocaleString('es-ES')}</p>
                <p className="font-mono text-caption text-ink-2 uppercase tracking-wide">kg movidos</p>
              </div>
            </div>
            {celebration.prs.length > 0 && (
              <div className="bg-accent/10 border border-accent/30 rounded-surface p-3 space-y-2 text-left">
                {celebration.prs.map(pr => (
                  <p key={pr.exerciseId} className="text-label text-accent flex items-center gap-2">
                    <Icon name="military_tech" size="s" />
                    Récord en {pr.name} — {pr.newBest} kg est.
                  </p>
                ))}
              </div>
            )}
          </div>
        </Dialog>
      )}

      {historyExId && (() => {
        const progress = exerciseProgressById.get(historyExId);
        const sessions = exerciseSessionHistory(logs, historyExId);
        return (
          <Dialog
            open
            onClose={() => setHistoryExId(null)}
            size="s"
            title={`Historial — ${getExercise(historyExId)?.name ?? 'Ejercicio'}`}
          >
            <div className="space-y-4">
              {progress ? (
                <ExerciseBestSetCard {...progress} />
              ) : (
                <p className="font-sans text-label text-ink-2">
                  Todavía no hay series registradas de este ejercicio — esta será tu primera vez.
                </p>
              )}
              {sessions.length > 0 && (
                <div className="space-y-2">
                  <p className="font-sans text-caption text-ink-2 uppercase tracking-widest">Sesiones anteriores</p>
                  <div className="space-y-1.5">
                    {sessions.map(s => (
                      <div key={s.date} className="flex items-center justify-between gap-3 py-1.5 border-b border-hairline last:border-b-0">
                        <span className="font-mono text-caption text-ink-3">{s.date}</span>
                        <span className="font-mono text-label text-ink text-right">
                          {s.sets.map(set => `${set.weight}×${set.reps}`).join(' · ')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Dialog>
        );
      })()}
    </div>
  );
}
