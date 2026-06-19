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
}

export interface Exercise {
  id: string;
  ownerId: string; // 'system' for preloaded, coachId for custom
  name: string;
  primaryFocus: string; // muscle group: 'pecho', 'espalda', etc.
  type: 'fuerza' | 'cardio' | 'estiramiento' | 'pliometría';
  level: 'principiante' | 'intermedio' | 'avanzado';
  videoUrl?: string;
  imageUrl?: string;
  instructions?: string;
  isCustom: boolean;
}

export interface WorkoutExercise {
  exerciseId: string;
  order: number;
  sets: number;
  reps: string;        // "8-10", "AMRAP", "12", etc.
  restSeconds: number;
  rir: number;         // reps in reserve (0-5)
  notes?: string;
}

export interface Workout {
  id: string;
  ownerId: string;
  name: string;
  tags?: string[];
  exercises: WorkoutExercise[];
}

export interface WorkoutSetLog {
  weight: number;   // kg lifted
  repsDone: number; // actual reps completed
  rir: number;      // perceived reps in reserve
}

export interface WorkoutEntryLog {
  exerciseId: string;
  sets: WorkoutSetLog[];
}

export interface WorkoutLog {
  id: string;
  athleteId: string;
  workoutId: string;
  assignmentId: string;
  date: string;        // YYYY-MM-DD
  completedAt: string; // ISO timestamp string
  entries: WorkoutEntryLog[];
}

export interface WorkoutAssignment {
  id: string;
  workoutId: string;
  athleteId: string;   // userId of the athlete
  date: string;        // YYYY-MM-DD
  status: 'pending' | 'completed' | 'skipped';
}

// ─── DIET ─────────────────────────────────────────────────────────────────────

export interface DietItem {
  category: FoodCategory;
  foodLabel: string;
  quantity: number;   // multiples of 0.25 (e.g. 0.25, 0.5, 1, 1.25)
  grams?: number;     // computed: parsed base weight × quantity
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
}

export interface AthleteDietConfig {
  athleteId: string;        // email
  activeDietIds: string[];  // which of their diets are enabled in the tracker
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

export interface RecipeIngredient {
  foodLabel: string;
  category: FoodCategory;
  mode: DietMode;
  quantity: number; // multiples of 0.25
}

export interface Recipe {
  id: string;
  ownerId: string;
  name: string;
  photoUrl?: string;
  categories: string[];
  ingredients: RecipeIngredient[];
  extras: string[];   // free-text items (e.g. "sal al gusto")
  steps: string[];    // preparation steps
}

export interface RecipeFavorites {
  athleteId: string; // email
  recipeIds: string[];
}
