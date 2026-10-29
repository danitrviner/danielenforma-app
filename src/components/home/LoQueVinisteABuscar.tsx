import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BodyweightLog } from '../../types';
import { getOnboarding } from '../../dbService';
import type { ObjetivoCorporalTipo } from '../../utils/verificacionObjetivo';
import { pesoRepresentativo } from '../../utils/verificacionObjetivo';
import { addDays, hoyIsoLocal } from '../../utils/trainingWeek';
import { Icon } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   «Lo que viniste a buscar» (29-10-2026)

   El objetivo con SUS palabras (`goalFreeText` del alta: «llegar a los 40 en
   forma», «estar sin camiseta», «menos dolores y más energía»), que en
   producción tienen 20 de 24 atletas y ninguna pantalla repetía; y el antes
   → ahora del peso con lo que falta hasta la meta de la fase. Principio 1 del
   plan: progreso visible hacia SU objetivo, medido como él lo entiende.

   Dos formas, cada una en su sitio (Dani, 29-10):
   · 'cita'   — la frase grande, como una cita, y debajo una línea de cifras (Inicio).
   · 'cifras' — tres cifras (empezaste · ahora · meta) y la frase pequeña (Mi objetivo).
   ═══════════════════════════════════════════════════════════════════════════ */

export type VarianteViniste = 'cita' | 'cifras';

const kg = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export interface AntesAhora {
  empezaste: number | null;
  ahora: number | null;
  meta: number | null;
  /** kg que faltan hasta la meta (positivo = aún no), si hay meta y peso. */
  faltan: number | null;
  cambio: number | null;
}

export function antesAhora(pesos: readonly Pick<BodyweightLog, 'date' | 'weight'>[], meta: number | null, objetivo: ObjetivoCorporalTipo | null, hoy: string): AntesAhora {
  const ordenados = [...pesos].sort((a, b) => a.date.localeCompare(b.date));
  const empezaste = ordenados[0]?.weight ?? null;
  // «Ahora» es la mediana de los últimos 7 días, no el último pesaje: un día
  // raro no mueve la cifra (mismo criterio que la verificación del objetivo).
  const desde = addDays(hoy, -6);
  const ultimos = ordenados.filter(p => p.date >= desde && p.date <= hoy).map(p => p.weight);
  const ahora = ultimos.length > 0 ? Math.round(pesoRepresentativo(ultimos) * 10) / 10 : ordenados.at(-1)?.weight ?? null;
  const cambio = empezaste != null && ahora != null ? Math.round((ahora - empezaste) * 10) / 10 : null;
  const faltan = meta != null && ahora != null
    ? Math.round((objetivo === 'volumen' ? meta - ahora : ahora - meta) * 10) / 10
    : null;
  return { empezaste, ahora, meta, faltan, cambio };
}

interface Props {
  athleteEmail: string;
  pesos: readonly Pick<BodyweightLog, 'date' | 'weight'>[];
  pesoMeta: number | null;
  objetivo: ObjetivoCorporalTipo | null;
  variante?: VarianteViniste;
  /** Dentro de otra tarjeta (Mi objetivo): sin borde propio. */
  sinMarco?: boolean;
}

export default function LoQueVinisteABuscar({ athleteEmail, pesos, pesoMeta, objetivo, variante = 'cita', sinMarco = false }: Props) {
  const { data: onboarding = null } = useQuery({
    queryKey: ['onboarding', athleteEmail],
    queryFn: () => getOnboarding(athleteEmail).catch(() => null),
  });
  const hoy = hoyIsoLocal();
  const aa = useMemo(() => antesAhora(pesos, pesoMeta, objetivo, hoy), [pesos, pesoMeta, objetivo, hoy]);
  const frase = onboarding?.goalFreeText?.trim();
  if (!frase && aa.ahora == null) return null;

  const marco = sinMarco ? 'space-y-3' : 'rounded-canvas border border-hairline bg-surface p-4 space-y-3';
  const faltaTexto = aa.faltan == null ? null : aa.faltan <= 0 ? 'meta conseguida' : `faltan ${kg(aa.faltan)} kg`;

  if (variante === 'cifras') {
    return (
      <section className={marco} aria-label="Lo que viniste a buscar">
        <div className="grid grid-cols-3 gap-2">
          <Cifra etiqueta="Empezaste" valor={aa.empezaste != null ? kg(aa.empezaste) : '—'} />
          <Cifra etiqueta="Ahora" valor={aa.ahora != null ? kg(aa.ahora) : '—'} nota={aa.cambio != null ? `${aa.cambio > 0 ? '+' : ''}${kg(aa.cambio)} kg` : undefined} destacada />
          <Cifra etiqueta="Meta" valor={aa.meta != null ? kg(aa.meta) : '—'} nota={faltaTexto ?? undefined} />
        </div>
        {frase && <p className="font-sans text-caption text-ink-2 text-pretty">Lo que viniste a buscar: <span className="text-ink">«{frase}»</span></p>}
      </section>
    );
  }

  return (
    <section className={marco} aria-label="Lo que viniste a buscar">
      {frase && (
        <div className="flex gap-3">
          <Icon name="format_quote" size="l" className="text-accent-ink shrink-0" />
          <div>
            <p className="font-mono text-caption uppercase tracking-widest text-ink-3">Lo que viniste a buscar</p>
            <p className="mt-1 font-display text-title-m font-black leading-tight text-ink text-pretty">{frase}</p>
          </div>
        </div>
      )}
      {aa.ahora != null && (
        <p className="font-mono text-caption text-ink-2">
          {aa.empezaste != null && <>Empezaste en <span className="text-ink">{kg(aa.empezaste)}</span> · </>}
          ahora <span className="text-ink font-bold">{kg(aa.ahora)} kg</span>
          {aa.cambio != null && aa.cambio !== 0 && <span className={aa.cambio < 0 ? 'text-success' : 'text-ink'}> ({aa.cambio > 0 ? '+' : ''}{kg(aa.cambio)})</span>}
          {aa.meta != null && <> · meta <span className="text-ink">{kg(aa.meta)}</span>{faltaTexto && <span className="text-accent-ink"> · {faltaTexto}</span>}</>}
        </p>
      )}
    </section>
  );
}

function Cifra({ etiqueta, valor, nota, destacada = false }: { etiqueta: string; valor: string; nota?: string; destacada?: boolean }) {
  return (
    <div className={`rounded-field border px-3 py-2 ${destacada ? 'border-accent-line bg-accent-bg/40' : 'border-hairline bg-raised'}`}>
      <p className="font-mono text-caption uppercase tracking-widest text-ink-3">{etiqueta}</p>
      <p className="font-sans text-title-s font-bold text-ink leading-tight">{valor}<span className="font-mono text-caption text-ink-3"> kg</span></p>
      {nota && <p className="truncate font-mono text-caption text-ink-2">{nota}</p>}
    </div>
  );
}
