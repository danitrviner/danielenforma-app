import React from 'react';

/* ═══════════════════════════════════════════════════════════════════════════
   useDireccionDeFecha — al cambiar de día, el contenido entra desde el lado
   hacia el que vas: mañana desde la derecha, ayer desde la izquierda. Vale
   para cualquier valor ordenable como texto (fechas ISO). En el primer render
   no devuelve nada: la pantalla ya escalona su entrada.
   ═══════════════════════════════════════════════════════════════════════════ */
export function useDireccionDeFecha(valor: string): string {
  const anterior = React.useRef<string | null>(null);
  const previo = anterior.current;
  anterior.current = valor;
  if (previo === null || previo === valor) return '';
  return valor > previo ? 'animate-desde-der' : 'animate-desde-izq';
}
