import React from 'react';
import { Exercise, WorkoutEntryLog, WorkoutExercise } from '../../types';
import { Icon } from '../ui';
import { TECHNIQUE_EMOJI, TECHNIQUE_LABEL, TECHNIQUE_COLOR, TECHNIQUE_DESCRIPTION } from '../../utils/workoutTechniques';
import { expandSetGroups } from '../../utils/setGroups';
import { generateWarmup } from '../../utils/warmup/WarmupGenerator';
import { parseTargetReps } from '../../utils/warmup/WarmupEngine';
import ExerciseVideoPlayer from '../ExerciseVideoPlayer';
import { SetInput, RIR_OPCIONES, rirTexto, rirClaseColor } from './setInput';
import RestRing from './RestRing';

interface Props {
  we: WorkoutExercise;
  exIdx: number;
  ex: Exercise | undefined;
  exSets: SetInput[];
  prevEntry: WorkoutEntryLog | undefined;
  personalNote: string | undefined;
  isVideoOpen: boolean;
  onToggleVideo: () => void;
  onOpenHistory: () => void;
  onUpdateSet: (sIdx: number, field: keyof SetInput, value: string | boolean) => void;
  onMarkDone: (sIdx: number, markingDone: boolean) => void;
  onAddRow: () => void;
  noteValue: string;
  onNoteChange: (value: string) => void;
  restTimer: { totalSeconds: number; secondsLeft: number } | null;
  onSkipRest: () => void;
  onAddRestSeconds: (seconds: number) => void;
  videoTargetRef?: (el: HTMLElement | null) => void;
  setEditorTargetRef?: (el: HTMLElement | null) => void;
  firstSetRowTargetRef?: (el: HTMLElement | null) => void;
  /** Sin `@types/react` en el repo, TS no excluye `key` por su cuenta (ver Chip.tsx). */
  key?: React.Key;
}

/**
 * Una página del carrusel de la sesión en curso — un ejercicio a la vez
 * (mockup "Entreno · Serie en curso v2"). La tabla normal de series se
 * mantiene tal cual (mismo prerelleno/placeholder de "última vez"); dropset y
 * myoreps solo cambian cómo se PINTAN esas mismas filas, no el dato que
 * guardan — cada bajada/miniserie sigue siendo un `SetInput` normal.
 */
