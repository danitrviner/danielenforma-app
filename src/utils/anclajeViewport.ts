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

   29-10: dos agujeros de la versión anterior.
     · El teclado solo se detectaba por esa medida. Donde el teclado encoge
       también el viewport de maqueta (la app de Android, y cualquier navegador
       que redimensione la página) la diferencia es 0, así que la barra se
       quedaba encima de las teclas tapando las series del entreno. Ahora manda
       el foco: si hay un campo de texto enfocado, hay teclado.
     · Cualquier diferencia pequeña se traducía en mover la barra: el rebote
       del scroll al tirar hacia abajo arriba del todo y la barra de Safari al
       aparecer abrían un hueco de unas decenas de píxeles durante la animación
       y la barra subía sola. Sin zoom no hay nada que corregir —`fixed` ya va
       pegado al borde—, así que solo se recoloca con la página ampliada.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Por encima de esto el hueco solo puede ser un teclado, no un zoom ni la
 *  barra de herramientas del navegador. Con el teclado abierto la barra de
 *  navegación no se recoloca: se esconde. Reaparecer justo encima de las
 *  teclas tapa el campo que se está rellenando. */
export const ALTURA_MINIMA_TECLADO = 150;

/** Por debajo de esta escala la página no está ampliada: lo que quede es
 *  redondeo de los viewports fraccionarios. */
const ESCALA_MINIMA_AMPLIADA = 1.01;

export interface MedidaViewport {
  /** Píxeles CSS entre el fondo del viewport de maqueta y el fondo del visual. */
  hueco: number;
  /** La página está ampliada (pellizco o zoom automático al enfocar). */
  ampliada: boolean;
}

/** Pura para poder probarla sin navegador. */
export function medirViewport(
  vv: Pick<VisualViewport, 'offsetTop' | 'height' | 'scale'>,
  altoMaqueta: number,
): MedidaViewport {
  // offsetTop negativo es el rebote del scroll en iOS, no un desplazamiento
  // real del viewport visual dentro del de maqueta.
  const fondoVisual = Math.max(0, vv.offsetTop) + vv.height;
  const diferencia = altoMaqueta - fondoVisual;
  // El umbral de 1 px absorbe el redondeo de los viewports fraccionarios
  // (relación de píxeles no entera), que si no dejaría la barra
  // temblando entre 0 y 1.
  return {
    hueco: diferencia > 1 ? Math.round(diferencia) : 0,
    ampliada: vv.scale > ESCALA_MINIMA_AMPLIADA,
  };
}

const SIN_HUECO: MedidaViewport = { hueco: 0, ampliada: false };

export function useMedidaViewport(): MedidaViewport {
  const [medida, setMedida] = useState<MedidaViewport>(SIN_HUECO);

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
        const nueva = medirViewport(vv, document.documentElement.clientHeight);
        setMedida(previa =>
          previa.hueco === nueva.hueco && previa.ampliada === nueva.ampliada ? previa : nueva,
        );
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

  return medida;
}

/** Tipos de <input> que sacan teclado. Casillas, botones, deslizadores o
 *  selectores de color no lo hacen y no deben esconder la barra. */
const INPUTS_CON_TECLADO = new Set([
  'text', 'search', 'email', 'tel', 'url', 'password', 'number',
  'date', 'datetime-local', 'time', 'month', 'week',
]);

export function abreTeclado(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) {
    return INPUTS_CON_TECLADO.has(el.type) && !el.readOnly && !el.disabled;
  }
  return el instanceof HTMLElement && el.isContentEditable;
}

/** Hay un campo de texto enfocado, o sea, teclado en pantalla (en móvil). */
export function useCampoDeTextoEnfocado(): boolean {
  const [enfocado, setEnfocado] = useState(false);

  useEffect(() => {
    let cuadro = 0;
    const revisar = () => {
      cancelAnimationFrame(cuadro);
      // Al saltar de «kg» a «reps» llega focusout antes que focusin: mirar el
      // elemento activo en el cuadro siguiente evita que la barra parpadee.
      cuadro = requestAnimationFrame(() => setEnfocado(abreTeclado(document.activeElement)));
    };
    revisar();
    document.addEventListener('focusin', revisar);
    document.addEventListener('focusout', revisar);
    return () => {
      cancelAnimationFrame(cuadro);
      document.removeEventListener('focusin', revisar);
      document.removeEventListener('focusout', revisar);
    };
  }, []);

  return enfocado;
}
