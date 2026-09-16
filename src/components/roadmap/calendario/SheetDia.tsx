import React, { useState } from 'react';
import { WorkoutLog, WorkoutAssignment, ProgressPhoto, CoachDayNote, Mesocycle, TaskItem } from '../../../types';
import { DiaCalendario, BandaEntreno, BandaNutricion } from '../../../utils/roadmapCalendar';
import { PlanEvent } from '../../../utils/planEvents';
import { moviblesDelDia, ordenDeMovimiento, Movible } from '../../../utils/moverEnCalendario';
import { DestinoPlan } from './RoadmapCalendario';
import { Sheet, Button, Icon, Input } from '../../ui';
import { estiloDeEstado, mezcla } from './paleta';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function fechaLarga(fecha: string): string {
  const d = new Date(fecha + 'T00:00:00');
  return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

function Metrica({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="bg-cell rounded-field px-3.5 py-3 flex flex-col gap-1">
      <span className="font-mono text-caption uppercase tracking-wider text-ink-4">{label}</span>
      <span className="font-mono text-title-m font-semibold text-white">{valor}</span>
    </div>
  );
}

function BarraMacro({ letra, color, pct, texto }: { letra: string; color: string; pct: number; texto: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="font-mono text-label text-ink-3" style={{ width: 26 }}>{letra}</span>
      <div className="flex-1 rounded-full overflow-hidden bg-cell" style={{ height: 6 }}>
        <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', borderRadius: 3, background: color }} />
      </div>
      <span className="font-mono text-label text-ink-2">{texto}</span>
    </div>
  );
}

interface Props {
  fecha: string;
  dia: DiaCalendario | null;
  bandaEntreno: BandaEntreno | null;
  bandaNutricion: BandaNutricion | null;
  progressPhotos: ProgressPhoto[];
  coachDayNotes: CoachDayNote[];
  workoutLogs: WorkoutLog[];
  workoutAssignments: WorkoutAssignment[];
  volumeEvent: PlanEvent | null;
  /** Para poder mover hitos y eventos de volumen, no solo el entreno. */
  tasks: TaskItem[];
  volumeEvents: PlanEvent[];
  mesocycles: Mesocycle[];
  highlighted: boolean;
  onToggleDestacado: () => void;
  onSaveNote: (text: string) => void | Promise<void>;
  onAbrirNuevoHito: () => void;
  /** Abre el hub de acciones in situ (importar bloque, evento de kcal, aviso…). */
  onAbrirAcciones: () => void;
  onMoveWorkoutAssignment: (assignmentId: string, newDate: string) => void | Promise<void>;
  onMoveTask: (taskId: string, newDate: string) => void | Promise<void>;
  onMoveVolumeEvent: (workoutId: string, exerciseId: string, oldAtWeek: number, newAtWeek: number) => void | Promise<void>;
  onGoToTab: (tab: DestinoPlan) => void;
  onClose: () => void;
}

export default function SheetDia({
  fecha, dia, bandaEntreno, bandaNutricion, progressPhotos, coachDayNotes, workoutLogs, workoutAssignments, volumeEvent,
  tasks, volumeEvents, mesocycles,
  highlighted, onToggleDestacado, onSaveNote, onAbrirNuevoHito, onAbrirAcciones,
  onMoveWorkoutAssignment, onMoveTask, onMoveVolumeEvent, onGoToTab, onClose,
}: Props) {
  const [editandoNota, setEditandoNota] = useState(false);
  const [moviendo, setMoviendo] = useState(false);
  const [nuevaFecha, setNuevaFecha] = useState(fecha);
  const [queMuevo, setQueMuevo] = useState(0);
  const [borradorNota, setBorradorNota] = useState('');
  const [guardandoNota, setGuardandoNota] = useState(false);

  const esFuturo = dia?.esFuturo ?? true;
  const estilo = dia ? estiloDeEstado(dia.estado) : estiloDeEstado('sin-datos');
  const semana = bandaEntreno ? Math.floor((new Date(fecha + 'T00:00:00').getTime() - new Date(bandaEntreno.inicio + 'T00:00:00').getTime()) / 86400000 / 7) + 1 : null;

  // `?? []` de sobra: los 4 llegan siempre como array desde RoadmapCalendario/
  // DevHarness, pero el sheet es la única pantalla del calendario que se abre
  // en un portal fuera del árbol normal — barato blindarla contra un prop a
  // medio propagar durante un remount rápido (cerrar y reabrir sin esperar).
  const notaCoach = (coachDayNotes ?? []).find(n => n.date === fecha);
  const logDelDia = (workoutLogs ?? []).find(l => l.date === fecha);
  const fotoDelDia = (progressPhotos ?? []).find(p => p.date === fecha);

  /* Mover pedía la fecha con `window.prompt`, y eso está mal por tres motivos
     a la vez: en el WebView de Capacitor puede no pintarse siquiera, obliga a
     teclear «AAAA-MM-DD» a mano en un móvil, y cualquier cosa que no case con
     ese formato se descartaba en silencio — el coach escribía «mañana» y el
     botón parecía roto. Ahora es un selector de fecha del sistema, que ni se
     puede escribir mal ni se puede descartar callando.

     Y ya no es solo el entreno. En la rejilla del mes también se arrastran los
     hitos y los cambios de volumen, pero arrastrar no existe en una pantalla
     táctil: desde el móvil no había forma de mover ninguno de los dos. Este
     selector es esa forma, y decide con el MISMO motor que el arrastre
     (`utils/moverEnCalendario`), así que no puede desviarse de él. */
  const movibles = moviblesDelDia({ fecha, workoutAssignments, tasks, volumeEvents });
  const movible: Movible | undefined = movibles[queMuevo] ?? movibles[0];

  function confirmarMovimiento() {
    if (!movible) return;
    const orden = ordenDeMovimiento(movible, nuevaFecha, { fechaOrigen: fecha, volumeEvents, mesocycles });
    if (!orden) return;
    if (orden.tipo === 'entreno') onMoveWorkoutAssignment(orden.assignmentId, orden.fecha);
    else if (orden.tipo === 'hito') onMoveTask(orden.taskId, orden.fecha);
    else onMoveVolumeEvent(orden.workoutId, orden.exerciseId, orden.semanaVieja, orden.semanaNueva);
    setMoviendo(false);
  }

  /** Ir a editar cierra el sheet primero. Sin esto la navegación pasaba por
   *  debajo del propio sheet y parecía que el botón estaba muerto. */
  function irAEditar(tab: DestinoPlan) {
    onClose();
    onGoToTab(tab);
  }

  async function guardarNota() {
    setGuardandoNota(true);
    try {
      await onSaveNote(borradorNota.trim());
      setEditandoNota(false);
    } finally {
      setGuardandoNota(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      label={fechaLarga(fecha)}
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onAbrirNuevoHito} icon="flag">Hito</Button>
          <Button variant={highlighted ? 'primary' : 'secondary'} onClick={onToggleDestacado} icon="star">Destacar día</Button>
          {movibles.length > 0 && (moviendo ? (
            <span className="flex flex-wrap items-end gap-2 flex-1 min-w-[220px]">
              {movibles.length > 1 && (
                <span className="flex items-center gap-1.5 flex-wrap">
                  {movibles.map((m, i) => (
                    <button
                      key={`${m.tipo}_${m.id}`}
                      type="button"
                      onClick={() => setQueMuevo(i)}
                      aria-pressed={i === queMuevo}
                      className={`rounded-control border px-2.5 py-1.5 font-sans text-label transition-colors ${
                        i === queMuevo ? 'border-accent-line text-accent' : 'border-hairline text-ink-2 hover:text-ink'
                      }`}
                    >
                      {m.etiqueta}
                    </button>
                  ))}
                </span>
              )}
              <span className="min-w-[150px]">
                <Input type="date" label="Mover a" value={nuevaFecha} onChange={setNuevaFecha} />
              </span>
              <Button onClick={confirmarMovimiento} disabled={!nuevaFecha || nuevaFecha === fecha}>
                Mover
              </Button>
              <Button variant="ghost" onClick={() => setMoviendo(false)}>Cancelar</Button>
            </span>
          ) : (
            <Button variant="secondary" onClick={() => { setNuevaFecha(fecha); setQueMuevo(0); setMoviendo(true); }} icon="swap_horiz">
              {movibles.length > 1 ? 'Mover…' : `Mover ${movibles[0].tipo === 'entreno' ? 'entreno' : movibles[0].tipo === 'hito' ? 'hito' : 'el cambio de volumen'}`}
            </Button>
          ))}
          <Button variant="secondary" onClick={() => setEditandoNota(true)} icon="sticky_note_2">Nota</Button>
          <Button onClick={onAbrirAcciones} icon="bolt" className="flex-1">Programar aquí</Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-hairline">
          <div className="flex flex-col gap-1.5">
            <p className="font-sans font-extrabold text-title-l text-white" style={{ letterSpacing: '-0.02em' }}>{fechaLarga(fecha)}</p>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span
                className="font-mono text-caption uppercase tracking-wider px-2.5 py-1 rounded-control"
                style={{ color: esFuturo ? 'var(--color-ink-2)' : estilo.color, background: esFuturo ? 'var(--color-inset)' : estilo.fondo }}
              >
                {esFuturo ? 'Planificado' : estilo.label}
              </span>
              {bandaEntreno && semana !== null && (
                <span className="font-mono text-caption text-ink-3">SEMANA {semana} DE {bandaEntreno.semanas} · {bandaEntreno.nombre.toUpperCase()}</span>
              )}
            </div>
          </div>
        </div>

        {!dia && (
          <p className="text-ink-3 text-label font-sans py-4">Fuera de cualquier bloque de periodización — no hay datos para este día.</p>
        )}

        {dia && (
          <div className="grid gap-3.5" style={{ gridTemplateColumns: '1.35fr 1fr' }}>
            {/* Entreno */}
            <div className="bg-inset border border-hairline rounded-field p-5">
              <div className="flex items-center justify-between mb-3.5">
                <div className="flex items-center gap-2.5">
                  <Icon name="fitness_center" size="m" style={{ color: 'var(--color-phase-fuerza)' }} />
                  <span className="font-sans font-bold text-title-s text-white">{dia.entreno.esDescanso ? 'Descanso' : (dia.entreno.nombreRutina ?? 'Sin entreno')}</span>
                </div>
              </div>
              {!dia.entreno.esDescanso && dia.entreno.nombreRutina && (
                <>
                  <div className="grid grid-cols-3 gap-2.5">
                    <Metrica label="Series" valor={`${dia.entreno.seriesHechas ?? 0} / ${dia.entreno.seriesTotal ?? '—'}`} />
                    <Metrica label="RIR medio" valor={dia.entreno.rirMedio !== undefined ? String(dia.entreno.rirMedio) : '—'} />
                    <Metrica label="Tonelaje" valor={dia.entreno.tonelaje !== undefined ? `${dia.entreno.tonelaje} kg` : '—'} />
                  </div>
                  {volumeEvent && (
                    <div className="flex items-center gap-1.5 mt-3.5 text-caption font-sans" style={{ color: volumeEvent.conditional ? (volumeEvent.conditional.met ? 'var(--color-accent)' : 'var(--color-ink-3)') : 'var(--color-phase-fuerza)' }}>
                      <Icon name="trending_up" size="s" />{volumeEvent.title}
                    </div>
                  )}
                  <button type="button" onClick={() => irAEditar('entrenamientos')} className="flex items-center gap-1.5 mt-4 text-label font-semibold font-sans text-accent">
                    {logDelDia ? 'Ver sesión completa' : 'Editar series y ejercicios'}<Icon name="arrow_forward" size="s" />
                  </button>
                </>
              )}
            </div>

            {/* Nutrición */}
            <div className="bg-inset border border-hairline rounded-field p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <Icon name="restaurant" size="m" style={{ color: 'var(--color-success)' }} />
                  <span className="font-sans font-bold text-title-s text-white">Nutrición</span>
                </div>
                {dia.nutricion.adherenciaPct !== undefined && (
                  <span
                    className="font-mono text-caption px-2.5 py-1 rounded-control"
                    style={{ color: dia.nutricion.adherenciaPct >= 85 ? 'var(--color-success)' : 'var(--color-warning)', background: dia.nutricion.adherenciaPct >= 85 ? 'rgba(62,207,142,0.14)' : 'rgba(253,186,116,0.14)' }}
                  >
                    {dia.nutricion.adherenciaPct}%
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-2 mb-3.5">
                <span className="font-mono text-title-l font-semibold text-white">{esFuturo ? (dia.nutricion.kcalObjetivo ?? '—') : (dia.nutricion.kcal ?? '—')}</span>
                <span className="text-label text-ink-3 font-sans">/ {dia.nutricion.kcalObjetivo ?? '—'} kcal{esFuturo ? ' objetivo' : ''}</span>
              </div>
              {!bandaNutricion && <p className="text-caption text-ink-4 font-sans">Sin fase de nutrición activa este día.</p>}
              {bandaNutricion && dia.nutricion.macros && (
                <div className="flex flex-col gap-2.5 mb-3.5">
                  <BarraMacro letra="P" color="var(--color-success)" pct={(dia.nutricion.macros.p.hecho / (dia.nutricion.macros.p.objetivo || 1)) * 100} texto={`${dia.nutricion.macros.p.hecho} / ${dia.nutricion.macros.p.objetivo} g`} />
                  <BarraMacro letra="C" color="var(--color-phase-fuerza)" pct={(dia.nutricion.macros.c.hecho / (dia.nutricion.macros.c.objetivo || 1)) * 100} texto={`${dia.nutricion.macros.c.hecho} / ${dia.nutricion.macros.c.objetivo} g`} />
                  <BarraMacro letra="G" color="var(--color-cat-cardio)" pct={(dia.nutricion.macros.g.hecho / (dia.nutricion.macros.g.objetivo || 1)) * 100} texto={`${dia.nutricion.macros.g.hecho} / ${dia.nutricion.macros.g.objetivo} g`} />
                </div>
              )}
              {bandaNutricion && (
                <p className="text-[12.5px] text-ink-3 font-sans">
                  {dia.nutricion.comidasHechas !== undefined && dia.nutricion.comidasTotal !== undefined
                    ? `${dia.nutricion.comidasHechas} de ${dia.nutricion.comidasTotal} comidas marcadas`
                    : (dia.nutricion.comidasTotal !== undefined ? `${dia.nutricion.comidasTotal} comidas plan · sin registro` : 'Sin datos de comidas')}
                </p>
              )}
              {dia.refeed && (
                <div
                  className="flex items-start gap-2 mt-3.5 px-3 py-2 rounded-field"
                  style={{ background: mezcla('var(--color-refeed)', 10), border: `1px solid ${mezcla('var(--color-refeed)', 28)}` }}
                >
                  <Icon name="local_fire_department" size="s" style={{ color: 'var(--color-refeed)', marginTop: 1, flexShrink: 0 }} />
                  <div className="min-w-0">
                    <p className="font-sans font-semibold text-label" style={{ color: 'var(--color-refeed)' }}>Día de recarga</p>
                    {dia.refeed.note && <p className="text-caption text-ink-2 font-sans mt-0.5">{dia.refeed.note}</p>}
                  </div>
                </div>
              )}
              <button type="button" onClick={() => irAEditar('dietas')} className="flex items-center gap-1.5 mt-4 text-label font-semibold font-sans text-accent">
                Editar intercambios y macros<Icon name="arrow_forward" size="s" />
              </button>
            </div>

            {/* Cardio */}
            <div className="bg-inset border border-hairline rounded-field p-5 flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-2.5" style={{ minWidth: 150 }}>
                <Icon name="directions_run" size="m" style={{ color: 'var(--color-cat-cardio)' }} />
                <div className="flex flex-col gap-0.5">
                  <span className="font-sans font-bold text-body-s text-white">Cardio</span>
                  <span className="text-[12.5px] text-ink-3 font-sans">{dia.entreno.cardio ? (dia.entreno.cardio.tipo === 'zona2' ? 'Zona 2 · cinta' : 'VO₂ · intervalos') : 'Sin cardio este día'}</span>
                </div>
              </div>
              {dia.entreno.cardio && (
                <>
                  <div className="flex flex-col gap-1">
                    <span className="font-mono text-caption uppercase tracking-wider text-ink-4">Tiempo</span>
                    <span className="font-mono text-title-s font-semibold text-white">{dia.entreno.cardio.minutos} min</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="font-mono text-caption uppercase tracking-wider text-ink-4">FC media</span>
                    <span className="font-mono text-title-s font-semibold text-white">{dia.entreno.cardio.fcMedia ?? '—'}</span>
                  </div>
                </>
              )}
              <div className="flex-1" />
              <button type="button" onClick={() => irAEditar('cardio')} className="flex items-center gap-1.5 text-label font-semibold font-sans text-accent">
                Editar cardio<Icon name="arrow_forward" size="s" />
              </button>
            </div>

            {/* Métricas + foto */}
            <div className="bg-inset border border-hairline rounded-field p-5 flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-2.5" style={{ minWidth: 150 }}>
                <Icon name="monitor_weight" size="m" style={{ color: 'var(--color-ink-2)' }} />
                <span className="font-sans font-bold text-body-s text-white">Métricas</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-mono text-caption uppercase tracking-wider text-ink-4">Peso</span>
                <span className="font-mono text-title-s font-semibold text-white">{dia.puntos.peso ? '✓ registrado' : '—'}</span>
              </div>
              <div className="flex-1" />
              <span
                className="text-[12.5px] px-3 py-1.5 rounded-control"
                style={{ color: fotoDelDia ? 'var(--color-accent)' : 'var(--color-ink-4)', background: fotoDelDia ? 'color-mix(in oklab, var(--color-accent) 10%, transparent)' : 'var(--color-cell)' }}
              >
                {fotoDelDia ? 'Foto de progreso subida' : (esFuturo ? 'Sin foto prevista' : 'Sin foto este día')}
              </span>
            </div>

            {/* Notas del día */}
            <div className="col-span-2 bg-inset border border-hairline rounded-field p-5 flex flex-col gap-3.5" style={{ gridColumn: '1 / -1' }}>
              <p className="font-mono text-caption uppercase tracking-wider text-ink-4">Notas del día</p>
              {logDelDia?.note && (
                <div className="flex gap-3 items-start">
                  <div className="flex items-center justify-center flex-shrink-0 font-mono text-caption text-ink-2 rounded-field" style={{ width: 30, height: 30, background: 'var(--color-track)' }}>AT</div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-label font-semibold text-ink-2 font-sans">Atleta</span>
                    <span className="text-body text-white font-sans leading-relaxed" style={{ textWrap: 'pretty' }}>{logDelDia.note}</span>
                  </div>
                </div>
              )}
              {notaCoach && !editandoNota && (
                <div className="flex gap-3 items-start">
                  <div className="flex items-center justify-center flex-shrink-0 font-mono text-caption text-accent rounded-field" style={{ width: 30, height: 30, background: 'color-mix(in oklab, var(--color-accent) 14%, transparent)' }}>C</div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-label font-semibold text-ink-2 font-sans">Coach</span>
                    <span className="text-body text-white font-sans leading-relaxed" style={{ textWrap: 'pretty' }}>{notaCoach.text}</span>
                  </div>
                </div>
              )}
              {!logDelDia?.note && !notaCoach && !editandoNota && (
                <p className="text-caption text-ink-4 font-sans">Sin notas este día.</p>
              )}
              {editandoNota && (
                <div className="space-y-2.5">
                  <textarea
                    autoFocus
                    defaultValue={notaCoach?.text ?? ''}
                    onChange={e => setBorradorNota(e.target.value)}
                    rows={3}
                    placeholder="Escribe algo que quieras que el atleta vea hoy en Inicio…"
                    className="w-full bg-cell border border-hairline rounded-control px-3 py-3 text-body-s text-white focus:outline-none focus:ring-1 focus:ring-accent resize-none"
                  />
                  <div className="flex gap-2 justify-end">
                    <Button variant="secondary" size="s" onClick={() => setEditandoNota(false)}>Cancelar</Button>
                    <Button size="s" onClick={guardarNota} loading={guardandoNota}>Guardar</Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
