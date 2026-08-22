import { useState } from 'react';
import { WorkoutExercise, WorkoutTechnique, WarmupMode, WarmupSet, WorkoutSetGroup, WeeklyProgressionRule } from '../types';
import { TECHNIQUES, TECHNIQUE_EMOJI, TECHNIQUE_LABEL, TECHNIQUE_COLOR, TECHNIQUE_DESCRIPTION } from '../utils/workoutTechniques';
import { syncAggregateFromGroups, newSetGroup } from '../utils/setGroups';
import { Icon, SegmentedControl, Collapsible } from './ui';

interface Props {
  we: WorkoutExercise;
  onChange: (patch: Partial<WorkoutExercise>) => void;
  // Nº de semanas del mesociclo al que pertenece este ejercicio — acota el selector de
  // semana de "Progresión por semanas". Opcional: en contextos sin mesociclo (la
  // biblioteca de rutinas de WorkoutsScreen) la sección de progresión no se muestra.
  mesoWeeks?: number;
}

// T11.b (18-08). "Top set / back-off" no es un concepto del modelo de datos
// —WorkoutSetGroup ya hacía exactamente lo que Dani pedía: rangos de reps
// distintos dentro de un mismo ejercicio— era jerga metida en la interfaz que
// obligaba a etiquetar algo que no hacía falta etiquetar. Estas cuatro son
// sugerencias, no la lista cerrada: "Escribir..." abre un campo libre.
const ETIQUETAS_SUGERIDAS = ['Pesado', 'Ligero', 'Al fallo'];

function formatRest(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

// Stepper compacto para las celdas de SERIES/DESCANSO de cada bloque — el
// `Stepper` compartido de `ui/` está pensado para contextos con sitio de
// sobra (botones de 44-52 px); aquí conviven tres celdas una junto a otra
// dentro de una tarjeta de ejercicio que a su vez vive dentro de una columna
// de día de ~260-300 px, así que necesita el mismo patrón "grande en móvil,
// compacto en escritorio" que ya usa el stepper de reparto de series en
// `MesocycleManager` (ProgressionView), pero con los tokens de color del DS
// en vez de los del heatmap de volumen.
function BlockStepper({ value, min = 0, max = 99, step = 1, format, onChange }: {
  value: number; min?: number; max?: number; step?: number; format?: (v: number) => string; onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-1">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - step))}
        disabled={value <= min}
        className="w-9 h-9 sm:w-6 sm:h-6 rounded-control bg-inset text-ink-2 hover:bg-white/5 disabled:opacity-30 font-mono text-body-s sm:text-label font-bold flex items-center justify-center flex-shrink-0 transition-colors"
      >−</button>
      <span className="flex-1 text-center font-mono text-title-s font-bold text-ink tabular-nums">
        {format ? format(value) : value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + step))}
        disabled={value >= max}
        className="w-9 h-9 sm:w-6 sm:h-6 rounded-control bg-accent/14 text-accent hover:bg-accent/22 disabled:opacity-30 font-mono text-body-s sm:text-label font-bold flex items-center justify-center flex-shrink-0 transition-colors"
      >+</button>
    </div>
  );
}

// Fila compacta de RIR — misma fórmula de color que `ui/RirScale` (oro pleno
// en 0-1, al 45% en 2-3, al 25% en 4-5) pero sin el segmento FALLO: el RIR
// objetivo de una prescripción es siempre un número (`WorkoutExercise.rir`/
// `WorkoutSetGroup.rir: number`), no la unión con 'fallo' que sí existe en
// el LOG real de una serie (`WorkoutSetLog`). No es el mismo dato, así que
// no reutiliza el componente compartido.
function RirRow({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const tono = (v: number) => v <= 1 ? 'bg-accent border-accent text-on-accent'
    : v <= 3 ? 'bg-accent/45 border-accent text-on-accent'
    : 'bg-accent/25 border-accent-line text-accent';
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="RIR">
      {[0, 1, 2, 3, 4, 5].map(v => {
        const activo = value === v;
        return (
          <button
            key={v} type="button" role="radio" aria-checked={activo}
            onClick={() => onChange(v)}
            className={`flex-1 h-8 rounded-control border font-mono text-label font-bold transition-colors ${
              activo ? tono(v) : 'border-hairline bg-inset text-ink-3 hover:border-strong'
            }`}
          >{v}</button>
        );
      })}
    </div>
  );
}

