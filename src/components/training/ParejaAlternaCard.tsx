import React from 'react';
import { Exercise, WorkoutEntryLog, WorkoutExercise } from '../../types';
import { Icon } from '../ui';
import { expandSetGroups } from '../../utils/setGroups';
import { generateWarmup } from '../../utils/warmup/WarmupGenerator';
import { parseTargetReps } from '../../utils/warmup/WarmupEngine';
import { seriesPrincipales } from '../../utils/seriesPrincipales';
import { sugerirCarga, consejoEnVivo } from '../../utils/cargaSugerida';
import { consejoDeDiaMalo } from '../../utils/diaMalo';
import { pausaEntreTurnos, siguienteTurno, turnosDePareja } from '../../utils/seriesAlternas';
import ExerciseVideoPlayer from '../ExerciseVideoPlayer';
import RestRing from './RestRing';
import { SetInput, resumenRangosPautados, resumenRirPautado, apuntarRir, VARIANTE_RIR_POR_DEFECTO, type VarianteRir } from './setInput';
import {
  BotonSerieHecha, ConsejoDelCoach, PieDeEjercicio, TEXTO_EJERCICIO_NUEVO, useMarcarSerie, AvisoSinReps,
  AvisoSinRir, PreguntaDeRir, SelectRir,
} from './ExerciseCard';
import { rirPautadoPorSerie } from '../../utils/setPrefill';
import type { TipoDeSemana } from '../../utils/tipoDeSemana';

/* ═══════════════════════════════════════════════════════════════════════════
   Series alternas en la sesión del atleta (P4) — versión «una tabla por
   turnos», elegida por Dani el 11-11-2026 entre tres (ver AlternasDevHarness).

   Los dos ejercicios de la pareja comparten página y UNA tabla, con las filas
   en el orden en que se hacen: A1, B1, A2, B2… Cada fila escribe en la serie
   de su ejercicio, así que el registro que se guarda es el de siempre: dos
   ejercicios con sus series. Lo único que cambia es el orden en pantalla y el
   descanso entre turnos (la pausa corta; lo pone WorkoutSessionPlayer).

   Aquí no llegan ejercicios con bajadas o miniseries: esos no se alternan
   (ver `paginasDeSesion` en WorkoutSessionPlayer).
   ═══════════════════════════════════════════════════════════════════════════ */

export interface LadoDePareja {
  we: WorkoutExercise;
  ex: Exercise | undefined;
  exSets: SetInput[];
  prevEntry: WorkoutEntryLog | undefined;
  personalNote: string | undefined;
  isVideoOpen: boolean;
  onToggleVideo: () => void;
  onOpenHistory: () => void;
  onUpdateSet: (sIdx: number, field: keyof SetInput, value: string | boolean) => void;
  onMarkDone: (sIdx: number, markingDone: boolean) => void;
  noteValue: string;
  onNoteChange: (value: string) => void;
  nuevaReferencia: boolean;
  onToggleReferencia?: (marcada: boolean) => void;
  cambios?: string[];
  /** P12: salto real de carga del ejercicio. */
  saltoKg?: number | null;
  /** F6: el atleta no ha hecho nunca este ejercicio. */
  esNuevo?: boolean;
}

interface Props {
  lados: [LadoDePareja, LadoDePareja];
  restTimer: { totalSeconds: number; secondsLeft: number } | null;
  onSkipRest: () => void;
  onAddRestSeconds: (seconds: number) => void;
  /** F7a: semana de descarga, puente o vuelta de parón. En ellas no se sugiere subir carga. */
  tipoSemana?: TipoDeSemana | null;
  /** D1c: cómo se le pide el RIR (ver `VarianteRir` en setInput.ts). Sin ella, la de hoy. */
  varianteRir?: VarianteRir;
  key?: React.Key;
}

const CELDA = 'rounded-control border bg-field px-1 sm:px-2 py-2 text-center font-mono text-title-s text-ink focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed';

