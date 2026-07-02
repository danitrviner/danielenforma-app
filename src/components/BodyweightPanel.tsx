import React, { useState, useEffect, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { BodyweightLog } from '../types';
import { getBodyweightForAthlete, addBodyweight, updateBodyweight, deleteBodyweight } from '../dbService';

interface Props {
  athleteEmail: string;
  readOnly?: boolean;
}

// ── Data helpers ──────────────────────────────────────────────────────────────

interface ChartPoint { date: string; value: number; avg?: number }

function toMovingAvg(pts: { date: string; value: number }[], windowDays = 7): ChartPoint[] {
  return pts.map(p => {
    const cutoff = new Date(p.date + 'T12:00:00');
    cutoff.setDate(cutoff.getDate() - (windowDays - 1));
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const window = pts.filter(q => q.date >= cutoffStr && q.date <= p.date);
    const avg = Math.round((window.reduce((s, q) => s + q.value, 0) / window.length) * 100) / 100;
    return { date: p.date, value: p.value, avg };
  });
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BwTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const date: string = payload[0]?.payload?.date;
  const rawEntry = payload.find((p: any) => p.dataKey === 'value');
  const avgEntry = payload.find((p: any) => p.dataKey === 'avg');
  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs font-mono shadow-xl">
      <p className="text-[#c6c9ab] mb-1">{fmtDate(date)}</p>
      {rawEntry?.value != null && (
        <p className="text-[#e2ff00] font-bold text-sm">{rawEntry.value} kg</p>
      )}
      {avgEntry?.value != null && rawEntry?.value !== avgEntry?.value && (
        <p className="text-[#00eefc] text-[10px] mt-0.5">Media 7d: {avgEntry.value} kg</p>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BodyweightPanel({ athleteEmail, readOnly = false }: Props) {
  const [logs, setLogs] = useState<BodyweightLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  // Add form
  const [newDate, setNewDate] = useState(todayStr());
  const [newWeight, setNewWeight] = useState('');
  const [adding, setAdding] = useState(false);

  // Inline edit
  const [editId, setEditId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editWeight, setEditWeight] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getBodyweightForAthlete(athleteEmail)
      .then(setLogs)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [athleteEmail]);

  // Sorted ascending for chart, descending for list
  const asc = useMemo(
    () => [...logs].sort((a, b) => a.date.localeCompare(b.date)),
    [logs]
  );
  const desc = useMemo(
    () => [...logs].sort((a, b) => b.date.localeCompare(a.date)),
    [logs]
  );

  const chartData = useMemo<ChartPoint[]>(
    () => toMovingAvg(asc.map(b => ({ date: b.date, value: b.weight }))),
    [asc]
  );

  const yDomain = useMemo<[number, number] | ['auto', 'auto']>(() => {
    if (chartData.length === 0) return ['auto', 'auto'];
    const vals = chartData.map(d => d.value);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const range = max - min;
    const pad = Math.max(range * 0.1, mean * 0.03);
    return [
      Math.floor((min - pad) * 10) / 10,
      Math.ceil((max + pad) * 10) / 10,
    ];
  }, [chartData]);

  const listEntries = showAll ? desc : desc.slice(0, 20);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleAdd = async () => {
    const w = parseFloat(newWeight);
    if (!newDate || isNaN(w) || w <= 0) return;
    setAdding(true);
    try {
      const entry = await addBodyweight({
        athleteId: athleteEmail,
        date: newDate,
        weight: w,
        createdAt: new Date().toISOString(),
      });
      setLogs(prev => [...prev, entry]);
      setNewWeight('');
      setNewDate(todayStr());
    } catch (err) { console.error(err); }
    finally { setAdding(false); }
  };

  const startEdit = (b: BodyweightLog) => {
    setEditId(b.id);
    setEditDate(b.date);
    setEditWeight(String(b.weight));
  };

  const cancelEdit = () => setEditId(null);

  const handleSaveEdit = async () => {
    if (!editId || !editDate || !editWeight) return;
    const w = parseFloat(editWeight);
    if (isNaN(w) || w <= 0) return;
    setSaving(true);
    try {
      await updateBodyweight(editId, { date: editDate, weight: w });
      setLogs(prev => prev.map(b => b.id === editId ? { ...b, date: editDate, weight: w } : b));
      setEditId(null);
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteBodyweight(id);
      setLogs(prev => prev.filter(b => b.id !== id));
    } catch (err) { console.error(err); }
    finally { setDeletingId(null); }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  const INPUT_CLS = 'bg-[#0e0e0e] border border-[#2a2a2a] rounded px-2 py-2 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-[#e2ff00] min-h-[44px]';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-sans font-bold text-sm text-white flex items-center gap-2">
          <span className="material-symbols-outlined text-[#e2ff00] text-base">monitor_weight</span>
          Peso corporal
          {logs.length > 0 && (
            <span className="font-mono text-[10px] text-[#c6c9ab] font-normal">
              {asc.at(-1)?.weight} kg · {fmtDate(asc.at(-1)!.date)}
            </span>
          )}
        </h3>
        {logs.length >= 2 && (
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 font-mono text-[9px] text-[#c6c9ab]">
              <span className="inline-block w-4 h-px bg-[#e2ff00]" />
              Diario
            </span>
            <span className="flex items-center gap-1.5 font-mono text-[9px] text-[#c6c9ab]">
              <span className="inline-block w-4 border-t border-dashed border-[#00eefc]" />
              Media 7d
            </span>
          </div>
        )}
      </div>

      {loading ? (
        <p className="font-mono text-xs text-[#c6c9ab] animate-pulse">Cargando…</p>
      ) : (
        <>
          {/* Chart */}
          {logs.length > 0 && (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={fmtDate}
                  tick={{ fill: '#c6c9ab', fontSize: 9, fontFamily: 'monospace' }}
                  axisLine={{ stroke: '#2a2a2a' }}
                  tickLine={false}
                  minTickGap={56}
                />
                <YAxis
                  domain={yDomain}
                  tick={{ fill: '#c6c9ab', fontSize: 9, fontFamily: 'monospace' }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                  tickFormatter={v => `${v}`}
                />
                <Tooltip content={(props) => <BwTooltip {...props} />} />
                {/* Moving average — rendered first so it sits below the daily dots */}
                <Line
                  type="monotone"
                  dataKey="avg"
                  stroke="#00eefc"
                  strokeWidth={1.5}
                  strokeDasharray="5 3"
                  dot={false}
                  activeDot={false}
                />
                {/* Daily points */}
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#e2ff00"
                  strokeWidth={2}
                  dot={{ fill: '#e2ff00', stroke: '#121212', strokeWidth: 2, r: 3 }}
                  activeDot={{ fill: '#e2ff00', stroke: '#121212', strokeWidth: 2, r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}

          {/* Add form (athlete only) */}
          {!readOnly && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-wrap">
              <input
                type="date"
                value={newDate}
                onChange={e => setNewDate(e.target.value)}
                max={todayStr()}
                className={`w-full sm:w-auto ${INPUT_CLS}`}
              />
              <div className="flex items-center gap-1 flex-1 sm:flex-none">
                <input
                  type="number"
                  value={newWeight}
                  onChange={e => setNewWeight(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                  placeholder="kg"
                  step="0.1"
                  min="20"
                  max="300"
                  className={`flex-1 sm:w-24 sm:flex-none ${INPUT_CLS}`}
                />
                <span className="font-mono text-[10px] text-[#c6c9ab]">kg</span>
              </div>
              <button
                onClick={handleAdd}
                disabled={adding || !newWeight || !newDate}
                className="w-full sm:w-auto px-4 py-2.5 min-h-[44px] bg-[#e2ff00] text-black font-mono font-bold text-xs uppercase rounded-lg hover:bg-[#bad200] active:scale-95 transition-all disabled:opacity-40"
              >
                {adding ? '…' : 'Añadir'}
              </button>
            </div>
          )}

          {/* Empty state */}
          {logs.length === 0 && (
            <div className="text-center py-8 border border-dashed border-[#2a2a2a] rounded-xl">
              <span className="material-symbols-outlined text-3xl text-[#2a2a2a] block mb-2">monitor_weight</span>
              <p className="font-mono text-xs text-[#c6c9ab]">
                {readOnly ? 'Sin registros todavía.' : 'Añade tu primer registro de peso.'}
              </p>
            </div>
          )}

          {/* List */}
          {logs.length > 0 && (
            <div className="space-y-1">
              <p className="font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wider">
                Historial{logs.length > 20 && !showAll ? ` · mostrando 20 de ${logs.length}` : ` · ${logs.length} registros`}
              </p>
              <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                {listEntries.map(b => (
                  <div
                    key={b.id}
                    className="flex items-center gap-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2"
                  >
                    {editId === b.id ? (
                      // ── Inline edit ──────────────────────────────────────
                      <>
                        <input
                          type="date"
                          value={editDate}
                          onChange={e => setEditDate(e.target.value)}
                          max={todayStr()}
                          className={`${INPUT_CLS} text-xs py-1`}
                        />
                        <input
                          type="number"
                          value={editWeight}
                          onChange={e => setEditWeight(e.target.value)}
                          step="0.1"
                          className={`w-20 ${INPUT_CLS} text-xs py-1`}
                        />
                        <span className="font-mono text-[10px] text-[#c6c9ab]">kg</span>
                        <div className="flex gap-1 ml-auto">
                          <button
                            onClick={handleSaveEdit}
                            disabled={saving}
                            className="px-2 py-1 bg-[#e2ff00] text-black font-mono text-[9px] font-bold uppercase rounded transition-all disabled:opacity-50"
                          >
                            {saving ? '…' : 'OK'}
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="px-2 py-1 border border-[#2a2a2a] text-[#c6c9ab] font-mono text-[9px] uppercase rounded transition-all hover:text-white"
                          >
                            ✕
                          </button>
                        </div>
                      </>
                    ) : (
                      // ── Read row ─────────────────────────────────────────
                      <>
                        <span className="font-mono text-[10px] text-[#c6c9ab] w-20 flex-shrink-0">{fmtDate(b.date)}</span>
                        <span className="font-mono font-bold text-white text-sm flex-1">{b.weight} kg</span>
                        {!readOnly && (
                          <div className="flex gap-1 flex-shrink-0">
                            <button
                              onClick={() => startEdit(b)}
                              className="p-1 text-[#c6c9ab] hover:text-[#00eefc] transition-colors"
                              title="Editar"
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>edit</span>
                            </button>
                            <button
                              onClick={() => handleDelete(b.id)}
                              disabled={deletingId === b.id}
                              className="p-1 text-[#c6c9ab] hover:text-red-400 transition-colors disabled:opacity-40"
                              title="Eliminar"
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                                {deletingId === b.id ? 'progress_activity' : 'delete'}
                              </span>
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
              {logs.length > 20 && !showAll && (
                <button
                  onClick={() => setShowAll(true)}
                  className="text-[10px] font-mono text-[#c6c9ab] hover:text-white underline transition-colors"
                >
                  Ver todos ({logs.length})
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