// Las tres celdas compartidas por el bloque uniforme y cada bloque de
// `setGroups` — series (stepper), reps (texto libre: "8-10", "AMRAP", "12"…
// no es un número, no puede ser un stepper) y descanso (stepper en pasos de
// 15 s, formateado mm:ss a partir de 60 s).
function ConfigCells({ sets, reps, rest, onSets, onReps, onRest }: {
  sets: number; reps: string; rest: number;
  onSets: (v: number) => void; onReps: (v: string) => void; onRest: (v: number) => void;
}) {
  return (
    <div className="flex gap-2">
      <div className="flex-1 min-w-[72px] bg-inset rounded-control p-2 flex flex-col gap-1.5">
        <span className="font-mono text-caption text-ink-2 uppercase tracking-wider">Series</span>
        <BlockStepper value={sets} min={1} max={20} onChange={onSets} />
      </div>
      <div className="flex-1 min-w-[72px] bg-inset rounded-control p-2 flex flex-col gap-1.5">
        <span className="font-mono text-caption text-ink-2 uppercase tracking-wider">Reps</span>
        <input
          type="text"
          value={reps}
          onChange={e => onReps(e.target.value)}
          placeholder="8-10"
          className="w-full bg-transparent border-none p-0 text-center text-white font-mono text-title-s font-bold focus:outline-none focus:ring-0"
        />
      </div>
      <div className="flex-1 min-w-[72px] bg-inset rounded-control p-2 flex flex-col gap-1.5">
        <span className="font-mono text-caption text-ink-2 uppercase tracking-wider">Descanso</span>
        <BlockStepper value={rest} min={0} max={600} step={15} format={formatRest} onChange={onRest} />
      </div>
    </div>
  );
}