export default function ParejaAlternaCard({ lados, restTimer, onSkipRest, onAddRestSeconds, tipoSemana, varianteRir = VARIANTE_RIR_POR_DEFECTO }: Props) {
  const nombres = lados.map(l => l.ex?.name || l.we.exerciseId);
  // F23: una fila sin repeticiones no se marca; se avisa junto a ella. D1c:
  // según la variante, tampoco sin elegir el RIR. Un gancho por ejercicio de
  // la pareja (siempre son dos).
  const marcado = [
    useMarcarSerie(lados[0].exSets, lados[0].onMarkDone, { variante: varianteRir, onUpdateSet: lados[0].onUpdateSet }),
    useMarcarSerie(lados[1].exSets, lados[1].onMarkDone, { variante: varianteRir, onUpdateSet: lados[1].onUpdateSet }),
  ];
  const datos = lados.map(l => {
    const expanded = expandSetGroups(l.we);
    return {
      expanded,
      // El RIR que ha pautado el coach en cada serie: el objetivo.
      pautados: rirPautadoPorSerie(l.we),
      previas: l.prevEntry ? seriesPrincipales(l.prevEntry.sets) : [],
      hechas: l.exSets.filter(s => s.done).length,
      warmup: generateWarmup({
        mode: l.we.warmupMode,
        manualSets: l.we.manualWarmupSets,
        targetWeight: parseFloat(l.exSets[0]?.weight || '') || 0,
        targetReps: parseTargetReps(expanded[0]?.reps ?? l.we.reps),
        previousSets: l.prevEntry?.sets,
      }),
      sugerencia: sugerirCarga(l.we, l.prevEntry, l.saltoKg, tipoSemana),
      consejo: consejoEnVivo(l.we, l.exSets, l.saltoKg, tipoSemana),
      // Con referencia nueva no se compara con la última vez (es otra tarea).
      diaMalo: l.nuevaReferencia ? null : consejoDeDiaMalo(l.exSets, l.prevEntry),
    };
  });

  const turnos = turnosDePareja(lados[0].exSets.length, lados[1].exSets.length);
  const toca = siguienteTurno(lados[0].exSets.map(s => s.done), lados[1].exSets.map(s => s.done));
  const pausa = pausaEntreTurnos(lados[0].we.restSeconds ?? 0, lados[1].we.restSeconds ?? 0);
  const algunaGrabada = lados.some(l => l.we.recordVideoSet);

  return (
    <div className={`bg-surface border rounded-surface overflow-hidden ${algunaGrabada ? 'border-accent/50' : 'border-hairline'}`}>
      {/* Cabecera: qué es esto y los dos ejercicios, cada uno con su vídeo e historial. */}
      <div className="p-3 sm:p-4 border-b border-hairline space-y-3">
        <div>
          <p className="font-mono text-caption font-bold uppercase tracking-wider text-accent-ink flex items-center gap-1">
            <Icon name="swap_vert" size="s" /> Series alternas
          </p>
          <p className="font-sans text-caption text-ink-2">
            Por turnos, de arriba abajo: una serie de cada. Entre una y otra, {pausa} s.
          </p>
        </div>
        {lados.map((l, k) => (
          <div key={k} className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-display text-title-s sm:text-title-m font-black uppercase tracking-tight text-ink flex items-center gap-2 flex-wrap">
                {nombres[k]}
                {l.cambios && l.cambios.length > 0 && (
                  <span className="inline-flex items-center text-caption font-mono font-bold uppercase px-2 rounded-control bg-accent text-on-accent flex-shrink-0">Nuevo</span>
                )}
              </p>
              <div className="flex items-center gap-2 flex-wrap mt-1">
                {l.ex?.videoUrl && (
                  <button
                    type="button"
                    onClick={l.onToggleVideo}
                    className={`inline-flex items-center gap-1 text-caption font-sans font-bold uppercase px-2 rounded-control border transition-colors ${
                      l.isVideoOpen ? 'bg-accent text-on-accent border-accent' : 'text-accent-ink border-accent/30 hover:bg-accent/10'
                    }`}
                  >
                    <Icon name="play_circle" size="s" filled={l.isVideoOpen} />
                    Vídeo
                  </button>
                )}
                <button
                  type="button"
                  onClick={l.onOpenHistory}
                  className="inline-flex items-center gap-1 text-caption font-sans font-bold uppercase px-2 rounded-control border text-accent-ink border-accent/30 hover:bg-accent/10 transition-colors"
                >
                  <Icon name="trending_up" size="s" />
                  Historial
                </button>
                {resumenRangosPautados(datos[k].expanded) && (
                  <span title="Repeticiones pautadas por tu entrenador" className="text-caption font-mono px-2 rounded-control bg-hairline text-ink-3 whitespace-nowrap">
                    {resumenRangosPautados(datos[k].expanded)}
                  </span>
                )}
                {resumenRirPautado(datos[k].pautados) && (
                  <span title="RIR pautado por tu entrenador" className="text-caption font-mono px-2 rounded-control bg-hairline text-ink-3 whitespace-nowrap">
                    {resumenRirPautado(datos[k].pautados)}
                  </span>
                )}
              </div>
              {l.cambios && l.cambios.length > 0 && (
                <p className="mt-1 font-sans text-caption text-ink">
                  <span className="font-bold text-accent-ink">Cambia esta semana: </span>{l.cambios.join(' · ')}
                </p>
              )}
            </div>
            <span className="flex-shrink-0 font-mono text-caption font-bold px-2 py-1 rounded-control bg-inset text-ink-2">
              {datos[k].hechas}/{l.exSets.length}
            </span>
          </div>
        ))}
      </div>

      {lados.map((l, k) => l.isVideoOpen && l.ex?.videoUrl && (
        <React.Fragment key={k}><ExerciseVideoPlayer videoUrl={l.ex.videoUrl} /></React.Fragment>
      ))}

      {lados.map((l, k) => l.we.recordVideoSet && (
        <div key={k} className="flex items-center gap-2 px-4 py-2 bg-accent/6 border-b border-accent-line">
          <Icon name="videocam" size="s" className="text-accent-ink" />
          <p className="font-sans text-label font-bold text-accent-ink">
            {l.we.recordVideoSet === 'all'
              ? `Tu entrenador quiere que grabes todas las series de ${nombres[k].toLowerCase()}`
              : `Tu entrenador quiere que grabes la serie ${l.we.recordVideoSet} de ${nombres[k].toLowerCase()}`}
          </p>
        </div>
      ))}

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

      {/* Los mismos consejos que en la tarjeta normal, diciendo de cuál hablan. */}
      {lados.map((l, k) => {
        const d = datos[k];
        return (
          <React.Fragment key={k}>
            {l.esNuevo && d.hechas === 0 && <ConsejoDelCoach texto={`${nombres[k]}: ${TEXTO_EJERCICIO_NUEVO}`} />}
            {d.sugerencia.resumen && d.hechas === 0 && !l.nuevaReferencia && (
              <ConsejoDelCoach texto={`${nombres[k]}: ${d.sugerencia.resumen}`} />
            )}
            {d.consejo && (
              <ConsejoDelCoach
                texto={`${nombres[k]}: ${d.consejo.texto}`}
                accion={{ texto: `Poner ${String(d.consejo.peso).replace('.', ',')} kg`, onClick: () => l.onUpdateSet(d.consejo!.serie, 'weight', String(d.consejo!.peso)) }}
              />
            )}
            {d.diaMalo && (
              <ConsejoDelCoach
                texto={`${nombres[k]}: ${d.diaMalo.texto}`}
                accion={d.diaMalo.seriesPendientes.some(i => { const kg = parseFloat(l.exSets[i]?.weight); return !(kg > 0) || kg > d.diaMalo!.peso; }) ? {
                  texto: `Poner ${String(d.diaMalo.peso).replace('.', ',')} kg en lo que queda`,
                  onClick: () => d.diaMalo!.seriesPendientes.forEach(i => l.onUpdateSet(i, 'weight', String(d.diaMalo!.peso))),
                } : undefined}
              />
            )}
          </React.Fragment>
        );
      })}

      {/* Una sola tabla, en el orden en que se hacen las series. */}
      <div className="overflow-x-auto mt-3">
        <table className="w-full text-left sm:min-w-[480px]">
          <thead>
            <tr className="bg-bg border-y border-hairline">
              <th className="px-2 sm:px-4 py-2 font-mono text-caption text-ink-2 uppercase">Turno</th>
              <th className="px-1.5 sm:px-3 py-2 font-mono text-caption text-ink-2 uppercase">Peso</th>
              <th className="px-1.5 sm:px-3 py-2 font-mono text-caption text-ink-2 uppercase">Reps</th>
              <th className="px-1.5 sm:px-3 py-2 font-mono text-caption text-ink-2 uppercase">RIR</th>
              <th className="px-2 sm:px-4 py-2 font-mono text-caption text-ink-2 uppercase text-center">Hecha</th>
            </tr>
          </thead>
          <tbody>
            {lados.flatMap((_, k) => datos[k].warmup.sets.map((w, wIdx) => (
              <tr key={`warmup-${k}-${wIdx}`} className="border-b border-hairline bg-warning/6">
                <td className="px-2 sm:px-4 py-3">
                  <span className="font-sans text-caption font-bold leading-tight text-warning line-clamp-2">{nombres[k]}</span>
                  <span className="block font-mono text-caption text-warning">🔥 W{wIdx + 1}</span>
                </td>
                <td className="px-1.5 sm:px-3 py-2"><span className="w-14 sm:w-20 inline-block text-center text-warning font-mono text-body-s">{w.weight}</span></td>
                <td className="px-1.5 sm:px-3 py-2"><span className="w-12 sm:w-16 inline-block text-center text-warning font-mono text-body-s">{w.reps}</span></td>
                <td className="px-1.5 sm:px-3 py-2 text-center text-warning/50 font-mono text-body-s">—</td>
                <td className="px-2 sm:px-4 py-2 text-center text-warning/40 font-mono text-body-s">—</td>
              </tr>
            )))}
            {turnos.map(t => {
              const l = lados[t.ej];
              const d = datos[t.ej];
              const sIdx = t.serie;
              const setInput = l.exSets[sIdx];
              const prev = d.previas[sIdx];
              const shouldRecord = l.we.recordVideoSet === 'all' || l.we.recordVideoSet === sIdx + 1;
              const esSiguiente = toca?.ej === t.ej && toca.serie === sIdx;
              const alFallo = setInput.rir === 'fallo';
              return (
                <React.Fragment key={`${t.ej}-${sIdx}`}>
                <tr
                  className={`border-b transition-colors duration-(--duration-state) ${
                    alFallo && !setInput.done ? 'border-danger/35 bg-danger/6'
                    : setInput.done ? 'border-hairline bg-accent/6'
                    : shouldRecord ? 'border-hairline bg-accent/5'
                    : esSiguiente ? 'border-hairline bg-accent/[.03]'
                    : 'border-hairline hover:bg-raised'
                  }`}
                >
                  <td className="px-2 sm:px-4 py-3">
                    <span className={`font-sans text-caption font-bold leading-tight line-clamp-2 ${setInput.done || esSiguiente ? 'text-accent-ink' : 'text-ink'}`}>
                      {nombres[t.ej]}
                    </span>
                    <span className="flex items-center gap-1 font-mono text-caption text-ink-2">
                      serie {sIdx + 1}
                      {shouldRecord && <Icon name="videocam" size="s" className="text-accent-ink" label="Grabar con el móvil" />}
                    </span>
                    {(l.we.setGroups?.length ?? 0) > 1 && d.expanded[sIdx]?.label && (
                      <span className="block font-sans text-caption text-accent-ink/70 uppercase">{d.expanded[sIdx].label}</span>
                    )}
                  </td>
                  <td className="px-1.5 sm:px-3 py-2">
                    <input
                      type="number" min={0} step={0.5}
                      value={setInput.weight}
                      onChange={e => l.onUpdateSet(sIdx, 'weight', e.target.value)}
                      placeholder={prev && prev.weight > 0 ? String(prev.weight) : '—'}
                      disabled={setInput.done}
                      aria-label={`Peso de ${nombres[t.ej]}, serie ${sIdx + 1}`}
                      className={`w-14 sm:w-20 ${CELDA} ${esSiguiente ? 'border-accent/55' : 'border-hairline'}`}
                    />
                  </td>
                  <td className="px-1.5 sm:px-3 py-2">
                    <input
                      type="number" min={0}
                      value={setInput.repsDone}
                      onChange={e => l.onUpdateSet(sIdx, 'repsDone', e.target.value)}
                      placeholder={prev && prev.repsDone > 0 ? String(prev.repsDone) : (d.expanded[sIdx]?.reps || '—')}
                      disabled={setInput.done}
                      aria-label={`Repeticiones de ${nombres[t.ej]}, serie ${sIdx + 1}`}
                      className={`w-12 sm:w-16 ${CELDA} ${esSiguiente ? 'border-accent/55' : 'border-hairline'}`}
                    />
                  </td>
                  <td className="px-1.5 sm:px-3 py-2">
                    <SelectRir
                      fila={setInput} variante={varianteRir} pautado={d.pautados[sIdx]}
                      onApuntar={valor => apuntarRir(l.onUpdateSet, sIdx, valor)}
                      ancho="w-12 sm:w-16"
                      etiqueta={`RIR de ${nombres[t.ej]}, serie ${sIdx + 1}`}
                    />
                  </td>
                  <td className="px-2 sm:px-4 py-2 text-center">
                    <BotonSerieHecha hecha={setInput.done} onClick={() => marcado[t.ej].marcar(sIdx, !setInput.done)} />
                  </td>
                </tr>
                {marcado[t.ej].sinReps === sIdx && (
                  <tr className="border-b border-hairline">
                    <td colSpan={5} className="px-2 sm:px-4 pb-2"><AvisoSinReps /></td>
                  </tr>
                )}
                {marcado[t.ej].sinRir === sIdx && (
                  <tr className="border-b border-hairline">
                    <td colSpan={5} className="px-2 sm:px-4 pb-2"><AvisoSinRir /></td>
                  </tr>
                )}
                {marcado[t.ej].eligiendo === sIdx && (
                  <tr className="border-b border-hairline bg-accent/[.03]">
                    <td colSpan={5} className="px-2 sm:px-4 pt-1 pb-3">
                      <PreguntaDeRir pautado={d.pautados[sIdx]} onElegir={valor => marcado[t.ej].elegirRir(sIdx, valor)} />
                    </td>
                  </tr>
                )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {lados.map((l, k) => (
        <PieDeEjercicio
          key={k}
          titulo={nombres[k]}
          we={l.we} ex={l.ex} doneSets={datos[k].hechas}
          noteValue={l.noteValue} onNoteChange={l.onNoteChange}
          nuevaReferencia={l.nuevaReferencia} onToggleReferencia={l.onToggleReferencia}
          personalNote={l.personalNote}
        />
      ))}
    </div>
  );
}
