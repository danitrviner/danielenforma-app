import React from 'react';
import { MUSCLE_LABELS } from '../../types';
import type { EjercicioDelBloque, VotoDeEjercicio, VotosDeEjercicios } from '../../utils/cierrePorEjercicio';
import { Icon, Skeleton } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Paso «¿qué ejercicios se quedan?» del cierre de bloque (17-11-2026)

   Una sola pantalla con los ejercicios que el atleta ha hecho en el bloque.
   Cada uno se contesta en un toque —«se queda» o «lo quitaría»— y tocar el
   mismo otra vez lo deja sin contestar: no hace falta opinar de todos.

   Dos versiones para elegir, con la misma lógica (utils/cierrePorEjercicio):
     · `filas`     filas compactas como las de agujetas, con dos botones de
                   icono a la derecha. Cabe el bloque entero casi sin scroll.
     · `tarjetas`  una tarjeta por ejercicio con los dos botones escritos,
                   como el sí/no del resto del cuestionario. Más alto, pero no
                   hay que aprender qué es cada icono.
   ═══════════════════════════════════════════════════════════════════════════ */

export type VarianteEjercicios = 'filas' | 'tarjetas';
export const VARIANTE_EJERCICIOS_POR_DEFECTO: VarianteEjercicios = 'filas';

interface Props {
  ejercicios: EjercicioDelBloque[];
  votos: VotosDeEjercicios;
  onVoto: (id: string, voto: VotoDeEjercicio) => void;
  variante?: VarianteEjercicios;
  cargando?: boolean;
  /** Textos de los dos botones (los de la pregunta, si el coach los cambió). */
  etiquetaQueda?: string;
  etiquetaQuitar?: string;
}

const OPCIONES: { voto: VotoDeEjercicio; icono: string; marcado: string }[] = [
  { voto: 'queda', icono: 'thumb_up', marcado: 'bg-success/15 border-success/40 text-success font-bold' },
  { voto: 'quitar', icono: 'thumb_down', marcado: 'bg-danger/10 border-danger/40 text-danger font-bold' },
];

const detalleDe = (e: EjercicioDelBloque) =>
  [e.grupo ? MUSCLE_LABELS[e.grupo] : null, `${e.sesiones} ${e.sesiones === 1 ? 'día' : 'días'}`].filter(Boolean).join(' · ');

export default function EjerciciosDelBloquePaso({
  ejercicios, votos, onVoto, variante = VARIANTE_EJERCICIOS_POR_DEFECTO, cargando = false,
  etiquetaQueda = 'Se queda', etiquetaQuitar = 'Lo quitaría',
}: Props) {
  const etiqueta: Record<VotoDeEjercicio, string> = { queda: etiquetaQueda, quitar: etiquetaQuitar };

  if (cargando) {
    return (
      <div className="flex flex-col gap-1.5" aria-busy="true">
        <Skeleton className="h-12 rounded-control" />
        <Skeleton className="h-12 rounded-control" />
        <Skeleton className="h-12 rounded-control" />
      </div>
    );
  }
  if (ejercicios.length === 0) {
    return (
      <p className="bg-raised border border-dashed border-hairline rounded-control px-3 py-3 font-sans text-label text-ink-3 text-pretty">
        No veo ejercicios apuntados en este bloque. Pasa a la siguiente.
      </p>
    );
  }

  const contestados = ejercicios.filter(e => votos[e.id]).length;

  const fila = (e: EjercicioDelBloque) => {
    const voto = votos[e.id];
    return (
      <div key={e.id} className="flex items-center gap-2 bg-surface border border-hairline rounded-control pl-3 pr-2 py-2">
        <div className="min-w-0 flex-1">
          <span className="block font-sans text-label font-bold text-ink leading-snug line-clamp-2">{e.nombre}</span>
          <span className="block font-sans text-caption text-ink-4 truncate">{detalleDe(e)}</span>
        </div>
        <div className="flex gap-1 shrink-0" role="group" aria-label={e.nombre}>
          {OPCIONES.map(o => (
            <button
              key={o.voto}
              type="button"
              aria-pressed={voto === o.voto}
              aria-label={etiqueta[o.voto]}
              title={etiqueta[o.voto]}
              onClick={() => onVoto(e.id, o.voto)}
              className={`w-11 h-10 rounded-[10px] border grid place-items-center transition-colors active:scale-95 ${voto === o.voto ? o.marcado : 'bg-raised border-hairline text-ink-3 hover:text-ink'}`}
            >
              <Icon name={o.icono} size="s" filled={voto === o.voto} />
            </button>
          ))}
        </div>
      </div>
    );
  };

  const tarjeta = (e: EjercicioDelBloque) => {
    const voto = votos[e.id];
    return (
      <div key={e.id} className="bg-surface border border-hairline rounded-control p-3 space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-sans text-label font-bold text-ink text-pretty">{e.nombre}</span>
          <span className="shrink-0 font-sans text-caption text-ink-4">{detalleDe(e)}</span>
        </div>
        <div className="grid grid-cols-2 gap-1 bg-raised border border-control-line rounded-control p-1" role="group" aria-label={e.nombre}>
          {OPCIONES.map(o => (
            <button
              key={o.voto}
              type="button"
              aria-pressed={voto === o.voto}
              onClick={() => onVoto(e.id, o.voto)}
              className={`min-h-[40px] rounded-[10px] border inline-flex items-center justify-center gap-1.5 font-sans text-label transition-colors active:scale-[0.98] ${voto === o.voto ? o.marcado : 'border-transparent text-ink-3 hover:text-ink'}`}
            >
              <Icon name={o.icono} size="s" filled={voto === o.voto} />
              {etiqueta[o.voto]}
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-2">
      {/* En filas, la leyenda de los dos iconos; en tarjetas ya va escrito. */}
      <div className="flex items-center justify-between gap-3 font-sans text-caption text-ink-4">
        {variante === 'filas' ? (
          <p className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1"><Icon name="thumb_up" size="s" className="text-success" />{etiquetaQueda}</span>
            <span className="inline-flex items-center gap-1"><Icon name="thumb_down" size="s" className="text-danger" />{etiquetaQuitar}</span>
          </p>
        ) : <span>Lo que has hecho este bloque</span>}
        <span className="font-mono tabular-nums">{contestados} de {ejercicios.length}</span>
      </div>
      <div className="flex flex-col gap-1.5">{ejercicios.map(variante === 'filas' ? fila : tarjeta)}</div>
    </div>
  );
}
