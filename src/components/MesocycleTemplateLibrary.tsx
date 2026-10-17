import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MuscleGroup, MuscleGroupConfig, MesocycleTemplate, TemplateStage, MUSCLE_ORDER, MUSCLE_LABELS, TaskType } from '../types';
import { getTopMuscleGroups } from '../utils/muscleGroupRanking';
import {
  getMesocycleTemplates, createMesocycleTemplate,
  updateMesocycleTemplate, deleteMesocycleTemplate,
} from '../dbService';
import { Skeleton } from './ui';
import { Icon, Button, EmptyState, Dialog, Input } from './ui';
import MesocycleManager from './MesocycleManager';
import { etapaDesdeMeso, mesoDesdeEtapa, LUNES_DE_PLANTILLA } from '../utils/plantillaMeso';
import { repartoDelMesociclo } from '../utils/trainingSplits';

function mesocycleTemplatesKey(coachId: string) {
  return ['mesocycleTemplates', coachId] as const;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Biblioteca › Plantillas de mesociclo

   Una plantilla es una secuencia de mesociclos (etapas). Cada etapa se edita
   con EL MISMO editor que el mesociclo de un atleta (`MesocycleManager` en
   modo plantilla): volumen, reparto propio o calculado, distribución y
   rutinas. Antes tenía su propio formulario, que se había quedado atrás —sin
   reparto, sin ciclo de N días, sin distribución— y lo que se diseñaba en un
   sitio no se podía hacer en el otro (Dani, 16-10).
   ═══════════════════════════════════════════════════════════════════════════ */

const DEFAULT_GROUPS = (): Record<MuscleGroup, MuscleGroupConfig> =>
  Object.fromEntries(
    MUSCLE_ORDER.map(g => [g, { series: 0, priority: 'media' as const }])
  ) as Record<MuscleGroup, MuscleGroupConfig>;

interface FormState {
  name: string;
  description: string;
  stages: TemplateStage[];
}

function emptyStage(n: number): TemplateStage {
  return {
    id: `stage_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    name: `Mesociclo ${n}`,
    weeks: 4,
    daysPerWeek: 4,
    groups: DEFAULT_GROUPS(),
  };
}

function emptyForm(): FormState {
  return { name: '', description: '', stages: [emptyStage(1)] };
}

function formFromTemplate(tpl: MesocycleTemplate): FormState {
  return { name: tpl.name, description: tpl.description ?? '', stages: tpl.stages.map(s => ({ ...s })) };
}

// ── Una etapa en la lista ─────────────────────────────────────────────────────

function TarjetaEtapa({ stage, idx, total, onEditar, onCambio, onMover, onBorrar }: {
  key?: React.Key;
  stage: TemplateStage;
  idx: number;
  total: number;
  onEditar: () => void;
  onCambio: (s: TemplateStage) => void;
  onMover: (dir: -1 | 1) => void;
  onBorrar: () => void;
}) {
  const reparto = repartoDelMesociclo(stage);
  const series = MUSCLE_ORDER.reduce((a, g) => a + (stage.groups[g]?.series ?? 0), 0);
  const ejercicios = (stage.days ?? []).reduce((a, d) => a + d.exercises.length, 0);
  const ciclo = stage.cycleDays ?? 7;
  return (
    <div className="bg-raised border border-hairline rounded-surface p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-caption text-ink-3 uppercase tracking-wider">Etapa {idx + 1}</p>
          <p className="font-sans font-bold text-body-s text-ink truncate">{stage.name}</p>
          <p className="font-mono text-caption text-ink-2">
            {stage.weeks} sem · {stage.daysPerWeek} sesiones{ciclo !== 7 ? ` cada ${ciclo} días` : '/sem'} · {series} series/sem
          </p>
          <p className="font-sans text-caption text-ink-3 truncate">
            {reparto ? reparto.nombre : 'Sin reparto'}
            {stage.distribution ? ' · distribución hecha' : ''}
            {ejercicios > 0 ? ` · ${ejercicios} ejercicios` : ' · sin rutinas'}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button type="button" aria-label="Subir etapa" disabled={idx === 0} onClick={() => onMover(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-control text-ink-3 hover:text-ink disabled:opacity-30">
            <Icon name="arrow_upward" size="s" />
          </button>
          <button type="button" aria-label="Bajar etapa" disabled={idx === total - 1} onClick={() => onMover(1)}
            className="w-9 h-9 flex items-center justify-center rounded-control text-ink-3 hover:text-ink disabled:opacity-30">
            <Icon name="arrow_downward" size="s" />
          </button>
          <button type="button" aria-label="Quitar etapa" disabled={total === 1} onClick={onBorrar}
            className="w-9 h-9 flex items-center justify-center rounded-control text-ink-3 hover:text-danger disabled:opacity-30">
            <Icon name="delete" size="s" />
          </button>
        </div>
      </div>

      {/* Revisiones: lo único de la etapa que no es del mesociclo, sino de
          cómo se acompaña al atleta mientras dura. */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => onCambio(stage.reviewCadenceWeeks !== undefined
            ? { ...stage, reviewCadenceWeeks: undefined, reviewType: undefined }
            : { ...stage, reviewCadenceWeeks: 2, reviewType: 'revision' })}
          className={`relative w-10 h-5.5 rounded-full flex-shrink-0 transition-colors ${stage.reviewCadenceWeeks !== undefined ? 'bg-accent' : 'bg-inset'}`}
          style={{ padding: 3 }}
          aria-pressed={stage.reviewCadenceWeeks !== undefined}
          aria-label="Programar revisiones"
        >
          <span className="block w-4 h-4 rounded-full bg-ink transition-transform duration-200" style={{ transform: stage.reviewCadenceWeeks !== undefined ? 'translateX(18px)' : 'translateX(0)' }} />
        </button>
        <span className="font-mono text-caption text-ink-2 uppercase tracking-wider">Revisiones cada</span>
        {stage.reviewCadenceWeeks !== undefined && (
          <>
            <input
              type="number" min={1} max={stage.weeks}
              aria-label="Semanas entre revisiones"
              value={stage.reviewCadenceWeeks}
              onChange={e => onCambio({ ...stage, reviewCadenceWeeks: Math.max(1, parseInt(e.target.value) || 1) })}
              className="w-14 bg-surface border border-hairline rounded-control px-2 py-1 text-center text-caption text-ink font-mono focus:outline-none focus:border-accent"
            />
            <span className="font-sans text-caption text-ink-3">semanas ·</span>
            <select
              aria-label="Tipo de revisión"
              value={stage.reviewType ?? 'revision'}
              onChange={e => onCambio({ ...stage, reviewType: e.target.value as TaskType })}
              className="bg-surface border border-hairline rounded-control px-2 py-1 text-caption text-ink font-sans focus:outline-none focus:border-accent cursor-pointer"
            >
              <option value="revision">Check-in</option>
              <option value="cuestionario">Cuestionario</option>
              <option value="foto">Fotos</option>
            </select>
          </>
        )}
      </div>

      <Button onClick={onEditar} icon="edit" variant="secondary" fullWidth>Editar mesociclo</Button>
    </div>
  );
}

// ── Template editor ────────────────────────────────────────────────────────────

function TemplateEditor({
  coachId,
  initial,
  saving,
  onSave,
  onCancel,
}: {
  coachId: string;
  initial: FormState;
  saving: boolean;
  onSave: (f: FormState) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const [nameError, setNameError] = useState('');
  // Etapa abierta en el editor de mesociclos (`null` = la lista de etapas).
  const [editandoEtapa, setEditandoEtapa] = useState<string | null>(null);

  const updateStage = (id: string, updated: TemplateStage) => {
    setForm(f => ({ ...f, stages: f.stages.map(s => (s.id === id ? updated : s)) }));
  };
  const addStage = () => setForm(f => ({ ...f, stages: [...f.stages, emptyStage(f.stages.length + 1)] }));
  const deleteStage = (id: string) => setForm(f => ({ ...f, stages: f.stages.filter(s => s.id !== id) }));
  const moveStage = (idx: number, dir: -1 | 1) => setForm(f => {
    const stages = [...f.stages];
    const j = idx + dir;
    if (j < 0 || j >= stages.length) return f;
    [stages[idx], stages[j]] = [stages[j], stages[idx]];
    return { ...f, stages };
  });

  const handleSubmit = () => {
    if (!form.name.trim()) { setNameError('El nombre es obligatorio.'); setEditandoEtapa(null); return; }
    setNameError('');
    onSave(form);
  };

  const totalWeeks = form.stages.reduce((s, st) => s + st.weeks, 0);
  const etapaAbierta = form.stages.find(s => s.id === editandoEtapa) ?? null;
  const idxAbierta = etapaAbierta ? form.stages.indexOf(etapaAbierta) : -1;

  if (etapaAbierta) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => setEditandoEtapa(null)}
            className="flex items-center gap-1 font-sans text-label text-ink-2 hover:text-ink transition-colors"
          >
            <Icon name="arrow_back" size="s" />
            {form.name.trim() ? `Volver a «${form.name.trim()}»` : 'Volver a la plantilla'}
          </button>
          <Button onClick={handleSubmit} loading={saving} icon="check" size="s">Guardar plantilla</Button>
        </div>
        <MesocycleManager
          key={etapaAbierta.id}
          coachId={coachId}
          plantilla={{
            meso: mesoDesdeEtapa(etapaAbierta, {
              id: `plantilla-${etapaAbierta.id}`, athleteId: '', number: idxAbierta + 1, startDate: LUNES_DE_PLANTILLA,
            }, true),
            onGuardar: meso => updateStage(etapaAbierta.id, etapaDesdeMeso(meso, {
              id: etapaAbierta.id,
              revisiones: { reviewCadenceWeeks: etapaAbierta.reviewCadenceWeeks, reviewType: etapaAbierta.reviewType },
            })),
          }}
        />
      </div>
    );
  }

  return (
    <div className="bg-surface border border-hairline rounded-surface overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-hairline">
        <h3 className="font-sans font-bold text-ink text-title-s flex items-center gap-2">
          <Icon name="edit_note" size="m" className="text-accent-ink" />
          {initial.name ? `Editar "${initial.name}"` : 'Nueva plantilla de mesociclo'}
        </h3>
        <button onClick={onCancel} aria-label="Cerrar" className="text-ink-2 hover:text-ink transition-colors">
          <Icon name="close" size="m" />
        </button>
      </div>

      <div className="p-5 space-y-5">
        <div className="grid grid-cols-1 gap-3">
          <Input
            label="Nombre de la plantilla"
            value={form.name}
            onChange={v => { setForm(f => ({ ...f, name: v })); setNameError(''); }}
            placeholder="Ej: Powerbuilding 12 semanas"
            error={nameError || undefined}
          />
          <Input
            label="Descripción"
            hint="Opcional."
            value={form.description}
            onChange={v => setForm(f => ({ ...f, description: v }))}
            placeholder="Breve descripción de la plantilla"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <div>
              <span className="font-mono text-caption text-ink-2 uppercase tracking-wider">
                Mesociclos ({form.stages.length})
              </span>
              <span className="font-mono text-caption text-ink-3 ml-3">{totalWeeks} semanas en total</span>
            </div>
            <button
              onClick={addStage}
              className="flex items-center gap-1 px-3 py-2 bg-raised border border-hairline text-ink-2 font-sans text-caption rounded-control hover:border-accent/40 hover:text-accent-ink transition-all"
            >
              <Icon name="add" size="s" />
              Añadir mesociclo
            </button>
          </div>
          <p className="font-sans text-caption text-ink-3 mb-3">
            Cada mesociclo se edita con el mismo editor que el de un atleta: volumen, reparto, distribución y rutinas.
          </p>
          <div className="space-y-3">
            {form.stages.map((stage, idx) => (
              <TarjetaEtapa
                key={stage.id}
                stage={stage}
                idx={idx}
                total={form.stages.length}
                onEditar={() => setEditandoEtapa(stage.id)}
                onCambio={s => updateStage(stage.id, s)}
                onMover={dir => moveStage(idx, dir)}
                onBorrar={() => deleteStage(stage.id)}
              />
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <Button onClick={handleSubmit} loading={saving} variant="primary" fullWidth>
            Guardar plantilla
          </Button>
          <Button onClick={onCancel} variant="secondary">
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Template card ──────────────────────────────────────────────────────────────

// Merges every stage's muscle group volume config into one, so the template
// card can rank the 3 muscle groups the plantilla emphasizes overall (not just
// within a single stage). Series are summed across stages; priority keeps the
// highest ('alta' beats 'media' beats 'baja') seen for that group in any stage.
const PRIO_RANK: Record<MuscleGroupConfig['priority'], number> = { alta: 0, media: 1, baja: 2 };
function mergeStageGroups(stages: MesocycleTemplate['stages']): Record<MuscleGroup, MuscleGroupConfig> {
  const merged = {} as Record<MuscleGroup, MuscleGroupConfig>;
  for (const st of stages) {
    for (const [group, cfg] of Object.entries(st.groups) as [MuscleGroup, MuscleGroupConfig][]) {
      const prev = merged[group];
      if (!prev) {
        merged[group] = { ...cfg };
      } else {
        merged[group] = {
          series: prev.series + cfg.series,
          priority: PRIO_RANK[cfg.priority] < PRIO_RANK[prev.priority] ? cfg.priority : prev.priority,
        };
      }
    }
  }
  return merged;
}

function TemplateCard({
  tpl, onEdit, onDelete,
}: {
  tpl: MesocycleTemplate;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const totalWeeks = tpl.stages.reduce((s, st) => s + st.weeks, 0);
  const totalExercises = tpl.stages.reduce((s, st) => s + (st.days ?? []).reduce((ds, d) => ds + d.exercises.length, 0), 0);
  const topGroups = getTopMuscleGroups(mergeStageGroups(tpl.stages), 3);

  return (
    <div className="bg-surface border border-hairline rounded-canvas p-4 hover:border-accent/30 transition-all">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="font-sans font-bold text-ink text-body-s truncate">{tpl.name}</p>
          {tpl.description && (
            <p className="font-sans text-caption text-ink-2 truncate">{tpl.description}</p>
          )}
          <div className="flex gap-3 mt-1 flex-wrap">
            <span className="font-mono text-caption text-ink-2">{tpl.stages.length} meso{tpl.stages.length !== 1 ? 's' : ''}</span>
            <span className="font-mono text-caption text-accent-ink font-bold">{totalWeeks} semanas</span>
            {totalExercises > 0 && (
              <span className="font-mono text-caption text-data">{totalExercises} ejercicios</span>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={onEdit}
            className="p-2 rounded-control bg-raised border border-hairline text-data hover:border-data/40 transition-all"
            title="Editar plantilla"
          >
            <Icon name="edit" size="s" />
          </button>
          <button
            onClick={onDelete}
            className="p-2 rounded-control bg-raised border border-hairline text-ink-2 hover:text-danger hover:border-danger/30 transition-all"
            title="Eliminar plantilla"
          >
            <Icon name="delete" size="s" />
          </button>
        </div>
      </div>

      {/* Top 3 grupos musculares prioritarios (calculado desde series+prioridad de todas las etapas) */}
      {topGroups.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {topGroups.map(g => (
            <span
              key={g}
              className="font-sans text-caption px-2 rounded-control bg-accent/10 border border-accent/25 text-accent-ink uppercase font-bold"
            >
              {MUSCLE_LABELS[g]}
            </span>
          ))}
        </div>
      )}

      {/* Stage name chips */}
      <div className="flex flex-wrap gap-1">
        {tpl.stages.map(st => (
          <span
            key={st.id}
            className="font-mono text-caption px-2 rounded-full bg-raised border border-hairline text-ink-2"
          >
            {st.name} · {st.weeks}sem
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props { coachId: string }

export default function MesocycleTemplateLibrary({ coachId }: Props) {
  const queryClient = useQueryClient();
  const queryKey = mesocycleTemplatesKey(coachId);
  const { data: templatesRaw = [], isPending: loading } = useQuery({
    queryKey,
    queryFn: () => getMesocycleTemplates(coachId),
  });
  const templates = useMemo(
    () => [...templatesRaw].sort((a, b) => a.name.localeCompare(b.name)),
    [templatesRaw]
  );
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [showEditor, setShowEditor]   = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (form: FormState) => {
      const data: Omit<MesocycleTemplate, 'id'> = {
        ownerId: coachId,
        name: form.name,
        description: form.description || undefined,
        // La etapa entera: el editor de mesociclos ya la deja con todo el plan.
        stages: form.stages,
      };

      if (editingId === null) {
        const created = await createMesocycleTemplate(data);
        return { type: 'create' as const, created };
      } else {
        await updateMesocycleTemplate(editingId, data);
        return { type: 'update' as const, id: editingId, data };
      }
    },
    onSuccess: result => {
      if (result.type === 'create') {
        queryClient.setQueryData<MesocycleTemplate[]>(queryKey, prev => [...(prev ?? []), result.created]);
      } else {
        queryClient.setQueryData<MesocycleTemplate[]>(queryKey, prev =>
          prev?.map(t => t.id === result.id ? { ...t, ...result.data } : t));
      }
      setShowEditor(false);
      setEditingId(null);
    },
    onError: err => console.error(err),
  });

  const handleSave = (form: FormState) => saveMutation.mutate(form);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMesocycleTemplate(id),
    onSuccess: (_data, id) => {
      queryClient.setQueryData<MesocycleTemplate[]>(queryKey, prev => prev?.filter(t => t.id !== id));
    },
    onError: err => console.error(err),
    onSettled: () => setConfirmDeleteId(null),
  });

  const handleDelete = (id: string) => deleteMutation.mutate(id);

  const openCreate = () => { setEditingId(null); setShowEditor(true); };
  const openEdit   = (id: string) => { setEditingId(id); setShowEditor(true); };
  const closeEditor = () => { setShowEditor(false); setEditingId(null); };

  const editingTemplate = editingId !== null ? templates.find(t => t.id === editingId) ?? null : null;

  if (showEditor) {
    return (
      <TemplateEditor
        coachId={coachId}
        initial={editingTemplate ? formFromTemplate(editingTemplate) : emptyForm()}
        saving={saveMutation.isPending}
        onSave={handleSave}
        onCancel={closeEditor}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-sans font-bold text-title-m text-ink">Plantillas de mesociclo</h2>
          <p className="font-sans text-caption text-ink-2 ">
            Mesociclos periodizados de múltiples etapas — aplícalos a cualquier cliente.
          </p>
        </div>
        <Button onClick={openCreate} variant="primary" size="s" icon="add">
          Nueva
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full rounded-surface" />
          <Skeleton className="h-20 w-full rounded-surface" />
          <Skeleton className="h-20 w-full rounded-surface" />
        </div>
      ) : templates.length === 0 ? (
        <div className="border border-dashed border-hairline rounded-surface">
          <EmptyState
            icon="library_books"
            title="Sin plantillas todavía"
            description="Crea tu primera plantilla de mesociclo reutilizable."
            actionLabel="Crear plantilla"
            onAction={openCreate}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map(tpl => (
            <React.Fragment key={tpl.id}>
              <TemplateCard
                tpl={tpl}
                onEdit={() => openEdit(tpl.id)}
                onDelete={() => setConfirmDeleteId(tpl.id)}
              />
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Delete confirm modal */}
      {confirmDeleteId && (() => {
        const tpl = templates.find(t => t.id === confirmDeleteId);
        return (
          <Dialog
            open
            onClose={() => setConfirmDeleteId(null)}
            title="¿Eliminar plantilla?"
            size="s"
            footer={(
              <>
                <Button onClick={() => setConfirmDeleteId(null)} variant="secondary">
                  Cancelar
                </Button>
                <Button onClick={() => handleDelete(confirmDeleteId)} variant="danger">
                  Eliminar
                </Button>
              </>
            )}
          >
            <p className="font-sans text-caption text-ink-2">
              Se eliminará «{tpl?.name}» permanentemente. Los mesociclos ya creados a partir de ella no se verán afectados.
            </p>
          </Dialog>
        );
      })()}
    </div>
  );
}
