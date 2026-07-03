import React, { useState, useEffect, useCallback } from 'react';
import { Exercise, MuscleGroup } from '../types';
import { getExercises, createExercise, updateExercise, deleteExercise, seedExercisesIfEmpty } from '../dbService';

interface ExerciseLibraryScreenProps {
  coachId: string;
}

type ExerciseType  = Exercise['type'];
type EnduranceProfile = NonNullable<Exercise['enduranceProfile']>;

// ─── Macrocycle muscle groups (the 14 typed keys) ─────────────────────────────

const MACRO_MUSCLE_GROUPS: MuscleGroup[] = [
  'pecho', 'dorsal', 'trapecio',
  'deltoide_ant', 'deltoide_lat', 'deltoide_post',
  'biceps', 'triceps', 'antebrazo',
  'cuadriceps', 'isquios', 'gluteo', 'gemelo', 'core',
];

const MACRO_MUSCLE_LABELS: Record<MuscleGroup, string> = {
  pecho:         'Pecho',
  dorsal:        'Dorsal',
  trapecio:      'Trapecio',
  deltoide_ant:  'Deltoides Ant.',
  deltoide_lat:  'Deltoides Lat.',
  deltoide_post: 'Deltoides Post.',
  biceps:        'Bíceps',
  triceps:       'Tríceps',
  antebrazo:     'Antebrazo',
  cuadriceps:    'Cuádriceps',
  isquios:       'Isquiotibiales',
  gluteo:        'Glúteo',
  gemelo:        'Gemelo',
  core:          'Core',
};

const TYPES: ExerciseType[] = ['fuerza', 'cardio', 'estiramiento', 'pliometría'];
const ENDURANCE_PROFILES: EnduranceProfile[] = ['ascendente', 'campana', 'descendente'];

const EQUIPMENT_OPTIONS = [
  'peso corporal',
  'mancuernas',
  'barra',
  'máquina',
  'polea',
  'kettlebell',
  'banco',
  'gomas',
] as const;
type EquipmentOption = typeof EQUIPMENT_OPTIONS[number];

const TYPE_STYLES: Record<ExerciseType, string> = {
  fuerza:       'bg-[#00eefc]/10 text-[#00eefc] border border-[#00eefc]/20',
  cardio:       'bg-orange-500/10 text-orange-300 border border-orange-500/20',
  estiramiento: 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20',
  pliometría:   'bg-[#fbcb1a]/10 text-[#fbcb1a] border border-[#fbcb1a]/20',
};

const ENDURANCE_STYLES: Record<EnduranceProfile, string> = {
  ascendente:  'bg-emerald-500/10 text-emerald-300',
  campana:     'bg-amber-500/10 text-amber-300',
  descendente: 'bg-red-500/10 text-red-300',
};

const ENDURANCE_LABELS: Record<EnduranceProfile, string> = {
  ascendente:  'Ascendente',
  campana:     'Campana',
  descendente: 'Descendente',
};

const EMPTY_FORM: Omit<Exercise, 'id'> = {
  ownerId:      '',
  name:         '',
  primaryFocus: 'pecho',
  type:         'fuerza',
  equipment:    [],
  videoUrl:     '',
  imageUrl:     '',
  instructions: '',
  isCustom:     true,
};

