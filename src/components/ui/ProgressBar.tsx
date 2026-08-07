import React from 'react';

/* ═══════════════════════════════════════════════════════════════════════════
   ProgressBar (Fase 3, nueva)

   La barra de 6 px que aparece en Nutrición (intercambios del día), Cardio
   (minutos de la semana) y las tarjetas de adherencia. `value` no se recorta
   a 100: pasarse de un presupuesto es un estado real (rojo), no un error que
   haya que ocultar aplanando la barra al máximo.

   El ancho anima en 450 ms (`--duration-bar`) y NUNCA a la vez que el resto
   de la interacción — el handoff es explícito: al registrar una ingesta, la
   fila cambia de color primero y la barra se mueve DESPUÉS. Esa secuencia la
   decide quien usa la barra (dos `setState` separados o un pequeño retraso),
   no esta primitiva.

   El "+N" en rojo al pasarse (handoff, Nutrición 01) no es parte de esta
   pieza: es un número que la pantalla compone al lado, porque solo la
   pantalla sabe si esa cifra son intercambios, minutos o kilos.
   ═══════════════════════════════════════════════════════════════════════════ */

type Props = {
  /** 0-100 normalmente; por encima de 100 la barra se pinta roja y no se recorta. */
  value: number;
  /** Nombre accesible: "Hidratos, 68 de 80 intercambios". */
  label: string;
  className?: string;
};

export default function ProgressBar({ value, label, className = '' }: Props) {
  const pasado = value > 100;
  const ancho = Math.max(0, Math.min(100, value));

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={`h-1.5 w-full overflow-hidden rounded-[4px] bg-track ${className}`}
    >
      <div
        className={
          'h-full rounded-[4px] transition-[width,background-color] duration-(--duration-bar) ease-brand '
          + (pasado ? 'bg-danger' : 'bg-accent')
        }
        style={{ width: `${ancho}%` }}
      />
    </div>
  );
}
