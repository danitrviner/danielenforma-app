import React, { useState, useEffect, useCallback } from 'react';
import { Exercise, Workout, WorkoutExercise, MUSCLE_LABELS } from '../types';
import { getWorkouts, createWorkout, updateWorkout, deleteWorkout, getExercises, seedExercisesIfEmpty } from '../dbService';
import StatTile from './StatTile';
import ExerciseConfigEditor from './ExerciseConfigEditor';
import { TECHNIQUE_EMOJI, TECHNIQUE_LABEL, TECHNIQUE_COLOR } from '../utils/workoutTechniques';
import { useToast } from '../hooks/useToast';
import Skeleton from './Skeleton';

interface WorkoutsScreenProps {
  coachId: string;
}

type View = 'list' | 'editor';

const TYPE_CHIP: Record<string, string> = {
  fuerza:       'bg-[#00eefc]/10 text-[#00eefc] border border-[#00eefc]/20',
  cardio:       'bg-orange-500/10 text-orange-300 border border-orange-500/20',
  estiramiento: 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20',
  pliometría:   'bg-[#fbcb1a]/10 text-[#fbcb1a] border border-[#fbcb1a]/20',
};

const DEFAULT_WE: Omit<WorkoutExercise, 'exerciseId' | 'order'> = {
  sets: 3,
  reps: '8-10',
  restSeconds: 90,
  rir: 2,
  notes: '',
};

