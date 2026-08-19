import React from 'react';
import Icon from './Icon';

/* ═══════════════════════════════════════════════════════════════════════════
   RingSeal (Fase 3, nueva)

   El anillo de cierre: día de nutrición dentro de presupuesto, semana de
   cardio completa, el cierre del tutorial. Se cierra en 1,1 s
   (`--duration-ring`) y, si `complete`, un sello de check aparece a los
   ~550 ms con `animate-seal-pop`. Sin confeti — el handoff lo dice tres
   veces en tres módulos distintos: la celebración es el anillo y el sello,
   nada más.

   No sustituye a `components/ProgressRing.tsx` (el anillo cian/oro que ya
   usan `HomeScreen`/`ClientHub`) en este commit: esta es la primitiva nueva
   para las pantallas que Fase 3 reconstruye desde cero; el reemplazo de los
   usos existentes ocurre cuando esas pantallas concretas se rehacen (F3.11,
   F3.13), no aquí — cambiar ambos a la vez sin verlos en pantalla sería
   arriesgar una regresión visual que nadie puede detectar hasta entonces.

   La animación arranca en 0 % y sube al valor real en el siguiente frame: es
   lo que hace que el `transition` de `stroke-dashoffset` se dispare al
   montar en vez de aparecer ya cerrado.
   ═══════════════════════════════════════════════════════════════════════════ */

type Props = {
  /** 0-100. */
  percent: number;
  size?: number;
  strokeWidth?: number;
  /** Muestra el sello de check centrado, en vez de (o sobre) el contenido. */
  complete?: boolean;
  /** Contenido centrado dentro del anillo: una cifra, "12/14". */
  children?: React.ReactNode;
  label: string;
  className?: string;
};

export default function RingSeal({
  percent,
  size = 150,
  strokeWidth = 10,
  complete = false,
  children,
  label,
  className = '',
}: Props) {
  const radio = (size - strokeWidth) / 2;
  const circunferencia = 2 * Math.PI * radio;
  const [offset, setOffset] = React.useState(circunferencia);

  React.useEffect(() => {
    const objetivo = circunferencia * (1 - Math.max(0, Math.min(100, percent)) / 100);
    const id = requestAnimationFrame(() => setOffset(objetivo));
    return () => cancelAnimationFrame(id);
  }, [percent, circunferencia]);

  return (
    <div
      role="img"
      aria-label={label}
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radio} strokeWidth={strokeWidth} className="fill-none stroke-track" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radio}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className="fill-none stroke-accent transition-[stroke-dashoffset] duration-(--duration-ring) ease-brand"
          style={{ strokeDasharray: circunferencia, strokeDashoffset: offset }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {complete ? (
          <span className="animate-seal-pop flex h-12 w-12 items-center justify-center rounded-full bg-accent text-on-accent">
            <Icon name="check" size="l" />
          </span>
        ) : children}
      </div>
    </div>
  );
}