export default function ExerciseCard({
  we, exIdx, ex, exSets, prevEntry, personalNote, isVideoOpen, onToggleVideo, onOpenHistory,
  onUpdateSet, onMarkDone, onAddRow, noteValue, onNoteChange,
  restTimer, onSkipRest, onAddRestSeconds,
  videoTargetRef, setEditorTargetRef, firstSetRowTargetRef,
}: Props) {
  const expanded = expandSetGroups(we);
  const totalSets = exSets.length;
  const doneSets = exSets.filter(s => s.done).length;
  const set1Weight = parseFloat(exSets[0]?.weight || '') || 0;
  const warmup = generateWarmup({
    mode: we.warmupMode,
    manualSets: we.manualWarmupSets,
    targetWeight: set1Weight,
    targetReps: parseTargetReps(expanded[0]?.reps ?? we.reps),
    previousSets: prevEntry?.sets,
  });

  const esDropset = we.technique === 'dropset';
  const esMyoreps = we.technique === 'myoreps';

  return (
    <div className={`bg-surface border rounded-surface overflow-hidden ${we.recordVideoSet ? 'border-accent/50' : 'border-hairline'}`}>
      {/* Cabecera */}
      <div ref={exIdx === 0 ? videoTargetRef : undefined} className="flex items-center gap-3 p-4 bg-surface border-b border-hairline">
        <span className="font-mono text-caption text-ink-3 w-5 text-center font-bold flex-shrink-0">{exIdx + 1}</span>
        <div className="w-11 h-11 rounded-full bg-raised border border-hairline flex items-center justify-center flex-shrink-0">
          <Icon name="fitness_center" size="m" className="text-ink-2" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display text-title-m font-black uppercase tracking-tight text-ink truncate flex items-center gap-2">
            {ex?.name || we.exerciseId}
            {we.technique && (
              <span className={`inline-flex items-center gap-1 text-caption font-mono font-bold uppercase px-2 rounded-control border flex-shrink-0 ${TECHNIQUE_COLOR[we.technique]}`}>
                {TECHNIQUE_EMOJI[we.technique]} {TECHNIQUE_LABEL[we.technique]}
              </span>
            )}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-caption text-ink-2">
              {we.setGroups && we.setGroups.length > 0
                ? we.setGroups.map((g, i) => `${g.label || `Bloque ${i + 1}`} ${g.sets}×${g.reps} (RIR ${g.rir})`).join(' · ')
                : `${we.sets}×${we.reps} · RIR ${we.rir}`} · {we.restSeconds}s
            </span>
            {ex?.equipment?.map(eq => (
              <span key={eq} className="text-caption font-sans px-2 rounded-control bg-white/5 text-ink-3">{eq}</span>
            ))}
            {ex?.videoUrl && (
              <button
                type="button"
                onClick={onToggleVideo}
                className={`inline-flex items-center gap-1 text-caption font-sans font-bold uppercase px-2 rounded-control border transition-colors ${
                  isVideoOpen ? 'bg-accent text-on-accent border-accent' : 'text-accent border-accent/30 hover:bg-accent/10'
                }`}
              >
                <Icon name="play_circle" size="s" filled={isVideoOpen} />
                Vídeo
              </button>
            )}
            <button
              type="button"
              onClick={onOpenHistory}
              className="inline-flex items-center gap-1 text-caption font-sans font-bold uppercase px-2 rounded-control border text-accent border-accent/30 hover:bg-accent/10 transition-colors"
            >
              <Icon name="trending_up" size="s" />
              Historial
            </button>
            {warmup.readiness && (
              <span
                title={warmup.readiness.message}
                className={`text-caption font-mono px-2 rounded-control border ${
                  warmup.readiness.score >= 75 ? 'text-success border-success/30 bg-success/10'
                  : warmup.readiness.score >= 45 ? 'text-warning border-warning/30 bg-warning/10'
                  : 'text-danger border-danger/30 bg-danger/10'
                }`}
              >
                🔥 Readiness {warmup.readiness.score}
              </span>
            )}
          </div>
        </div>
        <div className="flex-shrink-0">
          <span className="font-mono text-caption font-bold px-2 py-1 rounded-control bg-inset text-ink-2">
            {doneSets}/{totalSets}
          </span>
        </div>
      </div>

      {isVideoOpen && ex?.videoUrl && <ExerciseVideoPlayer videoUrl={ex.videoUrl} />}

      {we.recordVideoSet && (
        <div className="flex items-center gap-2 px-4 py-2 bg-accent/6 border-b border-accent-line">
          <Icon name="videocam" size="s" className="text-accent" />
          <p className="font-sans text-label font-bold text-accent">
            {we.recordVideoSet === 'all'
              ? 'Tu entrenador quiere que grabes todas las series con el móvil'
              : `Tu entrenador quiere que grabes la serie ${we.recordVideoSet} con el móvil`}
          </p>
        </div>
      )}

      {we.technique && (
        <div className={`flex items-start gap-2 px-4 py-3 border-b ${TECHNIQUE_COLOR[we.technique]}`}>
          <span className="text-title-s flex-shrink-0 leading-none">{TECHNIQUE_EMOJI[we.technique]}</span>
          <p className="font-sans text-label leading-relaxed">
            <span className="font-bold uppercase tracking-wide">{TECHNIQUE_LABEL[we.technique]}. </span>
            {TECHNIQUE_DESCRIPTION[we.technique]}
          </p>
        </div>
      )}

      {restTimer && (
        <div className="px-4 pt-4">
          <RestRing
            totalSeconds={restTimer.totalSeconds}
            secondsLeft={restTimer.secondsLeft}
            onSkip={onSkipRest}
            onAddSeconds={onAddRestSeconds}
          />
        </div>
      )}

      {/* Series */}
      {esDropset ? (
        <DropsetRows
          exSets={exSets} warmup={warmup} onUpdateSet={onUpdateSet} onMarkDone={onMarkDone} onAddRow={onAddRow}
          firstSetRowTargetRef={firstSetRowTargetRef} setEditorTargetRef={setEditorTargetRef}
        />
      ) : esMyoreps ? (
        <MyorepsRows
          exSets={exSets} warmup={warmup} onUpdateSet={onUpdateSet} onMarkDone={onMarkDone} onAddRow={onAddRow}
          firstSetRowTargetRef={firstSetRowTargetRef} setEditorTargetRef={setEditorTargetRef}
        />
      ) : (
        <NormalTable
          we={we} exSets={exSets} expanded={expanded} warmup={warmup} prevEntry={prevEntry}
          onUpdateSet={onUpdateSet} onMarkDone={onMarkDone}
          firstSetRowTargetRef={firstSetRowTargetRef} setEditorTargetRef={setEditorTargetRef}
        />
      )}

      {/* Nota del atleta para este ejercicio */}
      <div className="px-4 py-3 bg-bg border-t border-hairline">
        <label className="font-mono text-caption text-ink-2 uppercase tracking-wider block mb-2">Tu nota (opcional)</label>
        <textarea
          value={noteValue}
          onChange={e => onNoteChange(e.target.value)}
          placeholder="ej. Molestia leve en el hombro derecho..."
          rows={2}
          className="w-full bg-bg border border-hairline rounded-control p-3 text-title-s text-ink placeholder-ink-2/40 focus:outline-none focus:ring-1 focus:ring-accent resize-none"
        />
      </div>

      {we.notes && (
        <div className="px-4 py-2 bg-bg border-t border-hairline">
          <p className="font-sans text-caption text-ink-2 italic">📌 {we.notes}</p>
        </div>
      )}

      {ex?.instructions && (
        <div className="px-4 py-2 bg-bg border-t border-hairline">
          <p className="font-mono text-caption text-ink-3 uppercase ">Descripción</p>
          <p className="text-label text-ink-2">{ex.instructions}</p>
        </div>
      )}

      {personalNote && (
        <div className="px-4 py-2 bg-accent-bg border-t border-accent/15">
          <p className="font-sans text-caption text-accent/70 uppercase ">Nota de tu entrenador para ti</p>
          <p className="text-label text-accent">{personalNote}</p>
        </div>
      )}
    </div>
  );
}

