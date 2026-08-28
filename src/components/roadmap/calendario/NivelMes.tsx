import React, { useState } from 'react';
import { Mesocycle, Roadmap, WorkoutAssignment, TaskItem } from '../../../types';
import {
  DiaCalendario, BandaEntreno, BandaNutricion, recortarAlMes,
  hitosDelMes, objetivosSinFecha,
} from '../../../utils/roadmapCalendar';
import { PlanEvent, PlanConflict } from '../../../utils/planEvents';
import { mesocycleWeekNumber, diasDeCiclo } from '../../../utils/progression';
import { addDays } from '../../../utils/trainingWeek';
import { mezcla } from './paleta';
import { Filtro } from './RoadmapCalendario';
import CarrilVolumen from './CarrilVolumen';
import { CarrilVolumen as DatosCarrilVolumen } from '../../../utils/accionesCalendario';
import CeldaDia from './CeldaDia';
import { Icon } from '../../ui';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MESES_CORTO = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const DIAS_SEMANA = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];
const FILTROS: Filtro[] = ['Todo', 'Entrenos', 'Nutrición', 'Hitos'];

function fmtSeg(fecha: string): string {
  const [, m, d] = fecha.split('-');
  return `${Number(d)} ${MESES_CORTO[Number(m) - 1]}`;
}

interface Props {
  anio: number;
  mes: number;
  hoy: string;
  bandasEntreno: BandaEntreno[];
  bandasNutricion: BandaNutricion[];
  indice: Map<string, DiaCalendario>;
  filter: Filtro;
  sel: string | null;
  roadmap: Roadmap;
  mesocycles: Mesocycle[];
  workoutAssignments: WorkoutAssignment[];
  tasks: TaskItem[];
  onFilterChange: (f: Filtro) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onBackToYear: () => void;
  onOpenDay: (fecha: string) => void;
  onOpenTemplateModal: (mesocycleId: string) => void;
  activeQuestionnaireCount: number;
  volumeEvents: PlanEvent[];
  conflicts: PlanConflict[];
  onMoveWorkoutAssignment: (assignmentId: string, newDate: string) => void | Promise<void>;
  onMoveTask: (taskId: string, newDate: string) => void | Promise<void>;
  onMoveVolumeEvent: (workoutId: string, exerciseId: string, oldAtWeek: number, newAtWeek: number) => void | Promise<void>;
  onEditFaseEntreno: (banda: BandaEntreno) => void;
  onEditFaseNutricion: (banda: BandaNutricion) => void;
  /** Volumen planificado del mes, por grupo y semana. */
  carrilVolumen: DatosCarrilVolumen;
  /** Abre el hub de acciones sobre una semana entera. */
  onOpenWeek: (semana: { inicio: string; fin: string; etiqueta: string }) => void;
}

