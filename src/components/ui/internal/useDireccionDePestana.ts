import React from 'react';

/* ═══════════════════════════════════════════════════════════════════════════
   useDireccionDePestana — hacia dónde entra el contenido al cambiar de pestaña.

   Devuelve la clase de animación para la envoltura del contenido (que debe
   llevar `key={value}` para remontarse): `animate-desde-der` si la pestaña
   nueva está a la derecha de la anterior, `animate-desde-izq` si está a la
   izquierda, `animate-fade-up` si no son vecinas en la misma lista (un salto
   de tres pestañas no «recorre» nada: se funde) y nada en el primer render,
   que ya lo escalona la pantalla.

   Es la continuidad espacial de P3: el contenido se mueve en el sentido en
   que te mueves tú, como la pastilla del segmentado.
   ═══════════════════════════════════════════════════════════════════════════ */
export function useDireccionDePestana(ids: readonly string[], value: string): string {
  // Estado derivado durante el render, no un ref (ver useDireccionDeFecha):
  // sobrevive al doble render de StrictMode y la clase se mantiene hasta el
  // siguiente cambio, sin cortar la animación.
  const clave = ids.join('|');
  const [estado, setEstado] = React.useState({ clave, value, clase: '' });
  if (estado.value !== value || estado.clave !== clave) {
    let clase = 'animate-fade-up';
    if (estado.clave === clave) {
      const de = ids.indexOf(estado.value);
      const a = ids.indexOf(value);
      if (de >= 0 && a >= 0 && Math.abs(a - de) === 1) clase = a > de ? 'animate-desde-der' : 'animate-desde-izq';
    }
    setEstado({ clave, value, clase });
    return clase;
  }
  return estado.clase;
}
