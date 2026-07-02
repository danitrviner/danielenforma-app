// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────

export type NotificationType =
  | 'checkin_submitted'
  | 'questionnaire_submitted'
  | 'nutrition_phase_change'
  | 'plan_expiring'
  | 'checkin_late';

export interface AppNotification {
  id: string;                   // deterministic dedup key
  recipientEmail: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;               // tab to navigate to on click
  createdAt: string;           // ISO string
  read: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────

export interface UserProfile {
  userId: string;
  email: string;
  displayName: string;
  role: 'client' | 'coach';
  avatarUrl: string;
  level: number;
  xp: number;
  currentStreak: number;
  maxStreak: number;
  initialWeight: number;
  targetWeight: number;
  actualWeight: number;
  planStartDate?: string;       // ISO YYYY-MM-DD set by coach
  planDurationMonths?: 3 | 6 | 12;
}

export interface WeightCheckIn {
  id: string;
  userId: string;
  email: string;
  timestamp: Date;
  dateStr: string; // "12 Oct" or standard format
  weight: number;
  mood: string; // 😩, 😴, 😐, 😊, 🔥
  adherence: 'Sí' | 'Parcial' | 'No';
  notes: string;
  coachFeedback?: string; // written by coach
  approved?: boolean;
  approvedAt?: Date;
}

export type FoodCategory = 'HC' | 'PROT' | 'GRASA' | 'MIX_HC' | 'MIX_GRASA';
export type DietMode = 'OMNIVORO' | 'VEGANO' | 'SIN_PESAR';

export interface MealItem {
  id: string;
  mode: DietMode;
  category: FoodCategory;
  label: string; // texto completo "1 intercambio = ..."
}

export interface AthleteNutritionConfig {
  athleteId: string; // email
  enabledModes: DietMode[];
  stepGoal?: number;      // daily step target set by the coach
  kcalPerStep?: number;   // configurable conversion rate; falls back to DEFAULT_KCAL_PER_STEP when unset
  // AI dashboard "share with athlete" — private by default, only set when the coach shares a snapshot
  sharedReportSnapshot?: { generatedAt: string; summary: string; flags: string[] };
}

export interface Exercise {
  id: string;
  ownerId: string;
  name: string;
  primaryFocus: string;      // legacy free-form label
  muscleGroup?: MuscleGroup; // typed macrocycle key (optional; old docs lack it)
  type: 'fuerza' | 'cardio' | 'estiramiento' | 'pliometría';
  enduranceProfile?: 'ascendente' | 'campana' | 'descendente'; // curva de esfuerzo a lo largo de la serie
  equipment?: string[];      // material necesario; undefined/empty = siempre disponible
  videoUrl?: string;
  imageUrl?: string;
  instructions?: string;     // descripción global — visible para cualquier atleta
  isCustom: boolean;
}

// Observación personalizada de un ejercicio, visible únicamente para un atleta concreto
// (distinta de `Exercise.instructions`, que es la descripción global). Doc ID determinista
// `${exerciseId}_${athleteId}` — evita duplicados y permite getDoc directo sin query.
export interface ExercisePersonalNote {
  id: string;
  exerciseId: string;
  athleteId: string; // email
  observation: string;
  updatedAt: string; // ISO timestamp
}

export interface WorkoutExercise {
  exerciseId: string;
  order: number;
  sets: number;
  reps: string;        // "8-10", "AMRAP", "12", etc.
  restSeconds: number;
  rir: number;         // reps in reserve (0-5)
  notes?: string;
  muscleGroup?: MuscleGroup;
}

export interface TemplateDay {
  id: string;
  name: string;
  exercises: WorkoutExercise[];
}

export interface TemplateStage {
  id: string;
  name: string;
  weeks: number;
  daysPerWeek: number;
  groups: Record<MuscleGroup, MuscleGroupConfig>;
  days?: TemplateDay[];
}

export interface Workout {
  id: string;
  ownerId: string;
  name: string;
  tags?: string[];
  exercises: WorkoutExercise[];
  mesocycleId?: string;
}

export interface WorkoutSetLog {
  weight: number;   // kg lifted
  repsDone: number; // actual reps completed
  rir: number;      // perceived reps in reserve
}

export interface WorkoutEntryLog {
  exerciseId: string;
  sets: WorkoutSetLog[];
  note?: string;         // athlete's note on this specific exercise
  noteCoachSeen?: boolean;
}

export interface WorkoutLog {
  id: string;
  athleteId: string;
  workoutId: string;
  assignmentId: string;
  mesocycleId?: string; // resolved from assignment at creation time; older logs may lack it
  date: string;        // YYYY-MM-DD
  completedAt: string; // ISO timestamp string
  entries: WorkoutEntryLog[];
  note?: string;         // athlete's note on the workout as a whole
  noteCoachSeen?: boolean;
}

export interface WorkoutAssignment {
  id: string;
  workoutId: string;
  athleteId: string;
  date: string;
  status: 'pending' | 'completed' | 'skipped' | 'perdido';
  mesocycleId?: string;
}

// ─── QUESTIONNAIRES ───────────────────────────────────────────────────────────

export type QuestionType = 'numeric' | 'scale' | 'choice' | 'text' | 'boolean';

export type QScheduleType = 'once' | 'weekdays' | 'interval' | 'monthly';

export interface QSchedule {
  type: QScheduleType;
  weekdays?: number[];    // 0=Sun..6=Sat  (for 'weekdays')
  intervalDays?: number;  // (for 'interval')
  dayOfMonth?: number;    // (for 'monthly')
}

export interface QuestionnaireQuestion {
  id: string;
  label: string;
  type: QuestionType;
  required: boolean;
  helpText?: string;
  graphable?: boolean;       // auto-true for numeric/scale; used in R2 charts
  // numeric
  unit?: string;
  min?: number;
  max?: number;
  decimals?: number;
  // scale
  scaleMin?: number;         // default 1
  scaleMax?: number;         // default 10
  scaleMinLabel?: string;
  scaleMaxLabel?: string;
  // choice
  options?: string[];
  multiSelect?: boolean;
  // text
  maxChars?: number;
  // boolean
  labelTrue?: string;        // default 'Sí'
  labelFalse?: string;       // default 'No'
}

export interface Questionnaire {
  id: string;
  ownerId: string;   // coachUid
  title: string;
  description?: string;
  questions: QuestionnaireQuestion[];
}

export interface QuestionnaireAssignment {
  id: string;
  questionnaireId: string;
  athleteId: string;           // email
  schedule: QSchedule;
  startDate: string;           // YYYY-MM-DD
  active: boolean;
  createdAt: string;
}

export interface QuestionnaireResponse {
  id: string;
  questionnaireId: string;
  assignmentId: string;
  athleteId: string;           // email
  submittedAt: string;
  answers: { questionId: string; value: string | number | boolean }[];
}

// ─── BODYWEIGHT ───────────────────────────────────────────────────────────────

export interface BodyweightLog {
  id: string;
  athleteId: string;  // email
  date: string;       // YYYY-MM-DD
  weight: number;
  createdAt: string;  // ISO timestamp
}

// Kept separate from BodyweightLog so step tracking never has to carry a
// placeholder weight value — manual entry until Fase 3 wires up Apple Health /
// Google Health Connect (see AthleteNutritionConfig.stepGoal for the target).
export interface StepLog {
  id: string;
  athleteId: string;  // email
  date: string;       // YYYY-MM-DD
  steps: number;
  source: 'manual' | 'apple_health' | 'google_health_connect';
  createdAt: string;  // ISO timestamp
}

// ─── ONBOARDING ──────────────────────────────────────────────────────────────

export type DietType        = 'omnivoro' | 'vegano' | 'vegetariano' | 'otro';
export type ExperienceLevel = 'principiante' | 'intermedio' | 'avanzado';
export type ActivityLevel   = 'sedentario' | 'poco_activo' | 'activo' | 'muy_activo';
export type GoalBody        = 'aumentar_musculo' | 'reducir_grasa' | 'mantener';
export type GoalCapacity    = 'fuerza' | 'fuerza_resistencia' | 'salud';

export interface OnboardingMeal {
  intakeType:  number;    // 1=Desayuno 2=Media 3=Comida 4=Merienda 5=Cena
  name:        string;
  needsTupper: boolean;
}

export interface MacroSplit { hc: number; prot: number; grasa: number }
export interface MacroGrams { hc: number; prot: number; grasa: number }

export interface OnboardingData {
  athleteId:          string;         // email
  // ── Composición corporal ──────────────────────────────────────────────────
  sex?:               'male' | 'female';
  birthDate?:         string;         // YYYY-MM-DD
  weightKg?:          number;
  heightCm?:          number;
  bodyFatPct?:        number;
  musclePct?:         number;
  // ── Actividad ─────────────────────────────────────────────────────────────
  activityLevel?:     ActivityLevel;
  // ── Objetivo ──────────────────────────────────────────────────────────────
  goalBody?:          GoalBody;
  goalCapacity?:      GoalCapacity;
  // ── Nutrición ─────────────────────────────────────────────────────────────
  dietType:           DietType;
  targetCalories:     number;
  macroSplit:         MacroSplit;     // percentages (hc+prot+grasa = 100)
  macroGrams:         MacroGrams;     // computed grams/day
  // ── Alimentos ─────────────────────────────────────────────────────────────
  likedFoods:         string[];
  dislikedFoods:      string[];
  allergies:          string[];
  // ── Comidas ───────────────────────────────────────────────────────────────
  mealCount?:         number;         // 3 | 4 | 5
  meals?:             OnboardingMeal[];
  // ── Cocina ────────────────────────────────────────────────────────────────
  cookingLevel?:      number;         // 1–5
  cookingMaxTime?:    number;         // minutes
  breakfastVariety?:  number;         // 1–5
  lunchVariety?:      number;         // 1–5
  // ── Entrenamiento ─────────────────────────────────────────────────────────
  equipment:          string[];
  favoriteExercises:  string[];
  hatedExercises:     string[];
  experienceLevel:    ExperienceLevel;
  injuries:           string;
  // ── Meta ──────────────────────────────────────────────────────────────────
  completedAt:        string;         // ISO timestamp
  extraAnswers?:      Record<string, string | number>;
}

export type OnboardingSection = 'entrenamiento' | 'nutricion' | 'descanso';

export interface OnboardingTemplateQuestion {
  id: string;
  label: string;
  section: OnboardingSection;
  type: 'numeric' | 'scale' | 'choice' | 'text';
  options?: string[];
  unit?: string;
  scaleMin?: number;
  scaleMax?: number;
}

export interface OnboardingTemplate {
  coachEmail: string;
  questions: OnboardingTemplateQuestion[];
}

// ─── DIET ─────────────────────────────────────────────────────────────────────

export interface DietItem {
  category: FoodCategory;
  foodLabel: string;
  quantity: number;   // multiples of 0.25 (e.g. 0.25, 0.5, 1, 1.25)
  grams?: number;     // computed: parsed base weight × quantity
  originRecipeId?: string; // set when the item was added via "Usar receta" — scopes "Cambiar comida"
}

export interface DietMeal {
  id: string;
  name: string;
  items: DietItem[];
  target?: Record<FoodCategory, number>; // per-meal exchange targets (optional, set by coach)
}

export interface Diet {
  id: string;
  athleteId: string;  // email
  name: string;
  budget: Record<FoodCategory, number>; // total exchanges per category for the day
  meals: DietMeal[];
  coachNote?: string;
  coachVideoUrl?: string;
  isDraft?: boolean;
  selfManaged?: boolean; // true = created by the athlete in "Mis Dietas", private to them
}

export type WeekDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface AthleteDietConfig {
  athleteId: string;        // email
  activeDietIds: string[];  // which of their diets are enabled in the tracker
  weeklySchedule?: Partial<Record<WeekDay, string | null>>; // day → dietId or null (libre)
}

// Doc id = `${athleteId}_${date}`. One log per athlete per day; doneItemIds keys
// match NutritionScreen's in-memory item keys (`${mealId}_${itemIdx}`) so the
// persisted state can be loaded straight into the existing itemStates shape.
export interface DietCompletionLog {
  id: string;
  athleteId: string;  // email
  date: string;        // YYYY-MM-DD
  dietId: string;
  doneItemIds: string[];
}

export interface NutritionPhase {
  id: string;
  name: string;
  weeks: number;
  dietId: string;
  targetWeight?: number; // kg at end of phase; undefined = not projected
}

export interface NutritionProgram {
  athleteId: string;          // email, also the Firestore doc id
  startDate: string;          // YYYY-MM-DD
  phases: NutritionPhase[];
  lastSeenPhaseId?: string;   // tracks when athlete saw the phase change banner
}

export interface RoadmapItem {
  id: string;
  title: string;
  description?: string;
  type: 'objetivo' | 'hito' | 'nota';
  lane: 'entreno' | 'nutricion' | 'movilidad' | 'general';
  startDate?: string;   // YYYY-MM-DD
  targetDate?: string;  // YYYY-MM-DD
  status?: 'pendiente' | 'en_progreso' | 'logrado';
}

export interface Roadmap {
  athleteId: string;    // email, also Firestore doc id
  items: RoadmapItem[];
}

export type PhotoView = 'front' | 'side' | 'back';

export interface ProgressPhoto {
  id: string;          // `${athleteId}_${date}_${view}`
  athleteId: string;   // email
  date: string;        // YYYY-MM-DD
  view: PhotoView;
  url: string;
  uploadedAt: string;  // ISO timestamp
}

export interface PhotoAssignment {
  id: string;
  athleteId: string;   // email
  schedule: QSchedule;
  startDate: string;   // YYYY-MM-DD
  views: PhotoView[];  // which views must be uploaded per occurrence
  active: boolean;
  createdAt: string;
}

export interface RecipeIngredient {
  foodLabel: string;
  category: FoodCategory;
  mode: DietMode;
  quantity: number; // multiples of 0.25
}

export interface IndyaIngredient {
  name: string;
  quantity: number; // grams or units
}

export interface IndyaStep {
  position: number;
  description: string;
}

export interface Recipe {
  id: string;
  ownerId: string;    // Firebase UID | 'indya'
  name: string;
  photoUrl?: string;
  // ── Coach / athlete builder ───────────────────────────────────────────────
  categories: string[];
  ingredients: RecipeIngredient[];
  extras: string[];
  steps: string[];
  // ── Indya-only fields (all optional) ────────────────────────────────────
  image?: string;
  ingredientsText?: IndyaIngredient[];
  stepsText?: IndyaStep[];
  macros?: { carb: number; prot: number; fat: number };
  kcal?: number;
  weight?: number;
  cookingTime?: number;
  difficulty?: number;
  tupper?: boolean;
  intakeTypes?: number[];
  categoria?: string;
  exchanges?: { HC: number; PROT: number; GRASA: number };
}

export interface RecipeFavorites {
  athleteId: string; // email
  recipeIds: string[];
}

// ─── MESOCYCLE ────────────────────────────────────────────────────────────────

export type MuscleGroup =
  | 'pecho' | 'dorsal' | 'trapecio'
  | 'deltoide_ant' | 'deltoide_lat' | 'deltoide_post'
  | 'biceps' | 'triceps' | 'antebrazo'
  | 'cuadriceps' | 'isquios' | 'gluteo' | 'gemelo' | 'core';

export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  pecho:         'Pecho',
  dorsal:        'Dorsal',
  trapecio:      'Trapecio',
  deltoide_ant:  'Deltoides ant.',
  deltoide_lat:  'Deltoides lat.',
  deltoide_post: 'Deltoides post.',
  biceps:        'Bíceps',
  triceps:       'Tríceps',
  antebrazo:     'Antebrazo',
  cuadriceps:    'Cuádriceps',
  isquios:       'Isquiotibiales',
  gluteo:        'Glúteo',
  gemelo:        'Gemelo',
  core:          'Core',
};