function CarrilFase({ icono, label, segmentos, onEditar }: { icono: string; label: string; segmentos: ReturnType<typeof recortarAlMes<BandaEntreno | BandaNutricion>>; onEditar: (banda: BandaEntreno | BandaNutricion) => void }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5 font-sans text-label font-semibold text-ink-2" style={{ width: 92, flexShrink: 0 }}>
        <Icon name={icono} size="s" />{label}
      </div>
      <div className="flex-1 relative" style={{ height: 36 }}>
        {segmentos.map(s => {
          const mostrarTexto = s.widthPct > 12;
          const rango = `${s.entraAntes ? '← ' : ''}${fmtSeg(s.banda.inicio)} — ${fmtSeg(s.banda.fin)}${s.sigueDespues ? ' →' : ''}`;
          return (
            <button
              type="button"
              key={s.banda.id}
              onClick={() => onEditar(s.banda)}
              title={`${s.banda.nombre} · ${rango} · clic para editar duración`}
              style={{
                position: 'absolute', top: 0, bottom: 0, left: `${s.leftPct}%`, width: `calc(${s.widthPct}% - 3px)`,
                display: 'flex', alignItems: 'center', gap: 8, padding: '0 11px', overflow: 'hidden', cursor: 'pointer',
                color: 'var(--color-ink)', background: mezcla(s.banda.color, 9), border: `1px solid ${mezcla(s.banda.color, 20)}`,
                borderRadius: `${s.entraAntes ? 4 : 12}px ${s.sigueDespues ? 4 : 12}px ${s.sigueDespues ? 4 : 12}px ${s.entraAntes ? 4 : 12}px`,
              }}
            >
              <Icon name={s.banda.icono} size="s" style={{ color: s.banda.color, flexShrink: 0 }} />
              {mostrarTexto && (
                <div className="flex flex-col gap-0.5 min-w-0 overflow-hidden items-start">
                  <span className="font-sans font-bold text-[12.5px] whitespace-nowrap" style={{ letterSpacing: '-0.01em' }}>{s.banda.nombre}</span>
                  <span className="font-mono text-caption opacity-60 whitespace-nowrap">{rango}</span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function NivelMes({
  anio, mes, hoy, bandasEntreno, bandasNutricion, indice, filter, sel, roadmap, mesocycles,
  workoutAssignments, tasks, onFilterChange, onPrevMonth, onNextMonth, onBackToYear, onOpenDay,
  onOpenTemplateModal, activeQuestionnaireCount, volumeEvents, conflicts, onMoveWorkoutAssignment, onMoveTask,
  onMoveVolumeEvent, onEditFaseEntreno, onEditFaseNutricion, carrilVolumen, onOpenWeek,
}: Props) {
  const [dragOverFecha, setDragOverFecha] = useState<string | null>(null);
  const volumeEventPorFecha = new Map(volumeEvents.map(e => [e.date, e]));
  const conflictosDelMes = conflicts.filter(c => {
    const [cy, cm] = c.weekStart.split('-').map(Number);
    return cy === anio && cm - 1 === mes;
  });

  const laneTrain = recortarAlMes(bandasEntreno, anio, mes);
  const laneNutri = recortarAlMes(bandasNutricion, anio, mes);
  const monthMils = hitosDelMes(indice, anio, mes, 99);
  const sinFecha = objetivosSinFecha(roadmap.items);
  const mesocycleDelMes = mesocycles.find(m => {
    const fin = new Date(m.startDate + 'T00:00:00'); fin.setDate(fin.getDate() + m.weeks * 7);
    const inicioMes = new Date(anio, mes, 1), finMes = new Date(anio, mes + 1, 0);
    return new Date(m.startDate + 'T00:00:00') <= finMes && fin >= inicioMes;
  });

  const asignacionesPorFecha = new Map<string, WorkoutAssignment>();
  for (const a of workoutAssignments) if (!asignacionesPorFecha.has(a.date)) asignacionesPorFecha.set(a.date, a);
  const tareaPorFecha = new Map<string, TaskItem>();
  for (const t of tasks) if (t.dueDate && !tareaPorFecha.has(t.dueDate)) tareaPorFecha.set(t.dueDate, t);

  function handleDrop(e: React.DragEvent, fechaDestino: string) {
    e.preventDefault();
    setDragOverFecha(null);
    const raw = e.dataTransfer.getData('text/plain');
    if (!raw) return;
    try {
      const data = JSON.parse(raw) as { tipo: 'entreno' | 'hito' | 'volumen'; id: string };
      if (data.tipo === 'entreno') onMoveWorkoutAssignment(data.id, fechaDestino);
      else if (data.tipo === 'hito') onMoveTask(data.id, fechaDestino);
      else {
        // 'volumen': `id` lleva el propio evento serializado — reprogramar
        // reescribe el `atWeek` de la regla que lo originó, no una fecha suelta
        // (mismo criterio que RoadmapTimeline.handleMoveVolumeRule).
        const ev = volumeEvents.find(v => v.id === data.id);
        if (!ev?.moveRef) return;
        const meso = mesocycles.find(m => m.id === ev.moveRef!.mesocycleId);
        if (!meso) return;
        const nuevaSemana = mesocycleWeekNumber(meso.startDate, fechaDestino, diasDeCiclo(meso.daysPerWeek, meso.cycleDays));
        if (nuevaSemana !== ev.moveRef.atWeek) onMoveVolumeEvent(ev.moveRef.workoutId, ev.moveRef.exerciseId, ev.moveRef.atWeek, nuevaSemana);
      }
    } catch { /* dataTransfer ajeno — ignorar */ }
  }

  return (
    <div className="space-y-3.5" style={{ animation: 'fade-up 260ms cubic-bezier(0.2,0.8,0.2,1) both' }}>
    <div className="flex flex-col xl:flex-row gap-3.5 items-start">
      <div className="flex-1 min-w-0 bg-surface border border-hairline rounded-surface px-5 pt-[18px] pb-[22px] w-full">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-3.5 flex-wrap">
            <button type="button" onClick={onBackToYear} className="flex items-center gap-1.5 text-label text-ink-3 hover:text-white transition-colors">
              <Icon name="grid_view" size="s" />Año
            </button>
            <div className="w-px h-[18px] bg-hairline" />
            <button type="button" onClick={onPrevMonth} disabled={mes === 0} className="w-8 h-8 rounded-control bg-inset flex items-center justify-center text-ink-2 hover:text-white disabled:opacity-30 transition-colors">
              <Icon name="chevron_left" size="s" />
            </button>
            <span className="font-sans font-extrabold text-title-l text-white" style={{ letterSpacing: '-0.02em', minWidth: 150 }}>{MESES[mes]} {anio}</span>
            <button type="button" onClick={onNextMonth} disabled={mes === 11} className="w-8 h-8 rounded-control bg-inset flex items-center justify-center text-ink-2 hover:text-white disabled:opacity-30 transition-colors">
              <Icon name="chevron_right" size="s" />
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-caption text-ink-4 font-sans mr-1">
              {filter === 'Todo' ? 'Vista resumen · toca un filtro para ver el detalle diario' : `Vista detallada · ${filter.toLowerCase()}`}
            </span>
            {FILTROS.map(f => (
              <button
                key={f} type="button" onClick={() => onFilterChange(f)}
                className="rounded-control text-[12.5px] font-sans transition-colors"
                style={{
                  padding: '6px 13px',
                  background: filter === f ? 'var(--color-track)' : 'transparent',
                  color: filter === f ? 'var(--color-ink)' : 'var(--color-ink-3)',
                  fontWeight: filter === f ? 600 : 400,
                  border: filter === f ? undefined : '1px solid var(--color-hairline)',
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5 bg-raised border border-hairline rounded-field px-3.5 py-3">
          <CarrilFase icono="fitness_center" label="Entreno" segmentos={laneTrain} onEditar={onEditFaseEntreno} />
          <CarrilFase icono="restaurant" label="Nutrición" segmentos={laneNutri} onEditar={onEditFaseNutricion} />
        </div>

        <div className="grid gap-2 my-4" style={{ gridTemplateColumns: '36px repeat(7,1fr)' }}>
          <div />
          {DIAS_SEMANA.map(d => (
            <div key={d} className="font-mono text-caption tracking-[0.10em] text-ink-4 text-center">{d}</div>
          ))}
        </div>

        {/* Una fila por semana, con su propio botón de "programar la semana
            entera" en el margen. Antes era una rejilla plana de 7 columnas con
            huecos delante; por semanas se puede colgar algo de cada fila. */}
        <div className="flex flex-col gap-2">
        {carrilVolumen.semanas.map(semana => (
        <div key={semana.inicio} className="grid gap-2" style={{ gridTemplateColumns: '36px repeat(7,1fr)' }}>
          {/* Se pintaba en `ink-5` y sobre el fondo del mes no se veía: ahora
              es una pastilla con borde, como los chevrons de la cabecera. */}
          <button
            type="button"
            onClick={() => onOpenWeek(semana)}
            title={`Programar la semana del ${semana.etiqueta}`}
            aria-label={`Programar la semana del ${semana.etiqueta}`}
            className="w-8 h-8 self-center rounded-control bg-inset border border-hairline flex items-center justify-center text-ink-2 hover:text-accent hover:border-accent-line transition-colors"
          >
            <Icon name="bolt" size="s" />
          </button>
          {Array.from({ length: 7 }, (_, i) => addDays(semana.inicio, i)).map(fecha => {
            if (fecha.slice(0, 7) !== `${anio}-${String(mes + 1).padStart(2, '0')}`) return <div key={fecha} />;
            const asignacion = asignacionesPorFecha.get(fecha);
            const tarea = tareaPorFecha.get(fecha);
            const volEvent = volumeEventPorFecha.get(fecha);
            // Un entreno o un hito manda sobre el marcador de volumen si
            // coinciden en el mismo día — la celda solo arrastra una cosa.
            const draggable = !!asignacion || !!tarea || (!!volEvent?.moveRef);
            return (
              <CeldaDia
                key={fecha} fecha={fecha} dia={indice.get(fecha)} filter={filter} hoy={hoy}
                selected={sel === fecha} onOpen={() => onOpenDay(fecha)}
                draggable={draggable}
                dragOver={dragOverFecha === fecha}
                marcadorVolumen={volEvent ? { titulo: volEvent.title, cumplida: volEvent.status !== 'programado' } : null}
                onDragStart={e => {
                  if (asignacion) e.dataTransfer.setData('text/plain', JSON.stringify({ tipo: 'entreno', id: asignacion.id }));
                  else if (tarea) e.dataTransfer.setData('text/plain', JSON.stringify({ tipo: 'hito', id: tarea.id }));
                  else if (volEvent?.moveRef) e.dataTransfer.setData('text/plain', JSON.stringify({ tipo: 'volumen', id: volEvent.id }));
                }}
                onDragOver={e => { e.preventDefault(); setDragOverFecha(fecha); }}
                onDrop={e => handleDrop(e, fecha)}
              />
            );
          })}
        </div>
        ))}
        </div>
      </div>

      <div className="w-full xl:w-[312px] flex-shrink-0 flex flex-col gap-3.5">
        <div className="bg-surface border border-hairline rounded-surface px-5 py-[18px]">
          <p className="font-mono text-caption uppercase tracking-wider text-ink-3 mb-3.5">Cumplimiento</p>
          <div className="flex flex-col gap-2.5">
            {[
              { c: 'var(--color-success)', bg: 'rgba(62,207,142,0.18)', icon: 'check', l: 'Entreno hecho' },
              { c: 'var(--color-warning)', bg: 'rgba(253,186,116,0.15)', icon: 'remove', l: 'Parcial' },
              { c: 'var(--color-danger)', bg: 'rgba(255,90,78,0.14)', icon: 'close', l: 'Saltado' },
              { c: 'var(--color-ink-3)', bg: 'transparent', icon: 'bedtime', l: 'Descanso planificado' },
            ].map(s => (
              <div key={s.l} className="flex items-center gap-2.5 text-label font-sans">
                <span className="flex items-center justify-center flex-shrink-0" style={{ width: 22, height: 22, borderRadius: 11, border: `1.5px solid ${s.c}`, background: s.bg }}>
                  <Icon name={s.icon} style={{ fontSize: 13, color: s.c }} />
                </span>
                {s.l}
              </div>
            ))}
            <div className="flex items-center gap-2.5 text-label font-sans">
              <span style={{ width: 22, height: 22, borderRadius: 11, border: '1.5px dashed rgba(245,245,244,0.24)', flexShrink: 0 }} />
              Planificado (futuro)
            </div>
          </div>
          <div className="h-px bg-hairline my-4" />
          <div className="flex flex-col gap-2.5">
            {[
              { c: 'var(--color-phase-fuerza)', l: 'Entreno' },
              { c: 'var(--color-success)', l: 'Nutrición en objetivo' },
              { c: 'var(--color-cat-cardio)', l: 'Cardio' },
              { c: 'var(--color-ink-2)', l: 'Peso registrado' },
            ].map(s => (
              <div key={s.l} className="flex items-center gap-2.5 text-label font-sans">
                <span style={{ width: 8, height: 8, borderRadius: 4, background: s.c, flexShrink: 0 }} />{s.l}
              </div>
            ))}
          </div>
          <div className="h-px bg-hairline my-4" />
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2.5 text-label font-sans">
              <span className="flex gap-0.5 flex-shrink-0" style={{ width: 22, height: 3, borderRadius: 2, overflow: 'hidden' }}>
                <span style={{ flex: 1, background: 'var(--color-phase-mant)' }} /><span style={{ flex: 1, background: 'var(--color-phase-hiper)' }} />
              </span>
              Fase del día: entreno · nutrición
            </div>
            <div className="flex items-center gap-2.5 text-label font-sans">
              <Icon name="flag" size="s" style={{ color: 'var(--color-accent)', width: 22, textAlign: 'center', flexShrink: 0 }} />
              Día destacado (cambio de fase o fecha clave)
            </div>
          </div>
        </div>

        {conflictosDelMes.length > 0 && (
          <div className="bg-surface border border-hairline rounded-surface px-5 py-[18px]">
            <p className="font-mono text-caption uppercase tracking-wider text-ink-3 mb-3.5">Avisos</p>
            <div className="flex flex-col gap-3">
              {conflictosDelMes.map((c, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <Icon name="warning" size="s" filled style={{ color: 'var(--color-danger)', marginTop: 1, flexShrink: 0 }} />
                  <span className="text-[12.5px] text-ink-2 font-sans leading-relaxed">{c.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-surface border border-hairline rounded-surface px-5 py-[18px]">
          <p className="font-mono text-caption uppercase tracking-wider text-ink-3 mb-3.5">Hitos del mes</p>
          {monthMils.length === 0 && <p className="text-caption text-ink-4 font-sans">Ninguno este mes.</p>}
          <div className="flex flex-col gap-3">
            {monthMils.map(({ fecha, hito }) => (
              <button key={hito.id} type="button" onClick={() => onOpenDay(fecha)} className="flex items-center gap-2.5 text-left">
                <span className="flex items-center justify-center flex-shrink-0" style={{ width: 30, height: 30, borderRadius: 12, background: 'rgba(255,199,44,0.12)' }}>
                  <Icon name={hito.icono} size="s" style={{ color: 'var(--color-accent)' }} />
                </span>
                <span className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-label font-semibold font-sans text-white truncate">{hito.titulo}</span>
                  <span className="font-mono text-caption text-ink-4">{fmtSeg(fecha)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-surface border border-hairline rounded-surface px-5 py-[18px]">
          <div className="flex items-center justify-between mb-3">
            <p className="font-mono text-caption uppercase tracking-wider text-ink-3">Cuestionarios</p>
            {activeQuestionnaireCount > 0 && (
              <span className="font-mono text-caption text-success">{activeQuestionnaireCount} activos</span>
            )}
          </div>
          <p className="text-label text-ink-2 font-sans mb-3.5 leading-relaxed">
            Aplica una plantilla al mesociclo de este mes para programar de golpe check-ins, mediciones y revisiones.
          </p>
          <button
            type="button"
            disabled={!mesocycleDelMes}
            onClick={() => mesocycleDelMes && onOpenTemplateModal(mesocycleDelMes.id)}
            className="w-full flex items-center justify-center gap-1.5 bg-inset border border-hairline rounded-field py-2.5 text-label font-sans font-semibold hover:border-accent-line transition-colors disabled:opacity-40"
          >
            <Icon name="assignment" size="s" style={{ color: 'var(--color-accent)' }} />Plantilla de cuestionarios
          </button>
        </div>

        <div className="bg-surface rounded-surface px-5 py-4 flex items-center gap-2.5 text-ink-3" style={{ border: '1px dashed rgba(255,255,255,0.12)' }}>
          <Icon name="drag_indicator" size="m" />
          <span className="text-[12.5px] font-sans leading-relaxed">Arrastra un entreno o un hito a otro día para reprogramarlo</span>
        </div>

        {sinFecha.length > 0 && (
          <div className="bg-surface border border-hairline rounded-surface px-5 py-[18px]">
            <p className="font-mono text-caption uppercase tracking-wider text-ink-3 mb-3">Sin fecha asignada</p>
            <div className="flex flex-wrap gap-2">
              {sinFecha.map(it => (
                <span key={it.id} className="text-label text-ink-2 font-sans px-2.5 py-1.5 rounded-control border border-hairline">{it.title}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>

    {/* Ancho completo, fuera de la columna lateral de 312px: son 5-6 semanas
        por 8 grupos musculares, no cabe en una tarjeta de barra lateral. */}
    <CarrilVolumen carril={carrilVolumen} />
    </div>
  );
}