export default function WorkoutsScreen({ coachId }: WorkoutsScreenProps) {
  const { showToast } = useToast();
  const [view, setView] = useState<View>('list');
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  // Editor state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorName, setEditorName] = useState('');
  const [editorExercises, setEditorExercises] = useState<WorkoutExercise[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Selección para edición en bloque — progresar varios ejercicios a la vez
  // ("todos los básicos a RIR 1 esta semana") en vez de abrir cada uno.
  const [selectedIdx, setSelectedIdx] = useState<Set<number>>(new Set());
  const [bulkRir, setBulkRir] = useState('2');
  const [bulkRest, setBulkRest] = useState('90');

  // Exercise picker state
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerFocus, setPickerFocus] = useState('');
  const [pickerType, setPickerType] = useState('');

  const loadWorkouts = useCallback(async () => {
    setLoading(true);
    try {
      setWorkouts(await getWorkouts());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkouts();
    seedExercisesIfEmpty()
      .then(() => getExercises())
      .then(setAllExercises)
      .catch(console.error);
  }, [loadWorkouts]);

  const ensureExercisesLoaded = async () => {
    if (allExercises.length > 0) return;
    try {
      await seedExercisesIfEmpty();
      setAllExercises(await getExercises());
    } catch (err) {
      console.error('Error cargando ejercicios:', err);
    }
  };

  const openEditor = async (workout?: Workout) => {
    await ensureExercisesLoaded();
    setSelectedIdx(new Set());
    if (workout) {
      setEditingId(workout.id);
      setEditorName(workout.name);
      setEditorExercises([...workout.exercises].sort((a, b) => a.order - b.order));
    } else {
      setEditingId(null);
      setEditorName('');
      setEditorExercises([]);
    }
    setView('editor');
  };

  const handleSave = async () => {
    if (!editorName.trim()) return;
    setIsSaving(true);
    try {
      const data: Omit<Workout, 'id'> = {
        ownerId: coachId,
        name: editorName.trim(),
        exercises: editorExercises.map((ex, i) => ({ ...ex, order: i })),
      };
      if (editingId) {
        await updateWorkout(editingId, data);
        setWorkouts(prev => prev.map(w => w.id === editingId ? { ...w, ...data } : w));
        flash('Rutina actualizada.');
      } else {
        const newW = await createWorkout(data);
        setWorkouts(prev => [...prev, newW]);
        flash('Rutina creada.');
      }
      setView('list');
    } catch (err) {
      console.error(err);
      showToast('No se pudo guardar la rutina.');
    } finally {
      setIsSaving(false);
    }
  };

  // Copia instantánea para usar como base de una progresión o variante —
  // antes crear "Día 2 parecido al Día 1" exigía recrear cada ejercicio a
  // mano en el editor.
  const handleDuplicate = async (w: Workout) => {
    setDuplicatingId(w.id);
    try {
      const copy = await createWorkout({
        ownerId: w.ownerId,
        name: `${w.name} (copia)`,
        exercises: w.exercises,
      });
      setWorkouts(prev => [...prev, copy]);
      flash('Rutina duplicada.');
    } catch (err) {
      console.error(err);
      showToast('No se pudo duplicar la rutina.');
    } finally {
      setDuplicatingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteWorkout(id);
      setWorkouts(prev => prev.filter(w => w.id !== id));
      setDeleteConfirm(null);
      flash('Rutina eliminada.');
    } catch (err) {
      console.error(err);
      showToast('No se pudo eliminar la rutina.');
    }
  };

  function flash(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  }

  // ── Exercise picker ───────────────────────────────────────────────────────
  const openPicker = async () => {
    await ensureExercisesLoaded();
    setPickerSearch('');
    setPickerFocus('');
    setPickerType('');
    setShowPicker(true);
  };

  const addExerciseToWorkout = (ex: Exercise) => {
    const newWE: WorkoutExercise = {
      ...DEFAULT_WE,
      exerciseId: ex.id,
      order: editorExercises.length,
    };
    setEditorExercises(prev => [...prev, newWE]);
    setShowPicker(false);
  };

  const pickerFiltered = allExercises.filter(ex => {
    if (pickerSearch && !ex.name.toLowerCase().includes(pickerSearch.toLowerCase())) return false;
    if (pickerFocus && ex.primaryFocus !== pickerFocus) return false;
    if (pickerType && ex.type !== pickerType) return false;
    // exclude already added
    if (editorExercises.find(we => we.exerciseId === ex.id)) return false;
    return true;
  });

  const FOCUS_OPTIONS = Array.from(new Set<string>(allExercises.map(e => e.primaryFocus))).sort();
  const TYPE_OPTIONS = Array.from(new Set<string>(allExercises.map(e => e.type))).sort();

  // ── Editor helpers ────────────────────────────────────────────────────────
  // Ambas limpian la selección de edición en bloque: es por índice, y
  // reordenar/quitar filas la desalinearía en silencio (seleccionar el
  // ejercicio equivocado sin que se note).
  const moveWE = (idx: number, dir: -1 | 1) => {
    const next = idx + dir;
    if (next < 0 || next >= editorExercises.length) return;
    setEditorExercises(prev => {
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr;
    });
    setSelectedIdx(new Set());
  };

  const removeWE = (idx: number) => {
    setEditorExercises(prev => prev.filter((_, i) => i !== idx));
    setSelectedIdx(new Set());
  };

  // Patch-style update used by the shared ExerciseConfigEditor (series/reps/rir or
  // setGroups, notes, video, technique, warm-up — one merge instead of one setter per field).
  const updateWEPatch = (idx: number, patch: Partial<WorkoutExercise>) => {
    setEditorExercises(prev => prev.map((we, i) => i === idx ? { ...we, ...patch } : we));
  };

  // ── Edición en bloque ─────────────────────────────────────────────────────
  const toggleSelected = (idx: number) => {
    setSelectedIdx(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  // El descanso no depende de setGroups (solo sets/reps/rir se agregan desde
  // ahí — ver src/utils/setGroups.ts), así que siempre es seguro tocarlo en bloque.
  const applyBulkRest = () => {
    const seconds = parseInt(bulkRest);
    if (!seconds || seconds <= 0) return;
    setEditorExercises(prev => prev.map((we, i) => selectedIdx.has(i) ? { ...we, restSeconds: seconds } : we));
    flash(`Descanso de ${seconds}s aplicado a ${selectedIdx.size} ejercicio${selectedIdx.size !== 1 ? 's' : ''}.`);
  };

  // El RIR sí se agrega desde setGroups cuando existen (el campo `rir` pasa a
  // ser un resumen del primer bloque) — tocarlo directo desengancharía el
  // resumen del dato real, así que esos ejercicios se saltan en bloque.
  // `skipped` se calcula aparte de la función de actualización de estado
  // (no dentro de ella con un contador mutable) porque React StrictMode
  // invoca dos veces las funciones de actualización en desarrollo — un
  // contador ahí dentro contaría doble en el mensaje, aunque el estado
  // final seguiría siendo correcto.
  const applyBulkRir = () => {
    const rir = parseInt(bulkRir);
    if (isNaN(rir) || rir < 0) return;
    const skipped = editorExercises.filter((we, i) => selectedIdx.has(i) && we.setGroups && we.setGroups.length > 0).length;
    setEditorExercises(prev => prev.map((we, i) =>
      selectedIdx.has(i) && !(we.setGroups && we.setGroups.length > 0) ? { ...we, rir } : we
    ));
    const applied = selectedIdx.size - skipped;
    flash(`RIR ${rir} aplicado a ${applied} ejercicio${applied !== 1 ? 's' : ''}.${skipped > 0 ? ` ${skipped} con bloques de series se saltaron (edítalos uno a uno).` : ''}`);
  };

  const adjustBulkSets = (delta: 1 | -1) => {
    const skipped = editorExercises.filter((we, i) => selectedIdx.has(i) && we.setGroups && we.setGroups.length > 0).length;
    setEditorExercises(prev => prev.map((we, i) =>
      selectedIdx.has(i) && !(we.setGroups && we.setGroups.length > 0) ? { ...we, sets: Math.max(1, we.sets + delta) } : we
    ));
    const applied = selectedIdx.size - skipped;
    flash(`${delta > 0 ? '+1 serie' : '-1 serie'} aplicado a ${applied} ejercicio${applied !== 1 ? 's' : ''}.${skipped > 0 ? ` ${skipped} con bloques de series se saltaron.` : ''}`);
  };

  const getExerciseInfo = (exerciseId: string) =>
    allExercises.find(e => e.id === exerciseId);

  // ── Render: LIST ──────────────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <div className="space-y-6">
        <header className="flex flex-col md:flex-row md:items-end justify-between pb-4 border-b border-white/60 gap-4">
          <div>
            <h1 className="font-sans font-black text-3xl tracking-tight text-white uppercase">Rutinas</h1>
            <p className="text-[#c6c9ab] text-sm mt-1">
              {workouts.length} rutinas creadas
            </p>
          </div>
          <button
            onClick={() => openEditor()}
            className="flex items-center gap-2 h-[42px] px-5 bg-[#fbcb1a] text-black font-sans font-bold text-xs uppercase rounded-lg hover:bg-[#d4a800] active:scale-95 transition-all shadow-md shadow-[#fbcb1a]/10 self-start md:self-auto"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            Nueva rutina
          </button>
        </header>

        {successMsg && (
          <div className="bg-[#fbcb1a]/10 border border-[#fbcb1a]/25 text-white p-3 rounded-xl text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-[#fbcb1a] text-base">check_circle</span>
            {successMsg}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
          </div>
        ) : workouts.length === 0 ? (
          <div className="bg-[#181816] border border-dashed border-white/7 rounded-2xl p-16 text-center">
            <span className="material-symbols-outlined text-4xl text-[#fbcb1a]/40 block mb-3">format_list_bulleted</span>
            <p className="text-white font-bold text-sm">Sin rutinas todavía</p>
            <p className="text-[#c6c9ab] text-xs mt-1">Crea tu primera rutina para empezar a asignarla a tus atletas.</p>
            <button
              onClick={() => openEditor()}
              className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 bg-[#fbcb1a]/10 border border-[#fbcb1a]/30 text-[#fbcb1a] font-mono text-xs uppercase rounded-lg hover:bg-[#fbcb1a]/20 transition-all"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              Crear primera rutina
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {workouts.map(w => {
              const totalSets = w.exercises.reduce((s, we) => s + (we.sets || 0), 0);
              return (
              <div
                key={w.id}
                className="bg-[#181816] border border-white/7 rounded-3xl p-5 hover:border-[#fbcb1a]/30 hover:shadow-[0_0_30px_-10px_rgba(251,203,26,0.35)] transition-all group relative overflow-hidden"
              >
                <div className="absolute right-0 top-0 w-14 h-14 bg-gradient-to-tr from-transparent to-[#fbcb1a]/5 rounded-bl-full pointer-events-none" />

                <h3 className="font-sans font-black text-white text-base mb-3 group-hover:text-[#fbcb1a] transition-colors pr-4">
                  {w.name}
                </h3>

                <div className="grid grid-cols-2 gap-2 mb-4">
                  <StatTile icon="format_list_numbered" label="Ejercicios" value={w.exercises.length} />
                  <StatTile icon="repeat" label="Series totales" value={totalSets} />
                </div>

                {w.exercises.length > 0 && (
                  <div className="space-y-1 mb-4">
                    {w.exercises.slice(0, 4).map((we, i) => {
                      const ex = getExerciseInfo(we.exerciseId);
                      return (
                        <div key={i} className="flex items-center gap-2 text-xs font-mono text-[#c6c9ab]">
                          <span className="text-[#2a2a2a] font-bold w-4 text-center">{i + 1}</span>
                          <span className="truncate">{ex?.name || (we.muscleGroup ? MUSCLE_LABELS[we.muscleGroup] : '—')}</span>
                          {we.recordVideoSet && (
                            <span className="material-symbols-outlined text-[#fbcb1a] text-[13px] flex-shrink-0" title="Recordatorio de vídeo activo">videocam</span>
                          )}
                          {we.technique && (
                            <span className="flex-shrink-0" title={TECHNIQUE_LABEL[we.technique]}>{TECHNIQUE_EMOJI[we.technique]}</span>
                          )}
                          <span className="flex-shrink-0 text-[10px]">{we.sets}×{we.reps}</span>
                        </div>
                      );
                    })}
                    {w.exercises.length > 4 && (
                      <p className="text-[10px] text-[#c6c9ab]/60 font-mono pl-6">
                        +{w.exercises.length - 4} más...
                      </p>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2 pt-3 border-t border-white/60">
                  <button
                    onClick={() => openEditor(w)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-[#1e1e1b] hover:bg-[#fbcb1a]/10 border border-white/7 hover:border-[#fbcb1a]/30 text-[#c6c9ab] hover:text-[#fbcb1a] rounded-xl font-mono text-[10px] uppercase font-bold transition-all"
                  >
                    <span className="material-symbols-outlined text-sm">edit</span>
                    Editar
                  </button>
                  <button
                    onClick={() => handleDuplicate(w)}
                    disabled={duplicatingId === w.id}
                    title="Duplicar rutina"
                    className="flex items-center justify-center gap-1.5 py-2 px-3 bg-[#1e1e1b] hover:bg-[#fbcb1a]/10 border border-white/7 hover:border-[#fbcb1a]/30 text-[#c6c9ab] hover:text-[#fbcb1a] rounded-xl font-mono text-[10px] uppercase font-bold transition-all disabled:opacity-50"
                  >
                    <span className={`material-symbols-outlined text-sm ${duplicatingId === w.id ? 'animate-spin' : ''}`}>
                      {duplicatingId === w.id ? 'progress_activity' : 'content_copy'}
                    </span>
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(w.id)}
                    title="Eliminar rutina"
                    className="flex items-center justify-center gap-1.5 py-2 px-3 bg-[#1e1e1b] hover:bg-red-500/10 border border-white/7 hover:border-red-500/30 text-[#c6c9ab] hover:text-red-400 rounded-xl font-mono text-[10px] uppercase font-bold transition-all"
                  >
                    <span className="material-symbols-outlined text-sm">delete</span>
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        )}

        {/* Delete confirm */}
        {deleteConfirm && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#1e1e1b] border border-red-500/30 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-red-400 text-2xl">warning</span>
                <h3 className="font-sans font-bold text-white text-lg">¿Eliminar rutina?</h3>
              </div>
              <p className="text-sm text-[#c6c9ab]">Las asignaciones ya creadas no se verán afectadas, pero la rutina dejará de estar disponible.</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2.5 border border-white/7 text-[#c6c9ab] hover:text-white font-mono text-xs uppercase rounded-lg transition-all">
                  Cancelar
                </button>
                <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 py-2.5 bg-red-500/80 hover:bg-red-500 text-white font-sans font-bold text-xs uppercase rounded-lg transition-all">
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Render: EDITOR ────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Editor header */}
      <header className="flex items-center gap-4 pb-4 border-b border-white/60">
        <button
          onClick={() => setView('list')}
          className="flex items-center gap-1.5 text-xs font-mono text-[#c6c9ab] hover:text-white border border-white/7 hover:border-[#3a3a3a] px-3 py-2 rounded-lg transition-all"
        >
          <span className="material-symbols-outlined text-sm">arrow_back</span>
          Volver
        </button>
        <h1 className="font-sans font-black text-2xl tracking-tight text-white uppercase">
          {editingId ? 'Editar rutina' : 'Nueva rutina'}
        </h1>
      </header>

      {editorExercises.length > 0 && (
        <div className="grid grid-cols-2 gap-3 max-w-sm">
          <StatTile icon="format_list_numbered" label="Ejercicios" value={editorExercises.length} />
          <StatTile icon="repeat" label="Series totales" value={editorExercises.reduce((s, we) => s + (we.sets || 0), 0)} />
        </div>
      )}

      {/* Name */}
      <div>
        <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-2">Nombre de la rutina *</label>
        <input
          type="text"
          autoFocus
          value={editorName}
          onChange={e => setEditorName(e.target.value)}
          placeholder="ej. Fullbody A — Semana 1"
          className="w-full bg-[#1e1e1b] border border-white/7 rounded-xl px-4 py-3.5 text-lg font-sans font-bold text-white placeholder-[#c6c9ab]/30 focus:outline-none focus:ring-1 focus:ring-[#fbcb1a] transition-all"
        />
      </div>

      {/* Exercise list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-widest">
            Ejercicios ({editorExercises.length})
          </h2>
          <button
            onClick={openPicker}
            className="flex items-center gap-1.5 text-xs font-mono text-[#fbcb1a] hover:text-white border border-[#fbcb1a]/30 hover:border-[#fbcb1a] px-3 py-1.5 rounded-lg transition-all"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            Añadir ejercicio
          </button>
        </div>

        {editorExercises.length === 0 ? (
          <div
            onClick={openPicker}
            className="bg-[#181816] border border-dashed border-white/7 hover:border-[#fbcb1a]/30 rounded-2xl p-10 text-center cursor-pointer transition-all group"
          >
            <span className="material-symbols-outlined text-3xl text-[#fbcb1a]/30 group-hover:text-[#fbcb1a]/60 transition-all block mb-2">add_circle</span>
            <p className="text-xs text-[#c6c9ab] group-hover:text-white transition-colors">Haz clic para añadir el primer ejercicio</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Barra de edición en bloque — progresar varios ejercicios a la vez
                ("todos los básicos a RIR 1 esta semana") en vez de abrir cada uno. */}
            {editorExercises.length > 1 && (
              <div className="flex items-center gap-2 flex-wrap bg-[#181816] border border-white/7 rounded-xl px-3 py-2">
                <button
                  onClick={() => setSelectedIdx(prev =>
                    prev.size === editorExercises.length ? new Set() : new Set(editorExercises.map((_, i) => i))
                  )}
                  className="font-mono text-[10px] text-[#c6c9ab] hover:text-white uppercase tracking-wide flex-shrink-0"
                >
                  {selectedIdx.size === editorExercises.length ? 'Ninguno' : 'Todos'}
                </button>
                {selectedIdx.size > 0 && (
                  <>
                    <span className="font-mono text-[10px] text-[#fbcb1a] flex-shrink-0">{selectedIdx.size} seleccionados</span>
                    <span className="w-px h-4 bg-white/10 flex-shrink-0" />
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => adjustBulkSets(-1)} className="w-6 h-6 flex items-center justify-center rounded bg-[#1e1e1e] border border-white/7 text-[#c6c9ab] hover:text-white text-xs">−</button>
                      <span className="font-mono text-[9px] text-[#c6c9ab] uppercase">series</span>
                      <button onClick={() => adjustBulkSets(1)} className="w-6 h-6 flex items-center justify-center rounded bg-[#1e1e1e] border border-white/7 text-[#c6c9ab] hover:text-white text-xs">+</button>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <input
                        type="number" min={0} max={5} value={bulkRir} onChange={e => setBulkRir(e.target.value)}
                        className="w-10 bg-[#1e1e1e] border border-white/7 rounded px-1 py-0.5 text-center text-white font-mono text-xs"
                      />
                      <button onClick={applyBulkRir} className="font-mono text-[9px] text-[#c6c9ab] hover:text-[#fbcb1a] uppercase px-1.5 py-0.5 border border-white/7 rounded">RIR</button>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <input
                        type="number" min={0} value={bulkRest} onChange={e => setBulkRest(e.target.value)}
                        className="w-12 bg-[#1e1e1e] border border-white/7 rounded px-1 py-0.5 text-center text-white font-mono text-xs"
                      />
                      <button onClick={applyBulkRest} className="font-mono text-[9px] text-[#c6c9ab] hover:text-[#fbcb1a] uppercase px-1.5 py-0.5 border border-white/7 rounded">Descanso (s)</button>
                    </div>
                  </>
                )}
              </div>
            )}
            {editorExercises.map((we, idx) => {
              const ex = getExerciseInfo(we.exerciseId);
              return (
                <div key={`${we.exerciseId}-${idx}`} className={`bg-[#181816] border rounded-2xl overflow-hidden ${selectedIdx.has(idx) ? 'border-[#fbcb1a]/50' : 'border-white/7'}`}>
                  {/* Exercise info bar */}
                  <div className="flex items-center gap-3 px-4 py-3 bg-[#161616] border-b border-white/50">
                    <input
                      type="checkbox"
                      checked={selectedIdx.has(idx)}
                      onChange={() => toggleSelected(idx)}
                      className="w-4 h-4 flex-shrink-0 accent-[#fbcb1a]"
                    />
                    <span className="font-mono text-[10px] text-[#c6c9ab]/50 w-5 text-center flex-shrink-0 font-bold">{idx + 1}</span>
                    {ex?.imageUrl ? (
                      <img src={ex.imageUrl} alt={ex.name} className="w-8 h-8 rounded-md object-cover border border-white/7 flex-shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-md bg-[#1e1e1e] border border-white/7 flex items-center justify-center flex-shrink-0">
                        <span className="material-symbols-outlined text-xs text-[#c6c9ab]">fitness_center</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-sans font-bold text-sm text-white truncate flex items-center gap-1.5">
                        {ex?.name || we.exerciseId}
                        {we.technique && (
                          <span className={`inline-flex items-center gap-1 text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded border ${TECHNIQUE_COLOR[we.technique]}`}>
                            {TECHNIQUE_EMOJI[we.technique]} {TECHNIQUE_LABEL[we.technique]}
                          </span>
                        )}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="font-mono text-[9px] text-[#c6c9ab] capitalize">{ex?.primaryFocus}</span>
                        {ex?.type && (
                          <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded capitalize ${TYPE_CHIP[ex.type] || ''}`}>{ex.type}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => moveWE(idx, -1)}
                        disabled={idx === 0}
                        className="p-1 text-[#c6c9ab] hover:text-white disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                        title="Subir"
                      >
                        <span className="material-symbols-outlined text-sm">arrow_upward</span>
                      </button>
                      <button
                        onClick={() => moveWE(idx, 1)}
                        disabled={idx === editorExercises.length - 1}
                        className="p-1 text-[#c6c9ab] hover:text-white disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                        title="Bajar"
                      >
                        <span className="material-symbols-outlined text-sm">arrow_downward</span>
                      </button>
                      <button
                        onClick={() => removeWE(idx)}
                        className="p-1 text-[#c6c9ab] hover:text-red-400 transition-colors ml-1"
                        title="Eliminar"
                      >
                        <span className="material-symbols-outlined text-sm">delete</span>
                      </button>
                    </div>
                  </div>

                  {/* Configuración de ejecución — series/reps/rir (uniforme o por bloques),
                      descanso, notas, vídeo, técnica y warm-up. Componente compartido con
                      el generador de mesociclos para que configurar un ejercicio se sienta
                      igual en cualquier pantalla. */}
                  <div className="px-4 py-3">
                    <ExerciseConfigEditor we={we} onChange={patch => updateWEPatch(idx, patch)} />
                  </div>
                </div>
              );
            })}

            {/* Add more */}
            <button
              onClick={openPicker}
              className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-white/7 hover:border-[#fbcb1a]/40 text-[#c6c9ab] hover:text-[#fbcb1a] rounded-xl font-mono text-xs uppercase transition-all"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              Añadir ejercicio
            </button>
          </div>
        )}
      </div>

      {/* Save / Cancel */}
      <div className="flex gap-3 pt-2 border-t border-white/60">
        <button
          onClick={() => setView('list')}
          className="flex-1 md:flex-none md:px-8 py-3 border border-white/7 text-[#c6c9ab] hover:text-white font-mono text-xs uppercase rounded-xl transition-all"
        >
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving || !editorName.trim()}
          className="flex-1 py-3 bg-[#fbcb1a] text-black font-sans font-bold text-xs uppercase rounded-xl hover:bg-[#d4a800] active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2 shadow-md shadow-[#fbcb1a]/10"
        >
          {isSaving ? (
            <><span className="material-symbols-outlined text-sm animate-spin">refresh</span>Guardando...</>
          ) : (
            <><span className="material-symbols-outlined text-sm">save</span>{editingId ? 'Guardar cambios' : 'Crear rutina'}</>
          )}
        </button>
      </div>

      {/* Exercise picker modal */}
      {showPicker && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="bg-[#1e1e1b] border border-white/7 rounded-t-2xl md:rounded-2xl w-full md:max-w-2xl shadow-2xl flex flex-col max-h-[85vh]">
            {/* Picker header */}
            <div className="flex items-center justify-between p-5 border-b border-white/7 flex-shrink-0">
              <h3 className="font-sans font-bold text-white text-lg">Seleccionar ejercicio</h3>
              <button onClick={() => setShowPicker(false)} className="text-[#c6c9ab] hover:text-white transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Picker filters */}
            <div className="p-4 border-b border-white/7 space-y-3 flex-shrink-0">
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#c6c9ab] text-base pointer-events-none">search</span>
                <input
                  autoFocus
                  type="text"
                  placeholder="Buscar por nombre..."
                  value={pickerSearch}
                  onChange={e => setPickerSearch(e.target.value)}
                  className="w-full bg-[#181816] border border-white/7 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder-[#c6c9ab]/50 focus:outline-none focus:ring-1 focus:ring-[#fbcb1a]"
                />
              </div>
              <div className="flex gap-2">
                <select
                  value={pickerFocus}
                  onChange={e => setPickerFocus(e.target.value)}
                  className="flex-1 bg-[#181816] border border-white/7 rounded-lg px-3 py-2 text-xs font-mono text-[#c6c9ab] focus:outline-none focus:ring-1 focus:ring-[#fbcb1a] cursor-pointer"
                >
                  <option value="">Todos los músculos</option>
                  {FOCUS_OPTIONS.map(f => <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>)}
                </select>
                <select
                  value={pickerType}
                  onChange={e => setPickerType(e.target.value)}
                  className="flex-1 bg-[#181816] border border-white/7 rounded-lg px-3 py-2 text-xs font-mono text-[#c6c9ab] focus:outline-none focus:ring-1 focus:ring-[#fbcb1a] cursor-pointer"
                >
                  <option value="">Todos los tipos</option>
                  {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
            </div>

            {/* Picker list */}
            <div className="overflow-y-auto flex-1 divide-y divide-[#2a2a2a]/40">
              {pickerFiltered.length === 0 ? (
                <div className="py-12 text-center text-[#c6c9ab] text-sm">
                  {allExercises.length === 0 ? 'Cargando ejercicios...' : 'Sin resultados para los filtros actuales.'}
                </div>
              ) : (
                pickerFiltered.map(ex => (
                  <button
                    key={ex.id}
                    onClick={() => addExerciseToWorkout(ex)}
                    className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-[#1e1e1e] text-left transition-colors group"
                  >
                    {ex.imageUrl ? (
                      <img src={ex.imageUrl} alt={ex.name} className="w-10 h-10 rounded-lg object-cover border border-white/7 flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-[#1e1e1e] border border-white/7 flex items-center justify-center flex-shrink-0">
                        <span className="material-symbols-outlined text-base text-[#c6c9ab]">fitness_center</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-sans font-bold text-sm text-white group-hover:text-[#fbcb1a] transition-colors truncate">{ex.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-mono text-[10px] text-[#c6c9ab] capitalize">{ex.primaryFocus}</span>
                        <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded capitalize ${TYPE_CHIP[ex.type] || ''}`}>{ex.type}</span>
                      </div>
                    </div>
                    <span className="material-symbols-outlined text-[#fbcb1a]/50 group-hover:text-[#fbcb1a] transition-colors flex-shrink-0">add_circle</span>
                  </button>
                ))
              )}
            </div>

            <div className="p-4 border-t border-white/7 flex-shrink-0">
              <p className="font-mono text-[10px] text-[#c6c9ab] text-center">{pickerFiltered.length} ejercicios disponibles</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
