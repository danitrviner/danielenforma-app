import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  UserProfile, ProgressPhoto, BodyweightLog, WorkoutLog, Exercise,
  QuestionnaireResponse, Questionnaire, WorkoutAssignment,
} from '../../types';
import { Sexo } from '../../utils/athleteProfileSignals';
import { getNutritionProgram } from '../../dbService';
import { HubTab } from '../ClientHub';
import NutritionPerformanceDashboard from '../NutritionPerformanceDashboard';
import BodyMeasurementsPanel from '../BodyMeasurementsPanel';
import CorrelationPanel from '../CorrelationPanel';
import ComparadorFotos from './ComparadorFotos';
import VerificacionObjetivo from './VerificacionObjetivo';
import { Skeleton, Collapsible, Button, Icon, Sheet } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Bloque 4 — El cuerpo: peso contra el plan, perímetros y fotos.

   No se reescribe nada: el dashboard de peso vs proyección, el panel de
   perímetros con su %grasa US Navy y la cortina de fotos ya existían, pero
   repartidos en tres pestañas distintas (Dietas › info, Cuerpo y Cuerpo otra
   vez). Aquí se montan juntos porque en el vídeo se cuentan juntos: «el peso va
   por donde dijimos, la cintura ha bajado 3 cm y esto es lo que se ve».

   ── La puerta de coste ─────────────────────────────────────────────────────
   `NutritionPerformanceDashboard` se auto-abastece con SEIS consultas, y dos de
   ellas son colecciones con un documento por día (registros de dieta y pasos)
   que se leen sin ventana. Para un atleta sin periodización nutricional ese
   gasto no compra nada: la gráfica no tendría fases que pintar. Por eso primero
   se lee `nutritionPrograms` —UN documento— y solo si existe se monta el
   dashboard. Es la diferencia entre +1 lectura y +6 colecciones por cada ficha
   que se abre.

   ── Lo que se tragó de «Análisis › Correlaciones» ──────────────────────────
   Los titulares (%grasa, masa magra, cintura, peso, IRC, adherencia, IRP y el
   1RM del ejercicio más registrado, cada uno con su cambio y su sparkline) eran
   la mitad «Resumen» de aquella pestaña, y son exactamente lo que se cuenta en
   el vídeo: entran aquí, arriba del todo, sin cabecera propia. La otra mitad
   —elegir series, cruzarlas, mirar el Pearson— pide clicar y comparar, así que
   se queda a un botón de distancia en una hoja: no corta el scroll de la
   grabación, pero sigue estando cuando el número raro obliga a bajar a mirar.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  athlete: UserProfile;
  sexo: Sexo | null;
  photos: ProgressPhoto[];
  bodyweightLogs: BodyweightLog[];
  onGoToTab: (tab: HubTab) => void;
  /** Cuando está activo, perímetros y fotos nacen desplegados. */
  todoAbierto?: boolean;
  // Lo que necesitan los titulares y el explorador de series. Llega por props
  // porque ClientHub ya lo tiene cargado para el resto de la pantalla.
  logs: WorkoutLog[];
  exercises: Exercise[];
  responses: QuestionnaireResponse[];
  questionnaires: Questionnaire[];
  assignments: WorkoutAssignment[];
}

export default function BloqueCuerpo({
  athlete, sexo, photos, bodyweightLogs, onGoToTab, todoAbierto = false,
  logs, exercises, responses, questionnaires, assignments,
}: Props) {
  const [explorando, setExplorando] = useState(false);
  const { data: programa, isPending } = useQuery({
    queryKey: ['nutritionProgram', athlete.email],
    queryFn: () => getNutritionProgram(athlete.email),
  });

  return (
    <div className="space-y-4">
      {/* ── Titulares: el cambio de cada métrica desde la primera medición ── */}
      <CorrelationPanel
        modo="resumen"
        athleteEmail={athlete.email}
        logs={logs}
        exercises={exercises}
        responses={responses}
        questionnaires={questionnaires}
        bodyweightLogs={bodyweightLogs}
        assignments={assignments}
        sexo={sexo}
      />

      <div className="flex justify-end">
        <Button variant="ghost" onClick={() => setExplorando(true)}>
          <Icon name="insights" size="s" />
          Explorar los datos
        </Button>
      </div>

      {/* ── ¿Va donde queríamos? Solo necesita el objetivo y los pesos ────── */}
      <VerificacionObjetivo athleteEmail={athlete.email} logs={logs} />

      {/* ── Detalle técnico: la proyección por kcal de la periodización ───── */}
      {/* Plegado: la tarjeta de objetivo ya da el veredicto. Esto es el «por
          qué» (curva según fórmula, según adherencia, gasto estimado) para
          cuando el veredicto sorprende. Montado solo al abrir: son seis
          consultas, dos de ellas colecciones de un documento por día. */}
      {isPending ? (
        <Skeleton className="w-full h-12 rounded-surface" />
      ) : programa ? (
        <Collapsible
          key={`detalle-${todoAbierto}`}
          defaultOpen={todoAbierto}
          trigger={<span className="font-sans font-bold text-label text-ink">Detalle técnico · proyección por kcal</span>}
        >
          <NutritionPerformanceDashboard
            athleteEmail={athlete.email}
            athleteName={athlete.displayName}
            targetWeightKg={athlete.targetWeight}
            onEdit={() => onGoToTab('dietas')}
          />
        </Collapsible>
      ) : null}

      {/* Perímetros y fotos van plegados: son el detalle al que se baja cuando
          el peso dice algo raro, no lo primero que se mira. */}
      <Collapsible
        key={`perimetros-${todoAbierto}`}
        defaultOpen={todoAbierto}
        trigger={<span className="font-sans font-bold text-label text-ink">Perímetros y composición</span>}
      >
        <BodyMeasurementsPanel
          athleteEmail={athlete.email}
          sexo={sexo}
          pesoKg={athlete.actualWeight ?? null}
          audiencia="coach"
        />
      </Collapsible>

      <Collapsible
        key={`fotos-${todoAbierto}`}
        defaultOpen={todoAbierto}
        trigger={
          <span className="flex items-baseline gap-2">
            <span className="font-sans font-bold text-label text-ink">Fotos</span>
            <span className="font-mono text-caption text-ink-3">
              {photos.length} {photos.length === 1 ? 'foto' : 'fotos'}
            </span>
          </span>
        }
      >
        <ComparadorFotos
          photos={photos}
          athleteEmail={athlete.email}
          bodyweightLogs={bodyweightLogs}
        />
      </Collapsible>

      <Sheet open={explorando} onClose={() => setExplorando(false)} title="Explorar los datos" size="l">
        <CorrelationPanel
          modo="explorar"
          athleteEmail={athlete.email}
          logs={logs}
          exercises={exercises}
          responses={responses}
          questionnaires={questionnaires}
          bodyweightLogs={bodyweightLogs}
          assignments={assignments}
          sexo={sexo}
        />
      </Sheet>
    </div>
  );
}
