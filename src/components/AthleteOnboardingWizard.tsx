import React, { useState, useEffect, useRef } from 'react';
import {
  UserProfile, OnboardingData, ExperienceLevel,
  ActivityLevel, DietType, OnboardingMeal,
} from '../types';
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

const EXPERIENCE: { id: ExperienceLevel; label: string; desc: string }[] = [
  { id: 'principiante', label: 'Principiante', desc: 'Menos de 1 año entrenando' },
  { id: 'intermedio', label: 'Intermedio', desc: '1–3 años con constancia' },
  { id: 'avanzado', label: 'Avanzado', desc: 'Más de 3 años en serio' },
];

const DIET_TYPES: { id: DietType; icon: string; label: string }[] = [
  { id: 'omnivoro', icon: 'restaurant', label: 'Omnívoro' },
  { id: 'vegetariano', icon: 'eco', label: 'Vegetariano' },
  { id: 'vegano', icon: 'psychiatry', label: 'Vegano' },
  { id: 'otro', icon: 'help', label: 'Otro' },
];

const ACTIVITY: { id: ActivityLevel; label: string; desc: string }[] = [
  { id: 'sedentario', label: 'Sedentario', desc: 'Trabajo sentado, poco movimiento' },
  { id: 'poco_activo', label: 'Poco activo', desc: 'Algo de movimiento diario' },
  { id: 'activo', label: 'Activo', desc: 'En movimiento gran parte del día' },
  { id: 'muy_activo', label: 'Muy activo', desc: 'Trabajo físico o mucho deporte' },
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
  hadPastInjuries: boolean;
  pastInjuriesDetail: string;
  takesMedication: boolean;
  medicationDetail: string;
  recentSurgery: boolean;
  recentSurgeryDetail: string;
  dietType: DietType | '';
  mealCount: number | null;
  menuVariety: number;
  batchCookingPreferred: boolean;
  allergies: string;
  dislikedFoods: string;
  meals: OnboardingMeal[];
  cookingLevel: number;
  cookingMaxTime: number;
  prefLiked: string[];
  prefDisliked: string[];
  vegTypes: string[];
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
  const [hadPastInjuries, setHadPastInjuries] = useState(borrador?.hadPastInjuries ?? false);
  const [pastInjuriesDetail, setPastInjuriesDetail] = useState(borrador?.pastInjuriesDetail ?? '');
  const [takesMedication, setTakesMedication] = useState(borrador?.takesMedication ?? false);
  const [medicationDetail, setMedicationDetail] = useState(borrador?.medicationDetail ?? '');
  const [recentSurgery, setRecentSurgery] = useState(borrador?.recentSurgery ?? false);
  const [recentSurgeryDetail, setRecentSurgeryDetail] = useState(borrador?.recentSurgeryDetail ?? '');
  const [dietType, setDietType] = useState<DietType | ''>(borrador?.dietType ?? '');
  const [mealCount, setMealCount] = useState<number | null>(borrador?.mealCount ?? null);
  const [menuVariety, setMenuVariety] = useState<number>(borrador?.menuVariety ?? 3);
  const [batchCookingPreferred, setBatchCookingPreferred] = useState(borrador?.batchCookingPreferred ?? false);
  const [allergies, setAllergies] = useState(borrador?.allergies ?? '');
  const [dislikedFoods, setDislikedFoods] = useState(borrador?.dislikedFoods ?? '');
  const [meals, setMeals] = useState<OnboardingMeal[]>(borrador?.meals ?? []);
  const [cookingLevel, setCookingLevel] = useState(borrador?.cookingLevel ?? 3);
  const [cookingMaxTime, setCookingMaxTime] = useState(borrador?.cookingMaxTime ?? 45);
  const [prefLiked, setPrefLiked] = useState<string[]>(borrador?.prefLiked ?? []);
  const [prefDisliked, setPrefDisliked] = useState<string[]>(borrador?.prefDisliked ?? []);
  const [vegTypes, setVegTypes] = useState<string[]>(borrador?.vegTypes ?? []);
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
      dietType, mealCount, menuVariety, batchCookingPreferred, allergies, dislikedFoods,
      meals, cookingLevel, cookingMaxTime, prefLiked, prefDisliked, vegTypes,
      activityLevel,
    });
  }, [saving, enviado, profile.email, step, sex, birthDate, weightKg, heightCm, occupation, referralSource,
      goalFreeText, goalTimelineMotivation, coachExpectations, experienceLevel, equipment, injuries, noInjuries,
      hadPastInjuries, pastInjuriesDetail, takesMedication, medicationDetail, recentSurgery, recentSurgeryDetail,
      dietType, mealCount, menuVariety, batchCookingPreferred, allergies, dislikedFoods,
      meals, cookingLevel, cookingMaxTime, prefLiked, prefDisliked, vegTypes, activityLevel]);

  const firstName = (profile.displayName || 'atleta').split(' ')[0];

  // Validación por paso: el atleta no avanza sin responder lo obligatorio. Los
  // pasos nuevos (14-08: datos personales, salud, comidas, cocina,
  // preferencias, verduras) son todos opcionales a propósito — nada de eso
  // bloquea el alta, el coach lo completa si falta.
  const stepValid = (): boolean => {
    switch (step) {
      case 1: return !!sex && !!birthDate && Number(weightKg) >= 30 && Number(heightCm) >= 100;
      case 4: return !!experienceLevel && (noInjuries || injuries.trim().length > 0);
      case 6: return !!dietType && mealCount != null;
      case 11: return !!activityLevel;
      default: return true;
    }
  };

  // 0 bienvenida, 1 sobre ti, 2 datos personales, 3 objetivo, 4 entrenamiento,
  // 5 salud, 6 alimentación, 7 comidas, 8 cocina, 9 preferencias alimentarias,
  // 10 verduras habituales, 11 día a día, 12 resumen, 13 qué esperas de tu coach.
  const TOTAL_STEPS = 14;

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
      // 14-08. `dislikedFoods` mezcla dos fuentes: el texto libre del paso de
      // Alimentación (rápido de escribir, no exige elegir de un catálogo) y
      // las categorías concretas marcadas en Preferencias alimentarias
      // (FoodPreferencesPanel, catálogo de FOOD_GROUPS). Son complementarias,
      // no duplicadas — se juntan sin perder ninguna.
      const dislikedFoodsTexto = dislikedFoods.split(',').map(s => s.trim()).filter(Boolean);
      const dislikedFoodsFinal = [...new Set([...dislikedFoodsTexto, ...prefDisliked])];
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
        hadPastInjuries,
        pastInjuriesDetail: hadPastInjuries ? (pastInjuriesDetail.trim() || undefined) : undefined,
        takesMedication,
        medicationDetail: takesMedication ? (medicationDetail.trim() || undefined) : undefined,
        recentSurgery,
        recentSurgeryDetail: recentSurgery ? (recentSurgeryDetail.trim() || undefined) : undefined,
        dietType: (dietType || 'omnivoro') as DietType,
        targetCalories: auto ? auto.kcal : undefined,
        macroSplit: auto
          ? { hc: auto.hcPct, prot: auto.protPct, grasa: auto.grasaPct }
          : undefined,
        macroGrams: auto
          ? { hc: auto.hcG, prot: auto.protG, grasa: auto.grasaG }
          : undefined,
        likedFoods: prefLiked,
        dislikedFoods: dislikedFoodsFinal,
        allergies: allergies.split(',').map(s => s.trim()).filter(Boolean),
        mealCount: mealCount ?? undefined,
        meals: meals.length > 0 ? meals : undefined,
        cookingLevel,
        cookingMaxTime,
        menuVariety,
        batchCookingPreferred,
        equipment,
        favoriteExercises: [],
        hatedExercises: [],
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
      <div ref={contentRef} className="flex-1 min-h-0 overflow-y-auto w-full max-w-lg mx-auto px-6 py-8 flex flex-col justify-center" key={step}>
        {step === 0 && (
          <StepShell title={`¡Hola, ${firstName}! 👋`} subtitle="Bienvenido a tu nuevo entrenamiento. Antes de empezar, necesitamos conocerte bien: tómate tu tiempo, tu coach usará todo esto para montar tu plan a medida.">
            {/* VIDEO_SLOT: aquí irá el vídeo corto de bienvenida de Dani.
                <video src="..." controls poster="..." className="rounded-surface w-full" /> */}
            <div className="bg-surface border border-hairline rounded-surface p-5 space-y-3">
              {[
                { icon: 'person', text: 'Cuéntanos sobre ti y tu objetivo' },
                { icon: 'fitness_center', text: 'Tu experiencia y tu material' },
                { icon: 'health_and_safety', text: 'Tu salud, para entrenarte seguro' },
                { icon: 'restaurant', text: 'Cómo comes, cocinas y qué evitas' },
              ].map(i => (
                <p key={i.icon} className="flex items-center gap-3 text-body-s text-ink">
                  <Icon name={i.icon} size="m" className="text-accent" />
                  {i.text}
                </p>
              ))}
            </div>
          </StepShell>
        )}

        {step === 1 && (
          <StepShell title="Sobre ti" subtitle="Lo básico para calcular tus necesidades.">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <Chip selected={sex === 'male'} onClick={() => setSex('male')}>Hombre</Chip>
                <Chip selected={sex === 'female'} onClick={() => setSex('female')}>Mujer</Chip>
              </div>
              <div>
                <label className="block font-mono text-caption text-ink-2 uppercase tracking-wider mb-2">Fecha de nacimiento</label>
                <input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-mono text-caption text-ink-2 uppercase tracking-wider mb-2">Peso (kg)</label>
                  <input type="number" min={30} max={250} step={0.1} value={weightKg} onChange={e => setWeightKg(e.target.value)} placeholder="75" className={inputCls} />
                </div>
                <div>
                  <label className="block font-mono text-caption text-ink-2 uppercase tracking-wider mb-2">Altura (cm)</label>
                  <input type="number" min={100} max={250} value={heightCm} onChange={e => setHeightCm(e.target.value)} placeholder="175" className={inputCls} />
                </div>
              </div>
            </div>
          </StepShell>
        )}

        {step === 2 && (
          <StepShell title="Sobre ti (II)" subtitle="Un par de cosas más para conocerte.">
            <Input
              label="¿A qué te dedicas?"
              hint="Opcional."
              value={occupation}
              onChange={setOccupation}
              placeholder="Ej: profesor, comercial…"
            />
            <Input
              label="¿Cómo nos has conocido?"
              hint="Opcional."
              value={referralSource}
              onChange={setReferralSource}
              placeholder="Ej: Instagram, recomendación…"
            />
          </StepShell>
        )}

        {step === 3 && (
          <StepShell title="Tu objetivo" subtitle="Esto es lo que más ayuda a tu coach a montarte el plan — tómate un momento.">
            <div>
              <label className="block font-sans text-caption text-ink-2 uppercase tracking-wider mb-2">
                ¿Para cuándo lo quieres? ¿Hay algo detrás — una fecha, un evento, un motivo?
              </label>
              <textarea value={goalTimelineMotivation} onChange={e => setGoalTimelineMotivation(e.target.value)} rows={3}
                placeholder="Ej: en 4 meses tengo una boda; o simplemente estoy cansado de sentirme así"
                className={`${inputCls} resize-none`} />
            </div>
            <div>
              <label className="block font-sans text-caption text-ink-2 uppercase tracking-wider mb-2">
                Descríbelo con tus palabras: ¿cómo te ves o te sientes cuando lo consigas?
              </label>
              <textarea value={goalFreeText} onChange={e => setGoalFreeText(e.target.value)} rows={3}
                placeholder="Ej: me veo con más energía, con la ropa que quiero ponerme, sin agobiarme al subir escaleras"
                className={`${inputCls} resize-none`} />
            </div>
          </StepShell>
        )}

        {step === 4 && (
          <StepShell title="Tu entrenamiento" subtitle="Para ajustar el plan a tu nivel.">
            <div className="space-y-3">
              {EXPERIENCE.map(x => (
                <Chip key={x.id} big selected={experienceLevel === x.id} onClick={() => setExperienceLevel(x.id)}>
                  <span className="block font-bold text-white">{x.label}</span>
                  <span className="block text-label text-ink-2">{x.desc}</span>
                </Chip>
              ))}
            </div>
            <div>
              <p className="font-sans text-caption text-ink-2 uppercase tracking-wider mb-2">¿Lesiones o molestias actuales?</p>
              <div className="space-y-2">
                <Chip selected={noInjuries} onClick={() => { setNoInjuries(v => !v); if (!noInjuries) setInjuries(''); }}>
                  No tengo lesiones
                </Chip>
                {!noInjuries && (
                  <textarea value={injuries} onChange={e => setInjuries(e.target.value)} rows={2}
                    placeholder="Ej: molestia en hombro derecho al hacer press" className={`${inputCls} resize-none`} />
                )}
              </div>
            </div>
          </StepShell>
        )}

        {step === 5 && (
          <StepShell title="Salud" subtitle="Para que tu coach entrene y programe tu dieta con seguridad.">
            <div>
              <p className="font-sans text-caption text-ink-2 uppercase tracking-wider mb-2">¿Lesiones anteriores? (ya curadas)</p>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Chip selected={hadPastInjuries} onClick={() => setHadPastInjuries(true)}>Sí</Chip>
                  <Chip selected={!hadPastInjuries} onClick={() => { setHadPastInjuries(false); setPastInjuriesDetail(''); }}>No</Chip>
                </div>
                {hadPastInjuries && (
                  <input value={pastInjuriesDetail} onChange={e => setPastInjuriesDetail(e.target.value)}
                    placeholder="¿Cuál?" className={inputCls} />
                )}
              </div>
            </div>
            <div>
              <p className="font-sans text-caption text-ink-2 uppercase tracking-wider mb-2">¿Tomas algún medicamento o fármaco?</p>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Chip selected={takesMedication} onClick={() => setTakesMedication(true)}>Sí</Chip>
                  <Chip selected={!takesMedication} onClick={() => { setTakesMedication(false); setMedicationDetail(''); }}>No</Chip>
                </div>
                {takesMedication && (
                  <input value={medicationDetail} onChange={e => setMedicationDetail(e.target.value)}
                    placeholder="¿Cuál?" className={inputCls} />
                )}
              </div>
            </div>
            <div>
              <p className="font-sans text-caption text-ink-2 uppercase tracking-wider mb-2">¿Cirugía reciente?</p>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Chip selected={recentSurgery} onClick={() => setRecentSurgery(true)}>Sí</Chip>
                  <Chip selected={!recentSurgery} onClick={() => { setRecentSurgery(false); setRecentSurgeryDetail(''); }}>No</Chip>
                </div>
                {recentSurgery && (
                  <input value={recentSurgeryDetail} onChange={e => setRecentSurgeryDetail(e.target.value)}
                    placeholder="¿Cuál?" className={inputCls} />
                )}
              </div>
            </div>
          </StepShell>
        )}

        {step === 6 && (
          <StepShell title="Tu alimentación" subtitle="Tu coach montará la dieta respetando esto.">
            <div className="grid grid-cols-2 gap-2">
              {DIET_TYPES.map(d => (
                <Chip key={d.id} selected={dietType === d.id} onClick={() => setDietType(d.id)}>
                  <span className="flex items-center gap-2">
                    <Icon name={d.icon} size="m" />
                    {d.label}
                  </span>
                </Chip>
              ))}
            </div>
            <div>
              <p className="font-sans text-caption text-ink-2 uppercase tracking-wider mb-2">¿Cuántas comidas al día prefieres?</p>
              <div className="flex gap-2">
                {[3, 4, 5].map(n => (
                  <Chip key={n} selected={mealCount === n} onClick={() => setMealCount(n)}>{n} comidas</Chip>
                ))}
              </div>
            </div>
            <div>
              <p className="font-sans text-caption text-ink-2 uppercase tracking-wider mb-2">Cuando tu coach te prepare un menú, ¿lo prefieres variado o más sencillo de repetir?</p>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map(n => (
                  <Chip key={n} selected={menuVariety === n} onClick={() => setMenuVariety(n)}>{n}</Chip>
                ))}
              </div>
              <div className="flex justify-between mt-1">
                <span className="font-sans text-caption text-ink-3">Repetitivo, sencillo</span>
                <span className="font-mono text-caption text-ink-3">Muy variado</span>
              </div>
            </div>
            <div>
              <p className="font-sans text-caption text-ink-2 uppercase tracking-wider mb-2">¿Prefieres cocinar todo de una vez para la semana (batch cooking)?</p>
              <div className="flex gap-2">
                <Chip selected={batchCookingPreferred} onClick={() => setBatchCookingPreferred(true)}>Sí, cocino de golpe</Chip>
                <Chip selected={!batchCookingPreferred} onClick={() => setBatchCookingPreferred(false)}>No, cocino cada día</Chip>
              </div>
            </div>
            <Input
              label="Alergias o intolerancias"
              hint="Separa por comas, o déjalo vacío."
              value={allergies}
              onChange={setAllergies}
              placeholder="Ej: lactosa, frutos secos"
            />
            <Input
              label="Alimentos que NO quieres ver en tu dieta"
              value={dislikedFoods}
              onChange={setDislikedFoods}
              placeholder="Ej: pescado azul, coliflor"
            />
          </StepShell>
        )}

        {step === 7 && (
          <StepShell title="Tus comidas" subtitle="¿Cuáles necesitas llevar preparadas, en tupper?">
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
          </StepShell>
        )}

        {step === 8 && (
          <StepShell title="Cómo cocinas" subtitle="Para que las recetas de tu menú se ajusten a tu maña y tu tiempo.">
            <div>
              <p className="font-sans text-caption text-ink-2 uppercase tracking-wider mb-2">Nivel de cocina</p>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map(n => (
                  <Chip key={n} selected={cookingLevel === n} onClick={() => setCookingLevel(n)}>{n}</Chip>
                ))}
              </div>
              <div className="flex justify-between mt-1">
                <span className="font-sans text-caption text-ink-3">Básico (hervir agua)</span>
                <span className="font-mono text-caption text-ink-3">Chef avanzado</span>
              </div>
            </div>
            <div>
              <p className="font-sans text-caption text-ink-2 uppercase tracking-wider mb-2">Tiempo máximo por receta</p>
              <div className="flex flex-wrap gap-2">
                {[15, 30, 45, 60, 90].map(n => (
                  <Chip key={n} selected={cookingMaxTime === n} onClick={() => setCookingMaxTime(n)}>{n} min</Chip>
                ))}
              </div>
            </div>
          </StepShell>
        )}

        {step === 9 && (
          <StepShell title="Preferencias alimentarias" subtitle="Marca lo que te encanta y lo que no quieres ver en tu menú.">
            <FoodPreferencesPanel
              athleteEmail={profile.email}
              initialLiked={prefLiked}
              initialDisliked={prefDisliked}
              allergies={allergies.split(',').map(s => s.trim()).filter(Boolean)}
              onSaveOverride={(liked, disliked) => { setPrefLiked(liked); setPrefDisliked(disliked); }}
            />
          </StepShell>
        )}

        {step === 10 && (
          <StepShell title="Tus verduras habituales" subtitle="Así tu coach afina la estimación de vitaminas y minerales.">
            <VegetableSelector
              selected={vegTypes}
              onToggle={id => setVegTypes(prev => prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id])}
            />
          </StepShell>
        )}

        {step === 11 && (
          <StepShell title="Tu día a día" subtitle="Fuera del entrenamiento, ¿cómo te mueves?">
            <div className="space-y-3">
              {ACTIVITY.map(a => (
                <Chip key={a.id} big selected={activityLevel === a.id} onClick={() => setActivityLevel(a.id)}>
                  <span className="block font-bold text-white">{a.label}</span>
                  <span className="block text-label text-ink-2">{a.desc}</span>
                </Chip>
              ))}
            </div>
          </StepShell>
        )}

        {step === 12 && (
          <StepShell title="¡Todo listo! 💪" subtitle="Tu coach ya tiene lo que necesita para montar tu plan. Ahora te enseñamos la app en 1 minuto.">
            <div className="bg-surface border border-accent/25 rounded-surface p-5 space-y-3">
              {[
                experienceLevel && { icon: 'fitness_center', text: EXPERIENCE.find(x => x.id === experienceLevel)?.label },
                dietType && { icon: 'restaurant', text: `${DIET_TYPES.find(d => d.id === dietType)?.label} · ${mealCount} comidas` },
                weightKg && { icon: 'monitor_weight', text: `${weightKg} kg · ${heightCm} cm` },
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
          </StepShell>
        )}

        {step === 13 && (
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
          <Button variant="primary" size="l" loading={saving} loadingLabel="Guardando" onClick={finish} className="flex-1">
            Entrar en EN FORMA
          </Button>
        )}
      </div>
    </div>
  );
}
