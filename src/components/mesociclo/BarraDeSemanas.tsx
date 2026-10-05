import React, { useState } from 'react';
import { Icon, SegmentedControl, Button, Select } from '../ui';
import type { EventoDeSemana, TipoEventoSemana } from '../../types';

export type Alcance = 'desde' | 'solo' | 'alternar';

const EVENTOS: { value: '' | TipoEventoSemana; label: string; corto: string }[] = [
  { value: '', label: 'Sin evento', corto: '' },
  { value: 'vacaciones', label: 'Vacaciones', corto: 'V' },
  { value: 'viaje', label: 'Viaje', corto: 'Vj' },
  { value: 'competicion', label: 'Competición', corto: 'C' },
  { value: 'otro', label: 'Otro', corto: 'E' },
];

export interface AvisoDeSemana { tono: 'peligro' | 'aviso'; texto: string }

export interface ElementoProgramado {
  semana: number;
  solo: boolean;
  /** "Curl de bíceps: Top set 1×6-8 + Back-off 3×12-15" */
  texto: string;
  tipo: 'cambio' | 'descarga';
  /** Para quitarlo: qué ejercicio (clave de día + índice). Ausente en la descarga. */
  clave?: string;
}

interface Props {
  vueltas: number;
  semana: number;
  /** Semana de ciclo en la que está hoy el atleta (ausente antes o después del bloque). */
  actual?: number;
  onSemana: (s: number) => void;
  alcance: Alcance;
  onAlcance: (a: Alcance) => void;
  /** Series totales por semana; índice 0 = base. */
  totales: number[];
  /** Series hechas de verdad por semana (índice 1..vueltas); null = aún no ha llegado. */
  reales?: (number | null)[];
  semanasConCambio: Set<number>;
  descargas: number[];
  tests: number[];
  onTest: (semanas: number[], activar: boolean) => void;
  eventos: Record<string, EventoDeSemana>;
  onEvento: (semana: number, evento: EventoDeSemana | undefined) => void;
  onProgresiones: () => void;
  /** Abre «Planificar progresión» (unos pocos ejercicios, semana a semana). */
  onPlanificar?: () => void;
  onGuardarPlantilla?: () => void;
  avisos: Record<number, AvisoDeSemana[]>;
  /** Cuestionarios puntuales que caen en cada semana (revisión de semana N, mediciones…). */
  revisiones?: Record<number, string[]>;
  nota: string;
  onNota: (texto: string) => void;
  onDescarga: (semanas: number[], activar: boolean) => void;
  onQuitarCambios: (semanas: number[]) => void;
  onComparar: () => void;
  puedeDeshacer: boolean;
  onDeshacer: () => void;
  programado: ElementoProgramado[];
  onQuitarProgramado: (e: ElementoProgramado) => void;
  /** `deloadWeek` marcada en el calendario de un mesociclo anterior a esto,
   *  que todavía no baja el volumen. */
  descargaSoloCalendario?: number;
}

/** Barra de semanas de ciclo del mesociclo: elegir la semana que se edita,
 *  ver de un vistazo el volumen de cada una (planificado y, en las pasadas,
 *  el hecho) y programar descargas y cambios. */
