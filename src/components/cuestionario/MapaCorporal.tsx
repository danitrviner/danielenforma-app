import React from 'react';
import type { ZonaIem } from '../../utils/cdg/zonas';
import { ZONA_POR_CLAVE } from '../../utils/cdg/zonas';

/* ═══════════════════════════════════════════════════════════════════════════
   Mapa corporal (cuestionarios, 27-10)

   Silueta esquemática delante / detrás con las 14 zonas del IEM
   (utils/cdg/zonas.ts). Dos usos:
   - Agujetas: cada zona pintada con su nota 1–5 (oro → rojo).
   - Selección: grupos a priorizar o con demasiado volumen (multiselección).

   Es una silueta de formas simples a propósito: se lee de un vistazo y las
   zonas son lo bastante grandes para tocarlas con el dedo. Cada forma es un
   botón accesible con el nombre de su zona.
   ═══════════════════════════════════════════════════════════════════════════ */

type Forma = { z: ZonaIem; el: 'ellipse' | 'rect' | 'path'; a: Record<string, number | string> };

// Coordenadas sobre un lienzo 120 × 250 por figura.
const DELANTE: Forma[] = [
  { z: 'deltoides', el: 'ellipse', a: { cx: 34, cy: 56, rx: 11, ry: 9 } },
  { z: 'deltoides', el: 'ellipse', a: { cx: 86, cy: 56, rx: 11, ry: 9 } },
  { z: 'pectoral', el: 'rect', a: { x: 41, y: 46, width: 18, height: 24, rx: 7 } },
  { z: 'pectoral', el: 'rect', a: { x: 61, y: 46, width: 18, height: 24, rx: 7 } },
  { z: 'biceps', el: 'ellipse', a: { cx: 27, cy: 86, rx: 7, ry: 15 } },
  { z: 'biceps', el: 'ellipse', a: { cx: 93, cy: 86, rx: 7, ry: 15 } },
  { z: 'antebrazo', el: 'ellipse', a: { cx: 22, cy: 120, rx: 6, ry: 15 } },
  { z: 'antebrazo', el: 'ellipse', a: { cx: 98, cy: 120, rx: 6, ry: 15 } },
  { z: 'abdomen', el: 'rect', a: { x: 45, y: 74, width: 30, height: 42, rx: 9 } },
  { z: 'cuadriceps', el: 'ellipse', a: { cx: 47, cy: 160, rx: 10, ry: 27 } },
  { z: 'cuadriceps', el: 'ellipse', a: { cx: 73, cy: 160, rx: 10, ry: 27 } },
  { z: 'aductores', el: 'ellipse', a: { cx: 57, cy: 150, rx: 3.5, ry: 15 } },
  { z: 'aductores', el: 'ellipse', a: { cx: 63, cy: 150, rx: 3.5, ry: 15 } },
];
const DETRAS: Forma[] = [
  { z: 'trapecio', el: 'path', a: { d: 'M46 38 L74 38 L70 62 L50 62 Z' } },
  { z: 'deltoides', el: 'ellipse', a: { cx: 34, cy: 56, rx: 11, ry: 9 } },
  { z: 'deltoides', el: 'ellipse', a: { cx: 86, cy: 56, rx: 11, ry: 9 } },
  { z: 'dorsal', el: 'path', a: { d: 'M42 64 L58 66 L58 98 L47 98 Z' } },
  { z: 'dorsal', el: 'path', a: { d: 'M78 64 L62 66 L62 98 L73 98 Z' } },
  { z: 'triceps', el: 'ellipse', a: { cx: 27, cy: 86, rx: 7, ry: 15 } },
  { z: 'triceps', el: 'ellipse', a: { cx: 93, cy: 86, rx: 7, ry: 15 } },
  { z: 'antebrazo', el: 'ellipse', a: { cx: 22, cy: 120, rx: 6, ry: 15 } },
  { z: 'antebrazo', el: 'ellipse', a: { cx: 98, cy: 120, rx: 6, ry: 15 } },
  { z: 'lumbares', el: 'rect', a: { x: 49, y: 100, width: 22, height: 18, rx: 6 } },
  { z: 'gluteo', el: 'ellipse', a: { cx: 51, cy: 132, rx: 10, ry: 11 } },
  { z: 'gluteo', el: 'ellipse', a: { cx: 69, cy: 132, rx: 10, ry: 11 } },
  { z: 'isquios', el: 'ellipse', a: { cx: 49, cy: 168, rx: 9, ry: 24 } },
  { z: 'isquios', el: 'ellipse', a: { cx: 71, cy: 168, rx: 9, ry: 24 } },
  { z: 'gemelos', el: 'ellipse', a: { cx: 49, cy: 212, rx: 7, ry: 17 } },
  { z: 'gemelos', el: 'ellipse', a: { cx: 71, cy: 212, rx: 7, ry: 17 } },
];

