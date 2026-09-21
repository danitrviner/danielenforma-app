import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  UserProfile, WorkoutLog, Exercise, Mesocycle, MuscleGroup, ProgressPhoto, BodyweightLog,
  WeightCheckIn, Questionnaire, QuestionnaireResponse, WorkoutAssignment,
} from '../../types';
import { Sexo } from '../../utils/athleteProfileSignals';
import { getVolumeLandmarks } from '../../db/coachSettings';
import {
  getDietCompletionLogsForAthlete, getDietsForAthlete, getCardioSessionsForAthlete,
  getNutritionProgram,
} from '../../dbService';
import {
  buildRevisionCoach, PeriodoRevision, mesoActivo, pesoVsSemanaPasada, fechaDeLaUltimaRevision,
} from '../../utils/revisionCoach';
import { computeActivePhase } from '../../utils/fasesNutricion';
import { construirComidaDeLaSemana } from '../../utils/comidaDeLaSemana';
import { construirCardioDeLaVentana } from '../../utils/cardioDeLaVentana';
import { hoyIsoLocal } from '../../utils/trainingWeek';
import { useModoPresentacion } from '../../hooks/useModoPresentacion';
import { HubTab } from '../ClientHub';
import RevisionCabecera from './RevisionCabecera';
import SelectorPeriodoRevision from './SelectorPeriodoRevision';
import BloquePatrones from './BloquePatrones';
import BloqueMejoresEjercicios from './BloqueMejoresEjercicios';
import BloqueSeriesPorGrupo from './BloqueSeriesPorGrupo';
import BloqueCuerpo from './BloqueCuerpo';
import BloqueCardio from './BloqueCardio';
import BloqueBienestar from './BloqueBienestar';
import BloqueQueHaComido from './BloqueQueHaComido';
import BloqueNutricionHabitos from './BloqueNutricionHabitos';
import BloqueRecibido from './BloqueRecibido';
import BloqueRetosNivel from './BloqueRetosNivel';
import BloqueCierre from './BloqueCierre';
import { Card, Button, Icon } from '../ui';

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
   bloque propio. Solo Reportes sigue siendo pestaña, porque Revisión es MIRAR y
   Reportes es ENVIAR.

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
function Seccion({ n, titulo, children, accion, presentando = false }: {
  n?: number; titulo: string; children: React.ReactNode; accion?: React.ReactNode;
  /** En presentación se cae la acción: es un botón que el atleta no puede pulsar. */
  presentando?: boolean;
}) {
  return (
    <Card
      title={n != null ? `${n}. ${titulo}` : titulo}
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
function Secciones({ children, presentando }: { children: React.ReactNode; presentando: boolean }) {
  let n = 0;
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
  // Grupo bajo el cursor: sincroniza la fila de la tabla con la región de la
  // silueta en los dos sentidos (la silueta llega en T4).
  const [grupoActivo, setGrupoActivo] = useState<MuscleGroup | null>(null);

  // Clave compartida con MesocycleManager y el panel del asistente: un documento, y
  // casi siempre ya en caché.
  const { data: landmarks } = useQuery({
    queryKey: ['coachVolumeLandmarks'],
    queryFn: getVolumeLandmarks,
  });

  const revision = useMemo(
    () => buildRevisionCoach({
      logs, exercises, mesocycles, periodo, landmarks, hoy, responses, questionnaires, checkins,
    }),
    [logs, exercises, mesocycles, periodo, landmarks, hoy, responses, questionnaires, checkins],
  );
  const ultimaRevision = useMemo(() => fechaDeLaUltimaRevision(checkins), [checkins]);

  const { ventana, informe } = revision;
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

  // ── Lo que ha comido ───────────────────────────────────────────────────────
  // Acotado a la ventana desde la propia consulta (`desde`), no leído entero y
  // filtrado aquí: los registros de dieta son un documento por día, así que un
  // atleta de un año son 365 lecturas para enseñar siete. La clave lleva el
  // `desde` para no pisar la caché de las pantallas que sí piden el historial
  // completo (Análisis nutricional, la periodización).
  const { data: registrosDeComida = [] } = useQuery({
    queryKey: ['dietCompletionLogsForAthlete', athlete.email, ventana.desde],
    queryFn: () => getDietCompletionLogsForAthlete(athlete.email, ventana.desde),
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

  return (
    // El agrandado vive en `.revision-presentando` (src/index.css), no aquí:
    // necesita una media query —en móvil el zoom rompe la contención de las
    // tablas— y eso no se puede escribir en un `style` en línea.
    <div className={`space-y-8 ${presentando ? 'revision-presentando' : ''}`}>
      {presentando && (
        <p className="font-mono text-caption text-ink-3 text-right">
          Modo presentación · P o Esc para salir
        </p>
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

      <RevisionCabecera
        athlete={athlete}
        ventana={ventana}
        informe={informe}
        peso={peso}
        faseNutricional={faseActiva?.name ?? null}
        pesoObjetivo={athlete.targetWeight}
      />

      <Secciones presentando={presentando}>
        <Seccion titulo="Cómo va cada patrón">
          <BloquePatrones
            patrones={revision.patrones}
            ejerciciosPorPatron={revision.ejerciciosPorPatron}
            ejerciciosSinPatron={revision.ejerciciosSinPatron}
            comparacion={ventana.etiquetaComparacion.replace(/^vs /, '')}
            curvas={revision.curvaPorEjercicio}
            ultimaSesion={revision.ultimaSesionPorEjercicio}
            todoAbierto={todoAbierto}
          />
        </Seccion>

        <Seccion
          titulo="Lo que sube y lo que baja"
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
          titulo="Volumen por grupo"
          accion={
            <Button variant="ghost" onClick={() => onGoToTab('entrenamientos')}>
              Ajustar el bloque
            </Button>
          }
        >
          <BloqueSeriesPorGrupo
            celdas={revision.mapa}
            domsPorGrupo={revision.bienestar.domsPorGrupo}
            grupoActivo={grupoActivo}
            onGrupoActivo={setGrupoActivo}
            todoAbierto={todoAbierto}
          />
        </Seccion>

        {/* Solo si hay cardio del que hablar. Un bloque vacío en un atleta que
            solo hace pesas ocupa sitio en el vídeo y no dice nada; y en cuanto
            registre una sesión, aparece solo. */}
        {(cardio.sesiones > 0 || cardio.ultimaSesion) && (
          <Seccion titulo="El cardio">
            <BloqueCardio cardio={cardio} onGoToTab={onGoToTab} todoAbierto={todoAbierto} />
          </Seccion>
        )}

        {/* Va pegado al volumen a propósito: cuando el volumen está puesto y aun
            así no sube nada, la respuesta casi siempre está aquí —duerme poco,
            arrastra estrés, o hay un grupo con agujetas que no se van—. Es la
            explicación del bloque de arriba, no una sección independiente. */}
        <Seccion titulo="Cómo ha llegado">
          <BloqueBienestar bienestar={revision.bienestar} todoAbierto={todoAbierto} />
        </Seccion>

        {/* Va entre el entrenamiento y el cuerpo a propósito: primero qué ha
            hecho, luego qué ha comido, y solo entonces qué ha pasado con su
            cuerpo — que es la consecuencia de los dos anteriores. */}
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

        {/* Qué eligió comer (bloque 4) y cuánto de lo pautado cumplió (este) son
            preguntas distintas y van seguidas: el coach cuenta primero la
            selección y luego el número. Los dos leen la misma ventana. */}
        <Seccion
          titulo="Adherencia y hábitos"
          accion={
            <Button variant="ghost" onClick={() => onGoToTab('reportes')}>
              Convertir en reporte
            </Button>
          }
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

        {/* Detrás de «lo que te ha mandado» porque también es algo que viene de
            su lado: el reto es lo único de la app que le pide algo concreto cada
            semana, y el peldaño es la promesa a medio plazo. */}
        <Seccion
          titulo="Retos y nivel"
        >
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

        {/* Va el último porque es la conclusión: los bloques de arriba son la
            prueba, y este es lo que se le dice. */}
        <Seccion titulo="Qué le digo">
          <BloqueCierre
            athleteEmail={athlete.email}
            athleteName={athlete.displayName}
            revision={revision}
            comida={comida}
            peso={peso}
            onGoToTab={onGoToTab}
            presentando={presentando}
          />
        </Seccion>
      </Secciones>
    </div>
  );
}
