/* ═══════════════════════════════════════════════════════════════════════════
   COLORES QUE VIVEN EN LA BASE DE DATOS

   El color de una fase del roadmap y el de un logro no son clases de Tailwind:
   son un campo `color` guardado en Firestore el día que se creó la fase, y se
   pintan con `style={{ color }}`. Eso los deja fuera del sistema de temas —un
   `#00eefc` escrito en un documento de 2026 sigue siendo cian neón cuando la
   app se abre en claro, y sobre papel da 1,5:1.

   Dos piezas para arreglarlo sin migrar datos:

   · `colorDeTema` traduce los cuatro hex heredados al token equivalente. Los
     documentos ya guardados siguen intactos y aun así cambian de tema al
     pintarse. Las fases nuevas guardan directamente el `var(...)` (ver
     data/phasePresets.ts), y entonces esta función los deja pasar tal cual.

   · `conAlfa` sustituye al truco de concatenar dos dígitos hex al final
     (`${color}1a`). Ese truco es lo que impedía usar variables CSS aquí:
     `var(--color-data)1a` no es un color, y el navegador tira la declaración
     entera sin un aviso en consola. `color-mix()` hace lo mismo y funciona con
     cualquier forma de color.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Los cuatro valores que `phasePresets` escribió en la base antes de que
 *  existiera el modo claro, y su token equivalente. Las claves van en
 *  minúsculas: un documento viejo puede traer `#00EEFC`. */
const HEREDADOS: Record<string, string> = {
  '#00eefc': 'var(--color-data)',        // adaptación, mini-cut
  '#fbcb1a': 'var(--color-accent-ink)',  // pérdida de grasa, ganancia II
  '#a78bfa': 'var(--color-chart-3)',     // recomposición
  '#ff8c69': 'var(--color-refeed)',      // ganancia de masa muscular
};

/**
 * El color con el que pintar algo que venía guardado.
 *
 * Devuelve el token si el valor es uno de los hex heredados, y el valor tal
 * cual en cualquier otro caso —un color que el coach eligiera a mano se
 * respeta, no se corrige.
 */
export function colorDeTema(valor: string | undefined | null): string {
  if (!valor) return 'var(--color-ink-3)';
  return HEREDADOS[valor.trim().toLowerCase()] ?? valor;
}

/**
 * El mismo color con opacidad, para fondos y bordes tenues.
 *
 * `porcentaje` es cuánto queda del color (14 = el antiguo sufijo `24`, 10 = `1a`).
 */
export function conAlfa(color: string, porcentaje: number): string {
  return `color-mix(in oklab, ${colorDeTema(color)} ${porcentaje}%, transparent)`;
}