// ── Tabla normal (idéntica a la de antes, solo reubicada) ──────────────────

function NormalTable({
  we, exSets, expanded, warmup, prevEntry, onUpdateSet, onMarkDone, firstSetRowTargetRef, setEditorTargetRef,
}: {
  we: WorkoutExercise;
  exSets: SetInput[];
  expanded: ReturnType<typeof expandSetGroups>;
  warmup: ReturnType<typeof generateWarmup>;
  prevEntry: WorkoutEntryLog | undefined;
  onUpdateSet: Props['onUpdateSet'];
  onMarkDone: Props['onMarkDone'];
  firstSetRowTargetRef?: Props['firstSetRowTargetRef'];
  setEditorTargetRef?: Props['setEditorTargetRef'];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left sm:min-w-[480px]">
        <thead>
          <tr className="bg-bg border-b border-hairline">
            <th className="px-2 sm:px-4 py-2 font-mono text-caption text-ink-2 uppercase w-12">Serie</th>
            <th className="px-2 sm:px-3 py-2 font-mono text-caption text-ink-2 uppercase">Peso</th>
            <th className="px-2 sm:px-3 py-2 font-mono text-caption text-ink-2 uppercase">Reps</th>
            <th className="px-2 sm:px-3 py-2 font-mono text-caption text-ink-2 uppercase">RIR</th>
            <th className="hidden sm:table-cell px-3 py-2 font-mono text-caption text-ink-3 uppercase">Anterior</th>
            <th className="px-2 sm:px-4 py-2 font-mono text-caption text-ink-2 uppercase text-center">Hecha</th>
          </tr>
        </thead>
        <tbody>
          {warmup.sets.map((w, wIdx) => (
            <tr key={`warmup-${wIdx}`} className="border-b border-hairline bg-warning/6">
              <td className="px-2 sm:px-4 py-3">
                <span className="font-mono text-label font-bold text-warning flex items-center gap-1">🔥 W{wIdx + 1}</span>
              </td>
              <td className="px-2 sm:px-3 py-2">
                <span className="w-16 sm:w-20 inline-block text-center text-warning font-mono text-body-s">{w.weight}</span>
              </td>
              <td className="px-2 sm:px-3 py-2">
                <span className="w-14 sm:w-16 inline-block text-center text-warning font-mono text-body-s">{w.reps}</span>
              </td>
              <td className="px-2 sm:px-3 py-2 text-center text-warning/50 font-mono text-body-s">—</td>
              <td className="hidden sm:table-cell px-3 py-2 text-center text-warning/50 font-mono text-caption">Warm-up</td>
              <td className="px-2 sm:px-4 py-2 text-center text-warning/40 font-mono text-body-s">—</td>
            </tr>
          ))}
          {exSets.map((setInput, sIdx) => {
            const prev = prevEntry?.sets[sIdx];
            const shouldRecord = we.recordVideoSet === 'all' || we.recordVideoSet === sIdx + 1;
            const esSiguiente = !setInput.done && exSets.slice(0, sIdx).every(s => s.done);
            const alFallo = setInput.rir === 'fallo';
            return (
              <tr
                key={sIdx}
                className={`border-b transition-colors duration-(--duration-state) ${
                  alFallo && !setInput.done ? 'border-danger/35 bg-danger/6'
                  : setInput.done ? 'border-hairline bg-accent/6'
                  : shouldRecord ? 'border-hairline bg-accent/5'
                  : esSiguiente ? 'border-hairline bg-accent/[.03]'
                  : 'border-hairline hover:bg-raised'
                }`}
              >
                <td className="px-2 sm:px-4 py-3">
                  <span className={`font-mono text-label font-bold flex items-center gap-1 ${setInput.done || esSiguiente ? 'text-accent' : 'text-ink-2'}`}>
                    {String(sIdx + 1).padStart(2, '0')}
                    {shouldRecord && <Icon name="videocam" size="s" className="text-accent" label="Grabar con el móvil" />}
                  </span>
                  {(we.setGroups?.length ?? 0) > 1 && expanded[sIdx]?.label && (
                    <span className="block font-sans text-caption text-accent/70 uppercase ">{expanded[sIdx].label}</span>
                  )}
                </td>
                <td className="px-2 sm:px-3 py-2" ref={sIdx === 0 ? setEditorTargetRef : undefined}>
                  <input
                    type="number" min={0} step={0.5}
                    value={setInput.weight}
                    onChange={e => onUpdateSet(sIdx, 'weight', e.target.value)}
                    placeholder={prev && prev.weight > 0 ? String(prev.weight) : '—'}
                    disabled={setInput.done}
                    className={`w-16 sm:w-20 rounded-control border bg-field px-1 sm:px-2 py-2 text-center font-mono text-title-s text-ink focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed ${esSiguiente ? 'border-accent/55' : 'border-hairline'}`}
                  />
                </td>
                <td className="px-2 sm:px-3 py-2">
                  <input
                    type="number" min={0}
                    value={setInput.repsDone}
                    onChange={e => onUpdateSet(sIdx, 'repsDone', e.target.value)}
                    placeholder={prev && prev.repsDone > 0 ? String(prev.repsDone) : (expanded[sIdx]?.reps || '—')}
                    disabled={setInput.done}
                    className={`w-14 sm:w-16 rounded-control border bg-field px-1 sm:px-2 py-2 text-center font-mono text-title-s text-ink focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed ${esSiguiente ? 'border-accent/55' : 'border-hairline'}`}
                  />
                </td>
                <td className="px-2 sm:px-3 py-2">
                  <select
                    value={setInput.rir}
                    onChange={e => onUpdateSet(sIdx, 'rir', e.target.value)}
                    disabled={setInput.done}
                    className={`w-14 sm:w-16 appearance-none bg-field border border-hairline rounded-control px-1 sm:px-2 py-2 text-center font-mono text-title-s focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed ${rirClaseColor(setInput.rir)}`}
                  >
                    {RIR_OPCIONES.map(v => <option key={v} value={v}>{rirTexto(v)}</option>)}
                  </select>
                </td>
                <td className="hidden sm:table-cell px-3 py-2">
                  {prev ? (
                    <span className="font-mono text-caption text-ink-3 whitespace-nowrap">
                      {prev.weight > 0 ? `${prev.weight}kg` : '—'} × {prev.repsDone > 0 ? `${prev.repsDone}r` : '—'}
                    </span>
                  ) : (
                    <span className="font-mono text-caption text-ink-3">—</span>
                  )}
                </td>
                <td className="px-2 sm:px-4 py-2 text-center">
                  <button
                    ref={sIdx === 0 ? firstSetRowTargetRef : undefined}
                    onClick={() => onMarkDone(sIdx, !setInput.done)}
                    className={`mx-auto flex h-11 w-11 items-center justify-center rounded-control border transition-colors duration-(--duration-state) ${
                      setInput.done ? 'bg-accent border-accent text-on-accent' : 'border-hairline text-ink-3 hover:border-accent-line hover:text-accent'
                    }`}
                  >
                    <Icon name={setInput.done ? 'check_circle' : 'radio_button_unchecked'} size="m" filled={setInput.done} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Dropset: base + bajadas encadenadas (mockup frame 02) ──────────────────

function DropsetRows({ exSets, warmup, onUpdateSet, onMarkDone, onAddRow, firstSetRowTargetRef, setEditorTargetRef }: {
  exSets: SetInput[];
  warmup: ReturnType<typeof generateWarmup>;
  onUpdateSet: Props['onUpdateSet'];
  onMarkDone: Props['onMarkDone'];
  onAddRow: () => void;
  firstSetRowTargetRef?: Props['firstSetRowTargetRef'];
  setEditorTargetRef?: Props['setEditorTargetRef'];
}) {
  const baseWeight = parseFloat(exSets[0]?.weight || '') || 0;
  return (
    <div className="px-4 py-4 space-y-2.5">
      {warmup.sets.length > 0 && (
        <p className="font-mono text-caption text-warning/70 uppercase">🔥 {warmup.sets.length} series de calentamiento arriba</p>
      )}
      <div className="relative">
        {exSets.length > 1 && <div className="absolute left-[19px] top-9 bottom-9 w-px bg-accent-line" aria-hidden />}
        <div className="space-y-2.5">
          {exSets.map((s, sIdx) => {
            const esBase = sIdx === 0;
            const dropWeight = parseFloat(s.weight || '') || 0;
            const caida = !esBase && baseWeight > 0 && dropWeight > 0 ? Math.round((1 - dropWeight / baseWeight) * 100) : null;
            return (
              <div
                key={sIdx}
                className={`relative flex items-center gap-3 rounded-surface p-3 ${esBase ? 'bg-inset border border-accent-line' : 'bg-raised'}`}
              >
                <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-control font-mono text-caption font-bold ${esBase ? 'bg-accent-bg text-accent' : 'bg-white/5 text-ink-2'}`}>
                  {esBase ? 'BASE' : `D${sIdx}`}
                </span>
                <div className="flex-1 min-w-0 flex items-center gap-2" ref={sIdx === 0 ? setEditorTargetRef : undefined}>
                  <input
                    type="number" min={0} step={0.5}
                    value={s.weight}
                    onChange={e => onUpdateSet(sIdx, 'weight', e.target.value)}
                    placeholder="kg"
                    disabled={s.done}
                    className="w-16 rounded-control border border-hairline bg-field px-2 py-1.5 text-center font-mono text-title-s text-ink focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
                  />
                  <span className="font-mono text-caption text-ink-3">kg ×</span>
                  <input
                    type="number" min={0}
                    value={s.repsDone}
                    onChange={e => onUpdateSet(sIdx, 'repsDone', e.target.value)}
                    placeholder="reps"
                    disabled={s.done}
                    className="w-14 rounded-control border border-hairline bg-field px-2 py-1.5 text-center font-mono text-title-s text-ink focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
                  />
                  {caida != null && caida > 0 && <span className="font-mono text-caption font-bold text-danger">−{caida}%</span>}
                </div>
                <button
                  ref={sIdx === 0 ? firstSetRowTargetRef : undefined}
                  onClick={() => onMarkDone(sIdx, !s.done)}
                  className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-control border transition-colors duration-(--duration-state) ${
                    s.done ? 'bg-accent border-accent text-on-accent' : 'border-hairline text-ink-3 hover:border-accent-line hover:text-accent'
                  }`}
                >
                  <Icon name={s.done ? 'check_circle' : 'radio_button_unchecked'} size="s" filled={s.done} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <button
        type="button"
        onClick={onAddRow}
        className="w-full rounded-surface border border-dashed border-accent-line py-3 font-sans font-bold text-body-s text-accent hover:bg-accent/6 transition-colors"
      >
        + Añadir bajada
      </button>
      <div className="rounded-surface bg-bg p-3 flex items-center justify-between">
        <span className="font-mono text-caption text-ink-2 uppercase tracking-wide">Total del dropset</span>
        <span className="font-mono text-body-s font-bold text-ink">
          {exSets.filter(s => s.done).reduce((n, s) => n + (parseInt(s.repsDone) || 0), 0)} reps ·{' '}
          {Math.round(exSets.filter(s => s.done).reduce((v, s) => v + (parseFloat(s.weight) || 0) * (parseInt(s.repsDone) || 0), 0))} kg
        </span>
      </div>
    </div>
  );
}

// ── Myoreps: activación + miniseries (mockup frame 03) ──────────────────────

function MyorepsRows({ exSets, warmup, onUpdateSet, onMarkDone, onAddRow, firstSetRowTargetRef, setEditorTargetRef }: {
  exSets: SetInput[];
  warmup: ReturnType<typeof generateWarmup>;
  onUpdateSet: Props['onUpdateSet'];
  onMarkDone: Props['onMarkDone'];
  onAddRow: () => void;
  firstSetRowTargetRef?: Props['firstSetRowTargetRef'];
  setEditorTargetRef?: Props['setEditorTargetRef'];
}) {
  const activacion = exSets[0];
  const miniseries = exSets.slice(1);
  const totalEfectivo = exSets.filter(s => s.done).reduce((n, s) => n + (parseInt(s.repsDone) || 0), 0);
  return (
    <div className="px-4 py-4 space-y-3">
      {warmup.sets.length > 0 && (
        <p className="font-mono text-caption text-warning/70 uppercase">🔥 {warmup.sets.length} series de calentamiento arriba</p>
      )}
      {activacion && (
        <div className="rounded-surface border border-hairline bg-inset p-3.5 space-y-3" ref={setEditorTargetRef}>
          <p className="font-mono text-caption text-ink-2 uppercase tracking-wide">Serie de activación</p>
          <div className="flex items-center gap-3">
            <input
              type="number" min={0} step={0.5}
              value={activacion.weight}
              onChange={e => onUpdateSet(0, 'weight', e.target.value)}
              placeholder="kg"
              disabled={activacion.done}
              className="w-16 rounded-control border border-hairline bg-field px-2 py-2 text-center font-mono text-title-s text-ink focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
            />
            <span className="font-mono text-caption text-ink-3">kg ×</span>
            <input
              type="number" min={0}
              value={activacion.repsDone}
              onChange={e => onUpdateSet(0, 'repsDone', e.target.value)}
              placeholder="reps"
              disabled={activacion.done}
              className="w-14 rounded-control border border-hairline bg-field px-2 py-2 text-center font-mono text-title-s text-ink focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
            />
            <button
              ref={firstSetRowTargetRef}
              onClick={() => onMarkDone(0, !activacion.done)}
              className={`ml-auto flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-control border transition-colors duration-(--duration-state) ${
                activacion.done ? 'bg-accent border-accent text-on-accent' : 'border-hairline text-ink-3 hover:border-accent-line hover:text-accent'
              }`}
            >
              <Icon name={activacion.done ? 'check_circle' : 'radio_button_unchecked'} size="s" filled={activacion.done} />
            </button>
          </div>
        </div>
      )}

      <div className="rounded-surface bg-raised p-3.5 space-y-2.5">
        <p className="font-mono text-caption text-ink-2 uppercase tracking-wide">Miniseries · sigue mientras aguantes 4+ reps</p>
        <div className="flex flex-wrap items-center gap-2.5">
          {miniseries.map((s, i) => {
            const sIdx = i + 1;
            return (
              <button
                key={sIdx}
                type="button"
                onClick={() => {
                  // Las miniseries se hacen con el mismo peso que la activación
                  // — no tienen campo de peso propio en el mockup, así que se
                  // copia aquí para que el volumen/tonelaje no se calcule a 0.
                  if (!s.done && !s.weight && activacion?.weight) onUpdateSet(sIdx, 'weight', activacion.weight);
                  onMarkDone(sIdx, !s.done);
                }}
                className={`flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-full border transition-colors ${
                  s.done ? 'bg-accent/85 border-accent text-on-accent' : 'border-dashed border-hairline text-ink-2'
                }`}
              >
                <input
                  type="number" min={0}
                  value={s.repsDone}
                  onChange={e => { e.stopPropagation(); onUpdateSet(sIdx, 'repsDone', e.target.value); }}
                  onClick={e => e.stopPropagation()}
                  placeholder="—"
                  disabled={s.done}
                  className="w-9 bg-transparent text-center font-mono text-title-s font-bold focus:outline-none disabled:opacity-100"
                />
                <span className="font-mono text-[9px] leading-none uppercase tracking-wide opacity-70">reps</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={onAddRow}
            className="flex h-14 w-14 items-center justify-center rounded-full border border-dashed border-hairline text-ink-3 hover:text-accent hover:border-accent-line text-title-m"
          >
            +
          </button>
        </div>
      </div>

      <div className="rounded-surface bg-bg p-3 flex items-center justify-between">
        <span className="font-mono text-caption text-ink-2 uppercase tracking-wide">Total efectivo</span>
        <span className="font-mono text-body-s font-bold text-accent">{totalEfectivo} reps cerca del fallo</span>
      </div>
    </div>
  );
}