/** Color de una nota de agujetas 1–5 (oro de menos a más; el 5, rojo). */
export function colorDeNota(n: number): string {
  if (n >= 5) return 'var(--color-danger)';
  if (n === 4) return 'var(--color-accent)';
  const pct = n === 3 ? 70 : n === 2 ? 42 : 20;
  return `color-mix(in oklab, var(--color-accent) ${pct}%, transparent)`;
}

const NEUTRO = 'var(--color-inset)';
const SILUETA = 'color-mix(in oklab, var(--color-ink) 7%, transparent)';

interface Props {
  /** Agujetas: nota 1–5 por zona. */
  notas?: Partial<Record<ZonaIem, number>>;
  /** Selección: zonas marcadas. */
  seleccion?: ReadonlySet<ZonaIem>;
  /** Zonas que se pueden tocar / que faltan por responder (borde punteado). */
  pendientes?: ReadonlySet<ZonaIem>;
  /** Zonas atenuadas (no entrenadas esta semana). */
  apagadas?: ReadonlySet<ZonaIem>;
  onZona?: (z: ZonaIem) => void;
  /** Alto de cada figura en px. */
  alto?: number;
}

export default function MapaCorporal({ notas, seleccion, pendientes, apagadas, onZona, alto = 170 }: Props) {
  const ancho = Math.round(alto * 120 / 250);

  const pintar = (f: Forma, i: number) => {
    const nota = notas?.[f.z];
    const marcada = seleccion?.has(f.z);
    const pendiente = pendientes?.has(f.z) && !nota && !marcada;
    const fill = nota ? colorDeNota(nota) : marcada ? 'var(--color-accent)' : NEUTRO;
    const props = {
      ...f.a,
      key: `${f.z}-${i}`,
      fill,
      stroke: pendiente ? 'var(--color-accent)' : 'none',
      strokeWidth: pendiente ? 1.2 : 0,
      strokeDasharray: pendiente ? '2.5 2' : undefined,
      opacity: apagadas?.has(f.z) ? 0.35 : 1,
      style: onZona ? { cursor: 'pointer' } : undefined,
      onClick: onZona ? () => onZona(f.z) : undefined,
      role: onZona ? 'button' : undefined,
      'aria-label': onZona ? ZONA_POR_CLAVE[f.z].nombre : undefined,
      'aria-pressed': onZona && seleccion ? !!marcada : undefined,
      tabIndex: onZona ? 0 : undefined,
      onKeyDown: onZona ? (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onZona(f.z); } } : undefined,
    };
    return React.createElement(f.el, props);
  };

  const silueta = (
    <g fill={SILUETA}>
      <circle cx="60" cy="18" r="12" />
      <rect x="54" y="28" width="12" height="10" rx="3" />
      <ellipse cx="21" cy="146" rx="5" ry="7" /><ellipse cx="99" cy="146" rx="5" ry="7" />
      <rect x="41" y="192" width="13" height="42" rx="6" /><rect x="66" y="192" width="13" height="42" rx="6" />
      <rect x="42" y="236" width="14" height="8" rx="4" /><rect x="64" y="236" width="14" height="8" rx="4" />
    </g>
  );

  return (
    <div className="flex justify-center gap-5 bg-surface border border-hairline rounded-surface py-3">
      {([['Delante', DELANTE], ['Detrás', DETRAS]] as const).map(([titulo, formas]) => (
        <figure key={titulo} className="text-center">
          <svg width={ancho} height={alto} viewBox="0 0 120 250" aria-label={`Cuerpo, ${titulo.toLowerCase()}`}>
            {silueta}
            {/* En la vista de detrás las espinillas son gemelos: se tapan con la zona. */}
            {formas.map(pintar)}
          </svg>
          <figcaption className="font-mono text-caption uppercase tracking-[.14em] text-ink-4">{titulo}</figcaption>
        </figure>
      ))}
    </div>
  );
}
