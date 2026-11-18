import React from 'react';
import { MUSCLE_LABELS } from '../../types';
import { BienestarDeLaVentana } from '../../utils/revisionCoach';
import { DOMS_CRONICO_UMBRAL } from '../../utils/domsCronico';
import { Sparkline, Icon } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Bloque — Cómo ha llegado: sueño, estrés y agujetas que no se van.

   Es la explicación de los otros bloques. Cuando el volumen está puesto, la
   dieta cuadra y aun así no sube nada, la respuesta suele estar aquí: duerme
   seis horas, arrastra un estrés de 8 y lleva cinco semanas con el pecho a 8
   de 10. Sin esto, el coach se queda tocando series a ciegas.

   Todo sale de los cuestionarios que el atleta ya contesta — no hay nada nuevo
   que pedirle. Cada cosa por separado y con su evolución.

   18-11-2026 (Dani): fuera el índice «Disposición para entrenar» (sueño × (10 −
   estrés − agujetas) ÷ 10), aquí y en los cálculos de dentro. No tenía escala,
   daba negativos y mezclaba tres señales que ya se leen por separado. Se
   quedan sus tres piezas, que sí se entienden.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  bienestar: BienestarDeLaVentana;
  todoAbierto?: boolean;
}

/** Los últimos 8 puntos, que es lo que pinta la primitiva Sparkline. */
function ultimos8(puntos: { value: number }[]): number[] {
  return puntos.slice(-8).map(p => p.value);
}

function unDecimal(n: number): string {
  return n.toFixed(1).replace('.', ',');
}

export default function BloqueBienestar({ bienestar }: Props) {
  const { actual, sueño, estres, domsCronico } = bienestar;

  if (actual.domsCronico == null && sueño.length === 0 && estres.length === 0) {
    return (
      <p className="font-sans text-label text-ink-3">
        Todavía no ha contestado ningún cuestionario con preguntas de sueño, estrés o agujetas.
        En cuanto lo haga —o en cuanto le asignes uno que las lleve— este bloque se llena solo.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Componente
          label="Sueño"
          valor={actual.horasSueño != null ? `${unDecimal(actual.horasSueño)} h` : '—'}
          serie={ultimos8(sueño)}
          etiquetaSerie="Evolución del sueño"
        />
        <Componente
          label="Estrés"
          valor={actual.estres != null ? `${unDecimal(actual.estres)}/10` : '—'}
          serie={ultimos8(estres)}
          etiquetaSerie="Evolución del estrés"
        />
        <Componente
          label="Agujetas"
          valor={actual.domsCronico != null ? `${unDecimal(actual.domsCronico)}/10` : '—'}
          sub="media de sus zonas"
          serie={[]}
          etiquetaSerie=""
        />
      </div>

      {/* ── Lo que no se le va ──────────────────────────────────────────── */}
      {domsCronico.length > 0 && (
        <div className="border border-warning/30 bg-warning/10 rounded-surface p-4 space-y-2">
          <span className="font-mono text-caption text-warning uppercase tracking-[.08em] flex items-center gap-1.5">
            <Icon name="warning" size="s" />
            Agujetas que no se van
          </span>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {domsCronico.map(d => (
              <span key={d.grupo} className="font-sans text-label text-ink">
                {MUSCLE_LABELS[d.grupo]}
                <span className="font-mono text-caption text-ink-2 ml-1.5 tabular-nums">
                  {unDecimal(d.media)}/10
                </span>
              </span>
            ))}
          </div>
          <p className="font-mono text-caption text-ink-3 leading-relaxed">
            Media de {DOMS_CRONICO_UMBRAL}/10 o más sostenida en sus últimas tres respuestas. No es
            la agujeta de después de un entreno duro: es dolor que llega a la siguiente sesión, y suele
            querer decir que ese grupo está por encima de lo que recupera.
          </p>
        </div>
      )}

    </div>
  );
}

function Componente({ label, valor, serie, etiquetaSerie, sub }: {
  label: string; valor: string; serie: number[]; etiquetaSerie: string; sub?: string;
}) {
  return (
    <div className="bg-raised border border-hairline rounded-surface p-3">
      <span className="block font-mono text-caption text-ink-3 uppercase tracking-[.08em]">{label}</span>
      <span className="block font-sans font-bold text-title-s text-ink mt-0.5 tabular-nums">{valor}</span>
      {sub && <span className="block font-mono text-caption text-ink-3">{sub}</span>}
      {serie.length > 1 && <Sparkline values={serie} label={etiquetaSerie} className="mt-2" />}
    </div>
  );
}
