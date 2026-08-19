import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { BodyweightLog } from '../types';
import { getBodyweightForAthlete, addBodyweight, updateBodyweight, deleteBodyweight } from '../dbService';
import { bodyweightForAthleteKey } from '../hooks/useAthleteWeight';
import { Skeleton } from './ui';
import {
  Icon, Button, EmptyState,
  ALTURA_GRAFICA, MARGEN_GRAFICA, ANCHO_EJE_Y, REJILLA_GRAFICA, TICK_GRAFICA, EJE_GRAFICA,
} from './ui';

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
    <div className="bg-raised border border-hairline rounded-surface px-3 py-2 text-label font-mono shadow-e1">
      <p className="text-ink-2 mb-1">{fmtDate(date)}</p>
      {rawEntry?.value != null && (
        <p className="text-accent font-bold text-body-s">{rawEntry.value} kg</p>
      )}
      {avgEntry?.value != null && rawEntry?.value !== avgEntry?.value && (
        <p className="text-data text-caption ">Media 7d: {avgEntry.value} kg</p>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BodyweightPanel({ athleteEmail, readOnly = false }: Props) {
  const queryClient = useQueryClient();
  const queryKey = bodyweightForAthleteKey(athleteEmail);
  const { data: logs = [], isPending: loading } = useQuery({
    queryKey,
    queryFn: () => getBodyweightForAthlete(athleteEmail),
  });
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
      queryClient.setQueryData<BodyweightLog[]>(queryKey, prev => [...(prev ?? []), entry]);
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
      queryClient.setQueryData<BodyweightLog[]>(queryKey, prev =>
        prev?.map(b => b.id === editId ? { ...b, date: editDate, weight: w } : b));
      setEditId(null);
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteBodyweight(id);
      queryClient.setQueryData<BodyweightLog[]>(queryKey, prev => prev?.filter(b => b.id !== id));
    } catch (err) { console.error(err); }
    finally { setDeletingId(null); }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  const INPUT_CLS = 'bg-bg border border-hairline rounded-control px-2 py-2 text-body-s text-white font-mono focus:outline-none focus:ring-1 focus:ring-accent min-h-[44px]';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-sans font-bold text-title-s text-white flex items-center gap-2">
          <Icon name="monitor_weight" size="m" className="text-accent" />
          Peso corporal
          {logs.length > 0 && (
            <span className="font-mono text-caption text-ink-2 font-normal">
              {asc.at(-1)?.weight} kg · {fmtDate(asc.at(-1)!.date)}
            </span>
          )}
        </h3>
        {logs.length >= 2 && (
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2 font-mono text-caption text-ink-2">
              <span className="inline-block w-4 h-px bg-accent" />
              Diario
            </span>
            <span className="flex items-center gap-2 font-mono text-caption text-ink-2">
              <span className="inline-block w-4 border-t border-dashed border-data" />
              Media 7d
            </span>
          </div>
        )}
      </div>

      {loading ? (
        <Skeleton className="h-[180px] w-full" />
      ) : (
        <>
          {/* Con 1 solo registro, un LineChart dibuja un punto suelto sin línea
              — no es falso, pero tampoco dice nada útil (F3.13f, "nunca una
              gráfica que finja saber una tendencia que no tiene"). Se pide
              explícitamente el segundo dato en vez de fingir el gráfico. */}
          {logs.length === 1 && (
            <div className="flex items-center gap-3 bg-raised border border-hairline rounded-surface px-4 py-3">
              <Icon name="show_chart" size="m" className="text-accent shrink-0" />
              <p className="font-sans text-caption text-ink-2">Con un registro más dibujamos tu tendencia.</p>
            </div>
          )}
          {/* Chart */}
          {logs.length > 1 && (
            <ResponsiveContainer width="100%" height={ALTURA_GRAFICA.s}>
              <LineChart data={chartData} margin={MARGEN_GRAFICA}>
                <CartesianGrid {...REJILLA_GRAFICA} />
                <XAxis
                  dataKey="date"
                  tickFormatter={fmtDate}
                  tick={TICK_GRAFICA}
                  {...EJE_GRAFICA}
                  minTickGap={56}
                />
                <YAxis
                  domain={yDomain}
                  tick={TICK_GRAFICA}
                  {...EJE_GRAFICA}
                  width={ANCHO_EJE_Y}
                  tickFormatter={v => `${v}`}
                />
                <Tooltip content={(props) => <BwTooltip {...props} />} />
                {/* Moving average — rendered first so it sits below the daily dots */}
                <Line
                  type="monotone"
                  dataKey="avg"
                  stroke="var(--color-data)"
                  strokeWidth={1.5}
                  strokeDasharray="5 3"
                  dot={false}
                  activeDot={false}
                />
                {/* Daily points */}
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="var(--color-accent)"
                  strokeWidth={2}
                  dot={{ fill: 'var(--color-accent)', stroke: 'var(--color-bg)', strokeWidth: 2, r: 3 }}
                  activeDot={{ fill: 'var(--color-accent)', stroke: 'var(--color-bg)', strokeWidth: 2, r: 5 }}
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
                <span className="font-mono text-caption text-ink-2">kg</span>
              </div>
              <Button onClick={handleAdd} disabled={adding || !newWeight || !newDate} className="w-full sm:w-auto">
                {adding ? '…' : 'Añadir'}
              </Button>
            </div>
          )}

          {/* Empty state */}
          {logs.length === 0 && (
            <div className="border border-dashed border-hairline rounded-surface">
              <EmptyState icon="monitor_weight" title={readOnly ? 'Sin registros todavía.' : 'Añade tu primer registro de peso.'} />
            </div>
          )}

          {/* List */}
          {logs.length > 0 && (
            <div className="space-y-1">
              <p className="font-sans text-caption text-ink-2 uppercase tracking-wider">
                Historial{logs.length > 20 && !showAll ? ` · mostrando 20 de ${logs.length}` : ` · ${logs.length} registros`}
              </p>
              <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                {listEntries.map(b => (
                  <div
                    key={b.id}
                    className="flex items-center gap-2 bg-raised border border-hairline rounded-surface px-3 py-2"
                  >
                    {editId === b.id ? (
                      // ── Inline edit ──────────────────────────────────────
                      <>
                        <input
                          type="date"
                          value={editDate}
                          onChange={e => setEditDate(e.target.value)}
                          max={todayStr()}
                          className={`${INPUT_CLS} text-label py-1`}
                        />
                        <input
                          type="number"
                          value={editWeight}
                          onChange={e => setEditWeight(e.target.value)}
                          step="0.1"
                          className={`w-20 ${INPUT_CLS} text-label py-1`}
                        />
                        <span className="font-mono text-caption text-ink-2">kg</span>
                        <div className="flex gap-1 ml-auto">
                          <button
                            onClick={handleSaveEdit}
                            disabled={saving}
                            className="px-2 py-1 bg-accent text-black font-sans text-caption font-bold uppercase rounded-control transition-all disabled:opacity-50"
                          >
                            {saving ? '…' : 'OK'}
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="px-2 py-1 border border-hairline text-ink-2 font-sans text-caption uppercase rounded-control transition-all hover:text-white"
                          >
                            ✕
                          </button>
                        </div>
                      </>
                    ) : (
                      // ── Read row ─────────────────────────────────────────
                      <>
                        <span className="font-mono text-caption text-ink-2 w-20 flex-shrink-0">{fmtDate(b.date)}</span>
                        <span className="font-mono font-bold text-white text-body-s flex-1">{b.weight} kg</span>
                        {!readOnly && (
                          <div className="flex gap-1 flex-shrink-0">
                            <button
                              onClick={() => startEdit(b)}
                              className="p-1 text-ink-2 hover:text-data transition-colors"
                              title="Editar"
                            >
                              <Icon name="edit" size="s" />
                            </button>
                            <button
                              onClick={() => handleDelete(b.id)}
                              disabled={deletingId === b.id}
                              className="p-1 text-ink-2 hover:text-red-400 transition-colors disabled:opacity-40"
                              title="Eliminar"
                            >
                              <Icon name={deletingId === b.id ? 'progress_activity' : 'delete'} size="s" className={deletingId === b.id ? 'animate-spin' : ''} />
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
                  className="text-caption font-mono text-ink-2 hover:text-white underline transition-colors"
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
