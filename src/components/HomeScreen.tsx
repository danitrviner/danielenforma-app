import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UserProfile, WeightCheckIn, WeekDay } from '../types';
import { getWorkoutAssignmentsForAthlete, getWorkoutsByIds, getCardioAssignmentsForAthlete, getDietsForAthlete, getAthleteDietConfig, getDietCompletionLog, getOnboarding, getCoachDayNote, getMesocycles } from '../dbService';
import { formatDate, hoyIsoLocal } from '../utils/trainingWeek';
import { bloquesDelCiclo, bloqueActual, EstadoDeDia } from '../utils/cicloDelAtleta';
import { pickActiveZona2Assignment, pickActiveIntervalAssignment } from '../utils/cardioSession';
import { pickTodaysDiet, countMealsDone } from '../utils/nutritionSummary';
import PendingTasksPanel from './PendingTasksPanel';
import SolicitudConsentimientoIA from './SolicitudConsentimientoIA';
import { debePedirseConsentimiento, haSidoAplazado, marcarAplazado } from '../ai/consentimientoIA';
import StepsWidget from './StepsWidget';
import ResourcesPanel from './ResourcesPanel';
import AthleteReportsPanel from './AthleteReportsPanel';
import PlanInPreparationCard from './PlanInPreparationCard';
import RecordatorioGimnasioCard from '../features/gimnasio/RecordatorioGimnasioCard';
import { useTourTarget } from '../features/tutorial/TourTargetContext';
import { Skeleton } from './ui';
import { Icon, Button, PageHeader, ListRow } from './ui';
import { dietaDelDia } from '../utils/diaDeDieta';

type NavTarget = 'checkin' | 'training' | 'nutrition' | 'roadmap' | 'academy' | 'cardio' | 'profile';

interface HomeScreenProps {
  profile: UserProfile;
  checkins: WeightCheckIn[];
  onNavigate: (tab: NavTarget) => void;
}

