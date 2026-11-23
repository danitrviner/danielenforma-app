import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  UserProfile, WorkoutLog, Exercise, Mesocycle, ProgressPhoto, BodyweightLog,
  WeightCheckIn, Questionnaire, QuestionnaireResponse, WorkoutAssignment,
} from '../../types';
import { Sexo } from '../../utils/athleteProfileSignals';
import { getVolumeLandmarks } from '../../db/coachSettings';
import {
  getDietCompletionLogsForAthlete, getDietsForAthlete, getCardioSessionsForAthlete,
  getNutritionProgram, getWorkouts, getStepsForAthlete, getAthleteNutritionConfig, getAssignmentsForAthlete,
} from '../../dbService';
import {
  buildRevisionCoach, PeriodoRevision, mesoActivo, pesoVsSemanaPasada, fechaDeLaUltimaRevision,
} from '../../utils/revisionCoach';
import { computeActivePhase } from '../../utils/fasesNutricion';
import { construirComidaDeLaSemana } from '../../utils/comidaDeLaSemana';
import { construirCardioDeLaVentana } from '../../utils/cardioDeLaVentana';
import { addDays, hoyIsoLocal } from '../../utils/trainingWeek';
import { useModoPresentacion } from '../../hooks/useModoPresentacion';
import { HubTab } from '../ClientHub';
import RevisionCabecera from './RevisionCabecera';
import MensajesCoachPanel, { type CierrePorFirmar } from './MensajesCoachPanel';
import { buildCierreCompleto } from '../../utils/cierreCompleto';
import { finDeBloque } from '../../utils/finDeBloque';
import { bloqueCerradoRecientemente, idDeCierre } from '../../utils/cierreParaAtleta';
import { getBodyMeasurementsForAthlete } from '../../db/bodyMeasurements';
import { bodyMeasurementsForAthleteKey } from '../../hooks/useBodyMeasurements';
import DiaRevisionAtleta from './DiaRevisionAtleta';
import BodyweightPanel from '../BodyweightPanel';
import SelectorPeriodoRevision from './SelectorPeriodoRevision';
import BloquePatrones from './BloquePatrones';
import BloqueMejoresEjercicios from './BloqueMejoresEjercicios';
import BloqueEstimuloSemanal from './BloqueEstimuloSemanal';
import BloqueEjercicioSemana from './BloqueEjercicioSemana';
import { semanaASemanaDelBloque } from '../../utils/semanaASemanaDelBloque';
import { semanasDeLaRevision } from '../../utils/cdg/iemSemanal';
import BloqueCuerpo from './BloqueCuerpo';
import BloqueCardio from './BloqueCardio';
import BloqueBienestar from './BloqueBienestar';
import BloqueQueHaComido from './BloqueQueHaComido';
import BloqueNutricionHabitos from './BloqueNutricionHabitos';
import BloqueRecibido from './BloqueRecibido';
import BloqueRetosNivel from './BloqueRetosNivel';
import BloqueCierre from './BloqueCierre';
import BloqueCambios from './BloqueCambios';
import CierreDeBloque from './CierreDeBloque';
import { nombreDeMeso } from '../../utils/nombresMeso';
import LineaDeTiempoAsistente from '../autopiloto/LineaDeTiempoAsistente';
import { Card, Button, Icon, SegmentedControl, Collapsible } from '../ui';
import { getHipotesis } from '../../db/hipotesis';
import { getCambiosAtleta } from '../../db/cambios';
import { useMotorCdg } from '../../hooks/useMotorCdg';
import { semaforoDelBloque, type FilaDeSemaforo } from '../../utils/hipotesisDeBloque/semaforoDeHipotesis';
import { progresoDelObjetivo, mesoDelObjetivo } from '../../utils/progresoDelObjetivo';
import { cicloDiasDeMeso } from '../../utils/asignacionMesociclo';
import { mesocycleWeekNumber, vueltasDelCiclo } from '../../utils/progression';
import { proximaOcurrencia } from '../../utils/scheduleEngine';
import { fijarAlViernes } from '../../utils/questionnaireSchedule';
import {
  vistazoDeLaSemana, loQueMeContaste, hayAlgoQueContar, ejerciciosDeLaSemana, semanaQueViene,
  loQuePideDecision, hayMedidaNueva, fraseDelRitmo,
} from '../../utils/revisionDeLaSemana';
import VistazoDeLaSemana from './VistazoDeLaSemana';
import LoQueMeContaste from './LoQueMeContaste';
import ComoVas from './ComoVas';
import SemanaQueViene from './SemanaQueViene';
import LoQuePideDecision from './LoQuePideDecision';
import BodyMeasurementsPanel from '../BodyMeasurementsPanel';
import ComparadorFotos from './ComparadorFotos';