export default function ExerciseLibraryScreen({ coachId }: ExerciseLibraryScreenProps) {
  const [exercises, setExercises]               = useState<Exercise[]>([]);
  const [loading, setLoading]                   = useState(true);
  const [search, setSearch]                     = useState('');
  const [filterMuscleGroup, setFilterMuscleGroup] = useState<MuscleGroup | ''>('');
  const [filterType, setFilterType]             = useState('');
  const [filterEndurance, setFilterEndurance]   = useState('');
  const [filterEquipment, setFilterEquipment]   = useState('');

  const [showForm, setShowForm]                 = useState(false);
  const [editingId, setEditingId]               = useState<string | null>(null);
  const [form, setForm]                         = useState<Omit<Exercise, 'id'>>(EMPTY_FORM);
  const [isSaving, setIsSaving]                 = useState(false);
  const [deleteConfirm, setDeleteConfirm]       = useState<string | null>(null);
  const [successMsg, setSuccessMsg]             = useState('');

  const loadExercises = useCallback(async () => {
    setLoading(true);
    try {
      await seedExercisesIfEmpty();
      const list = await getExercises();
      setExercises(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadExercises(); }, [loadExercises]);

  const filtered = exercises.filter(ex => {
    if (search && !ex.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterMuscleGroup && ex.muscleGroup !== filterMuscleGroup) return false;
    if (filterType && ex.type !== filterType) return false;
    if (filterEndurance && ex.enduranceProfile !== filterEndurance) return false;
    if (filterEquipment) {
      const eq = ex.equipment ?? [];
      if (eq.length === 0) return false;
      if (!eq.some(e => e.toLowerCase() === filterEquipment.toLowerCase())) return false;
    }
    return true;
  });

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, ownerId: coachId });
    setShowForm(true);
  };

  const openEdit = (ex: Exercise) => {
    setEditingId(ex.id);
    setForm({
      ownerId:      ex.ownerId,
      name:         ex.name,
      primaryFocus: ex.primaryFocus,
      muscleGroup:  ex.muscleGroup,
      type:         ex.type,
      enduranceProfile: ex.enduranceProfile,
      equipment:    ex.equipment ?? [],
      videoUrl:     ex.videoUrl || '',
      imageUrl:     ex.imageUrl || '',
      instructions: ex.instructions || '',
      isCustom:     ex.isCustom,
    });
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setIsSaving(true);
    try {
      // Keep primaryFocus in sync with muscleGroup for backward compat
      const payload: Omit<Exercise, 'id'> = {
        ...form,
        primaryFocus: form.muscleGroup ? MACRO_MUSCLE_LABELS[form.muscleGroup] : form.primaryFocus,
      };
      if (editingId) {
        await updateExercise(editingId, payload);
        setExercises(prev => prev.map(ex => ex.id === editingId ? { ...ex, ...payload } : ex));
        flash('Ejercicio actualizado.');
      } else {
        const newEx = await createExercise({ ...payload, ownerId: coachId, isCustom: true });
        setExercises(prev => [...prev, newEx]);
        flash('Ejercicio creado.');
      }
      setShowForm(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteExercise(id);
      setExercises(prev => prev.filter(ex => ex.id !== id));
      setDeleteConfirm(null);
      flash('Ejercicio eliminado.');
    } catch (err) {
      console.error(err);
    }
  };

  function flash(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  }

  const canEdit = (ex: Exercise) => ex.isCustom && ex.ownerId === coachId;

  // Display helper: prefer typed muscleGroup label, fall back to legacy primaryFocus
  function muscleLabel(ex: Exercise): string {
    return ex.muscleGroup ? MACRO_MUSCLE_LABELS[ex.muscleGroup] : ex.primaryFocus;
  }

  const hasFilters = !!(filterMuscleGroup || filterType || filterEndurance || filterEquipment || search);

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <header className="flex flex-col md:flex-row md:items-end justify-between pb-4 border-b border-white/60 gap-4">
        <div>
          <h1 className="font-sans font-black text-3xl tracking-tight text-white uppercase">Biblioteca de Ejercicios</h1>
          <p className="text-[#c6c9ab] text-sm mt-1">
            {exercises.length} ejercicios · {exercises.filter(e => e.isCustom).length} personalizados
            {exercises.filter(e => e.muscleGroup).length > 0 && (
              <span className="ml-2 text-[#fbcb1a]/70">· {exercises.filter(e => e.muscleGroup).length} con grupo macrociclo</span>
            )}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 h-[42px] px-5 bg-[#fbcb1a] text-black font-mono font-bold text-xs uppercase rounded-lg hover:bg-[#d4a800] active:scale-95 transition-all shadow-md shadow-[#fbcb1a]/10 self-start md:self-auto"
        >
          <span className="material-symbols-outlined text-sm">add</span>
          Añadir ejercicio
        </button>
      </header>

      {successMsg && (
        <div className="bg-[#fbcb1a]/10 border border-[#fbcb1a]/25 text-white p-3 rounded-xl text-sm flex items-center gap-2">
          <span className="material-symbols-outlined text-[#fbcb1a] text-base">check_circle</span>
          {successMsg}
        </div>
      )}

      {/* FILTERS */}
      <div className="flex flex-col md:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#c6c9ab] text-base pointer-events-none">search</span>
          <input
            type="text"
            placeholder="Buscar ejercicio..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-[#1e1e1b] border border-white/7 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder-[#c6c9ab]/50 focus:outline-none focus:ring-1 focus:ring-[#fbcb1a] transition-all"
          />
        </div>

        {/* Filter pills */}
        <div className="flex gap-2 flex-wrap">
          {/* Muscle group filter — 14 macrocycle keys */}
          <select
            value={filterMuscleGroup}
            onChange={e => setFilterMuscleGroup(e.target.value as MuscleGroup | '')}
            className="bg-[#1e1e1b] border border-white/7 rounded-lg px-3 py-2.5 text-xs font-mono text-[#c6c9ab] focus:outline-none focus:ring-1 focus:ring-[#fbcb1a] cursor-pointer"
          >
            <option value="">Todos los grupos</option>
            {MACRO_MUSCLE_GROUPS.map(g => (
              <option key={g} value={g}>{MACRO_MUSCLE_LABELS[g]}</option>
            ))}
          </select>

          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="bg-[#1e1e1b] border border-white/7 rounded-lg px-3 py-2.5 text-xs font-mono text-[#c6c9ab] focus:outline-none focus:ring-1 focus:ring-[#fbcb1a] cursor-pointer"
          >
            <option value="">Todos los tipos</option>
            {TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>

          <select
            value={filterEndurance}
            onChange={e => setFilterEndurance(e.target.value)}
            className="bg-[#1e1e1b] border border-white/7 rounded-lg px-3 py-2.5 text-xs font-mono text-[#c6c9ab] focus:outline-none focus:ring-1 focus:ring-[#fbcb1a] cursor-pointer"
          >
            <option value="">Todos los perfiles de resistencia</option>
            {ENDURANCE_PROFILES.map(p => <option key={p} value={p}>{ENDURANCE_LABELS[p]}</option>)}
          </select>

          <select
            value={filterEquipment}
            onChange={e => setFilterEquipment(e.target.value)}
            className="bg-[#1e1e1b] border border-white/7 rounded-lg px-3 py-2.5 text-xs font-mono text-[#c6c9ab] focus:outline-none focus:ring-1 focus:ring-[#fbcb1a] cursor-pointer"
          >
            <option value="">Todo el material</option>
            {EQUIPMENT_OPTIONS.map(e => (
              <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>
            ))}
          </select>

          {hasFilters && (
            <button
              onClick={() => { setFilterMuscleGroup(''); setFilterType(''); setFilterEndurance(''); setFilterEquipment(''); setSearch(''); }}
              className="text-[#c6c9ab] hover:text-white text-xs font-mono flex items-center gap-1 px-3 py-2.5 border border-white/7 rounded-lg hover:border-[#3a3a3a] transition-all"
            >
              <span className="material-symbols-outlined text-sm">close</span>
              Limpiar
            </button>
          )}
        </div>
      </div>

      {!loading && (
        <p className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-widest">
          Mostrando {filtered.length} de {exercises.length} ejercicios
          {filterMuscleGroup && ` · Filtrando por ${MACRO_MUSCLE_LABELS[filterMuscleGroup]}`}
        </p>
      )}

      {/* TABLE */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-3 text-[#c6c9ab]">
            <span className="material-symbols-outlined text-2xl animate-spin text-[#fbcb1a]">refresh</span>
            <span className="font-mono text-xs uppercase tracking-widest">Cargando ejercicios...</span>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-[#181816] border border-dashed border-white/7 rounded-xl p-16 text-center">
          <span className="material-symbols-outlined text-4xl text-[#fbcb1a]/40 block mb-3">fitness_center</span>
          <p className="text-white font-bold text-sm">Sin resultados</p>
          <p className="text-[#c6c9ab] text-xs mt-1">
            {filterMuscleGroup
              ? `Ningún ejercicio asignado a "${MACRO_MUSCLE_LABELS[filterMuscleGroup]}". Asigna el grupo macrociclo en el editor.`
              : 'Ajusta los filtros o añade un nuevo ejercicio.'}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-[#181816] border border-white/7 rounded-xl overflow-hidden shadow-md">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[760px]">
                <thead>
                  <tr className="bg-[#1e1e1b] border-b border-white/7">
                    <th className="p-4 pl-6 font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider">Ejercicio</th>
                    <th className="p-4 font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider">Grupo</th>
                    <th className="p-4 font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider">Material</th>
                    <th className="p-4 font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider">Tipo</th>
                    <th className="p-4 font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider">Perfil</th>
                    <th className="p-4 font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider">Origen</th>
                    <th className="p-4 pr-6 font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((ex, i) => (
                    <tr key={ex.id} className={`border-b border-white/30 hover:bg-[#1e1e1e] transition-colors ${i % 2 === 0 ? '' : 'bg-[#131313]'}`}>
                      <td className="p-4 pl-6">
                        <div className="flex items-center gap-3">
                          {ex.imageUrl ? (
                            <img src={ex.imageUrl} alt={ex.name} className="w-9 h-9 rounded-lg object-cover border border-white/7 flex-shrink-0" />
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-[#1e1e1e] border border-white/7 flex items-center justify-center flex-shrink-0">
                              <span className="material-symbols-outlined text-base text-[#c6c9ab]">fitness_center</span>
                            </div>
                          )}
                          <div>
                            <span className="font-sans font-bold text-sm text-white block">{ex.name}</span>
                            {ex.videoUrl && (
                              <a href={ex.videoUrl} target="_blank" rel="noopener noreferrer" className="text-[9px] font-mono text-[#00eefc]/70 hover:text-[#00eefc] flex items-center gap-0.5 transition-colors">
                                <span className="material-symbols-outlined text-[10px]">play_circle</span>
                                Ver video
                              </a>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="space-y-0.5">
                          {ex.muscleGroup ? (
                            <span className="inline-flex items-center gap-1 font-mono text-xs text-[#fbcb1a] bg-[#fbcb1a]/8 border border-[#fbcb1a]/20 px-1.5 py-0.5 rounded">
                              <span className="material-symbols-outlined text-[10px]">link</span>
                              {MACRO_MUSCLE_LABELS[ex.muscleGroup]}
                            </span>
                          ) : (
                            <span className="font-mono text-xs text-[#c6c9ab]">{ex.primaryFocus}</span>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-wrap gap-1">
                          {(ex.equipment ?? []).length === 0 ? (
                            <span className="font-mono text-[9px] text-[#333]">—</span>
                          ) : (ex.equipment!).map(eq => (
                            <span key={eq} className="font-mono text-[9px] bg-[#1c1b1b] border border-white/7 text-[#c6c9ab] px-1.5 py-0.5 rounded capitalize">{eq}</span>
                          ))}
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold capitalize ${TYPE_STYLES[ex.type]}`}>{ex.type}</span>
                      </td>
                      <td className="p-4">
                        {ex.enduranceProfile ? (
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${ENDURANCE_STYLES[ex.enduranceProfile]}`}>{ENDURANCE_LABELS[ex.enduranceProfile]}</span>
                        ) : (
                          <span className="font-mono text-[9px] text-[#333]">—</span>
                        )}
                      </td>
                      <td className="p-4">
                        {ex.isCustom ? (
                          <span className="text-[9px] font-mono bg-violet-500/10 text-violet-300 border border-violet-500/20 px-2 py-0.5 rounded uppercase">Personalizado</span>
                        ) : (
                          <span className="text-[9px] font-mono text-[#c6c9ab]/60 uppercase">Sistema</span>
                        )}
                      </td>
                      <td className="p-4 pr-6 text-right">
                        {canEdit(ex) ? (
                          <div className="flex items-center gap-2 justify-end">
                            <button
                              onClick={() => openEdit(ex)}
                              className="text-[#c6c9ab] hover:text-[#fbcb1a] p-1.5 rounded hover:bg-[#fbcb1a]/10 transition-all"
                              title="Editar"
                            >
                              <span className="material-symbols-outlined text-sm">edit</span>
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(ex.id)}
                              className="text-[#c6c9ab] hover:text-red-400 p-1.5 rounded hover:bg-red-500/10 transition-all"
                              title="Eliminar"
                            >
                              <span className="material-symbols-outlined text-sm">delete</span>
                            </button>
                          </div>
                        ) : (
                          <span className="text-[#2a2a2a] font-mono text-[9px] uppercase">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {filtered.map(ex => (
              <div key={ex.id} className="bg-[#181816] border border-white/7 rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {ex.imageUrl ? (
                      <img src={ex.imageUrl} alt={ex.name} className="w-10 h-10 rounded-lg object-cover border border-white/7 flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-[#1e1e1e] border border-white/7 flex items-center justify-center flex-shrink-0">
                        <span className="material-symbols-outlined text-base text-[#c6c9ab]">fitness_center</span>
                      </div>
                    )}
                    <div>
                      <p className="font-sans font-bold text-sm text-white">{ex.name}</p>
                      <p className="font-mono text-[10px] text-[#c6c9ab]">{muscleLabel(ex)}</p>
                      {ex.muscleGroup && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] font-mono text-[#fbcb1a]/80">
                          <span className="material-symbols-outlined text-[9px]">link</span>
                          Macro
                        </span>
                      )}
                    </div>
                  </div>
                  {canEdit(ex) && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => openEdit(ex)} className="text-[#c6c9ab] hover:text-[#fbcb1a] p-1.5 rounded transition-all">
                        <span className="material-symbols-outlined text-sm">edit</span>
                      </button>
                      <button onClick={() => setDeleteConfirm(ex.id)} className="text-[#c6c9ab] hover:text-red-400 p-1.5 rounded transition-all">
                        <span className="material-symbols-outlined text-sm">delete</span>
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold capitalize ${TYPE_STYLES[ex.type]}`}>{ex.type}</span>
                  {ex.enduranceProfile && (
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${ENDURANCE_STYLES[ex.enduranceProfile]}`}>{ENDURANCE_LABELS[ex.enduranceProfile]}</span>
                  )}
                  {(ex.equipment ?? []).map(eq => (
                    <span key={eq} className="font-mono text-[9px] bg-[#1c1b1b] border border-white/7 text-[#c6c9ab] px-1.5 py-0.5 rounded capitalize">{eq}</span>
                  ))}
                  {ex.videoUrl && (
                    <a href={ex.videoUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] font-mono text-[#00eefc]/70 flex items-center gap-0.5">
                      <span className="material-symbols-outlined text-xs">play_circle</span>
                      Video
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* DELETE CONFIRM MODAL */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1e1e1b] border border-red-500/30 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-red-400 text-2xl">warning</span>
              <h3 className="font-sans font-bold text-white text-lg">¿Eliminar ejercicio?</h3>
            </div>
            <p className="text-sm text-[#c6c9ab]">Esta acción no se puede deshacer. El ejercicio se eliminará de la biblioteca.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2.5 border border-white/7 text-[#c6c9ab] hover:text-white font-mono text-xs uppercase rounded-lg transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 py-2.5 bg-red-500/80 hover:bg-red-500 text-white font-mono font-bold text-xs uppercase rounded-lg transition-all"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE / EDIT FORM MODAL */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1e1e1b] border border-white/7 rounded-2xl p-6 max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-sans font-black text-xl text-white uppercase tracking-tight">
                {editingId ? 'Editar ejercicio' : 'Nuevo ejercicio'}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-[#c6c9ab] hover:text-white p-1 rounded transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              {/* Name */}
              <div>
                <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-1.5">Nombre *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="ej. Press inclinado con mancuernas"
                  className="w-full bg-[#181816] border border-white/7 rounded-lg px-4 py-3 text-sm text-white placeholder-[#c6c9ab]/40 focus:outline-none focus:ring-1 focus:ring-[#fbcb1a] transition-all"
                />
              </div>

              {/* Grupo macrociclo — the 14 typed keys */}
              <div>
                <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-1.5">
                  Grupo macrociclo
                  <span className="ml-2 text-[#555] normal-case font-sans text-[9px]">(vincula con el plan de volumen)</span>
                </label>
                <select
                  value={form.muscleGroup ?? ''}
                  onChange={e => setForm(f => ({
                    ...f,
                    muscleGroup: (e.target.value as MuscleGroup) || undefined,
                  }))}
                  className="w-full bg-[#181816] border border-white/7 rounded-lg px-3 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#fbcb1a] cursor-pointer"
                >
                  <option value="">— Sin asignar —</option>
                  {MACRO_MUSCLE_GROUPS.map(g => (
                    <option key={g} value={g}>{MACRO_MUSCLE_LABELS[g]}</option>
                  ))}
                </select>
              </div>

              {/* Type + Endurance profile — 2 cols */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-1.5">Tipo *</label>
                  <select
                    value={form.type}
                    onChange={e => setForm(f => ({ ...f, type: e.target.value as ExerciseType }))}
                    className="w-full bg-[#181816] border border-white/7 rounded-lg px-3 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#fbcb1a] cursor-pointer"
                  >
                    {TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-1.5">Perfil de resistencia</label>
                  <select
                    value={form.enduranceProfile ?? ''}
                    onChange={e => setForm(f => ({ ...f, enduranceProfile: (e.target.value as EnduranceProfile) || undefined }))}
                    className="w-full bg-[#181816] border border-white/7 rounded-lg px-3 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#fbcb1a] cursor-pointer"
                  >
                    <option value="">— Sin asignar —</option>
                    {ENDURANCE_PROFILES.map(p => <option key={p} value={p}>{ENDURANCE_LABELS[p]}</option>)}
                  </select>
                </div>
              </div>

              {/* Equipment multi-select */}
              <div>
                <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-1.5">
                  Material necesario
                  <span className="ml-2 text-[#555] normal-case font-sans text-[9px]">(sin tag = siempre disponible)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {EQUIPMENT_OPTIONS.map(eq => {
                    const selected = (form.equipment ?? []).includes(eq);
                    return (
                      <button
                        key={eq}
                        type="button"
                        onClick={() => setForm(f => ({
                          ...f,
                          equipment: selected
                            ? (f.equipment ?? []).filter(e => e !== eq)
                            : [...(f.equipment ?? []), eq],
                        }))}
                        className={`px-2.5 py-1 rounded-lg font-mono text-[10px] border capitalize transition-all ${
                          selected
                            ? 'bg-[#fbcb1a]/15 border-[#fbcb1a]/40 text-[#fbcb1a] font-bold'
                            : 'bg-[#181816] border-white/7 text-[#c6c9ab] hover:border-[#3a3a3a]'
                        }`}
                      >
                        {selected && '✓ '}{eq}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Image URL */}
              <div>
                <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-1.5">URL de imagen (opcional)</label>
                <input
                  type="url"
                  value={form.imageUrl}
                  onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))}
                  placeholder="https://..."
                  className="w-full bg-[#181816] border border-white/7 rounded-lg px-4 py-3 text-sm text-white placeholder-[#c6c9ab]/40 focus:outline-none focus:ring-1 focus:ring-[#fbcb1a] transition-all"
                />
              </div>

              {/* Video URL */}
              <div>
                <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-1.5">URL de vídeo YouTube (opcional)</label>
                <input
                  type="url"
                  value={form.videoUrl}
                  onChange={e => setForm(f => ({ ...f, videoUrl: e.target.value }))}
                  placeholder="https://youtube.com/..."
                  className="w-full bg-[#181816] border border-white/7 rounded-lg px-4 py-3 text-sm text-white placeholder-[#c6c9ab]/40 focus:outline-none focus:ring-1 focus:ring-[#fbcb1a] transition-all"
                />
              </div>

              {/* Global description — visible to any athlete */}
              <div>
                <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-1.5">
                  Descripción global
                  <span className="ml-2 text-[#555] normal-case font-sans text-[9px]">(visible para cualquier atleta)</span>
                </label>
                <textarea
                  value={form.instructions}
                  onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))}
                  placeholder="ej. Mantén la espalda neutra durante todo el recorrido..."
                  rows={3}
                  className="w-full bg-[#181816] border border-white/7 rounded-lg px-4 py-3 text-sm text-white placeholder-[#c6c9ab]/40 focus:outline-none focus:ring-1 focus:ring-[#fbcb1a] transition-all resize-none"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-3 border border-white/7 text-[#c6c9ab] hover:text-white font-mono text-xs uppercase rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving || !form.name.trim()}
                  className="flex-1 py-3 bg-[#fbcb1a] text-black font-mono font-bold text-xs uppercase rounded-xl hover:bg-[#d4a800] active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <span className="material-symbols-outlined text-sm animate-spin">refresh</span>
                      Guardando...
                    </>
                  ) : (
                    <>{editingId ? 'Guardar cambios' : 'Crear ejercicio'}</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
