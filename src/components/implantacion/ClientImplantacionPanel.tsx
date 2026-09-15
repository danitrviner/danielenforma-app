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
  updateUserProfile,
} from '../../dbService';
import { computeSetupChecklist, SetupItem } from '../../utils/clientSetup';
import { construirRecorrido, PasoConEstado } from '../../utils/implantacion';
import { idDePaso } from '../../utils/recorridoDelPlan';
import { hoyIsoLocal } from '../../utils/trainingWeek';
import { isoWeekKey } from '../../utils/challengeOptions';
import { mensajeDeErrorFirestore } from '../../utils/erroresFirestore';
import { useToast } from '../../hooks/useToast';
import { HubTab } from '../ClientHub';
import IndiceRecorrido, { tituloCorto } from './IndiceRecorrido';
import DetallePaso from './DetallePaso';
import CarrilSeguimiento from './CarrilSeguimiento';
import { Skeleton, SegmentedControl, RingSeal, Button, Banner, ListRow, Icon } from '../ui';

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

   ── Dos carriles, porque no son lo mismo ───────────────────────────────────
   · **Montaje**: los seis bloques A-F de `recorridoDelPlan.ts` — construir el
     programa. Es lo que se hace de una sentada al dar de alta o al renovar.
   · **Seguimiento**: contacto diario, primera revisión, reseña, referidos,
     decisión de renovación. Eso es acompañar al cliente durante semanas y no
     pinta nada en medio del montaje; antes estaban mezclados en el mismo
     acordeón y ensuciaban el recorrido.
   ═══════════════════════════════════════════════════════════════════════════ */

type Carril = 'montaje' | 'seguimiento';

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

  const { data: roadmap = null, isPending: cargandoRoadmap } = useQuery({
    queryKey: ['roadmap', athlete.email], queryFn: () => getRoadmap(athlete.email),
  });
  const { data: nutritionProgram = null, isPending: cargandoPrograma } = useQuery({
    queryKey: ['nutritionProgram', athlete.email], queryFn: () => getNutritionProgram(athlete.email),
  });
  const { data: weeklyChallenge = null, isPending: cargandoReto } = useQuery({
    queryKey: ['weeklyChallenge', athlete.email, isoWeekKey(hoy)],
    queryFn: () => getWeeklyChallenge(athlete.email, isoWeekKey(hoy)),
  });
  const { data: manualTasks = [], isPending: cargandoTareas } = useQuery({
    queryKey: tareasKey, queryFn: () => getCoachClientTasks(athlete.email),
  });
  const cargando = cargandoRoadmap || cargandoPrograma || cargandoReto || cargandoTareas;

  const [carril, setCarril] = useState<Carril>('montaje');
  const [activo, setActivo] = useState<string | null>(null);

  const resultado = useMemo(() => computeSetupChecklist({
    profile: athlete, onboarding, checkins, mesocycles, workoutAssignments,
    diets, dietConfig, nutritionConfig, qAssignments, photoAssignments, photos,
    workoutLogs, roadmap, nutritionProgram, weeklyChallenge, manualTasks, today: hoy,
  }), [athlete, onboarding, checkins, mesocycles, workoutAssignments, diets, dietConfig,
    nutritionConfig, qAssignments, photoAssignments, photos, workoutLogs, roadmap,
    nutritionProgram, weeklyChallenge, manualTasks, hoy]);

  const recorrido = useMemo(
    () => construirRecorrido(resultado, manualTasks),
    [resultado, manualTasks],
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

  // Los ítems de acompañamiento siguen usando su propio id, como siempre.
  const marcarItem = async (item: SetupItem) => {
    const hecho = item.status !== 'done';
    const previo = queryClient.getQueryData<CoachClientTask[]>(tareasKey);
    queryClient.setQueryData<CoachClientTask[]>(tareasKey, prev => {
      const lista = prev ?? [];
      const yaEsta = lista.find(t => t.itemId === item.id);
      if (yaEsta) return lista.map(t => t.itemId === item.id ? { ...t, done: hecho } : t);
      return [...lista, {
        id: `${athlete.email}_${item.id}`, athleteId: athlete.email, itemId: item.id,
        title: item.title, phase: item.phase, done: hecho,
        createdBy: 'seed' as const, createdAt: new Date().toISOString(),
      }];
    });
    try {
      await setSeededTaskDone(athlete.email, item.id, item.title, item.phase, hecho);
    } catch (err) {
      console.error(err);
      queryClient.setQueryData(tareasKey, previo);
      showToast(mensajeDeErrorFirestore(err, 'marcar la tarea'));
    }
  };

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

  if (cargando) {
    return (
      <div className="space-y-4">
        <Skeleton className="w-full h-20 rounded-surface" />
        <Skeleton className="w-full h-64 rounded-surface" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Cabecera ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4">
        <RingSeal percent={recorrido.pct} size={84} label={`Montaje del plan al ${recorrido.pct}%`}>
          <span className="font-mono font-semibold text-title-s tabular-nums">{recorrido.pct}%</span>
          <span className="font-mono text-caption text-ink-3 uppercase tracking-[.1em]">Montaje</span>
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
        {recorrido.siguiente && (
          <Button onClick={() => { setCarril('montaje'); setActivo(recorrido.siguiente!.paso.numero); }}>
            Ir al siguiente
          </Button>
        )}
      </div>

      {avisosUrgentes.size > 0 && (
        <Banner tone="danger">
          {avisosUrgentes.size === 1
            ? 'Tienes un recordatorio vencido en el montaje.'
            : `Tienes ${avisosUrgentes.size} recordatorios vencidos en el montaje.`}
        </Banner>
      )}

      <SegmentedControl
        label="Carril"
        options={[
          { value: 'montaje', label: 'Montaje' },
          { value: 'seguimiento', label: 'Seguimiento' },
        ]}
        value={carril}
        onChange={v => setCarril(v as Carril)}
      />

      {carril === 'montaje' ? (
        // Índice a la izquierda y paso a la derecha. En móvil se apila: el
        // índice arriba, el paso debajo.
        <div className="flex flex-col lg:flex-row gap-5 lg:items-start">
          <div className="lg:w-[17rem] shrink-0">
            <IndiceRecorrido
              bloques={recorrido.bloques}
              activo={activo}
              onElegir={setActivo}
              avisosUrgentes={avisosUrgentes}
            />
          </div>
          <div className="flex-1 min-w-0 bg-surface border border-hairline rounded-surface p-4">
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
          </div>
        </div>
      ) : (
        <CarrilSeguimiento
          fases={resultado.phases.filter(f => f.id === 'primeras_semanas' || f.id === 'consolidacion')}
          extras={manualTasks.filter(t => t.createdBy === 'coach')}
          hoy={hoy}
          onMarcarItem={marcarItem}
          onIrA={onGoToTab}
          onCrearExtra={crearExtra}
          onCambiarExtra={cambiarExtra}
          onBorrarExtra={borrarExtra}
        />
      )}

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
