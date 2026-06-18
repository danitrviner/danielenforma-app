import {
  db,
  collection,
  doc,
  getDoc,
  setDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy
} from './firebase';
import { UserProfile, WeightCheckIn, MealState, Exercise, Workout, WorkoutAssignment, WorkoutLog, MealItem, NutritionPlan, NutritionAssignment, AthleteNutritionConfig, DietMode } from './types';
import { SYSTEM_EXERCISES } from './data';
import { SYSTEM_FOODS } from './nutricion_seed_en_forma';

// Let's have a state flag for Local Storage fallback
let forceLocalOnly = false;

try {
  if (typeof window !== 'undefined') {
    forceLocalOnly = localStorage.getItem('enforma_use_local_fallback') === 'true';
  }
} catch (e) {
  console.warn('LocalStorage not available:', e);
}

export function setLocalBypassMode(enabled: boolean) {
  forceLocalOnly = enabled;
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem('enforma_use_local_fallback', enabled ? 'true' : 'false');
    }
  } catch (e) {}
}

export function isLocalBypassActive(): boolean {
  return forceLocalOnly;
}

// Local storage helper functions
function getLocalUserProfile(userId: string, email: string, displayName?: string, isDanitrviner?: boolean): UserProfile {
  try {
    const local = localStorage.getItem(`enforma_profile_${userId}`);
    if (local) {
      const parsed = JSON.parse(local) as UserProfile;
      if (isDanitrviner && parsed.role !== 'coach') {
        parsed.role = 'coach';
        saveLocalUserProfile(userId, parsed);
      }
      return parsed;
    }
  } catch (e) {}

  const defaultProfile: UserProfile = {
    userId,
    email,
    displayName: displayName || email.split('@')[0],
    role: isDanitrviner ? 'coach' : 'client',
    avatarUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCYz2_Air0WvwmWSYIQa5y_UDyaCn_Q6_9svDchpvtBkmUWTc8FiyWhSMuCjtRY7LlsNOw4V_5kLPOiJKltz34rykip9l0MOBlGocGYKgm8e52cdv4ITKm6PCscmnFqa-nyGlSEIQ0SR5yfQ-MMuRYVQuqIVZnGzTjaiE48OhsGciJFk_Ab8qsRKRmi_XQcWbQSWiHga5jHiVNC6Lp1hPwVFbwiVbD_Q4Qd3sMFxZiVeNoyuZKvU-Xm46DHhVyDcfKicnVJGjCcwF1K',
    level: 5,
    xp: 320,
    currentStreak: 12,
    maxStreak: 24,
    initialWeight: 82.0,
    targetWeight: 75.0,
    actualWeight: 76.5
  };
  saveLocalUserProfile(userId, defaultProfile);
  return defaultProfile;
}

function saveLocalUserProfile(userId: string, profile: UserProfile) {
  try {
    localStorage.setItem(`enforma_profile_${userId}`, JSON.stringify(profile));
  } catch (e) {}
}

function updateLocalUserProfile(userId: string, updates: Partial<UserProfile>) {
  try {
    const current = getLocalUserProfile(userId, updates.email || '');
    const updated = { ...current, ...updates };
    saveLocalUserProfile(userId, updated);
  } catch (e) {}
}

function getLocalCheckIns(): WeightCheckIn[] {
  try {
    const local = localStorage.getItem('enforma_checkins');
    if (local) {
      const parsed = JSON.parse(local);
      return parsed.map((item: any) => ({
        ...item,
        timestamp: new Date(item.timestamp)
      }));
    }
  } catch (e) {}
  return [];
}

function saveLocalCheckIns(entries: WeightCheckIn[]) {
  try {
    localStorage.setItem('enforma_checkins', JSON.stringify(entries));
  } catch (e) {}
}

function submitLocalCoachFeedback(checkInId: string, feedback: string) {
  try {
    const current = getLocalCheckIns();
    const updated = current.map((item) => {
      if (item.id === checkInId) {
        return {
          ...item,
          coachFeedback: feedback,
          approved: true,
          approvedAt: new Date()
        };
      }
      return item;
    });
    saveLocalCheckIns(updated);
  } catch (e) {}
}

function getLocalMealState(userId: string, dateStr: string): MealState {
  try {
    const local = localStorage.getItem(`enforma_meals_${userId}_${dateStr}`);
    if (local) {
      return JSON.parse(local) as MealState;
    }
  } catch (e) {}

  const defaultMeals: MealState = {
    userId,
    dateStr,
    comida1: { completed: true, foodId: 'avena-integral', title: 'Avena cocida', portion: '60g', specs: '2 HC' },
    comida2: null,
    comida3: null,
    comida4: null,
    comida5: null
  };
  saveLocalMealState(userId, dateStr, defaultMeals);
  return defaultMeals;
}

function saveLocalMealState(userId: string, dateStr: string, meals: MealState) {
  try {
    localStorage.setItem(`enforma_meals_${userId}_${dateStr}`, JSON.stringify(meals));
  } catch (e) {}
}

function updateLocalMealState(userId: string, dateStr: string, updates: Partial<MealState>) {
  try {
    const current = getLocalMealState(userId, dateStr);
    const updated = { ...current, ...updates };
    saveLocalMealState(userId, dateStr, updated);
  } catch (e) {}
}

