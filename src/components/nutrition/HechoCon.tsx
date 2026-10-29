import React from 'react';
import { VARIANTES } from '../../data/variantes';
import { Icon } from '../ui';

/* «Hecho con lo que me dijiste» (tanda 9): hasta tres cosas que el menú ha
   tenido en cuenta de él, nombradas. Dos versiones: 'linea' (una frase) y
   'chips' (píldoras). Sin etiquetas no se pinta nada. */

export default function HechoCon({ etiquetas, variante = VARIANTES.hechoCon }: { etiquetas: string[]; variante?: typeof VARIANTES.hechoCon }) {
  if (etiquetas.length === 0) return null;
  if (variante === 'chips') {
    return (
      <div className="flex flex-wrap items-center gap-1.5" aria-label="Hecho con lo que me dijiste">
        <span className="font-mono text-caption uppercase tracking-widest text-ink-3">Hecho con</span>
        {etiquetas.map(t => (
          <span key={t} className="rounded-chip bg-accent-bg px-2.5 py-1 font-mono text-caption font-bold text-accent-ink">{t}</span>
        ))}
      </div>
    );
  }
  return (
    <p className="flex items-start gap-2 font-sans text-caption text-ink-2" aria-label="Hecho con lo que me dijiste">
      <Icon name="tune" size="s" className="text-accent-ink shrink-0" />
      <span>Hecho con lo que me dijiste: <span className="text-ink">{etiquetas.join(' · ')}</span>.</span>
    </p>
  );
}
