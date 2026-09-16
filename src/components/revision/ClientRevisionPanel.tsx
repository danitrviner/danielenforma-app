import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  UserProfile, WorkoutLog, Exercise, Mesocycle, MuscleGroup, ProgressPhoto, BodyweightLog,
  WeightCheckIn, Questionnaire, QuestionnaireResponse,
} from '../../types';
import { Sexo } from '../../utils/athleteProfileSignals';
import { getVolumeLandmarks } from '../../db/coachSettings';
import { getDietCompletionLogsForAthlete, getDietsForAthlete } from '../../dbService';
import {
  buildRevisionCoach, PeriodoRevision, mesoActivo, pesoVsSemanaPasada,
} from '../../utils/revisionCoach';
import { construirComidaDeLaSemana } from '../../utils/comidaDeLaSemana';
import { hoyIsoLocal } from '../../utils/trainingWeek';
import { HubTab } from '../ClientHub';
import RevisionCabecera from './RevisionCabecera';
import SelectorPeriodoRevision from './SelectorPeriodoRevision';
import BloquePatrones from './BloquePatrones';
import BloqueMejoresEjercicios from './BloqueMejoresEjercicios';
import BloqueSeriesPorGrupo from './BloqueSeriesPorGrupo';
import BloqueCuerpo from './BloqueCuerpo';
import BloqueQueHaComido from './BloqueQueHaComido';
import BloqueRecibido from './BloqueRecibido';
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
     · Nada de ventanas que el coach tenga que configurar dos veces: el periodo
       se elige una vez arriba y manda sobre todos los bloques.

   NO sustituye a ninguna pestaña: Revisiones, Reportes y Correlaciones siguen
   donde estaban. Esta se suma.

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
  onGoToTab: (tab: HubTab) => void;
}

/** Cada bloque de la pantalla es una tarjeta del DS, no una sección suelta. */
function Seccion({ n, titulo, children, accion }: {
  n: number; titulo: string; children: React.ReactNode; accion?: React.ReactNode;
}) {
  return (
    <Card title={`${n}. ${titulo}`} action={accion} className="space-y-3">
      {children}
    </Card>
  );
}

export default function ClientRevisionPanel({
  athlete, logs, exercises, mesocycles,
  photos, bodyweightLogs, sexo, checkins, questionnaires, responses, onGoToTab,
}: Props) {
  const hoy = hoyIsoLocal();

  // Arranca en el bloque en curso si lo hay: es la ventana que Dani mira el
  // 90 % de las veces. Sin mesociclos, los últimos 7 días.
  const [periodo, setPeriodo] = useState<PeriodoRevision>(() => {
    const activo = mesoActivo(mesocycles, hoy);
    return activo ? { tipo: 'meso', mesoId: activo.id } : { tipo: '7d' };
  });
  const [todoAbierto, setTodoAbierto] = useState(false);
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
    () => buildRevisionCoach({ logs, exercises, mesocycles, periodo, landmarks, hoy }),
    [logs, exercises, mesocycles, periodo, landmarks, hoy],
  );

  const { ventana, informe } = revision;
  const peso = useMemo(() => pesoVsSemanaPasada(bodyweightLogs, hoy), [bodyweightLogs, hoy]);

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

  return (
    <div className="space-y-8">
      {/* ── Controles de la pantalla ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SelectorPeriodoRevision
          periodo={periodo}
          onChange={setPeriodo}
          mesocycles={mesocycles}
          etiquetaComparacion={ventana.etiquetaComparacion}
          hoy={hoy}
        />
        <Button
          variant="ghost"
          onClick={() => setTodoAbierto(v => !v)}
          aria-pressed={todoAbierto}
        >
          <Icon name={todoAbierto ? 'unfold_less' : 'unfold_more'} size="s" />
          {todoAbierto ? 'Plegar todo' : 'Desplegar todo'}
        </Button>
      </div>

      <RevisionCabecera
        athlete={athlete}
        ventana={ventana}
        informe={informe}
        peso={peso}
      />

      <Seccion n={1} titulo="Cómo va cada patrón">
        <BloquePatrones
          patrones={revision.patrones}
          ejerciciosPorPatron={revision.ejerciciosPorPatron}
          ejerciciosSinPatron={revision.ejerciciosSinPatron}
          comparacion={ventana.etiquetaComparacion.replace(/^vs /, '')}
          todoAbierto={todoAbierto}
        />
      </Seccion>

      <Seccion
        n={2}
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
        n={3}
        titulo="Volumen por grupo"
        accion={
          <Button variant="ghost" onClick={() => onGoToTab('entrenamientos')}>
            Ajustar el bloque
          </Button>
        }
      >
        <BloqueSeriesPorGrupo
          celdas={revision.mapa}
          grupoActivo={grupoActivo}
          onGrupoActivo={setGrupoActivo}
          todoAbierto={todoAbierto}
        />
      </Seccion>

      {/* Va entre el entrenamiento y el cuerpo a propósito: primero qué ha
          hecho, luego qué ha comido, y solo entonces qué ha pasado con su
          cuerpo — que es la consecuencia de los dos anteriores. */}
      <Seccion
        n={4}
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
        n={5}
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
        />
      </Seccion>

      <Seccion
        n={6}
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
    </div>
  );
}
