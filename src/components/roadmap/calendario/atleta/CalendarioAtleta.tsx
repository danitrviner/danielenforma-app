import React, { useMemo, useState } from 'react';
import {
  Mesocycle, NutritionProgram, Roadmap, WorkoutAssignment, WorkoutLog, Workout, Exercise,
  Diet, DietCompletionLog, CardioSession, BodyweightLog, TaskItem, ProgressPhoto, CoachDayNote,
} from '../../../../types';
import {
  DatosCalendario, construirIndiceDeDias, construirBandasEntreno, construirBandasNutricion,
  bandaEnFecha, BandaEntreno, BandaNutricion,
} from '../../../../utils/roadmapCalendar';
import { construirCamino } from '../../../../utils/caminoDelPlan';
import { hoyIsoLocal, getWeekStart, addDays } from '../../../../utils/trainingWeek';
import { semanasDelMes } from '../../../../utils/accionesCalendario';
import { deriveVolumeIncreaseEvents } from '../../../../utils/planEvents';
import { Icon, EmptyState } from '../../../ui';
import { mezcla } from '../paleta';
import NivelAno from '../NivelAno';
import MesAtleta from './MesAtleta';
import SemanaAtleta from './SemanaAtleta';
import SheetDiaAtleta from './SheetDiaAtleta';

type Nivel = 'ano' | 'mes' | 'semana';

const MESES_CORTO = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
function fmtCorta(fecha: string): string {
  const [, m, d] = fecha.split('-');
  return `${Number(d)} ${MESES_CORTO[Number(m) - 1]}`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Calendario del atleta — el mismo plan que ve el coach en Plan › Road map ›
   Calendario, en modo mirar.

   Reutiliza TODO el motor de datos del calendario del coach
   (`construirIndiceDeDias`, las bandas de fase, los eventos de volumen) y el
   Nivel Año tal cual, que ya era de solo lectura. Lo que cambia son los dos
   niveles densos —Mes y Semana— y el sheet de Día, que aquí se rehacen para
   caber en un móvil y sin un solo control de edición.

   Encima de los niveles va el «camino»: cuánto llevas del plan y cuánto te
   queda. Es lo que el atleta venía a mirar y no estaba en ningún nivel del
   calendario del coach, porque el coach ya lo sabe.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
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
  coachDayNotes: CoachDayNote[];
}

