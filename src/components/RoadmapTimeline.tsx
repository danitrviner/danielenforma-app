import React, { useState } from 'react';
import { Mesocycle, NutritionProgram, Roadmap, RoadmapItem, BodyweightLog } from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const WEEK_PX = 48;
const MIN_WEEKS = 12;
const LANE_HEADER_W = 100;
const HEADER_H = 40;
const LANE_H = 60;
const ITEM_H = 32;
const ITEM_Y = (LANE_H - ITEM_H) / 2;
const WEIGHT_LANE_H = 80;
const WEIGHT_PAD = 10;

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

const MESO_COLORS = ['#fbcb1a', '#d4a800', '#f7ff80'];
const NUTRI_COLORS = ['#00eefc', '#0cbcce', '#b3f6ff'];

function statusColor(status?: RoadmapItem['status']): string {
  if (status === 'logrado') return '#86efac';
  if (status === 'en_progreso') return '#fbcb1a';
  if (status === 'pendiente') return '#ff8c69';
  return '#c6c9ab';
}

function typeIcon(type: RoadmapItem['type']): string {
  if (type === 'objetivo') return 'target';
  if (type === 'hito') return 'flag';
  return 'sticky_note_2';
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
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-[#1e1e1b] border border-white/7 rounded-t-2xl sm:rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6">
        <div className="flex items-center justify-between">
          <h2 className="font-sans font-black text-lg text-white uppercase tracking-tight">
            {isNew ? 'Nuevo item' : 'Editar item'}
          </h2>
          <button onClick={onCancel} className="text-[#c6c9ab] hover:text-white transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Title */}
        <div>
          <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-1">Título *</label>
          <input
            type="text"
            value={item.title}
            onChange={e => onChange({ ...item, title: e.target.value })}
            placeholder="Nombre del objetivo / hito..."
            className="w-full bg-[#181816] border border-white/7 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#fbcb1a]"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-1">Descripción</label>
          <textarea
            value={item.description ?? ''}
            onChange={e => onChange({ ...item, description: e.target.value || undefined })}
            rows={2}
            placeholder="Detalle opcional..."
            className="w-full bg-[#181816] border border-white/7 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#fbcb1a] resize-none"
          />
        </div>

        {/* Type + Lane */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-1">Tipo</label>
            <select
              value={item.type}
              onChange={e => onChange({ ...item, type: e.target.value as RoadmapItem['type'] })}
              className="w-full bg-[#181816] border border-white/7 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#fbcb1a] cursor-pointer"
            >
              <option value="objetivo">Objetivo</option>
              <option value="hito">Hito</option>
              <option value="nota">Nota</option>
            </select>
          </div>
          <div>
            <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-1">Lane</label>
            <select
              value={item.lane}
              onChange={e => onChange({ ...item, lane: e.target.value as RoadmapItem['lane'] })}
              className="w-full bg-[#181816] border border-white/7 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#fbcb1a] cursor-pointer"
            >
              <option value="entreno">Entreno</option>
              <option value="nutricion">Nutrición</option>
              <option value="movilidad">Movilidad</option>
              <option value="general">General</option>
            </select>
          </div>
        </div>

        {/* Start / Target dates */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-1">Inicio</label>
            <input
              type="date"
              value={item.startDate ?? ''}
              onChange={e => onChange({ ...item, startDate: e.target.value || undefined })}
              className="w-full bg-[#181816] border border-white/7 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#fbcb1a]"
            />
          </div>
          <div>
            <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-1">Objetivo</label>
            <input
              type="date"
              value={item.targetDate ?? ''}
              onChange={e => onChange({ ...item, targetDate: e.target.value || undefined })}
              className="w-full bg-[#181816] border border-white/7 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#fbcb1a]"
            />
          </div>
        </div>

        {/* Status */}
        <div>
          <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-1">Estado</label>
          <select
            value={item.status ?? 'pendiente'}
            onChange={e => onChange({ ...item, status: e.target.value as RoadmapItem['status'] })}
            className="w-full bg-[#181816] border border-white/7 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#fbcb1a] cursor-pointer"
          >
            <option value="pendiente">Pendiente</option>
            <option value="en_progreso">En progreso</option>
            <option value="logrado">Logrado</option>
          </select>
        </div>

        {/* Buttons */}
        <div className="flex gap-3 pt-1">
          {!isNew && onDelete && (
            <button
              onClick={onDelete}
              className="px-4 py-2.5 border border-red-800/40 text-red-400 hover:text-red-300 font-mono text-xs uppercase rounded-xl transition-all"
            >
              Eliminar
            </button>
          )}
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 border border-white/7 text-[#c6c9ab] hover:text-white font-mono text-xs uppercase rounded-xl transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={saving || !item.title.trim()}
            className="flex-1 py-2.5 bg-[#fbcb1a] text-black font-sans font-bold text-xs uppercase rounded-xl hover:bg-[#d4a800] active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-1"
          >
            {saving ? (
              <><span className="material-symbols-outlined text-sm animate-spin">refresh</span>Guardando...</>
            ) : (
              isNew ? 'Añadir' : 'Guardar'
            )}
          </button>
        </div>
      </div>
    </div>
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

  // ── Lane content builders — shared between the mobile stacked view (own mini-scroll-X per
  // lane, topBase = MOBILE_HEADER_H) and the desktop combined canvas (topBase = HEADER_H + i*LANE_H) ──
  const trainingContent = (topBase: number) => sortedMesos.map((m, idx) => {
    const mEnd = isoDate(addDays(parseDate(m.startDate), m.weeks * 7));
    const x = xOf(m.startDate);
    const w = widthOf(m.startDate, mEnd);
    const color = MESO_COLORS[idx % MESO_COLORS.length];
    return (
      <div
        key={m.id}
        style={{ position: 'absolute', left: x, top: topBase + ITEM_Y, width: w, height: ITEM_H, zIndex: 5 }}
        className="rounded-md overflow-hidden cursor-default"
        title={`${m.objective || `Mes. ${m.number}`} · ${m.weeks} semanas · ${fmtDate(m.startDate)} – ${fmtDate(mEnd)}`}
      >
        <div style={{ background: color }} className="h-full px-2 flex flex-col justify-center">
          <p className="font-sans font-bold text-black text-[9px] truncate leading-tight">
            {m.objective || `Mes. ${m.number}`}
          </p>
          <p className="font-mono text-[7px] text-black/70 leading-tight">{m.weeks} sem</p>
        </div>
      </div>
    );
  });

  const nutritionContent = (topBase: number) => nutriBlocks.map(b => {
    const x = xOf(b.start);
    const w = widthOf(b.start, b.end);
    return (
      <div
        key={b.key}
        style={{ position: 'absolute', left: x, top: topBase + ITEM_Y, width: w, height: ITEM_H, zIndex: 5 }}
        className="rounded-md overflow-hidden cursor-default"
        title={`${b.label} · ${fmtDate(b.start)} – ${fmtDate(b.end)}`}
      >
        <div style={{ background: b.color }} className="h-full px-2 flex flex-col justify-center">
          <p className="font-sans font-bold text-black text-[9px] truncate leading-tight">{b.label}</p>
          <p className="font-mono text-[7px] text-black/70 leading-tight">
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
        className={`rounded-md overflow-hidden ${readonly ? 'cursor-default' : 'cursor-pointer hover:opacity-90'}`}
        title={`${item.title}${item.description ? ' — ' + item.description : ''}${item.targetDate ? ' · ' + fmtDate(item.targetDate) : ''}`}
        onClick={() => !readonly && openEdit(item)}
      >
        <div style={{ background: color }} className="h-full px-2 flex items-center gap-1">
          <span
            className="material-symbols-outlined text-black/70 shrink-0"
            style={{ fontSize: 10, fontVariationSettings: "'FILL' 1" }}
          >
            {typeIcon(item.type)}
          </span>
          <p className="font-sans font-bold text-black text-[9px] truncate leading-tight">{item.title}</p>
        </div>
      </div>
    );
  });

  const weightContent = (topBase: number) => !showWeightChart ? null : (
    <>
      <div
        style={{ position: 'absolute', left: 0, top: topBase, width: containerWidth, height: WEIGHT_LANE_H }}
        className="bg-[#0c0c0c] border-b border-[#1e1e1e]"
      />
      <svg style={{ position: 'absolute', left: 0, top: topBase, width: containerWidth, height: WEIGHT_LANE_H }}>
        {[wDomainMin, (wDomainMin + wDomainMax) / 2, wDomainMax].map(w => (
          <line key={w} x1={0} y1={weightToLocalY(w)} x2={containerWidth} y2={weightToLocalY(w)} stroke="#222" strokeWidth={1} />
        ))}
        {projectedWaypoints.length >= 2 && (
          <polyline
            points={projectedWaypoints.map(p => `${xOf(p.date)},${weightToLocalY(p.weight)}`).join(' ')}
            fill="none"
            stroke="#a78bfa"
            strokeWidth={2}
            strokeDasharray="6 3"
          />
        )}
        {projectedWaypoints.filter(p => p.isMilestone).map((p, i) => {
          const cx = xOf(p.date);
          const cy = weightToLocalY(p.weight);
          return (
            <g key={i}>
              <polygon points={`${cx},${cy - 5} ${cx + 5},${cy} ${cx},${cy + 5} ${cx - 5},${cy}`} fill="#a78bfa">
                <title>Meta: {p.weight} kg · {fmtDate(p.date)}</title>
              </polygon>
              <text x={cx + 8} y={cy + 3} fill="#a78bfa" style={{ fontSize: 8, fontFamily: 'monospace' }}>
                {p.weight.toFixed(1)}
              </text>
            </g>
          );
        })}
        {sortedLogs.map((log, i) => {
          const cx = xOf(log.date);
          const cy = weightToLocalY(log.weight);
          return (
            <circle key={i} cx={cx} cy={cy} r={3.5} fill="#fbcb1a" opacity={0.85}>
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
      <div className="rounded-xl border border-white/7 bg-[#0e0e0e] overflow-hidden">
        <div className="px-3 py-2 border-b border-[#1e1e1e] flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[#c6c9ab]" style={{ fontSize: 13 }}>{icon}</span>
          <span className="font-mono text-[10px] uppercase text-[#c6c9ab] tracking-widest">{label}</span>
        </div>
        <div className="overflow-x-auto">
          <div style={{ position: 'relative', width: containerWidth, height }}>
            {monthMarkers.map((m, i) => (
              <div
                key={i}
                style={{ position: 'absolute', left: m.x, top: 0, height: MOBILE_HEADER_H }}
                className="flex items-end pb-1 pl-1"
              >
                <span className="font-mono text-[8px] uppercase text-[#c6c9ab] tracking-widest whitespace-nowrap">{m.label}</span>
              </div>
            ))}
            <div
              style={{ position: 'absolute', left: todayX, top: 0, width: 2, height, zIndex: 10 }}
              className="bg-[#fbcb1a]/40"
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
          <p className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-widest">
            Timeline de planificación
          </p>
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#fbcb1a] text-black font-sans font-bold text-[10px] uppercase rounded-lg hover:bg-[#d4a800] active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            Añadir objetivo
          </button>
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
      <div className="hidden sm:flex border border-white/7 rounded-xl bg-[#0e0e0e] overflow-hidden">

        {/* Sidebar — never scrolls */}
        <div
          style={{ width: LANE_HEADER_W, flexShrink: 0, height: totalHeight }}
          className="bg-[#0e0e0e] border-r border-[#1e1e1e] relative z-10"
        >
          <div style={{ height: HEADER_H }} />
          {(['Entrenamiento', 'Nutrición', 'Objetivos'] as const).map((label, i) => (
            <div
              key={label}
              style={{ height: LANE_H }}
              className="flex items-center justify-end pr-3 border-b border-[#1e1e1e]"
            >
              <span className="font-mono text-[10px] uppercase text-[#c6c9ab] tracking-widest">{label}</span>
            </div>
          ))}
          {showWeightChart && (
            <div
              style={{ height: WEIGHT_LANE_H }}
              className="flex flex-col justify-between pr-2 py-1.5 border-b border-[#1e1e1e]"
            >
              <span className="font-mono text-[7px] text-[#c6c9ab] text-right block">{wDomainMax.toFixed(1)}</span>
              <span className="font-mono text-[10px] uppercase text-[#c6c9ab] tracking-widest text-right block">Peso</span>
              <span className="font-mono text-[7px] text-[#c6c9ab] text-right block">{wDomainMin.toFixed(1)}</span>
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
                className="flex items-end pb-1.5 pl-1.5"
              >
                <span className="font-mono text-[10px] uppercase text-[#c6c9ab] tracking-widest whitespace-nowrap">{m.label}</span>
              </div>
            ))}

            {/* Vertical week tick lines */}
            {monthMarkers.map((m, i) => (
              <div
                key={`tick-${i}`}
                style={{ position: 'absolute', left: m.x, top: HEADER_H, width: 1, height: 3 * LANE_H + (showWeightChart ? WEIGHT_LANE_H : 0) }}
                className="bg-[#1e1e1e]"
              />
            ))}

            {/* Lane backgrounds */}
            {[0, 1, 2].map(i => (
              <div
                key={i}
                style={{ position: 'absolute', left: 0, top: HEADER_H + i * LANE_H, width: containerWidth, height: LANE_H }}
                className={`border-b border-[#1e1e1e] ${i % 2 === 0 ? 'bg-[#111111]' : 'bg-[#0e0e0e]'}`}
              />
            ))}

            {/* HOY vertical line */}
            <div
              style={{ position: 'absolute', left: todayX, top: 0, width: 2, height: totalHeight, zIndex: 10 }}
              className="bg-[#fbcb1a]/40"
            >
              <span
                style={{ position: 'absolute', top: 2, left: 4 }}
                className="font-mono text-[8px] text-[#fbcb1a] uppercase whitespace-nowrap"
              >
                Hoy
              </span>
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
        <div className="border border-white/7 rounded-xl p-4 space-y-2">
          <p className="font-mono text-[10px] uppercase text-[#c6c9ab] tracking-widest mb-2">Sin fecha asignada</p>
          <div className="flex flex-wrap gap-2">
            {floatingItems.map(item => (
              <button
                key={item.id}
                onClick={() => !readonly && openEdit(item)}
                disabled={readonly}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/7 text-xs font-mono ${readonly ? 'cursor-default' : 'hover:border-[#fbcb1a]/40 cursor-pointer'} transition-all`}
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
        <div className="text-center py-12">
          <span className="material-symbols-outlined text-4xl text-[#2a2a2a] block mb-2">map</span>
          <p className="text-[#c6c9ab] text-xs font-mono">No hay datos de planificación todavía.</p>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-4 px-1">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ background: MESO_COLORS[0] }} />
          <span className="font-mono text-[9px] text-[#c6c9ab] uppercase">Mesociclo</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ background: NUTRI_COLORS[0] }} />
          <span className="font-mono text-[9px] text-[#c6c9ab] uppercase">Nutrición</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ background: '#ff8c69' }} />
          <span className="font-mono text-[9px] text-[#c6c9ab] uppercase">Pendiente</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ background: '#fbcb1a' }} />
          <span className="font-mono text-[9px] text-[#c6c9ab] uppercase">En progreso</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ background: '#86efac' }} />
          <span className="font-mono text-[9px] text-[#c6c9ab] uppercase">Logrado</span>
        </div>
        {showWeightChart && (
          <>
            <div className="flex items-center gap-1.5">
              <svg width="20" height="10">
                <line x1="0" y1="5" x2="20" y2="5" stroke="#a78bfa" strokeWidth="2" strokeDasharray="5 2" />
              </svg>
              <span className="font-mono text-[9px] text-[#c6c9ab] uppercase">Plan peso</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ background: '#fbcb1a' }} />
              <span className="font-mono text-[9px] text-[#c6c9ab] uppercase">Peso real</span>
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