// Full execution-config editor for one exercise inside a routine — series/reps/rir
// (uniform or split into top-set/back-off-set blocks), rest, high-intensity technique,
// video reminder and warm-up mode. Used identically from WorkoutsScreen (shared routine
// library) and from MesocycleManager's generator preview + "Ejercicios programados" tab,
// so a coach configures an exercise the same way no matter which screen they're on.
export default function ExerciseConfigEditor({ we, onChange, mesoWeeks }: Props) {
  const hasGroups = (we.setGroups?.length ?? 0) > 0;

  const progresion = we.weeklyProgression ?? [];
  const addProgressionRule = () => {
    const usedWeeks = new Set(progresion.map(r => r.atWeek));
    const maxWeek = mesoWeeks ?? 99;
    // Empieza en la semana 4 (el ejemplo típico de progresión) y busca la primera libre
    // hacia adelante; si el mesociclo es corto y ya están todas ocupadas hasta el final,
    // busca hacia atrás desde el principio antes de resignarse a duplicar una semana.
    let nextWeek = Math.min(4, maxWeek);
    while (usedWeeks.has(nextWeek) && nextWeek < maxWeek) nextWeek++;
    while (usedWeeks.has(nextWeek) && nextWeek > 1) nextWeek--;
    const rules = [...progresion, { atWeek: nextWeek, addSets: 1 }].sort((a, b) => a.atWeek - b.atWeek);
    onChange({ weeklyProgression: rules });
  };
  const updateProgressionRule = (idx: number, patch: Partial<WeeklyProgressionRule>) => {
    const rules = progresion.map((r, i) => i === idx ? { ...r, ...patch } : r).sort((a, b) => a.atWeek - b.atWeek);
    onChange({ weeklyProgression: rules });
  };
  const removeProgressionRule = (idx: number) => {
    const rules = progresion.filter((_, i) => i !== idx);
    onChange({ weeklyProgression: rules.length > 0 ? rules : undefined });
  };
  // Qué bloques muestran el campo de texto libre en vez del selector de
  // sugerencias — estado de interfaz, no del ejercicio: una etiqueta
  // personalizada sigue siendo solo texto en WorkoutSetGroup.label.
  const [etiquetaLibre, setEtiquetaLibre] = useState<Set<number>>(new Set());

  const enableGroups = () => {
    // Label vacío al crear el primer bloque — antes se rellenaba con "Top
    // set" sin que nadie lo hubiera pedido; ahora es opcional de verdad.
    const seed: WorkoutSetGroup = { label: '', sets: we.sets, reps: we.reps, rir: we.rir };
    onChange(syncAggregateFromGroups({ ...we, setGroups: [seed] }));
  };

  const disableGroups = () => {
    onChange({ setGroups: undefined });
    setEtiquetaLibre(new Set());
  };

  const updateGroup = (gIdx: number, field: keyof WorkoutSetGroup, value: string | number) => {
    const groups = (we.setGroups || []).map((g, i) => i === gIdx ? { ...g, [field]: value } : g);
    onChange(syncAggregateFromGroups({ ...we, setGroups: groups }));
  };

  const addGroup = () => {
    const groups = [...(we.setGroups || []), newSetGroup()];
    onChange(syncAggregateFromGroups({ ...we, setGroups: groups }));
  };

  const removeGroup = (gIdx: number) => {
    const groups = (we.setGroups || []).filter((_, i) => i !== gIdx);
    if (groups.length === 0) { disableGroups(); return; }
    onChange(syncAggregateFromGroups({ ...we, setGroups: groups }));
  };

  const setWarmupMode = (mode: WarmupMode) => {
    if (mode === 'none') { onChange({ warmupMode: undefined, manualWarmupSets: undefined }); return; }
    if (mode === 'manual' && !we.manualWarmupSets?.length) {
      onChange({ warmupMode: mode, manualWarmupSets: [{ weight: 0, reps: 8 }] });
      return;
    }
    onChange({ warmupMode: mode });
  };

  const updateManualWarmupSet = (wIdx: number, field: keyof WarmupSet, value: number) => {
    const sets = (we.manualWarmupSets || []).map((s, i) => i === wIdx ? { ...s, [field]: value } : s);
    onChange({ manualWarmupSets: sets });
  };

  const addManualWarmupSet = () => {
    onChange({ manualWarmupSets: [...(we.manualWarmupSets || []), { weight: 0, reps: 8 }] });
  };

  const removeManualWarmupSet = (wIdx: number) => {
    onChange({ manualWarmupSets: (we.manualWarmupSets || []).filter((_, i) => i !== wIdx) });
  };

  const setTechnique = (technique: WorkoutTechnique | undefined) => {
    onChange({ technique });
  };

  const toggleRecordVideo = () => {
    onChange({ recordVideoSet: we.recordVideoSet ? undefined : 'all' });
  };

  const totalSets = hasGroups ? (we.setGroups || []).reduce((s, g) => s + Math.max(1, g.sets || 1), 0) : we.sets;

  return (
    <div className="space-y-4">
      {/* Series / Reps / Descanso / RIR — uniforme o por bloques */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-mono text-caption text-ink-2 uppercase tracking-wider">
            {totalSets} series{hasGroups ? ` · ${(we.setGroups || []).length} bloques` : ''}
          </span>
          {hasGroups && (
            <button
              type="button"
              onClick={disableGroups}
              className="flex items-center gap-1 font-sans text-caption font-bold text-accent hover:text-white transition-colors"
            >
              <Icon name="undo" size="s" />
              Volver a un solo rango
            </button>
          )}
        </div>

        {!hasGroups ? (
          <div className="space-y-2">
            <ConfigCells
              sets={we.sets}
              reps={we.reps}
              rest={we.restSeconds}
              onSets={v => onChange({ sets: v })}
              onReps={v => onChange({ reps: v })}
              onRest={v => onChange({ restSeconds: v })}
            />
            <RirRow value={we.rir} onChange={v => onChange({ rir: v })} />
          </div>
        ) : (
          <div className="space-y-2">
            {(we.setGroups || []).map((g, gIdx) => {
              const esSugerida = !g.label || ETIQUETAS_SUGERIDAS.includes(g.label);
              const mostrarLibre = etiquetaLibre.has(gIdx) || !esSugerida;
              return (
                <div key={gIdx} className="bg-raised border border-hairline rounded-surface p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    {mostrarLibre ? (
                      <input
                        type="text"
                        autoFocus={etiquetaLibre.has(gIdx)}
                        value={g.label || ''}
                        onChange={e => updateGroup(gIdx, 'label', e.target.value)}
                        placeholder="Etiqueta del bloque"
                        className="min-w-0 flex-1 bg-accent/12 border border-accent-line rounded-control px-2 py-1 text-accent font-mono text-caption font-bold uppercase tracking-wider focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    ) : (
                      <div className="relative flex-1 min-w-0">
                        <select
                          value={g.label || ''}
                          onChange={e => {
                            if (e.target.value === '__libre__') {
                              setEtiquetaLibre(prev => new Set(prev).add(gIdx));
                              return;
                            }
                            updateGroup(gIdx, 'label', e.target.value);
                          }}
                          className="w-full appearance-none bg-accent/12 border border-accent-line rounded-control pl-2 pr-6 py-1 text-accent font-mono text-caption font-bold uppercase tracking-wider focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer"
                        >
                          <option value="">Sin etiqueta</option>
                          {ETIQUETAS_SUGERIDAS.map(l => <option key={l} value={l}>{l}</option>)}
                          <option value="__libre__">Escribir...</option>
                        </select>
                        <span className="ui-icon pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-accent" style={{ fontSize: '14px' }} aria-hidden>expand_more</span>
                      </div>
                    )}
                    <button
                      onClick={() => removeGroup(gIdx)}
                      className="font-mono text-caption font-bold text-ink-3 hover:text-red-400 uppercase tracking-wider transition-colors flex-shrink-0"
                    >
                      Quitar
                    </button>
                  </div>

                  <ConfigCells
                    sets={g.sets}
                    reps={g.reps}
                    rest={we.restSeconds}
                    onSets={v => updateGroup(gIdx, 'sets', v)}
                    onReps={v => updateGroup(gIdx, 'reps', v)}
                    onRest={v => onChange({ restSeconds: v })}
                  />
                  <RirRow value={g.rir} onChange={v => updateGroup(gIdx, 'rir', v)} />
                </div>
              );
            })}
          </div>
        )}

        <button
          onClick={hasGroups ? addGroup : enableGroups}
          className="w-full flex items-center justify-center gap-2 bg-bg border border-dashed border-hairline rounded-control px-3 py-2.5 text-title-s font-sans text-ink-2 hover:text-accent hover:border-accent/40 transition-all"
        >
          <Icon name="add" size="s" />
          Añadir bloque con otra configuración
        </button>
      </div>

      {/* Notas — abierto por defecto si ya tiene contenido, para no esconder
          algo que el coach ya configuró (Bloque A1). */}
      <Collapsible
        defaultOpen={!!we.notes}
        className="bg-bg border border-hairline border-l-2 border-l-accent rounded-surface px-3 py-2.5"
        trigger={<span className="font-mono text-caption text-ink-2 uppercase tracking-wider">Nota para el atleta</span>}
      >
        <textarea
          value={we.notes || ''}
          onChange={e => onChange({ notes: e.target.value })}
          placeholder="Técnica, variante, carga, progresión…"
          rows={2}
          className="w-full bg-transparent border-none p-0 text-title-s text-white placeholder-ink-2/30 font-sans focus:outline-none focus:ring-0 resize-none"
        />
      </Collapsible>

      {/* Técnica de alta intensidad */}
      <Collapsible
        defaultOpen={!!we.technique}
        trigger={
          <span className="font-mono text-caption text-ink-2 uppercase tracking-wider">
            Técnica de intensidad{we.technique && <span className="text-accent"> · {TECHNIQUE_LABEL[we.technique]}</span>}
          </span>
        }
      >
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setTechnique(undefined)}
              className={`px-3 py-1.5 rounded-chip font-mono text-caption font-bold uppercase tracking-wider border transition-all ${
                !we.technique
                  ? 'bg-white/10 border-hairline text-white'
                  : 'border-hairline text-ink-2 hover:text-white hover:border-strong'
              }`}
            >Normal</button>
            {TECHNIQUES.map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setTechnique(we.technique === t ? undefined : t)}
                title={TECHNIQUE_DESCRIPTION[t]}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-chip font-mono text-caption font-bold uppercase tracking-wider border transition-all ${
                  we.technique === t
                    ? TECHNIQUE_COLOR[t]
                    : 'border-hairline text-ink-2 hover:text-white hover:border-strong'
                }`}
              >{TECHNIQUE_EMOJI[t]} {TECHNIQUE_LABEL[t]}</button>
            ))}
          </div>
          {we.technique && (
            <p className="font-sans text-caption text-ink-2 leading-relaxed">{TECHNIQUE_DESCRIPTION[we.technique]}</p>
          )}
        </div>
      </Collapsible>

      {/* Warm-up (series de aproximación) */}
      <Collapsible
        defaultOpen={!!we.warmupMode && we.warmupMode !== 'none'}
        className="border-t border-hairline pt-3"
        trigger={
          <span className="font-mono text-caption text-ink-2 uppercase tracking-wider">
            Calentamiento{we.warmupMode && we.warmupMode !== 'none' && (
              <span className="text-accent"> · {we.warmupMode === 'auto' ? 'Automático' : 'Manual'}</span>
            )}
          </span>
        }
      >
        <div className="space-y-2">
          <SegmentedControl
            label="Calentamiento"
            value={we.warmupMode || 'none'}
            onChange={v => setWarmupMode(v as WarmupMode)}
            options={[
              { value: 'none', label: 'Ninguna' },
              { value: 'auto', label: 'Automático' },
              { value: 'manual', label: 'Manual' },
            ]}
          />
          {we.warmupMode === 'auto' && (
            <div className="bg-bg border border-hairline rounded-surface px-3 py-2.5">
              <p className="font-sans text-caption text-ink-2 leading-relaxed">
                🔥 El atleta verá series de aproximación calculadas automáticamente a partir del peso que escriba en la primera serie efectiva y su historial en este ejercicio.
              </p>
            </div>
          )}
          {we.warmupMode === 'manual' && (
            <div className="bg-bg border border-hairline rounded-surface px-3 py-2.5 space-y-2">
              {(we.manualWarmupSets || []).map((s, wIdx) => (
                <div key={wIdx} className="flex items-center gap-2">
                  <span className="font-mono text-caption text-accent w-8">W{wIdx + 1}</span>
                  <input
                    type="number" min={0} step={0.5}
                    value={s.weight}
                    onChange={e => updateManualWarmupSet(wIdx, 'weight', parseFloat(e.target.value) || 0)}
                    placeholder="kg"
                    className="w-20 bg-inset border border-hairline rounded-control px-2 py-1 text-center text-white font-mono text-title-s focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <span className="text-ink-2 text-label">×</span>
                  <input
                    type="number" min={1}
                    value={s.reps}
                    onChange={e => updateManualWarmupSet(wIdx, 'reps', parseInt(e.target.value) || 1)}
                    placeholder="reps"
                    className="w-16 bg-inset border border-hairline rounded-control px-2 py-1 text-center text-white font-mono text-title-s focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <button
                    onClick={() => removeManualWarmupSet(wIdx)}
                    className="p-1 text-ink-2 hover:text-red-400 transition-colors"
                    title="Eliminar"
                  >
                    <Icon name="delete" size="s" />
                  </button>
                </div>
              ))}
              <button
                onClick={addManualWarmupSet}
                className="flex items-center gap-1 text-caption font-sans text-accent hover:text-white transition-colors"
              >
                <Icon name="add" size="s" />
                Añadir serie de aproximación
              </button>
            </div>
          )}
        </div>
      </Collapsible>

      {/* Progresión por semanas (periodización) — solo con mesociclo conocido */}
      {mesoWeeks !== undefined && (
        <Collapsible
          defaultOpen={progresion.length > 0}
          className="border-t border-hairline pt-3"
          trigger={
            <span className="flex items-center gap-1.5 font-mono text-caption text-ink-2 uppercase tracking-wider">
              <Icon name="trending_up" size="s" />
              Progresión por semanas
              {progresion.length > 0 && (
                <span className="text-accent">· {progresion.length}</span>
              )}
            </span>
          }
        >
          <div className="mt-2 space-y-2">
            {progresion.length === 0 && (
              <p className="font-sans text-caption text-ink-3 leading-relaxed">
                Añade series automáticamente en semanas concretas del mesociclo — por ejemplo, +1 serie en la semana 4 y otra en la 6.
              </p>
            )}
            {progresion.map((rule, idx) => (
              <div key={idx} className="bg-raised border border-hairline rounded-surface p-3 flex items-center gap-2">
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="font-mono text-caption text-ink-2 uppercase tracking-wider">Semana</span>
                  <input
                    type="number"
                    min={1}
                    max={mesoWeeks}
                    value={rule.atWeek}
                    onChange={e => updateProgressionRule(idx, { atWeek: Math.min(mesoWeeks, Math.max(1, parseInt(e.target.value) || 1)) })}
                    className="w-14 bg-inset border border-hairline rounded-control px-2 py-1 text-center text-white font-mono text-title-s font-bold focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <span className="font-mono text-caption text-ink-2 uppercase tracking-wider flex-shrink-0">+</span>
                  <input
                    type="number"
                    min={-10}
                    max={10}
                    value={rule.addSets ?? 0}
                    onChange={e => updateProgressionRule(idx, { addSets: parseInt(e.target.value) || 0 })}
                    className="w-14 bg-inset border border-hairline rounded-control px-2 py-1 text-center text-white font-mono text-title-s font-bold focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <span className="font-sans text-caption text-ink-2 flex-shrink-0">series</span>
                </div>
                <button
                  onClick={() => removeProgressionRule(idx)}
                  className="p-1 text-ink-3 hover:text-red-400 transition-colors flex-shrink-0"
                  title="Eliminar"
                >
                  <Icon name="delete" size="s" />
                </button>
              </div>
            ))}
            <button
              onClick={addProgressionRule}
              className="w-full flex items-center justify-center gap-2 bg-bg border border-dashed border-hairline rounded-control px-3 py-2.5 text-title-s font-sans text-ink-2 hover:text-accent hover:border-accent/40 transition-all"
            >
              <Icon name="add" size="s" />
              Añadir escalón de progresión
            </button>
          </div>
        </Collapsible>
      )}

      {/* Grabar con el móvil — icono pequeño en vez de bloque grande (Bloque
          A2): es un flag que se toca a menudo, no necesita todo el ancho. */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleRecordVideo}
          title={we.recordVideoSet ? 'Pedir vídeo activado' : 'Pedir vídeo de esta serie'}
          className={`w-9 h-9 rounded-control flex items-center justify-center flex-shrink-0 transition-colors border ${
            we.recordVideoSet ? 'bg-accent/14 border-accent text-accent' : 'bg-surface border-hairline text-ink-2 hover:text-white hover:border-strong'
          }`}
        >
          <Icon name="videocam" size="s" />
        </button>
        <span className="font-mono text-caption text-ink-2 uppercase tracking-wider">
          {we.recordVideoSet ? 'Pide vídeo al atleta' : 'Vídeo desactivado'}
        </span>
        {we.recordVideoSet && (
          <select
            value={we.recordVideoSet}
            onChange={e => onChange({ recordVideoSet: e.target.value === 'all' ? 'all' : parseInt(e.target.value) })}
            className="ml-auto bg-bg border border-hairline rounded-control px-2 py-1.5 text-caption font-mono text-white focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer"
          >
            <option value="all">Todas las series</option>
            {Array.from({ length: we.sets }, (_, i) => i + 1).map(n => (
              <option key={n} value={n}>Solo serie {n}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
