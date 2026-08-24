import React, { useState, useEffect, useRef } from 'react';
import { Mesocycle, NutritionProgram, Roadmap, RoadmapItem, BodyweightLog, WorkoutAssignment, Workout, Exercise, WeeklyProgressionRule } from '../types';
import { PlanEvent, WeekAdherence, weekAdherence, detectConflicts, PlanConflict } from '../utils/planEvents';
import { mesocycleWeekNumber, diasDeCiclo } from '../utils/progression';
import { Icon, Button, EmptyState, Sheet, Input, Select, Badge, BadgeTone } from './ui';
import EventPlannerSheet from './roadmap/EventPlannerSheet';
import ProposePlanSheet from './roadmap/ProposePlanSheet';

type PlannerLane = 'entrenamiento' | 'nutricion' | 'revisiones' | 'objetivos';

// ─── Constants ────────────────────────────────────────────────────────────────

const WEEK_PX = 48;
const MIN_WEEKS = 12;
const LANE_HEADER_W = 140;
const HEADER_H = 48;
const LANE_H = 80;
const ITEM_H = 40;
const ITEM_Y = (LANE_H - ITEM_H) / 2;
const WEIGHT_LANE_H = 100;
const WEIGHT_PAD = 12;

// ─── Date helpers (no external libs) ─────────────────────────────────────────

function parseDate(s: string): Date { return new Date(s + 'T00:00:00'); }
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}
function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}
function daysToPx(days: number): number { return Math.max(0, (days / 7) * WEEK_PX); }
function isoDate(d: Date): string { return d.toISOString().split('T')[0]; }
function fmtDate(s: string): string {
  const d = parseDate(s);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}
function fmtMonth(d: Date): string {
  return d.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' });
}

// ─── Block color palettes ─────────────────────────────────────────────────────

const MESO_COLORS = ['var(--color-accent)', 'var(--color-accent-press)', 'var(--color-accent)'];
const NUTRI_COLORS = ['var(--color-data)', 'var(--color-data)', 'var(--color-data)'];

function statusColor(status?: RoadmapItem['status']): string {
  if (status === 'logrado') return 'var(--color-success)';
  if (status === 'en_progreso') return 'var(--color-accent)';
  if (status === 'pendiente') return 'var(--color-warning)';
  return 'var(--color-ink-2)';
}

function typeIcon(type: RoadmapItem['type']): string {
  if (type === 'objetivo') return 'target';
  if (type === 'hito') return 'flag';
  return 'sticky_note_2';
}

// Los 3 estados de un marcador puntual del carril "Revisiones" — solo contorno
// (programado), relleno + check (hecho), o rojo + aviso (vencido). Sin barra de
// duración: son eventos de un día, no una fase.
const ADHERENCE_COLOR: Record<WeekAdherence, string> = {
  alta: 'bg-success',
  media: 'bg-warning',
  baja: 'bg-danger',
  'sin-datos': 'bg-ink-4',
  futuro: 'bg-hairline',
};

const REVIEW_STATUS_TONE: Record<PlanEvent['status'], BadgeTone> = {
  programado: 'neutral',
  hecho: 'success',
  vencido: 'danger',
};

// Marcador "condicional" (Bloque H2.2) — la regla que lo originó solo se
// aplica si se cumple una condición ("+1 serie solo si adherencia ≥ 85%").
// Contorno punteado siempre que sea condicional; atenuado mientras no se
// cumple (nunca se sabe si "se aplicó" hasta llegar a su semana, así que no
// se pinta ni como hecho ni como vencido).
function conditionalMarkerClasses(met: boolean): string {
  return met ? 'border-dashed bg-transparent border-accent text-accent' : 'border-dashed bg-transparent border-ink-4 text-ink-3 opacity-60';
}

function reviewMarkerClasses(status: PlanEvent['status']): string {
  if (status === 'hecho') return 'bg-success border-success text-bg';
  if (status === 'vencido') return 'bg-danger/15 border-danger text-danger';
  return 'bg-transparent border-ink-3 text-ink-2';
}

type BlockTiming = 'past' | 'current' | 'future';

// Solo para la vista del atleta (readonly): distingue tramos pasados
// (atenuados), el actual (glow, resaltado) y futuros — refuerza "dónde estás
// y qué te queda por delante" directamente en el timeline.
function blockTiming(startStr: string, endStr: string, today: string): BlockTiming {
  if (endStr <= today) return 'past';
  if (startStr <= today) return 'current';
  return 'future';
}

// ─── Blank item factory ───────────────────────────────────────────────────────

function blankItem(): RoadmapItem {
  return {
    id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    title: '',
    type: 'objetivo',
    lane: 'general',
    status: 'pendiente',
  };
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  mesocycles: Mesocycle[];
  nutritionProgram: NutritionProgram | null;
  roadmap: Roadmap;
  readonly: boolean;
  onSave?: (updated: Roadmap) => Promise<void>;
  bodyweightLogs?: BodyweightLog[];
  initialWeight?: number;
  // Carril "Revisiones" (Bloque H) — derivado con `deriveReviewEvents` a partir de las
  // tareas del atleta. Opcional: si no se pasa, el carril no se muestra (p. ej. todavía
  // no está conectado en la vista de solo lectura del atleta).
  reviewEvents?: PlanEvent[];
  // Assignments de entrenamiento del atleta — solo para pintar la tira de adherencia
  // semanal encima de los carriles. Opcional, mismo motivo que `reviewEvents`.
  workoutAssignments?: WorkoutAssignment[];
  // Marcadores de subida de volumen (Bloque F → H) — derivados con
  // `deriveVolumeIncreaseEvents` a partir de las reglas `weeklyProgression` ya
  // puestas en el editor de ejercicios. Opcional, mismo motivo que `reviewEvents`.
  volumeEvents?: PlanEvent[];
  // Marcadores de cambio de kcal en el carril "Nutrición" (Bloque H) —
  // derivados con `deriveKcalChangeEvents` del `targetKcal` de cada fase.
  // Opcional, mismo motivo que `volumeEvents`.
  nutritionEvents?: PlanEvent[];
  // Marcador de semana de descarga en el carril "Entrenamiento" (Bloque H) —
  // derivado con `deriveDeloadEvents` de `Mesocycle.deloadWeek`. Opcional,
  // mismo motivo que `volumeEvents`.
  deloadEvents?: PlanEvent[];
  // Programar desde el calendario (Bloque H) — clic en una semana vacía del
  // carril "Revisiones" crea una TaskItem. Opcional: sin esto, el carril queda
  // de solo lectura (p. ej. la vista del atleta).
  onCreateReview?: (input: { title: string; date: string; type: 'revision' | 'cuestionario' | 'foto' }) => void | Promise<void>;
  // Arrastrar un marcador del carril "Revisiones" a otra fecha (Bloque H).
  // Opcional, mismo motivo que `onCreateReview` — sin esto los marcadores no
  // se pueden arrastrar (p. ej. la vista de solo lectura del atleta).
  onMoveReview?: (taskId: string, newDate: string) => void | Promise<void>;
  // Panel "+ Evento" (Pantalla 2) — necesita los Workout/Exercise del atleta
  // para el selector de "subida de volumen". Opcional, mismo motivo que el resto:
  // sin esto el botón "+ Evento" no se muestra (vista de solo lectura del atleta).
  workouts?: Workout[];
  exercises?: Exercise[];
  onAddVolumeRule?: (workoutId: string, exerciseId: string, rule: WeeklyProgressionRule) => void | Promise<void>;
  // Arrastrar el borde derecho de una barra de mesociclo/fase para alargar o
  // acortar (Bloque H, Pantalla 1). Opcional: sin esto las barras no muestran
  // tirador y no se pueden redimensionar (p. ej. vista de solo lectura del atleta).
  onResizeMesocycle?: (id: string, weeks: number) => void | Promise<void>;
  onResizeNutritionPhase?: (phaseId: string, weeks: number) => void | Promise<void>;
  // Arrastrar un marcador de subida de volumen a otra semana (Bloque H,
  // Pantalla 1) — reescribe el `atWeek` de la regla `weeklyProgression` que lo
  // originó. Opcional, mismo motivo que el resto: sin esto el marcador no se
  // puede arrastrar (p. ej. vista de solo lectura del atleta).
  onMoveVolumeEvent?: (workoutId: string, exerciseId: string, oldAtWeek: number, newAtWeek: number) => void | Promise<void>;
}

