import React, { useState } from 'react';
import type { DayPlan, MuscleGroup } from '../../types';
import { MUSCLE_LABELS, MUSCLE_ORDER } from '../../types';
import { frecuenciaSemanal, type ChoqueDiasSeguidos } from '../../utils/programacion';
import { formateaFrecuencia } from '../../utils/progression';
import { iemEstimado, type IemPorSerie } from '../../utils/cdg/iemEstimado';
import { Icon } from '../ui';
import { empezarArrastre, leerArrastre, minutosEstimados, traeGrupo } from './arrastreDistribucion';

/* ═══════════════════════════════════════════════════════════════════════════
   Distribución · vista semana (29-10, propuesta 2 elegida por Dani)

   Grupos en filas y días en columnas: de un vistazo, cuántas series semanales
   lleva cada grupo y cuántas veces lo toca — que en la vista por días había que
   sumar a mano entre tarjetas. Se edita aquí mismo: pulsar una celda cambia sus
   series (0 lo quita), una vacía añade el grupo ese día, y arrastrar una celda
   a otra columna de su fila lo mueve de día. Naranja = el mismo grupo en días
   seguidos del calendario.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  days: DayPlan[];
  /** Día del calendario (0-based) de cada sesión, para titular «Día N». */
  offsets: number[];
  nombres: string[];
  cicloDias: number;
  choques: ChoqueDiasSeguidos[];
  iemPorSerie: IemPorSerie | null;
  onSeriesChange: (dia: number, aIdx: number, series: number) => void;
  onRemove: (dia: number, aIdx: number) => void;
  onAdd: (dia: number, group: MuscleGroup, series: number) => void;
  onMove: (desdeDia: number, aIdx: number, haciaDia: number) => void;
}

/** Fondo de la celda por series: cuanto más, más oro. */
const fondo = (s: number) =>
  `color-mix(in oklab, var(--color-accent) ${s >= 6 ? 70 : s >= 4 ? 42 : 20}%, transparent)`;