export default function BarraDeSemanas(p: Props) {
  const [varias, setVarias] = useState(false);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [notaAbierta, setNotaAbierta] = useState(false);

  const max = Math.max(1, ...p.totales, ...(p.reales ?? []).map(r => r ?? 0));
  const alto = (v: number) => Math.max(3, Math.round(30 * v / max));
  const semanas = Array.from({ length: p.vueltas + 1 }, (_, i) => i);
  const selOrdenada = [...sel].sort((a, b) => a - b);
  const esDescarga = (s: number) => p.descargas.includes(s);
  const esTest = (s: number) => p.tests.includes(s);
  const evento = p.eventos[String(p.semana)];

  const pulsar = (s: number) => {
    if (!varias) { p.onSemana(s); return; }
    if (s === 0) return;
    setSel(prev => { const n = new Set(prev); if (n.has(s)) n.delete(s); else n.add(s); return n; });
  };

  return (
    <div className="space-y-3">
      <div className="bg-surface border border-hairline rounded-surface px-4 py-3 space-y-3">
        <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
          <p className="font-sans font-bold text-body-s text-ink">Semanas del bloque</p>
          <p className="font-mono text-caption text-ink-3">
            {p.vueltas} semanas de ciclo · barras = series de la semana{p.reales ? ' · relleno = hechas' : ''}
          </p>
          {p.actual !== undefined && (
            <span className="inline-flex items-center rounded-chip bg-accent px-2 py-0.5 font-mono text-caption font-bold uppercase tracking-wider text-on-accent">
              Esta semana: S{p.actual}
            </span>
          )}
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2 [&_button]:whitespace-nowrap">
            {p.puedeDeshacer && (
              <Button size="s" variant="ghost" icon="undo" onClick={p.onDeshacer}>Deshacer</Button>
            )}
            {p.onPlanificar && (
              <Button size="s" variant="secondary" icon="tune" onClick={p.onPlanificar}>Planificar progresión</Button>
            )}
            <Button size="s" variant="ghost" icon="trending_up" onClick={p.onProgresiones}>Progresiones</Button>
            <Button size="s" variant="ghost" icon="swap_horiz" onClick={p.onComparar}>Comparar</Button>
            {p.onGuardarPlantilla && (
              <Button size="s" variant="ghost" icon="library_books" onClick={p.onGuardarPlantilla}>Guardar como plantilla</Button>
            )}
            <button
              type="button"
              aria-pressed={varias}
              onClick={() => { setVarias(v => !v); setSel(new Set(!varias && p.semana > 0 ? [p.semana] : [])); }}
              className={`inline-flex items-center gap-1.5 rounded-chip border px-2.5 py-1.5 font-mono text-caption font-bold uppercase tracking-wider transition-colors ${
                varias ? 'border-accent text-accent-ink bg-accent/12' : 'border-hairline text-ink-2 hover:text-ink hover:border-strong'}`}
            >
              <Icon name="done_all" size="s" />
              Varias semanas
            </button>
          </div>
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Semanas del bloque">
          {semanas.map(s => {
            const activa = varias ? sel.has(s) : p.semana === s;
            const real = s > 0 ? p.reales?.[s] ?? null : null;
            const avisos = p.avisos[s] ?? [];
            const peor = avisos.some(a => a.tono === 'peligro') ? 'peligro' : avisos.length ? 'aviso' : null;
            const titulo = [
              s === 0 ? 'Base del bloque' : `Semana ${s}`,
              s === p.actual ? 'esta semana' : null,
              `${p.totales[s] ?? 0} series planificadas`,
              real !== null ? `${real} hechas` : null,
              esDescarga(s) ? 'Descarga' : null,
              esTest(s) ? 'Semana de test' : null,
              ...(p.revisiones?.[s] ?? []).map(r => `Revisión: ${r}`),
              p.eventos[String(s)] ? `${EVENTOS.find(e => e.value === p.eventos[String(s)].tipo)?.label}${p.eventos[String(s)].nota ? `: ${p.eventos[String(s)].nota}` : ''}` : null,
              ...avisos.map(a => a.texto),
            ].filter(Boolean).join(' · ');
            return (
              <button
                key={s}
                type="button"
                aria-pressed={activa}
                aria-current={s === p.actual ? 'date' : undefined}
                title={titulo}
                onClick={() => pulsar(s)}
                disabled={varias && s === 0}
                className={`relative flex-1 min-w-[3.25rem] max-w-[5rem] flex flex-col items-center gap-1 rounded-control border px-1 pt-1.5 pb-1 transition-colors disabled:opacity-40 ${
                  activa
                    ? `bg-accent/12 border-accent ${varias ? 'border-dashed' : ''}`
                    : s === p.actual ? 'bg-bg border-accent-line hover:border-accent' : 'bg-bg border-hairline hover:border-strong'}`}
              >
                <span className="absolute top-1 right-1 flex gap-0.5">
                  {p.semanasConCambio.has(s) && <span className="w-1.5 h-1.5 rounded-full bg-accent" aria-hidden />}
                  {peor && <span className={`w-1.5 h-1.5 rounded-full ${peor === 'peligro' ? 'bg-danger' : 'bg-warning'}`} aria-hidden />}
                </span>
                <span className={`font-mono text-caption font-bold ${s === p.actual ? 'rounded-[5px] bg-accent px-1 text-on-accent' : 'text-ink'}`}>{s === 0 ? 'Base' : `S${s}`}</span>
                <span className="relative w-5 h-[30px] flex items-end justify-center" aria-hidden>
                  <span
                    className={`absolute bottom-0 w-full rounded-t-[4px] ${real !== null ? 'border border-strong bg-transparent' : esDescarga(s) ? 'bg-info/60' : activa ? 'bg-accent' : 'bg-strong'}`}
                    style={{ height: alto(p.totales[s] ?? 0) }}
                  />
                  {real !== null && (
                    <span
                      className={`absolute bottom-0 w-full rounded-t-[4px] ${real >= (p.totales[s] ?? 0) ? 'bg-success/70' : 'bg-warning/70'}`}
                      style={{ height: alto(real) }}
                    />
                  )}
                </span>
                <span className="font-mono text-[10px] leading-none text-ink-3 tabular-nums">
                  {real !== null ? `${real}/${p.totales[s] ?? 0}` : p.totales[s] ?? 0}
                </span>
                {(esDescarga(s) || esTest(s) || p.eventos[String(s)] || p.revisiones?.[s]?.length) && (
                  <span className="flex gap-0.5">
                    {esDescarga(s) && <span className="font-mono text-[9px] leading-[11px] font-bold text-info border border-info rounded-[5px] px-0.5">D</span>}
                    {esTest(s) && <span className="font-mono text-[9px] leading-[11px] font-bold text-warning border border-warning rounded-[5px] px-0.5">T</span>}
                    {!!p.revisiones?.[s]?.length && <span className="font-mono text-[9px] leading-[11px] font-bold text-success border border-success rounded-[5px] px-0.5">R</span>}
                    {p.eventos[String(s)] && (
                      <span className="font-mono text-[9px] leading-[11px] font-bold text-accent-ink border border-accent-line rounded-[5px] px-0.5">
                        {EVENTOS.find(e => e.value === p.eventos[String(s)].tipo)?.corto}
                      </span>
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {p.descargaSoloCalendario !== undefined && !p.descargas.includes(p.descargaSoloCalendario) && (
          <div className="flex items-center gap-2 flex-wrap font-sans text-caption text-ink-2">
            <Icon name="info" size="s" className="text-info" />
            <span>La semana {p.descargaSoloCalendario} está marcada como descarga en el calendario, pero no baja el volumen.</span>
            <button type="button" onClick={() => p.onDescarga([p.descargaSoloCalendario!], true)} className="font-bold text-accent-ink hover:text-ink">
              Aplicar descarga
            </button>
          </div>
        )}
      </div>

      {varias ? (
        <div className="flex items-center gap-3 flex-wrap rounded-surface border border-accent-line bg-accent/8 px-4 py-3">
          <p className="font-sans font-bold text-body-s text-ink">
            {sel.size === 0 ? 'Elige semanas en la barra' : `${sel.size} semana${sel.size === 1 ? '' : 's'}: ${selOrdenada.map(s => `S${s}`).join(', ')}`}
          </p>
          <div className="ml-auto flex gap-2 flex-wrap">
            <Button size="s" icon="trending_down" disabled={sel.size === 0} onClick={() => p.onDescarga(selOrdenada, true)}>Marcar descarga</Button>
            <Button size="s" variant="ghost" disabled={sel.size === 0} onClick={() => p.onDescarga(selOrdenada, false)}>Quitar descarga</Button>
            <Button size="s" variant="ghost" icon="flag" disabled={sel.size === 0} onClick={() => p.onTest(selOrdenada, !selOrdenada.every(esTest))}>
              {sel.size > 0 && selOrdenada.every(esTest) ? 'Quitar test' : 'Marcar test'}
            </Button>
            <Button size="s" variant="ghost" icon="refresh" disabled={sel.size === 0} onClick={() => p.onQuitarCambios(selOrdenada)}>Quitar cambios</Button>
          </div>
        </div>
      ) : p.semana === 0 ? (
        <div className="rounded-surface border border-hairline bg-surface px-4 py-3">
          <p className="font-sans text-label text-ink-2">
            <span className="font-bold text-ink">Base del bloque.</span> Lo que cambies aquí se repite todas las semanas, salvo donde hayas programado otra cosa.
            Para cambiar algo a partir de una semana, elígela arriba.
          </p>
        </div>
      ) : (
        <div className="rounded-surface border border-accent-line bg-accent/8 px-4 py-3 space-y-2.5">
          <div className="flex items-center gap-3 flex-wrap">
            <p className="font-sans font-extrabold text-title-s text-accent-ink">Semana {p.semana}</p>
            <SegmentedControl
              className="shrink-0 min-w-[15rem]"
              label="Alcance del cambio"
              value={p.alcance}
              onChange={v => p.onAlcance(v as Alcance)}
              options={[
                { value: 'desde', label: `Desde S${p.semana}` },
                { value: 'solo', label: `Solo S${p.semana}` },
                ...(p.semana + 2 <= p.vueltas ? [{ value: 'alternar', label: `S${p.semana}, S${p.semana + 2}…` }] : []),
              ]}
            />
            <div className="ml-auto flex gap-2 flex-wrap">
              <button
                type="button"
                aria-pressed={esDescarga(p.semana)}
                onClick={() => p.onDescarga([p.semana], !esDescarga(p.semana))}
                className={`inline-flex items-center gap-1.5 rounded-control border px-3 py-1.5 font-sans text-label font-bold transition-colors ${
                  esDescarga(p.semana) ? 'border-info text-info bg-info/10' : 'border-hairline text-ink-2 hover:text-ink hover:border-strong'}`}
              >
                <Icon name="trending_down" size="s" />
                {esDescarga(p.semana) ? 'Descarga activada' : 'Semana de descarga'}
              </button>
              <button
                type="button"
                aria-pressed={esTest(p.semana)}
                onClick={() => p.onTest([p.semana], !esTest(p.semana))}
                className={`inline-flex items-center gap-1.5 rounded-control border px-3 py-1.5 font-sans text-label font-bold transition-colors ${
                  esTest(p.semana) ? 'border-warning text-warning bg-warning/10' : 'border-hairline text-ink-2 hover:text-ink hover:border-strong'}`}
              >
                <Icon name="flag" size="s" />
                {esTest(p.semana) ? 'Test activado' : 'Semana de test'}
              </button>
              <Button size="s" variant="ghost" icon="sticky_note_2" onClick={() => setNotaAbierta(o => !o)}>
                {p.nota ? 'Nota ·' : 'Nota'}
              </Button>
              <Button size="s" variant="ghost" icon="refresh" onClick={() => p.onQuitarCambios([p.semana])}>Quitar cambios</Button>
            </div>
          </div>
          <p className="font-sans text-caption text-ink-2">
            {p.alcance === 'desde'
              ? `Lo que toques se queda así desde la semana ${p.semana} hasta que programes otro cambio.`
              : p.alcance === 'solo'
                ? `Lo que toques vale solo para la semana ${p.semana}; la ${p.semana + 1} vuelve a lo anterior.`
                : `Lo que toques se aplica en semanas alternas (S${p.semana}, S${p.semana + 2}…): rotación A/B, por ejemplo otra variante del ejercicio.`}
            {esDescarga(p.semana) && ' Es semana de descarga: el atleta hace la mitad de series de lo que ves aquí.'}
            {esTest(p.semana) && ' Semana de test: los ejercicios sin técnica van a AMRAP.'}
          </p>
          <div className="flex items-end gap-2 flex-wrap">
            <Select
              label="Evento de la semana"
              value={evento?.tipo ?? ''}
              options={EVENTOS.map(e => ({ value: e.value, label: e.label }))}
              onChange={v => p.onEvento(p.semana, v ? { tipo: v as TipoEventoSemana, ...(evento?.nota ? { nota: evento.nota } : {}) } : undefined)}
              className="w-44"
            />
            {evento && (
              <input
                id={`evento-semana-${p.semana}`}
                value={evento.nota ?? ''}
                onChange={e => p.onEvento(p.semana, { tipo: evento.tipo, ...(e.target.value ? { nota: e.target.value } : {}) })}
                placeholder="Lo que leerá el atleta (p. ej. «entrena en el hotel lo que puedas»)"
                aria-label="Nota del evento para el atleta"
                className="flex-1 min-w-[14rem] h-10 bg-surface border border-hairline rounded-control px-3 font-sans text-label text-ink placeholder-ink-3 focus:outline-none focus:ring-1 focus:ring-accent"
              />
            )}
          </div>
          {(notaAbierta || p.nota) && (
            <textarea
              id={`nota-semana-${p.semana}`}
              value={p.nota}
              onChange={e => p.onNota(e.target.value)}
              placeholder={`Por qué cambias esto en la semana ${p.semana} (solo lo ves tú)`}
              rows={2}
              className="w-full bg-surface border border-hairline rounded-control px-3 py-2 font-sans text-label text-ink placeholder-ink-3 focus:outline-none focus:ring-1 focus:ring-accent resize-y"
            />
          )}
          {(p.revisiones?.[p.semana] ?? []).length > 0 && (
            <p className="flex items-center gap-1.5 font-sans text-caption text-success">
              <Icon name="checklist" size="s" />Esta semana le toca: {(p.revisiones?.[p.semana] ?? []).join(', ')}
            </p>
          )}
          {(p.avisos[p.semana] ?? []).map((a, i) => (
            <p key={i} className={`flex items-center gap-1.5 font-sans text-caption ${a.tono === 'peligro' ? 'text-danger' : 'text-warning'}`}>
              <Icon name="warning" size="s" />{a.texto}
            </p>
          ))}
        </div>
      )}

      {p.programado.length > 0 && (
        <details className="bg-surface border border-hairline rounded-surface px-4 py-2.5 group/prog">
          <summary className="cursor-pointer list-none flex items-center gap-2 font-sans font-bold text-label text-ink">
            <Icon name="event_note" size="s" className="text-accent-ink" />
            Programado en el bloque · {p.programado.length}
            <Icon name="expand_more" size="s" className="ml-auto text-ink-3 transition-transform group-open/prog:rotate-180" />
          </summary>
          <ul className="mt-2 space-y-0.5">
            {p.programado.map((e, i) => (
              <li key={i} className="grid grid-cols-[4.5rem_1fr_auto] gap-2 items-center rounded-control px-2 py-1.5 hover:bg-inset">
                <button type="button" onClick={() => { setVarias(false); p.onSemana(e.semana); }}
                  className={`text-left font-mono text-caption font-bold ${e.tipo === 'descarga' ? 'text-info' : 'text-accent-ink'}`}>
                  {e.solo ? `Solo S${e.semana}` : `Desde S${e.semana}`}
                </button>
                <button type="button" onClick={() => { setVarias(false); p.onSemana(e.semana); }} className="text-left font-sans text-label text-ink-2 min-w-0">
                  {e.texto}
                </button>
                <button type="button" onClick={() => p.onQuitarProgramado(e)} aria-label="Quitar esto" title="Quitar esto"
                  className="p-1 text-ink-3 hover:text-danger transition-colors">
                  <Icon name="close" size="s" />
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
