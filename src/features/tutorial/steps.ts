import type { NavTab } from '../../App';

/* ═══════════════════════════════════════════════════════════════════════════
   Los 16 pasos del tour (F3.12, módulo 7 del handoff)

   Decisión cerrada con Dani (2026-08-07): el README lista 17 pasos, pero el
   paso 14 (chat) se descarta — el chat no entró en el alcance de Fase 3. Los
   16 que quedan van aquí en el orden final, ya renumerados.

   `targetId` es el id que la pantalla real registra con `useTourTarget`. Los
   pasos sin `targetId` no recortan nada — son el paso 01 (bienvenida, antes
   de que haya nada que enseñar) y el 16 (cierre, ya fuera del recorrido).

   Dos pasos con `targetId` no tienen todavía un objetivo real montado en
   ninguna pantalla: "08 biblioteca" (no existe una Biblioteca de atleta —
   misma decisión de F3.10, la ficha de atleta es F3.13) y "16 isla y
   widgets" (tramo nativo, F3.14). Sus `targetId` apuntan a la superficie más
   cercana que sí existe hoy (la ficha de ejercicio dentro de la sesión, y la
   tarjeta de Perfil respectivamente) — el copy lo explica en vez de fingir
   una pantalla que no está.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface TourStep {
  id: string;
  section: string;   // pastilla mono oro del cartel de pantalla
  tab: NavTab;
  targetId?: string;
  title: string;
  body: string;
  requiresAction?: boolean;
  actionLabel?: string;    // label del primario mientras la acción no se ha hecho
  skippable?: boolean;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'bienvenida', section: 'Bienvenida', tab: 'home',
    title: 'Aquí te dejo tu app',
    body: 'Soy Dani. Esto no es un manual — te voy a enseñar exactamente dónde está cada cosa, con tus datos reales. Dos minutos y ya sabes moverte.',
  },
  {
    id: 'mapa-pestanas', section: 'Navegación', tab: 'home', targetId: 'nav-tabs',
    title: 'Cinco sitios, todo lo demás cuelga de aquí',
    body: 'Hoy, Rutinas, Academia, Nutrición y Perfil. Si no sabes dónde está algo, siempre puedes volver a una de estas cinco.',
  },
  {
    id: 'hoy', section: 'Hoy', tab: 'home', targetId: 'home-primary-card',
    title: 'Esta tarjeta es tu tarea del día',
    body: 'Cada día hay una sola cosa que hacer arriba del todo — el entreno, o el cardio si hoy tocaba descanso. Si no hay nada aquí, es que hoy libras.',
  },
  {
    id: 'marcar-serie', section: 'Sesión', tab: 'training', targetId: 'training-first-set-row',
    title: 'Toca la serie para marcarla',
    body: 'Cada vez que termines una serie, la marcas aquí. Va rellenando la tabla y así sé exactamente qué has hecho sin que tengas que escribirme.',
    requiresAction: true, actionLabel: 'Toca la serie 02',
  },
  {
    id: 'corregir-serie', section: 'Sesión', tab: 'training', targetId: 'training-set-editor',
    title: 'Reps, kilos y RIR — corrige si hace falta',
    body: 'Te traigo puestos los datos de tu última sesión. Si has hecho algo distinto, lo corriges aquí antes de marcarla.',
  },
  {
    id: 'cardio', section: 'Cardio', tab: 'home', targetId: 'home-cardio-row',
    title: 'El cardio nunca compite con la fuerza',
    body: 'Si hoy tienes pesas, el cardio se queda aquí abajo, a la vista pero sin robarte protagonismo. En días de descanso sube a ser lo primero que ves.',
  },
  {
    id: 'rutinas', section: 'Rutinas', tab: 'training', targetId: 'nav-tab-training',
    title: 'Aquí ves toda tu semana',
    body: 'El día de hoy en oro, lo que ya has hecho en verde. Puedes mirar semanas siguientes, aunque son solo lectura — lo que toca hacer siempre está en Hoy.',
  },
  {
    id: 'biblioteca', section: 'Ejercicios', tab: 'training', targetId: 'training-exercise-video',
    title: 'Cada ejercicio lleva su vídeo',
    body: 'Si dudas de la técnica, aquí tienes el vídeo a 0,5× o a velocidad normal. Está siempre a mano dentro de la sesión, no hace falta salir a buscarlo.',
  },
  {
    id: 'intercambios', section: 'Nutrición', tab: 'nutrition', targetId: 'nutrition-tracker',
    title: 'Comes por intercambios, no por gramos a ciegas',
    body: 'Esta barra te dice lo que te queda hoy. Cada intercambio son unos 100 kcal — no hace falta que hagas la cuenta, la barra ya la hace por ti.',
  },
  {
    id: 'registrar-ingesta', section: 'Nutrición', tab: 'nutrition', targetId: 'nutrition-first-meal-row',
    title: 'Toca la comida cuando te la termines',
    body: 'Un toque y queda registrada. La barra se mueve un segundo después, para que veas primero que ha quedado marcada.',
    requiresAction: true, actionLabel: 'Toca una ingesta',
  },
  {
    id: 'intercambiar-alimento', section: 'Nutrición', tab: 'nutrition', targetId: 'nutrition-first-meal-row',
    title: 'Si no tienes un alimento, lo cambias',
    body: 'Mantén pulsada una ingesta para abrir el ajuste, o entra en el detalle para intercambiar un alimento por otro sin perder tus intercambios.',
  },
  {
    id: 'recetas', section: 'Recetas', tab: 'nutrition', targetId: 'nav-tab-nutrition',
    title: 'Las recetas se ajustan a tu presupuesto',
    body: 'Cada receta te dice si cabe en lo que te queda hoy, y puedes escalarla si sois más a comer o si quieres guardar para mañana.',
  },
  {
    id: 'academia', section: 'Academia', tab: 'academy', targetId: 'nav-tab-academy',
    title: 'Aquí te explico el porqué de todo',
    body: 'Entrenamiento, nutrición, fisiología — lecciones cortas para que entiendas lo que estás haciendo, no solo que lo hagas.',
  },
  {
    id: 'fotos-progreso', section: 'Perfil', tab: 'profile', targetId: 'profile-progress-row',
    title: 'Las fotos de progreso son opcionales',
    body: 'Te ayudan a ver cambios que la báscula no cuenta. Si ahora no te apetece, seguimos — puedes subirlas cuando quieras desde aquí.',
    skippable: true,
  },
  {
    id: 'isla-widgets', section: 'Perfil', tab: 'profile', targetId: 'profile-settings-action',
    title: 'Fuera de la app también hay avisos',
    body: 'Cuando actives las notificaciones, verás el descanso entre series y tu cardio incluso con el móvil bloqueado. Te lo pido ahora, en contexto.',
    skippable: true,
  },
  {
    id: 'cierre', section: 'Listo', tab: 'home',
    title: 'Ya sabes moverte',
    body: 'Nada más que añadir — a partir de aquí es entrenar, comer y volver cuando te haga falta un recordatorio. Vamos a por el entreno de hoy.',
  },
];