export default function DistribucionSemana({
  days, offsets, nombres, cicloDias, choques, iemPorSerie, onSeriesChange, onRemove, onAdd, onMove,
}: Props) {
  const [editando, setEditando] = useState<string | null>(null);
  const [borrador, setBorrador] = useState('');
  const [verVacios, setVerVacios] = useState(false);
  const [destino, setDestino] = useState<string | null>(null);

  const diaDe = (s: number) => (offsets[s] ?? s) + 1;
  const celda = (g: MuscleGroup, d: number) => {
    const aIdx = days[d]?.assignments.findIndex(a => a.group === g) ?? -1;
    return { aIdx, series: aIdx >= 0 ? days[d].assignments[aIdx].series : 0 };
  };
  const frecuencia = new Map(frecuenciaSemanal(days, cicloDias).map(f => [f.group, f]));
  const enChoque = (g: MuscleGroup, d: number) =>
    choques.some(c => c.group === g && c.dias.includes(offsets[d] ?? d));

  const conSeries = MUSCLE_ORDER.filter(g => days.some(d => d.assignments.some(a => a.group === g && a.series > 0)));
  const sinSeries = MUSCLE_ORDER.filter(g => !conSeries.includes(g));
  const filas = verVacios ? [...conSeries, ...sinSeries] : conSeries;
  const semanaDe = (g: MuscleGroup) => days.reduce((s, _, d) => s + celda(g, d).series, 0);
  const maxSemana = Math.max(1, ...conSeries.map(semanaDe));

  const confirmar = (g: MuscleGroup, d: number) => {
    const n = Math.min(25, Math.max(0, parseInt(borrador) || 0));
    const { aIdx } = celda(g, d);
    setEditando(null);
    if (aIdx < 0) { if (n > 0) onAdd(d, g, n); return; }
    if (n === 0) onRemove(d, aIdx);
    else onSeriesChange(d, aIdx, n);
  };

  const totalSemana = days.reduce((s, d) => s + d.totalSeries, 0);
  const iemDia = (d: DayPlan) => (iemPorSerie ? iemEstimado(d.assignments, iemPorSerie) : null);

  return (
    <div className="bg-surface border border-hairline rounded-surface p-2 sm:p-3 overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 min-w-[460px]">
        <thead>
          <tr>
            <th className="text-left px-2 pb-2 font-mono text-caption font-normal text-ink-3 uppercase tracking-wider border-b border-hairline">Grupo</th>
            {days.map((d, i) => (
              <th key={i} className="px-1 pb-2 font-normal border-b border-hairline">
                <span className="block font-mono text-caption text-ink-2 uppercase tracking-wider">Día {diaDe(i)}</span>
                <span className="block max-w-[90px] mx-auto font-sans text-label font-bold text-ink truncate" title={nombres[i]}>{nombres[i] || '—'}</span>
              </th>
            ))}
            <th className="text-left px-2 pb-2 font-mono text-caption font-normal text-ink-3 uppercase tracking-wider border-b border-hairline" title="Series de la semana · veces por semana · IEM estimado">Semana</th>
          </tr>
        </thead>
        <tbody>
          {filas.map(g => {
            const semana = semanaDe(g);
            const f = frecuencia.get(g);
            const iemG = iemPorSerie ? iemEstimado([{ group: g, series: semana }], iemPorSerie) : null;
            return (
              <tr key={g}>
                <td className="px-2 py-1 border-b border-hairline font-sans text-label font-semibold text-ink whitespace-nowrap">{MUSCLE_LABELS[g]}</td>
                {days.map((_, d) => {
                  const { aIdx, series } = celda(g, d);
                  const clave = `${g}-${d}`;
                  const choque = series > 0 && enChoque(g, d);
                  return (
                    <td
                      key={d}
                      className="p-0.5 border-b border-hairline"
                      onDragOver={e => { if (!traeGrupo(e)) return; e.preventDefault(); setDestino(clave); }}
                      onDragLeave={() => setDestino(v => (v === clave ? null : v))}
                      onDrop={e => {
                        e.preventDefault();
                        setDestino(null);
                        const desde = leerArrastre(e);
                        // Solo dentro de su fila: arrastrar Dorsal a la fila de
                        // Pecho no tiene sentido.
                        if (desde && desde.dia !== d && days[desde.dia]?.assignments[desde.idx]?.group === g) onMove(desde.dia, desde.idx, d);
                      }}
                    >
                      {editando === clave ? (
                        <input
                          autoFocus
                          type="number" min={0} max={25}
                          value={borrador}
                          onChange={e => setBorrador(e.target.value)}
                          onBlur={() => confirmar(g, d)}
                          onKeyDown={e => { if (e.key === 'Enter') confirmar(g, d); if (e.key === 'Escape') setEditando(null); }}
                          aria-label={`Series de ${MUSCLE_LABELS[g]} el día ${diaDe(d)}`}
                          className="h-8 w-full rounded-control border border-accent bg-bg text-center font-mono text-label font-bold text-ink focus:outline-none"
                        />
                      ) : (
                        <button
                          type="button"
                          draggable={series > 0}
                          onDragStart={e => empezarArrastre(e, { dia: d, idx: aIdx })}
                          onClick={() => { setEditando(clave); setBorrador(series > 0 ? String(series) : '3'); }}
                          title={series > 0 ? 'Pulsa para cambiar las series; arrastra a otro día para moverlo' : `Añadir ${MUSCLE_LABELS[g]} el día ${diaDe(d)}`}
                          aria-label={series > 0 ? `${MUSCLE_LABELS[g]}, día ${diaDe(d)}: ${series} series` : `Añadir ${MUSCLE_LABELS[g]} el día ${diaDe(d)}`}
                          className={`group h-8 w-full rounded-control font-mono text-label font-bold transition-colors ${
                            destino === clave ? 'outline outline-1 outline-accent' : ''
                          } ${choque ? 'outline outline-[1.5px] -outline-offset-[1.5px] outline-warning' : ''} ${
                            series > 0 ? (series >= 6 ? 'text-on-accent cursor-grab' : 'text-ink cursor-grab') : 'text-transparent hover:text-accent-ink hover:border hover:border-dashed hover:border-accent-line'
                          }`}
                          style={series > 0 ? { background: fondo(series) } : undefined}
                        >
                          {series > 0 ? series : '+'}
                        </button>
                      )}
                    </td>
                  );
                })}
                <td className="px-2 py-1 border-b border-hairline whitespace-nowrap">
                  {semana > 0 ? (
                    <span className="flex items-center gap-2">
                      <span className="w-6 text-right font-mono text-label font-bold text-ink tabular-nums">{semana}</span>
                      <span className="flex flex-col gap-0.5">
                        <span className="h-1.5 w-12 rounded-full bg-raised overflow-hidden" aria-hidden>
                          <span className="block h-full bg-data" style={{ width: `${(semana / maxSemana) * 100}%` }} />
                        </span>
                        <span className="font-mono text-caption text-ink-3 leading-none">
                          {f ? `${formateaFrecuencia(f.porSemana)}×` : ''}
                          {iemG && iemG.iem > 0 ? ` · ~${Math.round(iemG.iem)}` : ''}
                        </span>
                      </span>
                    </span>
                  ) : <span className="font-mono text-caption text-ink-4">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td className="px-2 pt-2.5 font-mono text-caption text-ink-3 uppercase tracking-wider">Total día</td>
            {days.map((d, i) => {
              const iem = iemDia(d);
              return (
                <td key={i} className="px-1 pt-2.5 text-center font-mono text-caption text-ink-3 whitespace-nowrap">
                  <span className="block text-label font-bold text-ink">{d.totalSeries}</span>
                  {d.totalSeries > 0 && <>~{minutosEstimados(d.totalSeries)}′{iem && iem.iem > 0 && <> · ~{Math.round(iem.iem)}</>}</>}
                </td>
              );
            })}
            <td className="px-2 pt-2.5 font-mono text-caption text-ink-3 whitespace-nowrap">
              <span className="text-label font-bold text-ink">{totalSemana}</span> series/sem
            </td>
          </tr>
        </tfoot>
      </table>
      {sinSeries.length > 0 && (
        <button
          type="button"
          onClick={() => setVerVacios(v => !v)}
          className="mt-2 ml-2 inline-flex items-center gap-1 font-mono text-caption text-ink-3 hover:text-ink"
        >
          <Icon name={verVacios ? 'expand_less' : 'expand_more'} size="s" />
          {verVacios ? 'Ocultar' : 'Mostrar'} los {sinSeries.length} grupos sin series
        </button>
      )}
    </div>
  );
}
