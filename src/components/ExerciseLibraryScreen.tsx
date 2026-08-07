import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Exercise, MuscleGroup } from '../types';
import { getExercises, createExercise, updateExercise, deleteExercise, seedExercisesIfEmpty } from '../dbService';
import { Skeleton } from './ui';
import { EmptyState, Dialog, Button, Icon, Input, Select } from './ui';

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
  fuerza:       'bg-data/10 text-data border border-data/20',
  cardio:       'bg-orange-500/10 text-orange-300 border border-orange-500/20',
  estiramiento: 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20',
  pliometría:   'bg-accent/10 text-accent border border-accent/20',
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

const exercisesQueryKey = ['exercises'] as const;

export default function ExerciseLibraryScreen({ coachId }: ExerciseLibraryScreenProps) {
  const queryClient = useQueryClient();
  const { data: exercises = [], isPending: loading } = useQuery({
    queryKey: exercisesQueryKey,
    queryFn: async () => {
      await seedExercisesIfEmpty();
      return getExercises();
    },
  });
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
        queryClient.setQueryData<Exercise[]>(exercisesQueryKey, prev =>
          prev?.map(ex => ex.id === editingId ? { ...ex, ...payload } : ex));
        flash('Ejercicio actualizado.');
      } else {
        const newEx = await createExercise({ ...payload, ownerId: coachId, isCustom: true });
        queryClient.setQueryData<Exercise[]>(exercisesQueryKey, prev => [...(prev ?? []), newEx]);
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
      queryClient.setQueryData<Exercise[]>(exercisesQueryKey, prev => prev?.filter(ex => ex.id !== id));
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
      <header className="flex flex-col md:flex-row md:items-end justify-between pb-4 border-b border-hairline gap-4">
        <div>
          <h1 className="font-sans font-extrabold text-display tracking-tight text-white uppercase">Biblioteca de Ejercicios</h1>
          <p className="text-ink-2 text-body-s mt-1">
            {exercises.length} ejercicios · {exercises.filter(e => e.isCustom).length} personalizados
            {exercises.filter(e => e.muscleGroup).length > 0 && (
              <span className="ml-2 text-accent/70">· {exercises.filter(e => e.muscleGroup).length} con grupo muscular</span>
            )}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 h-[42px] px-5 bg-accent text-black font-sans font-bold text-label uppercase rounded-control hover:bg-accent-press active:scale-95 transition-all self-start md:self-auto"
        >
          <span className="material-symbols-outlined text-body-s">add</span>
          Añadir ejercicio
        </button>
      </header>

      {successMsg && (
        <div className="bg-accent/10 border border-accent/25 text-white p-3 rounded-surface text-body-s flex items-center gap-2">
          <span className="material-symbols-outlined text-accent text-title-s">check_circle</span>
          {successMsg}
        </div>
      )}

      {/* FILTERS */}
      <div className="flex flex-col md:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-ink-2 text-title-s pointer-events-none">search</span>
          <input
            type="text"
            placeholder="Buscar ejercicio..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-raised border border-hairline rounded-control pl-10 pr-4 py-3 text-title-s text-white placeholder-ink-2/50 focus:outline-none focus:ring-1 focus:ring-accent transition-all"
          />
        </div>

        {/* Filter pills */}
        <div className="flex gap-2 flex-wrap">
          {/* Muscle group filter — 14 macrocycle keys */}
          <select
            value={filterMuscleGroup}
            onChange={e => setFilterMuscleGroup(e.target.value as MuscleGroup | '')}
            className="bg-raised border border-hairline rounded-control px-3 py-3 text-title-s font-mono text-ink-2 focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer"
          >
            <option value="">Todos los grupos</option>
            {MACRO_MUSCLE_GROUPS.map(g => (
              <option key={g} value={g}>{MACRO_MUSCLE_LABELS[g]}</option>
            ))}
          </select>

          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="bg-raised border border-hairline rounded-control px-3 py-3 text-title-s font-mono text-ink-2 focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer"
          >
            <option value="">Todos los tipos</option>
            {TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>

          <select
            value={filterEndurance}
            onChange={e => setFilterEndurance(e.target.value)}
            className="bg-raised border border-hairline rounded-control px-3 py-3 text-title-s font-sans text-ink-2 focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer"
          >
            <option value="">Todos los perfiles de resistencia</option>
            {ENDURANCE_PROFILES.map(p => <option key={p} value={p}>{ENDURANCE_LABELS[p]}</option>)}
          </select>

          <select
            value={filterEquipment}
            onChange={e => setFilterEquipment(e.target.value)}
            className="bg-raised border border-hairline rounded-control px-3 py-3 text-title-s font-mono text-ink-2 focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer"
          >
            <option value="">Todo el material</option>
            {EQUIPMENT_OPTIONS.map(e => (
              <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>
            ))}
          </select>

          {hasFilters && (
            <button
              onClick={() => { setFilterMuscleGroup(''); setFilterType(''); setFilterEndurance(''); setFilterEquipment(''); setSearch(''); }}
              className="text-ink-2 hover:text-white text-label font-mono flex items-center gap-1 px-3 py-3 border border-hairline rounded-control hover:border-hairline transition-all"
            >
              <span className="material-symbols-outlined text-body-s">close</span>
              Limpiar
            </button>
          )}
        </div>
      </div>

      {!loading && (
        <p className="font-sans text-caption text-ink-2 uppercase tracking-widest">
          Mostrando {filtered.length} de {exercises.length} ejercicios
          {filterMuscleGroup && ` · Filtrando por ${MACRO_MUSCLE_LABELS[filterMuscleGroup]}`}
        </p>
      )}

      {/* TABLE */}
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-surface border border-dashed border-hairline rounded-surface">
          <EmptyState
            icon="fitness_center"
            title="Sin resultados"
            description={
              filterMuscleGroup
                ? `Ningún ejercicio asignado a "${MACRO_MUSCLE_LABELS[filterMuscleGroup]}". Asigna el grupo muscular en el editor.`
                : 'Ajusta los filtros o añade un nuevo ejercicio.'
            }
          />
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-surface border border-hairline rounded-surface overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[760px]">
                <thead>
                  <tr className="bg-raised border-b border-hairline">
                    <th className="p-4 pl-6 font-mono text-caption text-ink-2 uppercase tracking-wider">Ejercicio</th>
                    <th className="p-4 font-mono text-caption text-ink-2 uppercase tracking-wider">Grupo</th>
                    <th className="p-4 font-mono text-caption text-ink-2 uppercase tracking-wider">Material</th>
                    <th className="p-4 font-mono text-caption text-ink-2 uppercase tracking-wider">Tipo</th>
                    <th className="p-4 font-mono text-caption text-ink-2 uppercase tracking-wider">Perfil</th>
                    <th className="p-4 font-mono text-caption text-ink-2 uppercase tracking-wider">Origen</th>
                    <th className="p-4 pr-6 font-mono text-caption text-ink-2 uppercase tracking-wider text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((ex, i) => (
                    <tr key={ex.id} className={`border-b border-hairline hover:bg-raised transition-colors ${i % 2 === 0 ? '' : 'bg-bg'}`}>
                      <td className="p-4 pl-6">
                        <div className="flex items-center gap-3">
                          {ex.imageUrl ? (
                            <img src={ex.imageUrl} alt={ex.name} className="w-9 h-9 rounded-surface object-cover border border-hairline flex-shrink-0" />
                          ) : (
                            <div className="w-9 h-9 rounded-surface bg-raised border border-hairline flex items-center justify-center flex-shrink-0">
                              <span className="material-symbols-outlined text-title-s text-ink-2">fitness_center</span>
                            </div>
                          )}
                          <div>
                            <span className="font-sans font-bold text-body-s text-white block">{ex.name}</span>
                            {ex.videoUrl && (
                              <a href={ex.videoUrl} target="_blank" rel="noopener noreferrer" className="text-caption font-sans text-data/70 hover:text-data flex items-center transition-colors">
                                <span className="material-symbols-outlined text-caption">play_circle</span>
                                Ver video
                              </a>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="">
                          {ex.muscleGroup ? (
                            <span className="inline-flex items-center gap-1 font-mono text-label text-accent bg-accent/8 border border-accent/20 px-2 rounded-control">
                              <span className="material-symbols-outlined text-caption">link</span>
                              {MACRO_MUSCLE_LABELS[ex.muscleGroup]}
                            </span>
                          ) : (
                            <span className="font-mono text-label text-ink-2">{ex.primaryFocus}</span>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-wrap gap-1">
                          {(ex.equipment ?? []).length === 0 ? (
                            <span className="font-mono text-caption text-ink-3">—</span>
                          ) : (ex.equipment!).map(eq => (
                            <span key={eq} className="font-mono text-caption bg-raised border border-hairline text-ink-2 px-2 rounded-control capitalize">{eq}</span>
                          ))}
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`px-2 rounded-control text-caption font-sans font-bold capitalize ${TYPE_STYLES[ex.type]}`}>{ex.type}</span>
                      </td>
                      <td className="p-4">
                        {ex.enduranceProfile ? (
                          <span className={`px-2 rounded-control text-caption font-sans font-bold ${ENDURANCE_STYLES[ex.enduranceProfile]}`}>{ENDURANCE_LABELS[ex.enduranceProfile]}</span>
                        ) : (
                          <span className="font-mono text-caption text-ink-3">—</span>
                        )}
                      </td>
                      <td className="p-4">
                        {ex.isCustom ? (
                          <span className="text-caption font-mono bg-violet-500/10 text-violet-300 border border-violet-500/20 px-2 rounded-control uppercase">Personalizado</span>
                        ) : (
                          <span className="text-caption font-mono text-ink-2/60 uppercase">Sistema</span>
                        )}
                      </td>
                      <td className="p-4 pr-6 text-right">
                        {canEdit(ex) ? (
                          <div className="flex items-center gap-2 justify-end">
                            <button
                              onClick={() => openEdit(ex)}
                              className="text-ink-2 hover:text-accent p-2 rounded-control hover:bg-accent/10 transition-all"
                              title="Editar"
                            >
                              <span className="material-symbols-outlined text-body-s">edit</span>
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(ex.id)}
                              className="text-ink-2 hover:text-red-400 p-2 rounded-control hover:bg-red-500/10 transition-all"
                              title="Eliminar"
                            >
                              <span className="material-symbols-outlined text-body-s">delete</span>
                            </button>
                          </div>
                        ) : (
                          <span className="text-ink-3 font-mono text-caption uppercase">—</span>
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
              <div key={ex.id} className="bg-surface border border-hairline rounded-surface p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {ex.imageUrl ? (
                      <img src={ex.imageUrl} alt={ex.name} className="w-10 h-10 rounded-surface object-cover border border-hairline flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-surface bg-raised border border-hairline flex items-center justify-center flex-shrink-0">
                        <span className="material-symbols-outlined text-title-s text-ink-2">fitness_center</span>
                      </div>
                    )}
                    <div>
                      <p className="font-sans font-bold text-body-s text-white">{ex.name}</p>
                      <p className="font-sans text-caption text-ink-2">{muscleLabel(ex)}</p>
                      {ex.muscleGroup && (
                        <span className="inline-flex items-center text-caption font-mono text-accent/80">
                          <span className="material-symbols-outlined text-caption">link</span>
                          Macro
                        </span>
                      )}
                    </div>
                  </div>
                  {canEdit(ex) && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => openEdit(ex)} className="text-ink-2 hover:text-accent p-2 rounded-control transition-all">
                        <span className="material-symbols-outlined text-body-s">edit</span>
                      </button>
                      <button onClick={() => setDeleteConfirm(ex.id)} className="text-ink-2 hover:text-red-400 p-2 rounded-control transition-all">
                        <span className="material-symbols-outlined text-body-s">delete</span>
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 rounded-control text-caption font-sans font-bold capitalize ${TYPE_STYLES[ex.type]}`}>{ex.type}</span>
                  {ex.enduranceProfile && (
                    <span className={`px-2 rounded-control text-caption font-sans font-bold ${ENDURANCE_STYLES[ex.enduranceProfile]}`}>{ENDURANCE_LABELS[ex.enduranceProfile]}</span>
                  )}
                  {(ex.equipment ?? []).map(eq => (
                    <span key={eq} className="font-mono text-caption bg-raised border border-hairline text-ink-2 px-2 rounded-control capitalize">{eq}</span>
                  ))}
                  {ex.videoUrl && (
                    <a href={ex.videoUrl} target="_blank" rel="noopener noreferrer" className="text-caption font-sans text-data/70 flex items-center ">
                      <span className="material-symbols-outlined text-label">play_circle</span>
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
        <Dialog
          open
          onClose={() => setDeleteConfirm(null)}
          title="¿Eliminar ejercicio?"
          size="s"
          footer={(
            <>
              <Button variant="secondary" onClick={() => setDeleteConfirm(null)} className="flex-1">
                Cancelar
              </Button>
              <Button variant="danger" onClick={() => handleDelete(deleteConfirm)} className="flex-1">
                Eliminar
              </Button>
            </>
          )}
        >
          <p className="text-body-s text-ink-2 flex items-start gap-3">
            <Icon name="warning" size="l" className="text-danger shrink-0" />
            Esta acción no se puede deshacer. El ejercicio se eliminará de la biblioteca.
          </p>
        </Dialog>
      )}

      {/* CREATE / EDIT FORM MODAL */}
      {showForm && (
        <Dialog
          open
          onClose={() => setShowForm(false)}
          title={editingId ? 'Editar ejercicio' : 'Nuevo ejercicio'}
          size="l"
        >
            <form onSubmit={handleSave} className="space-y-4">
              <Input
                label="Nombre"
                required
                value={form.name}
                onChange={v => setForm(f => ({ ...f, name: v }))}
                placeholder="ej. Press inclinado con mancuernas"
              />

              {/* Grupo muscular — the 14 typed keys */}
              <Select
                label="Grupo muscular"
                hint="Vincula con el plan de volumen."
                value={form.muscleGroup ?? ''}
                onChange={v => setForm(f => ({ ...f, muscleGroup: (v as MuscleGroup) || undefined }))}
                placeholder="— Sin asignar —"
                options={MACRO_MUSCLE_GROUPS.map(g => ({ value: g, label: MACRO_MUSCLE_LABELS[g] }))}
              />

              {/* Type + Endurance profile — 2 cols */}
              <div className="grid grid-cols-2 gap-3">
                <Select
                  label="Tipo"
                  required
                  value={form.type}
                  onChange={v => setForm(f => ({ ...f, type: v as ExerciseType }))}
                  options={TYPES.map(t => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }))}
                />
                <Select
                  label="Perfil de resistencia"
                  value={form.enduranceProfile ?? ''}
                  onChange={v => setForm(f => ({ ...f, enduranceProfile: (v as EnduranceProfile) || undefined }))}
                  placeholder="— Sin asignar —"
                  options={ENDURANCE_PROFILES.map(p => ({ value: p, label: ENDURANCE_LABELS[p] }))}
                />
              </div>

              {/* Equipment multi-select */}
              <div>
                <label className="block font-sans text-caption text-ink-2 uppercase tracking-wider mb-2">
                  Material necesario
                  <span className="ml-2 text-ink-3 normal-case font-sans text-caption">(sin tag = siempre disponible)</span>
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
                        className={`px-3 py-1 rounded-control font-mono text-caption border capitalize transition-all ${
                          selected
                            ? 'bg-accent/15 border-accent/40 text-accent font-bold'
                            : 'bg-surface border-hairline text-ink-2 hover:border-hairline'
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
                <Input
                  label="URL de imagen"
                  hint="Opcional."
                  type="url"
                  value={form.imageUrl}
                  onChange={v => setForm(f => ({ ...f, imageUrl: v }))}
                  placeholder="https://..."
                />
              </div>

              {/* Video URL */}
              <div>
                <Input
                  label="URL de vídeo YouTube"
                  hint="Opcional."
                  type="url"
                  value={form.videoUrl}
                  onChange={v => setForm(f => ({ ...f, videoUrl: v }))}
                  placeholder="https://youtube.com/..."
                />
              </div>

              {/* Global description — visible to any athlete */}
              <div>
                <label className="block font-sans text-caption text-ink-2 uppercase tracking-wider mb-2">
                  Descripción global
                  <span className="ml-2 text-ink-3 normal-case font-sans text-caption">(visible para cualquier atleta)</span>
                </label>
                <textarea
                  value={form.instructions}
                  onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))}
                  placeholder="ej. Mantén la espalda neutra durante todo el recorrido..."
                  rows={3}
                  className="w-full bg-surface border border-hairline rounded-control px-4 py-3 text-title-s text-white placeholder-ink-2/40 focus:outline-none focus:ring-1 focus:ring-accent transition-all resize-none"
                />
              </div>

              {/* Actions — se quedan DENTRO del <form>: sacarlas al footer de
                  Dialog dejaría al submit fuera de su formulario. */}
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="secondary" onClick={() => setShowForm(false)} className="flex-1">
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isSaving || !form.name.trim()}
                  loading={isSaving}
                  className="flex-1"
                >
                  {isSaving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Crear ejercicio'}
                </Button>
              </div>
            </form>
        </Dialog>
      )}
    </div>
  );
}
