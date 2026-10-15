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
  {
    id: '2026-10-recetas-rapidas',
    fecha: '2026-10-13',
    titulo: 'Recetas rápidas, a tu medida',
    puntos: [
      {
        titulo: 'Nueva pestaña «Rápidas»',
        texto:
          '79 platos de supervivencia (arroz, pasta o patata con tomate, bocadillos, legumbre de bote…) con los ' +
          'minutos reales y, los que valen, aptos para llevar en tupper. Filtra por tiempo: hasta 5, 10 o 15 minutos.',
      },
      {
        titulo: 'Dinos cuánto tiempo tienes',
        texto:
          'En Preferencias eliges tu tiempo para cocinar y si quieres recetas rápidas. Tu menú y «Cambiar comida» ' +
          'las ponen antes, y con 15 minutos o menos solo te salen las que de verdad tardan eso.',
      },
    ],
  },
  {
    id: '2026-10-cambios-en-sesion',
    fecha: '2026-10-05',
    titulo: 'Sabes qué cambia en tu sesión',
    puntos: [
      {
        titulo: 'Aviso al empezar',
        texto:
          'Si tu entrenador ha tocado algo respecto a la semana anterior, al abrir la sesión ves «Cambios en esta ' +
          'sesión», y cada ejercicio que cambia lleva la marca «Nuevo».',
      },
    ],
  },
  {
    id: '2026-10-entreno-y-comidas',
    fecha: '2026-10-01',
    titulo: 'Entreno y comidas, más flexibles',
    puntos: [
      {
        titulo: 'Cronómetro de sesión',
        texto:
          'Desde que abres la sesión corre el tiempo, y la duración queda guardada en tu historial. ' +
          'Si no has marcado ninguna serie, se reinicia.',
      },
      {
        titulo: 'Planifica hasta 7 días',
        texto:
          'En Nutrición puedes apuntar los próximos días. Lo que planees no cuenta en tu adherencia hasta que llegue.',
      },
      {
        titulo: 'Lo que sobra o falta pasa a la siguiente comida',
        texto:
          'Si te pasas o te quedas corto en una comida, la siguiente te lo ajusta («tienes 2: quita 0,5»). ' +
          'También puedes arrastrar alimentos de una comida a otra.',
      },
      {
        titulo: 'Día flexible',
        texto:
          'Cuando un día no se reparte por comidas, apuntas lo que vas comiendo con su hora contra el cupo del día entero. ' +
          'Al volver a «por comidas», todo queda en la primera.',
      },
    ],
  },
  {
    id: '2026-09-cuestionarios-viernes',
    fecha: '2026-09-28',
    titulo: 'Cuestionarios en viernes',
    puntos: [
      {
        titulo: 'Un día fijo para tus revisiones',
        texto:
          'Los cuestionarios semanales y quincenales te llegan el viernes y los puedes responder hasta el martes. ' +
          'Si los contestas, cuentan hasta el siguiente.',
      },
    ],
  },
  {
    id: '2026-09-modo-claro',
    fecha: '2026-09-27',
    titulo: 'Modo claro',
    puntos: [
      {
        titulo: 'Elige cómo ver la app',
        texto:
          'En Perfil › Ajustes › Apariencia puedes elegir modo claro, oscuro o que siga a tu móvil. ' +
          'Por defecto sigue al sistema.',
      },
    ],
  },
];
