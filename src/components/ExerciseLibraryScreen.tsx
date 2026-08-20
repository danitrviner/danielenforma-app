import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Exercise, MuscleGroup, MUSCLE_ORDER, MUSCLE_LABELS } from '../types';
import { getExercises, createExercise, updateExercise, deleteExercise, seedExercisesIfEmpty } from '../dbService';
import { useToast } from '../hooks/useToast';
import { mensajeDeErrorFirestore } from '../utils/erroresFirestore';
import { Skeleton } from './ui';
import { Badge, EmptyState, Dialog, Button, Icon, Input, PageHeader, Select, Sheet, Chip, SearchField, ListRow } from './ui';
import type { BadgeTone } from './ui';
import ExerciseTriageScreen from './ExerciseTriageScreen';

interface ExerciseLibraryScreenProps {
  coachId: string;
}

type ExerciseType  = Exercise['type'];
type EnduranceProfile = NonNullable<Exercise['enduranceProfile']>;
type StrengthCurve = NonNullable<Exercise['strengthCurve']>;

// ─── Macrocycle muscle groups (the 14 typed keys) ─────────────────────────────

const MACRO_MUSCLE_GROUPS: MuscleGroup[] = MUSCLE_ORDER;
const MACRO_MUSCLE_LABELS: Record<MuscleGroup, string> = MUSCLE_LABELS;

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

// Tonos de `Badge`: la distinción entre valores la lleva la etiqueta de
// texto, no un arcoíris de hex sueltos — `Badge` reserva "accent" para lo
// que requiere una decisión (ver su propio comentario) y "data" para
// frecuencia cardíaca, así que ninguna de las dos entra aquí.
const TYPE_TONES: Record<ExerciseType, BadgeTone> = {
  fuerza:       'neutral',
  cardio:       'warning',
  estiramiento: 'success',
  pliometría:   'info',
};

const ENDURANCE_TONES: Record<EnduranceProfile, BadgeTone> = {
  ascendente:  'success',
  campana:     'warning',
  descendente: 'danger',
};

const ENDURANCE_LABELS: Record<EnduranceProfile, string> = {
  ascendente:  'Ascendente',
  campana:     'Campana',
  descendente: 'Descendente',
};

const STRENGTH_CURVES: StrengthCurve[] = ['estiramiento', 'campana', 'acortamiento'];

const STRENGTH_CURVE_TONES: Record<StrengthCurve, BadgeTone> = {
  estiramiento: 'info',
  campana:      'neutral',
  acortamiento: 'success',
};

