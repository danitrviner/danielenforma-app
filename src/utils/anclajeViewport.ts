import { useEffect, useState } from 'react';

/* ═══════════════════════════════════════════════════════════════════════════
   Anclaje de las barras fijas al viewport VISUAL.

   `position: fixed` no se ancla a lo que la persona ve: se ancla al viewport
   de MAQUETA (layout viewport). Los dos coinciden casi siempre, y por eso una
   barra inferior parece pegada al borde de la pantalla… hasta que dejan de
   coincidir:

     · Se abre el teclado. En iOS el viewport de maqueta no encoge, así que la
       barra se queda DEBAJO del teclado; al desplazar el contenido, reaparece
       flotando a media pantalla en vez de en el borde.
     · La página se amplía. Safari ignora `user-scalable=no`, así que un pellizco
       —o el zoom automático al enfocar un campo— deja el viewport visual más
       pequeño que el de maqueta, y la barra queda anclada al borde de un
       rectángulo que ya no se ve entero.

   De ahí el "a veces sí y a veces no" del informe: no depende de la pantalla,
   depende de si antes hubo teclado o zoom. `visualViewport` mide exactamente
   esa diferencia y permite corregirla.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Píxeles CSS entre el fondo del viewport de maqueta y el fondo del visual. */
export function useHuecoInferiorVisible(): number {
  const [hueco, setHueco] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    // Sin la API (navegadores viejos) no se toca nada: la barra se comporta
    // exactamente como hasta ahora, que es el peor caso, no una regresión.
    if (!vv) return;

    let cuadro = 0;
    const medir = () => {
      cancelAnimationFrame(cuadro);
      // rAF y no la medida directa: durante la animación de apertura del
      // teclado llegan decenas de eventos y cada uno provocaría un render.
      cuadro = requestAnimationFrame(() => {
        const fondoVisual = vv.offsetTop + vv.height;
        const diferencia = document.documentElement.clientHeight - fondoVisual;
        // El umbral de 1 px absorbe el redondeo de los viewports fraccionarios
        // (relación de píxeles no entera), que si no dejaría la barra
        // temblando entre 0 y 1.
        setHueco(diferencia > 1 ? Math.round(diferencia) : 0);
      });
    };

    medir();
    vv.addEventListener('resize', medir);
    vv.addEventListener('scroll', medir);
    return () => {
      cancelAnimationFrame(cuadro);
      vv.removeEventListener('resize', medir);
      vv.removeEventListener('scroll', medir);
    };
  }, []);

  return hueco;
}

/** Por encima de esto el hueco solo puede ser un teclado, no un zoom ni la
 *  barra de herramientas del navegador. Con el teclado abierto la barra de
 *  navegación no se recoloca: se esconde. Reaparecer justo encima de las
 *  teclas tapa el campo que se está rellenando. */
export const ALTURA_MINIMA_TECLADO = 150;
