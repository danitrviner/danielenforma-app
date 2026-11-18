import type { WorkoutLog } from '../../types';
import { Icon } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   «¿Cómo llegas hoy?» — lo primero de la sesión (18-11-2026)

   Antes era una fila de chips encima del primer ejercicio, opcional, y casi
   nadie la contestaba. Dani: «que no te lo ponga ahí arriba porque la gente no
   lo va a contestar. Ponlo lo primero y que contesten». Ahora ocupa el sitio
   de los ejercicios hasta que se contesta, y se vuelve a preguntar cada vez
   que se abre la sesión (lo de antes se borra: TrainingScreen.openPlayer).

   Dos formas para que Dani elija viéndolas (banco `/dev/entreno`):
     · tres   — Con energía / Normal / Justo, en grande.
     · escala — del 1 al 10, «cómo de fuerte empiezas». Guarda la nota
                (`comoLlegaNota`) y, por tramos, `comoLlega`, que es lo que ya
                leen la revisión del coach y el resto.
   ═══════════════════════════════════════════════════════════════════════════ */

export type ComoLlega = NonNullable<WorkoutLog['comoLlega']>;
export type VarianteComoLlega = 'tres' | 'escala';

/** Dani eligió la escala del 1 al 10 el 18-11-2026. */
export const VARIANTE_COMO_LLEGA_POR_DEFECTO: VarianteComoLlega = 'escala';

/** Para el conmutador del banco de pruebas. */
export const VARIANTES_COMO_LLEGA: { clave: VarianteComoLlega; etiqueta: string; explicacion: string }[] = [
  { clave: 'tres', etiqueta: 'Tres opciones', explicacion: 'Con energía, normal o justo. Un toque.' },
  { clave: 'escala', etiqueta: 'Del 1 al 10', explicacion: 'Cómo de fuerte empiezas, del 1 al 10. Más fino; guarda también el tramo.' },
];

const OPCIONES: { clave: ComoLlega; etiqueta: string; icono: string }[] = [
  { clave: 'bien', etiqueta: 'Con energía', icono: 'bolt' },
  { clave: 'normal', etiqueta: 'Normal', icono: 'trending_flat' },
  { clave: 'justo', etiqueta: 'Justo', icono: 'trending_down' },
];

/** El tramo de una nota de 1 a 10: 1-4 justo, 5-7 normal, 8-10 con energía. */
export function tramoDeNota(nota: number): ComoLlega {
  if (nota >= 8) return 'bien';
  if (nota >= 5) return 'normal';
  return 'justo';
}

interface Props {
  onContestar: (valor: ComoLlega, nota?: number) => void;
  variante?: VarianteComoLlega;
}

export default function PreguntaComoLlega({ onContestar, variante = VARIANTE_COMO_LLEGA_POR_DEFECTO }: Props) {
  return (
    <section aria-labelledby="pregunta-como-llega" className="rounded-canvas border border-accent-line bg-accent-bg p-5 space-y-4">
      <div className="space-y-1">
        <h2 id="pregunta-como-llega" className="font-sans text-title-m font-bold text-ink text-balance">
          {variante === 'escala' ? '¿Cómo de fuerte empiezas hoy?' : '¿Cómo llegas hoy?'}
        </h2>
        <p className="font-sans text-label text-ink-2 text-pretty">Contéstalo antes de empezar: ayuda a leer bien tu sesión.</p>
      </div>

      {variante === 'escala' ? (
        <div className="space-y-2">
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
              <button
                key={n}
                type="button"
                onClick={() => onContestar(tramoDeNota(n), n)}
                aria-label={`${n} de 10`}
                className="h-12 rounded-control border border-hairline bg-surface font-mono text-title-s font-bold text-ink tabular-nums hover:border-accent-line active:scale-[0.97] transition-[border-color,transform]"
              >
                {n}
              </button>
            ))}
          </div>
          <div className="flex justify-between font-sans text-caption text-ink-3">
            <span>1 · sin fuerzas</span>
            <span>10 · a tope</span>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {OPCIONES.map(o => (
            <button
              key={o.clave}
              type="button"
              onClick={() => onContestar(o.clave)}
              className="w-full flex items-center gap-3 rounded-control border border-hairline bg-surface px-4 py-3.5 text-left hover:border-accent-line active:scale-[0.99] transition-[border-color,transform]"
            >
              <Icon name={o.icono} size="m" className="text-accent-ink flex-shrink-0" />
              <span className="font-sans text-body font-bold text-ink">{o.etiqueta}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
