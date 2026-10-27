import React from 'react';
import Icon from './Icon';
import { useRecienHecho } from '../../hooks/useRecienHecho';

/* ═══════════════════════════════════════════════════════════════════════════
   SelloHecho — el círculo de «hecho» de una fila (alimento comido, serie
   hecha, paso de la revisión), con su sello.

   Lo que aporta frente a un botón con `aria-pressed`: cuando `hecho` pasa de
   falso a cierto, el check entra con `seal-pop` (el mismo sello que cierra
   el anillo del día). Solo en la transición: montar una fila ya hecha no
   sella nada. El tono lo elige la fila: oro para «lo siguiente», verde para
   «cumplido».
   ═══════════════════════════════════════════════════════════════════════════ */
type Props = {
  hecho: boolean;
  onClick: () => void;
  /** Lo que lee el lector de pantalla: «Marcar X como comido» / «Desmarcar X». */
  label: string;
  tono?: 'accent' | 'success';
  /** Diámetro en clases de Tailwind (por defecto 28 px). */
  tamano?: string;
  className?: string;
};

export default function SelloHecho({ hecho, onClick, label, tono = 'accent', tamano = 'h-7 w-7', className = '' }: Props) {
  const sellando = useRecienHecho(hecho);
  const relleno = tono === 'success' ? 'border-success bg-success text-on-fill' : 'border-accent bg-accent text-on-accent';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={hecho}
      aria-label={label}
      className={`relative zona-tactil flex ${tamano} flex-none items-center justify-center rounded-full border-2 transition-colors duration-(--duration-state) active:scale-90 ${hecho ? relleno : 'border-ink-4 text-transparent hover:border-ink-2'} ${className}`}
    >
      <span className={`flex items-center justify-center ${sellando ? 'animate-seal-pop' : ''}`}>
        <Icon name="check" size="s" />
      </span>
    </button>
  );
}
