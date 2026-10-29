/* Etiquetas de las respuestas del alta (OnboardingData). Vivían dentro de
   ClientFichaPanel; ahora también las pintan los desplegables del creador de
   mesociclos y del editor de dietas (RespuestasDelAlta), y tienen que decir lo
   mismo en los tres sitios.

   ALCANCE y LIFESTYLE_AREA son espejo de las listas del alta
   (AthleteOnboardingWizard). Se guardan los ids y no las etiquetas para poder
   reescribir los textos sin tocar lo ya guardado; el precio es esta tabla, que
   hay que mantener a la par. */

export const ALCANCE_LABELS: Record<string, string> = {
  solo_fisico: 'Solo quiere el resultado físico — no quiere que le toquen los hábitos',
  abierto:     'Abierto a cambiar cosas si se le explica el porqué',
  cambio_vida: 'Quiere cambiar de hábitos, no solo de cuerpo',
};

export const LIFESTYLE_AREA_LABELS: Record<string, string> = {
  verdura_fruta:    'Más verdura y fruta',
  legumbres_fibra:  'Legumbres y fibra',
  mas_vegetal:      'Más vegetal',
  menos_procesados: 'Menos ultraprocesados',
  alcohol:          'Menos alcohol',
  tabaco:           'Dejar de fumar',
  sueno:            'Dormir mejor',
  estres:           'Relajación / estrés',
  mas_pasos:        'Moverse más',
};

export const DIET_LABELS: Record<string, string> = {
  omnivoro: 'Omnívoro', vegetariano: 'Vegetariano', vegano: 'Vegano', otro: 'Otro',
};
export const EXP_LABELS: Record<string, string> = {
  principiante: 'Principiante', intermedio: 'Intermedio', avanzado: 'Avanzado',
};
export const ACTIVITY_LABELS: Record<string, string> = {
  sedentario: 'Sedentario (×1.2)', poco_activo: 'Poco activo (×1.375)',
  activo: 'Activo (×1.55)', muy_activo: 'Muy activo (×1.725)',
};
export const GOAL_BODY_LABELS: Record<string, string> = {
  aumentar_musculo: 'Aumentar músculo (+10%)',
  reducir_grasa:    'Reducir grasa (−20%)',
  mantener:         'Mantener (0%)',
};
export const GOAL_CAP_LABELS: Record<string, string> = {
  fuerza: 'Fuerza', fuerza_resistencia: 'Fuerza-resistencia', salud: 'Salud',
};
export const PROGRESS_FREQ_LABELS: Record<string, string> = {
  cada_semana: 'Cada semana', cada_varias_semanas: 'Cada varias semanas', con_dificultad: 'Con dificultad',
};
export const TECHNIQUE_LABELS: Record<string, string> = {
  mala: 'Mala', regular: 'Regular', buena: 'Buena', muy_buena: 'Muy buena',
};
