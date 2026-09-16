import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  UserProfile, WeightCheckIn, OnboardingData, Mesocycle, WorkoutAssignment, Diet,
  AthleteDietConfig, AthleteNutritionConfig, QuestionnaireAssignment, PhotoAssignment,
  ProgressPhoto, WorkoutLog, CoachClientTask,
} from '../../types';
import {
  getRoadmap, getNutritionProgram, getWeeklyChallenge, getCoachClientTasks,
  setSeededTaskDone, createCoachClientTask, updateCoachClientTask, deleteCoachClientTask,
  updateUserProfile, getWorkouts, getCardioAssignmentsForAthlete,
} from '../../dbService';
import { getDossier } from '../../db/dossier';
import { computeSetupChecklist } from '../../utils/clientSetup';
import { revisarCalidadDelPlan, defectosQueBloquean, mesoEnCurso, DIAS_AVISO_RENOVACION } from '../../utils/calidadDelPlan';
import { tareaPorId } from '../../ai/tareas';
import { OPEN_AI_PANEL_EVENT, OpenAiPanelDetail } from '../../ai/events';
import { diasEntreFechas, addDays } from '../../utils/trainingWeek';
import { construirRecorrido, PasoConEstado } from '../../utils/implantacion';
import { clasificarAviso } from '../../utils/avisosDelCoach';
import { idDePaso } from '../../utils/recorridoDelPlan';
import { hoyIsoLocal } from '../../utils/trainingWeek';
import { isoWeekKey } from '../../utils/challengeOptions';
import { mensajeDeErrorFirestore } from '../../utils/erroresFirestore';
import { useToast } from '../../hooks/useToast';
import { HubTab } from '../ClientHub';
import IndiceRecorrido, { tituloCorto } from './IndiceRecorrido';
import DetallePaso from './DetallePaso';
import { Card, RingSeal, Button, Banner, ListRow, Icon, Input } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   IMPLANTACIÓN — montar el programa de un atleta, de la A a la Z.

   Sustituye a la checklist de Setup. El motor de estado es el MISMO
   (`computeSetupChecklist`): lo que cambia es la forma de recorrerlo.

   ── Qué problema resuelve ──────────────────────────────────────────────────
   La checklist marcaba lo que faltaba, pero al pulsar un ítem te sacaba de la
   pestaña y te dejaba en un editor sin hilo: montar un cliente era ir y volver
   once veces. Aquí el índice de la izquierda no se mueve nunca, el paso vive a
   la derecha y el editor de verdad se abre ENCIMA en una hoja, así que al
   cerrarlo sigues en el mismo punto del recorrido.

   ── Solo el montaje ────────────────────────────────────────────────────────
   Los seis bloques A-F de `recorridoDelPlan.ts`: construir el programa, que es
   lo que se hace de una sentada al dar de alta o al renovar.

   Los ítems de acompañamiento (contacto diario, reseña, referidos, decisión de
   renovación) se siguen calculando en `clientSetup.ts` —alimentan el % de la
   parrilla de clientes y las alertas— pero ya NO se pintan: eran una lista de
   recordatorios genéricos que no decían nada que Dani no supiera, y metidos
   aquí solo alargaban la pantalla.

   Lo que sí se queda son las TAREAS SUELTAS con fecha, abajo: es la única
   forma de dejarse un recordatorio propio sobre un cliente.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Con el bloque a una semana de acabarse, la pantalla cambia a modo renovación. */

interface Props {
  athlete: UserProfile;
  checkins: WeightCheckIn[];
  onboarding: OnboardingData | null;
  mesocycles: Mesocycle[];
  workoutAssignments: WorkoutAssignment[];
  diets: Diet[];
  dietConfig: AthleteDietConfig | null;
  nutritionConfig: AthleteNutritionConfig | null;
  qAssignments: QuestionnaireAssignment[];
  photoAssignments: PhotoAssignment[];
  photos: ProgressPhoto[];
  workoutLogs: WorkoutLog[];
  onGoToTab: (tab: HubTab) => void;
  /** Abre el editor de esa pestaña en una hoja, sin salir del recorrido. */
  onAbrirEditor: (tab: HubTab) => void;
}