// Get or create User Profile (with automatic offline fallback)
export async function getOrCreateUserProfile(userId: string, email: string, displayName?: string): Promise<UserProfile> {
  const isDanitrviner = email.toLowerCase() === 'danitrviner@gmail.com' || email.toLowerCase() === 'coach.alex@enforma.com';
  
  if (forceLocalOnly) {
    return getLocalUserProfile(userId, email, displayName, isDanitrviner);
  }

  try {
    const docRef = doc(db, 'user_profiles', userId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data() as UserProfile;
      // Auto-promote target emails to coach role if not already
      if (isDanitrviner && data.role !== 'coach') {
        try {
          await updateDoc(docRef, { role: 'coach' });
        } catch (e) {}
        data.role = 'coach';
      }
      // Save local copy for backup
      saveLocalUserProfile(userId, data);
      return data;
    }

    // Create default Client Profile (Promote danitrviner immediately on first register)
    const defaultProfile: UserProfile = {
      userId,
      email,
      displayName: displayName || email.split('@')[0],
      role: isDanitrviner ? 'coach' : 'client',
      avatarUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCYz2_Air0WvwmWSYIQa5y_UDyaCn_Q6_9svDchpvtBkmUWTc8FiyWhSMuCjtRY7LlsNOw4V_5kLPOiJKltz34rykip9l0MOBlGocGYKgm8e52cdv4ITKm6PCscmnFqa-nyGlSEIQ0SR5yfQ-MMuRYVQuqIVZnGzTjaiE48OhsGciJFk_Ab8qsRKRmi_XQcWbQSWiHga5jHiVNC6Lp1hPwVFbwiVbD_Q4Qd3sMFxZiVeNoyuZKvU-Xm46DHhVyDcfKicnVJGjCcwF1K',
      level: 5,
      xp: 320,
      currentStreak: 12,
      maxStreak: 24,
      initialWeight: 82.0,
      targetWeight: 75.0,
      actualWeight: 76.5
    };

    await setDoc(docRef, defaultProfile);
    saveLocalUserProfile(userId, defaultProfile);
    return defaultProfile;
  } catch (err) {
    console.warn('Firestore user_profiles read failed. Switching to local fallback:', err);
    setLocalBypassMode(true);
    return getLocalUserProfile(userId, email, displayName, isDanitrviner);
  }
}

export async function getAllUserProfiles(): Promise<UserProfile[]> {
  if (forceLocalOnly) {
    const profiles: UserProfile[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('enforma_profile_')) {
          const raw = localStorage.getItem(key);
          if (raw) {
            const p = JSON.parse(raw);
            if (p.role !== 'coach') {
              profiles.push(p);
            }
          }
        }
      }
    } catch (e) {}

    if (profiles.length === 0) {
      profiles.push({
        userId: 'client_alex_default',
        email: 'atleta@enforma.com',
        displayName: 'Alex Rivera',
        role: 'client',
        avatarUrl: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&q=80&w=200',
        level: 5,
        xp: 320,
        currentStreak: 12,
        maxStreak: 24,
        initialWeight: 82.0,
        targetWeight: 75.0,
        actualWeight: 76.5
      });
    }
    return profiles;
  }

  try {
    const colRef = collection(db, 'user_profiles');
    const snap = await getDocs(colRef);
    const profiles: UserProfile[] = [];
    snap.forEach((d) => {
      const p = d.data() as UserProfile;
      if (p.role !== 'coach') {
        profiles.push(p);
      }
    });

    if (profiles.length === 0) {
      profiles.push({
        userId: 'client_alex_default',
        email: 'atleta@enforma.com',
        displayName: 'Alex Rivera',
        role: 'client',
        avatarUrl: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&q=80&w=200',
        level: 5,
        xp: 320,
        currentStreak: 12,
        maxStreak: 24,
        initialWeight: 82.0,
        targetWeight: 75.0,
        actualWeight: 76.5
      });
    }
    return profiles;
  } catch (err) {
    console.warn('Failed to fetch user profiles from Firestore:', err);
    return [
      {
        userId: 'client_alex_default',
        email: 'atleta@enforma.com',
        displayName: 'Alex Rivera',
        role: 'client',
        avatarUrl: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&q=80&w=200',
        level: 5,
        xp: 320,
        currentStreak: 12,
        maxStreak: 24,
        initialWeight: 82.0,
        targetWeight: 75.0,
        actualWeight: 76.5
      }
    ];
  }
}

export async function updateUserProfile(userId: string, updates: Partial<UserProfile>): Promise<void> {
  if (forceLocalOnly) {
    updateLocalUserProfile(userId, updates);
    return;
  }

  try {
    const docRef = doc(db, 'user_profiles', userId);
    await updateDoc(docRef, updates as any);
    updateLocalUserProfile(userId, updates);
  } catch (err) {
    console.warn('Firestore user_profiles write failed, using local storage:', err);
    setLocalBypassMode(true);
    updateLocalUserProfile(userId, updates);
  }
}

// Fetch Checkins for a client
export async function getCheckIns(): Promise<WeightCheckIn[]> {
  if (forceLocalOnly) {
    return getLocalCheckIns();
  }

  try {
    const colRef = collection(db, 'checkins');
    const q = query(colRef, orderBy('timestamp', 'desc'));
    const querySnap = await getDocs(q);
    
    const entries: WeightCheckIn[] = [];
    querySnap.forEach((d) => {
      const data = d.data();
      entries.push({
        id: d.id,
        ...data,
        timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : new Date(data.timestamp)
      } as WeightCheckIn);
    });
    
    // Save backup to localStorage
    saveLocalCheckIns(entries);
    return entries;
  } catch (err) {
    console.warn('Firestore checkins read failed, using local storage:', err);
    setLocalBypassMode(true);
    return getLocalCheckIns();
  }
}

