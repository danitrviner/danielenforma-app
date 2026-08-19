import React from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

/* ═══════════════════════════════════════════════════════════════════════════
   Botón Atrás de Android · `07-9`

   No había ni un listener de `backButton` en todo el repo. En Android eso
   significa el comportamiento por defecto del WebView, que es el peor posible:

   · Con un Sheet o un Dialog abierto, Atrás NO cierra el overlay: navega por
     debajo, y la persona se queda con la capa encima de otra pantalla.
   · En la pantalla raíz, Atrás cierra la app en seco y sin preguntar. Incluso
     en mitad de un entrenamiento.

   El modelo mental es el de `useEscape`: Atrás en Android es el Escape del
   móvil, y quien manda es la capa de más arriba. De ahí la pila — el último
   que se abre es el primero en cerrarse, sin que ninguna capa tenga que saber
   qué hay debajo.

   En web e iOS no se registra nada: no hay botón físico, y el gesto de borde
   de iOS lo gobierna el sistema.
   ═══════════════════════════════════════════════════════════════════════════ */

type Cerrador = () => void;

/** Capas abiertas, de más antigua a más reciente. Manda la última. */
const pila: Cerrador[] = [];

/** Qué hacer cuando no hay ninguna capa abierta. Lo fija App.tsx. */
let manejadorDeRuta: ((puedeVolver: boolean) => void) | null = null;

let escuchando = false;

/**
 * Apila una capa. Devuelve la función para quitarla — quitarla por identidad y
 * no por posición es lo que hace que dos overlays que se cierran en orden
 * distinto al de apertura no se pisen.
 */
export function apilarCerrador(cerrar: Cerrador): () => void {
  pila.push(cerrar);
  return () => {
    const i = pila.lastIndexOf(cerrar);
    if (i >= 0) pila.splice(i, 1);
  };
}

export function fijarManejadorDeRuta(fn: (puedeVolver: boolean) => void): void {
  manejadorDeRuta = fn;
}

/** Solo para pruebas: deja el módulo como recién cargado. */
export function _reiniciarPila(): void {
  pila.length = 0;
  manejadorDeRuta = null;
}

/**
 * Decide qué hace una pulsación de Atrás. Se exporta aparte del listener para
 * poder probar la decisión sin Capacitor delante.
 */
export function manejarAtras(puedeVolver: boolean): void {
  const capaDeArriba = pila[pila.length - 1];
  if (capaDeArriba) {
    capaDeArriba();
    return;
  }
  manejadorDeRuta?.(puedeVolver);
}

/** Registra el listener nativo. Idempotente: llamarlo dos veces no duplica. */
export function iniciarBotonAtras(): void {
  if (escuchando || !Capacitor.isNativePlatform()) return;
  escuchando = true;
  void App.addListener('backButton', ({ canGoBack }) => manejarAtras(canGoBack));
}

/** Cierra la app. Aparte para que App.tsx no dependa del plugin. */
export function salirDeLaApp(): void {
  void App.exitApp();
}

/**
 * Registra una capa mientras `activo` sea true.
 *
 * El cerrador se guarda en una ref para que la identidad que se apila sea
 * estable: si dependiera de `alCerrar`, cada render del componente padre
 * desapilaría y volvería a apilar la capa, y con dos overlays abiertos eso
 * altera el orden de la pila — que es justo lo único que esta pila tiene que
 * garantizar.
 */
export function useBotonAtras(alCerrar: () => void, activo: boolean): void {
  const ref = React.useRef(alCerrar);
  ref.current = alCerrar;

  React.useEffect(() => {
    if (!activo) return;
    return apilarCerrador(() => ref.current());
  }, [activo]);
}
