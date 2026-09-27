/* ═══════════════════════════════════════════════════════════════════════════
   TEMA · claro / oscuro

   Qué decide este módulo: si el <html> lleva la clase `dark` o no. Nada más.
   Los colores no viven aquí — viven en `src/index.css`, en las dos paletas
   `:root` (claro) y `.dark` (oscuro). Este archivo solo acciona el
   interruptor.

   Tres opciones, no dos. «Sistema» es el valor por defecto: la app sigue a
   macOS/iOS/Android y cambia sola al anochecer. «Claro» y «oscuro» la fijan.
   La diferencia importa: un coach con el Mac en oscuro puede querer la app en
   claro para revisar planes de día, y al revés — el atleta en el gimnasio casi
   siempre quiere oscuro pase lo que pase fuera.

   Por qué la preferencia va en localStorage y no en Firestore: se necesita
   ANTES de que haya sesión, en el primer frame, sin red. Un tema que llega
   con el perfil del usuario llega tarde y se ve el parpadeo. El precio es que
   no viaja entre dispositivos, que para un ajuste de comodidad visual es el
   intercambio correcto.

   El primer pintado lo resuelve el script en línea de `index.html`, que
   ejecuta esta misma lógica antes de que React monte. Este módulo es para
   los cambios EN CALIENTE (el ajuste de Perfil, el sistema cambiando de tema
   mientras la app está abierta).
   ═══════════════════════════════════════════════════════════════════════════ */

export type PreferenciaDeTema = 'sistema' | 'claro' | 'oscuro';

/** Misma clave que lee el script en línea de index.html — si cambia aquí,
 *  cambia allí, o la app arranca con un tema y se corrige en el primer frame. */
export const CLAVE_TEMA = 'enforma_tema_v1';

/** Color de la barra de estado del móvil por tema. Son los dos `--p-bg`. */
const FONDO_POR_TEMA = { claro: '#F4F2ED', oscuro: '#121212' } as const;

function esPreferencia(v: unknown): v is PreferenciaDeTema {
  return v === 'sistema' || v === 'claro' || v === 'oscuro';
}

/** Lo que el usuario ha elegido. `sistema` si no ha elegido nada o si el
 *  almacenamiento está lleno/bloqueado (Safari privado lanza al leer). */
export function leerPreferencia(): PreferenciaDeTema {
  try {
    const v = localStorage.getItem(CLAVE_TEMA);
    return esPreferencia(v) ? v : 'sistema';
  } catch {
    return 'sistema';
  }
}

/** El tema que el sistema operativo pide ahora mismo. */
export function temaDelSistema(): 'claro' | 'oscuro' {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches
    ? 'claro'
    : 'oscuro';
}

/** El tema que toca pintar, resolviendo `sistema`. */
export function temaEfectivo(pref: PreferenciaDeTema = leerPreferencia()): 'claro' | 'oscuro' {
  return pref === 'sistema' ? temaDelSistema() : pref;
}

/** Pone o quita la clase `dark` y sincroniza la barra de estado del móvil. */
export function aplicarTema(tema: 'claro' | 'oscuro'): void {
  document.documentElement.classList.toggle('dark', tema === 'oscuro');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', FONDO_POR_TEMA[tema]);
}

/** Guarda la elección del usuario y la aplica al instante. */
export function guardarPreferencia(pref: PreferenciaDeTema): void {
  try {
    localStorage.setItem(CLAVE_TEMA, pref);
  } catch {
    /* Sin almacenamiento el tema vale para esta sesión y no se recuerda: es
       peor no poder cambiarlo que no poder recordarlo. */
  }
  aplicarTema(temaEfectivo(pref));
}

/**
 * Escucha al sistema mientras la app está abierta.
 *
 * Solo hace algo cuando la preferencia es `sistema`: si el usuario ha fijado
 * claro u oscuro, que el Mac se ponga en oscuro a las ocho de la tarde no
 * debe moverle la app. Devuelve la función para dejar de escuchar.
 */
export function escucharAlSistema(): () => void {
  if (typeof matchMedia !== 'function') return () => {};
  const mq = matchMedia('(prefers-color-scheme: light)');
  const alCambiar = () => {
    if (leerPreferencia() === 'sistema') aplicarTema(temaDelSistema());
  };
  mq.addEventListener('change', alCambiar);
  return () => mq.removeEventListener('change', alCambiar);
}
