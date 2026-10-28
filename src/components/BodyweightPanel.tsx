import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine, Tooltip, ResponsiveContainer } from 'recharts';
import { BodyweightLog } from '../types';
import { getBodyweightForAthlete, guardarPesoDelDia, updateBodyweight, deleteBodyweight } from '../dbService';
import { bodyweightForAthleteKey, invalidarExtremosDePeso } from '../hooks/useAthleteWeight';
import { Skeleton, SegmentedControl, REJILLA_GRAFICA, TICK_GRAFICA, EJE_GRAFICA, ANCHO_EJE_Y } from './ui';
import { Icon, EmptyState } from './ui';
import { hoyIsoLocal } from '../utils/trainingWeek';
import { addDays } from '../utils/trainingWeek';
import { RangoTemporal, RANGO_TEMPORAL_OPTIONS, recortarPorRango } from '../utils/rangoTemporal';
import { resumenPeso, cambiosPorTramo } from '../utils/resumenPeso';

interface Props {
  athleteEmail: string;
  readOnly?: boolean;
}

// ── Data helpers ──────────────────────────────────────────────────────────────

interface ChartPoint { date: string; value: number; avg?: number }

function toMovingAvg(pts: { date: string; value: number }[], windowDays = 7): ChartPoint[] {
  return pts.map(p => {
    const cutoffStr = addDays(p.date, -(windowDays - 1));
    const window = pts.filter(q => q.date >= cutoffStr && q.date <= p.date);
    const avg = Math.round((window.reduce((s, q) => s + q.value, 0) / window.length) * 100) / 100;
    return { date: p.date, value: p.value, avg };
  });
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

const kg1 = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const conSigno = (n: number, dec = 1) =>
  `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;

function todayStr(): string {
  return hoyIsoLocal();
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
        <p className="text-accent-ink font-bold text-body-s">{rawEntry.value} kg</p>
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
  const [rango, setRango] = useState<RangoTemporal>('todo');

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

  // La media móvil de 7d se calcula sobre TODO el historial antes de recortar
  // por rango — si no, los primeros puntos visibles de una ventana corta
  // tendrían una media calculada con menos días de los que tocan.
  const chartDataAll = useMemo<ChartPoint[]>(
    () => toMovingAvg(asc.map(b => ({ date: b.date, value: b.weight }))),
    [asc]
  );
  const chartData = useMemo(() => recortarPorRango(chartDataAll, rango), [chartDataAll, rango]);

  // Dominio con margen — sin esto Recharts arranca la escala en 0 y una
  // franja de 79-82 kg se aplasta contra el borde superior del gráfico.
  const yDomain = useMemo<[number, number] | ['auto', 'auto']>(() => {
    if (chartData.length === 0) return ['auto', 'auto'];
    const vals = chartData.flatMap(d => (d.avg != null ? [d.value, d.avg] : [d.value]));
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = Math.max((max - min) * 0.15, 0.5);
    return [Math.floor((min - pad) * 10) / 10, Math.ceil((max + pad) * 10) / 10];
  }, [chartData]);

  // Lo que antes había que adivinar mirando la línea (Dani, 28-10-2026).
  const resumen = useMemo(() => resumenPeso(chartData), [chartData]);
  const porMes = rango === '6m' || rango === 'todo';
  const tramos = useMemo(() => cambiosPorTramo(chartData, porMes ? 'mes' : 'semana'), [chartData, porMes]);
  const maxTramo = Math.max(0.1, ...tramos.map(t => Math.abs(t.cambio)));
  const inicio = asc[0];
  const inicioVisible = !!inicio && typeof yDomain[0] === 'number'
    && inicio.weight >= (yDomain[0] as number) && inicio.weight <= (yDomain[1] as number);

  const HISTORY_COLLAPSED_COUNT = 4;
  const listEntries = showAll ? desc : desc.slice(0, HISTORY_COLLAPSED_COUNT);
  const hasMoreHistory = logs.length > HISTORY_COLLAPSED_COUNT;

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleAdd = async () => {
    const w = parseFloat(newWeight);
    if (!newDate || isNaN(w) || w <= 0) return;
    setAdding(true);
    try {
      // Un peso por día: si esa fecha ya tiene uno, se corrige en vez de duplicar.
      const entry = await guardarPesoDelDia(athleteEmail, newDate, w, logs.find(l => l.date === newDate));
      queryClient.setQueryData<BodyweightLog[]>(queryKey, prev => [...(prev ?? []).filter(l => l.id !== entry.id), entry]);
      // Un peso nuevo puede ser el más reciente —o el primero, si es el
      // estreno—, así que los extremos que leen Check-in y Destacados dejan de
      // ser válidos.
      invalidarExtremosDePeso(queryClient, athleteEmail);
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
      // Editar puede cambiar la FECHA, así que el registro puede entrar o salir
      // de los extremos.
      invalidarExtremosDePeso(queryClient, athleteEmail);
      setEditId(null);
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteBodyweight(id);
      queryClient.setQueryData<BodyweightLog[]>(queryKey, prev => prev?.filter(b => b.id !== id));
      // Al borrar un extremo, el nuevo puede ser un registro que no está en
      // memoria — por eso se invalida y se vuelve a pedir, no se recalcula.
      invalidarExtremosDePeso(queryClient, athleteEmail);
    } catch (err) { console.error(err); }
    finally { setDeletingId(null); }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  const INPUT_CLS = 'bg-inset border border-hairline rounded-control px-2 py-2 text-body-s text-ink font-mono focus:outline-none focus:ring-1 focus:ring-accent min-h-[44px]';

  return (
    <div className="space-y-3">
      {/* Header — icono + título + último registro a la derecha (handoff §1) */}
      <div className="flex items-center gap-2">
        <Icon name="monitor_weight" size="m" className="text-accent-ink shrink-0" />
        <h3 className="font-sans font-bold text-body-s text-ink flex-1">Peso corporal</h3>
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
              {!readOnly && (
                <button
                  onClick={() => setAddOpen(v => !v)}
                  className="ml-auto flex items-center gap-1 px-2.5 py-1.5 rounded-control bg-raised border border-strong font-sans text-label font-bold text-accent-ink"
                >
                  <Icon name="add" size="s" />
                  Añadir
                </button>
              )}
            </div>

            {logs.length >= 2 && (
              <div className="mb-3">
                <SegmentedControl
                  label="Rango de la gráfica"
                  value={rango}
                  onChange={v => setRango(v as RangoTemporal)}
                  options={RANGO_TEMPORAL_OPTIONS}
                />
              </div>
            )}

            {resumen && (
              <div className="mb-3 space-y-2.5">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="font-mono text-title-l font-bold text-ink tabular-nums leading-none">{conSigno(resumen.cambio)} kg</p>
                    <p className="font-mono text-caption text-ink-3 uppercase mt-1.5">
                      en {resumen.dias} {resumen.dias === 1 ? 'día' : 'días'}
                      {resumen.ritmoSemana != null && ` · ${conSigno(resumen.ritmoSemana, 2)} kg/sem`}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <div className="bg-inset rounded-control px-2.5 py-2">
                    <p className="font-mono text-body-s font-bold text-ink tabular-nums">{kg1(resumen.media)} kg</p>
                    <p className="font-mono text-caption text-ink-3 uppercase">Media</p>
                  </div>
                  <div className="bg-inset rounded-control px-2.5 py-2">
                    <p className="font-mono text-body-s font-bold text-ink tabular-nums">{kg1(resumen.min)}–{kg1(resumen.max)}</p>
                    <p className="font-mono text-caption text-ink-3 uppercase">Mín – máx</p>
                  </div>
                  {inicio && (
                    <div className="bg-inset rounded-control px-2.5 py-2">
                      <p className="font-mono text-body-s font-bold text-ink tabular-nums">{kg1(inicio.weight)} kg</p>
                      <p className="font-mono text-caption text-ink-3 uppercase truncate">{readOnly ? 'Empezó' : 'Empezaste'} · {fmtDate(inicio.date)}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Con 1 solo registro, un LineChart dibuja un punto suelto sin línea
                — no es falso, pero tampoco dice nada útil (F3.13f, "nunca una
                gráfica que finja saber una tendencia que no tiene"). Se pide
                explícitamente el segundo dato en vez de fingir el gráfico. */}
            {logs.length === 1 && (
              <div className="flex items-center gap-3 bg-raised border border-hairline rounded-surface px-4 py-3">
                <Icon name="show_chart" size="m" className="text-accent-ink shrink-0" />
                <p className="font-sans text-caption text-ink-2">Con un registro más dibujamos tu tendencia.</p>
              </div>
            )}
            {logs.length > 1 && chartData.length < 2 && (
              <div className="flex items-center gap-3 bg-raised border border-hairline rounded-surface px-4 py-3">
                <Icon name="show_chart" size="m" className="text-accent-ink shrink-0" />
                <p className="font-sans text-caption text-ink-2">Sin registros en este rango.</p>
              </div>
            )}
            {/* Antes era una línea sin ejes ni rejilla (handoff §1) y no se sabía
                cuánto había bajado. Ahora: rejilla con los kg al borde, la media
                de 7 días como línea, cada pesaje como punto y el peso con el que
                empezó como referencia si cae dentro de la escala. */}
            {logs.length > 1 && chartData.length >= 2 && (
              <>
                <ResponsiveContainer width="100%" height={170}>
                  <LineChart data={chartData} margin={{ top: 6, right: 0, bottom: 0, left: 4 }}>
                    <CartesianGrid {...REJILLA_GRAFICA} vertical={false} />
                    <XAxis dataKey="date" tickFormatter={fmtDate} tick={TICK_GRAFICA} {...EJE_GRAFICA} minTickGap={36} />
                    <YAxis domain={yDomain} orientation="right" width={ANCHO_EJE_Y} tick={TICK_GRAFICA} {...EJE_GRAFICA} tickCount={4}
                      tickFormatter={(v: number) => kg1(v)} />
                    <Tooltip content={(props) => <BwTooltip {...props} />} />
                    {inicioVisible && (
                      <ReferenceLine y={inicio!.weight} stroke="var(--color-ink-3)" strokeDasharray="3 4"
                        label={{ value: 'inicio', position: 'insideTopLeft', fill: 'var(--color-ink-3)', fontSize: 10 }} />
                    )}
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="none"
                      dot={{ r: 2.2, fill: 'var(--color-ink-3)', stroke: 'none' }}
                      activeDot={{ fill: 'var(--color-ink)', stroke: 'var(--color-bg)', strokeWidth: 2, r: 4 }}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="avg"
                      stroke="var(--color-accent-ink)"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
                <div className="flex gap-4 mt-1 font-mono text-caption text-ink-2">
                  <span className="flex items-center gap-1.5"><span className="inline-block w-3.5 h-0.5 bg-accent rounded-full" />Media 7 días</span>
                  <span className="flex items-center gap-1.5"><span className="inline-block w-1.5 h-1.5 rounded-full bg-ink-3" />Peso del día</span>
                </div>

                {/* Cambio de cada semana (o mes en 6M/Todo): si el ritmo se frena,
                    se ve aquí antes que en la línea. Sin verde/rojo: bajar es bueno
                    en una definición y malo en un volumen. */}
                {tramos.length >= 2 && (
                  <div className="mt-4">
                    <p className="font-mono text-caption text-ink-3 uppercase mb-2">Cambio por {porMes ? 'mes' : 'semana'}</p>
                    <div className="flex items-stretch gap-1.5" role="img"
                      aria-label={tramos.map(t => `${t.etiqueta}: ${conSigno(t.cambio)} kg`).join(', ')}>
                      {tramos.map(t => {
                        const alto = Math.max(3, (Math.abs(t.cambio) / maxTramo) * 34);
                        const sube = t.cambio > 0;
                        return (
                          <div key={t.etiqueta} className="flex-1 min-w-0 flex flex-col items-center">
                            <span className={`font-mono text-caption tabular-nums ${sube ? 'text-accent-ink' : 'text-data'}`}>{conSigno(t.cambio)}</span>
                            <div className="relative w-full h-[72px]">
                              <span className="absolute inset-x-0 top-1/2 h-px bg-hairline" />
                              <span
                                className={`absolute left-1/2 -translate-x-1/2 w-[70%] max-w-9 rounded-sm ${sube ? 'bg-accent' : 'bg-data'}`}
                                style={sube ? { bottom: '50%', height: alto } : { top: '50%', height: alto }}
                              />
                            </div>
                            <span className="font-mono text-caption text-ink-3 truncate max-w-full">{t.etiqueta}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
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
                              className="px-2 py-1 bg-accent text-on-accent font-sans text-caption font-bold uppercase rounded-control transition-[color,background-color,border-color,opacity,transform,box-shadow] disabled:opacity-50"
                            >
                              {saving ? '…' : 'OK'}
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="px-2 py-1 border border-hairline text-ink-2 font-sans text-caption uppercase rounded-control transition-[color,background-color,border-color,opacity,transform,box-shadow] hover:text-ink"
                            >
                              ✕
                            </button>
                          </div>
                        </>
                      ) : (
                        // ── Read row ─────────────────────────────────────────
                        <>
                          <span className="font-sans text-body-s text-ink-2 flex-1">{fmtDate(b.date)}</span>
                          <span className="font-mono font-bold text-ink text-body-s mr-1.5">{b.weight} kg</span>
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
                    className="w-full text-center py-2.5 border-t border-hairline text-label font-sans font-bold text-accent-ink transition-colors"
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