// Add a Checkin
export async function addWeightCheckIn(
  userId: string, 
  email: string, 
  checkInData: { weight: number; mood: string; adherence: 'Sí' | 'Parcial' | 'No'; notes: string }
): Promise<WeightCheckIn> {
  const newEntry = {
    userId,
    email,
    timestamp: new Date(),
    dateStr: new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
    weight: checkInData.weight,
    mood: checkInData.mood,
    adherence: checkInData.adherence,
    notes: checkInData.notes,
    approved: false,
    coachFeedback: ''
  };

  if (forceLocalOnly) {
    return addLocalWeightCheckIn(userId, email, newEntry);
  }

  try {
    const colRef = collection(db, 'checkins');
    const docRef = await addDoc(colRef, newEntry);
    
    // also update profile's actualWeight
    try {
      await updateUserProfile(userId, { actualWeight: checkInData.weight });
    } catch (e) {}
    
    // Award XP
    try {
      const profileRef = doc(db, 'user_profiles', userId);
      const profileSnap = await getDoc(profileRef);
      if (profileSnap.exists()) {
        const profile = profileSnap.data() as UserProfile;
        let newXp = profile.xp + 50; 
        let newLevel = profile.level;
        if (newXp >= 400) {
          newXp = newXp - 400;
          newLevel += 1;
        }
        const newStreak = profile.currentStreak + 1;
        const maxStreak = Math.max(profile.maxStreak, newStreak);
        
        await updateDoc(profileRef, {
          xp: newXp,
          level: newLevel,
          currentStreak: newStreak,
          maxStreak
        });
        
        updateLocalUserProfile(userId, {
          xp: newXp,
          level: newLevel,
          currentStreak: newStreak,
          maxStreak,
          actualWeight: checkInData.weight
        });
      }
    } catch (e) {}

    const fullResult = {
      id: docRef.id,
      ...newEntry,
      timestamp: new Date()
    } as WeightCheckIn;

    // Add to local storage
    const currentLocal = getLocalCheckIns();
    saveLocalCheckIns([fullResult, ...currentLocal]);

    return fullResult;
  } catch (err) {
    console.warn('Firestore add checkin failed, using local fallback:', err);
    setLocalBypassMode(true);
    return addLocalWeightCheckIn(userId, email, newEntry);
  }
}

function addLocalWeightCheckIn(userId: string, email: string, entry: any): WeightCheckIn {
  const fullResult: WeightCheckIn = {
    id: `local_checkin_${Date.now()}`,
    ...entry,
    timestamp: new Date()
  };

  // Update profile
  try {
    const profile = getLocalUserProfile(userId, email);
    let newXp = profile.xp + 50; 
    let newLevel = profile.level;
    if (newXp >= 400) {
      newXp = newXp - 400;
      newLevel += 1;
    }
    const newStreak = profile.currentStreak + 1;
    const maxStreak = Math.max(profile.maxStreak, newStreak);

    updateLocalUserProfile(userId, {
      xp: newXp,
      level: newLevel,
      currentStreak: newStreak,
      maxStreak,
      actualWeight: entry.weight
    });
  } catch (e) {}

  const currentLocal = getLocalCheckIns();
  saveLocalCheckIns([fullResult, ...currentLocal]);
  return fullResult;
}

// Add feedback as Coach
export async function submitCoachFeedback(checkInId: string, feedback: string): Promise<void> {
  if (forceLocalOnly) {
    submitLocalCoachFeedback(checkInId, feedback);
    return;
  }

  try {
    const docRef = doc(db, 'checkins', checkInId);
    await updateDoc(docRef, {
      coachFeedback: feedback,
      approved: true,
      approvedAt: new Date()
    });
    submitLocalCoachFeedback(checkInId, feedback);
  } catch (err) {
    console.warn('Firestore checkins update feedback failed:', err);
    setLocalBypassMode(true);
    submitLocalCoachFeedback(checkInId, feedback);
  }
}

// Get meal states for a date
export async function getOrCreateMealState(userId: string, dateStr: string): Promise<MealState> {
  if (forceLocalOnly) {
    return getLocalMealState(userId, dateStr);
  }

  try {
    const docId = `${userId}_${dateStr}`;
    const docRef = doc(db, 'meals_states', docId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data() as MealState;
      saveLocalMealState(userId, dateStr, data);
      return data;
    }

    const defaultMeals: MealState = {
      userId,
      dateStr,
      comida1: { completed: true, foodId: 'avena-integral', title: 'Avena cocida', portion: '60g', specs: '2 HC' },
      comida2: null,
      comida3: null,
      comida4: null,
      comida5: null
    };

    await setDoc(docRef, defaultMeals);
    saveLocalMealState(userId, dateStr, defaultMeals);
    return defaultMeals;
  } catch (err) {
    console.warn('Firestore meals_states read failed, using local storage:', err);
    setLocalBypassMode(true);
    return getLocalMealState(userId, dateStr);
  }
}

// Update meals state
export async function updateMealState(userId: string, dateStr: string, updates: Partial<MealState>): Promise<void> {
  if (forceLocalOnly) {
    updateLocalMealState(userId, dateStr, updates);
    return;
  }

  try {
    const docId = `${userId}_${dateStr}`;
    const docRef = doc(db, 'meals_states', docId);
    await setDoc(docRef, { userId, dateStr, ...updates }, { merge: true });
    updateLocalMealState(userId, dateStr, updates);
  } catch (err) {
    console.warn('Firestore meals_states update failed, using local storage:', err);
    setLocalBypassMode(true);
    updateLocalMealState(userId, dateStr, updates);
  }
}

// Seed Initial Checkins if collection is empty
export async function seedInitialCheckinsIfEmpty(userId: string, email: string): Promise<void> {
  const currentLocal = getLocalCheckIns();
  if (currentLocal.length > 0) {
    return;
  }

  const seedData = [
    {
      id: `seed_checkin_1_${Date.now()}`,
      userId,
      email,
      timestamp: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000), // 14 days ago
      dateStr: '28 Sep',
      weight: 77.2,
      mood: '😐',
      adherence: 'Parcial' as const,
      notes: 'Semana de adaptación pesada, cansado del trabajo.',
      approved: true,
      coachFeedback: 'Buen inicio. El peso bajará cuando el déficit de agua se normalice.'
    },
    {
      id: `seed_checkin_2_${Date.now()}`,
      userId,
      email,
      timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
      dateStr: '05 Oct',
      weight: 76.8,
      mood: '😊',
      adherence: 'Sí' as const,
      notes: 'Mejor adherencia, el cardio en ayunas está funcionando.',
      approved: true,
      coachFeedback: 'Excelente progreso, mantente constante.'
    },
    {
      id: `seed_checkin_3_${Date.now()}`,
      userId,
      email,
      timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
      dateStr: '12 Oct',
      weight: 76.5,
      mood: '🔥',
      adherence: 'Sí' as const,
      notes: 'Me siento con muchísima fuerza. Bajé 300g.',
      approved: true,
      coachFeedback: 'Excelente bajada esta semana. Mantenemos calorías, ajustamos intensidad en piernas.'
    }
  ];

  if (forceLocalOnly) {
    saveLocalCheckIns(seedData);
    return;
  }

  try {
    const colRef = collection(db, 'checkins');
    const snap = await getDocs(colRef);
    if (snap.empty) {
      for (const item of seedData) {
        const { id, ...firebaseItem } = item;
        await addDoc(colRef, firebaseItem);
      }
    }
    saveLocalCheckIns(seedData);
  } catch (err) {
    console.warn('Firestore checkins seed failed, saving local copy:', err);
    saveLocalCheckIns(seedData);
  }
}