/** «Lo recorrido y lo que queda» — la barra del plan entero, por bloques. */
function CaminoDelPlan({ camino, hoy }: { camino: ReturnType<typeof construirCamino>; hoy: string }) {
  if (!camino) return null;
  const { tramos, actual, siguiente, progresoPct, semanasRecorridas, semanasTotales, diasRestantes, aunNoEmpieza } = camino;

  return (
    <div className="bg-surface border border-hairline rounded-surface px-4 sm:px-5 py-4 space-y-3.5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="font-mono text-caption uppercase tracking-wider text-ink-3">Tu camino</p>
          <p className="font-sans font-bold text-title-s text-white mt-1 truncate">
            {aunNoEmpieza
              ? `Empiezas el ${fmtCorta(camino.inicio)}`
              : actual
                ? `${actual.nombre} · semana ${actual.semanaEnCurso} de ${actual.semanas}`
                : 'Plan completado'}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="font-mono text-title-l font-semibold text-accent leading-none">{progresoPct}%</p>
          <p className="font-mono text-caption text-ink-4 mt-1">semana {semanasRecorridas} de {semanasTotales}</p>
        </div>
      </div>

      {/* Un segmento por bloque, con el ancho proporcional a sus semanas: el
          recorrido va a color pleno, el actual a medias con su propio relleno
          y lo que queda en gris. Es la misma información que la banda del
          Nivel Año, pero legible de un vistazo en un móvil. */}
      <div className="flex gap-[3px] rounded-full overflow-hidden" style={{ height: 10 }}>
        {tramos.map(t => (
          <div
            key={t.id}
            title={`${t.nombre} · ${fmtCorta(t.inicio)} — ${fmtCorta(t.fin)}`}
            className="relative overflow-hidden"
            style={{ flex: t.semanas, background: t.estado === 'por-recorrer' ? 'var(--color-track)' : mezcla(t.color, 28) }}
          >
            <div style={{ width: `${t.progresoPct}%`, height: '100%', background: t.color }} />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap font-sans text-label text-ink-3">
        <span className="flex items-center gap-1.5">
          <Icon name="flag" size="s" style={{ color: 'var(--color-accent)' }} />
          {diasRestantes > 0 ? `Quedan ${diasRestantes} días de plan` : 'El plan llega hasta hoy'}
        </span>
        {siguiente && (
          <span className="flex items-center gap-1.5 min-w-0">
            <Icon name={siguiente.icono} size="s" style={{ color: siguiente.color }} />
            <span className="truncate">Después: {siguiente.nombre} ({fmtCorta(siguiente.inicio)})</span>
          </span>
        )}
        {hoy > camino.fin && <span className="text-ink-4">Tu entrenador aún no ha programado lo siguiente.</span>}
      </div>
    </div>
  );
}

export default function CalendarioAtleta(props: Props) {
  const {
    mesocycles, nutritionProgram, roadmap, workoutAssignments, workoutLogs, workouts, exercises,
    diets, dietCompletionLogs, cardioSessions, bodyweightLogs, tasks, progressPhotos, coachDayNotes,
  } = props;

  const hoy = hoyIsoLocal();
  const anio = new Date().getFullYear();

  const [nivel, setNivel] = useState<Nivel>('mes');
  const [mes, setMes] = useState<number>(new Date().getMonth());
  const [semanaInicio, setSemanaInicio] = useState<string>(() => getWeekStart(hoyIsoLocal()));
  const [sel, setSel] = useState<string | null>(null);

  const datos: DatosCalendario = useMemo(() => ({
    mesocycles, nutritionProgram, workoutAssignments, workoutLogs, workouts, diets,
    dietCompletionLogs, cardioSessions, bodyweightLogs, tasks, roadmapItems: roadmap.items,
    highlightedDays: roadmap.highlightedDays ?? [],
  }), [mesocycles, nutritionProgram, workoutAssignments, workoutLogs, workouts, diets, dietCompletionLogs, cardioSessions, bodyweightLogs, tasks, roadmap.items, roadmap.highlightedDays]);

  const indice = useMemo(() => construirIndiceDeDias(datos, hoy), [datos, hoy]);
  const bandasEntreno = useMemo(() => construirBandasEntreno(mesocycles), [mesocycles]);
  const bandasNutricion = useMemo(() => construirBandasNutricion(nutritionProgram), [nutritionProgram]);
  const camino = useMemo(() => construirCamino(bandasEntreno, hoy), [bandasEntreno, hoy]);
  const semanas = useMemo(() => semanasDelMes(anio, mes), [anio, mes]);

  // Los marcadores de subida de volumen se derivan sin `ConditionData`: la
  // versión condicional («sube si la adherencia va bien») es una decisión del
  // coach a medio tomar, y enseñarle al atleta un "+1 serie" que a lo mejor no
  // ocurre es peor que no enseñarlo. Sin condición, solo salen los planificados.
  const volumeEvents = useMemo(
    () => mesocycles.flatMap(m => deriveVolumeIncreaseEvents(workouts, exercises, m, hoy)),
    [mesocycles, workouts, exercises, hoy],
  );

  const datosSemana = useMemo(
    () => ({ workoutAssignments, workoutLogs, workouts, exercises, mesocycles }),
    [workoutAssignments, workoutLogs, workouts, exercises, mesocycles],
  );

  function irAHoy() {
    setMes(new Date().getMonth());
    setSemanaInicio(getWeekStart(hoy));
    setNivel('mes');
    setSel(hoy);
  }
  function abrirSemana(fecha: string) {
    setSemanaInicio(getWeekStart(fecha));
    setNivel('semana');
  }

  if (mesocycles.length === 0 && !nutritionProgram) {
    return (
      <EmptyState
        icon="calendar_month"
        title="Todavía no hay calendario."
        description="En cuanto tu entrenador programe tu primer bloque, aquí verás el camino completo, día a día."
      />
    );
  }

  const SEGMENTOS: { id: Nivel; label: string; activo: boolean }[] = [
    { id: 'ano', label: 'Año', activo: nivel === 'ano' },
    { id: 'mes', label: 'Mes', activo: nivel === 'mes' },
    { id: 'semana', label: 'Semana', activo: nivel === 'semana' },
  ];

  return (
    <div className="space-y-3.5">
      <CaminoDelPlan camino={camino} hoy={hoy} />

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-0.5 bg-raised rounded-control p-[3px] flex-1 sm:flex-none">
          {SEGMENTOS.map(seg => (
            <button
              key={seg.id}
              type="button"
              onClick={() => {
                // Cambiar de nivel cierra el sheet: si no, tocas «Semana» y la
                // pantalla parece no responder porque el día sigue encima.
                if (seg.id === 'semana') abrirSemana(sel ?? (nivel === 'mes' && new Date(hoy + 'T00:00:00').getMonth() !== mes ? `${anio}-${String(mes + 1).padStart(2, '0')}-01` : hoy));
                else setNivel(seg.id);
                setSel(null);
              }}
              className="flex-1 sm:flex-none rounded-control text-label font-sans px-3.5 py-2 transition-colors"
              style={{
                background: seg.activo ? 'var(--color-track)' : 'transparent',
                color: seg.activo ? 'var(--color-ink)' : 'var(--color-ink-3)',
                fontWeight: seg.activo ? 600 : 400,
              }}
            >
              {seg.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={irAHoy}
          className="flex items-center gap-1.5 border border-hairline rounded-control px-3 py-2 text-label font-sans font-semibold text-white hover:border-accent-line transition-colors flex-shrink-0"
        >
          <Icon name="today" size="s" />Hoy
        </button>
      </div>

      {nivel === 'ano' && (
        <NivelAno
          anio={anio} hoy={hoy}
          bandasEntreno={bandasEntreno}
          indice={indice}
          mostrarBandas={false}
          onOpenMonth={mi => { setMes(mi); setNivel('mes'); }}
        />
      )}

      {nivel === 'mes' && (
        <MesAtleta
          anio={anio} mes={mes} hoy={hoy}
          indice={indice}
          bandasEntreno={bandasEntreno} bandasNutricion={bandasNutricion}
          sel={sel}
          semanas={semanas}
          onPrevMes={() => setMes(prev => Math.max(0, prev - 1))}
          onNextMes={() => setMes(prev => Math.min(11, prev + 1))}
          onVolverAlAno={() => setNivel('ano')}
          onAbrirDia={setSel}
          onAbrirSemana={abrirSemana}
        />
      )}

      {nivel === 'semana' && (
        <SemanaAtleta
          inicio={semanaInicio} hoy={hoy}
          indice={indice}
          bandasEntreno={bandasEntreno} bandasNutricion={bandasNutricion}
          datosSemana={datosSemana}
          coachDayNotes={coachDayNotes}
          volumeEvents={volumeEvents}
          sel={sel}
          onPrev={() => setSemanaInicio(prev => addDays(prev, -7))}
          onNext={() => setSemanaInicio(prev => addDays(prev, 7))}
          onVolverAlMes={() => { setMes(new Date(semanaInicio + 'T00:00:00').getMonth()); setNivel('mes'); }}
          onAbrirDia={setSel}
        />
      )}

      {sel && (
        <SheetDiaAtleta
          fecha={sel}
          dia={indice.get(sel) ?? null}
          bandaEntreno={bandaEnFecha<BandaEntreno>(bandasEntreno, sel)}
          bandaNutricion={bandaEnFecha<BandaNutricion>(bandasNutricion, sel)}
          datosSemana={datosSemana}
          coachDayNotes={coachDayNotes}
          workoutLogs={workoutLogs}
          progressPhotos={progressPhotos}
          volumeEvent={volumeEvents.find(e => e.date === sel) ?? null}
          onClose={() => setSel(null)}
        />
      )}
    </div>
  );
}
