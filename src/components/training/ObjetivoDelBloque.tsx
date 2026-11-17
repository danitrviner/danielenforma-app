import React from 'react';
import type { EstadoDelObjetivo, ProgresoDelObjetivo, ProgresoDeZona } from '../../utils/progresoDelObjetivo';
import { Icon, ProgressBar, RingSeal } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   El objetivo del bloque, para el atleta (A1, 17-11-2026)

   De qué va su bloque en UNA frase, por qué semana va, cuánto lleva de la
   mejora que se busca y el empujón concreto de esta semana. Los datos salen
   de `progresoDelObjetivo` (utils/progresoDelObjetivo.ts); aquí solo se pinta.

   Tres variantes con la misma lógica, para que Dani elija:
     · `franja`  — la discreta, por defecto: una franja con la frase, la barra
                   y el empujón en una línea. Va en Rutinas, encima de la
                   semana, y en el paso de entreno del Road map.
     · `tarjeta` — la frase como titular, una barra por grupo y el empujón
                   destacado.
     · `anillo`  — el anillo de progreso con la cifra dentro y la frase al lado.

   Sin hipótesis en el bloque `progreso` es `null` y no se pinta nada. Ningún
   tecnicismo en pantalla: el atleta solo ve su objetivo y su progreso.
   ═══════════════════════════════════════════════════════════════════════════ */

export type VarianteObjetivoDelBloque = 'franja' | 'tarjeta' | 'anillo';

interface Props {
  progreso: ProgresoDelObjetivo | null | undefined;
  variante?: VarianteObjetivoDelBloque;
  className?: string;
}

const fmt = (v: number) => v.toLocaleString('es-ES', { maximumFractionDigits: 1 });

/** Color del titular según cómo va: verde solo si ya llega; nunca rojo. */
const TONO: Record<EstadoDelObjetivo, string> = {
  pronto: 'text-ink-2', igual: 'text-ink-2', baja: 'text-ink-2', mejora: 'text-accent-ink', conseguido: 'text-success',
};

const etiquetaDeBarra = (p: ProgresoDelObjetivo) => `Objetivo del bloque: ${p.titular || p.semanaTexto}`;

function Cabecera({ p }: { p: ProgresoDelObjetivo }) {
  return (
    <div className="flex items-center gap-2">
      <Icon name="target" size="s" className="text-accent-ink shrink-0" />
      <p className="font-mono text-caption uppercase font-bold tracking-widest text-accent-ink">Tu objetivo</p>
      <div className="flex-1 h-px bg-hairline" />
      <span className="font-mono text-caption text-ink-2">{p.semanaTexto}</span>
    </div>
  );
}

function Empujon({ p, destacado = false }: { p: ProgresoDelObjetivo; destacado?: boolean }) {
  if (!p.empujon) return null;
  if (destacado) {
    return (
      <div className="flex items-start gap-2 rounded-field border border-accent-line bg-accent-bg/50 px-3 py-2">
        <Icon name="bolt" size="s" filled className="text-accent-ink shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="font-mono text-caption uppercase tracking-widest text-ink-3">Tu siguiente paso</p>
          <p className="font-sans text-body-s font-semibold text-ink text-pretty">{p.empujon.texto}</p>
        </div>
      </div>
    );
  }
  return (
    <p className="flex items-start gap-1.5 font-sans text-label text-ink">
      <Icon name="bolt" size="s" filled className="text-accent-ink shrink-0" />
      <span className="text-pretty">{p.empujon.texto}</span>
    </p>
  );
}

/** Una barra por grupo, para cuando el bloque va de más de uno. */
function BarraDeZona({ z }: { z: ProgresoDeZona }) {
  const medido = z.estado === 'mejora' || z.estado === 'conseguido';
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-sans text-label font-semibold text-ink capitalize">{z.nombre}</span>
        <span className={`font-mono text-caption ${TONO[z.estado]}`}>
          {medido ? `+${fmt(z.mejoraPct!)} % de ${fmt(z.objetivoPct)} %` : z.texto.split(': ')[1]}
        </span>
      </div>
      <ProgressBar value={z.fraccion * 100} label={z.texto} />
    </div>
  );
}

export default function ObjetivoDelBloque({ progreso: p, variante = 'franja', className = '' }: Props) {
  if (!p) return null;
  const medible = p.zonas.length > 0;

  if (variante === 'tarjeta') {
    return (
      <section className={`rounded-canvas border border-hairline bg-surface p-5 space-y-3 ${className}`} aria-label="Tu objetivo del bloque">
        <Cabecera p={p} />
        <p className="font-sans font-bold text-title-s text-ink leading-snug text-pretty">{p.frase}</p>
        {medible && (
          <div className="space-y-2.5">
            {p.zonas.map(z => <React.Fragment key={z.zona}><BarraDeZona z={z} /></React.Fragment>)}
            <p className="font-sans text-label text-ink-2 text-pretty">{p.detalle}</p>
          </div>
        )}
        <Empujon p={p} destacado />
      </section>
    );
  }

  if (variante === 'anillo') {
    // Con un solo grupo, su cifra; con varios, cuánto del camino llevan entre todos.
    const cifra = !medible || p.estado === 'pronto' ? '—'
      : p.mejoraPct != null && (p.estado === 'mejora' || p.estado === 'conseguido') ? `+${fmt(p.mejoraPct)} %`
      : p.zonas.length > 1 ? `${Math.round(p.fraccion * 100)} %` : '0 %';
    const pie = !medible || p.estado === 'pronto' ? 'pronto'
      : p.objetivoPct != null ? `de ${fmt(p.objetivoPct)} %` : 'del objetivo';
    return (
      <section className={`rounded-surface border border-hairline bg-surface p-4 space-y-3 ${className}`} aria-label="Tu objetivo del bloque">
        <div className="flex items-center gap-4">
          <RingSeal percent={p.fraccion * 100} size={84} strokeWidth={8} label={etiquetaDeBarra(p)} className="shrink-0">
            <span className="flex flex-col items-center leading-none">
              <span className="font-mono text-body-s font-bold text-ink">{cifra}</span>
              <span className="mt-1 font-mono text-[10px] text-ink-3">{pie}</span>
            </span>
          </RingSeal>
          <div className="min-w-0 space-y-1">
            <p className="font-mono text-caption uppercase font-bold tracking-widest text-accent-ink">Tu objetivo · {p.semanaTexto.toLowerCase()}</p>
            <p className="font-sans text-label text-ink text-pretty">{p.frase}</p>
            {medible && <p className={`font-sans text-label font-semibold ${TONO[p.estado]}`}>{p.titular}</p>}
          </div>
        </div>
        <Empujon p={p} />
      </section>
    );
  }

  // `franja`: la discreta.
  return (
    <section className={`rounded-surface border border-hairline bg-surface px-4 py-3 space-y-2 ${className}`} aria-label="Tu objetivo del bloque">
      <Cabecera p={p} />
      <p className="font-sans text-label text-ink-2 text-pretty">{p.frase}</p>
      {medible && (
        <div className="space-y-1">
          <ProgressBar value={p.fraccion * 100} label={etiquetaDeBarra(p)} />
          <p className={`font-sans text-label font-semibold ${TONO[p.estado]}`}>{p.titular}</p>
        </div>
      )}
      <Empujon p={p} />
    </section>
  );
}
