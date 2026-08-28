import React, { useMemo, useRef, useState } from 'react';
import {
  Mesocycle, MesocycleTemplate, NutritionProgram, Roadmap, WorkoutAssignment, WorkoutLog, Workout, Exercise,
  Diet, DietCompletionLog, CardioSession, BodyweightLog, TaskItem, ProgressPhoto,
  QuestionnaireAssignment, Questionnaire, CoachDayNote, WeeklyProgressionRule,
} from '../../../types';
import {
  DatosCalendario, construirIndiceDeDias, construirBandasEntreno, construirBandasNutricion,
  bandaEnFecha, colorFaseEntreno, BandaEntreno, BandaNutricion,
} from '../../../utils/roadmapCalendar';
import { hoyIsoLocal, getWeekStart, addDays } from '../../../utils/trainingWeek';
import { adherenciaDeMesociclo } from '../../../utils/adherence';
import {
  deriveVolumeIncreaseEvents, deriveDeloadEvents, deriveKcalChangeEvents, deriveReviewEvents,
  detectConflicts, ConditionData,
} from '../../../utils/planEvents';
import { recentDietAdherencePct } from '../../../utils/nutritionPeriodization';
import { construirCarrilVolumen, semanasDelMes } from '../../../utils/accionesCalendario';
import { Icon, Avatar } from '../../ui';
import { useReducedMotion } from '../../ui/internal/useReducedMotion';
import { mezcla } from './paleta';
import NivelAno from './NivelAno';
import NivelMes from './NivelMes';
import NivelSemana from './NivelSemana';
import SheetDia from './SheetDia';
import ModalPlantillaCuestionarios from './ModalPlantillaCuestionarios';
import PanelPeso from './PanelPeso';
import NuevoHitoSheet, { TipoHito } from './NuevoHitoSheet';
import AccionesRapidasSheet, { AccionesRapidasHandlers } from './AccionesRapidasSheet';
import EditorFaseSheet from './EditorFaseSheet';
import EventPlannerSheet from '../EventPlannerSheet';
import ProposePlanSheet from '../ProposePlanSheet';
import { RoadmapItem } from '../../../types';

type Nivel = 'year' | 'month' | 'week';
/** Pestañas del cliente a las que el calendario sabe saltar para editar el plan. */
export type DestinoPlan = 'entrenamientos' | 'dietas' | 'cardio';
export type Filtro = 'Todo' | 'Entrenos' | 'Nutrición' | 'Hitos';

export interface CalendarioHandlers extends AccionesRapidasHandlers {
  onSave: (updated: Roadmap) => Promise<void>;
  onCreateReview: (input: { title: string; date: string; type: 'revision' | 'cuestionario' | 'foto' }) => void | Promise<void>;
  onMoveReview: (taskId: string, newDate: string) => void | Promise<void>;
  onResizeMesocycle: (id: string, weeks: number) => void | Promise<void>;
  onResizeNutritionPhase: (phaseId: string, weeks: number) => void | Promise<void>;
  onAddVolumeRule: (workoutId: string, exerciseId: string, rule: WeeklyProgressionRule) => void | Promise<void>;
  onMoveVolumeEvent: (workoutId: string, exerciseId: string, oldAtWeek: number, newAtWeek: number) => void | Promise<void>;
  onSaveDayNote: (date: string, text: string) => void | Promise<void>;
  onMoveWorkoutAssignment: (assignmentId: string, newDate: string) => void | Promise<void>;
  /** `ocurrencias` es la expansión COMPLETA (una entrada por fecha real, no una por asignación recurrente) — es lo que se convierte en hitos de la rejilla. */
  onApplyTemplate: (ocurrencias: { titulo: string; fecha: string }[]) => void | Promise<void>;
  /** Salta a la pestaña real del cliente (ClientHub), no a una sub-pestaña del roadmap. */
  onGoToTab: (tab: DestinoPlan) => void;
}

