import { WorkoutExercise, WorkoutTechnique, WarmupMode, WarmupSet, WorkoutSetGroup } from '../types';
import { TECHNIQUES, TECHNIQUE_EMOJI, TECHNIQUE_LABEL, TECHNIQUE_COLOR, TECHNIQUE_DESCRIPTION } from '../utils/workoutTechniques';
import { syncAggregateFromGroups, newSetGroup } from '../utils/setGroups';

interface Props {
  we: WorkoutExercise;
  onChange: (patch: Partial<WorkoutExercise>) => void;
}

// Full execution-config editor for one exercise inside a routine — series/reps/rir
// (uniform or split into top-set/back-off-set blocks), rest, high-intensity technique,
// video reminder and warm-up mode. Used identically from WorkoutsScreen (shared routine
// library) and from MesocycleManager's generator preview + "Ejercicios programados" tab,
// so a coach configures an exercise the same way no matter which screen they're on.
export default function ExerciseConfigEditor({ we, onChange }: Props) {
  const hasGroups = (we.setGroups?.length ?? 0) > 0;

  const enableGroups = () => {
    const seed: WorkoutSetGroup = { label: 'Top set', sets: we.sets, reps: we.reps, rir: we.rir };
    onChange(syncAggregateFromGroups({ ...we, setGroups: [seed] }));
  };

  const disableGroups = () => {
    onChange({ setGroups: undefined });
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

  return (
    <div className="space-y-3">
      {/* Series / Reps / Descanso / RIR — uniforme o por bloques */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="block font-mono text-[9px] text-[#c6c9ab] uppercase">Series</label>
          <button
            type="button"
            onClick={hasGroups ? disableGroups : enableGroups}
            className="font-mono text-[9px] text-[#fbcb1a] hover:text-white transition-colors"
          >
            {hasGroups ? '← Volver a series uniformes' : 'Dividir en bloques (top set / back-off)'}
          </button>
        </div>

        {!hasGroups ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block font-mono text-[9px] text-[#c6c9ab] uppercase mb-1">Series</label>
              <input
                type="number" min={1} max={20}
                value={we.sets}
                onChange={e => onChange({ sets: parseInt(e.target.value) || 1 })}
                className="w-full bg-[#0e0e0e] border border-white/7 rounded-md px-2 py-1.5 text-center text-white font-mono text-sm focus:outline-none focus:ring-1 focus:ring-[#fbcb1a]"
              />
            </div>
            <div>
              <label className="block font-mono text-[9px] text-[#c6c9ab] uppercase mb-1">Reps</label>
              <input
                type="text"
                value={we.reps}
                onChange={e => onChange({ reps: e.target.value })}
                placeholder="8-10"
                className="w-full bg-[#0e0e0e] border border-white/7 rounded-md px-2 py-1.5 text-center text-white font-mono text-sm focus:outline-none focus:ring-1 focus:ring-[#fbcb1a]"
              />
            </div>
            <div>
              <label className="block font-mono text-[9px] text-[#c6c9ab] uppercase mb-1">Descanso (s)</label>
              <input
                type="number" min={0}
                value={we.restSeconds}
                onChange={e => onChange({ restSeconds: parseInt(e.target.value) || 0 })}
                className="w-full bg-[#0e0e0e] border border-white/7 rounded-md px-2 py-1.5 text-center text-white font-mono text-sm focus:outline-none focus:ring-1 focus:ring-[#fbcb1a]"
              />
            </div>
            <div>
              <label className="block font-mono text-[9px] text-[#c6c9ab] uppercase mb-1">RIR</label>
              <input
                type="number" min={0} max={5}
                value={we.rir}
                onChange={e => onChange({ rir: parseInt(e.target.value) || 0 })}
                className="w-full bg-[#0e0e0e] border border-white/7 rounded-md px-2 py-1.5 text-center text-white font-mono text-sm focus:outline-none focus:ring-1 focus:ring-[#fbcb1a]"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {(we.setGroups || []).map((g, gIdx) => (
              <div key={gIdx} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-end bg-[#0e0e0e] border border-white/7 rounded-lg p-2">
                <div>
                  <label className="block font-mono text-[9px] text-[#c6c9ab] uppercase mb-1">Etiqueta</label>
                  <input
                    type="text"
                    value={g.label || ''}
                    onChange={e => updateGroup(gIdx, 'label', e.target.value)}
                    placeholder="Top set, Back-off..."
                    className="w-full bg-[#181816] border border-white/7 rounded-md px-2 py-1.5 text-white font-mono text-xs focus:outline-none focus:ring-1 focus:ring-[#fbcb1a]"
                  />
                </div>
                <div>
                  <label className="block font-mono text-[9px] text-[#c6c9ab] uppercase mb-1">Series</label>
                  <input
                    type="number" min={1} max={20}
                    value={g.sets}
                    onChange={e => updateGroup(gIdx, 'sets', parseInt(e.target.value) || 1)}
                    className="w-16 bg-[#181816] border border-white/7 rounded-md px-2 py-1.5 text-center text-white font-mono text-xs focus:outline-none focus:ring-1 focus:ring-[#fbcb1a]"
                  />
                </div>
                <div>
                  <label className="block font-mono text-[9px] text-[#c6c9ab] uppercase mb-1">Reps</label>
                  <input
                    type="text"
                    value={g.reps}
                    onChange={e => updateGroup(gIdx, 'reps', e.target.value)}
                    className="w-20 bg-[#181816] border border-white/7 rounded-md px-2 py-1.5 text-center text-white font-mono text-xs focus:outline-none focus:ring-1 focus:ring-[#fbcb1a]"
                  />
                </div>
                <div>
                  <label className="block font-mono text-[9px] text-[#c6c9ab] uppercase mb-1">RIR</label>
                  <input
                    type="number" min={0} max={5}
                    value={g.rir}
                    onChange={e => updateGroup(gIdx, 'rir', parseInt(e.target.value) || 0)}
                    className="w-14 bg-[#181816] border border-white/7 rounded-md px-2 py-1.5 text-center text-white font-mono text-xs focus:outline-none focus:ring-1 focus:ring-[#fbcb1a]"
                  />
                </div>
                <button
                  onClick={() => removeGroup(gIdx)}
                  className="p-1.5 text-[#c6c9ab] hover:text-red-400 transition-colors"
                  title="Eliminar bloque"
                >
                  <span className="material-symbols-outlined text-sm">delete</span>
                </button>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <button
                onClick={addGroup}
                className="flex items-center gap-1 text-[10px] font-mono text-[#fbcb1a] hover:text-white transition-colors"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                Añadir bloque
              </button>
              <span className="font-mono text-[9px] text-[#555]">
                Total: {we.sets} series · {we.reps}
              </span>
            </div>
            <div>
              <label className="block font-mono text-[9px] text-[#c6c9ab] uppercase mb-1">Descanso entre series (s)</label>
              <input
                type="number" min={0}
                value={we.restSeconds}
                onChange={e => onChange({ restSeconds: parseInt(e.target.value) || 0 })}
                className="w-24 bg-[#0e0e0e] border border-white/7 rounded-md px-2 py-1.5 text-center text-white font-mono text-sm focus:outline-none focus:ring-1 focus:ring-[#fbcb1a]"
              />
            </div>
          </div>
        )}
      </div>

      {/* Notas */}
      <input
        type="text"
        value={we.notes || ''}
        onChange={e => onChange({ notes: e.target.value })}
        placeholder="Notas opcionales (técnica, variante, carga...)"
        className="w-full bg-[#0e0e0e] border border-white/7 rounded-md px-3 py-1.5 text-xs text-[#c6c9ab] placeholder-[#c6c9ab]/30 font-sans focus:outline-none focus:ring-1 focus:ring-[#fbcb1a] transition-all"
      />

      {/* Grabar con el móvil */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={toggleRecordVideo}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-sans text-[10px] font-bold uppercase tracking-wider border transition-all ${
            we.recordVideoSet
              ? 'bg-[#fbcb1a]/10 border-[#fbcb1a]/40 text-[#fbcb1a]'
              : 'border-white/7 text-[#c6c9ab] hover:text-white hover:border-white/20'
          }`}
        >
          <span className="material-symbols-outlined text-sm">videocam</span>
          Grabar con el móvil
        </button>
        {we.recordVideoSet && (
          <select
            value={we.recordVideoSet}
            onChange={e => onChange({ recordVideoSet: e.target.value === 'all' ? 'all' : parseInt(e.target.value) })}
            className="bg-[#0e0e0e] border border-white/7 rounded-md px-2 py-1.5 text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-[#fbcb1a] cursor-pointer"
          >
            <option value="all">Todas las series</option>
            {Array.from({ length: we.sets }, (_, i) => i + 1).map(n => (
              <option key={n} value={n}>Solo serie {n}</option>
            ))}
          </select>
        )}
      </div>

      {/* Técnica de alta intensidad */}
      <div className="space-y-1.5">
        <label className="block font-mono text-[9px] text-[#c6c9ab] uppercase">Técnica de alta intensidad (opcional)</label>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setTechnique(undefined)}
            className={`px-2.5 py-1 rounded-lg font-mono text-[10px] font-bold uppercase tracking-wider border transition-all ${
              !we.technique
                ? 'bg-white/10 border-white/20 text-white'
                : 'border-white/7 text-[#c6c9ab] hover:text-white hover:border-white/20'
            }`}
          >Normal</button>
          {TECHNIQUES.map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTechnique(we.technique === t ? undefined : t)}
              title={TECHNIQUE_DESCRIPTION[t]}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-mono text-[10px] font-bold uppercase tracking-wider border transition-all ${
                we.technique === t
                  ? TECHNIQUE_COLOR[t]
                  : 'border-white/7 text-[#c6c9ab] hover:text-white hover:border-white/20'
              }`}
            >{TECHNIQUE_EMOJI[t]} {TECHNIQUE_LABEL[t]}</button>
          ))}
        </div>
        {we.technique && (
          <p className="font-sans text-[10px] text-[#c6c9ab] leading-relaxed pt-0.5">{TECHNIQUE_DESCRIPTION[we.technique]}</p>
        )}
      </div>

      {/* Warm-up (series de aproximación) */}
      <div className="space-y-2 border-t border-white/50 pt-3">
        <label className="block font-mono text-[9px] text-[#c6c9ab] uppercase">Series de aproximación (warm-up)</label>
        <div className="flex items-center gap-1.5 flex-wrap">
          {([['none', 'Ninguna'], ['auto', 'Automático'], ['manual', 'Manual']] as [WarmupMode, string][]).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setWarmupMode(mode)}
              className={`px-2.5 py-1 rounded-lg font-mono text-[10px] font-bold uppercase tracking-wider border transition-all ${
                (we.warmupMode || 'none') === mode
                  ? 'bg-orange-500/15 border-orange-500/40 text-orange-300'
                  : 'border-white/7 text-[#c6c9ab] hover:text-white hover:border-white/20'
              }`}
            >{label}</button>
          ))}
        </div>
        {we.warmupMode === 'auto' && (
          <p className="font-sans text-[10px] text-[#c6c9ab] leading-relaxed pt-0.5">
            🔥 El atleta verá series de aproximación calculadas automáticamente a partir del peso que escriba en la primera serie efectiva y su historial en este ejercicio.
          </p>
        )}
        {we.warmupMode === 'manual' && (
          <div className="space-y-1.5 pt-1">
            {(we.manualWarmupSets || []).map((s, wIdx) => (
              <div key={wIdx} className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-orange-300 w-8">W{wIdx + 1}</span>
                <input
                  type="number" min={0} step={0.5}
                  value={s.weight}
                  onChange={e => updateManualWarmupSet(wIdx, 'weight', parseFloat(e.target.value) || 0)}
                  placeholder="kg"
                  className="w-20 bg-[#0e0e0e] border border-white/7 rounded-md px-2 py-1 text-center text-white font-mono text-xs focus:outline-none focus:ring-1 focus:ring-[#fbcb1a]"
                />
                <span className="text-[#c6c9ab] text-xs">×</span>
                <input
                  type="number" min={1}
                  value={s.reps}
                  onChange={e => updateManualWarmupSet(wIdx, 'reps', parseInt(e.target.value) || 1)}
                  placeholder="reps"
                  className="w-16 bg-[#0e0e0e] border border-white/7 rounded-md px-2 py-1 text-center text-white font-mono text-xs focus:outline-none focus:ring-1 focus:ring-[#fbcb1a]"
                />
                <button
                  onClick={() => removeManualWarmupSet(wIdx)}
                  className="p-1 text-[#c6c9ab] hover:text-red-400 transition-colors"
                  title="Eliminar"
                >
                  <span className="material-symbols-outlined text-sm">delete</span>
                </button>
              </div>
            ))}
            <button
              onClick={addManualWarmupSet}
              className="flex items-center gap-1 text-[10px] font-mono text-orange-300 hover:text-orange-200 transition-colors pt-0.5"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              Añadir serie de aproximación
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