// ─── EXERCISE LIBRARY ─────────────────────────────────────────────────────────

const EXERCISES_LOCAL_KEY = 'enforma_exercises';

function getLocalExercises(): Exercise[] {
  try {
    const raw = localStorage.getItem(EXERCISES_LOCAL_KEY);
    return raw ? (JSON.parse(raw) as Exercise[]) : [];
  } catch (e) {
    return [];
  }
}

function saveLocalExercises(exercises: Exercise[]) {
  try {
    localStorage.setItem(EXERCISES_LOCAL_KEY, JSON.stringify(exercises));
  } catch (e) {}
}

export async function getExercises(): Promise<Exercise[]> {
  if (forceLocalOnly) return getLocalExercises();
  try {
    const snap = await getDocs(collection(db, 'exercises'));
    const exercises = snap.docs.map(d => ({ id: d.id, ...d.data() } as Exercise));
    saveLocalExercises(exercises);
    return exercises;
  } catch (err) {
    console.warn('getExercises Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getLocalExercises();
  }
}

export async function createExercise(data: Omit<Exercise, 'id'>): Promise<Exercise> {
  if (forceLocalOnly) {
    const newEx: Exercise = { ...data, id: `local_ex_${Date.now()}` };
    const list = getLocalExercises();
    list.push(newEx);
    saveLocalExercises(list);
    return newEx;
  }
  try {
    const ref = await addDoc(collection(db, 'exercises'), data);
    const newEx: Exercise = { ...data, id: ref.id };
    const list = getLocalExercises();
    list.push(newEx);
    saveLocalExercises(list);
    return newEx;
  } catch (err) {
    console.warn('createExercise Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    const newEx: Exercise = { ...data, id: `local_ex_${Date.now()}` };
    const list = getLocalExercises();
    list.push(newEx);
    saveLocalExercises(list);
    return newEx;
  }
}

export async function updateExercise(id: string, updates: Partial<Exercise>): Promise<void> {
  if (forceLocalOnly) {
    const list = getLocalExercises().map(ex => (ex.id === id ? { ...ex, ...updates } : ex));
    saveLocalExercises(list);
    return;
  }
  try {
    await updateDoc(doc(db, 'exercises', id), updates as Record<string, unknown>);
    const list = getLocalExercises().map(ex => (ex.id === id ? { ...ex, ...updates } : ex));
    saveLocalExercises(list);
  } catch (err) {
    console.warn('updateExercise Firestore failed, updating local:', err);
    setLocalBypassMode(true);
    const list = getLocalExercises().map(ex => (ex.id === id ? { ...ex, ...updates } : ex));
    saveLocalExercises(list);
  }
}

export async function deleteExercise(id: string): Promise<void> {
  if (forceLocalOnly) {
    saveLocalExercises(getLocalExercises().filter(ex => ex.id !== id));
    return;
  }
  try {
    await deleteDoc(doc(db, 'exercises', id));
    saveLocalExercises(getLocalExercises().filter(ex => ex.id !== id));
  } catch (err) {
    console.warn('deleteExercise Firestore failed, deleting local:', err);
    setLocalBypassMode(true);
    saveLocalExercises(getLocalExercises().filter(ex => ex.id !== id));
  }
}

export async function seedExercisesIfEmpty(): Promise<void> {
  if (forceLocalOnly) {
    if (getLocalExercises().length === 0) {
      const seeded = SYSTEM_EXERCISES.map((ex, i) => ({ ...ex, id: `system_${i + 1}` }));
      saveLocalExercises(seeded);
    }
    return;
  }
  try {
    const snap = await getDocs(collection(db, 'exercises'));
    if (snap.empty) {
      for (const ex of SYSTEM_EXERCISES) {
        await addDoc(collection(db, 'exercises'), ex);
      }
    }
    const after = await getDocs(collection(db, 'exercises'));
    const seeded = after.docs.map(d => ({ id: d.id, ...d.data() } as Exercise));
    saveLocalExercises(seeded);
  } catch (err) {
    console.warn('seedExercises Firestore failed, seeding local:', err);
    setLocalBypassMode(true);
    if (getLocalExercises().length === 0) {
      const seeded = SYSTEM_EXERCISES.map((ex, i) => ({ ...ex, id: `system_${i + 1}` }));
      saveLocalExercises(seeded);
    }
  }
}

// ─── WORKOUTS ─────────────────────────────────────────────────────────────────

const WORKOUTS_LOCAL_KEY = 'enforma_workouts';

function getLocalWorkouts(): Workout[] {
  try {
    const raw = localStorage.getItem(WORKOUTS_LOCAL_KEY);
    return raw ? (JSON.parse(raw) as Workout[]) : [];
  } catch (e) {
    return [];
  }
}

function saveLocalWorkouts(workouts: Workout[]) {
  try {
    localStorage.setItem(WORKOUTS_LOCAL_KEY, JSON.stringify(workouts));
  } catch (e) {}
}

export async function getWorkouts(): Promise<Workout[]> {
  if (forceLocalOnly) return getLocalWorkouts();
  try {
    const snap = await getDocs(collection(db, 'workouts'));
    const workouts = snap.docs.map(d => ({ id: d.id, ...d.data() } as Workout));
    saveLocalWorkouts(workouts);
    return workouts;
  } catch (err) {
    console.warn('getWorkouts Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getLocalWorkouts();
  }
}

export async function createWorkout(data: Omit<Workout, 'id'>): Promise<Workout> {
  if (forceLocalOnly) {
    const newW: Workout = { ...data, id: `local_w_${Date.now()}` };
    const list = getLocalWorkouts();
    list.push(newW);
    saveLocalWorkouts(list);
    return newW;
  }
  try {
    const ref = await addDoc(collection(db, 'workouts'), data);
    const newW: Workout = { ...data, id: ref.id };
    const list = getLocalWorkouts();
    list.push(newW);
    saveLocalWorkouts(list);
    return newW;
  } catch (err) {
    console.warn('createWorkout Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    const newW: Workout = { ...data, id: `local_w_${Date.now()}` };
    const list = getLocalWorkouts();
    list.push(newW);
    saveLocalWorkouts(list);
    return newW;
  }
}

export async function updateWorkout(id: string, updates: Partial<Workout>): Promise<void> {
  if (forceLocalOnly) {
    saveLocalWorkouts(getLocalWorkouts().map(w => (w.id === id ? { ...w, ...updates } : w)));
    return;
  }
  try {
    await updateDoc(doc(db, 'workouts', id), updates as Record<string, unknown>);
    saveLocalWorkouts(getLocalWorkouts().map(w => (w.id === id ? { ...w, ...updates } : w)));
  } catch (err) {
    console.warn('updateWorkout Firestore failed, updating local:', err);
    setLocalBypassMode(true);
    saveLocalWorkouts(getLocalWorkouts().map(w => (w.id === id ? { ...w, ...updates } : w)));
  }
}

export async function deleteWorkout(id: string): Promise<void> {
  if (forceLocalOnly) {
    saveLocalWorkouts(getLocalWorkouts().filter(w => w.id !== id));
    return;
  }
  try {
    await deleteDoc(doc(db, 'workouts', id));
    saveLocalWorkouts(getLocalWorkouts().filter(w => w.id !== id));
  } catch (err) {
    console.warn('deleteWorkout Firestore failed, deleting local:', err);
    setLocalBypassMode(true);
    saveLocalWorkouts(getLocalWorkouts().filter(w => w.id !== id));
  }
}

// ─── WORKOUT ASSIGNMENTS ──────────────────────────────────────────────────────

const ASSIGNMENTS_LOCAL_KEY = 'enforma_workout_assignments';

function getLocalAssignments(): WorkoutAssignment[] {
  try {
    const raw = localStorage.getItem(ASSIGNMENTS_LOCAL_KEY);
    return raw ? (JSON.parse(raw) as WorkoutAssignment[]) : [];
  } catch (e) {
    return [];
  }
}

function saveLocalAssignments(assignments: WorkoutAssignment[]) {
  try {
    localStorage.setItem(ASSIGNMENTS_LOCAL_KEY, JSON.stringify(assignments));
  } catch (e) {}
}

export async function getWorkoutAssignments(athleteId?: string): Promise<WorkoutAssignment[]> {
  if (forceLocalOnly) {
    const all = getLocalAssignments();
    return athleteId ? all.filter(a => a.athleteId === athleteId) : all;
  }
  try {
    const colRef = collection(db, 'workoutAssignments');
    const q = athleteId ? query(colRef, where('athleteId', '==', athleteId)) : colRef;
    const snap = await getDocs(q);
    const assignments = snap.docs.map(d => ({ id: d.id, ...d.data() } as WorkoutAssignment));
    // Merge into local cache
    const local = getLocalAssignments().filter(a => !assignments.find(b => b.id === a.id));
    saveLocalAssignments([...local, ...assignments]);
    return assignments;
  } catch (err) {
    console.warn('getWorkoutAssignments Firestore failed, using local:', err);
    setLocalBypassMode(true);
    const all = getLocalAssignments();
    return athleteId ? all.filter(a => a.athleteId === athleteId) : all;
  }
}

export async function createWorkoutAssignment(data: Omit<WorkoutAssignment, 'id'>): Promise<WorkoutAssignment> {
  if (forceLocalOnly) {
    const newA: WorkoutAssignment = { ...data, id: `local_a_${Date.now()}` };
    const list = getLocalAssignments();
    list.push(newA);
    saveLocalAssignments(list);
    return newA;
  }
  try {
    const ref = await addDoc(collection(db, 'workoutAssignments'), data);
    const newA: WorkoutAssignment = { ...data, id: ref.id };
    const list = getLocalAssignments();
    list.push(newA);
    saveLocalAssignments(list);
    return newA;
  } catch (err) {
    console.warn('createWorkoutAssignment Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    const newA: WorkoutAssignment = { ...data, id: `local_a_${Date.now()}` };
    const list = getLocalAssignments();
    list.push(newA);
    saveLocalAssignments(list);
    return newA;
  }
}

export async function updateWorkoutAssignment(id: string, updates: Partial<WorkoutAssignment>): Promise<void> {
  if (forceLocalOnly) {
    saveLocalAssignments(getLocalAssignments().map(a => (a.id === id ? { ...a, ...updates } : a)));
    return;
  }
  try {
    await updateDoc(doc(db, 'workoutAssignments', id), updates as Record<string, unknown>);
    saveLocalAssignments(getLocalAssignments().map(a => (a.id === id ? { ...a, ...updates } : a)));
  } catch (err) {
    console.warn('updateWorkoutAssignment Firestore failed, updating local:', err);
    setLocalBypassMode(true);
    saveLocalAssignments(getLocalAssignments().map(a => (a.id === id ? { ...a, ...updates } : a)));
  }
}

export async function deleteWorkoutAssignment(id: string): Promise<void> {
  if (forceLocalOnly) {
    saveLocalAssignments(getLocalAssignments().filter(a => a.id !== id));
    return;
  }
  try {
    await deleteDoc(doc(db, 'workoutAssignments', id));
    saveLocalAssignments(getLocalAssignments().filter(a => a.id !== id));
  } catch (err) {
    console.warn('deleteWorkoutAssignment Firestore failed, deleting local:', err);
    setLocalBypassMode(true);
    saveLocalAssignments(getLocalAssignments().filter(a => a.id !== id));
  }
}

// ─── WORKOUT LOGS ─────────────────────────────────────────────────────────────

const WORKOUT_LOGS_LOCAL_KEY = 'enforma_workout_logs';

function getLocalWorkoutLogs(): WorkoutLog[] {
  try {
    const raw = localStorage.getItem(WORKOUT_LOGS_LOCAL_KEY);
    return raw ? (JSON.parse(raw) as WorkoutLog[]) : [];
  } catch (e) {
    return [];
  }
}

function saveLocalWorkoutLogs(logs: WorkoutLog[]) {
  try {
    localStorage.setItem(WORKOUT_LOGS_LOCAL_KEY, JSON.stringify(logs));
  } catch (e) {}
}

export async function getWorkoutLogs(athleteId?: string): Promise<WorkoutLog[]> {
  if (forceLocalOnly) {
    const all = getLocalWorkoutLogs();
    return athleteId ? all.filter(l => l.athleteId === athleteId) : all;
  }
  try {
    const colRef = collection(db, 'workoutLogs');
    const q = athleteId ? query(colRef, where('athleteId', '==', athleteId)) : colRef;
    const snap = await getDocs(q);
    const logs = snap.docs.map(d => ({ id: d.id, ...d.data() } as WorkoutLog));
    const local = getLocalWorkoutLogs().filter(l => !logs.find(b => b.id === l.id));
    saveLocalWorkoutLogs([...local, ...logs]);
    return logs;
  } catch (err) {
    console.warn('getWorkoutLogs Firestore failed, using local:', err);
    setLocalBypassMode(true);
    const all = getLocalWorkoutLogs();
    return athleteId ? all.filter(l => l.athleteId === athleteId) : all;
  }
}

export async function createWorkoutLog(data: Omit<WorkoutLog, 'id'>): Promise<WorkoutLog> {
  if (forceLocalOnly) {
    const newL: WorkoutLog = { ...data, id: `local_log_${Date.now()}` };
    const list = getLocalWorkoutLogs();
    list.push(newL);
    saveLocalWorkoutLogs(list);
    return newL;
  }
  try {
    const ref = await addDoc(collection(db, 'workoutLogs'), data);
    const newL: WorkoutLog = { ...data, id: ref.id };
    const list = getLocalWorkoutLogs();
    list.push(newL);
    saveLocalWorkoutLogs(list);
    return newL;
  } catch (err) {
    console.warn('createWorkoutLog Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    const newL: WorkoutLog = { ...data, id: `local_log_${Date.now()}` };
    const list = getLocalWorkoutLogs();
    list.push(newL);
    saveLocalWorkoutLogs(list);
    return newL;
  }
}

export async function deleteWorkoutLog(id: string): Promise<void> {
  if (forceLocalOnly) {
    saveLocalWorkoutLogs(getLocalWorkoutLogs().filter(l => l.id !== id));
    return;
  }
  try {
    await deleteDoc(doc(db, 'workoutLogs', id));
    saveLocalWorkoutLogs(getLocalWorkoutLogs().filter(l => l.id !== id));
  } catch (err) {
    console.warn('deleteWorkoutLog Firestore failed, deleting local:', err);
    setLocalBypassMode(true);
    saveLocalWorkoutLogs(getLocalWorkoutLogs().filter(l => l.id !== id));
  }
}

// ─── FOOD ITEMS ───────────────────────────────────────────────────────────────

const FOOD_ITEMS_LOCAL_KEY = 'enforma_food_items_v2';

function getLocalFoodItems(): MealItem[] {
  try {
    const raw = localStorage.getItem(FOOD_ITEMS_LOCAL_KEY);
    return raw ? (JSON.parse(raw) as MealItem[]) : [];
  } catch (e) {
    return [];
  }
}

function saveLocalFoodItems(items: MealItem[]) {
  try {
    localStorage.setItem(FOOD_ITEMS_LOCAL_KEY, JSON.stringify(items));
  } catch (e) {}
}

export async function getFoodItems(): Promise<MealItem[]> {
  if (forceLocalOnly) return getLocalFoodItems();
  try {
    const snap = await getDocs(collection(db, 'foodItems'));
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as MealItem));
    saveLocalFoodItems(items);
    return items;
  } catch (err) {
    console.warn('getFoodItems Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getLocalFoodItems();
  }
}

export async function createFoodItem(data: Omit<MealItem, 'id'>): Promise<MealItem> {
  if (forceLocalOnly) {
    const newItem: MealItem = { ...data, id: `local_food_${Date.now()}` };
    saveLocalFoodItems([...getLocalFoodItems(), newItem]);
    return newItem;
  }
  try {
    const ref = await addDoc(collection(db, 'foodItems'), data);
    const newItem: MealItem = { ...data, id: ref.id };
    saveLocalFoodItems([...getLocalFoodItems(), newItem]);
    return newItem;
  } catch (err) {
    console.warn('createFoodItem Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    const newItem: MealItem = { ...data, id: `local_food_${Date.now()}` };
    saveLocalFoodItems([...getLocalFoodItems(), newItem]);
    return newItem;
  }
}

export async function updateFoodItem(id: string, updates: Partial<MealItem>): Promise<void> {
  if (forceLocalOnly) {
    saveLocalFoodItems(getLocalFoodItems().map(f => (f.id === id ? { ...f, ...updates } : f)));
    return;
  }
  try {
    await updateDoc(doc(db, 'foodItems', id), updates as Record<string, unknown>);
    saveLocalFoodItems(getLocalFoodItems().map(f => (f.id === id ? { ...f, ...updates } : f)));
  } catch (err) {
    console.warn('updateFoodItem Firestore failed, updating local:', err);
    setLocalBypassMode(true);
    saveLocalFoodItems(getLocalFoodItems().map(f => (f.id === id ? { ...f, ...updates } : f)));
  }
}

export async function deleteFoodItem(id: string): Promise<void> {
  if (forceLocalOnly) {
    saveLocalFoodItems(getLocalFoodItems().filter(f => f.id !== id));
    return;
  }
  try {
    await deleteDoc(doc(db, 'foodItems', id));
    saveLocalFoodItems(getLocalFoodItems().filter(f => f.id !== id));
  } catch (err) {
    console.warn('deleteFoodItem Firestore failed, deleting local:', err);
    setLocalBypassMode(true);
    saveLocalFoodItems(getLocalFoodItems().filter(f => f.id !== id));
  }
}

export async function seedFoodItemsIfEmpty(): Promise<void> {
  const seeded: MealItem[] = SYSTEM_FOODS.map((f, i) => ({
    id: `system_food_${i + 1}`,
    mode: f.mode,
    category: f.category,
    label: f.label,
  }));

  if (forceLocalOnly) {
    if (getLocalFoodItems().length === 0) {
      saveLocalFoodItems(seeded);
    }
    return;
  }
  try {
    const snap = await getDocs(collection(db, 'foodItems'));
    if (snap.empty) {
      for (const item of seeded) {
        const { id, ...data } = item;
        await addDoc(collection(db, 'foodItems'), data);
      }
    }
    const after = await getDocs(collection(db, 'foodItems'));
    saveLocalFoodItems(after.docs.map(d => ({ id: d.id, ...d.data() } as MealItem)));
  } catch (err) {
    console.warn('seedFoodItems Firestore failed, seeding local:', err);
    setLocalBypassMode(true);
    if (getLocalFoodItems().length === 0) {
      saveLocalFoodItems(seeded);
    }
  }
}

// ─── NUTRITION PLANS ─────────────────────────────────────────────────────────

const NUTRITION_PLANS_LOCAL_KEY = 'enforma_nutrition_plans';

function getLocalNutritionPlans(): NutritionPlan[] {
  try {
    const raw = localStorage.getItem(NUTRITION_PLANS_LOCAL_KEY);
    return raw ? (JSON.parse(raw) as NutritionPlan[]) : [];
  } catch (e) {
    return [];
  }
}

function saveLocalNutritionPlans(plans: NutritionPlan[]) {
  try {
    localStorage.setItem(NUTRITION_PLANS_LOCAL_KEY, JSON.stringify(plans));
  } catch (e) {}
}

export async function getNutritionPlans(): Promise<NutritionPlan[]> {
  if (forceLocalOnly) return getLocalNutritionPlans();
  try {
    const snap = await getDocs(collection(db, 'nutritionPlans'));
    const plans = snap.docs.map(d => ({ id: d.id, ...d.data() } as NutritionPlan));
    saveLocalNutritionPlans(plans);
    return plans;
  } catch (err) {
    console.warn('getNutritionPlans Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getLocalNutritionPlans();
  }
}

export async function createNutritionPlan(data: Omit<NutritionPlan, 'id'>): Promise<NutritionPlan> {
  if (forceLocalOnly) {
    const newP: NutritionPlan = { ...data, id: `local_np_${Date.now()}` };
    saveLocalNutritionPlans([...getLocalNutritionPlans(), newP]);
    return newP;
  }
  try {
    const ref = await addDoc(collection(db, 'nutritionPlans'), data);
    const newP: NutritionPlan = { ...data, id: ref.id };
    saveLocalNutritionPlans([...getLocalNutritionPlans(), newP]);
    return newP;
  } catch (err) {
    console.warn('createNutritionPlan Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    const newP: NutritionPlan = { ...data, id: `local_np_${Date.now()}` };
    saveLocalNutritionPlans([...getLocalNutritionPlans(), newP]);
    return newP;
  }
}

export async function updateNutritionPlan(id: string, updates: Partial<NutritionPlan>): Promise<void> {
  if (forceLocalOnly) {
    saveLocalNutritionPlans(getLocalNutritionPlans().map(p => (p.id === id ? { ...p, ...updates } : p)));
    return;
  }
  try {
    await updateDoc(doc(db, 'nutritionPlans', id), updates as Record<string, unknown>);
    saveLocalNutritionPlans(getLocalNutritionPlans().map(p => (p.id === id ? { ...p, ...updates } : p)));
  } catch (err) {
    console.warn('updateNutritionPlan Firestore failed, updating local:', err);
    setLocalBypassMode(true);
    saveLocalNutritionPlans(getLocalNutritionPlans().map(p => (p.id === id ? { ...p, ...updates } : p)));
  }
}

export async function deleteNutritionPlan(id: string): Promise<void> {
  if (forceLocalOnly) {
    saveLocalNutritionPlans(getLocalNutritionPlans().filter(p => p.id !== id));
    return;
  }
  try {
    await deleteDoc(doc(db, 'nutritionPlans', id));
    saveLocalNutritionPlans(getLocalNutritionPlans().filter(p => p.id !== id));
  } catch (err) {
    console.warn('deleteNutritionPlan Firestore failed, deleting local:', err);
    setLocalBypassMode(true);
    saveLocalNutritionPlans(getLocalNutritionPlans().filter(p => p.id !== id));
  }
}

// ─── NUTRITION ASSIGNMENTS ────────────────────────────────────────────────────

const NUTRITION_ASSIGNMENTS_LOCAL_KEY = 'enforma_nutrition_assignments';

function getLocalNutritionAssignments(): NutritionAssignment[] {
  try {
    const raw = localStorage.getItem(NUTRITION_ASSIGNMENTS_LOCAL_KEY);
    return raw ? (JSON.parse(raw) as NutritionAssignment[]) : [];
  } catch (e) {
    return [];
  }
}

function saveLocalNutritionAssignments(assignments: NutritionAssignment[]) {
  try {
    localStorage.setItem(NUTRITION_ASSIGNMENTS_LOCAL_KEY, JSON.stringify(assignments));
  } catch (e) {}
}

export async function getNutritionAssignments(athleteEmail?: string): Promise<NutritionAssignment[]> {
  if (forceLocalOnly) {
    const all = getLocalNutritionAssignments();
    return athleteEmail ? all.filter(a => a.athleteId === athleteEmail) : all;
  }
  try {
    const colRef = collection(db, 'nutritionAssignments');
    const q = athleteEmail ? query(colRef, where('athleteId', '==', athleteEmail)) : colRef;
    const snap = await getDocs(q);
    const assignments = snap.docs.map(d => ({ id: d.id, ...d.data() } as NutritionAssignment));
    const local = getLocalNutritionAssignments().filter(a => !assignments.find(b => b.id === a.id));
    saveLocalNutritionAssignments([...local, ...assignments]);
    return assignments;
  } catch (err) {
    console.warn('getNutritionAssignments Firestore failed, using local:', err);
    setLocalBypassMode(true);
    const all = getLocalNutritionAssignments();
    return athleteEmail ? all.filter(a => a.athleteId === athleteEmail) : all;
  }
}

export async function createNutritionAssignment(data: Omit<NutritionAssignment, 'id'>): Promise<NutritionAssignment> {
  if (forceLocalOnly) {
    const newA: NutritionAssignment = { ...data, id: `local_na_${Date.now()}` };
    saveLocalNutritionAssignments([...getLocalNutritionAssignments(), newA]);
    return newA;
  }
  try {
    const ref = await addDoc(collection(db, 'nutritionAssignments'), data);
    const newA: NutritionAssignment = { ...data, id: ref.id };
    saveLocalNutritionAssignments([...getLocalNutritionAssignments(), newA]);
    return newA;
  } catch (err) {
    console.warn('createNutritionAssignment Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    const newA: NutritionAssignment = { ...data, id: `local_na_${Date.now()}` };
    saveLocalNutritionAssignments([...getLocalNutritionAssignments(), newA]);
    return newA;
  }
}

export async function deleteNutritionAssignment(id: string): Promise<void> {
  if (forceLocalOnly) {
    saveLocalNutritionAssignments(getLocalNutritionAssignments().filter(a => a.id !== id));
    return;
  }
  try {
    await deleteDoc(doc(db, 'nutritionAssignments', id));
    saveLocalNutritionAssignments(getLocalNutritionAssignments().filter(a => a.id !== id));
  } catch (err) {
    console.warn('deleteNutritionAssignment Firestore failed, deleting local:', err);
    setLocalBypassMode(true);
    saveLocalNutritionAssignments(getLocalNutritionAssignments().filter(a => a.id !== id));
  }
}

export async function getActiveNutritionAssignment(athleteEmail: string): Promise<{ assignment: NutritionAssignment; plan: NutritionPlan } | null> {
  const [assignments, plans] = await Promise.all([
    getNutritionAssignments(athleteEmail),
    getNutritionPlans(),
  ]);
  if (assignments.length === 0) return null;

  const today = new Date().toISOString().split('T')[0];
  const active = assignments
    .filter(a => a.startDate <= today)
    .sort((a, b) => b.startDate.localeCompare(a.startDate))[0];

  if (!active) return null;

  const plan = plans.find(p => p.id === active.planId);
  if (!plan) return null;

  return { assignment: active, plan };
}

// ─── MEAL STATE WEEK SUMMARY (for coach macro adherence) ──────────────────────

// ─── ATHLETE NUTRITION CONFIG ─────────────────────────────────────────────────

export async function getAthleteNutritionConfig(athleteEmail: string): Promise<AthleteNutritionConfig> {
  const defaultConfig: AthleteNutritionConfig = { athleteId: athleteEmail, enabledModes: ['OMNIVORO'] };
  const localKey = `enforma_nutri_config_${athleteEmail}`;
  if (forceLocalOnly) {
    try {
      const raw = localStorage.getItem(localKey);
      return raw ? (JSON.parse(raw) as AthleteNutritionConfig) : defaultConfig;
    } catch (e) { return defaultConfig; }
  }
  try {
    const docRef = doc(db, 'athleteNutritionConfigs', athleteEmail);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as AthleteNutritionConfig;
      localStorage.setItem(localKey, JSON.stringify(data));
      return data;
    }
    // Doc not in Firestore — fall back to localStorage before using hard default
    try {
      const raw = localStorage.getItem(localKey);
      if (raw) return JSON.parse(raw) as AthleteNutritionConfig;
    } catch (_) {}
    return defaultConfig;
  } catch (err) {
    console.warn('getAthleteNutritionConfig Firestore failed, using local:', err);
    setLocalBypassMode(true);
    try {
      const raw = localStorage.getItem(localKey);
      return raw ? (JSON.parse(raw) as AthleteNutritionConfig) : defaultConfig;
    } catch (e) { return defaultConfig; }
  }
}

export async function saveAthleteNutritionConfig(config: AthleteNutritionConfig): Promise<void> {
  const localKey = `enforma_nutri_config_${config.athleteId}`;
  const data = { ...config };
  if (forceLocalOnly) {
    localStorage.setItem(localKey, JSON.stringify(data));
    return;
  }
  try {
    await setDoc(doc(db, 'athleteNutritionConfigs', config.athleteId), data);
    localStorage.setItem(localKey, JSON.stringify(data));
  } catch (err) {
    console.warn('saveAthleteNutritionConfig Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    localStorage.setItem(localKey, JSON.stringify(data));
  }
}

export function getMealStatesForWeek(userId: string, dates: string[]): MealState[] {
  const results: MealState[] = [];
  for (const date of dates) {
    try {
      const raw = localStorage.getItem(`enforma_meals_${userId}_${date}`);
      if (raw) results.push(JSON.parse(raw) as MealState);
    } catch (e) {}
  }
  return results;
}