/* ═══════════════════════════════════════════════════════════════════════════
   REVISIÓN — la pantalla de un vistazo.

   Qué problema resuelve: para contarle a un atleta cómo va, Dani tenía que
   recorrer cinco pestañas (Revisiones, Cuerpo, Dietas › info, Análisis ›
   Reportes, Correlaciones) y ninguna contestaba a lo que quería contar. Esto
   junta lo que ya se calculaba en sitios distintos, en el orden en el que se
   narra: ¿ha entrenado? → ¿está más fuerte, y en qué? → ¿le estoy dando
   volumen a lo que toca? → ¿cómo va el cuerpo? → ¿qué me ha mandado?

   Se graba en vídeo, y eso manda en el diseño:
     · Scroll continuo, sin hojas ni modales que tapen (el detalle de un patrón
       se despliega en línea).
     · «Desplegar todo» para poder hacer una pasada de arriba abajo sin clicar.
     · Modo presentación (tecla P): fuera los controles que el atleta no puede
       pulsar, y todo un punto más grande para que se lea en un vídeo
       comprimido visto en un móvil.
     · Nada de ventanas que el coach tenga que configurar dos veces: el periodo
       se elige una vez arriba y manda sobre todos los bloques.

   Desde el 16-09 ya no se suma: absorbe. La zona «Análisis» del Hub desaparece
   y su contenido vive aquí — los titulares de progreso y el explorador de
   series dentro del bloque del cuerpo, la adherencia/pasos/macros/alertas como
   bloque propio. (Reportes, que seguía siendo pestaña para ENVIAR, se retiró
   el 23-11-2026: su hueco en «Hoy» lo ocupa Objetivo.)

   ── Preparar y presentar (18-11-2026) ─────────────────────────────────────
   Dani graba esta pantalla y se la manda al atleta: es el guion del vídeo y se
   mira semana a semana. Dos caras:
     · PREPARAR (modo normal, solo coach): arriba del todo «Lo que pide
       decisión», los mensajes y el día de revisión.
     · PRESENTAR (tecla P): lo que sale en el vídeo, en orden de relato —
       1) tu semana de un vistazo, 2) lo que me contaste, 3) cómo vas, 4) lo
       que cambio y por qué, 5) la semana que viene— y detrás el resto de
       bloques, plegados («Desplegar todo» los abre). La lista de comidas día a
       día se queda a la vista.
   «La semana» son los 7 días que acaban el último día de la ventana elegida,
   siempre comparados con los 7 de antes (utils/revisionDeLaSemana). La
   ventana del selector sigue mandando en los bloques de detalle.

   Sobre las consultas: el panel solo se monta cuando la pestaña está activa, así
   que montarse ES el `enabled` — el mismo patrón que ClientSetupPanel. Lo caro
   (logs, ejercicios, mesociclos) llega por props porque ClientHub ya lo tiene.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  athlete: UserProfile;
  logs: WorkoutLog[];
  exercises: Exercise[];
  mesocycles: Mesocycle[];
  photos: ProgressPhoto[];
  bodyweightLogs: BodyweightLog[];
  /** Sexo biológico de la anamnesis — lo necesita el %grasa US Navy. */
  sexo: Sexo | null;
  checkins: WeightCheckIn[];
  questionnaires: Questionnaire[];
  responses: QuestionnaireResponse[];
  /** Asignaciones de entreno — las necesita la serie de adherencia semanal. */
  assignments: WorkoutAssignment[];
  onGoToTab: (tab: HubTab) => void;
}

/**
 * Cada bloque de la pantalla es una tarjeta del DS, no una sección suelta.
 *
 * El número NO se escribe: lo pone `<Secciones>` contando las que se han
 * pintado de verdad. Escribirlo a mano obligaba a renumerar todo el fichero
 * cada vez que se añadía un bloque en medio, y con bloques condicionales
 * —el cardio solo sale si hay cardio— directamente no había número correcto
 * que escribir.
 */
function Seccion({ n, titulo, children, accion, presentando = false, plegada = false, abierta = false }: {
  n?: number; titulo: string; children: React.ReactNode; accion?: React.ReactNode;
  /** En presentación se cae la acción: es un botón que el atleta no puede pulsar. */
  presentando?: boolean;
  /** Bloque de detalle: va plegado detrás del relato (18-11-2026). */
  plegada?: boolean;
  /** «Desplegar todo». */
  abierta?: boolean;
}) {
  const t = n != null ? `${n}. ${titulo}` : titulo;
  if (plegada) {
    return (
      <Card className="space-y-3" padding="m">
        <Collapsible
          key={`${titulo}-${abierta}`}
          defaultOpen={abierta}
          trigger={<span className="font-sans text-title-s font-bold text-ink">{t}</span>}
        >
          <div className="space-y-3 pt-2">
            {!presentando && accion && <div className="flex justify-end">{accion}</div>}
            {children}
          </div>
        </Collapsible>
      </Card>
    );
  }
  return (
    <Card
      title={t}
      action={presentando ? undefined : accion}
      className="space-y-3"
    >
      {children}
    </Card>
  );
}

/** Numera en orden las `<Seccion>` que existan, saltándose las que no se
 *  pintan, y les pasa `presentando`: antes iba a mano en las once, y cada
 *  bloque nuevo tenía que acordarse o su botón se colaba en el modo
 *  presentación. */
