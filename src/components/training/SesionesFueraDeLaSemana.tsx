import { Icon } from '../ui';
import { fechaCorta } from '../../utils/trainingWeek';
import { TEXTO_PANEL_FUERA } from '../../utils/sesionFuera';

/* ═══════════════════════════════════════════════════════════════════════════
   «¿Entrenas fuera esta semana?» — al final de Rutinas (17-11-2026)

   Dani: «que lo pueda hacer él desde el panel de entrenamiento». El atleta que
   sabe que esta semana viaja marca aquí, con un toque, las sesiones que va a
   hacer fuera de su gimnasio; al empezarlas, el interruptor «fuera» llega ya
   encendido (y se puede apagar en la sesión). Se guarda en su plan semanal
   (`PlanSemanal.sesionesFuera`). La lógica, en utils/sesionFuera.ts.

   Una sola versión y discreta: va al final, debajo de las tarjetas, con su
   mismo marco y sin color hasta que algo se marca.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface SesionDelPanel {
  id: string;
  nombre: string;
  fecha: string;
}

interface Props {
  sesiones: readonly SesionDelPanel[];
  marcadas: readonly string[];
  onAlternar: (id: string) => void;
  /** Mientras se guarda, los toques se ignoran (evita dos escrituras cruzadas). */
  guardando?: boolean;
}

export default function SesionesFueraDeLaSemana({ sesiones, marcadas, onAlternar, guardando = false }: Props) {
  if (sesiones.length === 0) return null;
  return (
    <section aria-label={TEXTO_PANEL_FUERA.titulo} className="rounded-surface border border-hairline bg-surface p-4 space-y-3">
      <div className="flex items-start gap-3">
        <Icon name="route" size="s" className="mt-0.5 flex-shrink-0 text-ink-3" />
        <div className="min-w-0">
          <p className="font-sans text-label font-bold text-ink">{TEXTO_PANEL_FUERA.titulo}</p>
          <p className="font-sans text-caption text-ink-2">{TEXTO_PANEL_FUERA.ayuda}</p>
        </div>
      </div>
      <ul className="space-y-1.5">
        {sesiones.map(s => {
          const marcada = marcadas.includes(s.id);
          return (
            <li key={s.id}>
              <button
                type="button"
                aria-pressed={marcada}
                disabled={guardando}
                onClick={() => onAlternar(s.id)}
                className={`w-full flex items-center gap-3 rounded-control border px-3 py-2 text-left transition-colors disabled:opacity-60 ${
                  marcada ? 'border-accent-line bg-accent/6' : 'border-hairline hover:border-strong'
                }`}
              >
                <Icon
                  name={marcada ? 'check_circle' : 'radio_button_unchecked'}
                  size="s"
                  filled={marcada}
                  className={`flex-shrink-0 ${marcada ? 'text-accent-ink' : 'text-ink-3'}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-sans text-label font-bold text-ink">{s.nombre}</span>
                  <span className="block font-mono text-caption text-ink-2">{fechaCorta(s.fecha, { dia: true })}</span>
                </span>
                {marcada && <span className="font-mono text-caption uppercase text-accent-ink">Fuera</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
