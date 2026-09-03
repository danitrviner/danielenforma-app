import React, { useState, useEffect, useRef } from 'react';
import {
  UserProfile, OnboardingData, ExperienceLevel,
  ActivityLevel, DietType, OnboardingMeal, SupplementEntry, SleepRoutineOrScreen,
  MUSCLE_LABELS, MUSCLE_ORDER, type MuscleGroup,
} from '../types';
import { DISH_TYPES } from '../utils/dishTypes';
import { computeAuto } from '../utils/energyCalc';
import { mensajeDeErrorFirestore } from '../utils/erroresFirestore';
import { saveOnboarding, getAthleteNutritionConfig, saveAthleteNutritionConfig } from '../dbService';
import { consentimientoIADesdeLegal } from '../legal/aceptacion';
import { guardarBorradorAlta, cargarBorradorAlta, borrarBorradorAlta } from '../utils/borradorAlta';
import { Icon, Button, Input } from './ui';
import FoodPreferencesPanel from './FoodPreferencesPanel';
import VegetableSelector from './VegetableSelector';

// Primera experiencia del atleta: wizard a pantalla completa, paso a paso, que
// bloquea la app hasta completarse (gating en App.tsx). Recoge lo esencial del
// onboarding — el coach completa/ajusta el resto desde su formulario largo.
// Hueco previsto para vídeo de bienvenida: ver VIDEO_SLOT más abajo.

interface Props {
  profile: UserProfile;
  onComplete: () => void;
}

/* Las descripciones no son adorno. Este cuestionario lo rellena alguien solo,
   en su móvil, sin nadie al lado a quien preguntar «¿yo qué soy, activo o poco
   activo?». Cada opción lleva ejemplos concretos —trabajos, pasos al día,
   comidas— porque una etiqueta suelta se contesta a ojo, y a ojo la mitad
   elige mal. Lo que se elija aquí decide las calorías del plan. */

const EXPERIENCE: { id: ExperienceLevel; label: string; desc: string }[] = [
  { id: 'principiante', label: 'Principiante',
    desc: 'Nunca has entrenado en serio, o llevas menos de un año. Aquí empieza casi todo el mundo, no pasa nada.' },
  { id: 'intermedio', label: 'Intermedio',
    desc: 'Entre 1 y 3 años entrenando con constancia. Te manejas en un gimnasio y conoces los ejercicios básicos.' },
  { id: 'avanzado', label: 'Avanzado',
    desc: 'Más de 3 años entrenando en serio y sin parones largos. Sabes lo que son las series, las repeticiones y progresar.' },
];

const DIET_TYPES: { id: DietType; icon: string; label: string; desc: string }[] = [
  { id: 'omnivoro', icon: 'restaurant', label: 'Como de todo',
    desc: 'Carne, pescado, huevos, lácteos… sin nada excluido por norma.' },
  { id: 'vegetariano', icon: 'eco', label: 'Vegetariano',
    desc: 'Sin carne ni pescado, pero sí huevos y/o lácteos.' },
  { id: 'vegano', icon: 'psychiatry', label: 'Vegano',
    desc: 'Nada de origen animal: ni carne, ni pescado, ni huevos, ni lácteos, ni miel.' },
  { id: 'otro', icon: 'help', label: 'Otro',
    desc: 'Otra pauta (sin gluten, sin lactosa, por religión…). Cuéntasela a tu coach en el último paso.' },
];

const ACTIVITY: { id: ActivityLevel; label: string; desc: string }[] = [
  { id: 'sedentario', label: 'Sedentario',
    desc: 'Trabajo sentado y poco más: coche, oficina, sofá. Menos de 5.000 pasos al día.' },
  { id: 'poco_activo', label: 'Poco activo',
    desc: 'Sentado casi todo el día, pero andas algo: recados, el perro, ir andando a sitios. Entre 5.000 y 8.000 pasos.' },
  { id: 'activo', label: 'Activo',
    desc: 'De pie o andando gran parte del día: dependiente, camarero, profesor, enfermero. Entre 8.000 y 12.000 pasos.' },
  { id: 'muy_activo', label: 'Muy activo',
    desc: 'Trabajo físico de verdad —obra, mudanzas, reparto— o mucho deporte además del gimnasio. Más de 12.000 pasos.' },
];

/** Etiquetas de las escalas del 1 al 5. Un número suelto no dice nada: «3 de 5»
 *  en variedad significa cosas distintas para cada persona. */
const NIVEL_COCINA = [
  'Sé hervir agua y poco más',
  'Me defiendo con lo básico: plancha, horno, arroz',
  'Cocino a diario sin complicarme',
  'Se me da bien y disfruto cocinando',
  'Me manejo con cualquier receta',
];

const NIVEL_VARIEDAD = [
  'Siempre lo mismo, y me va bien así',
  'Casi siempre lo mismo, con algún cambio',
  'Un término medio',
  'Bastante variedad',
  'Cada día algo distinto',
];

/* Hasta dónde quiere llegar. No es una pregunta de motivación ni un test de
   compromiso: es pedir permiso. Un coach que empuja a alguien hacia legumbres,
   verdura y rutinas de sueño sin que le hayan dado pie se convierte en el pesado
   al que se deja de contestar; y al revés, alguien que SÍ quería cambiar de vida
   y solo recibe una tabla de macros se queda a medias. */
const ALCANCE: { id: string; label: string; desc: string }[] = [
  { id: 'solo_fisico', label: 'Solo el resultado',
    desc: 'Dime qué comer y qué entrenar y lo hago, pero no me cambies la vida. Es una respuesta perfectamente válida.' },
  { id: 'abierto', label: 'Abierto a cambiar cosas',
    desc: 'Si me explicas por qué algo me viene bien, lo pruebo. Sin agobios ni prohibiciones.' },
  { id: 'cambio_vida', label: 'Quiero cambiar de hábitos',
    desc: 'No busco solo verme mejor: quiero comer, dormir y vivir mejor, aunque cueste más al principio.' },
];

/* Lo que el coach PUEDE trabajar contigo, dicho en voz alta. La mayoría de la
   gente no sabe que esto entra en el servicio. */
const LIFESTYLE_AREAS: { id: string; label: string; desc: string }[] = [
  { id: 'verdura_fruta', label: 'Comer más verdura y fruta',
    desc: 'Sin volverte loco: subir poco a poco lo que ya comes.' },
  { id: 'legumbres_fibra', label: 'Meter legumbres y más fibra',
    desc: 'Lentejas, garbanzos, avena, integrales. Es lo que más cambia tu digestión y tu saciedad.' },
  { id: 'mas_vegetal', label: 'Acercarme a una alimentación más vegetal',
    desc: 'Sin dejar la carne del todo si no quieres: solo que pese menos en el plato.' },
  { id: 'menos_procesados', label: 'Reducir ultraprocesados',
    desc: 'Bollería, precocinados, refrescos. Sin listas de prohibidos.' },
  { id: 'alcohol', label: 'Beber menos alcohol', desc: 'Aunque sea solo los findes.' },
  { id: 'tabaco', label: 'Dejar de fumar', desc: 'Si te lo estás planteando, tu coach te acompaña.' },
  { id: 'sueno', label: 'Dormir mejor',
    desc: 'Horarios, rutina de antes de dormir, luz y pantallas. Se trabaja igual que un entrenamiento.' },
  { id: 'estres', label: 'Aprender a relajarme',
    desc: 'Respiración, paseos, desconectar. Si vives acelerado, el plan solo no basta.' },
  { id: 'mas_pasos', label: 'Moverme más en el día a día',
    desc: 'Andar, escaleras, levantarte del sitio. Fuera del gimnasio.' },
];

const RUTINA_PANTALLA: { id: SleepRoutineOrScreen; label: string; desc: string }[] = [
  { id: 'rutina', label: 'Una rutina',
    desc: 'Leo, me ducho, estiro, bajo luces… algo que me prepara para dormir.' },
  { id: 'pantalla', label: 'Pantalla',
    desc: 'Móvil, tele o portátil hasta que me duermo.' },
];

// Mismos presets que el cuestionario largo del coach (OnboardingForm), pero
// duplicados a propósito: el wizard es un subconjunto deliberadamente aparte,
// no comparte estado con el formulario del coach.
const MEAL_PRESETS: Record<3 | 4 | 5, OnboardingMeal[]> = {
  3: [
    { intakeType: 1, name: 'Desayuno', needsTupper: false },
    { intakeType: 3, name: 'Comida', needsTupper: false },
    { intakeType: 5, name: 'Cena', needsTupper: false },
  ],
  4: [
    { intakeType: 1, name: 'Desayuno', needsTupper: false },
    { intakeType: 2, name: 'Media mañana', needsTupper: false },
    { intakeType: 3, name: 'Comida', needsTupper: false },
    { intakeType: 5, name: 'Cena', needsTupper: false },
  ],
  5: [
    { intakeType: 1, name: 'Desayuno', needsTupper: false },
    { intakeType: 2, name: 'Media mañana', needsTupper: false },
    { intakeType: 3, name: 'Comida', needsTupper: false },
    { intakeType: 4, name: 'Merienda', needsTupper: false },
    { intakeType: 5, name: 'Cena', needsTupper: false },
  ],
};

/* Mismas opciones que el cuestionario largo del coach (OnboardingForm), más
   «Duermo bien»: allí es una lista de causas que se deja vacía sin más, pero
   aquí el paso hay que contestarlo, y «no tengo déficit» es una respuesta
   legítima que la lista original no permitía dar. */
const CAUSAS_SUENO = [
  'Te cuesta dormir', 'Estrés', 'Pensamientos', 'Ansiedad', 'Duermes pero no descansas',
];
const DUERMO_BIEN = 'Duermo bien';

const INTAKE_ICONS: Record<number, string> = {
  1: 'free_breakfast', 2: 'coffee', 3: 'restaurant', 4: 'bakery_dining', 5: 'dinner_dining',
};

// Chip seleccionable reutilizado en todos los pasos.
interface ChipProps {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  big?: boolean;
  key?: React.Key; // convención del proyecto: los tipos de React aquí no fusionan IntrinsicAttributes
}

