import React from 'react';
import type { VistazoDeLaSemana as Vistazo } from '../../utils/revisionDeLaSemana';
import { num, fraseDelRitmo } from '../../utils/revisionDeLaSemana';
import { fechaCorta } from '../../utils/trainingWeek';
import { ProgressBar } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   1 · Tu semana de un vistazo (18-11-2026)

   Lo primero del vídeo: sesiones hechas de las que tocaban, lo que comió de
   media frente a su objetivo, los pasos y el peso con su ritmo frente al de la
   fase. Cada cifra con la semana anterior al lado (la comparación fija).

   Dos versiones para que Dani elija (`variante`), con los mismos datos:
     · A «Cifras»: cuatro tarjetas en fila, como las de la cabecera de siempre.
     · B «Barras»: una línea por cosa, con una barra de lo hecho frente a lo
       que tocaba y la semana pasada a la derecha.
   Lo que no tiene dato no se pinta.
   ═══════════════════════════════════════════════════════════════════════════ */

export type VarianteSemana = 'a' | 'b';

interface Props {
  vistazo: Vistazo;
  variante: VarianteSemana;
}

interface Fila {
  id: string;
  etiqueta: string;
  valor: string;
  /** «de 4», «de 2.096 kcal»… */
  deCuanto?: string;
  /** Cumplimiento 0-100+ para la barra (versión B). */
  pct?: number;
  detalle?: string;
  anterior?: string;
}

const kg = (n: number) => `${num(n, 1)} kg`;
const conSigno = (n: number, unidad: string) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${num(Math.abs(n), 1)} ${unidad}`;

function filas(v: Vistazo): Fila[] {
  const out: Fila[] = [];
  const s = v.sesiones;
  out.push({
    id: 'sesiones', etiqueta: 'Entrenos',
    valor: `${s.hechas}`,
    deCuanto: s.tocaban != null ? `de ${s.tocaban}` : undefined,
    // Topadas a 100: hacer de más no es pasarse (la barra se pintaría en rojo).
    pct: s.tocaban ? Math.min(100, (s.hechas / s.tocaban) * 100) : undefined,
    detalle: s.tocaban == null ? (s.hechas === 1 ? 'sesión' : 'sesiones') : undefined,
    anterior: `${s.anterior}`,
  });
  if (v.comida) {
    const c = v.comida;
    out.push({
      id: 'comida', etiqueta: 'Comida',
      valor: `${num(c.kcalMedia, 0)} kcal`,
      deCuanto: `de ${num(c.kcalObjetivo, 0)}`,
      pct: c.kcalObjetivo > 0 ? (c.kcalMedia / c.kcalObjetivo) * 100 : undefined,
      detalle: `proteína ${num(c.protMedia, 0)} de ${num(c.protObjetivo, 0)} g · ${c.diasRegistrados} ${c.diasRegistrados === 1 ? 'día apuntado' : 'días apuntados'}`,
      anterior: c.kcalMediaAnterior != null ? `${num(c.kcalMediaAnterior, 0)} kcal` : undefined,
    });
  }
  if (v.pasos) {
    const p = v.pasos;
    out.push({
      id: 'pasos', etiqueta: 'Pasos',
      valor: num(p.media, 0),
      deCuanto: p.objetivo ? `de ${num(p.objetivo, 0)}` : undefined,
      pct: p.objetivo ? Math.min(100, (p.media / p.objetivo) * 100) : undefined,
      detalle: `de media al día · ${p.dias} ${p.dias === 1 ? 'día' : 'días'}`,
      anterior: p.mediaAnterior != null ? num(p.mediaAnterior, 0) : undefined,
    });
  }
  if (v.peso) {
    const w = v.peso;
    out.push({
      id: 'peso', etiqueta: 'Peso',
      valor: kg(w.media),
      detalle: (w.ritmo && fraseDelRitmo(w.ritmo)) ?? 'media de la semana',
      anterior: w.anterior != null ? `${kg(w.anterior)}${w.deltaKg ? ` (${conSigno(w.deltaKg, 'kg')})` : ''}` : undefined,
    });
  }
  return out;
}

export default function VistazoDeLaSemana({ vistazo, variante }: Props) {
  const lista = filas(vistazo);
  const rango = `${fechaCorta(vistazo.semana.desde)} → ${fechaCorta(vistazo.semana.hasta)}`;

  if (variante === 'b') {
    return (
      <div className="space-y-1">
        <p className="font-mono text-caption text-ink-3">{rango}</p>
        <ul className="m-0 p-0 list-none divide-y divide-hairline">
          {lista.map(f => (
            <li key={f.id} className="py-3 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 items-baseline">
              <div className="min-w-0">
                <span className="font-mono text-caption text-ink-2 uppercase tracking-[.1em] mr-3">{f.etiqueta}</span>
                <span className="font-sans font-bold text-title-m text-ink tabular-nums whitespace-nowrap">{f.valor}</span>
                {f.deCuanto && <span className="font-sans text-label text-ink-2 ml-1.5">{f.deCuanto}</span>}
              </div>
              <span className="font-mono text-caption text-ink-3 sm:text-right">
                {f.anterior != null ? <>semana pasada <span className="text-ink-2">{f.anterior}</span></> : 'sin semana previa'}
              </span>
              {f.pct != null && (
                <ProgressBar value={f.pct} label={`${f.etiqueta}: ${f.valor} ${f.deCuanto ?? ''}`} className="col-span-full" />
              )}
              {f.detalle && <p className="col-span-full font-sans text-label text-ink-2 text-pretty">{f.detalle}</p>}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="font-mono text-caption text-ink-3">{rango}</p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {lista.map(f => (
          <div key={f.id} className="bg-raised border border-hairline rounded-surface px-4 py-3 min-w-0 flex flex-col gap-0.5">
            <span className="font-mono text-caption text-ink-2 uppercase tracking-[.1em]">{f.etiqueta}</span>
            {/* La cifra sola en su línea: en el móvil (dos columnas y el zoom de
                presentar) «1.980 kcal de 2.096» en una línea se partía a trozos. */}
            <span className="font-mono font-semibold text-title-m sm:text-title-l tabular-nums leading-tight text-ink whitespace-nowrap">
              {f.valor}
            </span>
            {f.deCuanto && <span className="font-sans text-label text-ink-2">{f.deCuanto}</span>}
            {f.detalle && <span className="font-sans text-caption text-ink-2 text-pretty">{f.detalle}</span>}
            <span className="font-mono text-caption text-ink-3 mt-1">
              {f.anterior != null ? `semana pasada: ${f.anterior}` : 'sin semana previa'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