const JS_TO_WD: Record<number, WeekDay> = { 0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat' };
const DIA_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/* ═══════════════════════════════════════════════════════════════════════════
   HomeScreen — "Hoy" (F3.11, módulo 8 del handoff)

   Una tarea manda: el entreno del día es siempre la primera tarjeta con el
   único botón primario. El cardio nunca aparece por encima del entreno de
   fuerza — solo sube a tarjeta principal en día de descanso (sin nada de
   fuerza programado hoy). La nutrición se resume en una fila de progreso,
   nunca repite el detalle de NutritionScreen. Entreno hecho se confirma en
   verde, no en oro. Sin datos todavía, la tarjeta se omite.

   Fuera de alcance a propósito: el checklist de los "tres primeros pasos"
   (primera sesión, cinco ingestas, lección del RIR) necesita el campo
   `checklistInicial` que el motor de tutorial de F3.12 todavía no ha creado
   — se añade en esa fase, no aquí, para no inventar un modelo de datos que
   F3.12 podría necesitar dar forma distinta.

   Auditoría visual vs. `Hoy - Experiencia.dc.html` (docs/design/fase3):
   cabecera pasa a saludo personalizado + día + racha (dato real,
   `profile.currentStreak`, ya usado en Perfil/Clientes). Se queda FUERA a
   propósito, por no tener dato real que no sea inventado: el pill "DÍA N ·
   SPLIT" y "~N MIN" (no hay campo de duración estimada ni de nombre de
   split en `Workout`). "Semana N de M" tampoco se añade — exigiría resolver
   el mesociclo activo y no hay ese cálculo ya hecho en ningún sitio
   reutilizable. Todo esto queda anotado para Dani en vez de inventado.

   El aviso del coach SÍ tiene ya campo propio (`CoachDayNote`, Roadmap →
   Calendario · sheet de Día · botón "Nota") — se muestra debajo como tarjeta
   propia cuando hay una para hoy, en vez de vivir dentro de esta cabecera.
   ═══════════════════════════════════════════════════════════════════════════ */

// Mismos colores que la pantalla de Rutinas: verde hecho, amarillo el de hoy,
// rojo el que se pasó, gris el que aún no toca.
const MARCO_DEL_DIA: Record<EstadoDeDia, string> = {
  completado: 'border-success/30',
  saltado:    'border-hairline',
  hoy:        'border-accent/50',
  perdido:    'border-danger/30',
  pendiente:  'border-hairline',
};

const TEXTO_DEL_DIA: Record<EstadoDeDia, string> = {
  completado: 'text-success',
  saltado:    'text-ink-3',
  hoy:        'text-accent',
  perdido:    'text-danger',
  pendiente:  'text-ink-2',
};

export default function HomeScreen({ profile, checkins, onNavigate }: HomeScreenProps) {
  // Dentro del componente, no a nivel de módulo: una constante de módulo se
  // calcula una sola vez y se queda anclada al día en que se cargó la app —
  // en una sesión de Capacitor que sigue viva en segundo plano toda la noche,
  // "hoy" se quedaba en ayer y esta pantalla podía desacordar con las que sí
  // recalculaban la fecha en cada render (p. ej. CardioScreen).
  const TODAY_DATE = hoyIsoLocal();
  const TODAY_WD: WeekDay = JS_TO_WD[new Date().getDay()];
  // Nota del coach para hoy (Roadmap → Calendario, sheet de Día · botón
  // "Nota") — cierra el hueco que este archivo documenta más abajo como
  // pendiente por no existir "campo de nota por asignación". Un doc por
  // fetch, no la lista entera: es un dato de un solo día.
  const { data: coachDayNote } = useQuery({
    queryKey: ['coachDayNote', profile.email, TODAY_DATE],
    queryFn: () => getCoachDayNote(profile.email, TODAY_DATE),
  });
  const { data: assignments = [], isPending: loadingAssignments } = useQuery({
    queryKey: ['workoutAssignments', profile.userId],
    queryFn: () => getWorkoutAssignmentsForAthlete({ uid: profile.userId, email: profile.email }),
  });
  // Solo las rutinas que las asignaciones de ESTE atleta referencian, no la
  // colección entera de todos los atletas — antes `getWorkouts()` se bajaba
  // las rutinas de todos los clientes al móvil de cada atleta.
  const workoutIds = React.useMemo(() => Array.from(new Set(assignments.map(a => a.workoutId))), [assignments]);
  const { data: workouts = [], isPending: loadingWorkoutsQuery } = useQuery({
    queryKey: ['workoutsByIds', workoutIds],
    queryFn: () => getWorkoutsByIds(workoutIds),
    enabled: workoutIds.length > 0,
  });
  // Con `enabled: false` (sin ids que pedir) la consulta se queda en
  // `isPending` para siempre porque nunca llega a ejecutarse — sin este `&&`,
  // un atleta sin asignaciones vería el esqueleto de carga sin fin en vez del
  // estado vacío.
  const loadingWorkouts = workoutIds.length > 0 && loadingWorkoutsQuery;

  const { data: cardioAssignments = [] } = useQuery({
    queryKey: ['cardioAssignments', profile.email],
    queryFn: () => getCardioAssignmentsForAthlete(profile.email),
  });
  const { data: mesocycles = [], isPending: loadingMesocycles } = useQuery({
    queryKey: ['mesocycles', profile.email],
    queryFn: () => getMesocycles(profile.email),
  });
  // Los mesociclos delimitan la vuelta: sin ellos la lista se agruparía un
  // instante por semanas de calendario y se recolocaría sola al llegar.
  const loadingTraining = loadingAssignments || loadingWorkouts || loadingMesocycles;
  const { data: diets = [] } = useQuery({
    queryKey: ['dietsForAthlete', profile.email],
    queryFn: () => getDietsForAthlete(profile.email),
  });
  const { data: dietConfig = null } = useQuery({
    queryKey: ['athleteDietConfig', profile.email],
    queryFn: () => getAthleteDietConfig(profile.email).catch(() => null),
  });
  const { data: completionLog } = useQuery({
    queryKey: ['dietCompletionLog', profile.email, TODAY_DATE],
    queryFn: () => getDietCompletionLog(profile.email, TODAY_DATE),
  });

  const sorted = [...assignments].sort((a, b) => a.date.localeCompare(b.date));
  // La misma vuelta del microciclo que enseña Rutinas (Día 1 → Día N, sin cajón
  // de «Atrasados» al final), para que el resumen y la pantalla no cuenten dos
  // historias distintas. La consulta de mesociclos comparte clave de caché con
  // TrainingScreen, así que no añade una lectura por pantalla.
  const diasDelBloque = bloqueActual(bloquesDelCiclo(assignments, workouts, mesocycles, TODAY_DATE), TODAY_DATE)?.dias ?? [];
  const getWorkout = (id: string) => workouts.find(w => w.id === id);

  const todayAssignment = assignments.find(a => a.date === TODAY_DATE);
  const todayWorkout = todayAssignment ? getWorkout(todayAssignment.workoutId) : undefined;
  const isRestDay = !todayAssignment;

  const zona2Assignment = pickActiveZona2Assignment(cardioAssignments, TODAY_DATE);
  const intervalAssignment = pickActiveIntervalAssignment(cardioAssignments, TODAY_DATE);
  const cardioRx = zona2Assignment ?? intervalAssignment;

  /* Las ingestas de HOY salen del registro del día, no de la dieta "programada
     para el martes": el plan del día vive en su propio documento desde 09-2026
     (ver DietCompletionLog.meals). `dietaDelDia` cae a la dieta antigua para
     los días de antes del cambio, así que un histórico viejo se sigue leyendo. */
  const todaysDiet = dietaDelDia(completionLog ?? null, diets) ?? pickTodaysDiet(diets, dietConfig, TODAY_WD);
  const mealsDone = todaysDiet ? countMealsDone(todaysDiet, completionLog?.doneItemIds ?? []) : null;

  /* A-2. Se le pregunta aquí, en la primera pantalla que abre, porque los
     atletas que ya están dentro terminaron su alta hace meses y no van a volver
     a verla. Sin esto el consentimiento solo llegaría a los clientes nuevos.

     T6 (18-08): `aplazado` vivía en el estado del componente, así que "Ahora
     no" solo valía para esa sesión — cada vez que se reabría la app volvía a
     interrumpir a pantalla completa. Ahora se guarda en localStorage: se
     pregunta una vez a pantalla completa, y a partir de ahí la única puerta
     es el interruptor discreto de Perfil → Ajustes → Análisis con IA (que ya
     existe). No es un rechazo —`debePedirseConsentimiento` sigue devolviendo
     `true` sobre el dato real y Ajustes lo sigue enseñando— es solo dejar de
     interrumpir. */
  const { data: onboarding = null } = useQuery({
    queryKey: ['onboarding', profile.email],
    queryFn: () => getOnboarding(profile.email),
  });
  const [aplazado, setAplazado] = useState(() => haSidoAplazado(profile.email));
  const aplazar = () => {
    marcarAplazado(profile.email);
    setAplazado(true);
  };
  const pedirConsentimiento = !aplazado && !!onboarding && debePedirseConsentimiento(onboarding);

  const cardioIsPrimary = isRestDay && !!cardioRx;
  const primaryCardRef = useTourTarget('home-primary-card');
  const cardioRowRef = useTourTarget('home-cardio-row');

  return (
    <div className="space-y-6">
      {pedirConsentimiento && onboarding && (
        <SolicitudConsentimientoIA onboarding={onboarding} onAhoraNo={aplazar} />
      )}

      <PageHeader
        title={`Hola, ${profile.displayName?.split(' ')[0] || 'de nuevo'}`}
        subtitle={DIA_SEMANA[new Date().getDay()]}
        actionInline
        action={profile.currentStreak > 0 ? (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control border border-accent-line bg-accent/13">
            <span className="font-mono text-body-s font-bold text-accent">{profile.currentStreak}</span>
          </span>
        ) : undefined}
      />

      {/* Nota del coach para hoy (Roadmap → Calendario) — encima del entreno
          del día, solo si hay una escrita para la fecha de hoy. */}
      {coachDayNote && (
        <section className="rounded-canvas p-4 border border-accent-line bg-accent/8 flex gap-3">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control font-mono text-caption font-bold text-accent"
            style={{ background: 'rgba(255,199,44,0.16)' }}
          >
            <Icon name="sticky_note_2" size="s" />
          </div>
          <div className="min-w-0">
            <p className="text-caption font-mono uppercase tracking-wider text-accent">Nota de tu entrenador</p>
            <p className="text-body-s font-sans text-ink mt-1 leading-relaxed" style={{ textWrap: 'pretty' }}>{coachDayNote.text}</p>
          </div>
        </section>
      )}

      {!loadingTraining && assignments.length === 0 && (
        <PlanInPreparationCard profile={profile} onNavigate={onNavigate} />
      )}

      {!loadingTraining && assignments.length > 0 && (
        <>
          {/* ── Tarjeta primaria: entreno de fuerza, salvo día de descanso con cardio prescrito ── */}
          {!cardioIsPrimary && todayAssignment && (
            <section ref={primaryCardRef} className={`rounded-canvas p-5 border ${todayAssignment.status === 'completed' ? 'bg-success/8 border-success/25' : 'bg-surface border-hairline'}`}>
              <p className="text-caption font-mono uppercase tracking-wider text-ink-2">
                Entreno de hoy{todayWorkout && ` · ${todayWorkout.exercises.length} ejercicio${todayWorkout.exercises.length === 1 ? '' : 's'}`}
              </p>
              <p className="font-display text-feature font-black uppercase text-ink mt-1">{todayWorkout?.name ?? 'Rutina'}</p>
              {todayAssignment.status === 'completed' ? (
                <p className="flex items-center gap-2 text-body-s font-sans font-bold text-success mt-3">
                  <Icon name="check_circle" size="m" />
                  Hecho
                </p>
              ) : (
                <Button onClick={() => onNavigate('training')} fullWidth size="l" className="mt-4">Empezar entreno</Button>
              )}
            </section>
          )}

          {cardioIsPrimary && cardioRx && (
            <section ref={primaryCardRef} className="rounded-canvas p-5 border bg-surface border-hairline">
              <p className="text-caption font-mono uppercase tracking-wider text-ink-2">Día de descanso · Cardio</p>
              <p className="font-display text-feature font-black uppercase text-ink mt-1">
                {cardioRx.type === 'zona2' ? 'Zona 2' : 'Intervalos'}
              </p>
              <Button onClick={() => onNavigate('cardio')} fullWidth size="l" className="mt-4">Empezar cardio</Button>
            </section>
          )}

          {isRestDay && !cardioRx && (() => {
            const proxima = sorted.find(a => a.date > TODAY_DATE && a.status === 'pending');
            const proximoWorkout = proxima ? getWorkout(proxima.workoutId) : undefined;
            return (
              <section className="rounded-canvas border border-dashed border-strong p-6 text-center">
                <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-field bg-white/5">
                  <Icon name="bedtime" size="m" className="text-ink-3" />
                </span>
                <p className="font-sans text-body-s font-bold text-ink mt-3.5">Hoy toca descanso</p>
                {proximoWorkout && (
                  <p className="font-sans text-body-s text-ink-2 mt-1.5">
                    Próxima sesión: {proximoWorkout.name} · {formatDate(proxima!.date)}
                  </p>
                )}
              </section>
            );
          })()}

          {/* ── Cardio como fila secundaria cuando hoy toca fuerza ── */}
          {!cardioIsPrimary && cardioRx && (
            <div ref={cardioRowRef}>
            <ListRow
              onClick={() => onNavigate('cardio')}
              className="rounded-control border bg-surface border-hairline"
              leading={<Icon name="favorite" size="m" className="text-accent" />}
              title="Cardio"
              subtitle={cardioRx.type === 'zona2' ? 'Zona 2' : 'Intervalos'}
              chevron
            />
            </div>
          )}

          {/* ── Nutrición: fila de progreso, nunca el detalle ──
              Un segmento por ingesta (no una barra única interpolada): son
              datos discretos —cada ingesta está completa o no— y así se ve
              en la maqueta. */}
          {todaysDiet && mealsDone && (
            <button onClick={() => onNavigate('nutrition')} className="w-full text-left bg-surface border border-hairline rounded-control p-4 space-y-3 hover:border-strong transition-colors">
              <div className="flex items-center justify-between">
                <p className="text-caption font-mono uppercase text-ink-2">Nutrición de hoy</p>
                <p className="text-caption font-mono text-ink-2 tabular-nums">{mealsDone.done}/{mealsDone.total} registradas</p>
              </div>
              <div className="flex gap-1" role="img" aria-label={`Ingestas de hoy, ${mealsDone.done} de ${mealsDone.total}`}>
                {Array.from({ length: mealsDone.total }, (_, i) => (
                  <span key={i} className={`h-1.5 flex-1 rounded-full ${i < mealsDone.done ? 'bg-accent' : 'bg-track'}`} />
                ))}
              </div>
            </button>
          )}
        </>
      )}

      {/* Va ANTES de las tareas: si el atleta omitió el catálogo, es lo único
          de esta pantalla que le pide terminar algo que él mismo dejó a medias.
          No entra en PendingTasksPanel porque ahí todas las filas tienen la
          misma forma y esta lleva barra de progreso y recuento propios. */}
      <RecordatorioGimnasioCard email={profile.email} />

      <PendingTasksPanel profile={profile} checkins={checkins} onNavigate={onNavigate} />

      <AthleteReportsPanel athleteEmail={profile.email} />

      <StepsWidget athleteEmail={profile.email} />

      {/* ── La vuelta del microciclo en curso, del Día 1 al Día N ────────────── */}
      {(loadingTraining || assignments.length > 0) && (
      <section className="bg-surface border border-hairline rounded-surface p-4 sm:p-5">
        <h2 className="font-sans font-bold uppercase tracking-tight text-title-s text-white mb-3 pb-2 border-b border-hairline flex items-center gap-2">
          <Icon name="fitness_center" size="l" className="text-accent" />
          Esta semana
          <button
            onClick={() => onNavigate('training')}
            className="ml-auto text-caption font-mono font-bold uppercase text-ink-2 hover:text-accent transition-colors"
          >
            Ver todo
          </button>
        </h2>

        {loadingTraining ? (
          <div className="space-y-2">
            <Skeleton className="h-11 w-full rounded-surface" />
            <Skeleton className="h-11 w-full rounded-surface" />
          </div>
        ) : diasDelBloque.length === 0 ? (
          <p className="text-label text-ink-3 font-sans py-2">Sin entrenamientos pendientes esta semana.</p>
        ) : (
          <div className="space-y-2">
            {diasDelBloque.map(({ assignment: a, estado }) => (
              <ListRow
                key={a.id}
                onClick={() => onNavigate('training')}
                className={`rounded-control border bg-raised ${MARCO_DEL_DIA[estado]}`}
                title={getWorkout(a.workoutId)?.name || 'Rutina'}
                trailing={<span className={`font-mono text-caption flex-shrink-0 ${TEXTO_DEL_DIA[estado]}`}>{formatDate(a.date)}</span>}
              />
            ))}
          </div>
        )}
      </section>
      )}

      <ResourcesPanel isCoach={false} />
    </div>
  );
}
