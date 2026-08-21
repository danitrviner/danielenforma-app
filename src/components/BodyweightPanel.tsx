import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LineChart, Line, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { BodyweightLog } from '../types';
import { getBodyweightForAthlete, addBodyweight, updateBodyweight, deleteBodyweight } from '../dbService';
import { bodyweightForAthleteKey } from '../hooks/useAthleteWeight';
import { Skeleton } from './ui';
import { Icon, EmptyState } from './ui';

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

  // Add form — colapsado detrás del chip "Añadir" (F3.2 handoff "Perfil"), no
  // siempre visible: el mockup solo lo abre al pulsar el chip.
  const [addOpen, setAddOpen] = useState(false);
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

  // Dominio con margen — sin esto Recharts arranca la escala en 0 y una
  // franja de 79-82 kg se aplasta contra el borde superior del gráfico.
  const yDomain = useMemo<[number, number] | ['auto', 'auto']>(() => {
    if (chartData.length === 0) return ['auto', 'auto'];
    const vals = chartData.map(d => d.value);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = Math.max((max - min) * 0.15, 0.5);
    return [Math.floor((min - pad) * 10) / 10, Math.ceil((max + pad) * 10) / 10];
  }, [chartData]);

  const HISTORY_COLLAPSED_COUNT = 4;
  const listEntries = showAll ? desc : desc.slice(0, HISTORY_COLLAPSED_COUNT);
  const hasMoreHistory = logs.length > HISTORY_COLLAPSED_COUNT;

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
      setAddOpen(false);
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

  const INPUT_CLS = 'bg-inset border border-hairline rounded-control px-2 py-2 text-body-s text-white font-mono focus:outline-none focus:ring-1 focus:ring-accent min-h-[44px]';

  return (
    <div className="space-y-3">
      {/* Header — icono + título + último registro a la derecha (handoff §1) */}
      <div className="flex items-center gap-2">
        <Icon name="monitor_weight" size="m" className="text-accent shrink-0" />
        <h3 className="font-sans font-bold text-body-s text-white flex-1">Peso corporal</h3>
        {logs.length > 0 && (
          <span className="font-mono text-label text-ink-2">
            {asc.at(-1)?.weight} kg · {fmtDate(asc.at(-1)!.date)}
          </span>
        )}
      </div>

      {loading ? (
        <Skeleton className="h-[180px] w-full" />
      ) : (
        <>
          <div className="bg-surface border border-hairline rounded-field p-4">
            {/* Leyenda + chip "Añadir" en la misma fila, dentro de la tarjeta */}
            <div className="flex items-center gap-4 mb-3">
              {logs.length >= 2 && (
                <>
                  <span className="flex items-center gap-1.5 font-mono text-label text-ink-2">
                    <span className="inline-block w-3.5 h-0.5 bg-accent rounded-full" />
                    Diario
                  </span>
                  <span className="flex items-center gap-1.5 font-mono text-label text-ink-2">
                    <span className="inline-block w-3.5 border-t border-dashed border-data" />
                    Media 7d
                  </span>
                </>
              )}
              {!readOnly && (
                <button
                  onClick={() => setAddOpen(v => !v)}
                  className="ml-auto flex items-center gap-1 px-2.5 py-1.5 rounded-control bg-inset border border-hairline font-sans text-label font-bold text-accent"
                >
                  <Icon name="add" size="s" />
                  Añadir
                </button>
              )}
            </div>

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
            {/* Gráfica minimal — sin ejes ni rejilla (handoff §1: "SVG 300×100"),
                el tooltip al pasar el dedo/ratón se conserva por accesibilidad. */}
            {logs.length > 1 && (
              <ResponsiveContainer width="100%" height={110}>
                <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                  <YAxis domain={yDomain} hide />
                  <Tooltip content={(props) => <BwTooltip {...props} />} />
                  <Line
                    type="monotone"
                    dataKey="avg"
                    stroke="var(--color-data)"
                    strokeWidth={1.5}
                    strokeDasharray="5 4"
                    dot={false}
                    activeDot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="var(--color-accent)"
                    strokeWidth={2.5}
                    dot={(props) => {
                      const { cx, cy, index, key } = props;
                      const isLast = index === chartData.length - 1;
                      return (
                        <circle key={key} cx={cx} cy={cy} r={isLast ? 4 : 2.2}
                          fill={isLast ? 'var(--color-accent)' : 'color-mix(in srgb, var(--color-accent) 75%, transparent)'} />
                      );
                    }}
                    activeDot={{ fill: 'var(--color-accent)', stroke: 'var(--color-bg)', strokeWidth: 2, r: 5 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}

            {/* Alta rápida — colapsada detrás del chip "Añadir" */}
            {!readOnly && addOpen && (
              <div className="mt-3 flex items-center gap-2 bg-bg border border-accent-line rounded-field p-3">
                <input
                  type="date"
                  value={newDate}
                  onChange={e => setNewDate(e.target.value)}
                  max={todayStr()}
                  className={INPUT_CLS}
                />
                <input
                  type="number"
                  value={newWeight}
                  onChange={e => setNewWeight(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                  placeholder="kg"
                  step="0.1"
                  min="20"
                  max="300"
                  autoFocus
                  className={`flex-1 ${INPUT_CLS}`}
                />
                <button
                  onClick={handleAdd}
                  disabled={adding || !newWeight || !newDate}
                  className="px-3.5 py-2 rounded-control bg-accent text-on-accent font-sans text-label font-bold disabled:opacity-50 shrink-0"
                >
                  {adding ? '…' : 'Guardar'}
                </button>
              </div>
            )}
          </div>

          {/* Empty state */}
          {logs.length === 0 && (
            <div className="border border-dashed border-hairline rounded-surface">
              <EmptyState icon="monitor_weight" title={readOnly ? 'Sin registros todavía.' : 'Añade tu primer registro de peso.'} />
            </div>
          )}

          {/* Historial — filas planas dentro de una única tarjeta con divisores,
              no una pila de tarjetas independientes (handoff §1). */}
          {logs.length > 0 && (
            <div className="space-y-2">
              <p className="font-mono text-caption text-ink-3 uppercase tracking-wider">
                Historial · {logs.length} registro{logs.length === 1 ? '' : 's'}
              </p>
              <div className="bg-surface border border-hairline rounded-field overflow-hidden">
                <div className={showAll ? 'max-h-[280px] overflow-y-auto' : ''}>
                  {listEntries.map((b, i) => (
                    <div
                      key={b.id}
                      className={`flex items-center gap-2 px-4 py-3 ${i < listEntries.length - 1 ? 'border-b border-hairline' : ''}`}
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
                              className="px-2 py-1 bg-accent text-on-accent font-sans text-caption font-bold uppercase rounded-control transition-all disabled:opacity-50"
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
                          <span className="font-sans text-body-s text-ink-2 flex-1">{fmtDate(b.date)}</span>
                          <span className="font-mono font-bold text-white text-body-s mr-1.5">{b.weight} kg</span>
                          {!readOnly && (
                            <div className="flex gap-2 flex-shrink-0">
                              <button
                                onClick={() => startEdit(b)}
                                className="text-ink-3 hover:text-data transition-colors"
                                title="Editar"
                              >
                                <Icon name="edit" size="s" />
                              </button>
                              <button
                                onClick={() => handleDelete(b.id)}
                                disabled={deletingId === b.id}
                                className="text-ink-3 hover:text-danger transition-colors disabled:opacity-40"
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
                {hasMoreHistory && (
                  <button
                    onClick={() => setShowAll(v => !v)}
                    className="w-full text-center py-2.5 border-t border-hairline text-label font-sans font-bold text-accent transition-colors"
                  >
                    {showAll ? 'Ver menos' : `Ver los ${logs.length - HISTORY_COLLAPSED_COUNT} restantes`}
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
