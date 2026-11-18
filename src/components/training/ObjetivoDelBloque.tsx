import type { EstadoDelObjetivo, ProgresoDelObjetivo } from '../../utils/progresoDelObjetivo';
import { Icon, ProgressBar } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   El objetivo del bloque, para el atleta (A1, 17-11-2026)

   De qué va su bloque en UNA frase, por qué semana va, cuánto lleva de la
   mejora que se busca y el empujón concreto de esta semana. Los datos salen
   de `progresoDelObjetivo` (utils/progresoDelObjetivo.ts); aquí solo se pinta.

   Es una franja discreta: la frase, la barra y el empujón en una línea. Va en
   Rutinas, encima de la semana, y en el paso de entreno del Road map.

   Sin hipótesis en el bloque `progreso` es `null` y no se pinta nada. Ningún
   tecnicismo en pantalla: el atleta solo ve su objetivo y su progreso.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  progreso: ProgresoDelObjetivo | null | undefined;
  className?: string;
}

/** Color del titular según cómo va: verde solo si ya llega; nunca rojo. */
const TONO: Record<EstadoDelObjetivo, string> = {
  pronto: 'text-ink-2', igual: 'text-ink-2', baja: 'text-ink-2', mejora: 'text-accent-ink', conseguido: 'text-success',
};

export default function ObjetivoDelBloque({ progreso: p, className = '' }: Props) {
  if (!p) return null;
  return (
    <section className={`rounded-surface border border-hairline bg-surface px-4 py-3 space-y-2 ${className}`} aria-label="Tu objetivo del bloque">
      <div className="flex items-center gap-2">
        <Icon name="target" size="s" className="text-accent-ink shrink-0" />
        <p className="font-mono text-caption uppercase font-bold tracking-widest text-accent-ink">Tu objetivo</p>
        <div className="flex-1 h-px bg-hairline" />
        <span className="font-mono text-caption text-ink-2">{p.semanaTexto}</span>
      </div>
      <p className="font-sans text-label text-ink-2 text-pretty">{p.frase}</p>
      {p.zonas.length > 0 && (
        <div className="space-y-1">
          <ProgressBar value={p.fraccion * 100} label={`Objetivo del bloque: ${p.titular || p.semanaTexto}`} />
          <p className={`font-sans text-label font-semibold ${TONO[p.estado]}`}>{p.titular}</p>
        </div>
      )}
      {p.empujon && (
        <p className="flex items-start gap-1.5 font-sans text-label text-ink">
          <Icon name="bolt" size="s" filled className="text-accent-ink shrink-0" />
          <span className="text-pretty">{p.empujon.texto}</span>
        </p>
      )}
    </section>
  );
}