export default function ClientImplantacionPanel({
  athlete, checkins, onboarding, mesocycles, workoutAssignments, diets,
  dietConfig, nutritionConfig, qAssignments, photoAssignments, photos,
  workoutLogs, onGoToTab, onAbrirEditor,
}: Props) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const hoy = hoyIsoLocal();
  const tareasKey = ['coachClientTasks', athlete.email] as const;

  /* Estas cuatro ya NO llevan valor por defecto y ya no forman un `cargando`
     que tape la pantalla entera. Mientras no llegan valen `undefined`, que
     para la checklist es «todavía no se sabe» —no «no hay»—, así que el
     recorrido se pinta de inmediato con lo que ya se sabe y esos pasos van
     apareciendo. Antes el coach miraba un esqueleto hasta que respondía la
     más lenta de las cuatro. */
  const { data: roadmap, isPending: cargandoRoadmap } = useQuery({
    queryKey: ['roadmap', athlete.email], queryFn: () => getRoadmap(athlete.email),
  });
  const { data: nutritionProgram, isPending: cargandoPrograma } = useQuery({
    queryKey: ['nutritionProgram', athlete.email], queryFn: () => getNutritionProgram(athlete.email),
  });
  const { data: weeklyChallenge, isPending: cargandoReto } = useQuery({
    queryKey: ['weeklyChallenge', athlete.email, isoWeekKey(hoy)],
    queryFn: () => getWeeklyChallenge(athlete.email, isoWeekKey(hoy)),
  });
  const { data: manualTasks, isPending: cargandoTareas } = useQuery({
    queryKey: tareasKey, queryFn: () => getCoachClientTasks(athlete.email),
  });
  // Las rutinas solo hacen falta para el repaso de calidad —mirar si las
  // sesiones del bloque tienen ejercicios dentro—, así que NO entran en
  // `cargando`: el recorrido se pinta sin esperarlas y el repaso aparece
  // cuando llegan. Clave compartida con Entrenamientos.
  // Sin `= []`: para la checklist, `[]` es «lo he mirado y no hay» y sale
  // como pendiente; `undefined` es «todavía no sé» y sale como `na`.
  const { data: workouts } = useQuery({
    queryKey: ['workouts'], queryFn: getWorkouts,
  });
  // Estas dos cierran dos pasos que hasta ahora había que marcar a mano
  // aunque el dato estuviera en Firestore. Tampoco entran en `cargando`:
  // mientras no llegan, esos pasos salen como «todavía no se sabe» en vez de
  // como pendientes, que sería mentir.
  const { data: cardioAssignments } = useQuery({
    queryKey: ['cardioAssignments', athlete.email],
    queryFn: () => getCardioAssignmentsForAthlete(athlete.email),
  });
  const { data: dossier } = useQuery({
    queryKey: ['dossier', athlete.email], queryFn: () => getDossier(athlete.email),
  });
  /* `cargando` ya no decide si se pinta la pantalla: decide si se puede
     GUARDAR el resumen y elegir el paso inicial. Las dos cosas necesitan el
     recorrido completo —un % calculado a medias se guardaría en el perfil y
     saldría en la parrilla de clientes— así que esas dos siguen esperando. */
  const cargando = cargandoRoadmap || cargandoPrograma || cargandoReto || cargandoTareas
    || workouts === undefined || cardioAssignments === undefined || dossier === undefined;
  const tareasManuales = useMemo(() => manualTasks ?? [], [manualTasks]);

  // ── Antes de publicar ──────────────────────────────────────────────────────
  // Lo que está puesto pero mal puesto. La checklist contesta a «¿está hecho?»;
  // esto a «¿está bien?», que no es lo mismo: un grupo prioritario con cero
  // series está hecho y está roto.
  const defectos = useMemo(() => revisarCalidadDelPlan({
    profile: athlete, mesocycles, workouts, diets, dietConfig,
    qAssignments, photoAssignments, roadmap, today: hoy,
  }), [athlete, mesocycles, workouts, diets, dietConfig, qAssignments, photoAssignments, roadmap, hoy]);
  const bloqueantes = useMemo(() => defectosQueBloquean(defectos), [defectos]);

  // ── ¿Montar o renovar? ─────────────────────────────────────────────────────
  // Un cliente sin ningún bloque se monta desde cero; uno cuyo bloque se acaba
  // esta semana se RENUEVA, que no es lo mismo: la propuesta tiene que partir
  // de lo que pasó, no del alta. La pantalla no puede ofrecer lo mismo en los
  // dos casos y esperar que el coach se acuerde de cuál le toca.
  const enCurso = useMemo(() => mesoEnCurso(mesocycles, hoy), [mesocycles, hoy]);
  const diasParaCerrar = enCurso
    ? diasEntreFechas(hoy, addDays(enCurso.startDate, enCurso.weeks * 7 - 1))
    : null;
  const tocaRenovar = diasParaCerrar !== null && diasParaCerrar <= DIAS_AVISO_RENOVACION;
  const esClienteNuevo = mesocycles.length === 0;

  const lanzarTarea = (id: 'mes_nuevo' | 'renovar_mes') => {
    const tarea = tareaPorId(id);
    if (!tarea) return;
    const nombre = athlete.displayName?.trim() || athlete.email;
    window.dispatchEvent(new CustomEvent<OpenAiPanelDetail>(OPEN_AI_PANEL_EVENT, {
      detail: { prompt: tarea.prompt(nombre, athlete.email), enviar: true },
    }));
  };

  const [activo, setActivo] = useState<string | null>(null);
  const [tituloExtra, setTituloExtra] = useState('');
  const [fechaExtra, setFechaExtra] = useState('');

  const resultado = useMemo(() => computeSetupChecklist({
    profile: athlete, onboarding, checkins, mesocycles, workoutAssignments,
    diets, dietConfig, nutritionConfig, qAssignments, photoAssignments, photos,
    workoutLogs, roadmap, nutritionProgram, weeklyChallenge, manualTasks, today: hoy,
    workouts, cardioAssignments, dossier,
  }), [athlete, onboarding, checkins, mesocycles, workoutAssignments, diets, dietConfig,
    nutritionConfig, qAssignments, photoAssignments, photos, workoutLogs, roadmap,
    nutritionProgram, weeklyChallenge, manualTasks, hoy,
    workouts, cardioAssignments, dossier]);

  const recorrido = useMemo(
    () => construirRecorrido(resultado, tareasManuales),
    [resultado, tareasManuales],
  );

  // El % que ve la parrilla de clientes, para que no tenga que recalcular la
  // checklist entera por tarjeta. Se guarda solo cuando cambia de verdad.
  useEffect(() => {
    if (cargando) return;
    const prev = athlete.setupSummary;
    if (prev && prev.pct === resultado.globalPct && prev.attention === resultado.attentionCount) return;
    updateUserProfile(athlete.userId, {
      setupSummary: {
        pct: resultado.globalPct, attention: resultado.attentionCount,
        updatedAt: new Date().toISOString(),
      },
    }).catch(console.error);
    // `athlete.setupSummary` solo se lee para el guard de «ya coincide»:
    // incluirlo en las dependencias dispararía el efecto en bucle, porque el
    // propio guardado actualiza el perfil que lo contiene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargando, resultado.globalPct, resultado.attentionCount, athlete.userId]);

  // Arranca en el paso que toca, una sola vez: el coach abre esto para seguir
  // por donde iba, no para elegir por dónde empezar.
  useEffect(() => {
    if (cargando || activo !== null) return;
    setActivo(recorrido.siguiente?.paso.numero ?? recorrido.bloques[0].pasos[0].paso.numero);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargando]);

  const extras = tareasManuales.filter(t => t.createdBy === 'coach');
  const pasos = recorrido.bloques.flatMap(b => b.pasos);
  const elegido = pasos.find(p => p.paso.numero === activo) ?? null;

  const avisosUrgentes = useMemo(
    () => new Set(pasos.filter(p => p.aviso && p.aviso <= hoy && p.estado !== 'done').map(p => p.paso.numero)),
    [pasos, hoy],
  );

  // ── Escrituras, todas optimistas con vuelta atrás ─────────────────────────
  // Si Firestore rechaza de verdad (permiso denegado) hay que deshacer y
  // avisar: si no, la pantalla del coach dice una cosa y la base otra.
  const escribirTarea = async (
    paso: PasoConEstado, hecho: boolean, fecha: string | null | undefined, accion: string,
  ) => {
    const itemId = idDePaso(paso.paso);
    const titulo = tituloCorto(paso);
    const previo = queryClient.getQueryData<CoachClientTask[]>(tareasKey);
    queryClient.setQueryData<CoachClientTask[]>(tareasKey, prev => {
      const lista = prev ?? [];
      const yaEsta = lista.find(t => t.itemId === itemId);
      const dueDate = fecha === undefined ? yaEsta?.dueDate : (fecha ?? undefined);
      if (yaEsta) return lista.map(t => t.itemId === itemId ? { ...t, done: hecho, dueDate } : t);
      return [...lista, {
        id: `${athlete.email}_${itemId}`, athleteId: athlete.email, itemId, title: titulo,
        phase: paso.paso.bloque, done: hecho, dueDate,
        createdBy: 'seed' as const, createdAt: new Date().toISOString(),
      }];
    });
    try {
      await setSeededTaskDone(athlete.email, itemId, titulo, paso.paso.bloque, hecho, fecha);
    } catch (err) {
      console.error(err);
      queryClient.setQueryData(tareasKey, previo);
      showToast(mensajeDeErrorFirestore(err, accion));
    }
  };

  const marcarPaso = (paso: PasoConEstado, hecho: boolean) =>
    escribirTarea(paso, hecho, undefined, 'marcar el paso');

  const ponerFecha = (paso: PasoConEstado, fecha: string | undefined) =>
    escribirTarea(paso, paso.estado === 'done', fecha ?? null, 'guardar el recordatorio');

  const crearExtra = async (titulo: string, fecha?: string) => {
    try {
      const task = await createCoachClientTask({
        athleteId: athlete.email, title: titulo, done: false,
        createdBy: 'coach', createdAt: new Date().toISOString(), dueDate: fecha,
      });
      queryClient.setQueryData<CoachClientTask[]>(tareasKey, prev => [...(prev ?? []), task]);
    } catch (err) {
      console.error(err);
      showToast(mensajeDeErrorFirestore(err, 'añadir la tarea'));
    }
  };

  const cambiarExtra = async (task: CoachClientTask, cambios: Partial<CoachClientTask>) => {
    const previo = queryClient.getQueryData<CoachClientTask[]>(tareasKey);
    queryClient.setQueryData<CoachClientTask[]>(tareasKey, prev =>
      prev?.map(t => t.id === task.id ? { ...t, ...cambios } : t));
    try {
      await updateCoachClientTask(task.id, cambios);
    } catch (err) {
      console.error(err);
      queryClient.setQueryData(tareasKey, previo);
      showToast(mensajeDeErrorFirestore(err, 'guardar la tarea'));
    }
  };

  const borrarExtra = async (task: CoachClientTask) => {
    const previo = queryClient.getQueryData<CoachClientTask[]>(tareasKey);
    queryClient.setQueryData<CoachClientTask[]>(tareasKey, prev => prev?.filter(t => t.id !== task.id));
    try {
      await deleteCoachClientTask(task.id);
    } catch (err) {
      console.error(err);
      queryClient.setQueryData(tareasKey, previo);
      showToast(mensajeDeErrorFirestore(err, 'eliminar la tarea'));
    }
  };

  return (
    <div className="space-y-5">
      {/* ── Cabecera ──────────────────────────────────────────────────────── */}
      <Card className="flex flex-wrap items-center gap-4">
        {/* UN solo hijo: `RingSeal` centra lo que reciba en un flex horizontal,
            así que dos elementos sueltos salen uno al lado del otro y la
            etiqueta se desborda del anillo. La columna va dentro. */}
        <RingSeal
          percent={recorrido.pct}
          size={104}
          strokeWidth={9}
          complete={recorrido.pct >= 100}
          label={`Montaje del plan al ${recorrido.pct}%`}
        >
          <div className="flex flex-col items-center justify-center">
            <span className="font-display font-black text-title-l text-ink leading-none tabular-nums">
              {recorrido.pct}%
            </span>
            <span className="font-mono text-caption text-ink-2 uppercase tracking-widest mt-1">Montaje</span>
          </div>
        </RingSeal>
        <div className="min-w-0 flex-1">
          {recorrido.siguiente ? (
            <>
              <span className="font-mono text-caption text-ink-2 uppercase tracking-[.1em] block">
                Siguiente paso
              </span>
              <span className="font-sans font-bold text-title-s text-ink block">
                {tituloCorto(recorrido.siguiente)}
              </span>
              <span className="font-mono text-caption text-ink-3">
                Quedan {recorrido.pendientes} de {pasos.length}
              </span>
            </>
          ) : (
            <span className="font-sans font-bold text-title-s text-ink">
              El mes está montado entero.
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {recorrido.siguiente && (
            <Button onClick={() => setActivo(recorrido.siguiente!.paso.numero)}>
              Ir al siguiente
            </Button>
          )}
          {/* El mes entero de una vez. El paso a paso sigue estando en cada
              paso; esto es para cuando se monta de una sentada. */}
          <Button variant="secondary" onClick={() => lanzarTarea(esClienteNuevo ? 'mes_nuevo' : 'renovar_mes')}>
            <Icon name="auto_awesome" size="s" />
            {esClienteNuevo ? 'Montar el mes con el asistente' : 'Montar el mes siguiente'}
          </Button>
        </div>
      </Card>

      {/* ── Se acaba el bloque ────────────────────────────────────────────── */}
      {tocaRenovar && enCurso && (
        <Card
          title={diasParaCerrar === 0
            ? 'El bloque termina hoy'
            : diasParaCerrar === 1
              ? 'El bloque termina mañana'
              : `El bloque termina en ${diasParaCerrar} días`}
          className="space-y-3"
        >
          <p className="font-sans text-label text-ink-2 leading-relaxed">
            «{enCurso.name}» llega a su última semana. Renovar no es montar otra vez desde cero:
            lo que decidas ahora sale de lo que ha pasado estas semanas, no del alta.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => onGoToTab('revision')}>
              <Icon name="query_stats" size="s" />
              Ver cómo ha ido
            </Button>
            <Button variant="secondary" onClick={() => lanzarTarea('renovar_mes')}>
              <Icon name="auto_awesome" size="s" />
              Preparar el mes siguiente
            </Button>
            <Button variant="ghost" onClick={() => onAbrirEditor('entrenamientos')}>
              Crear el bloque nuevo
            </Button>
          </div>
        </Card>
      )}

      {/* ── Antes de publicar ────────────────────────────────────────────── */}
      {defectos.length > 0 && (
        <Card
          title="Antes de publicar"
          action={
            <span className="font-mono text-caption text-ink-3">
              {bloqueantes.length > 0
                ? `${bloqueantes.length} ${bloqueantes.length === 1 ? 'rompe' : 'rompen'} algo que ve el atleta`
                : 'nada roto, solo cosas que mirar'}
            </span>
          }
          className="space-y-2"
        >
          <ul className="space-y-2 list-none">
            {defectos.map(d => (
              <li key={d.id} className="flex items-start gap-2.5">
                <Icon
                  name={d.gravedad === 'bloquea' ? 'error' : 'info'}
                  size="s"
                  className={`mt-0.5 shrink-0 ${d.gravedad === 'bloquea' ? 'text-danger' : 'text-warning'}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="font-sans text-label text-ink block">{d.titulo}</span>
                  <span className="font-mono text-caption text-ink-3 block leading-relaxed">
                    {d.consecuencia}
                  </span>
                </span>
                {d.tab && (
                  <Button variant="ghost" onClick={() => onAbrirEditor(d.tab as HubTab)}>
                    Arreglar
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <p className="font-mono text-caption text-ink-3 leading-relaxed">
            Esto no es la checklist: son cosas que están hechas pero mal hechas, y que ninguna
            comprobación automática de las de arriba puede ver.
          </p>
        </Card>
      )}

      {avisosUrgentes.size > 0 && (
        <Banner tone="danger">
          {avisosUrgentes.size === 1
            ? 'Tienes un recordatorio vencido en el montaje.'
            : `Tienes ${avisosUrgentes.size} recordatorios vencidos en el montaje.`}
        </Banner>
      )}

      {/* Índice a la izquierda y paso a la derecha. En móvil se apila: el
          índice arriba, el paso debajo. */}
      <div className="flex flex-col lg:flex-row gap-5 lg:items-start">
          <Card className="lg:w-[17rem] shrink-0" padding="s">
            <IndiceRecorrido
              bloques={recorrido.bloques}
              activo={activo}
              onElegir={setActivo}
              avisosUrgentes={avisosUrgentes}
            />
          </Card>
          <Card className="flex-1 min-w-0">
            {elegido ? (
              <DetallePaso
                paso={elegido}
                titulo={tituloCorto(elegido)}
                athlete={athlete}
                onAbrirEditor={onAbrirEditor}
                onMarcar={marcarPaso}
                onFecha={ponerFecha}
              />
            ) : (
              <p className="font-sans text-label text-ink-3">Elige un paso del índice.</p>
            )}
          </Card>
      </div>

      {/* ── Tus tareas con este cliente ────────────────────────────────────
          Lo único que sobrevive del carril de seguimiento: los recordatorios
          que el coach se pone él mismo. Van con fecha, y lo vencido sale
          arriba en rojo y en la campana. */}
      <Card title="Tus tareas con este cliente" className="space-y-3">
        {extras.length > 0 && (
          <ul className="space-y-1">
            {extras.map(t => {
              const aviso = clasificarAviso(t, hoy);
              const urge = aviso?.estado === 'vencido' || aviso?.estado === 'hoy';
              return (
                // Fila NO interactiva con dos botones propios: `ListRow` con
                // `onClick` renderiza un <button>, y meterle dentro el de
                // borrar daba un <button> anidado — HTML inválido, y el de
                // fuera se traga los clics del de dentro.
                <li
                  key={t.id}
                  className="flex items-center gap-3 rounded-control px-3 py-2.5 bg-raised border border-hairline"
                >
                  <button
                    type="button"
                    onClick={() => cambiarExtra(t, {
                      done: !t.done, doneAt: !t.done ? new Date().toISOString() : undefined,
                    })}
                    aria-pressed={t.done}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <Icon
                      name={t.done ? 'check_circle' : 'radio_button_unchecked'}
                      size="s"
                      style={{ color: t.done ? 'var(--color-success)' : 'var(--color-ink-3)' }}
                      className="shrink-0"
                    />
                    <span className={`font-sans text-label truncate ${t.done ? 'text-ink-3 line-through' : 'text-ink'}`}>
                      {t.title}
                    </span>
                  </button>
                  {aviso && (
                    <span
                      className="font-mono text-caption shrink-0"
                      style={{ color: urge ? 'var(--color-danger)' : 'var(--color-ink-3)' }}
                    >{aviso.texto}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => borrarExtra(t)}
                    aria-label={`Eliminar «${t.title}»`}
                    className="shrink-0 text-ink-3 hover:text-danger transition-colors"
                  >
                    <Icon name="delete" size="s" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <form
          onSubmit={e => {
            e.preventDefault();
            if (!tituloExtra.trim()) return;
            crearExtra(tituloExtra.trim(), fechaExtra || undefined);
            setTituloExtra('');
            setFechaExtra('');
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <div className="flex-1 min-w-[200px]">
            <Input label="Nueva tarea" value={tituloExtra} onChange={setTituloExtra}
              placeholder="Llamarle para repasar la dieta" />
          </div>
          <div className="min-w-[160px]">
            <Input label="Recordármelo el" type="date" value={fechaExtra} onChange={setFechaExtra} />
          </div>
          <Button type="submit" disabled={!tituloExtra.trim()}>Añadir</Button>
        </form>
      </Card>

      {/* Las alertas del motor siguen saliendo en los dos carriles: un check-in
          atrasado o un plan a punto de vencer no esperan a que el coach esté
          mirando la pestaña correcta. */}
      {resultado.alerts.length > 0 && (
        <div className="space-y-1.5">
          {resultado.alerts.map(a => (
            <ListRow
              key={a.id}
              title={a.title}
              subtitle={a.detail}
              leading={<Icon name={a.severity === 'critical' ? 'error' : 'warning'} size="s"
                style={{ color: a.severity === 'critical' ? 'var(--color-danger)' : 'var(--color-warning)' }} />}
              onClick={a.link ? () => onGoToTab(a.link!.tab) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
