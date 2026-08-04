import React, { useState } from 'react';
import { Mesocycle, NutritionProgram, Roadmap, RoadmapItem, BodyweightLog } from '../types';
import { Icon, Button, EmptyState, Sheet, Input, Select } from './ui';

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

export default function RoadmapTimeline({ mesocycles, nutritionProgram, roadmap, readonly, onSave, bodyweightLogs, initialWeight }: Props) {
  const [editingItem, setEditingItem] = useState<RoadmapItem | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── Compute timeline bounds ──────────────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0];

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

  const totalHeight = HEADER_H + 3 * LANE_H + (showWeightChart ? WEIGHT_LANE_H : 0);

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
  const trainingContent = (topBase: number) => sortedMesos.map((m, idx) => {
    const mEnd = isoDate(addDays(parseDate(m.startDate), m.weeks * 7));
    const x = xOf(m.startDate);
    const w = widthOf(m.startDate, mEnd);
    const color = MESO_COLORS[idx % MESO_COLORS.length];
    const timing = blockTiming(m.startDate, mEnd, today);
    return (
      <div
        key={m.id}
        style={{ position: 'absolute', left: x, top: topBase + ITEM_Y, width: w, height: ITEM_H, zIndex: 5 }}
        className={`rounded-surface overflow-hidden cursor-default transition-all ${goldTimingClasses(timing)}`}
        title={`${m.objective || `Mes. ${m.number}`} · ${m.weeks} semanas · ${fmtDate(m.startDate)} – ${fmtDate(mEnd)}`}
      >
        <div style={{ background: color }} className="h-full px-3 flex flex-col justify-center">
          <p className="font-sans font-bold text-black text-caption uppercase truncate leading-tight">
            {m.objective || `Mes. ${m.number}`}
          </p>
          <p className="font-mono text-caption text-black/60 leading-tight">{m.weeks} sem · {fmtDate(m.startDate)}</p>
        </div>
      </div>
    );
  });

  const nutritionContent = (topBase: number) => nutriBlocks.map(b => {
    const x = xOf(b.start);
    const w = widthOf(b.start, b.end);
    const timing = blockTiming(b.start, b.end, today);
    return (
      <div
        key={b.key}
        style={{ position: 'absolute', left: x, top: topBase + ITEM_Y, width: w, height: ITEM_H, zIndex: 5 }}
        className={`rounded-surface overflow-hidden cursor-default transition-all ${cyanTimingClasses(timing)}`}
        title={`${b.label} · ${fmtDate(b.start)} – ${fmtDate(b.end)}`}
      >
        <div style={{ background: b.color }} className="h-full px-3 flex flex-col justify-center">
          <p className="font-sans font-bold text-black text-caption uppercase truncate leading-tight">{b.label}</p>
          <p className="font-mono text-caption text-black/60 leading-tight">
            {fmtDate(b.start)} – {fmtDate(b.end)}
          </p>
        </div>
      </div>
    );
  });

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
        <div className="overflow-x-auto">
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
          <Button size="s" onClick={openNew} icon="add">Añadir objetivo</Button>
        </div>
      )}

      {/* Mobile: lanes stacked vertically (scroll-Y via page), each with its own mini-scroll-X */}
      <div className="flex flex-col gap-3 sm:hidden">
        <MiniLane icon="fitness_center" label="Entrenamiento" height={MOBILE_HEADER_H + LANE_H}>
          {trainingContent(MOBILE_HEADER_H)}
        </MiniLane>
        <MiniLane icon="restaurant" label="Nutrición" height={MOBILE_HEADER_H + LANE_H}>
          {nutritionContent(MOBILE_HEADER_H)}
        </MiniLane>
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
          <div style={{ height: HEADER_H }} />
          {(['Entrenamiento', 'Nutrición', 'Objetivos'] as const).map((label, i) => (
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
        <div className="overflow-x-auto flex-1 pb-2">
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
                style={{ position: 'absolute', left: m.x, top: HEADER_H, width: 1, height: 3 * LANE_H + (showWeightChart ? WEIGHT_LANE_H : 0) }}
                className="bg-raised"
              />
            ))}

            {/* Lane backgrounds */}
            {[0, 1, 2].map(i => (
              <div
                key={i}
                style={{ position: 'absolute', left: 0, top: HEADER_H + i * LANE_H, width: containerWidth, height: LANE_H }}
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

            {/* ── Lane 0: Entrenamiento ──────────────────────────────────────── */}
            {trainingContent(HEADER_H + 0 * LANE_H)}

            {/* ── Lane 1: Nutrición ─────────────────────────────────────────── */}
            {nutritionContent(HEADER_H + 1 * LANE_H)}

            {/* ── Lane 2: Objetivos ─────────────────────────────────────────── */}
            {objectivesContent(HEADER_H + 2 * LANE_H)}

            {/* ── Weight lane: Evolución de peso ──────────────────────────── */}
            {weightContent(HEADER_H + 3 * LANE_H)}

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
    </div>
  );
}