interface Props extends CalendarioHandlers {
  athleteEmail: string;
  athleteName: string;
  coachId: string;
  mesocycles: Mesocycle[];
  nutritionProgram: NutritionProgram | null;
  roadmap: Roadmap;
  workoutAssignments: WorkoutAssignment[];
  workoutLogs: WorkoutLog[];
  workouts: Workout[];
  exercises: Exercise[];
  diets: Diet[];
  dietCompletionLogs: DietCompletionLog[];
  cardioSessions: CardioSession[];
  bodyweightLogs: BodyweightLog[];
  tasks: TaskItem[];
  progressPhotos: ProgressPhoto[];
  questionnaireAssignments: QuestionnaireAssignment[];
  questionnaires: Questionnaire[];
  coachDayNotes: CoachDayNote[];
  initialWeight?: number;
  /** Plantillas de mesociclos del coach, para «Importar bloque». */
  mesocycleTemplates: MesocycleTemplate[];
  cargandoPlantillas: boolean;
}

function fmtRango(inicio: string, fin: string): string {
  const f = (s: string) => {
    const [, m, d] = s.split('-');
    const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
    return `${Number(d)} ${MESES[Number(m) - 1]}`;
  };
  return `${f(inicio)} — ${f(fin)}`;
}

export default function RoadmapCalendario(props: Props) {
  const {
    athleteEmail, athleteName, coachId, mesocycles, nutritionProgram, roadmap, workoutAssignments, workoutLogs,
    workouts, exercises, diets, dietCompletionLogs, cardioSessions, bodyweightLogs, tasks,
    progressPhotos, questionnaireAssignments, questionnaires, coachDayNotes, initialWeight,
    mesocycleTemplates, cargandoPlantillas,
    onSave, onCreateReview, onMoveReview, onResizeMesocycle, onResizeNutritionPhase,
    onAddVolumeRule, onMoveVolumeEvent, onSaveDayNote, onMoveWorkoutAssignment, onApplyTemplate, onGoToTab,
    onImportarBloque, onProgramarMenu, onEventoNutricion, onAsignarCuestionario, onAvisarConNota, onMarcarRecargas,
  } = props;

  const hoy = hoyIsoLocal();
  const anio = new Date().getFullYear();

  const [level, setLevel] = useState<Nivel>('year');
  const [month, setMonth] = useState<number>(new Date().getMonth());
  const [semanaInicio, setSemanaInicio] = useState<string>(() => getWeekStart(hoyIsoLocal()));
  const [sel, setSel] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filtro>('Todo');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMesoId, setModalMesoId] = useState<string | null>(null);
  const [pesoOpen, setPesoOpen] = useState(false);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [proposeOpen, setProposeOpen] = useState(false);
  const [editandoFase, setEditandoFase] = useState<{ banda: BandaEntreno | BandaNutricion; kind: 'meso' | 'nutri' } | null>(null);

  // ── Pinch para el zoom continuo entre niveles (pendiente del handoff) ──────
  // Pointer Events nativos, sin librería: en escritorio no pasa nada (hace
  // falta ratón + trackpad de dos dedos, que el navegador no expone como
  // pinch); en un dispositivo táctil, dos dedos que se separan sobre un
  // mini-mes lo abre (Año → Mes) o sobre un día abre su sheet (Mes → Día);
  // dos dedos que se juntan hace lo contrario. El `scale` en vivo durante el
  // gesto es solo la sensación de "acercar", el nivel real cambia de golpe al
  // cruzar el umbral — no hay agrupación real de celdas en mini-meses aquí
  // (eso ya lo es el propio Nivel Año).
  const reducedMotion = useReducedMotion();
  const punterosActivos = useRef<Map<number, { x: number; y: number }>>(new Map());
  const distanciaInicial = useRef<number | null>(null);
  const [pinchScale, setPinchScale] = useState(1);

  function distanciaEntre(a: { x: number; y: number }, b: { x: number; y: number }): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  function resetPinch() {
    distanciaInicial.current = null;
    punterosActivos.current.clear();
    setPinchScale(1);
  }
  function zoomInEn(centro: { x: number; y: number }) {
    const el = document.elementFromPoint(centro.x, centro.y);
    if (level === 'year') {
      const mesEl = el?.closest('[data-mes]');
      const mi = mesEl ? Number(mesEl.getAttribute('data-mes')) : new Date().getMonth();
      abrirMesDesde(mi);
    } else if (level === 'month' && !sel) {
      const fecha = el?.closest('[data-fecha]')?.getAttribute('data-fecha');
      abrirSemanaDesde(fecha ?? `${anio}-${String(month + 1).padStart(2, '0')}-01`);
    } else if (level === 'week' && !sel) {
      const fecha = el?.closest('[data-fecha]')?.getAttribute('data-fecha');
      if (fecha) setSel(fecha);
    }
  }
  function zoomOut() {
    if (sel) setSel(null);
    else if (level === 'week') { setMonth(new Date(semanaInicio + 'T00:00:00').getMonth()); setLevel('month'); }
    else if (level === 'month') setLevel('year');
  }
  function onPointerDownPinch(e: React.PointerEvent) {
    punterosActivos.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (punterosActivos.current.size === 2) {
      const [a, b] = [...punterosActivos.current.values()];
      distanciaInicial.current = distanciaEntre(a, b);
    }
  }
  function onPointerMovePinch(e: React.PointerEvent) {
    if (!punterosActivos.current.has(e.pointerId)) return;
    punterosActivos.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (punterosActivos.current.size !== 2 || distanciaInicial.current === null) return;
    const [a, b] = [...punterosActivos.current.values()];
    const distancia = distanciaEntre(a, b);
    const delta = distancia - distanciaInicial.current;
    if (!reducedMotion) setPinchScale(Math.min(1.06, Math.max(0.94, 1 + delta / 600)));
    const UMBRAL_PX = 70;
    if (delta > UMBRAL_PX) {
      zoomInEn({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      resetPinch();
    } else if (delta < -UMBRAL_PX) {
      zoomOut();
      resetPinch();
    }
  }
  function onPointerUpPinch(e: React.PointerEvent) {
    punterosActivos.current.delete(e.pointerId);
    if (punterosActivos.current.size < 2) resetPinch();
  }
  const [nuevoHitoOpen, setNuevoHitoOpen] = useState(false);
  const [accionesFecha, setAccionesFecha] = useState<string | null>(null);
  const [accionesRango, setAccionesRango] = useState<{ inicio: string; fin: string; etiqueta: string } | null>(null);

  const datos: DatosCalendario = useMemo(() => ({
    mesocycles, nutritionProgram, workoutAssignments, workoutLogs, workouts, diets,
    dietCompletionLogs, cardioSessions, bodyweightLogs, tasks, roadmapItems: roadmap.items,
    highlightedDays: roadmap.highlightedDays ?? [],
  }), [mesocycles, nutritionProgram, workoutAssignments, workoutLogs, workouts, diets, dietCompletionLogs, cardioSessions, bodyweightLogs, tasks, roadmap.items, roadmap.highlightedDays]);

  const carrilVolumen = useMemo(
    () => construirCarrilVolumen({ semanas: semanasDelMes(anio, month), workoutAssignments, workouts, exercises, mesocycles }),
    [anio, month, workoutAssignments, workouts, exercises, mesocycles],
  );

  const indice = useMemo(() => construirIndiceDeDias(datos, hoy), [datos, hoy]);
  const bandasEntreno = useMemo(() => construirBandasEntreno(mesocycles), [mesocycles]);
  const bandasNutricion = useMemo(() => construirBandasNutricion(nutritionProgram), [nutritionProgram]);

  const bandaActiva = bandaEnFecha<BandaEntreno>(bandasEntreno, hoy);
  const mesoActivo = bandaActiva ? mesocycles.find(m => m.id === bandaActiva.id) : undefined;
  const adherenciaBloque = mesoActivo ? adherenciaDeMesociclo(workoutAssignments, mesoActivo.id) : null;
  const semanaDelBloque = bandaActiva ? Math.floor((new Date(hoy + 'T00:00:00').getTime() - new Date(bandaActiva.inicio + 'T00:00:00').getTime()) / 86400000 / 7) + 1 : null;

  // Absorción del timeline horizontal: marcadores de subida de volumen y
  // avisos de conflicto (Bloque H) — misma lógica derivada que usaba
  // RoadmapTimeline, ahora alimentando el calendario en vez del carril.
  const conditionData: ConditionData = useMemo(() => ({
    workoutAssignments, workoutLogs, bodyweightLogs,
    dietAdherencePct: recentDietAdherencePct(dietCompletionLogs, diets, hoy),
  }), [workoutAssignments, workoutLogs, bodyweightLogs, dietCompletionLogs, diets, hoy]);
  const volumeEvents = useMemo(
    () => mesocycles.flatMap(m => deriveVolumeIncreaseEvents(workouts, exercises, m, hoy, conditionData)),
    [mesocycles, workouts, exercises, hoy, conditionData],
  );
  const deloadPlanEvents = useMemo(() => deriveDeloadEvents(mesocycles, hoy), [mesocycles, hoy]);
  const kcalEvents = useMemo(() => deriveKcalChangeEvents(nutritionProgram, hoy), [nutritionProgram, hoy]);
  const reviewEvents = useMemo(() => deriveReviewEvents(tasks, hoy), [tasks, hoy]);
  const conflicts = useMemo(
    () => detectConflicts(volumeEvents, reviewEvents, mesocycles, kcalEvents, deloadPlanEvents),
    [volumeEvents, reviewEvents, mesocycles, kcalEvents, deloadPlanEvents],
  );

  // Próximo hito — el primero con fecha >= hoy entre tareas y objetivos del roadmap.
  const proximoHito = useMemo(() => {
    const candidatos: { fecha: string; titulo: string }[] = [];
    for (const t of tasks) if (t.dueDate && t.dueDate >= hoy && t.status !== 'done') candidatos.push({ fecha: t.dueDate, titulo: t.title });
    for (const it of roadmap.items) {
      const fecha = it.targetDate ?? it.startDate;
      if (fecha && fecha >= hoy && it.status !== 'logrado') candidatos.push({ fecha, titulo: it.title });
    }
    candidatos.sort((a, b) => a.fecha.localeCompare(b.fecha));
    return candidatos[0] ?? null;
  }, [tasks, roadmap.items, hoy]);

  function abrirMesDesde(mi: number) {
    setMonth(mi);
    setLevel('month');
  }
  /** Día desde el que abrir la semana cuando no hay ninguno seleccionado: hoy
   *  si el mes que miras es el de hoy, y si no el 1 de ese mes — saltar a la
   *  semana de hoy desde un octubre que estabas revisando te saca del sitio. */
  function semanaAnclaDelMes(): string {
    const hoyD = new Date(hoy + 'T00:00:00');
    if (level === 'month' && !(hoyD.getFullYear() === anio && hoyD.getMonth() === month)) {
      return `${anio}-${String(month + 1).padStart(2, '0')}-01`;
    }
    return hoy;
  }
  function abrirSemanaDesde(fecha: string) {
    setSemanaInicio(getWeekStart(fecha));
    setLevel('week');
  }
  function irAHoy() {
    setMonth(new Date().getMonth());
    setLevel('month');
    setSel(hoy);
  }
  /**
   * Crea el hito y ADEMÁS te lleva a verlo: abre su mes y selecciona su día.
   * Sin eso, añadir un hito desde el Nivel Año no cambiaba nada en pantalla
   * —el hito caía en un mes que no estabas mirando— y el botón parecía roto.
   */
  async function handleAddHito({ titulo, fecha, tipo }: { titulo: string; fecha: string; tipo: TipoHito }) {
    if (tipo === 'hito') {
      const item: RoadmapItem = {
        id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        title: titulo, type: 'hito', lane: 'general', targetDate: fecha, status: 'pendiente',
      };
      await onSave({ ...roadmap, items: [...roadmap.items, item] });
    } else {
      await onCreateReview({ title: titulo, date: fecha, type: tipo });
    }
    setMonth(new Date(fecha + 'T00:00:00').getMonth());
    setLevel('month');
    setSel(fecha);
  }
  async function handleToggleDestacado(fecha: string) {
    const actuales = roadmap.highlightedDays ?? [];
    const nuevos = actuales.includes(fecha) ? actuales.filter(f => f !== fecha) : [...actuales, fecha];
    await onSave({ ...roadmap, highlightedDays: nuevos });
  }

  return (
    <div className="space-y-4">
      {/* Barra superior. Segmentado Año/Mes/Día: navega entre los 3 niveles de
          zoom del CALENDARIO (eje distinto del de las sub-pestañas de
          CoachRoadmapView, que eligen Fases/Retos/Niveles/Calendario). "Día"
          es un atajo, no un tercer estado persistente — abre el sheet de hoy
          sobre el mes en curso (README §State Management: el nivel Día es el
          sheet, no un nivel aparte). */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar name={athleteName} className="w-9 h-9 rounded-control flex-shrink-0" />
          <div className="min-w-0">
            <p className="font-sans font-extrabold text-title-m text-white truncate" style={{ letterSpacing: '-0.02em' }}>{athleteName}</p>
            <p className="font-mono text-caption text-ink-4 uppercase tracking-wider">Plan · Roadmap · Calendario</p>
          </div>
        </div>
        <div className="flex items-center gap-0.5 bg-raised rounded-control p-[3px] flex-shrink-0">
          {([
            { id: 'year', label: 'Año', activo: level === 'year' },
            { id: 'month', label: 'Mes', activo: level === 'month' && !sel },
            { id: 'week', label: 'Semana', activo: level === 'week' && !sel },
            { id: 'day', label: 'Día', activo: !!sel },
          ] as const).map(seg => (
            <button
              key={seg.id}
              type="button"
              onClick={() => {
                if (seg.id === 'year') { setLevel('year'); setSel(null); }
                else if (seg.id === 'month') { setLevel('month'); setSel(null); }
                else if (seg.id === 'week') { abrirSemanaDesde(sel ?? semanaAnclaDelMes()); setSel(null); }
                else irAHoy();
              }}
              className="rounded-control text-label font-sans px-3.5 py-2 transition-colors"
              style={{ background: seg.activo ? 'var(--color-track)' : 'transparent', color: seg.activo ? 'var(--color-ink)' : 'var(--color-ink-3)', fontWeight: seg.activo ? 600 : 400 }}
            >
              {seg.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {bandaActiva && (
            <button
              type="button"
              onClick={() => setPesoOpen(o => !o)}
              className="flex items-center gap-1.5 border border-hairline rounded-control px-3 py-2 text-label font-sans font-semibold text-white hover:border-accent-line transition-colors"
            >
              <Icon name="monitor_weight" size="s" />Peso
            </button>
          )}
          <button
            type="button"
            onClick={irAHoy}
            className="flex items-center gap-1.5 border border-hairline rounded-control px-3 py-2 text-label font-sans font-semibold text-white hover:border-accent-line transition-colors"
          >
            <Icon name="today" size="s" />Hoy
          </button>
          <button
            type="button"
            onClick={() => setNuevoHitoOpen(true)}
            className="flex items-center gap-1.5 border border-hairline rounded-control px-3 py-2 text-label font-sans font-semibold text-white hover:border-accent-line transition-colors"
          >
            <Icon name="flag" size="s" />Añadir hito
          </button>
          <button
            type="button"
            onClick={() => setProposeOpen(true)}
            className="flex items-center gap-1.5 border border-hairline rounded-control px-3 py-2 text-label font-sans font-semibold text-white hover:border-accent-line transition-colors"
          >
            <Icon name="auto_awesome" size="s" />Proponer plan
          </button>
          <button
            type="button"
            onClick={() => setPlannerOpen(true)}
            className="flex items-center gap-1.5 bg-accent text-on-accent font-bold rounded-control px-4 py-2 text-label font-sans"
            style={{ boxShadow: 'var(--shadow-glow)' }}
          >
            <Icon name="edit_calendar" size="s" />Planificar
          </button>
        </div>
      </div>

      {pesoOpen && (
        <PanelPeso
          bodyweightLogs={bodyweightLogs} initialWeight={initialWeight} nutritionProgram={nutritionProgram}
          hoy={hoy} anio={anio} mes={month} fechaRef={sel ?? (level === 'week' ? semanaInicio : null)}
          alcanceInicial={sel || level === 'week' ? 'semana' : level === 'year' ? 'anio' : 'mes'}
          onClose={() => setPesoOpen(false)}
        />
      )}

      {/* Banda de resumen del bloque activo */}
      {bandaActiva && mesoActivo && (
        <div className="bg-surface border border-hairline rounded-surface p-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-control flex items-center justify-center flex-shrink-0" style={{ background: mezcla(bandaActiva.color, 12) }}>
              <Icon name={bandaActiva.icono} size="m" style={{ color: bandaActiva.color }} />
            </div>
            <div>
              <p className="font-sans font-bold text-title-s text-white">{bandaActiva.nombre}</p>
              <p className="font-mono text-caption text-ink-3">{fmtRango(bandaActiva.inicio, bandaActiva.fin)}</p>
            </div>
          </div>
          <div className="w-px h-8 bg-hairline hidden sm:block" />
          <div className="flex flex-col gap-1.5 min-w-[160px]">
            <p className="font-sans text-body-s font-semibold text-white">Semana {semanaDelBloque} de {bandaActiva.semanas}</p>
            <div className="h-[5px] rounded-full bg-track overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, ((semanaDelBloque ?? 0) / bandaActiva.semanas) * 100)}%`, background: bandaActiva.color }} />
            </div>
          </div>
          <div className="w-px h-8 bg-hairline hidden sm:block" />
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-title-l font-semibold text-success">{adherenciaBloque !== null ? `${adherenciaBloque}%` : '—'}</span>
            <span className="text-label text-ink-3 font-sans">adherencia del bloque</span>
          </div>
          {proximoHito && (
            <>
              <div className="w-px h-8 bg-hairline hidden sm:block" />
              <div className="flex items-center gap-2 min-w-0">
                <Icon name="flag" size="s" style={{ color: 'var(--color-accent)' }} />
                <span className="text-label text-ink-2 font-sans truncate">Próximo hito: <b className="text-white font-semibold">{proximoHito.titulo}</b></span>
              </div>
            </>
          )}
          <div className="flex-1" />
          <div className="hidden lg:flex items-center gap-1.5 text-label text-ink-4 font-sans flex-shrink-0">
            <Icon name="zoom_out_map" size="s" />Pinch para alejar / acercar
          </div>
        </div>
      )}

      <div
        onPointerDown={onPointerDownPinch}
        onPointerMove={onPointerMovePinch}
        onPointerUp={onPointerUpPinch}
        onPointerCancel={onPointerUpPinch}
        style={{ transform: pinchScale !== 1 ? `scale(${pinchScale})` : undefined, transition: pinchScale === 1 ? 'transform 200ms ease' : 'none' }}
      >
        {level === 'year' && (
          <NivelAno
            anio={anio} hoy={hoy}
            bandasEntreno={bandasEntreno}
            indice={indice}
            onOpenMonth={abrirMesDesde}
          />
        )}

        {level === 'month' && (
          <NivelMes
            anio={anio} mes={month} hoy={hoy}
            bandasEntreno={bandasEntreno} bandasNutricion={bandasNutricion}
            indice={indice} filter={filter} sel={sel}
            roadmap={roadmap}
            onFilterChange={setFilter}
            onPrevMonth={() => setMonth(prev => Math.max(0, prev - 1))}
            onNextMonth={() => setMonth(prev => Math.min(11, prev + 1))}
            onBackToYear={() => setLevel('year')}
            onOpenDay={setSel}
            onOpenTemplateModal={mesoId => { setModalMesoId(mesoId); setModalOpen(true); }}
            activeQuestionnaireCount={questionnaireAssignments.filter(a => a.active).length}
            volumeEvents={volumeEvents}
            conflicts={conflicts}
            onMoveWorkoutAssignment={onMoveWorkoutAssignment}
            onMoveTask={onMoveReview}
            onMoveVolumeEvent={onMoveVolumeEvent}
            onEditFaseEntreno={banda => setEditandoFase({ banda, kind: 'meso' })}
            onEditFaseNutricion={banda => setEditandoFase({ banda, kind: 'nutri' })}
            mesocycles={mesocycles}
            workoutAssignments={workoutAssignments}
            tasks={tasks}
            carrilVolumen={carrilVolumen}
            onOpenWeek={semana => { setAccionesRango(semana); setAccionesFecha(semana.inicio); }}
          />
        )}

        {level === 'week' && (
          <NivelSemana
            inicio={semanaInicio} hoy={hoy}
            indice={indice}
            bandasEntreno={bandasEntreno} bandasNutricion={bandasNutricion}
            datosSemana={{ workoutAssignments, workoutLogs, workouts, exercises, mesocycles }}
            coachDayNotes={coachDayNotes}
            workoutAssignments={workoutAssignments}
            volumeEvents={volumeEvents}
            sel={sel}
            onPrev={() => setSemanaInicio(prev => addDays(prev, -7))}
            onNext={() => setSemanaInicio(prev => addDays(prev, 7))}
            onBackToMonth={() => { setMonth(new Date(semanaInicio + 'T00:00:00').getMonth()); setLevel('month'); }}
            onOpenDay={setSel}
            onMoveWorkoutAssignment={onMoveWorkoutAssignment}
          />
        )}
      </div>

      {sel && (
        <SheetDia
          fecha={sel} dia={indice.get(sel) ?? null}
          bandaEntreno={bandaEnFecha<BandaEntreno>(bandasEntreno, sel)} bandaNutricion={bandaEnFecha<BandaNutricion>(bandasNutricion, sel)}
          progressPhotos={progressPhotos} coachDayNotes={coachDayNotes} workoutLogs={workoutLogs}
          workoutAssignments={workoutAssignments}
          volumeEvent={volumeEvents.find(e => e.date === sel) ?? null}
          highlighted={(roadmap.highlightedDays ?? []).includes(sel)}
          onToggleDestacado={() => handleToggleDestacado(sel)}
          onSaveNote={text => onSaveDayNote(sel, text)}
          onAbrirNuevoHito={() => setNuevoHitoOpen(true)}
          onAbrirAcciones={() => { setAccionesRango(null); setAccionesFecha(sel); }}
          onMoveWorkoutAssignment={onMoveWorkoutAssignment}
          onGoToTab={onGoToTab}
          onClose={() => setSel(null)}
        />
      )}

      {modalOpen && modalMesoId && (
        <ModalPlantillaCuestionarios
          mesocycle={mesocycles.find(m => m.id === modalMesoId)!}
          questionnaires={questionnaires}
          athleteEmail={athleteEmail}
          coachId={coachId}
          onApply={onApplyTemplate}
          onClose={() => setModalOpen(false)}
        />
      )}

      {plannerOpen && (
        <EventPlannerSheet
          open={plannerOpen} onClose={() => setPlannerOpen(false)}
          defaultDate={sel ?? hoy} mesocycles={mesocycles} workouts={workouts} exercises={exercises}
          onCreateReview={onCreateReview} onAddVolumeRule={onAddVolumeRule}
          onOpenObjectiveEditor={() => { setPlannerOpen(false); setNuevoHitoOpen(true); }}
        />
      )}
      {accionesFecha && (
        <AccionesRapidasSheet
          fecha={accionesFecha}
          rango={accionesRango}
          plantillas={mesocycleTemplates}
          cargandoPlantillas={cargandoPlantillas}
          menus={diets.filter(d => d.menuTemplate)}
          dietas={diets.filter(d => !d.menuTemplate && !d.selfManaged)}
          questionnaires={questionnaires}
          nutritionProgram={nutritionProgram}
          onImportarBloque={onImportarBloque}
          onProgramarMenu={onProgramarMenu}
          onEventoNutricion={onEventoNutricion}
          onAsignarCuestionario={onAsignarCuestionario}
          onAvisarConNota={onAvisarConNota}
          onMarcarRecargas={onMarcarRecargas}
          onClose={() => { setAccionesFecha(null); setAccionesRango(null); }}
        />
      )}

      {nuevoHitoOpen && (
        <NuevoHitoSheet
          fechaInicial={sel ?? hoy}
          onGuardar={handleAddHito}
          onClose={() => setNuevoHitoOpen(false)}
        />
      )}

      {proposeOpen && <ProposePlanSheet open={proposeOpen} onClose={() => setProposeOpen(false)} />}

      {editandoFase && (
        <EditorFaseSheet
          banda={editandoFase.banda}
          kind={editandoFase.kind}
          onResize={editandoFase.kind === 'meso' ? onResizeMesocycle : onResizeNutritionPhase}
          onClose={() => setEditandoFase(null)}
        />
      )}
    </div>
  );
}

// Reexportado para que NivelMes pueda pintar el color de fase sin importar
// roadmapCalendar.ts dos veces con nombres distintos.
export { colorFaseEntreno };
