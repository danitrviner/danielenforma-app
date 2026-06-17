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

export interface MealItem {
  id: string;
  name: string;
  category: 'carbs' | 'protein' | 'fat' | 'veg';
  portionSize: string; // e.g., "60g", "1 ud"
  exchangeInfo: string; // e.g., "2 HC", "1 Prot"
  imageUrl?: string;
  calories?: number;
}

export interface MealState {
  userId: string;
  dateStr: string; // YYYY-MM-DD
  comida1: { completed: boolean; foodId: string; title: string; portion: string; specs: string } | null;
  comida2: { completed: boolean; foodId: string; title: string; portion: string; specs: string } | null;
  comida3: { completed: boolean; foodId: string; title: string; portion: string; specs: string } | null;
  comida4: { completed: boolean; foodId: string; title: string; portion: string; specs: string } | null;
  comida5: { completed: boolean; foodId: string; title: string; portion: string; specs: string } | null;
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

export interface WorkoutAssignment {
  id: string;
  workoutId: string;
  athleteId: string;   // userId of the athlete
  date: string;        // YYYY-MM-DD
  status: 'pending' | 'completed' | 'skipped';
}

export interface Recipe {
  id: string;
  title: string;
  time: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  category: 'all' | 'high-protein' | 'fast-prep' | 'pre-workout' | 'recovery';
  calories: number;
  macros: { pro: string; carb: string; fat: string };
  imageUrl: string;
  ingredients: string[];
  protocol: string[];
}
