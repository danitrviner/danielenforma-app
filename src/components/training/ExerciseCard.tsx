import { useRecienHecho } from '../../hooks/useRecienHecho';
import React from 'react';
import { Exercise, WorkoutEntryLog, WorkoutExercise } from '../../types';
import { Icon, Button } from '../ui';
import { COACH_NOMBRE } from '../../utils/coach';
import { TECHNIQUE_EMOJI, TECHNIQUE_LABEL, TECHNIQUE_COLOR } from '../../utils/workoutTechniques';
import { ajustesDe, partesDeTecnica, llevaSegmentos, pesoDeBajada, serieDelSegmento, seriesConTecnica, seriesPrincipales, pautaDelBloque } from '../../utils/tecnicaDeSerie';
import { expandSetGroups } from '../../utils/setGroups';
import { generateWarmup } from '../../utils/warmup/WarmupGenerator';
import { parseTargetReps } from '../../utils/warmup/WarmupEngine';
import ExerciseVideoPlayer from '../ExerciseVideoPlayer';
import { SetInput, RIR_OPCIONES, rirTexto, rirClaseColor, resumenRangosPautados } from './setInput';
import RestRing from './RestRing';
import { MOTIVOS_SALTAR, conMotivo, motivoDeLaNota } from '../../utils/saltarEjercicio';
import { sugerirCarga, consejoEnVivo } from '../../utils/cargaSugerida';

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
  /** Añade una bajada o miniserie tras la serie principal `segmentoDe` (1 = la primera). */
  onAddRow: (segmentoDe: number) => void;
  noteValue: string;
  onNoteChange: (value: string) => void;
  restTimer: { totalSeconds: number; secondsLeft: number } | null;
  onSkipRest: () => void;
  onAddRestSeconds: (seconds: number) => void;
  videoTargetRef?: (el: HTMLElement | null) => void;
  setEditorTargetRef?: (el: HTMLElement | null) => void;
  firstSetRowTargetRef?: (el: HTMLElement | null) => void;
  /** Qué ha cambiado el coach en este ejercicio respecto a la semana pasada
   *  ("3 → 4 series", "RIR 2 → 1"). Vacío o ausente = nada nuevo. */
  cambios?: string[];
  /** Solo con las series principales hechas y la técnica a medias: da el
   *  ejercicio por terminado (ver `estadoDelEjercicio`). */
  onCerrarEjercicio?: () => void;
  /** Sin `@types/react` en el repo, TS no excluye `key` por su cuenta (ver Chip.tsx). */
  key?: React.Key;
}

/**
 * Una página del carrusel de la sesión en curso — un ejercicio a la vez
 * (mockup "Entreno · Serie en curso v2"). La tabla normal de series se
 * mantiene tal cual (mismo prerelleno/placeholder de "última vez"); dropset,
 * myoreps y rest-pause añaden, tras la última serie, un bloque con sus
 * segmentos (`SetInput` con `segmento: true`).
 */
