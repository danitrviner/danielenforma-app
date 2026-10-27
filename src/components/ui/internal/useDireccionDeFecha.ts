import React from 'react';

/* ═══════════════════════════════════════════════════════════════════════════
   useDireccionDeFecha — al cambiar de día, el contenido entra desde el lado
   hacia el que vas: mañana desde la derecha, ayer desde la izquierda. Vale
   para cualquier valor ordenable como texto (fechas ISO). En el primer render
   no devuelve nada: la pantalla ya escalona su entrada.
   ═══════════════════════════════════════════════════════════════════════════ */
export function useDireccionDeFecha(valor: string): string {
  // Estado derivado durante el render (no un ref): un ref «valor anterior»
  // falla con el doble render de StrictMode y, al actualizarse, retiraría la
  // clase en el siguiente re-render y cortaría la animación a mitad. Así la
  // clase se calcula UNA vez por cambio de valor y se queda hasta el siguiente.
  const [estado, setEstado] = React.useState({ valor, clase: '' });
  if (estado.valor !== valor) {
    const clase = valor > estado.valor ? 'animate-desde-der' : 'animate-desde-izq';
    setEstado({ valor, clase });
    return clase;
  }
  return estado.clase;
}