// ─── Item Editor Modal ────────────────────────────────────────────────────────

interface EditorProps {
  item: RoadmapItem;
  onChange: (item: RoadmapItem) => void;
  onConfirm: () => void;
  onDelete?: () => void;
  onCancel: () => void;
  saving: boolean;
  isNew: boolean;
}

function ItemEditor({ item, onChange, onConfirm, onDelete, onCancel, saving, isNew }: EditorProps) {
  return (
    <Sheet
      open
      onClose={onCancel}
      title={isNew ? 'Nuevo item' : 'Editar item'}
      footer={(
        <>
          {!isNew && onDelete && (
            <Button variant="danger" onClick={onDelete}>Eliminar</Button>
          )}
          <Button variant="secondary" onClick={onCancel} className="flex-1">Cancelar</Button>
          <Button onClick={onConfirm} disabled={saving || !item.title.trim()} loading={saving} className="flex-1">
            {saving ? 'Guardando...' : isNew ? 'Añadir' : 'Guardar'}
          </Button>
        </>
      )}
    >
      <div className="space-y-4">
        {/* Title */}
        <Input
          label="Título"
          required
          value={item.title}
          onChange={v => onChange({ ...item, title: v })}
          placeholder="Nombre del objetivo / hito..."
        />

        {/* Description — sigue a mano: `Input` no tiene variante de textarea y
            crear una sería ampliar el alcance de F11. */}
        <div>
          <label className="block font-mono text-caption text-ink-2 uppercase tracking-wider mb-1">Descripción</label>
          <textarea
            value={item.description ?? ''}
            onChange={e => onChange({ ...item, description: e.target.value || undefined })}
            rows={2}
            placeholder="Detalle opcional..."
            className="w-full bg-surface border border-hairline rounded-control px-3 py-3 text-title-s text-white focus:outline-none focus:ring-1 focus:ring-accent resize-none"
          />
        </div>

        {/* Type + Lane */}
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Tipo"
            value={item.type}
            onChange={v => onChange({ ...item, type: v as RoadmapItem['type'] })}
            options={[
              { value: 'objetivo', label: 'Objetivo' },
              { value: 'hito', label: 'Hito' },
              { value: 'nota', label: 'Nota' },
            ]}
          />
          <Select
            label="Lane"
            value={item.lane}
            onChange={v => onChange({ ...item, lane: v as RoadmapItem['lane'] })}
            options={[
              { value: 'entreno', label: 'Entreno' },
              { value: 'nutricion', label: 'Nutrición' },
              { value: 'movilidad', label: 'Movilidad' },
              { value: 'general', label: 'General' },
            ]}
          />
        </div>

        {/* Start / Target dates */}
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Inicio"
            type="date"
            value={item.startDate ?? ''}
            onChange={v => onChange({ ...item, startDate: v || undefined })}
          />
          <Input
            label="Objetivo"
            type="date"
            value={item.targetDate ?? ''}
            onChange={v => onChange({ ...item, targetDate: v || undefined })}
          />
        </div>

        {/* Status */}
        <Select
          label="Estado"
          value={item.status ?? 'pendiente'}
          onChange={v => onChange({ ...item, status: v as RoadmapItem['status'] })}
          options={[
            { value: 'pendiente', label: 'Pendiente' },
            { value: 'en_progreso', label: 'En progreso' },
            { value: 'logrado', label: 'Logrado' },
          ]}
        />
      </div>
    </Sheet>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function RoadmapTimeline({ mesocycles: mesocyclesProp, nutritionProgram: nutritionProgramProp, roadmap, readonly, onSave, bodyweightLogs, initialWeight, reviewEvents, workoutAssignments, volumeEvents, nutritionEvents, deloadEvents, onCreateReview, onMoveReview, workouts, exercises, onAddVolumeRule, onResizeMesocycle, onResizeNutritionPhase, onMoveVolumeEvent }: Props) {
  const [editingItem, setEditingItem] = useState<RoadmapItem | null>(null);
  const [viewingEvent, setViewingEvent] = useState<PlanEvent | null>(null);
  const [quickCreateDate, setQuickCreateDate] = useState<string | null>(null);
  const [quickCreateTitle, setQuickCreateTitle] = useState('');
  const [quickCreateType, setQuickCreateType] = useState<'revision' | 'cuestionario' | 'foto'>('revision');
  const [quickCreateSaving, setQuickCreateSaving] = useState(false);
  const [viewingConflict, setViewingConflict] = useState<PlanConflict | null>(null);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [proposePlanOpen, setProposePlanOpen] = useState(false);
  // Con qué fecha/carril se abre el panel "Programar evento" — clicar una
  // celda vacía de Entrenamiento o Nutrición lo abre ya centrado en esa semana
  // y ese carril, en vez de siempre "Entrenamiento hoy" (Bloque H, Pantalla 1).
  const [plannerDate, setPlannerDate] = useState<string | null>(null);
  const [plannerLane, setPlannerLane] = useState<PlannerLane>('entrenamiento');
  const [dismissedConflicts, setDismissedConflicts] = useState<Set<string>>(new Set());

  // Arrastrar un marcador de "Revisiones" a otra fecha (Bloque H). Estado de
  // interacción puro: mientras se arrastra solo se mueve visualmente
  // (`deltaX`), el guardado real (onMoveReview) pasa al soltar.
  const [dragging, setDragging] = useState<{ id: string; date: string; startX: number; deltaX: number } | null>(null);
  const draggedRef = useRef(false); // distingue "clic" de "arrastre" al soltar

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - dragging.startX;
      if (Math.abs(dx) > 3) draggedRef.current = true;
      setDragging(prev => prev && { ...prev, deltaX: dx });
    };
    const onUp = () => {
      setDragging(prev => {
        if (prev && draggedRef.current) {
          const dayPx = WEEK_PX / 7;
          const dayDelta = Math.round(prev.deltaX / dayPx);
          if (dayDelta !== 0) {
            const newDate = isoDate(addDays(parseDate(prev.date), dayDelta));
            onMoveReview?.(prev.id, newDate);
          }
        }
        return null;
      });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging?.id]);

  // Arrastrar el borde derecho de una barra (mesociclo o fase de nutrición)
  // para alargar/acortar (Bloque H). Mismo patrón que `dragging` arriba, pero
  // mueve `weeks` en vez de una fecha — y la proyección/bounds se recalculan en
  // vivo porque `mesocycles`/`nutritionProgram` de abajo ya reflejan el arrastre
  // en curso (ver `mesocycles`/`nutritionProgram` efectivos más abajo).
  const [resizing, setResizing] = useState<{ kind: 'meso' | 'nutri'; id: string; startX: number; deltaX: number; baseWeeks: number } | null>(null);
  const resizedRef = useRef(false);

  useEffect(() => {
    if (!resizing) return;
    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - resizing.startX;
      if (Math.abs(dx) > 3) resizedRef.current = true;
      setResizing(prev => prev && { ...prev, deltaX: dx });
    };
    const onUp = () => {
      setResizing(prev => {
        if (prev && resizedRef.current) {
          const weekDelta = Math.round(prev.deltaX / WEEK_PX);
          const newWeeks = Math.max(1, prev.baseWeeks + weekDelta);
          if (newWeeks !== prev.baseWeeks) {
            if (prev.kind === 'meso') onResizeMesocycle?.(prev.id, newWeeks);
            else onResizeNutritionPhase?.(prev.id, newWeeks);
          }
        }
        return null;
      });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizing?.id]);

  // Arrastrar un marcador de subida de volumen a otra semana (Bloque H,
  // Pantalla 1). Mismo patrón que `dragging` (Revisiones), pero mueve el
  // `atWeek` de la regla de progresión que originó el marcador en vez de una
  // fecha suelta — la semana se recalcula respecto al inicio del mesociclo al
  // que pertenece la regla.
  const [draggingVolume, setDraggingVolume] = useState<{ id: string; date: string; startX: number; deltaX: number; moveRef: NonNullable<PlanEvent['moveRef']> } | null>(null);
  const draggedVolumeRef = useRef(false);

  useEffect(() => {
    if (!draggingVolume) return;
    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - draggingVolume.startX;
      if (Math.abs(dx) > 3) draggedVolumeRef.current = true;
      setDraggingVolume(prev => prev && { ...prev, deltaX: dx });
    };
    const onUp = () => {
      setDraggingVolume(prev => {
        if (prev && draggedVolumeRef.current) {
          const dayPx = WEEK_PX / 7;
          const dayDelta = Math.round(prev.deltaX / dayPx);
          if (dayDelta !== 0) {
            const newDate = isoDate(addDays(parseDate(prev.date), dayDelta));
            const meso = mesocyclesProp.find(m => m.id === prev.moveRef.mesocycleId);
            if (meso) {
              const newAtWeek = mesocycleWeekNumber(meso.startDate, newDate, diasDeCiclo(meso.daysPerWeek));
              if (newAtWeek !== prev.moveRef.atWeek) {
                onMoveVolumeEvent?.(prev.moveRef.workoutId, prev.moveRef.exerciseId, prev.moveRef.atWeek, newAtWeek);
              }
            }
          }
        }
        return null;
      });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingVolume?.id]);

  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── Effective mesocycles/nutritionProgram — mientras se arrastra un borde,
  // todo lo que se calcula debajo (barras, bounds, proyección, conflictos) usa
  // la duración en curso, no la guardada, para que se vea la simulación en vivo.
  const liveResizeWeeks = resizing ? Math.max(1, resizing.baseWeeks + Math.round(resizing.deltaX / WEEK_PX)) : null;
  const mesocycles = resizing?.kind === 'meso' && liveResizeWeeks !== null
    ? mesocyclesProp.map(m => m.id === resizing.id ? { ...m, weeks: liveResizeWeeks } : m)
    : mesocyclesProp;
  const nutritionProgram = resizing?.kind === 'nutri' && liveResizeWeeks !== null && nutritionProgramProp
    ? { ...nutritionProgramProp, phases: nutritionProgramProp.phases.map(ph => ph.id === resizing.id ? { ...ph, weeks: liveResizeWeeks } : ph) }
    : nutritionProgramProp;

  // ── Compute timeline bounds ──────────────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0];
  // `reviewEvents` es opcional (aún no conectado en la vista de solo lectura del
  // atleta) — su presencia decide si el carril "Revisiones" ocupa sitio o no.
  const showReviewLane = reviewEvents !== undefined;
  const midLaneCount = showReviewLane ? 4 : 3; // Entrenamiento, Nutrición, [Revisiones,] Objetivos

  const allStarts: string[] = [];
  const allEnds: string[] = [];

  const sortedMesos = [...mesocycles].sort((a, b) => a.startDate.localeCompare(b.startDate));

  for (const m of sortedMesos) {
    allStarts.push(m.startDate);
    allEnds.push(isoDate(addDays(parseDate(m.startDate), m.weeks * 7)));
  }

  if (nutritionProgram) {
    allStarts.push(nutritionProgram.startDate);
    let cursor = parseDate(nutritionProgram.startDate);
    for (const ph of nutritionProgram.phases) {
      cursor = addDays(cursor, ph.weeks * 7);
    }
    allEnds.push(isoDate(cursor));
  }

  for (const item of roadmap.items) {
    if (item.startDate) allStarts.push(item.startDate);
    if (item.targetDate) allEnds.push(item.targetDate);
  }

  for (const ev of reviewEvents ?? []) {
    allStarts.push(ev.date);
    allEnds.push(ev.date);
  }

  allStarts.push(today);
  allEnds.push(today);

  const minDateStr = [...allStarts].sort()[0];
  const maxDateStr = [...allEnds].sort().at(-1)!;

  const minDate = parseDate(minDateStr);
  const rawEnd = parseDate(maxDateStr);
  const rawDays = diffDays(minDate, rawEnd);
  const minDays = MIN_WEEKS * 7;
  const totalDays = Math.max(rawDays + 14, minDays);

  const containerWidth = Math.ceil(totalDays / 7) * WEEK_PX;

  function xOf(dateStr: string): number {
    return daysToPx(Math.max(0, diffDays(minDate, parseDate(dateStr))));
  }
  function widthOf(startStr: string, endStr: string): number {
    return Math.max(WEEK_PX * 0.5, daysToPx(diffDays(parseDate(startStr), parseDate(endStr))));
  }

  // ── Month markers ────────────────────────────────────────────────────────────
  const monthMarkers: { x: number; label: string }[] = [];
  let lastMonth = -1;
  for (let i = 0; i * 7 <= totalDays + 7; i++) {
    const d = addDays(minDate, i * 7);
    if (d.getMonth() !== lastMonth) {
      monthMarkers.push({ x: i * WEEK_PX, label: fmtMonth(d) });
      lastMonth = d.getMonth();
    }
  }

  const todayX = xOf(today);

  // ── Weekly adherence strip (Bloque H) — una celda por semana, coloreada por
  // adherencia de entrenamiento esa semana. Opcional: solo si nos pasan los
  // assignments del atleta. Permite leer el pasado sin abrir nada.
  const showAdherenceStrip = workoutAssignments !== undefined;
  const weekCells: { x: number; w: number; status: WeekAdherence }[] = [];
  if (showAdherenceStrip) {
    for (let i = 0; i * 7 <= totalDays; i++) {
      const wStart = isoDate(addDays(minDate, i * 7));
      const wEnd = isoDate(addDays(minDate, (i + 1) * 7));
      weekCells.push({ x: i * WEEK_PX, w: WEEK_PX, status: weekAdherence(workoutAssignments!, wStart, wEnd, today) });
    }
  }
  const ADHERENCE_STRIP_H = 10;

  // ── Avisos de conflicto (Bloque H) — solo si hay algo que comparar (evita
  // recalcular cuando ninguna de las dos fuentes está conectada, p. ej. la
  // vista de solo lectura del atleta).
  const conflicts = (volumeEvents || reviewEvents)
    ? detectConflicts(volumeEvents ?? [], reviewEvents ?? [], mesocycles, nutritionEvents ?? [], deloadEvents ?? []).filter(c => !dismissedConflicts.has(c.weekStart + c.message))
    : [];

  // ── Nutrition phase blocks ───────────────────────────────────────────────────
  const nutriBlocks: { key: string; start: string; end: string; label: string; color: string }[] = [];
  if (nutritionProgram) {
    let cursor = nutritionProgram.startDate;
    nutritionProgram.phases.forEach((ph, i) => {
      const phEnd = isoDate(addDays(parseDate(cursor), ph.weeks * 7));
      nutriBlocks.push({
        key: ph.id,
        start: cursor,
        end: phEnd,
        label: ph.name,
        color: NUTRI_COLORS[i % NUTRI_COLORS.length],
      });
      cursor = phEnd;
    });
  }

  // ── Items with dates vs floating ─────────────────────────────────────────────
  const datedItems = roadmap.items.filter(it => it.startDate || it.targetDate);
  const floatingItems = roadmap.items.filter(it => !it.startDate && !it.targetDate);

  // ── Editor handlers ──────────────────────────────────────────────────────────
  function openNew() {
    setEditingItem(blankItem());
    setIsNew(true);
  }

  function openEdit(item: RoadmapItem) {
    setEditingItem({ ...item });
    setIsNew(false);
  }

  async function handleSave() {
    if (!editingItem || !onSave) return;
    setSaving(true);
    try {
      let nextItems: RoadmapItem[];
      if (isNew) {
        nextItems = [...roadmap.items, editingItem];
      } else {
        nextItems = roadmap.items.map(it => it.id === editingItem.id ? editingItem : it);
      }
      await onSave({ ...roadmap, items: nextItems });
      setEditingItem(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editingItem || !onSave) return;
    setSaving(true);
    try {
      await onSave({ ...roadmap, items: roadmap.items.filter(it => it.id !== editingItem.id) });
      setEditingItem(null);
    } finally {
      setSaving(false);
    }
  }

  // ── Weight chart data ────────────────────────────────────────────────────────
  const sortedLogs = [...(bodyweightLogs ?? [])].sort((a, b) => a.date.localeCompare(b.date));

  const projectedWaypoints: { date: string; weight: number; isMilestone: boolean }[] = [];
  if (nutritionProgram) {
    const startW = sortedLogs.length > 0 ? sortedLogs[0].weight : (initialWeight ?? null);
    if (startW !== null) {
      projectedWaypoints.push({ date: nutritionProgram.startDate, weight: startW, isMilestone: false });
      let wcursor = nutritionProgram.startDate;
      for (const phase of nutritionProgram.phases) {
        const phEnd = isoDate(addDays(parseDate(wcursor), phase.weeks * 7));
        if (phase.targetWeight !== undefined) {
          projectedWaypoints.push({ date: phEnd, weight: phase.targetWeight, isMilestone: true });
        }
        wcursor = phEnd;
      }
    }
  }

  const allWeights = [...projectedWaypoints.map(p => p.weight), ...sortedLogs.map(l => l.weight)];
  const showWeightChart = allWeights.length > 0;

  let wDomainMin = 60, wDomainMax = 100;
  if (allWeights.length > 0) {
    const wMin = Math.min(...allWeights);
    const wMax = Math.max(...allWeights);
    const wMean = allWeights.reduce((s, v) => s + v, 0) / allWeights.length;
    const range = wMax - wMin;
    const pad = Math.max(range * 0.1, wMean * 0.03);
    wDomainMin = Math.floor((wMin - pad) * 10) / 10;
    wDomainMax = Math.ceil((wMax + pad) * 10) / 10;
  }

  const weightToLocalY = (w: number): number => {
    if (wDomainMax === wDomainMin) return WEIGHT_LANE_H / 2;
    const ratio = (w - wDomainMin) / (wDomainMax - wDomainMin);
    return WEIGHT_LANE_H - WEIGHT_PAD - ratio * (WEIGHT_LANE_H - 2 * WEIGHT_PAD);
  };

  const totalHeight = HEADER_H + (showAdherenceStrip ? ADHERENCE_STRIP_H : 0) + midLaneCount * LANE_H + (showWeightChart ? WEIGHT_LANE_H : 0);
  const lanesTopBase = HEADER_H + (showAdherenceStrip ? ADHERENCE_STRIP_H : 0);

  // Clases de atenuado/glow según el tramo — solo se aplican en la vista del
  // atleta (readonly): refuerza visualmente "dónde estás y qué te queda".
  // El coach ve siempre opacidad plena (son fases que puede seguir editando).
  function goldTimingClasses(timing: BlockTiming): string {
    if (!readonly) return '';
    if (timing === 'past') return 'opacity-40 grayscale-[0.3]';
    if (timing === 'current') return '';
    return 'opacity-70';
  }
  function cyanTimingClasses(timing: BlockTiming): string {
    if (!readonly) return '';
    if (timing === 'past') return 'opacity-40 grayscale-[0.3]';
    if (timing === 'current') return '';
    return 'opacity-70';
  }

  // ── Lane content builders — shared between the mobile stacked view (own mini-scroll-X per
  // lane, topBase = MOBILE_HEADER_H) and the desktop combined canvas (topBase = HEADER_H + i*LANE_H) ──
  const VOL_MARKER_H = 18;
  const trainingContent = (topBase: number) => [
    // Celdas clicables — "Programar aquí" (Bloque H), igual que en Revisiones.
    // Detrás de todo (zIndex más bajo) para no robarle el clic a marcadores ni barras.
    ...(onCreateReview && onAddVolumeRule ? Array.from({ length: Math.ceil(totalDays / 7) + 1 }, (_, i) => {
      const wStart = isoDate(addDays(minDate, i * 7));
      return (
        <button
          key={`train-cell-${i}`}
          type="button"
          onClick={() => { setPlannerDate(wStart); setPlannerLane('entrenamiento'); setPlannerOpen(true); }}
          style={{ position: 'absolute', left: i * WEEK_PX, top: topBase, width: WEEK_PX, height: LANE_H, zIndex: 1 }}
          className="group flex items-center justify-center hover:bg-white/[0.03] transition-colors"
          title="Programar en Entrenamiento aquí"
        >
          <Icon name="add" size="s" className="text-ink-5 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      );
    }) : []),
    ...(deloadEvents ?? []).map(ev => {
      const x = xOf(ev.date);
      return (
        <div
          key={ev.id}
          role="button"
          tabIndex={0}
          onClick={() => setViewingEvent(ev)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setViewingEvent(ev); }}
          style={{ position: 'absolute', left: x - VOL_MARKER_H / 2, top: topBase + 4, width: VOL_MARKER_H, height: VOL_MARKER_H, zIndex: 10 }}
          className={`rounded-full border-2 flex items-center justify-center cursor-pointer hover:scale-[1.15] transition-transform ${reviewMarkerClasses(ev.status)}`}
          title={`${ev.title} · ${fmtDate(ev.date)} · ${ev.status}`}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>{ev.icon}</span>
        </div>
      );
    }),
    ...(volumeEvents ?? []).map(ev => {
      const x = xOf(ev.date);
      const isDraggingVol = draggingVolume?.id === ev.id;
      const volDeltaX = isDraggingVol ? draggingVolume.deltaX : 0;
      const canDrag = !!(onMoveVolumeEvent && ev.moveRef);
      return (
        <div
          key={ev.id}
          role="button"
          tabIndex={0}
          onPointerDown={canDrag ? (e => {
            e.preventDefault();
            e.stopPropagation();
            draggedVolumeRef.current = false;
            setDraggingVolume({ id: ev.id, date: ev.date, startX: e.clientX, deltaX: 0, moveRef: ev.moveRef! });
          }) : undefined}
          onClick={() => { if (!draggedVolumeRef.current) setViewingEvent(ev); }}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setViewingEvent(ev); }}
          style={{
            position: 'absolute', left: x - VOL_MARKER_H / 2 + volDeltaX, top: topBase + 4, width: VOL_MARKER_H, height: VOL_MARKER_H, zIndex: isDraggingVol ? 20 : 10,
            transition: isDraggingVol ? 'none' : undefined,
          }}
          className={`relative rounded-full border-2 flex items-center justify-center transition-transform hover:scale-[1.15] ${canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${ev.conditional ? conditionalMarkerClasses(ev.conditional.met) : reviewMarkerClasses(ev.status)}`}
          title={`${ev.title} · ${fmtDate(ev.date)}${ev.conditional ? ` · condicional (${ev.conditional.met ? 'se cumple ahora' : 'no se cumple ahora'})` : ` · ${ev.status}`}`}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>{ev.icon}</span>
          {ev.conditional && (
            <span
              className="absolute -right-1 -top-1 w-3 h-3 rounded-full bg-bg border border-current flex items-center justify-center"
              style={{ fontSize: 8, lineHeight: 1 }}
            >?</span>
          )}
        </div>
      );
    }),
    ...sortedMesos.map((m, idx) => {
    const mEnd = isoDate(addDays(parseDate(m.startDate), m.weeks * 7));
    const x = xOf(m.startDate);
    const w = widthOf(m.startDate, mEnd);
    const color = MESO_COLORS[idx % MESO_COLORS.length];
    const timing = blockTiming(m.startDate, mEnd, today);
    const isResizing = resizing?.kind === 'meso' && resizing.id === m.id;
    return (
      <div
        key={m.id}
        style={{ position: 'absolute', left: x, top: topBase + ITEM_Y, width: w, height: ITEM_H, zIndex: isResizing ? 15 : 5 }}
        className={`rounded-surface overflow-hidden cursor-default transition-all ${isResizing ? '' : goldTimingClasses(timing)}`}
        title={`${m.objective || `Mes. ${m.number}`} · ${m.weeks} semanas · ${fmtDate(m.startDate)} – ${fmtDate(mEnd)}`}
      >
        <div style={{ background: color }} className="h-full px-3 flex flex-col justify-center">
          <p className="font-sans font-bold text-black text-caption uppercase truncate leading-tight">
            {m.objective || `Mes. ${m.number}`}
          </p>
          <p className="font-mono text-caption text-black/60 leading-tight">{m.weeks} sem · {fmtDate(m.startDate)}</p>
        </div>
        {onResizeMesocycle && (
          <div
            role="slider"
            aria-label={`Alargar o acortar ${m.objective || `Mesociclo ${m.number}`}`}
            aria-valuenow={m.weeks}
            onPointerDown={e => {
              e.preventDefault();
              e.stopPropagation();
              resizedRef.current = false;
              setResizing({ kind: 'meso', id: m.id, startX: e.clientX, deltaX: 0, baseWeeks: mesocyclesProp.find(x => x.id === m.id)?.weeks ?? m.weeks });
            }}
            style={{ position: 'absolute', right: -4, top: 0, width: 10, height: '100%', zIndex: 20 }}
            className="cursor-ew-resize"
          />
        )}
      </div>
    );
  }),
  ];

  const nutritionContent = (topBase: number) => [
    // Celdas clicables — "Programar aquí" (Bloque H), igual que en Entrenamiento/
    // Revisiones. Los tipos de evento de Nutrición siguen "próximamente" en el
    // panel (no hay modelo de datos aún, ver EventPlannerSheet), pero el punto de
    // entrada ya existe: clicar abre el panel centrado en Nutrición y esa semana.
    ...(onCreateReview && onAddVolumeRule ? Array.from({ length: Math.ceil(totalDays / 7) + 1 }, (_, i) => {
      const wStart = isoDate(addDays(minDate, i * 7));
      return (
        <button
          key={`nutri-cell-${i}`}
          type="button"
          onClick={() => { setPlannerDate(wStart); setPlannerLane('nutricion'); setPlannerOpen(true); }}
          style={{ position: 'absolute', left: i * WEEK_PX, top: topBase, width: WEEK_PX, height: LANE_H, zIndex: 1 }}
          className="group flex items-center justify-center hover:bg-white/[0.03] transition-colors"
          title="Programar en Nutrición aquí"
        >
          <Icon name="add" size="s" className="text-ink-5 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      );
    }) : []),
    ...(nutritionEvents ?? []).map(ev => {
      const x = xOf(ev.date);
      return (
        <div
          key={ev.id}
          role="button"
          tabIndex={0}
          onClick={() => setViewingEvent(ev)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setViewingEvent(ev); }}
          style={{ position: 'absolute', left: x - VOL_MARKER_H / 2, top: topBase + 4, width: VOL_MARKER_H, height: VOL_MARKER_H, zIndex: 10 }}
          className={`rounded-full border-2 flex items-center justify-center cursor-pointer hover:scale-[1.15] transition-transform ${reviewMarkerClasses(ev.status)}`}
          title={`${ev.title} · ${fmtDate(ev.date)} · ${ev.status}`}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>{ev.icon}</span>
        </div>
      );
    }),
    ...nutriBlocks.map(b => {
    const x = xOf(b.start);
    const w = widthOf(b.start, b.end);
    const timing = blockTiming(b.start, b.end, today);
    const isResizing = resizing?.kind === 'nutri' && resizing.id === b.key;
    return (
      <div
        key={b.key}
        style={{ position: 'absolute', left: x, top: topBase + ITEM_Y, width: w, height: ITEM_H, zIndex: isResizing ? 15 : 5 }}
        className={`rounded-surface overflow-hidden cursor-default transition-all ${isResizing ? '' : cyanTimingClasses(timing)}`}
        title={`${b.label} · ${fmtDate(b.start)} – ${fmtDate(b.end)}`}
      >
        <div style={{ background: b.color }} className="h-full px-3 flex flex-col justify-center">
          <p className="font-sans font-bold text-black text-caption uppercase truncate leading-tight">{b.label}</p>
          <p className="font-mono text-caption text-black/60 leading-tight">
            {fmtDate(b.start)} – {fmtDate(b.end)}
          </p>
        </div>
        {onResizeNutritionPhase && (
          <div
            role="slider"
            aria-label={`Alargar o acortar ${b.label}`}
            onPointerDown={e => {
              e.preventDefault();
              e.stopPropagation();
              resizedRef.current = false;
              const baseWeeks = nutritionProgramProp?.phases.find(p => p.id === b.key)?.weeks ?? 1;
              setResizing({ kind: 'nutri', id: b.key, startX: e.clientX, deltaX: 0, baseWeeks });
            }}
            style={{ position: 'absolute', right: -4, top: 0, width: 10, height: '100%', zIndex: 20 }}
            className="cursor-ew-resize"
          />
        )}
      </div>
    );
  }),
  ];

  const objectivesContent = (topBase: number) => datedItems.map(item => {
    const anchorStr = item.startDate ?? item.targetDate!;
    const endStr = item.targetDate ?? item.startDate!;
    const hasRange = !!(item.startDate && item.targetDate);
    const x = xOf(anchorStr);
    const w = hasRange ? widthOf(anchorStr, endStr) : WEEK_PX * 0.5;
    const color = statusColor(item.status);
    return (
      <div
        key={item.id}
        style={{ position: 'absolute', left: x, top: topBase + ITEM_Y, width: w, height: ITEM_H, zIndex: 5 }}
        className={`rounded-surface overflow-hidden border border-hairline transition-transform ${readonly ? 'cursor-default' : 'cursor-pointer hover:scale-[1.02]'}`}
        title={`${item.title}${item.description ? ' — ' + item.description : ''}${item.targetDate ? ' · ' + fmtDate(item.targetDate) : ''}`}
        onClick={() => !readonly && openEdit(item)}
      >
        <div style={{ background: color }} className="h-full px-3 flex items-center gap-2">
          <span
            className="material-symbols-outlined text-black/70 shrink-0"
            style={{ fontSize: 12, fontVariationSettings: "'FILL' 1" }}
          >
            {typeIcon(item.type)}
          </span>
          <p className="font-sans font-bold text-black text-caption uppercase truncate leading-tight">{item.title}</p>
        </div>
      </div>
    );
  });

  // Carril "Revisiones" — solo marcadores puntuales (sin barra: son eventos de un
  // día, check-in/cuestionario/foto), derivados de `deriveReviewEvents`. Nunca
  // editables desde aquí todavía (llegan de las tareas del atleta).
  const reviewContent = (topBase: number) => [
    // Celdas clicables — "Programar aquí" (Bloque H). Detrás de los marcadores
    // (zIndex menor) para no robarles el clic. Solo si el padre nos da con qué
    // crear (readonly o vista del atleta => no se pasa `onCreateReview`).
    ...(onCreateReview ? Array.from({ length: Math.ceil(totalDays / 7) + 1 }, (_, i) => {
      const wStart = isoDate(addDays(minDate, i * 7));
      return (
        <button
          key={`cell-${i}`}
          type="button"
          onClick={() => { setQuickCreateDate(wStart); setQuickCreateTitle(''); setQuickCreateType('revision'); }}
          style={{ position: 'absolute', left: i * WEEK_PX, top: topBase, width: WEEK_PX, height: LANE_H, zIndex: 2 }}
          className="group flex items-center justify-center hover:bg-white/[0.03] transition-colors"
          title="Programar revisión aquí"
        >
          <Icon name="add" size="s" className="text-ink-5 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      );
    }) : []),
    ...(reviewEvents ?? []).map(ev => {
      const x = xOf(ev.date);
      const isDragging = dragging?.id === ev.id;
      const deltaX = isDragging ? dragging.deltaX : 0;
      return (
        <div
          key={ev.id}
          role="button"
          tabIndex={0}
          onPointerDown={onMoveReview ? (e => {
            e.preventDefault();
            draggedRef.current = false;
            setDragging({ id: ev.id, date: ev.date, startX: e.clientX, deltaX: 0 });
          }) : undefined}
          onClick={() => { if (!draggedRef.current) setViewingEvent(ev); }}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setViewingEvent(ev); }}
          style={{
            position: 'absolute', left: x - ITEM_H / 2 + deltaX, top: topBase + ITEM_Y, width: ITEM_H, height: ITEM_H, zIndex: isDragging ? 15 : 5,
            transition: isDragging ? 'none' : undefined,
          }}
          className={`rounded-full border-2 flex items-center justify-center transition-transform hover:scale-[1.08] ${onMoveReview ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${reviewMarkerClasses(ev.status)}`}
          title={`${ev.title} · ${fmtDate(ev.date)} · ${ev.status}`}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 16, fontVariationSettings: ev.status === 'hecho' ? "'FILL' 1" : "'FILL' 0" }}
          >
            {ev.icon}
          </span>
        </div>
      );
    }),
  ];

  const weightContent = (topBase: number) => !showWeightChart ? null : (
    <>
      <div
        style={{ position: 'absolute', left: 0, top: topBase, width: containerWidth, height: WEIGHT_LANE_H }}
        className="bg-bg border-b border-hairline"
      />
      <svg style={{ position: 'absolute', left: 0, top: topBase, width: containerWidth, height: WEIGHT_LANE_H }}>
        {[wDomainMin, (wDomainMin + wDomainMax) / 2, wDomainMax].map(w => (
          <line key={w} x1={0} y1={weightToLocalY(w)} x2={containerWidth} y2={weightToLocalY(w)} stroke="var(--color-raised)" strokeWidth={1} />
        ))}
        {projectedWaypoints.length >= 2 && (
          <polyline
            points={projectedWaypoints.map(p => `${xOf(p.date)},${weightToLocalY(p.weight)}`).join(' ')}
            fill="none"
            stroke="var(--color-chart-3)"
            strokeWidth={2}
            strokeDasharray="6 3"
          />
        )}
        {projectedWaypoints.filter(p => p.isMilestone).map((p, i) => {
          const cx = xOf(p.date);
          const cy = weightToLocalY(p.weight);
          return (
            <g key={i}>
              <polygon points={`${cx},${cy - 5} ${cx + 5},${cy} ${cx},${cy + 5} ${cx - 5},${cy}`} fill="var(--color-chart-3)">
                <title>Meta: {p.weight} kg · {fmtDate(p.date)}</title>
              </polygon>
              <text x={cx + 8} y={cy + 3} fill="var(--color-chart-3)" style={{ fontSize: 8, fontFamily: 'monospace' }}>
                {p.weight.toFixed(1)}
              </text>
            </g>
          );
        })}
        {sortedLogs.map((log, i) => {
          const cx = xOf(log.date);
          const cy = weightToLocalY(log.weight);
          return (
            <circle key={i} cx={cx} cy={cy} r={3.5} fill="var(--color-accent)" opacity={0.85}>
              <title>{log.date}: {log.weight} kg</title>
            </circle>
          );
        })}
      </svg>
    </>
  );

  const MOBILE_HEADER_H = 22;

  function MiniLane({ icon, label, height, children }: { icon: string; label: string; height: number; children: React.ReactNode }) {
    return (
      <div className="rounded-surface border border-hairline bg-field overflow-hidden">
        <div className="px-3 py-2 border-b border-hairline flex items-center gap-2">
          <span className="material-symbols-outlined text-ink-2" style={{ fontSize: 13 }}>{icon}</span>
          <span className="font-sans text-caption uppercase text-ink-2 tracking-widest">{label}</span>
        </div>
        <div className="overflow-x-auto hide-scrollbar">
          <div style={{ position: 'relative', width: containerWidth, height }}>
            {monthMarkers.map((m, i) => (
              <div
                key={i}
                style={{ position: 'absolute', left: m.x, top: 0, height: MOBILE_HEADER_H }}
                className="flex items-end pb-1 pl-1"
              >
                <span className="font-sans text-caption uppercase text-ink-2 tracking-widest whitespace-nowrap">{m.label}</span>
              </div>
            ))}
            <div
              style={{ position: 'absolute', left: todayX, top: 0, width: 2, height, zIndex: 10 }}
              className={readonly ? 'bg-accent' : 'bg-accent/40'}
            />
            {children}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      {!readonly && (
        <div className="flex items-center justify-between">
          <p className="font-mono text-caption text-ink-2 uppercase tracking-widest">
            Timeline de planificación
          </p>
          <div className="flex items-center gap-2">
            {onAddVolumeRule && (
              <Button size="s" onClick={() => setProposePlanOpen(true)} icon="auto_awesome">Proponer plan con IA</Button>
            )}
            {onCreateReview && onAddVolumeRule && (
              <Button size="s" variant="secondary" onClick={() => { setPlannerDate(today); setPlannerLane('entrenamiento'); setPlannerOpen(true); }} icon="add">Evento</Button>
            )}
            <Button size="s" variant="secondary" onClick={openNew} icon="add">Añadir objetivo</Button>
          </div>
        </div>
      )}

      {onAddVolumeRule && (
        <ProposePlanSheet open={proposePlanOpen} onClose={() => setProposePlanOpen(false)} />
      )}

      {onCreateReview && onAddVolumeRule && (
        <EventPlannerSheet
          open={plannerOpen}
          onClose={() => setPlannerOpen(false)}
          defaultDate={plannerDate ?? today}
          initialLane={plannerLane}
          mesocycles={mesocycles}
          workouts={workouts ?? []}
          exercises={exercises ?? []}
          onCreateReview={onCreateReview}
          onAddVolumeRule={onAddVolumeRule}
          onOpenObjectiveEditor={openNew}
        />
      )}

      {/* Mobile: lanes stacked vertically (scroll-Y via page), each with its own mini-scroll-X */}
      <div className="flex flex-col gap-3 sm:hidden">
        <MiniLane icon="fitness_center" label="Entrenamiento" height={MOBILE_HEADER_H + LANE_H}>
          {trainingContent(MOBILE_HEADER_H)}
        </MiniLane>
        <MiniLane icon="restaurant" label="Nutrición" height={MOBILE_HEADER_H + LANE_H}>
          {nutritionContent(MOBILE_HEADER_H)}
        </MiniLane>
        {showReviewLane && (
          <MiniLane icon="fact_check" label="Revisiones" height={MOBILE_HEADER_H + LANE_H}>
            {reviewContent(MOBILE_HEADER_H)}
          </MiniLane>
        )}
        <MiniLane icon="flag" label="Objetivos" height={MOBILE_HEADER_H + LANE_H}>
          {objectivesContent(MOBILE_HEADER_H)}
        </MiniLane>
        {showWeightChart && (
          <MiniLane icon="monitor_weight" label="Peso" height={MOBILE_HEADER_H + WEIGHT_LANE_H}>
            {weightContent(MOBILE_HEADER_H)}
          </MiniLane>
        )}
      </div>

      {/* Desktop: sticky sidebar + one combined horizontally scrollable canvas */}
      <div className="hidden sm:flex border border-hairline rounded-surface bg-field overflow-hidden">

        {/* Sidebar — never scrolls */}
        <div
          style={{ width: LANE_HEADER_W, flexShrink: 0, height: totalHeight }}
          className="bg-field border-r border-hairline relative z-10"
        >
          <div style={{ height: lanesTopBase }} />
          {[
            'Entrenamiento', 'Nutrición',
            ...(showReviewLane ? ['Revisiones'] : []),
            'Objetivos',
          ].map((label, i) => (
            <div
              key={label}
              style={{ height: LANE_H }}
              className="flex items-center justify-end pr-3 border-b border-hairline"
            >
              <span className="font-sans text-caption uppercase text-ink-2 tracking-widest">{label}</span>
            </div>
          ))}
          {showWeightChart && (
            <div
              style={{ height: WEIGHT_LANE_H }}
              className="flex flex-col justify-between pr-2 py-2 border-b border-hairline"
            >
              <span className="font-mono text-caption text-ink-2 text-right block">{wDomainMax.toFixed(1)}</span>
              <span className="font-mono text-caption uppercase text-ink-2 tracking-widest text-right block">Peso</span>
              <span className="font-mono text-caption text-ink-2 text-right block">{wDomainMin.toFixed(1)}</span>
            </div>
          )}
        </div>

        {/* Scrollable timeline area */}
        <div className="overflow-x-auto hide-scrollbar flex-1 pb-2">
          <div style={{ position: 'relative', width: containerWidth, height: totalHeight }}>

            {/* Month headers */}
            {monthMarkers.map((m, i) => (
              <div
                key={i}
                style={{ position: 'absolute', left: m.x, top: 0, height: HEADER_H }}
                className="flex items-end pb-2 pl-2"
              >
                <span className="font-sans text-caption uppercase text-ink-2 tracking-widest whitespace-nowrap">{m.label}</span>
              </div>
            ))}

            {/* Vertical week tick lines */}
            {monthMarkers.map((m, i) => (
              <div
                key={`tick-${i}`}
                style={{ position: 'absolute', left: m.x, top: lanesTopBase, width: 1, height: midLaneCount * LANE_H + (showWeightChart ? WEIGHT_LANE_H : 0) }}
                className="bg-raised"
              />
            ))}

            {/* Avisos de conflicto — icono en la cabecera de la semana afectada */}
            {conflicts.map((c, i) => (
              <button
                key={`conflict-${i}`}
                type="button"
                onClick={() => setViewingConflict(c)}
                style={{ position: 'absolute', left: xOf(c.weekStart) - 8, top: HEADER_H - 20, width: 16, height: 16, zIndex: 20 }}
                className="flex items-center justify-center text-danger hover:scale-110 transition-transform"
                title={c.message}
              >
                <Icon name="warning" size="s" filled />
              </button>
            ))}

            {/* Lane backgrounds */}
            {Array.from({ length: midLaneCount }, (_, i) => i).map(i => (
              <div
                key={i}
                style={{ position: 'absolute', left: 0, top: lanesTopBase + i * LANE_H, width: containerWidth, height: LANE_H }}
                className={`border-b border-hairline ${i % 2 === 0 ? 'bg-bg' : 'bg-bg'}`}
              />
            ))}

            {/* HOY vertical line — para el atleta, badge celebratorio "estás aquí" */}
            <div
              style={{ position: 'absolute', left: todayX, top: 0, width: 2, height: totalHeight, zIndex: 30 }}
              className={readonly ? 'bg-accent' : 'bg-accent/40'}
            >
              {readonly ? (
                <span
                  style={{ position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)' }}
                  className="bg-accent text-black text-caption font-bold px-2 py-1 rounded-full tracking-tighter border-2 border-hairline whitespace-nowrap uppercase animate-pulse"
                >
                  Estás aquí
                </span>
              ) : (
                <span
                  style={{ position: 'absolute', top: 2, left: 4 }}
                  className="font-mono text-caption text-accent uppercase whitespace-nowrap"
                >
                  Hoy
                </span>
              )}
            </div>

            {/* ── Weekly adherence strip (opcional) ────────────────────────── */}
            {showAdherenceStrip && weekCells.map((c, i) => (
              <div
                key={i}
                style={{ position: 'absolute', left: c.x, top: HEADER_H, width: c.w - 1, height: ADHERENCE_STRIP_H }}
                className={`rounded-[2px] ${ADHERENCE_COLOR[c.status]}`}
                title={`Semana del ${fmtDate(isoDate(addDays(minDate, i * 7)))} · ${c.status}`}
              />
            ))}

            {/* ── Lane 0: Entrenamiento ──────────────────────────────────────── */}
            {trainingContent(lanesTopBase + 0 * LANE_H)}

            {/* ── Lane 1: Nutrición ─────────────────────────────────────────── */}
            {nutritionContent(lanesTopBase + 1 * LANE_H)}

            {/* ── Lane 2: Revisiones (opcional) ────────────────────────────── */}
            {showReviewLane && reviewContent(lanesTopBase + 2 * LANE_H)}

            {/* ── Lane 3: Objetivos ─────────────────────────────────────────── */}
            {objectivesContent(lanesTopBase + (showReviewLane ? 3 : 2) * LANE_H)}

            {/* ── Weight lane: Evolución de peso ──────────────────────────── */}
            {weightContent(lanesTopBase + midLaneCount * LANE_H)}

          </div>{/* end inner div */}
        </div>{/* end scrollable area */}
      </div>{/* end timeline outer */}

      {/* Floating items (no dates) */}
      {floatingItems.length > 0 && (
        <div className="border border-hairline rounded-surface p-4 space-y-2">
          <p className="font-mono text-caption uppercase text-ink-2 tracking-widest mb-2">Sin fecha asignada</p>
          <div className="flex flex-wrap gap-2">
            {floatingItems.map(item => (
              <button
                key={item.id}
                onClick={() => !readonly && openEdit(item)}
                disabled={readonly}
                className={`flex items-center gap-2 px-3 py-2 rounded-control border border-hairline text-label font-sans ${readonly ? 'cursor-default' : 'hover:border-accent/40 cursor-pointer'} transition-all`}
                style={{ color: statusColor(item.status) }}
                title={item.description}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 12, fontVariationSettings: "'FILL' 1" }}>
                  {typeIcon(item.type)}
                </span>
                {item.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {roadmap.items.length === 0 && mesocycles.length === 0 && !nutritionProgram && (
        <EmptyState icon="map" title="No hay datos de planificación todavía." />
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-4 px-1 pt-3 border-t border-hairline">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-control" style={{ background: MESO_COLORS[0] }} />
          <span className="font-mono text-caption text-ink-2 uppercase">Mesociclo</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-control" style={{ background: NUTRI_COLORS[0] }} />
          <span className="font-mono text-caption text-ink-2 uppercase">Nutrición</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-control" style={{ background: 'var(--color-warning)' }} />
          <span className="font-mono text-caption text-ink-2 uppercase">Pendiente</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-control" style={{ background: 'var(--color-accent)' }} />
          <span className="font-mono text-caption text-ink-2 uppercase">En progreso</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-control" style={{ background: 'var(--color-success)' }} />
          <span className="font-mono text-caption text-ink-2 uppercase">Logrado</span>
        </div>
        {showWeightChart && (
          <>
            <div className="flex items-center gap-2">
              <svg width="20" height="10">
                <line x1="0" y1="5" x2="20" y2="5" stroke="var(--color-chart-3)" strokeWidth="2" strokeDasharray="5 2" />
              </svg>
              <span className="font-mono text-caption text-ink-2 uppercase">Plan peso</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ background: 'var(--color-accent)' }} />
              <span className="font-mono text-caption text-ink-2 uppercase">Peso real</span>
            </div>
          </>
        )}
      </div>

      {/* Item editor modal */}
      {editingItem && (
        <ItemEditor
          item={editingItem}
          onChange={setEditingItem}
          onConfirm={handleSave}
          onDelete={!isNew ? handleDelete : undefined}
          onCancel={() => setEditingItem(null)}
          saving={saving}
          isNew={isNew}
        />
      )}

      {/* Detalle de un evento del carril "Revisiones" (solo lectura por ahora) */}
      {viewingEvent && (
        <Sheet
          open
          onClose={() => setViewingEvent(null)}
          title={viewingEvent.title}
          footer={<Button variant="secondary" onClick={() => setViewingEvent(null)} className="flex-1">Cerrar</Button>}
        >
          <div className="space-y-4">
            <div>
              <label className="block font-mono text-caption text-ink-2 uppercase tracking-wider mb-1">Cuándo</label>
              <p className="text-title-s text-white font-sans">{fmtDate(viewingEvent.date)}</p>
            </div>
            <div>
              <label className="block font-mono text-caption text-ink-2 uppercase tracking-wider mb-1">Estado</label>
              <Badge tone={REVIEW_STATUS_TONE[viewingEvent.status]}>{viewingEvent.status}</Badge>
            </div>
            {viewingEvent.conditional && (
              <div>
                <label className="block font-mono text-caption text-ink-2 uppercase tracking-wider mb-1">Condición</label>
                <p className="font-sans text-caption text-ink-2 leading-relaxed">
                  Este escalón de progresión solo se aplica si se cumple la condición configurada. Con los datos de hoy,
                  {viewingEvent.conditional.met ? ' se cumple.' : ' no se cumple todavía.'}
                </p>
              </div>
            )}
          </div>
        </Sheet>
      )}

      {/* Aviso de conflicto (Bloque H) — "Mover uno" llegará con el arrastre de
          marcadores; hasta entonces solo se puede ignorar el aviso. */}
      {viewingConflict && (
        <Sheet
          open
          onClose={() => setViewingConflict(null)}
          title="Conflicto de programación"
          footer={
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => {
                setDismissedConflicts(prev => new Set(prev).add(viewingConflict.weekStart + viewingConflict.message));
                setViewingConflict(null);
              }}
            >
              Ignorar
            </Button>
          }
        >
          <p className="text-title-s text-white font-sans leading-relaxed">{viewingConflict.message}</p>
        </Sheet>
      )}

      {/* Programar aquí (Bloque H) — quick-create de una revisión en la semana clicada */}
      {quickCreateDate && (
        <Sheet
          open
          onClose={() => setQuickCreateDate(null)}
          title="Programar revisión"
          footer={
            <>
              <Button variant="secondary" onClick={() => setQuickCreateDate(null)} className="flex-1">Cancelar</Button>
              <Button
                onClick={async () => {
                  if (!onCreateReview || !quickCreateTitle.trim()) return;
                  setQuickCreateSaving(true);
                  try {
                    await onCreateReview({ title: quickCreateTitle.trim(), date: quickCreateDate, type: quickCreateType });
                    setQuickCreateDate(null);
                  } finally {
                    setQuickCreateSaving(false);
                  }
                }}
                disabled={!quickCreateTitle.trim() || quickCreateSaving}
                loading={quickCreateSaving}
                className="flex-1"
              >
                Guardar
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <p className="font-mono text-caption text-ink-2 uppercase tracking-wider">
              Semana del {fmtDate(quickCreateDate)}
            </p>
            <Select
              label="Tipo"
              value={quickCreateType}
              onChange={v => setQuickCreateType(v as typeof quickCreateType)}
              options={[
                { value: 'revision', label: 'Revisión' },
                { value: 'cuestionario', label: 'Cuestionario' },
                { value: 'foto', label: 'Fotos' },
              ]}
            />
            <Input
              label="Título"
              value={quickCreateTitle}
              onChange={setQuickCreateTitle}
              placeholder="Revisión semanal"
            />
          </div>
        </Sheet>
      )}
    </div>
  );
}
