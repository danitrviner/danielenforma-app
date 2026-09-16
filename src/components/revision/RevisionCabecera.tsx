import React from 'react';
import { UserProfile } from '../../types';
import { VentanaRevision, PesoVsSemanaPasada } from '../../utils/revisionCoach';
import { TrainingReport } from '../../utils/trainingReport';
import { MONTHS_ES, fechaCorta } from '../../utils/trainingWeek';
import { Card, Delta, Badge } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Las cuatro cifras con las que arranca el vídeo.

   El orden no es decorativo: primero si ha entrenado (sesiones), luego cuánto
   (tonelaje y su variación), luego dónde está del plan. Si las sesiones son
   cero, todo lo demás da igual y se ve de un vistazo sin bajar.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  athlete: UserProfile;
  ventana: VentanaRevision;
  informe: TrainingReport;
  /** Peso de esta semana contra la pasada, comparando medias. */
  peso: PesoVsSemanaPasada;
  /** Fase nutricional activa, si el atleta tiene periodización. */
  faseNutricional?: string | null;
}

/** «29 ago» — sin año, que el rango siempre cae dentro del mismo o del anterior. */
function Cifra({ label, valor, sub, tono = 'ink' }: {
  label: string; valor: React.ReactNode; sub?: React.ReactNode; tono?: 'ink' | 'atenuado';
}) {
  return (
    <div className="bg-raised border border-hairline rounded-surface px-4 py-3 flex-1 min-w-[132px]">
      <span className="font-mono text-caption text-ink-2 uppercase tracking-[.1em] block">{label}</span>
      <span
        className="font-mono font-semibold text-title-l tabular-nums block leading-tight"
        style={{ color: tono === 'atenuado' ? 'var(--color-ink-3)' : 'var(--color-ink)' }}
      >{valor}</span>
      {sub && <span className="font-mono text-caption text-ink-3 block">{sub}</span>}
    </div>
  );
}

export default function RevisionCabecera({
  athlete, ventana, informe, peso, faseNutricional = null,
}: Props) {
  const sinEntrenos = informe.sessions === 0;

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-sans font-bold text-title-m text-ink">{athlete.displayName}</h2>
        <span className="font-mono text-caption text-ink-2">{ventana.etiqueta}</span>
        {ventana.semanaDelPlan != null && ventana.semanasDelPlan != null && (
          <Badge tone="neutral">Semana {ventana.semanaDelPlan}/{ventana.semanasDelPlan}</Badge>
        )}
        {faseNutricional && <Badge tone="neutral">{faseNutricional}</Badge>}
      </div>

      <div className="flex flex-wrap gap-2">
        <Cifra
          label="Sesiones"
          valor={informe.sessions}
          sub={sinEntrenos ? 'no ha entrenado' : `${fechaCorta(ventana.desde)} → ${fechaCorta(ventana.hasta)}`}
          tono={sinEntrenos ? 'atenuado' : 'ink'}
        />
        <Cifra
          label="Tonelaje"
          valor={`${informe.tonnage.current.toLocaleString('es-ES', { maximumFractionDigits: 0 })} kg`}
          sub={<Delta pct={informe.tonnage.deltaPct} />}
        />
        {/* Peso de la semana contra la anterior, por medias: el peso diario
            oscila un kilo largo y comparar dos días sueltos mide sobre todo
            cuándo se pesó. */}
        <Cifra
          label="Peso"
          valor={peso.estaSemana != null ? `${peso.estaSemana} kg` : '—'}
          sub={
            peso.deltaKg != null
              ? <span style={{ color: peso.deltaKg === 0 ? 'var(--color-ink-3)' : 'var(--color-ink-2)' }}>
                  {peso.deltaKg > 0 ? '+' : peso.deltaKg < 0 ? '−' : ''}
                  {peso.deltaKg !== 0 ? `${Math.abs(peso.deltaKg)} kg` : 'igual'} vs semana pasada
                </span>
              : peso.estaSemana != null ? 'sin semana previa' : 'sin pesos esta semana'
          }
          tono={peso.estaSemana != null ? 'ink' : 'atenuado'}
        />
        <Cifra
          label="Récords"
          valor={informe.perExercise.filter(e => e.isPR).length}
          sub="en esta ventana"
        />
      </div>
    </Card>
  );
}
