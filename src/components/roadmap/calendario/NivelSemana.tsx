import React from 'react';
import { CoachDayNote, WorkoutAssignment } from '../../../types';
import { DiaCalendario, BandaEntreno, BandaNutricion, bandaEnFecha } from '../../../utils/roadmapCalendar';
import { ejerciciosDelDia, diasDeLaSemana, rotuloDeSemana, DatosSemana } from '../../../utils/semanaCalendario';
import { PlanEvent } from '../../../utils/planEvents';
import { estiloDeEstado, mezcla, COLOR_CAT_CARDIO } from './paleta';
import { Icon } from '../../ui';

const DIAS = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];

interface Props {
  inicio: string;               // lunes de la semana
  hoy: string;
  indice: Map<string, DiaCalendario>;
  bandasEntreno: BandaEntreno[];
  bandasNutricion: BandaNutricion[];
  datosSemana: DatosSemana;
  coachDayNotes: CoachDayNote[];
  workoutAssignments: WorkoutAssignment[];
  volumeEvents: PlanEvent[];
  sel: string | null;
  onPrev: () => void;
  onNext: () => void;
  onBackToMonth: () => void;
  onOpenDay: (fecha: string) => void;
  onMoveWorkoutAssignment: (assignmentId: string, newDate: string) => void | Promise<void>;
}

function Bloque({ icono, color, titulo, children }: { icono: string; color: string; titulo: string; children: React.ReactNode }) {
  return (
    <div className="pt-2.5 mt-2.5 border-t border-hairline first:border-0 first:pt-0 first:mt-0">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon name={icono} style={{ fontSize: 13, color }} />
        <span className="font-mono text-caption uppercase tracking-wider" style={{ color: 'var(--color-ink-4)' }}>{titulo}</span>
      </div>
      {children}
    </div>
  );
}

/**
 * Nivel Semana — el cuarto escalón de zoom (Año → Mes → Semana → Día).
 *
 * Es la unidad en la que se programa de verdad: siete columnas con el detalle
 * completo de cada día a la vez, incluida la lista de ejercicios con las
 * series ya resueltas para esa semana del mesociclo. Ni el Año ni el Mes
 * pueden enseñar eso (no caben), y el sheet de Día solo enseña uno.
 */
