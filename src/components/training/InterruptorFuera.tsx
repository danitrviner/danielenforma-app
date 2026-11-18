import { Icon } from '../ui';
import { TEXTO_AJUSTE_FUERA } from '../../utils/sesionFuera';

/* ═══════════════════════════════════════════════════════════════════════════
   «A veces entreno fuera de mi gimnasio» — el ajuste, en Perfil › Mi gimnasio

   17-11-2026: nació como interruptor dentro de la sesión («Hoy entreno fuera
   de mi gimnasio») para atletas como Javier, aviador, que una semana entrenan
   en casa y otra fuera.

   18-11-2026, Dani: «dentro de la sesión, no, que no te lo pregunte, porque
   molesta más que otra cosa». La sesión ya no pregunta nada. El atleta que lo
   necesita lo enciende aquí, una vez; solo entonces sale, al final de Rutinas,
   el panel para marcar qué sesiones de esta semana hace fuera
   (SesionesFueraDeLaSemana.tsx). Apagado por defecto (`Gimnasio.entrenoFuera`).
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  activo: boolean;
  onCambiar: (activo: boolean) => void;
  /** Mientras se guarda, el toque se ignora. */
  guardando?: boolean;
}

export default function InterruptorFuera({ activo, onCambiar, guardando = false }: Props) {
  return (
    <div className={`flex items-start gap-3 rounded-surface border px-3 py-2.5 transition-colors ${activo ? 'border-accent-line bg-accent/6' : 'border-hairline bg-surface'}`}>
      <Icon name="route" size="s" className={`mt-0.5 flex-shrink-0 ${activo ? 'text-accent-ink' : 'text-ink-3'}`} />
      <div className="min-w-0 flex-1">
        <p className="font-sans text-label font-bold text-ink">{TEXTO_AJUSTE_FUERA.titulo}</p>
        <p className="font-sans text-caption text-ink-2 text-pretty">{activo ? TEXTO_AJUSTE_FUERA.encendido : TEXTO_AJUSTE_FUERA.apagado}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={activo}
        aria-label={TEXTO_AJUSTE_FUERA.titulo}
        disabled={guardando}
        onClick={() => onCambiar(!activo)}
        style={{ padding: '2px' }}
        className={`mt-0.5 w-11 h-6 rounded-full shrink-0 transition-colors disabled:opacity-60 ${activo ? 'bg-accent' : 'bg-strong'}`}
      >
        <span className={`block w-5 h-5 rounded-full bg-bg transition-transform ${activo ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  );
}