// React.memo: es la página del carrusel que más cambia por render (cada
// serie marcada, cada tecla del peso/reps) — sin esto, WorkoutSessionPlayer
// repintaría también las tarjetas de los DEMÁS ejercicios de la sesión en
// cada una de esas teclas. Depende de que sus props sigan siendo estables
// (ver los `useEstable`/useMemo de WorkoutSessionPlayer.tsx y el
// updateSet/addSetRow corregidos en TrainingScreen.tsx).
export default React.memo(function ExerciseCard({
  we, exIdx, ex, exSets, prevEntry, personalNote, isVideoOpen, onToggleVideo, onOpenHistory,
  onUpdateSet, onMarkDone, onAddRow, noteValue, onNoteChange,
  restTimer, onSkipRest, onAddRestSeconds,
  videoTargetRef, setEditorTargetRef, firstSetRowTargetRef, cambios,
  onCerrarEjercicio,
}: Props) {
  const idNota = React.useId();
  const motivoMarcado = motivoDeLaNota(noteValue);
  const expanded = expandSetGroups(we);
  // Las bajadas y miniseries no son series: no cuentan en «2/3».
  const totalSets = exSets.filter(s => !s.segmento).length;
  const doneSets = exSets.filter(s => !s.segmento && s.done).length;
  const set1Weight = parseFloat(exSets[0]?.weight || '') || 0;
  const warmup = generateWarmup({
    mode: we.warmupMode,
    manualSets: we.manualWarmupSets,
    targetWeight: set1Weight,
    targetReps: parseTargetReps(expanded[0]?.reps ?? we.reps),
    previousSets: prevEntry?.sets,
  });

  const sugerencia = React.useMemo(() => sugerirCarga(we, prevEntry), [we, prevEntry]);
  const consejo = React.useMemo(() => consejoEnVivo(we, exSets), [we, exSets]);
  const esDropset = we.technique === 'dropset';
  const esMyoreps = we.technique === 'myoreps';
  const esRestpause = we.technique === 'restpause';
  // Las series principales conservan su fila; las bajadas/miniseries (segmento)
  // se guardan detrás y se pintan aparte, un bloque por cada serie que lleva la
  // técnica (E-06). Un segmento sin `segmentoDe` es de la última (registros viejos).
  const nPrincipales = exSets.filter(s => !s.segmento).length;
  const seriesTecnica = llevaSegmentos(we.technique) ? seriesConTecnica(we, nPrincipales) : [];
  const segmentosDe = (k: number) => exSets
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => serieDelSegmento(s, nPrincipales) === k)
    .map(({ i }) => i);
  const pctBajada = ajustesDe(we).dropset.pctBajada;

  // 14-c: «Completar serie 3 + drop». Cierra de una vez la siguiente serie que
  // lleva la técnica y las bajadas/miniseries que ya tienen reps apuntadas (sin
  // peso escrito se usa el sugerido o el de la serie, como al marcarlas a mano).
  const siguiente = exSets.slice(0, nPrincipales).findIndex(s => !s.done);
  const serieSiguiente = siguiente + 1;
  const segmentosSiguiente = siguiente >= 0 && seriesTecnica.includes(serieSiguiente) ? segmentosDe(serieSiguiente) : [];
  const principalSiguiente = siguiente >= 0 ? exSets[siguiente] : undefined;
  const puedeCompletar = !!principalSiguiente && !!principalSiguiente.weight && !!principalSiguiente.repsDone;
  const completarConTecnica = () => {
    if (!principalSiguiente || !puedeCompletar) return;
    onMarkDone(siguiente, true);
    const peso = parseFloat(principalSiguiente.weight) || 0;
    segmentosSiguiente.forEach((idx, k) => {
      const seg = exSets[idx];
      if (seg.done || !seg.repsDone) return;
      if (!seg.weight) {
        const sugerido = esDropset ? pesoDeBajada(peso, pctBajada, k) : peso || null;
        if (sugerido != null) onUpdateSet(idx, 'weight', String(sugerido));
      }
      onMarkDone(idx, true);
    });
  };

  // Tamaño adaptativo del nombre — un nombre largo ("Elevación de rodilla
  // alterno inclinado, de espalda") ocupaba media tarjeta a text-feature
  // (26px); se reduce por escalones según longitud en vez de dejarlo fijo.
  const nombreEjercicio = ex?.name || we.exerciseId;
  // En el móvil un escalón menos: el nombre largo ocupaba cuatro líneas y
  // empujaba las series fuera de la pantalla.
  const nombreSizeClass = nombreEjercicio.length > 40 ? 'text-title-s sm:text-title-m'
    : nombreEjercicio.length > 24 ? 'text-title-m sm:text-title-l'
    : 'text-title-l sm:text-feature';

  return (
    <div className={`bg-surface border rounded-surface overflow-hidden ${we.recordVideoSet ? 'border-accent/50' : 'border-hairline'}`}>
      {/* Cabecera */}
      <div ref={exIdx === 0 ? videoTargetRef : undefined} className="flex items-center gap-3 p-3 sm:p-4 bg-surface border-b border-hairline">
        <span className="hidden sm:block font-mono text-caption text-ink-3 w-5 text-center font-bold flex-shrink-0">{exIdx + 1}</span>
        <div className="flex-1 min-w-0">
          <p className={`font-display ${nombreSizeClass} font-black uppercase tracking-tight text-ink flex items-center gap-2 flex-wrap`}>
            {nombreEjercicio}
            {cambios && cambios.length > 0 && (
              <span className="inline-flex items-center text-caption font-mono font-bold uppercase px-2 rounded-control bg-accent text-on-accent flex-shrink-0">
                Nuevo
              </span>
            )}
            {we.technique && (
              <span className={`inline-flex items-center gap-1 text-caption font-mono font-bold uppercase px-2 rounded-control border flex-shrink-0 ${TECHNIQUE_COLOR[we.technique]}`}>
                {TECHNIQUE_EMOJI[we.technique]} {TECHNIQUE_LABEL[we.technique]}
              </span>
            )}
          </p>
          <div className="flex items-center gap-2 flex-wrap mt-1">
            {ex?.equipment?.map(eq => (
              <span key={eq} className="text-caption font-sans px-2 rounded-control bg-hairline text-ink-3">{eq}</span>
            ))}
            {ex?.videoUrl && (
              <button
                type="button"
                onClick={onToggleVideo}
                className={`inline-flex items-center gap-1 text-caption font-sans font-bold uppercase px-2 rounded-control border transition-colors ${
                  isVideoOpen ? 'bg-accent text-on-accent border-accent' : 'text-accent-ink border-accent/30 hover:bg-accent/10'
                }`}
              >
                <Icon name="play_circle" size="s" filled={isVideoOpen} />
                Vídeo
              </button>
            )}
            <button
              type="button"
              onClick={onOpenHistory}
              className="inline-flex items-center gap-1 text-caption font-sans font-bold uppercase px-2 rounded-control border text-accent-ink border-accent/30 hover:bg-accent/10 transition-colors"
            >
              <Icon name="trending_up" size="s" />
              Historial
            </button>
            {!esDropset && !esMyoreps && resumenRangosPautados(expanded) && (
              <span title="Repeticiones pautadas por tu entrenador" className="text-caption font-mono px-2 rounded-control bg-hairline text-ink-3 whitespace-nowrap">
                {resumenRangosPautados(expanded)}
              </span>
            )}
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

      {cambios && cambios.length > 0 && (
        <div className="flex items-start gap-2 px-4 py-2 bg-accent/6 border-b border-accent-line">
          <Icon name="event_note" size="s" className="text-accent-ink mt-0.5" />
          <p className="font-sans text-label text-ink">
            <span className="font-bold text-accent-ink">Cambia esta semana: </span>{cambios.join(' · ')}
          </p>
        </div>
      )}

      {isVideoOpen && ex?.videoUrl && <ExerciseVideoPlayer videoUrl={ex.videoUrl} />}

      {we.recordVideoSet && (
        <div className="flex items-center gap-2 px-4 py-2 bg-accent/6 border-b border-accent-line">
          <Icon name="videocam" size="s" className="text-accent-ink" />
          <p className="font-sans text-label font-bold text-accent-ink">
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
            <span className="font-bold uppercase tracking-wide">{TECHNIQUE_LABEL[we.technique]} · </span>
            {(() => { const t = partesDeTecnica(we, expanded.length || nPrincipales); return `${t.series}: ${t.pauta}.`; })()}
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

      {/* Carga sugerida (doble progresión): solo cuando toca subir. La tabla
          ya viene con ese peso; esto dice por qué, para que no parezca un error. */}
      {/* Respuesta del coach a la nota que dejó la última vez (28-10-2026). */}
      {prevEntry?.note && prevEntry.noteReply && doneSets === 0 && (
        <div className="mx-4 mt-2 rounded-control border border-hairline bg-raised px-3 py-2.5 space-y-2">
          <p className="font-sans text-caption text-ink-3">
            <span className="font-bold text-ink-2">Tu nota de la última vez:</span> «{prevEntry.note}»
          </p>
          <div className="flex items-start gap-2.5">
            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-success/20 font-sans text-label font-bold text-success" aria-hidden="true">
              {COACH_NOMBRE.charAt(0)}
            </span>
            <div className="min-w-0">
              <p className="font-sans text-caption font-bold text-success">{COACH_NOMBRE} te ha contestado</p>
              <p className="font-sans text-caption text-ink">{prevEntry.noteReply.text}</p>
            </div>
          </div>
        </div>
      )}
      {sugerencia.resumen && doneSets === 0 && (
        <ConsejoDelCoach texto={sugerencia.resumen} />
      )}
      {/* En plena sesión: la serie anterior se pasó del rango con margen. */}
      {consejo && (
        <ConsejoDelCoach
          texto={consejo.texto}
          accion={{ texto: `Poner ${String(consejo.peso).replace('.', ',')} kg`, onClick: () => onUpdateSet(consejo.serie, 'weight', String(consejo.peso)) }}
        />
      )}

      {/* Series */}
      {esDropset || esMyoreps || esRestpause ? (
        <>
          <NormalTable
            we={we} exSets={exSets.slice(0, nPrincipales)} expanded={expanded} warmup={warmup} prevEntry={prevEntry}
            onUpdateSet={onUpdateSet} onMarkDone={onMarkDone}
            firstSetRowTargetRef={firstSetRowTargetRef} setEditorTargetRef={setEditorTargetRef}
          />
          {seriesTecnica.map(k => (esDropset ? (
            <DropsetRows
              key={k} exSets={exSets} serie={k} indices={segmentosDe(k)} pctBajada={pctBajada} pauta={pautaDelBloque(we)}
              onUpdateSet={onUpdateSet} onMarkDone={onMarkDone} onAddRow={() => onAddRow(k)}
            />
          ) : (
            <MyorepsRows
              key={k} exSets={exSets} serie={k} indices={segmentosDe(k)} pauta={pautaDelBloque(we)}
              onUpdateSet={onUpdateSet} onMarkDone={onMarkDone} onAddRow={() => onAddRow(k)}
              variante={esRestpause ? 'restpause' : 'myoreps'}
            />
          )))}
          {segmentosSiguiente.length > 0 && (
            <div className="px-4 pb-4">
              <button
                type="button"
                onClick={completarConTecnica}
                disabled={!puedeCompletar}
                className="w-full rounded-surface bg-accent py-3.5 font-sans font-bold text-body text-on-accent transition-opacity disabled:opacity-40"
              >
                Completar serie {serieSiguiente} + {esDropset ? 'drop' : 'miniseries'}
              </button>
              {!puedeCompletar && <p className="mt-1.5 text-center font-sans text-caption text-ink-3">Apunta el peso y las reps de la serie {serieSiguiente}.</p>}
              {puedeCompletar && segmentosSiguiente.some(i => !exSets[i].done && !exSets[i].repsDone) && (
                <p className="mt-1.5 text-center font-sans text-caption text-ink-3">Las {esDropset ? 'bajadas' : 'miniseries'} sin reps se quedan para marcarlas después.</p>
              )}
            </div>
          )}
          {onCerrarEjercicio && (
            <div className="px-4 pb-4">
              <Button variant="primary" size="l" icon="check" onClick={onCerrarEjercicio} fullWidth>
                Cerrar ejercicio
              </Button>
              <p className="mt-1.5 text-center font-sans text-caption text-ink-3">
                Las {esDropset ? 'bajadas' : 'miniseries'} con reps se guardan; las vacías, no.
              </p>
            </div>
          )}
        </>
      ) : (
        <NormalTable
          we={we} exSets={exSets} expanded={expanded} warmup={warmup} prevEntry={prevEntry}
          onUpdateSet={onUpdateSet} onMarkDone={onMarkDone}
          firstSetRowTargetRef={firstSetRowTargetRef} setEditorTargetRef={setEditorTargetRef}
        />
      )}

      {/* Nota del atleta para este ejercicio.

          Encima, el motivo de no haberlo hecho en un toque. Antes esto no
          existía: si el atleta se saltaba un ejercicio, el registro solo decía
          «4 de 6» y el coach no podía saber si se cansó, si le molestaba algo
          o si la máquina estaba ocupada — tres decisiones distintas la semana
          siguiente. Se guarda en la nota del ejercicio, que ya existía; lo que
          hacía falta era que la nota de un ejercicio SIN series dejara de
          tirarse al guardar (TrainingScreen.handleFinish). */}
      <div className="px-4 py-3 bg-bg border-t border-hairline">
        {(doneSets === 0 || motivoMarcado) && (
          <div className="mb-3">
            <p className="font-mono text-caption text-ink-2 uppercase tracking-wider mb-2">¿No lo has hecho?</p>
            <div className="flex flex-wrap gap-1.5">
              {MOTIVOS_SALTAR.map(m => {
                const puesto = motivoMarcado === m.clave;
                return (
                  <button
                    key={m.clave}
                    type="button"
                    onClick={() => onNoteChange(conMotivo(noteValue, m.clave))}
                    aria-pressed={puesto}
                    className={`rounded-control border px-2.5 py-1.5 font-sans text-label transition-colors ${
                      puesto ? 'border-accent-line text-accent-ink' : 'border-hairline text-ink-2 hover:text-ink'
                    }`}
                  >
                    {m.etiqueta}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <label htmlFor={idNota} className="font-mono text-caption text-ink-2 uppercase tracking-wider block mb-2">Tu nota (opcional)</label>
        <textarea
          id={idNota}
          value={noteValue}
          onChange={e => onNoteChange(e.target.value)}
          placeholder="ej. Molestia leve en el hombro derecho..."
          rows={2}
          className="w-full bg-bg border border-control-line rounded-control p-3 text-title-s text-ink placeholder-ink-2/40 focus:outline-none focus:ring-1 focus:ring-accent resize-none"
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
          <p className="font-sans text-caption text-accent-ink/70 uppercase ">Nota de tu entrenador para ti</p>
          <p className="text-label text-accent-ink">{personalNote}</p>
        </div>
      )}
    </div>
  );
});

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
  // Lo de la última vez por serie principal (sin bajadas ni miniseries).
  const previas = prevEntry ? seriesPrincipales(prevEntry.sets) : [];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left sm:min-w-[480px]">
        <thead>
          <tr className="bg-bg border-b border-hairline">
            <th className="px-2 sm:px-4 py-2 font-mono text-caption text-ink-2 uppercase w-12">Serie</th>
            <th className="px-2 sm:px-3 py-2 font-mono text-caption text-ink-2 uppercase">Peso</th>
            <th className="px-2 sm:px-3 py-2 font-mono text-caption text-ink-2 uppercase">Reps</th>
            <th className="px-2 sm:px-3 py-2 font-mono text-caption text-ink-2 uppercase">RIR</th>
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
              <td className="px-2 sm:px-4 py-2 text-center text-warning/40 font-mono text-body-s">—</td>
            </tr>
          ))}
          {exSets.map((setInput, sIdx) => {
            const prev = previas[sIdx];
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
                  <span className={`font-mono text-label font-bold flex items-center gap-1 ${setInput.done || esSiguiente ? 'text-accent-ink' : 'text-ink-2'}`}>
                    {String(sIdx + 1).padStart(2, '0')}
                    {shouldRecord && <Icon name="videocam" size="s" className="text-accent-ink" label="Grabar con el móvil" />}
                  </span>
                  {(we.setGroups?.length ?? 0) > 1 && expanded[sIdx]?.label && (
                    <span className="block font-sans text-caption text-accent-ink/70 uppercase ">{expanded[sIdx].label}</span>
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
                    className={`w-14 sm:w-16 appearance-none bg-field border border-control-line rounded-control px-1 sm:px-2 py-2 text-center font-mono text-title-s focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed ${rirClaseColor(setInput.rir)}`}
                  >
                    {RIR_OPCIONES.map(v => <option key={v} value={v}>{rirTexto(v)}</option>)}
                  </select>
                </td>
                <td className="px-2 sm:px-4 py-2 text-center">
                  <BotonSerieHecha
                    ref={sIdx === 0 ? firstSetRowTargetRef : undefined}
                    hecha={setInput.done}
                    onClick={() => onMarkDone(sIdx, !setInput.done)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Dropset: bajadas DESPUÉS de la última serie principal ─────────────────
// Las series principales se pintan en la tabla normal; aquí solo van las
// bajadas (`segmento`). Antes la fila 0 hacía de «BASE» y las demás de bajada,
// así que un dropset en la última de 3 series convertía las series 2 y 3 en
// bajadas. Ahora la técnica se SUMA a la serie, no la sustituye.

function DropsetRows({ exSets, serie, indices, pctBajada, pauta, onUpdateSet, onMarkDone, onAddRow }: {
  exSets: SetInput[];
  /** Serie principal tras la que van (1 = la primera). */
  serie: number;
  /** Posiciones en `exSets` de las bajadas de esta serie. */
  indices: number[];
  /** Bajada de peso pautada, para sugerir el peso de cada bajada. */
  pctBajada: number;
  /** Cómo hacerlas, con lo programado (14-d): «Sin descanso · −20 % cada bajada…». */
  pauta: string;
  onUpdateSet: Props['onUpdateSet'];
  onMarkDone: Props['onMarkDone'];
  onAddRow: () => void;
  key?: React.Key;
}) {
  const base = exSets.filter(s => !s.segmento)[serie - 1];
  const baseWeight = parseFloat(base?.weight || '') || 0;
  const bajadas = indices.map(i => exSets[i]);
  const hechas = bajadas.filter(s => s.done);
  return (
    <div className="px-4 py-4 space-y-2.5 border-t border-hairline">
      <div>
        <p className="font-mono text-label text-accent-ink uppercase tracking-wide">Drop set · tras la serie {serie}</p>
        {pauta && <p className="font-sans text-caption text-ink-2">{pauta}</p>}
      </div>
      {bajadas.map((s, i) => {
        const sIdx = indices[i];
        const sugerido = pesoDeBajada(baseWeight, pctBajada, i);
        const dropWeight = parseFloat(s.weight || '') || 0;
        const caida = baseWeight > 0 && dropWeight > 0 ? Math.round((1 - dropWeight / baseWeight) * 100) : null;
        return (
          <div key={sIdx} className="flex items-center gap-2 rounded-surface bg-raised p-3 ml-2 border-l-2 border-accent-line">
            <span className="flex h-7 w-9 flex-shrink-0 items-center justify-center rounded-control bg-hairline font-mono text-label font-bold text-ink-2">
              D{i + 1}
            </span>
            <div className="flex-1 min-w-0">
              {/* Una sola línea «kg × reps»: a 375 px no cabía con el −20 % al lado y
                  se partía «kg ×». La caída va debajo. */}
              <div className="flex items-center gap-1.5 whitespace-nowrap">
              <input
                type="number" min={0} step={0.5}
                value={s.weight}
                onChange={e => onUpdateSet(sIdx, 'weight', e.target.value)}
                placeholder={sugerido != null ? String(sugerido).replace('.', ',') : 'kg'}
                disabled={s.done}
                className="w-16 rounded-control border border-control-line bg-field px-2 py-1.5 text-center font-mono text-title-s text-ink focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
              />
              <span className="font-mono text-label text-ink-3">kg ×</span>
              <input
                type="number" min={0}
                value={s.repsDone}
                onChange={e => onUpdateSet(sIdx, 'repsDone', e.target.value)}
                placeholder="reps"
                disabled={s.done}
                className="w-14 rounded-control border border-control-line bg-field px-2 py-1.5 text-center font-mono text-title-s text-ink focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
              />
              </div>
              {caida != null && caida > 0 && <span className="mt-1 block font-mono text-label font-bold text-danger">−{caida}% de peso</span>}
            </div>
            <button
              onClick={() => {
                // Sin peso escrito se apunta el sugerido: si no, la bajada contaría 0 kg.
                if (!s.done && !s.weight && sugerido != null) onUpdateSet(sIdx, 'weight', String(sugerido));
                onMarkDone(sIdx, !s.done);
              }}
              aria-label={s.done ? `Desmarcar bajada ${i + 1}` : `Marcar bajada ${i + 1} como hecha`}
              className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-control border transition-colors duration-(--duration-state) ${
                s.done ? 'bg-accent border-accent text-on-accent' : 'border-hairline text-ink-3 hover:border-accent-line hover:text-accent-ink'
              }`}
            >
              <Icon name={s.done ? 'check_circle' : 'radio_button_unchecked'} size="s" filled={s.done} />
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={onAddRow}
        className="w-full rounded-surface border border-dashed border-accent-line py-3 font-sans font-bold text-body-s text-accent-ink hover:bg-accent/6 transition-colors"
      >
        + Añadir bajada
      </button>
      {hechas.length > 0 && (
        <div className="rounded-surface bg-bg p-3 flex items-center justify-between">
          <span className="font-mono text-label text-ink-2 uppercase tracking-wide">Bajadas hechas</span>
          <span className="font-mono text-body-s font-bold text-ink">
            {hechas.reduce((n, s) => n + (parseInt(s.repsDone) || 0), 0)} reps
          </span>
        </div>
      )}
    </div>
  );
}

// ── Myoreps / rest-pause: miniseries o pausas DESPUÉS de la última serie ───

function MyorepsRows({ exSets, serie, indices, pauta, onUpdateSet, onMarkDone, onAddRow, variante }: {
  exSets: SetInput[];
  /** Serie principal que hace de activación (1 = la primera). */
  serie: number;
  /** Posiciones en `exSets` de las miniseries de esta serie. */
  indices: number[];
  key?: React.Key;
  /** Myo-reps: miniseries sin parar casi. Rest-pause: pausas cortas con el mismo peso. */
  variante: 'myoreps' | 'restpause';
  /** Cómo hacerlas, con lo programado (14-d). Vacía en rest-pause (solo lo antiguo). */
  pauta: string;
  onUpdateSet: Props['onUpdateSet'];
  onMarkDone: Props['onMarkDone'];
  onAddRow: () => void;
}) {
  const activacion = exSets.filter(s => !s.segmento)[serie - 1];
  const miniseries = indices.map(i => exSets[i]);
  const totalEfectivo = miniseries.filter(s => s.done).reduce((n, s) => n + (parseInt(s.repsDone) || 0), 0);
  return (
    <div className="px-4 py-4 space-y-3 border-t border-hairline">
      <div className="rounded-surface bg-raised p-3.5 space-y-2.5 ml-3 border-l-2 border-accent-line">
        <div>
          <p className="font-mono text-label text-accent-ink uppercase tracking-wide">{variante === 'restpause'
              ? `Rest-pause · tras la serie ${serie} · descansa 10-15 s y sigue`
              : `Myo-reps · tras la serie ${serie}`}</p>
          {variante === 'myoreps' && pauta && <p className="font-sans text-caption text-ink-2">{pauta}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {miniseries.map((s, i) => {
            const sIdx = indices[i];
            return (
              <button
                key={sIdx}
                type="button"
                onClick={() => {
                  // Las miniseries se hacen con el mismo peso que la serie de
                  // activación: se copia para que el tonelaje no salga a 0.
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
                <span className="font-mono text-caption leading-none uppercase tracking-wide opacity-70">reps</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={onAddRow}
            aria-label={variante === 'restpause' ? 'Añadir pausa' : 'Añadir miniserie'}
            className="flex h-14 w-14 items-center justify-center rounded-full border border-dashed border-hairline text-ink-3 hover:text-accent-ink hover:border-accent-line text-title-m"
          >
            +
          </button>
        </div>
      </div>
      {totalEfectivo > 0 && (
        <div className="rounded-surface bg-bg p-3 flex items-center justify-between">
          <span className="font-mono text-label text-ink-2 uppercase tracking-wide">{variante === 'restpause' ? 'Reps tras las pausas' : 'Miniseries hechas'}</span>
          <span className="font-mono text-body-s font-bold text-accent-ink">{totalEfectivo} reps</span>
        </div>
      )}
    </div>
  );
}


/* El botón de «serie hecha»: al marcarla, el check entra con el sello
   (`seal-pop`, el mismo que cierra el anillo del día). Solo en la transición:
   abrir un entreno con series ya hechas no sella nada. */
const BotonSerieHecha = React.forwardRef<HTMLButtonElement, { hecha: boolean; onClick: () => void }>(
  function BotonSerieHecha({ hecha, onClick }, ref) {
    const sellando = useRecienHecho(hecha);
    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        aria-pressed={hecha}
        aria-label={hecha ? 'Desmarcar serie' : 'Marcar serie como hecha'}
        className={`mx-auto flex h-11 w-11 items-center justify-center rounded-control border transition-colors duration-(--duration-state) active:scale-90 ${
          hecha ? 'bg-accent border-accent text-on-accent' : 'border-hairline text-ink-3 hover:border-accent-line hover:text-accent-ink'
        }`}
      >
        <span className={`flex ${sellando ? 'animate-seal-pop' : ''}`}>
          <Icon name={hecha ? 'check_circle' : 'radio_button_unchecked'} size="m" filled={hecha} />
        </span>
      </button>
    );
  }
);

/* Consejos de carga firmados por el coach (28-10-2026). Antes eran una frase
   suelta de la app («Sube a 82,5 kg: …»); Dani quería que se leyera como lo
   que es, una indicación suya, para que el atleta le haga caso. */
function ConsejoDelCoach({ texto, accion }: { texto: string; accion?: { texto: string; onClick: () => void } }) {
  return (
    <div className="mx-4 mt-2 flex items-start gap-2.5 rounded-control border border-success/40 bg-success/10 px-3 py-2.5">
      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-success/20 font-sans text-label font-bold text-success" aria-hidden="true">
        {COACH_NOMBRE.charAt(0)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-sans text-caption font-bold text-success">{COACH_NOMBRE} te recomienda</p>
        <p className="font-sans text-caption text-ink">{texto}</p>
        {accion && (
          <button type="button" onClick={accion.onClick} className="mt-1.5 rounded-control border border-success/40 px-2.5 py-1 font-sans text-caption font-bold text-success hover:bg-success/10">
            {accion.texto}
          </button>
        )}
      </div>
    </div>
  );
}
