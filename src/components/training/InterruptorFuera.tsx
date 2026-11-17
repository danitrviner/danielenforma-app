import { Icon } from '../ui';
import { TEXTO_FUERA } from '../../utils/sesionFuera';

/* ═══════════════════════════════════════════════════════════════════════════
   «Hoy entreno fuera de mi gimnasio» (17-11-2026)

   Dani: atletas como Javier, aviador, entrenan una semana en casa y otra
   fuera; allí los pesos y las poleas no tienen nada que ver y solo se guían
   por el RIR. Un toque y la sesión cuenta como sesión y como esfuerzo, pero sus
   kilos no se comparan con los de siempre (utils/sesionFuera.ts). Se puede
   cambiar durante toda la sesión y al corregirla.

   Dos formas de enseñarlo para que Dani elija viéndolas (banco `/dev/entreno`).
   La lógica es la misma; solo cambia el aspecto:

     · chip — un chip más, debajo de «¿Cómo llegas hoy?», con el mismo estilo
              que esos chips. La explicación sale al encenderlo.
     · fila — una fila propia con interruptor, el título y siempre la
              explicación debajo. Más visible; ocupa más.
   ═══════════════════════════════════════════════════════════════════════════ */

export type VarianteFuera = 'chip' | 'fila';

/** La que queda en producción hasta que Dani elija. */
export const VARIANTE_FUERA_POR_DEFECTO: VarianteFuera = 'fila';

/** Para el conmutador del banco de pruebas. */
export const VARIANTES_FUERA: { clave: VarianteFuera; etiqueta: string; explicacion: string }[] = [
  { clave: 'chip', etiqueta: 'Chip', explicacion: 'Un chip junto a «¿Cómo llegas hoy?». La explicación sale al encenderlo.' },
  { clave: 'fila', etiqueta: 'Fila', explicacion: 'Fila propia con interruptor y la explicación siempre a la vista.' },
];

interface Props {
  activo: boolean;
  onCambiar: (activo: boolean) => void;
  /** El coach marcó esta semana como semana fuera (viaje o vacaciones). */
  semanaMarcada?: boolean;
  variante?: VarianteFuera;
}

export default function InterruptorFuera({ activo, onCambiar, semanaMarcada = false, variante = VARIANTE_FUERA_POR_DEFECTO }: Props) {
  if (variante === 'chip') {
    return (
      <div className="px-1 space-y-1.5">
        <button
          type="button"
          onClick={() => onCambiar(!activo)}
          aria-pressed={activo}
          className={`inline-flex items-center gap-1.5 rounded-control border px-2.5 py-1.5 font-sans text-label transition-colors ${
            activo ? 'border-accent-line text-accent-ink' : 'border-hairline text-ink-2 hover:text-ink'
          }`}
        >
          <Icon name="route" size="s" />
          {TEXTO_FUERA.corto}
        </button>
        {activo && <p className="font-sans text-caption text-ink-2">{TEXTO_FUERA.explicacion}</p>}
        {semanaMarcada && <p className="font-sans text-caption text-accent-ink">{TEXTO_FUERA.semanaMarcada}</p>}
      </div>
    );
  }

  return (
    <div className={`flex items-start gap-3 rounded-surface border px-3 py-2.5 transition-colors ${activo ? 'border-accent-line bg-accent/6' : 'border-hairline bg-surface'}`}>
      <Icon name="route" size="s" className={`mt-0.5 flex-shrink-0 ${activo ? 'text-accent-ink' : 'text-ink-3'}`} />
      <div className="min-w-0 flex-1">
        <p className="font-sans text-label font-bold text-ink">{TEXTO_FUERA.titulo}</p>
        <p className="font-sans text-caption text-ink-2">{TEXTO_FUERA.explicacion}</p>
        {semanaMarcada && <p className="mt-0.5 font-sans text-caption text-accent-ink">{TEXTO_FUERA.semanaMarcada}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={activo}
        aria-label={TEXTO_FUERA.titulo}
        onClick={() => onCambiar(!activo)}
        style={{ padding: '2px' }}
        className={`mt-0.5 w-11 h-6 rounded-full shrink-0 transition-colors ${activo ? 'bg-accent' : 'bg-strong'}`}
      >
        <span className={`block w-5 h-5 rounded-full bg-bg transition-transform ${activo ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  );
}