function Chip({ selected, onClick, children, big = false }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${big ? 'p-4 rounded-control text-left w-full' : 'px-4 py-3 rounded-control'} border font-sans text-body-s transition-all active:scale-95 ${
        selected
          ? 'bg-accent/15 border-accent text-white'
          : 'bg-surface border-hairline text-ink-2 hover:border-strong'
      }`}
    >
      {children}
    </button>
  );
}

function StepShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-6 animate-[fadeSlideIn_.35s_ease]">
      <div>
        <h2 className="font-sans font-bold text-title-l text-white tracking-tight">{title}</h2>
        {subtitle && <p className="text-body-s text-ink-2 mt-1">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

// text-title-s (16px), no text-body-s (13px): por debajo de 16px WKWebView
// amplía la página sola al enfocar el campo y no la devuelve al desenfocar
// (ver index.html y el suelo de 16px en src/index.css).
const inputCls = 'w-full bg-surface border border-hairline focus:border-accent/60 rounded-surface px-4 py-3 text-title-s text-white placeholder-ink-2/40 outline-none transition-colors';

/** 05-4. Lo que se guarda entre sesión y sesión. Es exactamente el estado del
 *  wizard: si mañana se añade un paso, el campo nuevo entra aquí y en el efecto
 *  de autoguardado, y nada más. */
interface BorradorCampos {
  step: number;
  sex: 'male' | 'female' | '';
  birthDate: string;
  weightKg: string;
  heightCm: string;
  occupation: string;
  referralSource: string;
  goalFreeText: string;
  goalTimelineMotivation: string;
  coachExpectations: string;
  experienceLevel: ExperienceLevel | '';
  equipment: string[];
  injuries: string;
  noInjuries: boolean;
  hadPastInjuries: boolean | null;
  pastInjuriesDetail: string;
  takesMedication: boolean | null;
  medicationDetail: string;
  recentSurgery: boolean | null;
  recentSurgeryDetail: string;
  dietType: DietType | '';
  mealCount: number | null;
  menuVariety: number | null;
  batchCookingPreferred: boolean | null;
  allergies: string;
  meals: OnboardingMeal[];
  cookingLevel: number | null;
  cookingMaxTime: number | null;
  prefLiked: string[];
  prefDisliked: string[];
  sinPreferencias: boolean;
  lifestyleScope: string;
  lifestyleAreas: string[];
  availableDaysPerWeek: number | null;
  sessionMaxMinutes: number | null;
  muscleGroupsToImprove: string[];
  sinPreferenciaMuscular: boolean;
  hatedExercises: string;
  appetitePeakTime: string;
  dietSince: string;
  hadOverweightHistory: boolean | null;
  foodRelationshipGood: boolean | null;
  foodRelationshipReason: string;
  eatsTooFast: boolean | null;
  weightTendency: string;
  tomaSuplementos: boolean | null;
  supplements: SupplementEntry[];
  breakfastVariety: number | null;
  lunchVariety: number | null;
  preferredDishTypes: string[];
  excludedDishTypes: string[];
  sleepDeficitCauses: string[];
  sleepRoutineOrScreen: SleepRoutineOrScreen | '';
  sleepMedication: boolean | null;
  sleepMedicationDetail: string;
  sittingHoursPerDay: string;
  stressReason: string;
  restDayActive: boolean | null;
  restDayActiveDetail: string;
  neckCm: string;
  waistCm: string;
  hipCm: string;
  sinCinta: boolean;
  vegTypes: string[];
  sinVerduras: boolean;
  activityLevel: ActivityLevel | '';
}

export default function AthleteOnboardingWizard({ profile, onComplete }: Props) {
  // 05-4. El alta ya no empieza en blanco si quedó a medias. Se lee UNA vez, en
  // el inicializador perezoso de un `useState`, y no en un efecto: leerlo
  // después obligaría a pisar 18 campos en un segundo render, con el riesgo de
  // borrar lo que el atleta hubiera empezado a escribir mientras tanto.
  const [borrador] = useState(() => cargarBorradorAlta<BorradorCampos>(profile.email));

  const [step, setStep] = useState(borrador?.step ?? 0);
  /** 14-08. El único contenedor con scroll de verdad (ver el `overflow-y-auto`
   *  de abajo). Sin resetearlo al cambiar de paso, si el atleta bajaba en un
   *  paso largo (p. ej. Alimentación) y pulsaba «Siguiente», aterrizaba a
   *  media altura del paso nuevo — el título y la barra de progreso quedaban
   *  fuera de vista y la pantalla parecía clavada/rota. */
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    contentRef.current?.scrollTo(0, 0);
  }, [step]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  /** Puerta de un solo sentido: una vez la ficha está en Firestore, este
   *  componente no vuelve a escribir borrador nunca. Hace falta porque el
   *  `finally` de `finish` devuelve `saving` a false DESPUÉS de `onComplete()`,
   *  y si el wizard sigue montado un instante más, el efecto de autoguardado
   *  volvería a crear el borrador que se acaba de borrar. */
  const [enviado, setEnviado] = useState(false);

  // ── Respuestas ──────────────────────────────────────────────────────────────
  const [sex, setSex] = useState<'male' | 'female' | ''>(borrador?.sex ?? '');
  const [birthDate, setBirthDate] = useState(borrador?.birthDate ?? '');
  const [weightKg, setWeightKg] = useState(borrador?.weightKg ?? '');
  const [heightCm, setHeightCm] = useState(borrador?.heightCm ?? '');
  const [occupation, setOccupation] = useState(borrador?.occupation ?? '');
  const [referralSource, setReferralSource] = useState(borrador?.referralSource ?? '');
  const [goalFreeText, setGoalFreeText] = useState(borrador?.goalFreeText ?? '');
  const [goalTimelineMotivation, setGoalTimelineMotivation] = useState(borrador?.goalTimelineMotivation ?? '');
  const [coachExpectations, setCoachExpectations] = useState(borrador?.coachExpectations ?? '');
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel | ''>(borrador?.experienceLevel ?? '');
  const [equipment, setEquipment] = useState<string[]>(borrador?.equipment ?? []);
  const [injuries, setInjuries] = useState(borrador?.injuries ?? '');
  const [noInjuries, setNoInjuries] = useState(borrador?.noInjuries ?? false);
  // `null` y no `false`: con `false` de partida el chip «No» salía ya
  // seleccionado y la pantalla parecía contestada sin que nadie la tocara —
  // era una de las que «no se ven». Ahora nada está elegido hasta que se elige.
  const [hadPastInjuries, setHadPastInjuries] = useState<boolean | null>(borrador?.hadPastInjuries ?? null);
  const [pastInjuriesDetail, setPastInjuriesDetail] = useState(borrador?.pastInjuriesDetail ?? '');
  const [takesMedication, setTakesMedication] = useState<boolean | null>(borrador?.takesMedication ?? null);
  const [medicationDetail, setMedicationDetail] = useState(borrador?.medicationDetail ?? '');
  const [recentSurgery, setRecentSurgery] = useState<boolean | null>(borrador?.recentSurgery ?? null);
  const [recentSurgeryDetail, setRecentSurgeryDetail] = useState(borrador?.recentSurgeryDetail ?? '');
  const [dietType, setDietType] = useState<DietType | ''>(borrador?.dietType ?? '');
  const [mealCount, setMealCount] = useState<number | null>(borrador?.mealCount ?? null);
  const [menuVariety, setMenuVariety] = useState<number | null>(borrador?.menuVariety ?? null);
  const [batchCookingPreferred, setBatchCookingPreferred] = useState<boolean | null>(borrador?.batchCookingPreferred ?? null);
  const [allergies, setAllergies] = useState(borrador?.allergies ?? '');
  const [meals, setMeals] = useState<OnboardingMeal[]>(borrador?.meals ?? []);
  const [cookingLevel, setCookingLevel] = useState<number | null>(borrador?.cookingLevel ?? null);
  const [cookingMaxTime, setCookingMaxTime] = useState<number | null>(borrador?.cookingMaxTime ?? null);
  const [prefLiked, setPrefLiked] = useState<string[]>(borrador?.prefLiked ?? []);
  const [prefDisliked, setPrefDisliked] = useState<string[]>(borrador?.prefDisliked ?? []);
  // Salida honrada para las dos pantallas de catálogo: ahora hay que contestarlas,
  // y sin esto quien de verdad no tenga preferencias se quedaría encerrado.
  const [sinPreferencias, setSinPreferencias] = useState(borrador?.sinPreferencias ?? false);
  // 03-09. Bloques que hasta ahora solo existían en el cuestionario largo del
  // coach: el atleta no los veía nunca y llegaban a la ficha en blanco.
  const [availableDaysPerWeek, setAvailableDaysPerWeek] = useState<number | null>(borrador?.availableDaysPerWeek ?? null);
  const [sessionMaxMinutes, setSessionMaxMinutes] = useState<number | null>(borrador?.sessionMaxMinutes ?? null);
  const [lifestyleScope, setLifestyleScope] = useState(borrador?.lifestyleScope ?? '');
  const [lifestyleAreas, setLifestyleAreas] = useState<string[]>(borrador?.lifestyleAreas ?? []);
  const [muscleGroupsToImprove, setMuscleGroupsToImprove] = useState<string[]>(borrador?.muscleGroupsToImprove ?? []);
  const [sinPreferenciaMuscular, setSinPreferenciaMuscular] = useState(borrador?.sinPreferenciaMuscular ?? false);
  const [hatedExercises, setHatedExercises] = useState(borrador?.hatedExercises ?? '');
  const [appetitePeakTime, setAppetitePeakTime] = useState(borrador?.appetitePeakTime ?? '');
  const [dietSince, setDietSince] = useState(borrador?.dietSince ?? '');
  const [hadOverweightHistory, setHadOverweightHistory] = useState<boolean | null>(borrador?.hadOverweightHistory ?? null);
  const [foodRelationshipGood, setFoodRelationshipGood] = useState<boolean | null>(borrador?.foodRelationshipGood ?? null);
  const [foodRelationshipReason, setFoodRelationshipReason] = useState(borrador?.foodRelationshipReason ?? '');
  const [eatsTooFast, setEatsTooFast] = useState<boolean | null>(borrador?.eatsTooFast ?? null);
  const [weightTendency, setWeightTendency] = useState(borrador?.weightTendency ?? '');
  const [tomaSuplementos, setTomaSuplementos] = useState<boolean | null>(borrador?.tomaSuplementos ?? null);
  const [supplements, setSupplements] = useState<SupplementEntry[]>(borrador?.supplements ?? []);
  const [breakfastVariety, setBreakfastVariety] = useState<number | null>(borrador?.breakfastVariety ?? null);
  const [lunchVariety, setLunchVariety] = useState<number | null>(borrador?.lunchVariety ?? null);
  const [preferredDishTypes, setPreferredDishTypes] = useState<string[]>(borrador?.preferredDishTypes ?? []);
  const [excludedDishTypes, setExcludedDishTypes] = useState<string[]>(borrador?.excludedDishTypes ?? []);
  const [sleepDeficitCauses, setSleepDeficitCauses] = useState<string[]>(borrador?.sleepDeficitCauses ?? []);
  const [sleepRoutineOrScreen, setSleepRoutineOrScreen] = useState<SleepRoutineOrScreen | ''>(borrador?.sleepRoutineOrScreen ?? '');
  const [sleepMedication, setSleepMedication] = useState<boolean | null>(borrador?.sleepMedication ?? null);
  const [sleepMedicationDetail, setSleepMedicationDetail] = useState(borrador?.sleepMedicationDetail ?? '');
  const [sittingHoursPerDay, setSittingHoursPerDay] = useState(borrador?.sittingHoursPerDay ?? '');
  const [stressReason, setStressReason] = useState(borrador?.stressReason ?? '');
  const [restDayActive, setRestDayActive] = useState<boolean | null>(borrador?.restDayActive ?? null);
  const [restDayActiveDetail, setRestDayActiveDetail] = useState(borrador?.restDayActiveDetail ?? '');
  const [neckCm, setNeckCm] = useState(borrador?.neckCm ?? '');
  const [waistCm, setWaistCm] = useState(borrador?.waistCm ?? '');
  const [hipCm, setHipCm] = useState(borrador?.hipCm ?? '');
  const [sinCinta, setSinCinta] = useState(borrador?.sinCinta ?? false);
  const [vegTypes, setVegTypes] = useState<string[]>(borrador?.vegTypes ?? []);
  const [sinVerduras, setSinVerduras] = useState(borrador?.sinVerduras ?? false);
  const [activityLevel, setActivityLevel] = useState<ActivityLevel | ''>(borrador?.activityLevel ?? '');

  // Las ingestas dependen de cuántas se hayan elegido en el paso de
  // Alimentación: si `mealCount` cambia, se regenera el preset (Desayuno,
  // Comida, Cena…), conservando los tupper ya marcados cuando el número de
  // ingestas no cambia realmente (p.ej. al volver «Atrás» y «Siguiente»).
  useEffect(() => {
    if (mealCount !== 3 && mealCount !== 4 && mealCount !== 5) return;
    setMeals(prev => {
      const preset = MEAL_PRESETS[mealCount];
      const yaCoincide = prev.length === preset.length && prev.every((m, i) => m.intakeType === preset[i].intakeType);
      return yaCoincide ? prev : preset.map(m => ({ ...m }));
    });
  }, [mealCount]);

  // 05-4. Autoguardado: cada respuesta y cada cambio de paso persisten al
  // instante. No se guarda mientras se está enviando, para que un `finish` en
  // vuelo no reescriba el borrador que está a punto de borrarse.
  useEffect(() => {
    if (saving || enviado) return;
    guardarBorradorAlta<BorradorCampos>(profile.email, {
      step, sex, birthDate, weightKg, heightCm, occupation, referralSource,
      goalFreeText, goalTimelineMotivation, coachExpectations,
      experienceLevel, equipment, injuries, noInjuries,
      hadPastInjuries, pastInjuriesDetail, takesMedication, medicationDetail,
      recentSurgery, recentSurgeryDetail,
      dietType, mealCount, menuVariety, batchCookingPreferred, allergies,
      meals, cookingLevel, cookingMaxTime, prefLiked, prefDisliked, sinPreferencias,
      availableDaysPerWeek, sessionMaxMinutes,
      lifestyleScope, lifestyleAreas, muscleGroupsToImprove, sinPreferenciaMuscular, hatedExercises,
      appetitePeakTime, dietSince, hadOverweightHistory, foodRelationshipGood,
      foodRelationshipReason, eatsTooFast, weightTendency, tomaSuplementos, supplements,
      breakfastVariety, lunchVariety, preferredDishTypes, excludedDishTypes,
      sleepDeficitCauses, sleepRoutineOrScreen, sleepMedication, sleepMedicationDetail,
      sittingHoursPerDay, stressReason, restDayActive, restDayActiveDetail,
      neckCm, waistCm, hipCm, sinCinta,
      vegTypes, sinVerduras,
      activityLevel,
    });
  }, [saving, enviado, profile.email, step, sex, birthDate, weightKg, heightCm, occupation, referralSource,
      goalFreeText, goalTimelineMotivation, coachExpectations, experienceLevel, equipment, injuries, noInjuries,
      hadPastInjuries, pastInjuriesDetail, takesMedication, medicationDetail, recentSurgery, recentSurgeryDetail,
      dietType, mealCount, menuVariety, batchCookingPreferred, allergies,
      meals, cookingLevel, cookingMaxTime, prefLiked, prefDisliked, sinPreferencias,
      availableDaysPerWeek, sessionMaxMinutes,
      lifestyleScope, lifestyleAreas, muscleGroupsToImprove, sinPreferenciaMuscular, hatedExercises,
      appetitePeakTime, dietSince, hadOverweightHistory, foodRelationshipGood,
      foodRelationshipReason, eatsTooFast, weightTendency, tomaSuplementos, supplements,
      breakfastVariety, lunchVariety, preferredDishTypes, excludedDishTypes,
      sleepDeficitCauses, sleepRoutineOrScreen, sleepMedication, sleepMedicationDetail,
      sittingHoursPerDay, stressReason, restDayActive, restDayActiveDetail,
      neckCm, waistCm, hipCm, sinCinta,
      vegTypes, sinVerduras, activityLevel]);

  const firstName = (profile.displayName || 'atleta').split(' ')[0];

  /* Validación por paso. Hasta ahora solo cuatro pasos exigían respuesta y el
     resto era opcional «a propósito» — pero un paso que se puede pasar de
     largo con un toque en Siguiente es, en la práctica, un paso que la mitad
     de la gente no contesta: es el «hay pantallas que no ven» del informe.
     Ahora se contesta todo. Las dos pantallas de catálogo (preferencias y
     verduras) llevan su propia casilla de «ninguna en particular», porque
     exigir una respuesta no es lo mismo que exigir una preferencia. */
  const textoRelleno = (v: string) => v.trim().length >= 3;
  const contestadoConDetalle = (respuesta: boolean | null, detalle: string) =>
    respuesta === false || (respuesta === true && detalle.trim().length > 0);

  const stepValid = (): boolean => {
    switch (step) {
      // 1 Sobre ti
      case 1: return !!sex && !!birthDate && Number(weightKg) >= 30 && Number(heightCm) >= 100;
      // 2 Medidas — con salida para quien no tenga cinta métrica
      case 2: return sinCinta || (Number(neckCm) > 0 && Number(waistCm) > 0 && Number(hipCm) > 0);
      // 3 Vida fuera del gimnasio
      case 3: return textoRelleno(occupation) && textoRelleno(referralSource);
      // 4 Objetivo
      case 4: return textoRelleno(goalTimelineMotivation) && textoRelleno(goalFreeText);
      // 5 Salud — las cuatro preguntas, ahora en una sola pantalla
      // 5 Hasta dónde quiere llegar. Las áreas concretas no se exigen: quien
      // elige «solo el resultado» está contestando con eso.
      case 5: return !!lifestyleScope;
      case 6: return (noInjuries || injuries.trim().length > 0)
        && contestadoConDetalle(hadPastInjuries, pastInjuriesDetail)
        && contestadoConDetalle(takesMedication, medicationDetail)
        && contestadoConDetalle(recentSurgery, recentSurgeryDetail);
      // 6 Experiencia
      case 7: return !!experienceLevel && availableDaysPerWeek != null && sessionMaxMinutes != null;
      // 8 Músculos. «Todo por igual» se marca dejándolo vacío no: se exige al
      // menos uno, y hay chip de «me da igual, reparte tú».
      case 8: return sinPreferenciaMuscular || muscleGroupsToImprove.length > 0;
      // 7 Día a día
      case 9: return !!activityLevel
        && sittingHoursPerDay !== '' && Number(sittingHoursPerDay) >= 0 && Number(sittingHoursPerDay) <= 24
        && contestadoConDetalle(restDayActive, restDayActiveDetail);
      // 8 Descanso y estrés
      case 10: return sleepDeficitCauses.length > 0
        && !!sleepRoutineOrScreen
        && contestadoConDetalle(sleepMedication, sleepMedicationDetail)
        && textoRelleno(stressReason);
      // 9 Alimentación. «¿Desde cuándo?» solo se exige a quien come vegano o
      // vegetariano, igual que en el formulario del coach.
      case 11: return !!dietType && mealCount != null && (!esDietaVegetal || textoRelleno(dietSince));
      // 11 Relación con la comida
      case 13: return textoRelleno(appetitePeakTime)
        && hadOverweightHistory != null
        && contestadoConDetalle(foodRelationshipGood === null ? null : !foodRelationshipGood, foodRelationshipReason)
        && eatsTooFast != null
        && textoRelleno(weightTendency)
        && contestadoConDetalle(tomaSuplementos, supplements.map(x => x.name).join(''));
      // 12 Gustos por grupos
      case 14: return sinPreferencias || prefLiked.length > 0 || prefDisliked.length > 0;
      // 13 Verduras
      case 15: return sinVerduras || vegTypes.length > 0;
      // 14 Menú — los tipos de plato son opcionales a propósito
      case 16: return menuVariety != null && breakfastVariety != null && lunchVariety != null;
      // 15 Cocina
      case 17: return cookingLevel != null && cookingMaxTime != null && batchCookingPreferred != null;
      // 17 Qué espera de su coach
      case 19: return textoRelleno(coachExpectations);
      // 0 bienvenida, 10 tupper y 16 resumen no piden nada.
      default: return true;
    }
  };

  const esDietaVegetal = dietType === 'vegano' || dietType === 'vegetariano';
  const alternar = (lista: string[], id: string) =>
    lista.includes(id) ? lista.filter(x => x !== id) : [...lista, id];

  /* Orden por bloques, no por el capricho de en qué orden se fueron añadiendo
     las preguntas (03-09):
       Quién eres      0 bienvenida · 1 sobre ti · 2 medidas · 3 vida fuera del
                       gimnasio · 4 objetivo
       Tu salud        5 salud (actual y pasada, junto: estaban en dos pantallas)
       Cómo te mueves  6 experiencia · 7 día a día (actividad + horas sentado +
                       días libres, que estaban repartidos) · 8 descanso y estrés
       Cómo comes      9 alimentación · 10 comidas/tupper · 11 relación con la
                       comida · 12 gustos por grupos · 13 verduras · 14 menú
                       (las tres escalas de variedad, juntas) · 15 cocina
       Cierre          16 resumen · 17 qué esperas de tu coach */
  const TOTAL_STEPS = 20;

  const finish = async () => {
    setSaving(true);
    setError('');
    try {
      // 05-8. Aquí había `targetCalories = 2000` fijo y un reparto 40/30/30
      // inventado, iguales para todo el mundo: unas 700 kcal por encima del
      // mantenimiento de una mujer de 55 kg, 52 años y sedentaria. Y ese número
      // no se queda quieto — es el que ella ve en Nutrición, el que aparece en
      // el hub del coach y el que lee el asistente de IA.
      //
      // Ahora se calcula con la misma función que usa el formulario del coach
      // (computeAuto: Mifflin-St Jeor × factor de actividad × ajuste de meta).
      // La validación del paso 1 y del paso 5 ya garantiza sexo, fecha de
      // nacimiento, peso, altura y nivel de actividad, así que en la práctica
      // siempre hay datos; si alguno faltara, se deja `targetCalories`
      // SIN ESCRIBIR en vez de inventar una cifra, y las pantallas muestran que
      // está pendiente del coach.
      //
      // 26-08: el alta ya no pregunta el objetivo (reducir grasa/ganar
      // músculo/mantener) — esa decisión la toma el coach con el atleta
      // delante, no un desplegable en un formulario de dos minutos. El
      // cálculo automático usa siempre 'mantener' (normocalórica) como punto
      // de partida; las kcal finales las ajusta el coach en la ficha.
      const auto = sex && birthDate && activityLevel
        && Number(weightKg) > 0 && Number(heightCm) > 0
        ? computeAuto(sex, birthDate, Number(weightKg), Number(heightCm), activityLevel, 'mantener')
        : null;
      // 03-09. Aquí se fusionaban DOS listas de alimentos no deseados: un texto
      // libre en el paso de Alimentación y las categorías marcadas en
      // Preferencias. Eran la misma pregunta hecha dos veces con cinco
      // pantallas de por medio — que hubiera que fusionarlas era la prueba. El
      // texto libre se ha retirado; queda el catálogo, que es el que el
      // generador de menús sabe leer.
      const data: OnboardingData = {
        athleteId: profile.email,
        // La decisión sobre el análisis asistido se tomó en el muro legal, antes
        // de llegar aquí, y su prueba vive en `user_profiles.legal`. Se copia al
        // alta porque es el documento que leen las herramientas del asistente
        // (`ai/tools.ts` → `estadoConsentimiento`). Sin esta línea, `saveOnboarding`
        // —que es un `setDoc` sin merge— borraría lo que el muro acabara de
        // escribir, y el atleta que dijo que sí aparecería como «sin responder».
        consentimientoIA: consentimientoIADesdeLegal(profile.legal),
        sex: sex || undefined,
        birthDate: birthDate || undefined,
        weightKg: Number(weightKg) || undefined,
        heightCm: Number(heightCm) || undefined,
        occupation: occupation.trim() || undefined,
        referralSource: referralSource.trim() || undefined,
        activityLevel: activityLevel || undefined,
        goalFreeText: goalFreeText.trim() || undefined,
        goalTimelineMotivation: goalTimelineMotivation.trim() || undefined,
        coachExpectations: coachExpectations.trim() || undefined,
        // `=== true`: el estado es de tres valores (sí / no / sin contestar) y
        // el documento de onboarding guarda un booleano. Sin contestar no
        // llega aquí —lo corta `stepValid`—, pero un borrador viejo sí puede.
        hadPastInjuries: hadPastInjuries === true,
        pastInjuriesDetail: hadPastInjuries === true ? (pastInjuriesDetail.trim() || undefined) : undefined,
        takesMedication: takesMedication === true,
        medicationDetail: takesMedication === true ? (medicationDetail.trim() || undefined) : undefined,
        recentSurgery: recentSurgery === true,
        recentSurgeryDetail: recentSurgery === true ? (recentSurgeryDetail.trim() || undefined) : undefined,
        dietType: (dietType || 'omnivoro') as DietType,
        targetCalories: auto ? auto.kcal : undefined,
        macroSplit: auto
          ? { hc: auto.hcPct, prot: auto.protPct, grasa: auto.grasaPct }
          : undefined,
        macroGrams: auto
          ? { hc: auto.hcG, prot: auto.protG, grasa: auto.grasaG }
          : undefined,
        likedFoods: prefLiked,
        dislikedFoods: prefDisliked,
        allergies: allergies.split(',').map(s => s.trim()).filter(Boolean),
        mealCount: mealCount ?? undefined,
        meals: meals.length > 0 ? meals : undefined,
        appetitePeakTime: appetitePeakTime.trim() || undefined,
        dietSince: esDietaVegetal ? (dietSince.trim() || undefined) : undefined,
        hadOverweightHistory: hadOverweightHistory === true,
        foodRelationshipGood: foodRelationshipGood !== false,
        foodRelationshipReason: foodRelationshipGood === false ? (foodRelationshipReason.trim() || undefined) : undefined,
        eatsTooFast: eatsTooFast === true,
        weightTendency: weightTendency.trim() || undefined,
        supplements: tomaSuplementos === true ? supplements.filter(x => x.name.trim()) : [],
        breakfastVariety: breakfastVariety ?? 3,
        lunchVariety: lunchVariety ?? 3,
        preferredDishTypes,
        excludedDishTypes,
        sleepDeficitCauses: sleepDeficitCauses.filter(c => c !== DUERMO_BIEN),
        sleepRoutineOrScreen: sleepRoutineOrScreen || undefined,
        sleepMedication: sleepMedication === true,
        sleepMedicationDetail: sleepMedication === true ? (sleepMedicationDetail.trim() || undefined) : undefined,
        sittingHoursPerDay: sittingHoursPerDay !== '' ? Number(sittingHoursPerDay) : undefined,
        stressReason: stressReason.trim() || undefined,
        restDayActive: restDayActive === true,
        restDayActiveDetail: restDayActive === true ? (restDayActiveDetail.trim() || undefined) : undefined,
        neckCm: Number(neckCm) > 0 ? Number(neckCm) : undefined,
        waistCm: Number(waistCm) > 0 ? Number(waistCm) : undefined,
        hipCm: Number(hipCm) > 0 ? Number(hipCm) : undefined,
        cookingLevel: cookingLevel ?? 3,
        cookingMaxTime: cookingMaxTime ?? 45,
        menuVariety: menuVariety ?? 3,
        batchCookingPreferred: batchCookingPreferred === true,
        equipment,
        favoriteExercises: [],
        hatedExercises: hatedExercises.split(',').map(x => x.trim()).filter(Boolean),
        availableDaysPerWeek: availableDaysPerWeek ?? undefined,
        sessionMaxMinutes: sessionMaxMinutes ?? undefined,
        lifestyleScope: lifestyleScope || undefined,
        lifestyleAreas,
        // El campo del modelo es texto libre porque el formulario del coach lo
        // escribe a mano; desde aquí se eligen por chips y se juntan.
        muscleGroupsToImprove: muscleGroupsToImprove.length > 0
          ? muscleGroupsToImprove.map(m => MUSCLE_LABELS[m as MuscleGroup]).join(', ')
          : undefined,
        experienceLevel: (experienceLevel || 'principiante') as ExperienceLevel,
        injuries: noInjuries ? '' : injuries.trim(),
        hasCurrentInjury: !noInjuries && injuries.trim().length > 0,
        currentInjuryLocation: noInjuries ? undefined : (injuries.trim() || undefined),
        completedAt: new Date().toISOString(),
      };
      await saveOnboarding(data);
      // Las verduras habituales viven aparte, en AthleteNutritionConfig (las
      // comparte con NutritionHubScreen y el panel de análisis del coach), no
      // en el documento de onboarding. Best-effort: si falla, el atleta puede
      // marcarlas después desde Nutrición — no es motivo para bloquear el alta.
      if (vegTypes.length > 0) {
        try {
          const config = await getAthleteNutritionConfig(profile.email);
          await saveAthleteNutritionConfig({ ...config, vegTypes });
        } catch (err) {
          console.warn('No se pudieron guardar las verduras habituales:', err);
        }
      }
      // 05-4. La ficha ya está guardada: el borrador sobra. Va después del
      // await, para que un fallo al guardar no se lleve por delante los pasos
      // que el atleta acaba de rellenar.
      borrarBorradorAlta(profile.email);
      setEnviado(true);
      onComplete();
    } catch (err) {
      console.error('saveOnboarding failed:', err);
      // P1-6: el mensaje sale del error real. Antes era siempre "revisa tu
      // conexión", que en el caso más frecuente —permisos denegados— mandaba al
      // atleta a mirar su wifi mientras el problema estaba en su cuenta.
      setError(mensajeDeErrorFirestore(err, 'guardar tu ficha'));
    } finally {
      setSaving(false);
    }
  };

  const pct = Math.round((step / (TOTAL_STEPS - 1)) * 100);

  return (
    // 14-08. `h-[100dvh]`, no `min-h-screen`: con min-height el div podía
    // crecer más alto que la pantalla y el documento entero se desplazaba
    // (lateral incluido, porque un hijo `flex` de sobra —p. ej. una fila de
    // chips sin `min-w-0`— ya no quedaba contenido por ningún `overflow-hidden`
    // de altura fija). Fijar la altura al viewport y mover el scroll a un único
    // contenedor interno (ver más abajo) dejan la cabecera y los botones
    // siempre en su sitio, y el `overflow-hidden` de aquí sí llega a recortar
    // cualquier desbordamiento en vez de solo maquillarlo.
    <div className="h-[100dvh] bg-bg flex flex-col relative overflow-hidden">
      <style>{`@keyframes fadeSlideIn { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: none; } }`}</style>
      {/* Corrige P0-1 de la auditoría visual (docs/auditoria-visual/hallazgos.md):
          los brillos con offset negativo (-10%) inflaban el scrollWidth del
          ancestro a 413 px en un viewport de 375 — `overflow-hidden` en el
          contenedor flex de arriba no bastaba. Un wrapper propio, absoluto y
          recortado a los cuatro bordes, los aísla del cálculo de layout del
          resto de la pantalla. */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-accent/6 blur-[120px] rounded-full"></div>
      </div>

      {/* Progreso — corrige P2-1: pista más visible (track, no white/5) y
          "Paso N de M" explícito en vez de solo la fracción junto al logo. */}
      {/* pt: es la PRIMERA pantalla que ve un atleta nuevo, y sin reservar la
          safe area el "Paso N de 6" y el logo se metían bajo la isla dinámica
          (07-3). El calc mantiene los 2rem de aire original por debajo. */}
      <div className="flex-none w-full max-w-lg mx-auto px-6 pt-[calc(2rem+var(--safe-top))]">
        <div className="flex items-center gap-2 mb-2">
          <img src="/atlas-logo.png" alt="En Forma" className="w-7 h-7 object-contain" />
          <span className="font-sans font-bold text-title-m tracking-tighter uppercase text-accent">EN FORMA</span>
          {step > 0 && (
            <span className="ml-auto font-mono text-caption uppercase tracking-widest text-ink-2">
              Paso {step} de {TOTAL_STEPS - 1}
            </span>
          )}
        </div>
        <div className="h-1.5 bg-track rounded-full overflow-hidden">
          <div className="h-full bg-accent rounded-full transition-[width] duration-(--duration-bar) ease-brand" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Contenido del paso — corrige P1-1: sin `justify-center` el contenido se
          quedaba pegado arriba y dejaba ~600 px muertos hasta los botones en
          los pasos cortos (bienvenida, "Tu día a día"). En los pasos largos
          (Alimentación) no cambia nada: no hay hueco que centrar, así que el
          contenido sigue empezando arriba y hace scroll dentro de este
          contenedor.
          `min-h-0` es obligatorio en un hijo `flex-1` para que su propio
          `overflow-y-auto` funcione: sin él, un hijo flex nunca se encoge por
          debajo de la altura de su contenido (mínimo automático), así que
          jamás llegaba a desbordar y el scroll se lo comía el documento
          entero — el mismo bug que ya se vio en el CRM, aquí en vertical. */}
      <div ref={contentRef} className="flex-1 min-h-0 overflow-y-auto" key={step}>
        {/* 03-09. El `justify-center` vivía en el MISMO div que el
            `overflow-y-auto`, y eso es la trampa clásica de flexbox: cuando el
            contenido es más alto que el contenedor, centrarlo empuja el
            principio por encima del borde superior — y ahí arriba no se puede
            desplazar, el scroll no alcanza el desbordamiento de un `center`.
            En los pasos largos (Alimentación, Suplementos y menú) eso dejaba el
            título y las primeras preguntas FUERA DE ALCANCE: otra tanda de
            preguntas que nadie contestaba porque nadie llegaba a verlas.
            Con el centrado en un hijo con `min-h-full`, cuando el contenido
            crece ya no queda espacio libre que repartir y el paso empieza
            arriba del todo, como debe; en los pasos cortos sigue centrado. */}
        <div className="min-h-full w-full max-w-lg mx-auto px-6 py-8 flex flex-col justify-center">
        {step === 0 && (
          <StepShell title={`¡Hola, ${firstName}! 👋`} subtitle="Antes de empezar necesitamos conocerte. Son unos minutos y se guarda solo: si lo dejas a medias, vuelves y sigues donde estabas.">
            {/* VIDEO_SLOT: aquí irá el vídeo corto de bienvenida de Dani. */}
            <div className="bg-surface border border-hairline rounded-surface p-5 space-y-3">
              {[
                { icon: 'person', text: 'Quién eres y qué quieres conseguir' },
                { icon: 'health_and_safety', text: 'Tu salud, para entrenarte sin hacerte daño' },
                { icon: 'fitness_center', text: 'Cómo entrenas, te mueves y descansas' },
                { icon: 'restaurant', text: 'Cómo comes, qué cocinas y qué no quieres ver' },
              ].map(i => (
                <p key={i.icon} className="flex items-center gap-3 text-body-s text-ink">
                  <Icon name={i.icon} size="m" className="text-accent" />
                  {i.text}
                </p>
              ))}
            </div>
            <p className="text-body-s text-ink-2">
              Contesta con sinceridad, aunque algo te dé pereza o vergüenza. Tu coach es la única
              persona que lo va a leer, y con esto te monta el plan.
            </p>
          </StepShell>
        )}

        {/* ── BLOQUE 1 · QUIÉN ERES ─────────────────────────────────────── */}

        {step === 1 && (
          <StepShell title="Sobre ti" subtitle="Con esto se calculan tus calorías: la fórmula usa sexo, edad, peso y altura. Sin estos cuatro datos, el resto son adivinanzas.">
            <div className="space-y-4">
              <div>
                <p className="font-sans text-caption text-ink-2 uppercase tracking-wider mb-2">Sexo</p>
                <div className="grid grid-cols-2 gap-2">
                  <Chip selected={sex === 'male'} onClick={() => setSex('male')}>Hombre</Chip>
                  <Chip selected={sex === 'female'} onClick={() => setSex('female')}>Mujer</Chip>
                </div>
              </div>
              <div>
                <label className="block font-mono text-caption text-ink-2 uppercase tracking-wider mb-2">Fecha de nacimiento</label>
                <input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-mono text-caption text-ink-2 uppercase tracking-wider mb-2">Peso (kg)</label>
                  <input type="number" inputMode="decimal" value={weightKg} onChange={e => setWeightKg(e.target.value)} placeholder="75" className={inputCls} />
                  <p className="text-body-s text-ink-3 mt-1">Por la mañana, en ayunas y después de ir al baño.</p>
                </div>
                <div>
                  <label className="block font-mono text-caption text-ink-2 uppercase tracking-wider mb-2">Altura (cm)</label>
                  <input type="number" inputMode="numeric" value={heightCm} onChange={e => setHeightCm(e.target.value)} placeholder="175" className={inputCls} />
                  <p className="text-body-s text-ink-3 mt-1">Sin zapatos, de espaldas a la pared.</p>
                </div>
              </div>
            </div>
          </StepShell>
        )}

        {step === 2 && (
          <StepShell title="Tus medidas" subtitle="Tres medidas con una cinta métrica. Con ellas tu coach calcula tu grasa corporal sin báscula especial, y ve tus cambios donde la báscula no los enseña.">
            {/* Instrucciones a pie de campo y no en un enlace de ayuda: si se
                toman mal, el número no vale para nada y nadie se entera. */}
            <div className="bg-surface border border-hairline rounded-surface p-4">
              <div className="flex items-start gap-2 font-sans text-body-s text-ink-2">
                <Icon name="straighten" size="m" className="text-accent shrink-0" />
                <span>
                  De pie, relajado y sin meter tripa. La cinta pegada a la piel pero{' '}
                  <span className="text-white font-bold">sin apretar</span>, y bien horizontal.
                  Mide al soltar el aire. Mejor por la mañana y en ayunas.
                </span>
              </div>
            </div>

            <div>
              <label className="block font-sans text-caption text-ink-2 uppercase tracking-wider mb-1">Cuello</label>
              <p className="text-body-s text-ink-2 mb-2">
                Justo por debajo de la nuez, con la cinta un poco caída hacia delante. Mira al frente y suelta los hombros.
              </p>
              <input type="number" inputMode="decimal" value={neckCm} onChange={e => { setNeckCm(e.target.value); setSinCinta(false); }}
                placeholder="cm" className={inputCls} />
            </div>

            <div>
              <label className="block font-sans text-caption text-ink-2 uppercase tracking-wider mb-1">Cintura</label>
              <p className="text-body-s text-ink-2 mb-2">
                A la altura del ombligo, no por donde te queda el pantalón. Es la que más se falsea sin querer: no metas tripa.
              </p>
              <input type="number" inputMode="decimal" value={waistCm} onChange={e => { setWaistCm(e.target.value); setSinCinta(false); }}
                placeholder="cm" className={inputCls} />
            </div>

            <div>
              <label className="block font-sans text-caption text-ink-2 uppercase tracking-wider mb-1">Cadera</label>
              <p className="text-body-s text-ink-2 mb-2">
                Por la parte más ancha del glúteo, con los pies juntos. Mírate en un espejo para que la cinta quede recta por detrás.
              </p>
              <input type="number" inputMode="decimal" value={hipCm} onChange={e => { setHipCm(e.target.value); setSinCinta(false); }}
                placeholder="cm" className={inputCls} />
            </div>

            {/* Sin cinta métrica no se puede medir, y encerrar aquí a alguien
                por no tener una en casa sería absurdo. */}
            <Chip selected={sinCinta} onClick={() => setSinCinta(v => !v)}>
              No tengo cinta métrica — se las doy a mi coach después
            </Chip>
          </StepShell>
        )}

        {step === 3 && (
          <StepShell title="Tu vida fuera del gimnasio" subtitle="A qué dedicas el día cambia el plan más de lo que parece: no se programa igual a quien conduce ocho horas que a quien está de pie.">
            <Input
              label="¿A qué te dedicas?"
              hint="Tu trabajo o tu ocupación del día a día."
              value={occupation}
              onChange={setOccupation}
              placeholder="Ej: profesor, comercial, enfermera, estudiante…"
            />
            <Input
              label="¿Cómo nos has conocido?"
              hint="Sirve para saber por dónde llega la gente."
              value={referralSource}
              onChange={setReferralSource}
              placeholder="Ej: Instagram, me lo recomendó un amigo…"
            />
          </StepShell>
        )}

        {step === 4 && (
          <StepShell title="Tu objetivo" subtitle="La pregunta más importante de todo el cuestionario. Escribe de más, no de menos.">
            <div>
              <label className="block font-sans text-caption text-ink-2 uppercase tracking-wider mb-2">
                ¿Para cuándo lo quieres? ¿Hay algo detrás?
              </label>
              <p className="text-body-s text-ink-2 mb-2">
                Una fecha, un evento, un motivo. No hace falta que sea nada gordo: «estoy harto de sentirme así» también vale.
              </p>
              <textarea value={goalTimelineMotivation} onChange={e => setGoalTimelineMotivation(e.target.value)} rows={3}
                placeholder="Ej: en 4 meses tengo una boda; o simplemente estoy cansado de sentirme así"
                className={`${inputCls} resize-none`} />
            </div>
            <div>
              <label className="block font-sans text-caption text-ink-2 uppercase tracking-wider mb-2">
                ¿Cómo te ves o te sientes cuando lo consigas?
              </label>
              <p className="text-body-s text-ink-2 mb-2">
                Descríbelo con tus palabras, como se lo contarías a un amigo. No hace falta hablar de kilos.
              </p>
              <textarea value={goalFreeText} onChange={e => setGoalFreeText(e.target.value)} rows={3}
                placeholder="Ej: me veo con más energía, con la ropa que quiero ponerme, sin agobiarme al subir escaleras"
                className={`${inputCls} resize-none`} />
            </div>
          </StepShell>
        )}

        {step === 5 && (
          <StepShell title="¿Hasta dónde quieres llegar?" subtitle="Tu coach puede trabajar contigo muchas más cosas que la tabla del gimnasio. Pero solo si tú quieres: aquí decides tú hasta dónde.">
            <div>
              <p className="font-sans text-caption text-ink-2 uppercase tracking-wider mb-2">¿Qué buscas?</p>
              <div className="space-y-3">
                {ALCANCE.map(a => (
                  <Chip key={a.id} big selected={lifestyleScope === a.id}
                    onClick={() => { setLifestyleScope(a.id); if (a.id === 'solo_fisico') setLifestyleAreas([]); }}>
                    <span className="block font-bold text-white">{a.label}</span>
                    <span className="block text-label text-ink-2">{a.desc}</span>
                  </Chip>
                ))}
              </div>
            </div>

            {lifestyleScope && lifestyleScope !== 'solo_fisico' && (
              <div>
                <p className="font-sans text-caption text-ink-2 uppercase tracking-wider mb-1">¿En qué te dejarías ayudar?</p>
                <p className="text-body-s text-ink-2 mb-2">
                  Marca lo que quieras. Nada de esto es obligatorio y puedes cambiar de idea cuando quieras.
                </p>
                <div className="space-y-3">
                  {LIFESTYLE_AREAS.map(a => (
                    <Chip key={a.id} big selected={lifestyleAreas.includes(a.id)}
                      onClick={() => setLifestyleAreas(prev => alternar(prev, a.id))}>
                      <span className="block font-bold text-white">{a.label}</span>
                      <span className="block text-label text-ink-2">{a.desc}</span>
                    </Chip>
                  ))}
                </div>
              </div>
            )}

            {lifestyleScope === 'solo_fisico' && (
              <p className="text-body-s text-ink-2">
                Perfecto. Tu coach se centrará en el entrenamiento y en la dieta, sin darte la brasa con lo demás.
              </p>
            )}
          </StepShell>
        )}

        {/* ── BLOQUE 2 · TU SALUD ───────────────────────────────────────── */}

        {/* Las lesiones actuales estaban en el paso de entrenamiento y las
            pasadas aquí: la misma pregunta partida en dos pantallas separadas.
            Ahora la salud se contesta de una vez y de arriba abajo. */}
        {step === 6 && (
          <StepShell title="Tu salud" subtitle="Esto no es burocracia: es lo que evita que tu coach te mande un ejercicio que te haga daño. Si dudas de si contarlo, cuéntalo.">
            <div>
              <p className="font-sans text-caption text-ink-2 uppercase tracking-wider mb-1">¿Te duele algo AHORA?</p>
              <p className="text-body-s text-ink-2 mb-2">
                Cualquier molestia que notes al moverte, aunque no sea una lesión con nombre y apellidos.
              </p>
              <div className="space-y-2">
                <Chip selected={noInjuries} onClick={() => { setNoInjuries(v => !v); if (!noInjuries) setInjuries(''); }}>
                  No me duele nada
                </Chip>
                {!noInjuries && (
                  <textarea value={injuries} onChange={e => setInjuries(e.target.value)} rows={2}
                    placeholder="Ej: molestia en el hombro derecho al hacer press de banca" className={`${inputCls} resize-none`} />
                )}
              </div>
            </div>

            <div>
              <p className="font-sans text-caption text-ink-2 uppercase tracking-wider mb-1">¿Y lesiones de antes, ya curadas?</p>
              <p className="text-body-s text-ink-2 mb-2">
                Roturas, esguinces, hernias, operaciones… aunque hace años que no te molesten.
              </p>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Chip selected={hadPastInjuries === true} onClick={() => setHadPastInjuries(true)}>Sí</Chip>
                  <Chip selected={hadPastInjuries === false} onClick={() => { setHadPastInjuries(false); setPastInjuriesDetail(''); }}>No</Chip>
                </div>
                {hadPastInjuries === true && (
                  <input value={pastInjuriesDetail} onChange={e => setPastInjuriesDetail(e.target.value)}
                    placeholder="Ej: rotura de ligamento en la rodilla izquierda, en 2019" className={inputCls} />
                )}
              </div>
            </div>

            <div>
              <p className="font-sans text-caption text-ink-2 uppercase tracking-wider mb-1">¿Tomas alguna medicación?</p>
              <p className="text-body-s text-ink-2 mb-2">
                Cualquier cosa recetada que tomes de forma habitual: tensión, tiroides, antidepresivos, anticonceptivos…
              </p>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Chip selected={takesMedication === true} onClick={() => setTakesMedication(true)}>Sí</Chip>
                  <Chip selected={takesMedication === false} onClick={() => { setTakesMedication(false); setMedicationDetail(''); }}>No</Chip>
                </div>
                {takesMedication === true && (
                  <input value={medicationDetail} onChange={e => setMedicationDetail(e.target.value)}
                    placeholder="¿Cuál o cuáles?" className={inputCls} />
                )}
              </div>
            </div>

            <div>
              <p className="font-sans text-caption text-ink-2 uppercase tracking-wider mb-1">¿Te han operado en el último año?</p>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Chip selected={recentSurgery === true} onClick={() => setRecentSurgery(true)}>Sí</Chip>
                  <Chip selected={recentSurgery === false} onClick={() => { setRecentSurgery(false); setRecentSurgeryDetail(''); }}>No</Chip>
                </div>
                {recentSurgery === true && (
                  <input value={recentSurgeryDetail} onChange={e => setRecentSurgeryDetail(e.target.value)}
                    placeholder="¿De qué?" className={inputCls} />
                )}
              </div>
            </div>
          </StepShell>
        )}

        {/* ── BLOQUE 3 · CÓMO TE MUEVES Y CÓMO DESCANSAS ────────────────── */}

        {step === 7 && (
          <StepShell title="Tu entrenamiento" subtitle="Sé honesto: exagerar aquí solo hace que te manden un plan que no puedes seguir.">
            <div>
              <p className="font-sans text-caption text-ink-2 uppercase tracking-wider mb-2">¿Qué experiencia tienes?</p>
              <div className="space-y-3">
                {EXPERIENCE.map(x => (
                  <Chip key={x.id} big selected={experienceLevel === x.id} onClick={() => setExperienceLevel(x.id)}>
                    <span className="block font-bold text-white">{x.label}</span>
                    <span className="block text-label text-ink-2">{x.desc}</span>
                  </Chip>
                ))}
              </div>
            </div>

            {/* Estas dos son lo primero que hace falta para montar un mesociclo
                y el alta no las preguntaba: vivían sueltas en la plantilla del
                coach, que las rellenaba a mano si se acordaba. */}
            <div>
              <p className="font-sans text-caption text-ink-2 uppercase tracking-wider mb-1">¿Cuántos días a la semana puedes entrenar?</p>
              <p className="text-body-s text-ink-2 mb-2">
                Los que puedas cumplir de verdad una semana normal, no los que te gustaría. Es mejor decir 3 y cumplirlos que decir 5 y fallar.
              </p>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5, 6].map(n => (
                  <Chip key={n} selected={availableDaysPerWeek === n} onClick={() => setAvailableDaysPerWeek(n)}>{n}</Chip>
                ))}
              </div>
            </div>

            <div>
              <p className="font-sans text-caption text-ink-2 uppercase tracking-wider mb-1">¿Cuánto tiempo tienes por sesión?</p>
              <p className="text-body-s text-ink-2 mb-2">
                Desde que entras hasta que sales, incluido el calentamiento.
              </p>
              <div className="flex flex-wrap gap-2">
                {[30, 45, 60, 75, 90, 120].map(n => (
                  <Chip key={n} selected={sessionMaxMinutes === n} onClick={() => setSessionMaxMinutes(n)}>
                    {n >= 120 ? '2 h o más' : `${n} min`}
                  </Chip>
                ))}
              </div>
            </div>
          </StepShell>
        )}

        {step === 8 && (
          <StepShell title="Qué quieres trabajar" subtitle="Dentro de lo que te convenga, tu coach puede darle más caña a lo que a ti te importe.">
            <div>
              <p className="font-sans text-caption text-ink-2 uppercase tracking-wider mb-1">¿Qué te gustaría mejorar?</p>
              <p className="text-body-s text-ink-2 mb-2">
                Marca los que quieras. Tu plan seguirá siendo equilibrado: esto solo decide dónde se pone el acento.
              </p>
              <div className="flex flex-wrap gap-2">
                {MUSCLE_ORDER.map(m => (
                  <Chip key={m} selected={muscleGroupsToImprove.includes(m)}
                    onClick={() => {
                      setSinPreferenciaMuscular(false);
                      setMuscleGroupsToImprove(prev => alternar(prev, m));
                    }}>{MUSCLE_LABELS[m]}</Chip>
                ))}
              </div>
              <div className="mt-2">
                <Chip selected={sinPreferenciaMuscular}
                  onClick={() => { setSinPreferenciaMuscular(v => !v); setMuscleGroupsToImprove([]); }}>
                  Me da igual, reparte tú
                </Chip>
              </div>
            </div>

            <div>
              <label className="block font-sans text-caption text-ink-2 uppercase tracking-wider mb-1">
                ¿Hay algún ejercicio que odies? <span className="normal-case text-ink-3">(opcional)</span>
              </label>
              <p className="text-body-s text-ink-2 mb-2">
                El que te aburre, el que te da miedo o el que te sienta mal. Si se puede cambiar por otro que haga lo
                mismo, tu coach lo cambia. Sepáralos por comas.
              </p>
              <input value={hatedExercises} onChange={e => setHatedExercises(e.target.value)}
                placeholder="Ej: burpees, sentadilla con barra, cinta" className={inputCls} />
            </div>
          </StepShell>
        )}

        {/* «Tu día a día» preguntaba solo el nivel de actividad; las horas
            sentado y si te mueves en los días libres vivían tres pantallas más
            allá, en Descanso. Son la misma pregunta: cuánto te mueves. */}
        {step === 9 && (
          <StepShell title="Tu día a día" subtitle="Fuera del gimnasio. Aquí no cuentes el entrenamiento: interesa cómo es tu día normal.">
            <div>
              <p className="font-sans text-caption text-ink-2 uppercase tracking-wider mb-2">¿Cuánto te mueves en un día normal?</p>
              <div className="space-y-3">
                {ACTIVITY.map(a => (
                  <Chip key={a.id} big selected={activityLevel === a.id} onClick={() => setActivityLevel(a.id)}>
                    <span className="block font-bold text-white">{a.label}</span>
                    <span className="block text-label text-ink-2">{a.desc}</span>
                  </Chip>
                ))}
              </div>
            </div>

            <div>
              <label className="block font-sans text-caption text-ink-2 uppercase tracking-wider mb-1">¿Cuántas horas pasas sentado al día?</label>
              <p className="text-body-s text-ink-2 mb-2">
                Suma trabajo, coche y sofá. A ojo vale: si trabajas sentado de 9 a 18 y luego cenas viendo la tele, son unas 10.
              </p>
              <input type="number" inputMode="numeric" min={0} max={24} value={sittingHoursPerDay}
                onChange={e => setSittingHoursPerDay(e.target.value)} placeholder="Ej: 8" className={inputCls} />
            </div>

            <div>
              <p className="font-sans text-caption text-ink-2 uppercase tracking-wider mb-1">Los días que NO entrenas, ¿te mueves algo?</p>
              <p className="text-body-s text-ink-2 mb-2">
                Andar, bici, pádel, montaña, jugar con los niños… cualquier cosa que no sea estar parado.
              </p>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Chip selected={restDayActive === true} onClick={() => setRestDayActive(true)}>Sí</Chip>
                  <Chip selected={restDayActive === false} onClick={() => { setRestDayActive(false); setRestDayActiveDetail(''); }}>No</Chip>
                </div>
                {restDayActive === true && (
                  <input value={restDayActiveDetail} onChange={e => setRestDayActiveDetail(e.target.value)}
                    placeholder="Ej: paseo una hora, voy en bici al trabajo" className={inputCls} />
                )}
              </div>
            </div>
          </StepShell>
        )}

        {step === 10 && (
          <StepShell title="Tu descanso y tu estrés" subtitle="Si duermes mal o vives estresado, tu cuerpo no responde igual al entrenamiento ni a la dieta. Tu coach necesita saberlo para no culpar al plan de algo que no es el plan.">
            <div>
              <p className="font-sans text-caption text-ink-2 uppercase tracking-wider mb-1">¿Cómo duermes?</p>
              <p className="text-body-s text-ink-2 mb-2">
                Si duermes mal, marca todo lo que te pase. Puedes marcar varias.
              </p>
              <div className="flex flex-wrap gap-2">
                <Chip selected={sleepDeficitCauses.includes(DUERMO_BIEN)}
                  onClick={() => setSleepDeficitCauses(sleepDeficitCauses.includes(DUERMO_BIEN) ? [] : [DUERMO_BIEN])}>
                  Duermo bien
                </Chip>
                {CAUSAS_SUENO.map(c => (
                  <Chip key={c} selected={sleepDeficitCauses.includes(c)}
                    onClick={() => setSleepDeficitCauses(prev => alternar(prev.filter(x => x !== DUERMO_BIEN), c))}>
                    {c}
                  </Chip>
                ))}
              </div>
            </div>

            <div>
              <p className="font-sans text-caption text-ink-2 uppercase tracking-wider mb-2">La última hora antes de dormir, ¿qué haces?</p>
              <div className="space-y-3">
                {RUTINA_PANTALLA.map(r => (
                  <Chip key={r.id} big selected={sleepRoutineOrScreen === r.id} onClick={() => setSleepRoutineOrScreen(r.id)}>
                    <span className="block font-bold text-white">{r.label}</span>
                    <span className="block text-label text-ink-2">{r.desc}</span>
                  </Chip>
                ))}
              </div>
            </div>

            <div>
              <p className="font-sans text-caption text-ink-2 uppercase tracking-wider mb-1">¿Tomas algo para dormir?</p>
              <p className="text-body-s text-ink-2 mb-2">
                Pastillas, melatonina, infusiones… lo que sea, aunque no sea recetado.
              </p>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Chip selected={sleepMedication === true} onClick={() => setSleepMedication(true)}>Sí</Chip>
                  <Chip selected={sleepMedication === false} onClick={() => { setSleepMedication(false); setSleepMedicationDetail(''); }}>No</Chip>
                </div>
                {sleepMedication === true && (
                  <input value={sleepMedicationDetail} onChange={e => setSleepMedicationDetail(e.target.value)}
                    placeholder="¿Qué tomas?" className={inputCls} />
                )}
              </div>
            </div>

            <div>
              <label className="block font-sans text-caption text-ink-2 uppercase tracking-wider mb-1">¿Qué es lo que más te estresa ahora mismo?</label>
              <p className="text-body-s text-ink-2 mb-2">
                Si no estás especialmente estresado, dilo también — es un dato igual de útil.
              </p>
              <textarea value={stressReason} onChange={e => setStressReason(e.target.value)} rows={2}
                placeholder="Ej: el trabajo y los turnos de noche; o: la verdad es que estoy tranquilo"
                className={`${inputCls} resize-none`} />
            </div>
          </StepShell>
        )}

        {/* ── BLOQUE 4 · CÓMO COMES ─────────────────────────────────────── */}

        {step === 11 && (
          <StepShell title="Tu alimentación" subtitle="Lo básico de tu dieta. Tu coach la montará respetando esto.">
            <div>
              <p className="font-sans text-caption text-ink-2 uppercase tracking-wider mb-2">¿Qué comes?</p>
              <div className="space-y-3">
                {DIET_TYPES.map(d => (
                  <Chip key={d.id} big selected={dietType === d.id} onClick={() => setDietType(d.id)}>
                    <span className="flex items-center gap-2 font-bold text-white">
                      <Icon name={d.icon} size="m" />
                      {d.label}
                    </span>
                    <span className="block text-label text-ink-2 mt-1">{d.desc}</span>
                  </Chip>
                ))}
              </div>
            </div>

            {esDietaVegetal && (
              <div>
                <label className="block font-sans text-caption text-ink-2 uppercase tracking-wider mb-1">
                  ¿Desde cuándo comes {dietType === 'vegano' ? 'vegano' : 'vegetariano'}?
                </label>
                <p className="text-body-s text-ink-2 mb-2">
                  Cuanto más tiempo lleves, más importa vigilar hierro y B12.
                </p>
                <input value={dietSince} onChange={e => setDietSince(e.target.value)}
                  placeholder="Ej: desde hace 2 años" className={inputCls} />
              </div>
            )}

            <div>
              <p className="font-sans text-caption text-ink-2 uppercase tracking-wider mb-1">¿Cuántas veces al día quieres comer?</p>
              <p className="text-body-s text-ink-2 mb-2">
                No hay una mejor que otra: elige la que puedas cumplir un martes cualquiera.
              </p>
              <div className="flex gap-2">
                {[3, 4, 5].map(n => (
                  <Chip key={n} selected={mealCount === n} onClick={() => setMealCount(n)}>{n} comidas</Chip>
                ))}
              </div>
            </div>

            <div>
              <label className="block font-sans text-caption text-ink-2 uppercase tracking-wider mb-1">Alergias o intolerancias</label>
              <p className="text-body-s text-ink-2 mb-2">
                Solo lo que te siente mal de verdad. Lo que simplemente no te gusta lo eliges más adelante, en una pantalla propia.
                Sepáralas por comas, o déjalo vacío.
              </p>
              <input value={allergies} onChange={e => setAllergies(e.target.value)}
                placeholder="Ej: lactosa, frutos secos" className={inputCls} />
            </div>
          </StepShell>
        )}

        {step === 12 && (
          <StepShell title="Tus comidas" subtitle="Marca las que te toca comer fuera de casa. A esas, tu coach les pondrá recetas que aguanten en un táper.">
            <div className="divide-y divide-hairline rounded-surface overflow-hidden border border-hairline">
              {meals.map((meal, i) => (
                <div key={meal.intakeType} className="flex items-center gap-3 px-4 py-3 bg-surface">
                  <Icon name={INTAKE_ICONS[meal.intakeType]} size="m" className="text-ink-2" />
                  <span className="flex-1 font-sans text-body-s text-white">{meal.name}</span>
                  <button type="button"
                    onClick={() => setMeals(prev => prev.map((m, idx) => idx === i ? { ...m, needsTupper: !m.needsTupper } : m))}
                    className={`flex items-center gap-2 px-3 py-2 rounded-control font-mono text-caption font-bold border transition-all active:scale-95 ${
                      meal.needsTupper
                        ? 'bg-accent/15 border-accent/40 text-accent'
                        : 'bg-raised border-hairline text-ink-3 hover:text-ink-2'
                    }`}
                  >
                    <Icon name="lunch_dining" size="s" />
                    Tupper
                  </button>
                </div>
              ))}
            </div>
            <p className="text-body-s text-ink-2">
              Si comes todas en casa, no marques ninguna y sigue.
            </p>
          </StepShell>
        )}

        {step === 13 && (
          <StepShell title="Tu relación con la comida" subtitle="Esto es lo que separa una dieta que aguantas de una que abandonas en dos semanas. Contesta sin maquillar.">
            <div>
              <label className="block font-sans text-caption text-ink-2 uppercase tracking-wider mb-1">
                ¿En qué momento del día tienes más hambre?
              </label>
              <p className="text-body-s text-ink-2 mb-2">
                Sirve para repartir las calorías donde de verdad las necesitas, en vez de dejarte con hambre justo a tu peor hora.
              </p>
              <input value={appetitePeakTime} onChange={e => setAppetitePeakTime(e.target.value)}
                placeholder="Ej: por la noche, al llegar a casa del trabajo" className={inputCls} />
            </div>

            <div>
              <p className="font-sans text-caption text-ink-2 uppercase tracking-wider mb-1">¿Has tenido sobrepeso u obesidad antes?</p>
              <p className="text-body-s text-ink-2 mb-2">
                Quien ya ha perdido peso otras veces necesita un plan distinto. No es un juicio, es información.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Chip selected={hadOverweightHistory === true} onClick={() => setHadOverweightHistory(true)}>Sí</Chip>
                <Chip selected={hadOverweightHistory === false} onClick={() => setHadOverweightHistory(false)}>No</Chip>
              </div>
            </div>

            <div>
              <p className="font-sans text-caption text-ink-2 uppercase tracking-wider mb-1">¿Tu relación con la comida es buena?</p>
              <p className="text-body-s text-ink-2 mb-2">
                Buena significa que comes sin culpa, sin atracones y sin darle mil vueltas. Si no es tu caso, dilo: cambia el plan entero.
              </p>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Chip selected={foodRelationshipGood === true} onClick={() => { setFoodRelationshipGood(true); setFoodRelationshipReason(''); }}>Sí</Chip>
                  <Chip selected={foodRelationshipGood === false} onClick={() => setFoodRelationshipGood(false)}>No</Chip>
                </div>
                {foodRelationshipGood === false && (
                  <textarea value={foodRelationshipReason} onChange={e => setFoodRelationshipReason(e.target.value)} rows={2}
                    placeholder="Cuéntalo con tus palabras. Ej: como por ansiedad cuando estoy agobiado" className={`${inputCls} resize-none`} />
                )}
              </div>
            </div>

            <div>
              <p className="font-sans text-caption text-ink-2 uppercase tracking-wider mb-1">¿Comes muy deprisa?</p>
              <p className="text-body-s text-ink-2 mb-2">
                Si acabas el plato en menos de diez minutos, la respuesta es sí.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Chip selected={eatsTooFast === true} onClick={() => setEatsTooFast(true)}>Sí</Chip>
                <Chip selected={eatsTooFast === false} onClick={() => setEatsTooFast(false)}>No</Chip>
              </div>
            </div>

            <div>
              <label className="block font-sans text-caption text-ink-2 uppercase tracking-wider mb-1">
                ¿Engordas con facilidad, adelgazas con facilidad, o te mantienes?
              </label>
              <p className="text-body-s text-ink-2 mb-2">
                Lo que hayas notado en tu vida, sin más. No hace falta que sea científico.
              </p>
              <input value={weightTendency} onChange={e => setWeightTendency(e.target.value)}
                placeholder="Ej: engordo solo con mirar el pan" className={inputCls} />
            </div>

            <div>
              <p className="font-sans text-caption text-ink-2 uppercase tracking-wider mb-1">¿Tomas algún suplemento?</p>
              <p className="text-body-s text-ink-2 mb-2">
                Proteína, creatina, vitaminas, omega 3… lo que estés tomando ahora mismo.
              </p>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Chip selected={tomaSuplementos === true}
                    onClick={() => { setTomaSuplementos(true); if (supplements.length === 0) setSupplements([{ name: '', dose: '', frequency: '' }]); }}>Sí</Chip>
                  <Chip selected={tomaSuplementos === false}
                    onClick={() => { setTomaSuplementos(false); setSupplements([]); }}>No</Chip>
                </div>
                {tomaSuplementos === true && (
                  <div className="space-y-2">
                    {supplements.map((sup, i) => (
                      <div key={i} className="grid grid-cols-3 gap-2">
                        <input value={sup.name} placeholder="Cuál"
                          onChange={e => setSupplements(prev => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                          className={inputCls} />
                        <input value={sup.dose} placeholder="Cuánto"
                          onChange={e => setSupplements(prev => prev.map((x, j) => j === i ? { ...x, dose: e.target.value } : x))}
                          className={inputCls} />
                        <input value={sup.frequency} placeholder="Cuándo"
                          onChange={e => setSupplements(prev => prev.map((x, j) => j === i ? { ...x, frequency: e.target.value } : x))}
                          className={inputCls} />
                      </div>
                    ))}
                    <Chip selected={false} onClick={() => setSupplements(prev => [...prev, { name: '', dose: '', frequency: '' }])}>
                      + Añadir otro
                    </Chip>
                  </div>
                )}
              </div>
            </div>
          </StepShell>
        )}

        {/* El texto libre «alimentos que no quieres ver» que había en el paso de
            Alimentación se ha quitado: preguntaba exactamente lo mismo que esta
            pantalla, y el código acababa fusionando las dos listas — la prueba
            de que era la misma pregunta hecha dos veces. */}
        {step === 14 && (
          <StepShell title="Qué te gusta y qué no" subtitle="Marca por grupos. Lo que pongas en «no quiero» no aparecerá en tu menú; lo que pongas en favoritos saldrá más a menudo.">
            <FoodPreferencesPanel
              athleteEmail={profile.email}
              initialLiked={prefLiked}
              initialDisliked={prefDisliked}
              allergies={allergies.split(',').map(s => s.trim()).filter(Boolean)}
              onSaveOverride={(liked, disliked) => { setPrefLiked(liked); setPrefDisliked(disliked); setSinPreferencias(false); }}
            />
            {/* «No tengo ninguna» también es una respuesta, y sin esta salida el
                paso —ahora obligatorio— sería una trampa. */}
            <Chip selected={sinPreferencias} onClick={() => setSinPreferencias(v => !v)}>
              Me da igual, como de todo
            </Chip>
          </StepShell>
        )}

        {step === 15 && (
          <StepShell title="Tus verduras habituales" subtitle="Marca las que sueles comprar. Con esto tu coach estima tus vitaminas y minerales sin tener que analizarte.">
            <VegetableSelector
              selected={vegTypes}
              onToggle={id => {
                setSinVerduras(false);
                setVegTypes(prev => alternar(prev, id));
              }}
            />
            <Chip selected={sinVerduras} onClick={() => setSinVerduras(v => !v)}>
              Ninguna en concreto
            </Chip>
          </StepShell>
        )}

        {/* Las TRES escalas de variedad (menú, desayuno y comida) estaban
            repartidas entre dos pantallas separadas por cinco pasos, así que
            parecían la misma pregunta repetida. Juntas y con etiqueta se ve que
            son tres cosas distintas. */}
        {step === 16 && (
          <StepShell title="Cómo quieres tu menú" subtitle="Cuánta variedad aguantas. No hay respuesta buena: repetir es más cómodo y más barato, variar se hace más llevadero a la larga.">
            <div>
              <p className="font-sans text-caption text-ink-2 uppercase tracking-wider mb-2">El menú en general</p>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map(n => (
                  <Chip key={n} selected={menuVariety === n} onClick={() => setMenuVariety(n)}>{n}</Chip>
                ))}
              </div>
              {menuVariety && <p className="text-body-s text-ink-2 mt-2">{NIVEL_VARIEDAD[menuVariety - 1]}</p>}
            </div>

            <div>
              <p className="font-sans text-caption text-ink-2 uppercase tracking-wider mb-2">Los desayunos</p>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map(n => (
                  <Chip key={n} selected={breakfastVariety === n} onClick={() => setBreakfastVariety(n)}>{n}</Chip>
                ))}
              </div>
              {breakfastVariety && <p className="text-body-s text-ink-2 mt-2">{NIVEL_VARIEDAD[breakfastVariety - 1]}</p>}
            </div>

            <div>
              <p className="font-sans text-caption text-ink-2 uppercase tracking-wider mb-2">Las comidas principales</p>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map(n => (
                  <Chip key={n} selected={lunchVariety === n} onClick={() => setLunchVariety(n)}>{n}</Chip>
                ))}
              </div>
              {lunchVariety && <p className="text-body-s text-ink-2 mt-2">{NIVEL_VARIEDAD[lunchVariety - 1]}</p>}
            </div>

            <div>
              <p className="font-sans text-caption text-ink-2 uppercase tracking-wider mb-1">
                Tipos de plato que quieres ver MÁS <span className="normal-case text-ink-3">(opcional)</span>
              </p>
              <p className="text-body-s text-ink-2 mb-2">Formatos de plato, no alimentos. Marca los que te apetezcan.</p>
              <div className="flex flex-wrap gap-2">
                {DISH_TYPES.map(d => (
                  <Chip key={d.id} selected={preferredDishTypes.includes(d.id)}
                    onClick={() => {
                      setPreferredDishTypes(prev => alternar(prev, d.id));
                      setExcludedDishTypes(prev => prev.filter(x => x !== d.id));
                    }}>{d.label}</Chip>
                ))}
              </div>
            </div>

            <div>
              <p className="font-sans text-caption text-ink-2 uppercase tracking-wider mb-1">
                Y los que prefieres EVITAR <span className="normal-case text-ink-3">(opcional)</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {DISH_TYPES.map(d => (
                  <Chip key={d.id} selected={excludedDishTypes.includes(d.id)}
                    onClick={() => {
                      setExcludedDishTypes(prev => alternar(prev, d.id));
                      setPreferredDishTypes(prev => prev.filter(x => x !== d.id));
                    }}>{d.label}</Chip>
                ))}
              </div>
            </div>
          </StepShell>
        )}

        {/* El batch cooking se preguntaba en el paso de Alimentación, a cinco
            pantallas de aquí: es una pregunta de cocina, y su sitio es esta. */}
        {step === 17 && (
          <StepShell title="Cómo cocinas" subtitle="Para que las recetas se ajusten a tu maña y a tu tiempo, no a un ideal.">
            <div>
              <p className="font-sans text-caption text-ink-2 uppercase tracking-wider mb-2">Tu nivel de cocina</p>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map(n => (
                  <Chip key={n} selected={cookingLevel === n} onClick={() => setCookingLevel(n)}>{n}</Chip>
                ))}
              </div>
              {cookingLevel && <p className="text-body-s text-ink-2 mt-2">{NIVEL_COCINA[cookingLevel - 1]}</p>}
            </div>

            <div>
              <p className="font-sans text-caption text-ink-2 uppercase tracking-wider mb-1">¿Cuánto tiempo puedes dedicarle a una receta?</p>
              <p className="text-body-s text-ink-2 mb-2">
                Piensa en un día entre semana, con prisa. No en el domingo.
              </p>
              <div className="flex flex-wrap gap-2">
                {[15, 30, 45, 60, 90].map(n => (
                  <Chip key={n} selected={cookingMaxTime === n} onClick={() => setCookingMaxTime(n)}>{n} min</Chip>
                ))}
              </div>
            </div>

            <div>
              <p className="font-sans text-caption text-ink-2 uppercase tracking-wider mb-1">¿Cocinas de golpe para varios días?</p>
              <p className="text-body-s text-ink-2 mb-2">
                Es lo que llaman «batch cooking»: dedicar un rato un día y dejar la semana resuelta en táperes.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Chip selected={batchCookingPreferred === true} onClick={() => setBatchCookingPreferred(true)}>Sí, prefiero eso</Chip>
                <Chip selected={batchCookingPreferred === false} onClick={() => setBatchCookingPreferred(false)}>No, cocino cada día</Chip>
              </div>
            </div>
          </StepShell>
        )}

        {/* ── BLOQUE 5 · CIERRE ─────────────────────────────────────────── */}

        {step === 18 && (
          <StepShell title="¡Todo listo! 💪" subtitle="Tu coach ya tiene lo que necesita para montar tu plan. Queda una última pregunta, y es la que más le importa.">
            <div className="bg-surface border border-accent/25 rounded-surface p-5 space-y-3">
              {[
                experienceLevel && { icon: 'fitness_center', text: EXPERIENCE.find(x => x.id === experienceLevel)?.label },
                dietType && { icon: 'restaurant', text: `${DIET_TYPES.find(d => d.id === dietType)?.label} · ${mealCount} comidas` },
                weightKg && { icon: 'monitor_weight', text: `${weightKg} kg · ${heightCm} cm` },
                activityLevel && { icon: 'directions_walk', text: ACTIVITY.find(a => a.id === activityLevel)?.label },
              ].filter(Boolean).map((i, idx) => {
                const item = i as { icon: string; text: string };
                return (
                  <p key={idx} className="flex items-center gap-3 text-body-s text-ink">
                    <Icon name={item.icon} size="m" className="text-accent" />
                    {item.text}
                  </p>
                );
              })}
            </div>
            <p className="text-body-s text-ink-2">
              ¿Te has equivocado en algo? Puedes volver atrás con el botón de abajo. Y una vez dentro,
              tu coach puede corregir cualquier dato contigo.
            </p>
          </StepShell>
        )}

        {step === 19 && (
          <StepShell title="Una última cosa" subtitle="Tómate tu tiempo con esta — es la que más le importa a tu coach.">
            <div>
              <label className="block font-sans text-caption text-ink-2 uppercase tracking-wider mb-2">
                ¿Qué esperas de tu entrenador?
              </label>
              <p className="text-body-s text-ink-2 mb-3">
                No hay respuesta corta que valga aquí. Piensa en cómo te gusta que te hablen cuando fallas,
                cuánto acompañamiento necesitas, qué te ha faltado en intentos anteriores — lo que sea que
                marque la diferencia entre un plan que sigues y uno que abandonas.
              </p>
              <textarea value={coachExpectations} onChange={e => setCoachExpectations(e.target.value)} rows={5}
                placeholder="Tómate el tiempo que necesites..." className={`${inputCls} resize-none`} />
            </div>

            {error && (
              <div className="bg-danger/7 border border-danger/24 text-danger p-3 rounded-surface text-body-s text-center">{error}</div>
            )}
          </StepShell>
        )}
        </div>
      </div>

      {/* Navegación — corrige P1-2: la jerarquía estaba invertida porque
          "Siguiente" no llevaba variant="primary" (el default de Button es
          "secondary", igual que "Atrás" — ambos pesaban lo mismo).
          `flex-none`: con la altura ahora fija al viewport, sin esto el
          `flex-1` del contenido de arriba se comería el hueco de estos
          botones en vez de dejárselo. `pb` reserva la safe area de abajo,
          igual que el resto de paneles fijos de la app. */}
      <div className="flex-none w-full max-w-lg mx-auto px-6 pt-3 pb-[calc(2.5rem+env(safe-area-inset-bottom,0px))] flex gap-3">
        {step > 0 && step < TOTAL_STEPS - 1 && (
          <Button variant="ghost" size="l" onClick={() => setStep(s => s - 1)}>Atrás</Button>
        )}
        {step < TOTAL_STEPS - 1 ? (
          <Button variant="primary" size="l" onClick={() => setStep(s => s + 1)} disabled={!stepValid()} className="flex-1">
            {step === 0 ? 'Empezar' : 'Siguiente'}
          </Button>
        ) : (
          // `disabled`: el botón final era el único que no pasaba por
          // `stepValid`, así que «¿qué esperas de tu entrenador?» —la pregunta
          // que más le importa al coach y la última del alta— se podía dejar
          // en blanco de un solo toque.
          <Button variant="primary" size="l" loading={saving} loadingLabel="Guardando"
            onClick={finish} disabled={!stepValid()} className="flex-1">
            Entrar en EN FORMA
          </Button>
        )}
      </div>
    </div>
  );
}
