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
  orderBy,
  storage,
  storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from './firebase';
import { UserProfile, WeightCheckIn, Exercise, Workout, WorkoutAssignment, WorkoutLog, MealItem, AthleteNutritionConfig, DietMode, Diet, AthleteDietConfig, Recipe, RecipeFavorites, ProgressPhoto, PhotoView } from './types';
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

// ── Profile de-duplication helpers ────────────────────────────────────────────

// Mock/sandbox user IDs that were never real Firebase Auth UIDs
function isDefaultUserId(userId: string): boolean {
  return /^(client|coach)_\w+_(default|local)$/.test(userId);
}

// Return one profile per email; prefer a real Firebase UID over a mock one.
function deduplicateByEmail(profiles: UserProfile[]): UserProfile[] {
  const byEmail = new Map<string, UserProfile>();
  for (const p of profiles) {
    const key = p.email.toLowerCase();
    const existing = byEmail.get(key);
    if (!existing) {
      byEmail.set(key, p);
    } else if (isDefaultUserId(existing.userId) && !isDefaultUserId(p.userId)) {
      byEmail.set(key, p); // prefer real Firebase UID
    }
  }
  return Array.from(byEmail.values());
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

    // Before creating, check if another doc already exists for this email (different UID).
    // This prevents duplicates when the same person re-registers via a different auth flow.
    try {
      const emailSnap = await getDocs(query(collection(db, 'user_profiles'), where('email', '==', email)));
      if (!emailSnap.empty) {
        const existing = emailSnap.docs[0].data() as UserProfile;
        // Keep existing Firestore doc; just cache it locally under the current UID.
        saveLocalUserProfile(userId, existing);
        return existing;
      }
    } catch (_) {
      // Email check failed; fall through to create new profile
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

    const deduped = deduplicateByEmail(profiles);
    if (deduped.length === 0) {
      deduped.push({
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
    return deduped;
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

    // De-duplicate by email: one canonical record per email
    const deduped = deduplicateByEmail(profiles);

    // Silently delete Firestore docs for "loser" duplicates
    if (deduped.length < profiles.length) {
      const keptIds = new Set(deduped.map(p => p.userId));
      for (const p of profiles) {
        if (!keptIds.has(p.userId)) {
          deleteDoc(doc(db, 'user_profiles', p.userId)).catch(() => {});
        }
      }
    }

    if (deduped.length === 0) {
      deduped.push({
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
    return deduped;
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
  const dropLocal = () => {
    saveLocalWorkouts(getLocalWorkouts().filter(w => w.id !== id));
    saveLocalAssignments(getLocalAssignments().filter(a => a.workoutId !== id));
  };
  if (forceLocalOnly) { dropLocal(); return; }
  try {
    await deleteDoc(doc(db, 'workouts', id));
    // Cascade: remove assignments that reference this workout
    const aSnap = await getDocs(query(collection(db, 'workoutAssignments'), where('workoutId', '==', id)));
    await Promise.all(aSnap.docs.map(d => deleteDoc(d.ref).catch(() => {})));
    dropLocal();
  } catch (err) {
    console.warn('deleteWorkout Firestore failed, deleting local:', err);
    setLocalBypassMode(true);
    dropLocal();
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

// ─── DIETS ────────────────────────────────────────────────────────────────────

const DIETS_LOCAL_KEY = 'enforma_diets_v1';

function getDietsFromLocal(): Diet[] {
  try {
    const raw = localStorage.getItem(DIETS_LOCAL_KEY);
    return raw ? (JSON.parse(raw) as Diet[]) : [];
  } catch { return []; }
}

function setDietsToLocal(diets: Diet[]): void {
  localStorage.setItem(DIETS_LOCAL_KEY, JSON.stringify(diets));
}

export async function getDietsForAthlete(athleteEmail: string): Promise<Diet[]> {
  if (forceLocalOnly) {
    return getDietsFromLocal().filter(d => d.athleteId === athleteEmail);
  }
  try {
    const q = query(collection(db, 'diets'), where('athleteId', '==', athleteEmail));
    const snap = await getDocs(q);
    const diets = snap.docs.map(d => ({ id: d.id, ...d.data() } as Diet));
    const others = getDietsFromLocal().filter(d => d.athleteId !== athleteEmail);
    setDietsToLocal([...others, ...diets]);
    return diets;
  } catch (err) {
    console.warn('getDietsForAthlete Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getDietsFromLocal().filter(d => d.athleteId === athleteEmail);
  }
}

export async function createDiet(data: Omit<Diet, 'id'>): Promise<Diet> {
  if (forceLocalOnly) {
    const diet: Diet = { id: `diet_${Date.now()}`, ...data };
    setDietsToLocal([...getDietsFromLocal(), diet]);
    return diet;
  }
  try {
    const ref = await addDoc(collection(db, 'diets'), data);
    const diet: Diet = { id: ref.id, ...data };
    setDietsToLocal([...getDietsFromLocal(), diet]);
    return diet;
  } catch (err) {
    console.warn('createDiet Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    const diet: Diet = { id: `diet_${Date.now()}`, ...data };
    setDietsToLocal([...getDietsFromLocal(), diet]);
    return diet;
  }
}

export async function updateDiet(id: string, updates: Partial<Diet>): Promise<void> {
  const all = getDietsFromLocal();
  const updated = all.map(d => d.id === id ? { ...d, ...updates } : d);
  if (forceLocalOnly) { setDietsToLocal(updated); return; }
  try {
    await updateDoc(doc(db, 'diets', id), updates as Record<string, unknown>);
    setDietsToLocal(updated);
  } catch (err) {
    console.warn('updateDiet Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    setDietsToLocal(updated);
  }
}

export async function deleteDiet(id: string): Promise<void> {
  const filtered = getDietsFromLocal().filter(d => d.id !== id);
  if (forceLocalOnly) { setDietsToLocal(filtered); return; }
  try {
    await deleteDoc(doc(db, 'diets', id));
    setDietsToLocal(filtered);
  } catch (err) {
    console.warn('deleteDiet Firestore failed, deleting local:', err);
    setLocalBypassMode(true);
    setDietsToLocal(filtered);
  }
}

// ─── ATHLETE DIET CONFIG ──────────────────────────────────────────────────────

export async function getAthleteDietConfig(athleteEmail: string): Promise<AthleteDietConfig> {
  const defaultCfg: AthleteDietConfig = { athleteId: athleteEmail, activeDietIds: [] };
  const localKey = `enforma_athlete_diet_config_${athleteEmail}`;
  if (forceLocalOnly) {
    try {
      const raw = localStorage.getItem(localKey);
      return raw ? JSON.parse(raw) : defaultCfg;
    } catch { return defaultCfg; }
  }
  try {
    const snap = await getDoc(doc(db, 'athleteDietConfigs', athleteEmail));
    if (snap.exists()) {
      const data = snap.data() as AthleteDietConfig;
      localStorage.setItem(localKey, JSON.stringify(data));
      return data;
    }
    try {
      const raw = localStorage.getItem(localKey);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return defaultCfg;
  } catch (err) {
    console.warn('getAthleteDietConfig Firestore failed, using local:', err);
    setLocalBypassMode(true);
    try {
      const raw = localStorage.getItem(localKey);
      return raw ? JSON.parse(raw) : defaultCfg;
    } catch { return defaultCfg; }
  }
}

export async function saveAthleteDietConfig(config: AthleteDietConfig): Promise<void> {
  const localKey = `enforma_athlete_diet_config_${config.athleteId}`;
  if (forceLocalOnly) { localStorage.setItem(localKey, JSON.stringify(config)); return; }
  try {
    await setDoc(doc(db, 'athleteDietConfigs', config.athleteId), config);
    localStorage.setItem(localKey, JSON.stringify(config));
  } catch (err) {
    console.warn('saveAthleteDietConfig Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    localStorage.setItem(localKey, JSON.stringify(config));
  }
}

// ─── RECIPES ─────────────────────────────────────────────────────────────────

const RECIPES_LOCAL_KEY = 'enforma_recipes_v1';

function getLocalRecipes(): Recipe[] {
  try {
    const raw = localStorage.getItem(RECIPES_LOCAL_KEY);
    return raw ? (JSON.parse(raw) as Recipe[]) : [];
  } catch { return []; }
}

function setLocalRecipes(recipes: Recipe[]): void {
  localStorage.setItem(RECIPES_LOCAL_KEY, JSON.stringify(recipes));
}

export async function getRecipes(): Promise<Recipe[]> {
  if (forceLocalOnly) return getLocalRecipes();
  try {
    const snap = await getDocs(collection(db, 'recipes'));
    const recipes = snap.docs.map(d => ({ id: d.id, ...d.data() } as Recipe));
    setLocalRecipes(recipes);
    return recipes;
  } catch (err) {
    console.warn('getRecipes Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getLocalRecipes();
  }
}

export async function createRecipe(data: Omit<Recipe, 'id'>): Promise<Recipe> {
  if (forceLocalOnly) {
    const recipe: Recipe = { id: `recipe_${Date.now()}`, ...data };
    setLocalRecipes([...getLocalRecipes(), recipe]);
    return recipe;
  }
  try {
    const ref = await addDoc(collection(db, 'recipes'), data);
    const recipe: Recipe = { id: ref.id, ...data };
    setLocalRecipes([...getLocalRecipes(), recipe]);
    return recipe;
  } catch (err) {
    console.warn('createRecipe Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    const recipe: Recipe = { id: `recipe_${Date.now()}`, ...data };
    setLocalRecipes([...getLocalRecipes(), recipe]);
    return recipe;
  }
}

export async function updateRecipe(id: string, updates: Partial<Omit<Recipe, 'id'>>): Promise<void> {
  const all = getLocalRecipes();
  const updated = all.map(r => r.id === id ? { ...r, ...updates } : r);
  if (forceLocalOnly) { setLocalRecipes(updated); return; }
  try {
    await updateDoc(doc(db, 'recipes', id), updates as Record<string, unknown>);
    setLocalRecipes(updated);
  } catch (err) {
    console.warn('updateRecipe Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    setLocalRecipes(updated);
  }
}

export async function deleteRecipe(id: string): Promise<void> {
  const filtered = getLocalRecipes().filter(r => r.id !== id);
  if (forceLocalOnly) { setLocalRecipes(filtered); return; }
  try {
    await deleteDoc(doc(db, 'recipes', id));
    setLocalRecipes(filtered);
  } catch (err) {
    console.warn('deleteRecipe Firestore failed, deleting local:', err);
    setLocalBypassMode(true);
    setLocalRecipes(filtered);
  }
}

// ─── RECIPE FAVORITES ─────────────────────────────────────────────────────────

export async function getRecipeFavorites(athleteEmail: string): Promise<RecipeFavorites> {
  const defaultFav: RecipeFavorites = { athleteId: athleteEmail, recipeIds: [] };
  const localKey = `enforma_recipe_favorites_${athleteEmail}`;
  if (forceLocalOnly) {
    try {
      const raw = localStorage.getItem(localKey);
      return raw ? JSON.parse(raw) : defaultFav;
    } catch { return defaultFav; }
  }
  try {
    const snap = await getDoc(doc(db, 'recipeFavorites', athleteEmail));
    if (snap.exists()) {
      const data = snap.data() as RecipeFavorites;
      localStorage.setItem(localKey, JSON.stringify(data));
      return data;
    }
    try {
      const raw = localStorage.getItem(localKey);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return defaultFav;
  } catch (err) {
    console.warn('getRecipeFavorites Firestore failed, using local:', err);
    setLocalBypassMode(true);
    try {
      const raw = localStorage.getItem(localKey);
      return raw ? JSON.parse(raw) : defaultFav;
    } catch { return defaultFav; }
  }
}

export async function saveRecipeFavorites(favs: RecipeFavorites): Promise<void> {
  const localKey = `enforma_recipe_favorites_${favs.athleteId}`;
  if (forceLocalOnly) { localStorage.setItem(localKey, JSON.stringify(favs)); return; }
  try {
    await setDoc(doc(db, 'recipeFavorites', favs.athleteId), favs);
    localStorage.setItem(localKey, JSON.stringify(favs));
  } catch (err) {
    console.warn('saveRecipeFavorites Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    localStorage.setItem(localKey, JSON.stringify(favs));
  }
}

// ─── PROGRESS PHOTOS ──────────────────────────────────────────────────────────

export async function getProgressPhotos(athleteEmail: string): Promise<ProgressPhoto[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'progressPhotos'), where('athleteId', '==', athleteEmail))
    );
    return snap.docs
      .map(d => d.data() as ProgressPhoto)
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch (err) {
    console.warn('getProgressPhotos failed:', err);
    return [];
  }
}

export async function uploadProgressPhoto(
  athleteEmail: string,
  date: string,
  view: PhotoView,
  file: File
): Promise<ProgressPhoto> {
  const path = `progressPhotos/${athleteEmail}/${date}_${view}`;
  const sRef = storageRef(storage, path);
  await uploadBytes(sRef, file);
  const url = await getDownloadURL(sRef);
  const photo: ProgressPhoto = {
    id: `${athleteEmail}_${date}_${view}`,
    athleteId: athleteEmail,
    date,
    view,
    url,
    uploadedAt: new Date().toISOString(),
  };
  await setDoc(doc(db, 'progressPhotos', photo.id), photo);
  return photo;
}

export async function deleteProgressPhoto(photo: ProgressPhoto): Promise<void> {
  const path = `progressPhotos/${photo.athleteId}/${photo.date}_${photo.view}`;
  await deleteObject(storageRef(storage, path)).catch(() => {});
  await deleteDoc(doc(db, 'progressPhotos', photo.id));
}

// ─── ONE-TIME CLEANUP ──────────────────────────────────────────────────────────
// Removes ZZ_TEST test data and orphaned workout assignments. Runs once per
// browser (guarded by a localStorage flag). Safe to call on every app boot.

export async function cleanupTestDataOnce(): Promise<void> {
  const FLAG = 'enforma_cleanup_v1_done';
  if (localStorage.getItem(FLAG) === 'true') return;

  if (forceLocalOnly) {
    // Local-only path: purge ZZ_TEST items by name
    const keptWorkouts = getLocalWorkouts().filter(w => !w.name.includes('ZZ_TEST'));
    const keptIds = new Set(keptWorkouts.map(w => w.id));
    saveLocalWorkouts(keptWorkouts);
    saveLocalAssignments(getLocalAssignments().filter(a => keptIds.has(a.workoutId)));
    // local diets cleanup
    const keptDiets = getDietsFromLocal().filter(d => !d.name.includes('ZZ_TEST'));
    setDietsToLocal(keptDiets);
    localStorage.setItem(FLAG, 'true');
    return;
  }

  try {
    // 1. Delete ZZ_TEST diets from Firestore; collect their IDs
    const dietSnap = await getDocs(collection(db, 'diets'));
    const zzDietIds = new Set<string>();
    for (const d of dietSnap.docs) {
      const name = (d.data() as { name?: string }).name ?? '';
      if (name.includes('ZZ_TEST')) {
        zzDietIds.add(d.id);
        await deleteDoc(doc(db, 'diets', d.id)).catch(() => {});
      }
    }

    // 2. Scrub deleted diet IDs from athleteDietConfigs
    if (zzDietIds.size > 0) {
      const cfgSnap = await getDocs(collection(db, 'athleteDietConfigs'));
      for (const d of cfgSnap.docs) {
        const ids: string[] = (d.data() as { activeDietIds?: string[] }).activeDietIds ?? [];
        const next = ids.filter(id => !zzDietIds.has(id));
        if (next.length !== ids.length) {
          await updateDoc(doc(db, 'athleteDietConfigs', d.id), { activeDietIds: next }).catch(() => {});
        }
      }
    }

    // 3. Delete ZZ_TEST workouts; collect all valid workout IDs
    const workoutSnap = await getDocs(collection(db, 'workouts'));
    const validWorkoutIds = new Set<string>();
    for (const d of workoutSnap.docs) {
      const name = (d.data() as { name?: string }).name ?? '';
      if (name.includes('ZZ_TEST')) {
        await deleteDoc(doc(db, 'workouts', d.id)).catch(() => {});
      } else {
        validWorkoutIds.add(d.id);
      }
    }

    // 4. Delete every assignment whose workoutId is NOT in validWorkoutIds (orphans + ZZ refs)
    const assignSnap = await getDocs(collection(db, 'workoutAssignments'));
    for (const d of assignSnap.docs) {
      const wid = (d.data() as { workoutId?: string }).workoutId ?? '';
      if (!validWorkoutIds.has(wid)) {
        await deleteDoc(doc(db, 'workoutAssignments', d.id)).catch(() => {});
      }
    }

    // 5. Mirror cleanup in localStorage
    const keptWk = getLocalWorkouts().filter(w => validWorkoutIds.has(w.id));
    saveLocalWorkouts(keptWk);
    const keptIds = new Set(keptWk.map(w => w.id));
    saveLocalAssignments(getLocalAssignments().filter(a => keptIds.has(a.workoutId)));
    setDietsToLocal(getDietsFromLocal().filter(d => !zzDietIds.has(d.id) && !d.name.includes('ZZ_TEST')));

    localStorage.setItem(FLAG, 'true');
    console.log('[cleanup v1] ZZ_TEST data and orphaned assignments removed.');
  } catch (err) {
    // Don't set the flag — next load will retry
    console.warn('[cleanup v1] Incomplete, will retry:', err);
  }
}