export interface MuscleGroupConfig {
  series: number;          // 0..25 series semanales
  priority: 'alta' | 'media' | 'baja';
}

export interface DayAssignment {
  group: MuscleGroup;
  series: number;
}

export interface DayPlan {
  assignments: DayAssignment[];
  totalSeries: number;
}

export interface WeekDistribution {
  days: DayPlan[];
  overloadAlert: boolean;
  snapshot: {
    daysPerWeek: number;
    groupSeries: Partial<Record<MuscleGroup, number>>;
  };
  generatedAt: string;
}

export interface Mesocycle {
  id: string;
  athleteId: string;
  number: number;
  weeks: number;
  startDate: string;
  objective: string;
  daysPerWeek: number;
  groups: Record<MuscleGroup, MuscleGroupConfig>;
  distribution?: WeekDistribution;
  days?: TemplateDay[];
  programId?: string;      // links mesocycles created from the same template
  programOrder?: number;   // position in the sequence (0-based)
}

export interface MesocycleTemplate {
  id: string;
  ownerId: string;
  name: string;
  description?: string;
  stages: TemplateStage[];
}

// ─── PENDING TASKS (athlete dashboard) ─────────────────────────────────────────
// Generic task feed for the "Tareas pendientes" dashboard block. New task types
// (e.g. future integrations) just add a TaskType value + a case in the renderer's
// icon/color map — no change needed to the aggregation or storage shape.

export type TaskType = 'revision' | 'cuestionario' | 'foto' | 'manual' | 'otro';

export interface TaskItem {
  id: string;
  athleteId: string;      // email
  type: TaskType;
  title: string;
  dueDate?: string;       // YYYY-MM-DD
  status: 'pending' | 'done';
  linkTab?: 'checkin' | 'training' | 'nutrition' | 'roadmap';
  createdBy: 'system' | 'coach';
  createdAt: string;      // ISO timestamp
}

// ─── RESOURCES (coach-shared files/links) ──────────────────────────────────────

export type ResourceKind = 'pdf' | 'video' | 'image' | 'doc' | 'link' | 'guide';

export interface Resource {
  id: string;
  coachId: string;
  title: string;
  kind: ResourceKind;
  url: string;
  createdAt: string; // ISO timestamp
}
