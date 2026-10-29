import React from 'react';

/* «Hecho con lo que me dijiste» (tanda 9): hasta tres cosas que el menú ha
   tenido en cuenta de él, nombradas, como píldoras (versión elegida por Dani
   el 29-10). Sin etiquetas no se pinta nada. */

export default function HechoCon({ etiquetas }: { etiquetas: string[] }) {
  if (etiquetas.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Hecho con lo que me dijiste">
      <span className="font-mono text-caption uppercase tracking-widest text-ink-3">Hecho con</span>
      {etiquetas.map(t => (
        <span key={t} className="rounded-chip bg-accent-bg px-2.5 py-1 font-mono text-caption font-bold text-accent-ink">{t}</span>
      ))}
    </div>
  );
}