const STRENGTH_CURVE_LABELS: Record<StrengthCurve, string> = {
  estiramiento: 'Estiramiento',
  campana:      'Campana',
  acortamiento: 'Acortamiento',
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
  const { showToast } = useToast();
  const { data: exercises = [], isPending: loading } = useQuery({
    queryKey: exercisesQueryKey,
    queryFn: async () => {
      await seedExercisesIfEmpty();
      return getExercises();
    },
  });
  const [search, setSearch]                     = useState('');
  const [filterMuscleGroups, setFilterMuscleGroups] = useState<MuscleGroup[]>([]);
  const [filterType, setFilterType]             = useState('');
  const [filterEndurance, setFilterEndurance]   = useState('');
  const [filterEquipment, setFilterEquipment]   = useState<string[]>([]);
  const [showFilterSheet, setShowFilterSheet]   = useState(false);
  // Borrador de la hoja de filtros (panel 05 del handoff): se aplica solo al
  // pulsar "Ver N ejercicios", no en cada toque de chip — así el atleta... (el
  // coach, aquí) puede tantear varias combinaciones sin que la lista salte.
  const [draftGroups, setDraftGroups]           = useState<MuscleGroup[]>([]);
  const [draftEquipment, setDraftEquipment]     = useState<string[]>([]);

  const [showForm, setShowForm]                 = useState(false);
  const [editingId, setEditingId]               = useState<string | null>(null);
  const [form, setForm]                         = useState<Omit<Exercise, 'id'>>(EMPTY_FORM);
  const [isSaving, setIsSaving]                 = useState(false);
  const [deleteConfirm, setDeleteConfirm]       = useState<string | null>(null);
  const [successMsg, setSuccessMsg]             = useState('');
  const [showTriage, setShowTriage]             = useState(false);

  const sinRevisar = exercises.filter(e => !e.revisado).length;

  function matchesFilters(ex: Exercise, groups: MuscleGroup[], equipment: string[]): boolean {
    if (search && !ex.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (groups.length > 0 && (!ex.muscleGroup || !groups.includes(ex.muscleGroup))) return false;
    if (filterType && ex.type !== filterType) return false;
    if (filterEndurance && ex.enduranceProfile !== filterEndurance) return false;
    if (equipment.length > 0) {
      const eq = ex.equipment ?? [];
      if (eq.length === 0) return false;
      if (!eq.some(e => equipment.includes(e))) return false;
    }
    return true;
  }

  // Orden A-Z (el propio recuento de abajo lo anuncia): Firestore devuelve
  // los ejercicios en el orden en que se crearon, no alfabético.
  const filtered = exercises
    .filter(ex => matchesFilters(ex, filterMuscleGroups, filterEquipment))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const draftCount = exercises.filter(ex => matchesFilters(ex, draftGroups, draftEquipment)).length;

  function openFilterSheet() {
    setDraftGroups(filterMuscleGroups);
    setDraftEquipment(filterEquipment);
    setShowFilterSheet(true);
  }
  function applyFilterSheet() {
    setFilterMuscleGroups(draftGroups);
    setFilterEquipment(draftEquipment);
    setShowFilterSheet(false);
  }

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
      strengthCurve: ex.strengthCurve,
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
      showToast(mensajeDeErrorFirestore(err, editingId ? 'actualizar el ejercicio' : 'crear el ejercicio'));
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
      showToast(mensajeDeErrorFirestore(err, 'eliminar el ejercicio'));
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

  const hasFilters = filterMuscleGroups.length > 0 || !!filterType || !!filterEndurance || filterEquipment.length > 0 || !!search;

  function toggleGroupChip(g: MuscleGroup) {
    setFilterMuscleGroups(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);
  }
  function toggleDraftGroup(g: MuscleGroup) {
    setDraftGroups(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);
  }
  function toggleDraftEquipment(eq: string) {
    setDraftEquipment(prev => prev.includes(eq) ? prev.filter(x => x !== eq) : [...prev, eq]);
  }

  // La revisión sustituye la pantalla entera en vez de abrirse en una hoja: son
  // sesiones largas con el vídeo grande y atajos de teclado propios, y compartir
  // pantalla con la lista y sus filtros solo quitaría sitio y capturaría teclas.
  if (showTriage) {
    return <ExerciseTriageScreen onClose={() => setShowTriage(false)} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Biblioteca de Ejercicios"
        subtitle={
          `${exercises.length} ejercicios · ${exercises.filter(e => e.isCustom).length} personalizados`
          + (exercises.filter(e => e.muscleGroup).length > 0 ? ` · ${exercises.filter(e => e.muscleGroup).length} con grupo muscular` : '')
        }
        action={
          <>
            <Button variant="secondary" size="m" icon="fact_check" onClick={() => setShowTriage(true)}>
              Revisar catálogo{sinRevisar > 0 && ` (${sinRevisar})`}
            </Button>
            <Button variant="primary" size="m" icon="add" onClick={openCreate}>Añadir ejercicio</Button>
          </>
        }
      />

      {successMsg && (
        <div className="bg-accent/10 border border-accent/25 text-ink p-3 rounded-surface text-body-s flex items-center gap-2">
          <Icon name="check_circle" size="m" className="text-accent" />
          {successMsg}
        </div>
      )}

      {/* FILTERS — panel 01 del handoff: buscador 48px + botón de filtros en
          cuadro oro 14%, chips de grupo en fila con scroll horizontal para
          el filtro rápido. Tipo/perfil de resistencia (no están en el
          handoff, pero ya existían) se quedan dentro de la hoja de filtros. */}
      <div className="flex gap-2">
        <SearchField value={search} onChange={setSearch} label="Buscar ejercicio" placeholder="Buscar ejercicio..." className="flex-1" />
        <button
          onClick={openFilterSheet}
          aria-label="Filtros"
          className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-control border transition-colors ${
            filterType || filterEndurance || filterEquipment.length > 0 ? 'bg-accent/14 border-accent-line text-accent' : 'bg-raised border-hairline text-ink-2'
          }`}
        >
          <Icon name="tune" size="m" />
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {MACRO_MUSCLE_GROUPS.map(g => (
          <Chip key={g} selected={filterMuscleGroups.includes(g)} onClick={() => toggleGroupChip(g)} className="shrink-0">
            {MACRO_MUSCLE_LABELS[g]}
          </Chip>
        ))}
      </div>

      {hasFilters && (
        <button
          onClick={() => { setFilterMuscleGroups([]); setFilterType(''); setFilterEndurance(''); setFilterEquipment([]); setSearch(''); }}
          className="text-ink-2 hover:text-ink text-label font-mono flex items-center gap-1"
        >
          <Icon name="close" size="s" />
          Limpiar filtros
        </button>
      )}

      {!loading && (
        <div className="flex items-center justify-between">
          <p className="font-mono text-caption text-ink-3 uppercase tracking-widest">
            {filterMuscleGroups.length === 1
              ? `${filtered.length} en ${MACRO_MUSCLE_LABELS[filterMuscleGroups[0]]}`
              : `${filtered.length} ejercicio${filtered.length === 1 ? '' : 's'}`}
          </p>
          <p className="font-mono text-caption text-ink-4 uppercase tracking-widest">A · Z</p>
        </div>
      )}

      {/* TABLE */}
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : exercises.length === 0 ? (
        // Panel 04 del handoff: biblioteca realmente vacía (no un filtro sin
        // resultados). En la práctica es rara — el useQuery ya llama a
        // seedExercisesIfEmpty() al montar — pero si el coach borró los 40
        // base a mano, esto le deja recuperarlos sin salir de la pantalla.
        <div className="bg-surface border border-dashed border-hairline rounded-surface">
          <EmptyState
            icon="fitness_center"
            title="Biblioteca vacía"
            description="Todavía no hay ejercicios en tu biblioteca."
            actionLabel="Cargar los 40 base"
            onAction={() => seedExercisesIfEmpty().then(() => queryClient.invalidateQueries({ queryKey: exercisesQueryKey }))}
            secondaryActionLabel="Crear uno desde cero"
            onSecondaryAction={openCreate}
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-surface border border-dashed border-hairline rounded-surface">
          <EmptyState
            icon="fitness_center"
            title="Sin resultados"
            description="Ajusta los filtros o añade un nuevo ejercicio."
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
                    <th className="p-4 font-mono text-caption text-ink-2 uppercase tracking-wider">Perfil (cardio)</th>
                    <th className="p-4 font-mono text-caption text-ink-2 uppercase tracking-wider">Curva</th>
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
                              <Icon name="fitness_center" size="m" className="text-ink-2" />
                            </div>
                          )}
                          <div>
                            <span className="font-sans font-bold text-body-s text-ink block">{ex.name}</span>
                            {ex.videoUrl && (
                              <a href={ex.videoUrl} target="_blank" rel="noopener noreferrer" className="text-caption font-sans text-ink-3 hover:text-accent flex items-center gap-1 transition-colors">
                                <Icon name="play_circle" size="s" />
                                Ver video
                              </a>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        {ex.muscleGroup ? (
                          <Badge tone="accent" icon="link">{MACRO_MUSCLE_LABELS[ex.muscleGroup]}</Badge>
                        ) : (
                          <span className="font-mono text-label text-ink-2">{ex.primaryFocus}</span>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex flex-wrap gap-1">
                          {(ex.equipment ?? []).length === 0 ? (
                            <span className="font-mono text-caption text-ink-3">—</span>
                          ) : (ex.equipment!).map(eq => (
                            <Badge key={eq} className="capitalize">{eq}</Badge>
                          ))}
                        </div>
                      </td>
                      <td className="p-4">
                        <Badge tone={TYPE_TONES[ex.type]} className="capitalize">{ex.type}</Badge>
                      </td>
                      <td className="p-4">
                        {ex.enduranceProfile ? (
                          <Badge tone={ENDURANCE_TONES[ex.enduranceProfile]}>{ENDURANCE_LABELS[ex.enduranceProfile]}</Badge>
                        ) : (
                          <span className="font-mono text-caption text-ink-3">—</span>
                        )}
                      </td>
                      <td className="p-4">
                        {ex.strengthCurve ? (
                          <Badge tone={STRENGTH_CURVE_TONES[ex.strengthCurve]}>{STRENGTH_CURVE_LABELS[ex.strengthCurve]}</Badge>
                        ) : (
                          <span className="font-mono text-caption text-ink-3">—</span>
                        )}
                      </td>
                      <td className="p-4">
                        {ex.isCustom ? (
                          <Badge tone="info">Personalizado</Badge>
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
                              <Icon name="edit" size="s" />
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(ex.id)}
                              className="text-ink-2 hover:text-danger p-2 rounded-control hover:bg-danger/10 transition-all"
                              title="Eliminar"
                            >
                              <Icon name="delete" size="s" />
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

          {/* Mobile cards — panel 01 del handoff: fila de 64px miniatura +
              nombre + chip de grupo (oro 13%) + chip de equipamiento (blanco
              5%) + chevron al 30%. La marca "SIN VÍDEO" reemplaza al enlace
              "Ver vídeo" cuando no hay uno: la ficha con reproductor propio
              es F3.13 (lado atleta), aquí el catálogo del coach solo informa. */}
          <div className="md:hidden space-y-2">
            {filtered.map(ex => (
              <div key={ex.id} className="flex items-center gap-3 bg-surface border border-hairline rounded-surface p-3">
                <div className="relative w-16 h-16 rounded-surface bg-raised border border-hairline flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {ex.imageUrl ? (
                    <img src={ex.imageUrl} alt={ex.name} className="w-full h-full object-cover" />
                  ) : (
                    <Icon name="fitness_center" size="l" className="text-ink-2" />
                  )}
                  {!ex.videoUrl && (
                    <span className="absolute bottom-0 inset-x-0 bg-black/70 text-center text-caption font-mono uppercase tracking-wider text-ink-2 py-1">Sin vídeo</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-sans font-bold text-body-s text-ink truncate">{ex.name}</p>
                  <div className="flex items-center gap-2 flex-wrap mt-1">
                    <span className="font-mono text-caption text-accent bg-accent/13 px-2 py-1 rounded-chip">{muscleLabel(ex)}</span>
                    {(ex.equipment ?? []).slice(0, 2).map(eq => (
                      <span key={eq} className="font-mono text-caption text-ink-2 bg-white/5 px-2 py-1 rounded-chip capitalize">{eq}</span>
                    ))}
                  </div>
                </div>
                {canEdit(ex) ? (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => openEdit(ex)} aria-label="Editar" className="text-ink-2 hover:text-accent p-2 rounded-control transition-all">
                      <Icon name="edit" size="s" />
                    </button>
                    <button onClick={() => setDeleteConfirm(ex.id)} aria-label="Eliminar" className="text-ink-2 hover:text-danger p-2 rounded-control transition-all">
                      <Icon name="delete" size="s" />
                    </button>
                  </div>
                ) : (
                  <Icon name="chevron_right" size="m" className="text-ink-2/30 flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* HOJA DE FILTROS — panel 05: 14 grupos + equipamiento en chips
          multi-selección, "Limpiar" arriba, primario con el recuento. */}
      <Sheet
        open={showFilterSheet}
        onClose={() => setShowFilterSheet(false)}
        title="Filtros"
        footer={<Button onClick={applyFilterSheet} fullWidth size="l">Ver {draftCount} ejercicios</Button>}
      >
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-caption font-mono uppercase text-ink-2">Grupo muscular</p>
            {(draftGroups.length > 0 || draftEquipment.length > 0) && (
              <button onClick={() => { setDraftGroups([]); setDraftEquipment([]); }} className="text-caption font-mono uppercase text-accent">Limpiar</button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {MACRO_MUSCLE_GROUPS.map(g => (
              <Chip key={g} selected={draftGroups.includes(g)} onClick={() => toggleDraftGroup(g)}>{MACRO_MUSCLE_LABELS[g]}</Chip>
            ))}
          </div>

          <p className="text-caption font-mono uppercase text-ink-2">Equipamiento</p>
          <div className="flex flex-wrap gap-2">
            {EQUIPMENT_OPTIONS.map(eq => (
              <Chip key={eq} selected={draftEquipment.includes(eq)} onClick={() => toggleDraftEquipment(eq)} className="capitalize">{eq}</Chip>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Tipo"
              value={filterType}
              onChange={v => setFilterType(v)}
              placeholder="Todos"
              options={TYPES.map(t => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }))}
            />
            <Select
              label="Perfil de resistencia"
              value={filterEndurance}
              onChange={v => setFilterEndurance(v)}
              placeholder="Todos"
              options={ENDURANCE_PROFILES.map(p => ({ value: p, label: ENDURANCE_LABELS[p] }))}
            />
          </div>
        </div>
      </Sheet>

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
                  label="Perfil de esfuerzo (cardio)"
                  value={form.enduranceProfile ?? ''}
                  onChange={v => setForm(f => ({ ...f, enduranceProfile: (v as EnduranceProfile) || undefined }))}
                  placeholder="— Sin asignar —"
                  options={ENDURANCE_PROFILES.map(p => ({ value: p, label: ENDURANCE_LABELS[p] }))}
                />
              </div>

              {/* Curva de fuerza — dónde carga más el ejercicio dentro de su
                  rango de movimiento, no confundir con el perfil de esfuerzo
                  de cardio de arriba (ver comentario en types.ts). */}
              <Select
                label="Curva de fuerza"
                hint="Dónde está el pico de tensión: estirado, en medio, o contraído."
                value={form.strengthCurve ?? ''}
                onChange={v => setForm(f => ({ ...f, strengthCurve: (v as StrengthCurve) || undefined }))}
                placeholder="— Sin asignar —"
                options={STRENGTH_CURVES.map(c => ({ value: c, label: STRENGTH_CURVE_LABELS[c] }))}
              />

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
                      <Chip
                        key={eq}
                        selected={selected}
                        className="capitalize"
                        onClick={() => setForm(f => ({
                          ...f,
                          equipment: selected
                            ? (f.equipment ?? []).filter(e => e !== eq)
                            : [...(f.equipment ?? []), eq],
                        }))}
                      >
                        {eq}
                      </Chip>
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
                  className="w-full bg-surface border border-hairline rounded-control px-4 py-3 text-title-s text-ink placeholder-ink-2/40 focus:outline-none focus:ring-1 focus:ring-accent transition-all resize-none"
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