function Secciones({ children, presentando, inicio = 0 }: {
  children: React.ReactNode; presentando: boolean;
  /** Secciones ya numeradas antes (el detalle sigue la cuenta del relato). */
  inicio?: number;
}) {
  let n = inicio;
  return (
    <>
      {React.Children.map(children, hijo => {
        if (!React.isValidElement(hijo)) return hijo;
        n += 1;
        return React.cloneElement(hijo as React.ReactElement<{ n?: number; presentando?: boolean }>, { n, presentando });
      })}
    </>
  );
}

export default function ClientRevisionPanel({
  athlete, logs, exercises, mesocycles,
  photos, bodyweightLogs, sexo, checkins, questionnaires, responses, assignments, onGoToTab,
}: Props) {
  const hoy = hoyIsoLocal();

  // Arranca en el bloque en curso si lo hay: es la ventana que Dani mira el
  // 90 % de las veces. Sin mesociclos, los últimos 7 días.
  const [periodo, setPeriodo] = useState<PeriodoRevision>(() => {
    const activo = mesoActivo(mesocycles, hoy);
    return activo ? { tipo: 'meso', mesoId: activo.id } : { tipo: '7d' };
  });
  const [todoAbierto, setTodoAbierto] = useState(false);
  const { presentando, alternar: alternarPresentacion } = useModoPresentacion();

  // ── Cierre de bloque (16-11-2026) ─────────────────────────────────────────
  // La revisión semanal y el cierre de un mesociclo son dos conversaciones
  // distintas: la primera mira una semana, la segunda el bloque entero del
  // principio al final. Viven en la misma pestaña, separadas por un selector.
  const bloquesConCierre = useMemo(
    () => mesocycles.filter(m => !!m.startDate && m.startDate <= hoy).sort((a, b) => b.number - a.number),
    [mesocycles, hoy],
  );
  const recienCerrado = useMemo(() => bloqueCerradoRecientemente(mesocycles, hoy), [mesocycles, hoy]);
  const [modo, setModo] = useState<'semanal' | 'cierre'>('semanal');
  const [mesoCierreId, setMesoCierreId] = useState<string | null>(null);
  const mesoCierre = useMemo(() => {
    const elegido = bloquesConCierre.find(m => m.id === mesoCierreId);
    if (elegido) return elegido;
    if (recienCerrado) return recienCerrado;
    // Sin bloque recién cerrado: el último terminado y, si no hay, el que está en curso.
    return bloquesConCierre.find(m => finDeBloque(m) < hoy) ?? bloquesConCierre[0] ?? null;
  }, [bloquesConCierre, mesoCierreId, recienCerrado, hoy]);

  // Clave compartida con MesocycleManager y el panel del asistente: un documento, y
  // casi siempre ya en caché.
  const { data: landmarks } = useQuery({
    queryKey: ['coachVolumeLandmarks'],
    queryFn: getVolumeLandmarks,
  });

  // Rutinas: clave compartida con el Hub (ya en caché). Dan el nombre de cada
  // sesión, lo programado para la semana que viene y el semáforo del bloque.
  const { data: workouts = [] } = useQuery({ queryKey: ['workouts'], queryFn: getWorkouts });
  const nombreDeSesion = useMemo(() => {
    const porId = new Map(workouts.map(w => [w.id, w.name]));
    return (id: string) => porId.get(id);
  }, [workouts]);

  const revision = useMemo(
    () => buildRevisionCoach({
      logs, exercises, mesocycles, periodo, landmarks, hoy, responses, questionnaires, checkins, nombreDeSesion,
    }),
    [logs, exercises, mesocycles, periodo, landmarks, hoy, responses, questionnaires, checkins, nombreDeSesion],
  );
  const ultimaRevision = useMemo(() => fechaDeLaUltimaRevision(checkins), [checkins]);

  // ── Cada ejercicio, semana a semana (23-11-2026) ───────────────────────────
  // Solo con «Bloque» elegido: lo planificado y lo hecho (kg × reps de cada
  // serie) de todos los ejercicios en todas las semanas del bloque.
  const ejercicioASemana = useMemo(() => {
    if (periodo.tipo !== 'meso') return null;
    const meso = mesocycles.find(m => m.id === periodo.mesoId);
    if (!meso) return null;
    try {
      return semanaASemanaDelBloque({ meso, workouts, logs, exercises, hoy });
    } catch (err) {
      console.error('ClientRevisionPanel: no se pudo calcular cada ejercicio semana a semana', err);
      return null;
    }
  }, [periodo, mesocycles, workouts, logs, exercises, hoy]);

  const { ventana, informe } = revision;
  // Semanas del bloque «Estímulo por semana»: las del bloque si se está mirando
  // un mesociclo; si no, las seis últimas.
  const semanasIem = useMemo(() => {
    const mesoMirado = periodo.tipo === 'meso' ? mesocycles.find(m => m.id === periodo.mesoId) : null;
    const hasta = ventana.hasta < hoy ? ventana.hasta : hoy;
    return semanasDeLaRevision({ hasta, inicioBloque: mesoMirado?.startDate ?? null });
  }, [periodo, mesocycles, ventana.hasta, hoy]);
  const peso = useMemo(
    () => pesoVsSemanaPasada(bodyweightLogs, ventana.desde, ventana.hasta),
    [bodyweightLogs, ventana.desde, ventana.hasta],
  );

  // Fase de nutrición vigente — mismo motor que BloqueNutricionHabitos, aparte
  // porque la cabecera se pinta antes de llegar a ese bloque y necesita saber
  // ya si el atleta está en volumen o en definición para dar contexto al vídeo.
  const { data: programaNutricion } = useQuery({
    queryKey: ['nutritionProgram', athlete.email],
    queryFn: () => getNutritionProgram(athlete.email),
  });
  const faseActiva = useMemo(
    () => (programaNutricion && programaNutricion.phases.length > 0
      ? computeActivePhase(programaNutricion, ventana.hasta)
      : null),
    [programaNutricion, ventana.hasta],
  );

  // El cierre del bloque que acabó hace poco, como borrador para firmar
  // (tanda 8). Es el mensaje único del cierre (`cierreCompleto`): el mismo
  // texto que Dani ve en «Cierre de bloque» y en el editor del mesociclo, con
  // el peso corporal y las sesiones dichas una sola vez. Las medidas se piden
  // con la misma clave que usa esa pantalla.
  // Siempre: «Cómo vas» enseña las medidas la semana que hay alguna nueva. Es
  // la misma clave que el panel de perímetros de «El cuerpo».
  const { data: medidasDelAtleta } = useQuery({
    queryKey: bodyMeasurementsForAthleteKey(athlete.email),
    queryFn: () => getBodyMeasurementsForAthlete(athlete.email),
  });
  const cierrePorFirmar = useMemo<CierrePorFirmar | null>(() => {
    if (!recienCerrado) return null;
    const { mensaje } = buildCierreCompleto({
      meso: recienCerrado, mesocycles, logs, assignments, exercises, athleteName: athlete.displayName, hoy,
      bodyweightLogs, medidas: medidasDelAtleta, responses, questionnaires, programaNutricion,
    });
    return { id: idDeCierre(recienCerrado.id), texto: mensaje, fecha: hoy, mesoNombre: nombreDeMeso(recienCerrado) };
  }, [recienCerrado, mesocycles, logs, assignments, exercises, athlete.displayName, hoy, bodyweightLogs, medidasDelAtleta, responses, questionnaires, programaNutricion]);

  // ── Lo que ha comido ───────────────────────────────────────────────────────
  // Acotado a la ventana desde la propia consulta (`desde`), no leído entero y
  // filtrado aquí: los registros de dieta son un documento por día, así que un
  // atleta de un año son 365 lecturas para enseñar siete. La clave lleva el
  // `desde` para no pisar la caché de las pantallas que sí piden el historial
  // completo (Análisis nutricional, la periodización).
  // Desde lo que llegue antes: la ventana elegida o la semana anterior a la
  // de la revisión (la comparación fija de «Tu semana de un vistazo»).
  const desdeComida = useMemo(() => {
    const antes = addDays(ventana.hasta, -13);
    return antes < ventana.desde ? antes : ventana.desde;
  }, [ventana.desde, ventana.hasta]);
  const { data: registrosDeComida = [] } = useQuery({
    queryKey: ['dietCompletionLogsForAthlete', athlete.email, desdeComida],
    queryFn: () => getDietCompletionLogsForAthlete(athlete.email, desdeComida),
  });
  // Solo hacen falta para los días anteriores a 09-2026, que no congelaron sus
  // comidas en el propio registro. Clave compartida con el resto del Hub.
  const { data: dietas = [] } = useQuery({
    queryKey: ['dietsForAthlete', athlete.email],
    queryFn: () => getDietsForAthlete(athlete.email),
  });
  const comida = useMemo(
    () => construirComidaDeLaSemana({
      logs: registrosDeComida, diets: dietas, desde: ventana.desde, hasta: ventana.hasta,
    }),
    [registrosDeComida, dietas, ventana.desde, ventana.hasta],
  );

  // ── El cardio ──────────────────────────────────────────────────────────────
  // Sin acotar a la ventana, y a propósito: el cociente de carga son dos medias
  // móviles de 7 y 42 días, así que recortando la entrada el CTL arrancaría de
  // cero y todo el mundo saldría en «overreaching». Clave compartida con la
  // pestaña de Cardio del Hub.
  const { data: sesionesCardio = [] } = useQuery({
    queryKey: ['cardioSessions', athlete.email],
    queryFn: () => getCardioSessionsForAthlete(athlete.email),
  });
  const cardio = useMemo(
    () => construirCardioDeLaVentana({
      sesiones: sesionesCardio, desde: ventana.desde, hasta: ventana.hasta,
    }),
    [sesionesCardio, ventana.desde, ventana.hasta],
  );

  // ── La semana de la revisión (18-11-2026) ──────────────────────────────────
  // Todo lo de aquí abajo sale de consultas que el Hub o los bloques de esta
  // pantalla ya hacen con la misma clave: pasos y su objetivo (Adherencia),
  // cuestionarios asignados (Revisiones), hipótesis y cambios (Lo que he
  // cambiado). Ninguna lectura nueva cuando la caché está caliente.
  const { data: pasos = [] } = useQuery({
    queryKey: ['stepsForAthlete', athlete.email],
    queryFn: () => getStepsForAthlete(athlete.email),
  });
  const { data: configNutricion } = useQuery({
    queryKey: ['athleteNutritionConfig', athlete.email],
    queryFn: () => getAthleteNutritionConfig(athlete.email).catch(() => null),
  });
  const { data: asignacionesCuestionario = [] } = useQuery({
    queryKey: ['assignmentsForAthlete', athlete.email],
    queryFn: () => getAssignmentsForAthlete(athlete.email),
  });
  const { data: hipotesisDeCambios = [] } = useQuery({
    queryKey: ['hipotesis', athlete.email],
    queryFn: () => getHipotesis(athlete.email),
    staleTime: 60_000,
  });
  const { data: cambiosDelAtleta = [] } = useQuery({
    queryKey: ['cambiosAtleta', athlete.email],
    queryFn: () => getCambiosAtleta(athlete.email),
    staleTime: 60_000,
  });

  const mesoDeLaSemana = useMemo(() => mesoDelObjetivo(mesocycles, ventana.hasta), [mesocycles, ventana.hasta]);
  const vistazo = useMemo(
    () => vistazoDeLaSemana({
      hasta: ventana.hasta, logs, assignments, meso: mesoDeLaSemana,
      registros: registrosDeComida, dietas, pasos, objetivoPasos: configNutricion?.stepGoal ?? null,
      pesos: bodyweightLogs, programa: programaNutricion,
    }),
    [ventana.hasta, logs, assignments, mesoDeLaSemana, registrosDeComida, dietas, pasos, configNutricion, bodyweightLogs, programaNutricion],
  );
  const contado = useMemo(
    () => loQueMeContaste({
      hasta: ventana.hasta, responses, questionnaires, asignaciones: asignacionesCuestionario,
      checkins, logs, nombreDeSesion,
    }),
    [ventana.hasta, responses, questionnaires, asignacionesCuestionario, checkins, logs, nombreDeSesion],
  );
  const ejerciciosSemana = useMemo(
    () => ejerciciosDeLaSemana({ logs, exercises, mesocycles, semana: vistazo.semana, pesoCorporalKg: athlete.actualWeight ?? null }),
    [logs, exercises, mesocycles, vistazo.semana, athlete.actualWeight],
  );
  // Las dos de abajo leen rutinas enteras: si una viene mal formada, se cae
  // su sección, no la pantalla.
  const objetivoDelBloque = useMemo(() => {
    try {
      return progresoDelObjetivo({
        meso: mesoDelObjetivo(mesocycles, hoy), logs, exercises, workouts, assignments, hoy,
        pesoCorporalKg: athlete.actualWeight ?? null,
      });
    } catch (err) {
      console.error('ClientRevisionPanel: no se pudo calcular el objetivo del bloque', err);
      return null;
    }
  }, [mesocycles, logs, exercises, workouts, assignments, hoy, athlete.actualWeight]);
  const medidasNuevas = useMemo(
    () => hayMedidaNueva({ medidas: medidasDelAtleta, fotos: photos, semana: vistazo.semana }),
    [medidasDelAtleta, photos, vistazo.semana],
  );
  // La semana que viene se mira desde HOY: es lo que el atleta tiene por delante.
  const queViene = useMemo(() => {
    const ctx = { mesocycles, diaRevision: athlete.diaRevision, pausa: athlete.pausaRevisiones };
    try {
      return semanaQueViene({
        hoy, mesocycles, workouts, exercises, logs,
        asignaciones: asignacionesCuestionario, cuestionarios: questionnaires,
        proximaDe: a => proximaOcurrencia(fijarAlViernes(a, athlete.diaRevision), ctx),
      });
    } catch (err) {
      console.error('ClientRevisionPanel: no se pudo calcular la semana que viene', err);
      return null;
    }
  }, [hoy, mesocycles, workouts, exercises, logs, asignacionesCuestionario, questionnaires, athlete.diaRevision, athlete.pausaRevisiones]);

  // ── Lo que pide decisión (solo coach) ────────────────────────────────────
  // El semáforo de las hipótesis del bloque es el mismo que el del Seguimiento
  // (`semaforoDelBloque`): el catálogo CDG ya lo carga esta pantalla para el
  // estímulo por semana. Sin catálogo o sin hipótesis, no sale.
  const { motor } = useMotorCdg();
  const mesoHoy = useMemo(() => mesoDelObjetivo(mesocycles, hoy), [mesocycles, hoy]);
  const semaforo = useMemo<FilaDeSemaforo[]>(() => {
    if (!motor || !mesoHoy || Object.keys(mesoHoy.hipotesis ?? {}).length === 0) return [];
    try {
      const ciclo = cicloDiasDeMeso(mesoHoy);
      return semaforoDelBloque({
        motor, meso: mesoHoy, logs, exercises,
        programados: workouts.filter(w => w.mesocycleId === mesoHoy.id).flatMap(w => w.exercises ?? []),
        semanaActual: mesocycleWeekNumber(mesoHoy.startDate, hoy, ciclo),
        vueltas: vueltasDelCiclo(mesoHoy.weeks, ciclo),
        hoy, pesoCorporalKg: athlete.actualWeight ?? null,
      });
    } catch (err) {
      console.error('ClientRevisionPanel: no se pudo calcular el semáforo del bloque', err);
      return [];
    }
  }, [motor, mesoHoy, logs, exercises, workouts, hoy, athlete.actualWeight]);
  const avisos = useMemo(() => {
    const nombres = new Map(exercises.map(e => [e.id, e.name]));
    return loQuePideDecision({
      revision, nombreDe: id => nombres.get(id) ?? 'Un ejercicio', ritmo: vistazo.peso?.ritmo,
      hipotesis: hipotesisDeCambios, cambios: cambiosDelAtleta, logs, hoy,
    });
  }, [revision, exercises, vistazo.peso, hipotesisDeCambios, cambiosDelAtleta, logs, hoy]);

  return (
    // El agrandado vive en `.revision-presentando` (src/index.css), no aquí:
    // necesita una media query —en móvil el zoom rompe la contención de las
    // tablas— y eso no se puede escribir en un `style` en línea.
    <div className={`pantalla space-y-8 ${presentando ? 'revision-presentando' : ''}`}>
      {presentando && (
        <p className="font-mono text-caption text-ink-3 text-right">
          Modo presentación · P o Esc para salir
        </p>
      )}

      {/* ── Revisión de la semana / Cierre de bloque ── */}
      {mesoCierre && !presentando && (
        <div className="space-y-3">
          <SegmentedControl
            label="Qué revisar"
            value={modo}
            onChange={v => setModo(v as 'semanal' | 'cierre')}
            options={[
              { value: 'semanal', label: 'Revisión de la semana' },
              { value: 'cierre', label: 'Cierre de bloque' },
            ]}
          />
          {modo === 'semanal' && recienCerrado && (
            <button
              type="button"
              onClick={() => { setMesoCierreId(recienCerrado.id); setModo('cierre'); }}
              className="fila-pulsable w-full flex items-center gap-3 rounded-surface border border-accent-line bg-accent/10 px-4 py-3 text-left"
            >
              <Icon name="flag" size="m" className="text-accent-ink shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block font-sans text-label font-bold text-ink">
                  {nombreDeMeso(recienCerrado)} terminó el {finDeBloque(recienCerrado)}
                </span>
                <span className="block font-sans text-caption text-ink-2">
                  Tienes su cierre listo: rendimiento del inicio al final, cuerpo, cuestionarios y qué cambiar en el siguiente.
                </span>
              </span>
              <Icon name="chevron_right" size="m" className="text-ink-3 shrink-0" />
            </button>
          )}
        </div>
      )}

      {modo === 'cierre' && mesoCierre ? (
        <CierreDeBloque
          athlete={athlete}
          meso={mesoCierre}
          bloques={bloquesConCierre}
          onCambiarBloque={setMesoCierreId}
          mesocycles={mesocycles}
          logs={logs}
          exercises={exercises}
          assignments={assignments}
          photos={photos}
          bodyweightLogs={bodyweightLogs}
          questionnaires={questionnaires}
          responses={responses}
          sexo={sexo}
          hoy={hoy}
          presentando={presentando}
        />
      ) : (
      <>
      {/* ── Día de revisión y pausa: se cambian aquí también, no solo en
          Revisiones, que es donde Dani está cuando lo decide (29-10). Fuera
          en modo presentación, como el resto de controles. */}
      {!presentando && (
        <div className="bg-surface border border-hairline rounded-surface">
          <DiaRevisionAtleta athlete={athlete} suelto />
        </div>
      )}

      {/* ── Controles de la pantalla ─────────────────────────────────────── */}
      <div className={`flex flex-wrap items-end justify-between gap-3 ${presentando ? 'hidden' : ''}`}>
        <SelectorPeriodoRevision
          periodo={periodo}
          onChange={setPeriodo}
          mesocycles={mesocycles}
          etiquetaComparacion={ventana.etiquetaComparacion}
          hoy={hoy}
          ultimaRevision={ultimaRevision}
        />
        {/* `flex-wrap`: los dos botones juntos miden 394 px y el móvil tiene
            375, así que sin esto la pantalla entera se desplazaba a lo ancho. */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => setTodoAbierto(v => !v)}
            aria-pressed={todoAbierto}
          >
            <Icon name={todoAbierto ? 'unfold_less' : 'unfold_more'} size="s" />
            {todoAbierto ? 'Plegar todo' : 'Desplegar todo'}
          </Button>
          {/* El botón existe para que el modo sea descubrible; en cuanto se
              enciende desaparece con el resto de los controles, que es justo
              lo que se quiere de él en un vídeo. */}
          <Button variant="ghost" onClick={alternarPresentacion} aria-pressed={presentando}>
            <Icon name="slideshow" size="s" />
            Presentar
          </Button>
        </div>
      </div>

      {/* ── PREPARAR (solo coach) ────────────────────────────────────────
          Arriba del todo lo que pide decisión esta semana; luego el canal de
          mensajes y las cifras de la ventana elegida. Nada de esto sale en el
          vídeo. */}
      {!presentando && (
        <>
          <LoQuePideDecision
            avisos={avisos}
            semaforo={semaforo}
            hayBloque={!!mesoHoy}
            onAbrirSeguimiento={() => onGoToTab('entrenamientos')}
          />
          <MensajesCoachPanel athlete={athlete} cierre={cierrePorFirmar} />
          <RevisionCabecera
            athlete={athlete}
            ventana={ventana}
            informe={informe}
            peso={peso}
            faseNutricional={faseActiva?.name ?? null}
            pesoObjetivo={athlete.targetWeight}
          />
        </>
      )}

      {/* ── PRESENTAR: el relato del vídeo, en orden ─────────────────────── */}
      {presentando && (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="font-sans font-bold text-title-m text-ink">{athlete.displayName}</h2>
          {objetivoDelBloque?.semanaTexto && mesoHoy && (
            <span className="font-mono text-caption text-ink-2">{nombreDeMeso(mesoHoy)} · {objetivoDelBloque.semanaTexto}</span>
          )}
        </div>
      )}

      <Secciones presentando={presentando}>
        <Seccion titulo="Tu semana de un vistazo">
          <VistazoDeLaSemana vistazo={vistazo} />
        </Seccion>

        {hayAlgoQueContar(contado) && (
          <Seccion
            titulo="Lo que me contaste"
            accion={
              <Button variant="ghost" onClick={() => onGoToTab('revisiones')}>
                Ir a Revisiones
              </Button>
            }
          >
            <LoQueMeContaste contado={contado} />
          </Seccion>
        )}

        <Seccion
          titulo="Cómo vas"
          accion={
            <Button variant="ghost" onClick={() => onGoToTab('cuerpo')}>
              Ver todo el seguimiento
            </Button>
          }
        >
          <ComoVas
            fraseDelPeso={vistazo.peso?.ritmo ? fraseDelRitmo(vistazo.peso.ritmo) : null}
            grafica={<BodyweightPanel athleteEmail={athlete.email} readOnly />}
            semana={ejerciciosSemana}
            periodo={{ suben: revision.suben, bajan: revision.bajan, etiqueta: ventana.etiqueta, comparacion: ventana.etiquetaComparacion }}
            objetivo={objetivoDelBloque}
            medidas={(medidasNuevas.medidas || medidasNuevas.fotos) ? (
              <div className="space-y-4">
                {medidasNuevas.medidas && (
                  <BodyMeasurementsPanel athleteEmail={athlete.email} sexo={sexo} pesoKg={athlete.actualWeight ?? null} audiencia="coach" soloPerimetros />
                )}
                {medidasNuevas.fotos && (
                  <ComparadorFotos photos={photos} athleteEmail={athlete.email} bodyweightLogs={bodyweightLogs} />
                )}
              </div>
            ) : null}
          />
        </Seccion>

        <Seccion titulo="Lo que cambio y por qué">
          <BloqueCambios
            athleteEmail={athlete.email}
            desde={vistazo.semana.desde}
            hasta={vistazo.semana.hasta}
            todoAbierto={todoAbierto}
            logs={logs}
            exercises={exercises}
            presentando={presentando}
          />
        </Seccion>

        {queViene && (
          <Seccion titulo="La semana que viene">
            <SemanaQueViene semana={queViene} />
          </Seccion>
        )}
      </Secciones>

      {/* ── El detalle, plegado detrás del relato ────────────────────────── */}
      <div className="space-y-3">
        <p className="font-mono text-caption text-ink-3 uppercase tracking-[.1em]">
          El detalle · {ventana.etiqueta.toLowerCase()} {ventana.etiquetaComparacion}
        </p>
      <Secciones presentando={presentando} inicio={3 + (hayAlgoQueContar(contado) ? 1 : 0) + (queViene ? 1 : 0)}>
        {/* A la vista, no plegada: es lo que se mira al elegir un bloque. */}
        {ejercicioASemana && (
          <Seccion titulo="Cada ejercicio, semana a semana">
            <BloqueEjercicioSemana datos={ejercicioASemana} />
          </Seccion>
        )}

        <Seccion titulo="Cómo va cada patrón" plegada abierta={todoAbierto}>
          <BloquePatrones
            patrones={revision.patrones}
            ejerciciosPorPatron={revision.ejerciciosPorPatron}
            ejerciciosSinPatron={revision.ejerciciosSinPatron}
            comparacion={ventana.etiquetaComparacion.replace(/^vs /, '')}
            curvas={revision.curvaPorEjercicio}
            ultimaSesion={revision.ultimaSesionPorEjercicio}
            cambios={revision.cambiosDeTarea}
            estancados={revision.estancados}
            todoAbierto={todoAbierto}
          />
        </Seccion>

        <Seccion
          titulo="Lo que sube y lo que baja"
          plegada abierta={todoAbierto}
          accion={
            <Button variant="ghost" onClick={() => onGoToTab('entrenamientos')}>
              Ver historial de cargas
            </Button>
          }
        >
          <BloqueMejoresEjercicios
            suben={revision.suben}
            bajan={revision.bajan}
            comparacion={ventana.etiquetaComparacion}
          />
        </Seccion>

        <Seccion
          titulo="Estímulo por semana"
          plegada abierta={todoAbierto}
          accion={
            <Button variant="ghost" onClick={() => onGoToTab('entrenamientos')}>
              Ajustar el bloque
            </Button>
          }
        >
          <BloqueEstimuloSemanal
            logs={logs}
            exercises={exercises}
            semanas={semanasIem}
            domsPorGrupo={revision.bienestar.domsPorGrupo}
            todoAbierto={todoAbierto}
          />
        </Seccion>

        {/* Solo si hay cardio del que hablar. */}
        {(cardio.sesiones > 0 || cardio.ultimaSesion) && (
          <Seccion titulo="El cardio" plegada abierta={todoAbierto}>
            <BloqueCardio cardio={cardio} onGoToTab={onGoToTab} todoAbierto={todoAbierto} />
          </Seccion>
        )}

        <Seccion titulo="Cómo ha llegado" plegada abierta={todoAbierto}>
          <BloqueBienestar bienestar={revision.bienestar} todoAbierto={todoAbierto} />
        </Seccion>

        {/* La lista de comidas día a día se queda A LA VISTA (Dani, 18-11). */}
        <Seccion
          titulo="Qué ha comido"
          accion={
            <Button variant="ghost" onClick={() => onGoToTab('dietas')}>
              Ver su plan de comidas
            </Button>
          }
        >
          <BloqueQueHaComido comida={comida} todoAbierto={todoAbierto} />
        </Seccion>

        <Seccion
          titulo="Adherencia y hábitos"
          plegada abierta={todoAbierto}
        >
          <BloqueNutricionHabitos
            athleteEmail={athlete.email}
            athleteName={athlete.displayName}
            targetWeight={athlete.targetWeight}
            registros={registrosDeComida}
            dietas={dietas}
            bodyweightLogs={bodyweightLogs}
            ventana={ventana}
          />
        </Seccion>

        <Seccion
          titulo="El cuerpo"
          plegada abierta={todoAbierto}
          accion={
            <Button variant="ghost" onClick={() => onGoToTab('cuerpo')}>
              Ver todo el seguimiento
            </Button>
          }
        >
          <BloqueCuerpo
            athlete={athlete}
            sexo={sexo}
            photos={photos}
            bodyweightLogs={bodyweightLogs}
            onGoToTab={onGoToTab}
            todoAbierto={todoAbierto}
            logs={logs}
            exercises={exercises}
            responses={responses}
            questionnaires={questionnaires}
            assignments={assignments}
          />
        </Seccion>

        <Seccion
          titulo="Lo que te ha mandado"
          plegada abierta={todoAbierto}
          accion={
            <Button variant="ghost" onClick={() => onGoToTab('revisiones')}>
              Ir a Revisiones
            </Button>
          }
        >
          <BloqueRecibido
            checkins={checkins}
            questionnaires={questionnaires}
            responses={responses}
            onGoToTab={onGoToTab}
            todoAbierto={todoAbierto}
          />
        </Seccion>

        <Seccion titulo="Retos y nivel" plegada abierta={todoAbierto}>
          <BloqueRetosNivel
            athleteEmail={athlete.email}
            initialWeight={athlete.initialWeight}
            logs={logs}
            exercises={exercises}
            bodyweightLogs={bodyweightLogs}
            registrosDeComida={registrosDeComida}
            dietas={dietas}
            assignments={assignments}
            onGoToTab={onGoToTab}
            todoAbierto={todoAbierto}
          />
        </Seccion>

        <Seccion titulo="Lo que ha hecho el asistente" plegada abierta={todoAbierto}>
          <LineaDeTiempoAsistente athlete={athlete} presentando={presentando} />
        </Seccion>

        {/* Los titulares y el borrador del mensaje son del coach (voz de
            coach, jerga): fuera del vídeo. */}
        {!presentando && (
          <Seccion titulo="Cierre de la revisión" plegada abierta={todoAbierto}>
            <BloqueCierre
              athleteEmail={athlete.email}
              athleteName={athlete.displayName}
              revision={revision}
              comida={comida}
              peso={peso}
              presentando={presentando}
            />
          </Seccion>
        )}
      </Secciones>
      </div>
      </>
      )}
    </div>
  );
}
