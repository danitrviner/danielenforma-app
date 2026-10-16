import React, { useState } from 'react';
import { MUSCLE_ORDER, type MuscleGroup, type MuscleGroupConfig, type TemplateStage } from '../../types';
import MesocycleManager from '../MesocycleManager';
import { etapaDesdeMeso, mesoDesdeEtapa, LUNES_DE_PLANTILLA } from '../../utils/plantillaMeso';

/* ═══════════════════════════════════════════════════════════════════════════
   Banco de pruebas del editor de mesociclos en MODO PLANTILLA (Biblioteca ›
   Plantillas) — ruta `/dev/plantilla`, solo en desarrollo. Sin sesión de coach
   no hay catálogo de ejercicios, pero se ve el editor sin atleta y la etapa
   que se devolvería a la biblioteca.
   ═══════════════════════════════════════════════════════════════════════════ */

const SERIES: Partial<Record<MuscleGroup, number>> = { pecho: 12, dorsal: 12, trapecio: 6, biceps: 8, triceps: 8, deltoide_lat: 10, cuadriceps: 10, isquios: 8, gluteo: 8 };
const ETAPA: TemplateStage = {
  id: 'st-dev', name: 'Acumulación', weeks: 6, daysPerWeek: 3, splitId: '3-push-pull-legs',
  groups: Object.fromEntries(MUSCLE_ORDER.map(g => [g, { series: SERIES[g] ?? 0, priority: 'media' }])) as Record<MuscleGroup, MuscleGroupConfig>,
};

export default function PlantillaDevHarness() {
  const [etapa, setEtapa] = useState<TemplateStage>(ETAPA);
  return (
    <div className="min-h-screen bg-bg text-ink p-4 sm:p-8 space-y-6">
      <MesocycleManager
        coachId="dev"
        plantilla={{
          meso: mesoDesdeEtapa(ETAPA, { id: 'plantilla-dev', athleteId: '', number: 1, startDate: LUNES_DE_PLANTILLA }, true),
          onGuardar: m => setEtapa(etapaDesdeMeso(m, { id: ETAPA.id })),
        }}
      />
      <details className="rounded-surface border border-hairline bg-surface p-3">
        <summary className="font-mono text-caption text-ink-2 uppercase cursor-pointer">Etapa que llega a la biblioteca</summary>
        <pre data-testid="etapa" className="font-mono text-caption text-ink-2 whitespace-pre-wrap">{JSON.stringify({
          name: etapa.name, weeks: etapa.weeks, daysPerWeek: etapa.daysPerWeek, cycleDays: etapa.cycleDays,
          splitId: etapa.splitId, reparto: etapa.reparto?.dias.map(d => d?.tipo ?? '—'),
          distribution: etapa.distribution?.days.map(d => d.dayType), days: etapa.days?.length,
        }, null, 2)}</pre>
      </details>
    </div>
  );
}