export default function NivelSemana({
  inicio, hoy, indice, bandasEntreno, bandasNutricion, datosSemana, coachDayNotes,
  workoutAssignments, volumeEvents, sel, onPrev, onNext, onBackToMonth, onOpenDay, onMoveWorkoutAssignment,
}: Props) {
  const dias = diasDeLaSemana(inicio);
  const [dragOver, setDragOver] = React.useState<string | null>(null);

  const banda = bandaEnFecha<BandaEntreno>(bandasEntreno, inicio) ?? bandaEnFecha<BandaEntreno>(bandasEntreno, dias[6]);
  const semanaDelBloque = banda
    ? Math.floor((new Date(inicio + 'T00:00:00').getTime() - new Date(banda.inicio + 'T00:00:00').getTime()) / 86400000 / 7) + 1
    : null;

  function handleDrop(e: React.DragEvent, destino: string) {
    e.preventDefault();
    setDragOver(null);
    try {
      const payload = JSON.parse(e.dataTransfer.getData('text/plain')) as { tipo: string; id: string };
      if (payload.tipo === 'entreno') onMoveWorkoutAssignment(payload.id, destino);
    } catch { /* arrastre de otra cosa: se ignora */ }
  }

  return (
    <div className="space-y-3.5" style={{ animation: 'fade-up 260ms cubic-bezier(0.2,0.8,0.2,1) both' }}>
      <div className="bg-surface border border-hairline rounded-surface px-5 pt-[18px] pb-[22px]">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-3.5 flex-wrap">
            <button type="button" onClick={onBackToMonth} className="flex items-center gap-1.5 text-label text-ink-3 hover:text-white transition-colors">
              <Icon name="calendar_month" size="s" />Mes
            </button>
            <div className="w-px h-[18px] bg-hairline" />
            <button type="button" onClick={onPrev} className="w-8 h-8 rounded-control bg-inset flex items-center justify-center text-ink-2 hover:text-white transition-colors" aria-label="Semana anterior">
              <Icon name="chevron_left" size="s" />
            </button>
            <span className="font-sans font-extrabold text-title-l text-white" style={{ letterSpacing: '-0.02em', minWidth: 175 }}>{rotuloDeSemana(inicio)}</span>
            <button type="button" onClick={onNext} className="w-8 h-8 rounded-control bg-inset flex items-center justify-center text-ink-2 hover:text-white transition-colors" aria-label="Semana siguiente">
              <Icon name="chevron_right" size="s" />
            </button>
          </div>
          {banda && semanaDelBloque !== null && (
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-control flex items-center justify-center" style={{ background: mezcla(banda.color, 12) }}>
                <Icon name={banda.icono} size="s" style={{ color: banda.color }} />
              </span>
              <span className="font-mono text-caption uppercase tracking-wider text-ink-3">
                Semana {semanaDelBloque} de {banda.semanas} · {banda.nombre}
              </span>
            </div>
          )}
        </div>

        <div className="grid gap-2 items-start" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
          {dias.map((fecha, i) => {
            const dia = indice.get(fecha);
            const esHoy = fecha === hoy;
            const esFuturo = dia?.esFuturo ?? fecha >= hoy;
            const estilo = dia ? estiloDeEstado(dia.estado) : estiloDeEstado('sin-datos');
            const ejercicios = ejerciciosDelDia(fecha, datosSemana);
            const nota = coachDayNotes.find(n => n.date === fecha);
            const asignacion = workoutAssignments.find(a => a.date === fecha);
            const volEvent = volumeEvents.find(e => e.date === fecha);
            const bandaNutri = bandaEnFecha<BandaNutricion>(bandasNutricion, fecha);

            return (
              <div
                key={fecha}
                data-fecha={fecha}
                role="button"
                tabIndex={0}
                onClick={() => onOpenDay(fecha)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onOpenDay(fecha); }}
                draggable={!!asignacion}
                onDragStart={e => { if (asignacion) e.dataTransfer.setData('text/plain', JSON.stringify({ tipo: 'entreno', id: asignacion.id })); }}
                onDragOver={e => { e.preventDefault(); setDragOver(fecha); }}
                onDragLeave={() => setDragOver(d => d === fecha ? null : d)}
                onDrop={e => handleDrop(e, fecha)}
                className="flex flex-col cursor-pointer transition-colors overflow-hidden"
                style={{
                  minHeight: 300,
                  padding: '11px 12px 12px',
                  borderRadius: 16,
                  background: sel === fecha ? 'rgba(255,199,44,0.09)' : (esFuturo ? 'transparent' : 'var(--color-cell)'),
                  border: `1px ${esFuturo && !esHoy && sel !== fecha && dragOver !== fecha ? 'dashed' : 'solid'} ${
                    dragOver === fecha || sel === fecha ? 'var(--color-accent)'
                      : esHoy ? 'rgba(255,199,44,0.55)'
                      : esFuturo ? 'rgba(245,245,244,0.13)' : 'rgba(255,255,255,0.06)'}`,
                  transitionDuration: '160ms',
                }}
              >
                <div className="flex items-center justify-between gap-1.5 pb-2.5 border-b border-hairline">
                  <div className="flex items-baseline gap-1.5 min-w-0">
                    <span className="font-mono text-caption tracking-wider" style={{ color: esHoy ? 'var(--color-accent)' : 'var(--color-ink-4)' }}>{DIAS[i]}</span>
                    <span className="font-mono text-title-s" style={{ color: esHoy ? 'var(--color-accent)' : 'var(--color-ink-2)', fontWeight: esHoy ? 600 : 400 }}>
                      {Number(fecha.slice(8, 10))}
                    </span>
                  </div>
                  <span
                    className="flex items-center justify-center flex-shrink-0"
                    style={{ width: 20, height: 20, borderRadius: 10, background: estilo.fondo, border: `1px ${esFuturo ? 'dashed' : 'solid'} ${estilo.color}` }}
                    title={esFuturo ? 'Planificado' : estilo.label}
                  >
                    <Icon name={estilo.icono} style={{ fontSize: 12, color: estilo.color }} />
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  {/* Entreno */}
                  <Bloque icono="fitness_center" color="var(--color-phase-fuerza)" titulo="Entreno">
                    {dia?.entreno.esDescanso && <p className="text-label text-ink-4 font-sans">Descanso</p>}
                    {!dia?.entreno.esDescanso && ejercicios.length === 0 && (
                      <p className="text-label text-ink-5 font-sans">{dia?.entreno.nombreRutina ?? 'Sin entreno'}</p>
                    )}
                    {ejercicios.length > 0 && (
                      <>
                        <p className="font-sans text-[11.5px] font-semibold text-white truncate mb-1.5">{dia?.entreno.nombreRutina}</p>
                        <div className="flex flex-col gap-1">
                          {ejercicios.map(ej => (
                            <div key={ej.exerciseId} className="min-w-0">
                              <p className="font-sans text-[11px] text-ink-2 truncate leading-tight">{ej.nombre}</p>
                              <p className="font-mono text-[10.5px]" style={{ color: 'var(--color-ink-4)' }}>
                                {ej.seriesHechas !== undefined ? `${ej.seriesHechas}/${ej.series}` : `${ej.series}`}×{ej.reps} · RIR {ej.rir}
                                {ej.pesoMedio !== undefined && ` · ${ej.pesoMedio} kg`}
                              </p>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                    {volEvent && (
                      <p className="flex items-center gap-1 mt-1.5 text-[10.5px] font-sans" style={{ color: 'var(--color-phase-fuerza)' }}>
                        <Icon name="trending_up" style={{ fontSize: 12 }} />{volEvent.title}
                      </p>
                    )}
                  </Bloque>

                  {/* Nutrición */}
                  {bandaNutri && dia && (
                    <Bloque icono="restaurant" color="var(--color-success)" titulo="Nutrición">
                      <p className="font-mono text-[11.5px] text-ink-2">
                        {esFuturo ? `${dia.nutricion.kcalObjetivo ?? '—'} kcal plan` : `${dia.nutricion.kcal ?? '—'} / ${dia.nutricion.kcalObjetivo ?? '—'} kcal`}
                      </p>
                      {!esFuturo && dia.nutricion.adherenciaPct !== undefined && (
                        <p className="font-mono text-[10.5px]" style={{ color: dia.nutricion.adherenciaPct >= 85 ? 'var(--color-success)' : 'var(--color-warning)' }}>
                          {dia.nutricion.adherenciaPct}% de adherencia
                        </p>
                      )}
                    </Bloque>
                  )}

                  {/* Cardio */}
                  {dia?.entreno.cardio && (
                    <Bloque icono="directions_run" color={COLOR_CAT_CARDIO} titulo="Cardio">
                      <p className="font-mono text-[11.5px] text-ink-2">
                        {dia.entreno.cardio.tipo === 'zona2' ? 'Zona 2' : 'VO₂'} · {dia.entreno.cardio.minutos} min
                        {dia.entreno.cardio.fcMedia ? ` · ${dia.entreno.cardio.fcMedia} bpm` : ''}
                      </p>
                    </Bloque>
                  )}

                  {/* Recarga */}
                  {dia?.refeed && (
                    <Bloque icono="local_fire_department" color="var(--color-refeed)" titulo="Recarga">
                      <p className="font-sans text-[11px] text-ink-2 leading-snug">{dia.refeed.note || 'Día de recarga'}</p>
                    </Bloque>
                  )}

                  {/* Hitos */}
                  {dia && dia.hitos.length > 0 && (
                    <Bloque icono="flag" color="var(--color-accent)" titulo="Hitos">
                      <div className="flex flex-col gap-1">
                        {dia.hitos.map(h => (
                          <p key={h.id} className="font-sans text-[11px] text-ink-2 leading-snug">{h.titulo}</p>
                        ))}
                      </div>
                    </Bloque>
                  )}

                  {/* Nota del coach */}
                  {nota && (
                    <Bloque icono="sticky_note_2" color="var(--color-accent)" titulo="Tu nota">
                      <p className="font-sans text-[11px] text-ink-2 leading-snug">{nota.text}</p>
                    </Bloque>
                  )}
                </div>

                {/* Fases del día. En el Mes son una rayita porque la celda no da
                    para más; aquí sí hay sitio, así que van con nombre — que es
                    lo único que convierte dos colores en información. */}
                {dia && (
                  <div className="flex flex-col gap-1 mt-3 pt-2.5 border-t border-hairline">
                    {[
                      { clave: 'entreno', fase: dia.faseEntreno, vacio: 'Sin bloque' },
                      { clave: 'nutri', fase: dia.faseNutricion, vacio: 'Sin fase nutri' },
                    ].map(({ clave, fase, vacio }) => (
                      <div key={clave} className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="rounded-full flex-shrink-0"
                          style={{ width: 14, height: 6, background: fase?.color ?? 'var(--color-ink-5)', opacity: esFuturo ? 0.65 : 1 }}
                        />
                        <span
                          className="font-sans text-[10.5px] truncate"
                          style={{ color: fase ? mezcla(fase.color, 78) : 'var(--color-ink-5)' }}
                          title={fase?.nombre ?? vacio}
                        >
                          {fase?.nombre ?? vacio}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p className="flex items-center gap-1.5 mt-3.5 text-caption text-ink-4 font-sans">
          <Icon name="drag_indicator" size="s" />
          Arrastra un entreno a otro día para reprogramarlo · toca un día para abrir su detalle
        </p>
      </div>
    </div>
  );
}
