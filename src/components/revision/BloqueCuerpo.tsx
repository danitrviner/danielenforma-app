import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { UserProfile, ProgressPhoto, BodyweightLog } from '../../types';
import { Sexo } from '../../utils/athleteProfileSignals';
import { getNutritionProgram } from '../../dbService';
import { HubTab } from '../ClientHub';
import NutritionPerformanceDashboard from '../NutritionPerformanceDashboard';
import BodyMeasurementsPanel from '../BodyMeasurementsPanel';
import ComparadorFotos from './ComparadorFotos';
import { EmptyState, Skeleton, Collapsible } from '../ui';

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
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  athlete: UserProfile;
  sexo: Sexo | null;
  photos: ProgressPhoto[];
  bodyweightLogs: BodyweightLog[];
  onGoToTab: (tab: HubTab) => void;
  /** Cuando está activo, perímetros y fotos nacen desplegados. */
  todoAbierto?: boolean;
}

export default function BloqueCuerpo({
  athlete, sexo, photos, bodyweightLogs, onGoToTab, todoAbierto = false,
}: Props) {
  const { data: programa, isPending } = useQuery({
    queryKey: ['nutritionProgram', athlete.email],
    queryFn: () => getNutritionProgram(athlete.email),
  });

  return (
    <div className="space-y-4">
      {/* ── Peso real vs lo que decía la periodización ───────────────────── */}
      {isPending ? (
        <Skeleton className="w-full h-64 rounded-surface" />
      ) : programa ? (
        <NutritionPerformanceDashboard
          athleteEmail={athlete.email}
          athleteName={athlete.displayName}
          targetWeightKg={athlete.targetWeight}
          onEdit={() => onGoToTab('dietas')}
        />
      ) : (
        <EmptyState
          icon="monitor_weight"
          title="Sin periodización nutricional"
          description="Sin fases con sus kcal no hay peso esperado con el que comparar el real. Móntala en Dietas y esta gráfica aparece sola."
          actionLabel="Ir a Dietas"
          onAction={() => onGoToTab('dietas')}
        />
      )}

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
    </div>
  );
}
