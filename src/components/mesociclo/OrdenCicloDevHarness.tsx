import React, { useMemo, useState } from 'react';
import { Mesocycle, MuscleGroup, MuscleGroupConfig, MUSCLE_ORDER, MUSCLE_LABELS_SHORT, RepartoPropio } from '../../types';
import { SegmentedControl } from '../ui';
import OrdenDelCiclo from './OrdenDelCiclo';
import {
  TRAINING_SPLITS, repartoDelMesociclo, repartoDesdeCatalogo, moverDiaDelReparto, moverSesionDelReparto, empezarRepartoPor,
  tiposDeEntrenamiento, gruposPorSesion, type Reordenacion,
} from '../../utils/trainingSplits';
import { aplicarReordenacionAlMeso, ajustarDiasDelReparto, quitarDescanso, sinMoverSesiones } from '../../utils/reordenarMeso';
import { offsetsDelMesociclo, cicloDiasDeMeso } from '../../utils/asignacionMesociclo';
import { runDistribution } from '../../utils/programacion';
import { buildSnapshot, isStale } from '../../utils/repartoDesactualizado';

/* ═══════════════════════════════════════════════════════════════════════════
   Banco de pruebas de «Orden del ciclo» (Mesociclo › Distribución, coach) —
   ruta `/dev/orden-ciclo`, solo en desarrollo. Mismo motivo que los demás
   `/dev/*`: no hay sesión de coach en este repo. Todo en memoria: enseña que
   al reordenar la distribución ya hecha viaja con su día y no se queda vieja.
   ═══════════════════════════════════════════════════════════════════════════ */

const SPLITS = ['3-push-pull-legs', '4-torso-pierna-x2', 'rot-9-torso-pierna-full-brazo'];

function grupos(series: Partial<Record<MuscleGroup, number>>): Record<MuscleGroup, MuscleGroupConfig> {
  return Object.fromEntries(MUSCLE_ORDER.map(g => [g, { series: series[g] ?? 0, priority: 'media' }])) as Record<MuscleGroup, MuscleGroupConfig>;
}

function mesoCon(splitId: string): Mesocycle {
  const split = TRAINING_SPLITS.find(s => s.id === splitId)!;
  const base: Mesocycle = {
    id: 'dev', athleteId: 'dev@enforma.app', number: 1, weeks: 6, startDate: '2026-10-19',
    objective: 'Hipertrofia', daysPerWeek: tiposDeEntrenamiento(split).length,
    cycleDays: split.dayTypes.length === 7 ? undefined : split.dayTypes.length, splitId,
    groups: grupos({ pecho: 12, dorsal: 14, trapecio: 8, biceps: 10, triceps: 9, cuadriceps: 12, isquios: 8, gluteo: 8, deltoide_lat: 10 }),
  };
  const r = repartoDelMesociclo(base)!;
  const { days, overloadAlert } = runDistribution(base.groups, base.daysPerWeek, tiposDeEntrenamiento(r),
    { cicloDias: cicloDiasDeMeso(base), offsets: offsetsDelMesociclo(base) }, gruposPorSesion(r));
  return { ...base, distribution: { days, overloadAlert, snapshot: buildSnapshot(base), generatedAt: new Date().toISOString() } };
}

export default function OrdenCicloDevHarness() {
  const [splitId, setSplitId] = useState(SPLITS[0]);
  const [meso, setMeso] = useState<Mesocycle>(() => mesoCon(SPLITS[0]));
  const reparto = useMemo(() => repartoDelMesociclo(meso), [meso]);

  const reordenar = (cambio: (base: RepartoPropio) => Reordenacion) => {
    const catalogo = TRAINING_SPLITS.find(sp => sp.id === meso.splitId);
    const base = meso.reparto ?? (catalogo ? repartoDesdeCatalogo(catalogo) : undefined);
    if (base) setMeso(aplicarReordenacionAlMeso(meso, cambio(base)));
  };

  const offsets = offsetsDelMesociclo(meso);
  return (
    <div className="min-h-screen bg-bg text-ink p-4 sm:p-8">
      <div className="max-w-xl mx-auto space-y-6">
        <h1 className="font-sans font-extrabold text-title-l">Orden del ciclo · banco</h1>
        <SegmentedControl
          label="Reparto de partida"
          value={splitId}
          onChange={v => { setSplitId(v); setMeso(mesoCon(v)); }}
          options={SPLITS.map(id => ({ value: id, label: TRAINING_SPLITS.find(s => s.id === id)!.label.split(' (')[0] }))}
        />
        {reparto && (
          <OrdenDelCiclo
            dayTypes={reparto.dayTypes}
            propio={reparto.propio}
            fechaInicio={meso.startDate}
            onMover={(i, dir) => reordenar(b => (b.dias[i] ? moverSesionDelReparto : moverDiaDelReparto)(b, i, dir))}
            onEmpezarPor={i => reordenar(b => empezarRepartoPor(b, i))}
            onAnadirDescanso={() => reordenar(b => sinMoverSesiones(ajustarDiasDelReparto(b, b.dias.length + 1)!))}
            onQuitarDescanso={i => reordenar(b => sinMoverSesiones(quitarDescanso(b, i)))}
          />
        )}
        <section className="space-y-2" data-testid="distribucion">
          <h2 className="font-mono text-caption text-ink-2 uppercase tracking-wider">
            Distribución · {isStale(meso, meso.distribution!) ? 'DESACTUALIZADA' : 'al día'} · ciclo {cicloDiasDeMeso(meso)} d
          </h2>
          {meso.distribution!.days.map((d, i) => (
            <div key={i} className="rounded-control border border-hairline bg-raised px-3 py-2">
              <div className="font-sans text-label">Sesión {i + 1} · día {offsets[i] + 1} · {d.dayType}</div>
              <div className="font-mono text-caption text-ink-3">
                {d.assignments.map(a => `${MUSCLE_LABELS_SHORT[a.group]} ${a.series}`).join(' · ')}
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
