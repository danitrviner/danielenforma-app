import React from 'react';
import { REDUCCION_SEMANA_1_PCT } from '../../utils/hipotesisDeBloque/cifras';

/* ═══════════════════════════════════════════════════════════════════════════
   «Empezar con la semana 1 reducida» (17-11-2026)

   Interruptor de la cabecera del mesociclo, APAGADO por defecto (decisión de
   Dani). La app solo la sugiere —una línea discreta con «Activarla»— cuando
   hay ejercicios nuevos frente al bloque anterior o un parón de más de 3
   semanas (`sugerirSemana1Reducida`). Encendida, la semana 1 se entrena con
   las cargas y el RIR de siempre y un 7 % menos de volumen: el recorte por
   ejercicio lo calcula `planDeSemana1Reducida` y aquí solo se cuenta.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  activa: boolean;
  /** Por qué la app la recomienda; `null` si no la recomienda. */
  motivo: string | null;
  /** Lo que se quita en la semana 1, ya con nombres: «Press inclinado −1». Sin rutinas, vacío. */
  recorte?: string[];
  /** El bloque ya tiene rutinas (si no, el recorte aún no se puede calcular). */
  conRutinas?: boolean;
  onCambiar: (activa: boolean) => void;
}

export default function Semana1Reducida({ activa, motivo, recorte = [], conRutinas = true, onCambiar }: Props) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onCambiar(!activa)}
          className={`relative w-10 h-5.5 rounded-full flex-shrink-0 transition-colors ${activa ? 'bg-accent' : 'bg-inset'}`}
          style={{ padding: 3 }}
          aria-pressed={activa}
          aria-label="Empezar con la semana 1 reducida"
        >
          <span className="block w-4 h-4 rounded-full bg-ink transition-transform duration-200" style={{ transform: activa ? 'translateX(18px)' : 'translateX(0)' }} />
        </button>
        <span className="font-mono text-caption text-ink-2 uppercase tracking-wider">Empezar con la semana 1 reducida</span>
      </div>
      {activa ? (
        <p className="font-sans text-caption text-ink-3 leading-relaxed">
          La semana 1 va con las cargas y el RIR de siempre y un {REDUCCION_SEMANA_1_PCT} % menos de volumen, en series enteras (al menos una menos en las zonas con estrella, nunca menos de una por ejercicio).{' '}
          {recorte.length > 0
            ? <>Se quita: {recorte.join(' · ')}.</>
            : conRutinas ? 'Con estas rutinas no llega a quitar ninguna serie.' : 'El recorte se calcula en cuanto el bloque tenga sus rutinas.'}
        </p>
      ) : motivo ? (
        <p className="font-sans text-caption text-ink-3 leading-relaxed">
          {motivo}{' '}
          <button type="button" className="underline font-bold text-ink-2" onClick={() => onCambiar(true)}>Activarla</button>
        </p>
      ) : null}
    </div>
  );
}
