/* ═══════════════════════════════════════════════════════════════════════════
   Novedades para el atleta

   Lo que se le cuenta en la ventana «Qué hay de nuevo» de Inicio y en Perfil ›
   Ajustes › Novedades. SOLO cosas que el atleta ve o nota: un cambio interno,
   o algo que solo cambia el coach, no va aquí.

   Cómo añadir una: pon la nueva ARRIBA del todo (la primera es la más
   reciente) con un `id` que no se haya usado. El atleta que ya cerró la
   anterior verá la ventana de nuevo, solo con lo que no ha visto. A quien se
   da de alta DESPUÉS de la fecha de una novedad no se le enseña: la app ya le
   llegó con ella.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface Novedad {
  /** Estable y único. No se reutiliza ni se cambia. */
  id: string;
  /** YYYY-MM-DD: el día en que llega a los atletas. */
  fecha: string;
  titulo: string;
  puntos: { titulo: string; texto: string }[];
}

export const NOVEDADES: Novedad[] = [
  {
    id: '2026-10-pasos-objetivo',
    fecha: '2026-10-15',
    titulo: 'Tus pasos, más claros',
    puntos: [
      {
        titulo: 'Tu objetivo, siempre a la vista',
        texto:
          'La tarjeta de pasos de Inicio ya enseña el objetivo del día aunque todavía no tengas pasos apuntados. ' +
          'Si no los sincronizas con Salud, tócala y apunta los de hoy a mano.',
      },
    ],
  },
];
