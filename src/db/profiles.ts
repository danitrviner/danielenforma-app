import { db, auth, collection, doc, getDoc, setDoc, getDocs, addDoc, updateDoc, deleteDoc, query, where, orderBy, limit } from '../firebase';
import { UserProfile, WeightCheckIn } from '../types';
import { forceLocalOnly, setLocalBypassMode, stripUndefined, authReady } from './core';
import { markInviteJoined } from './invites';

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
    level: 1,
    xp: 0,
    currentStreak: 0,
    maxStreak: 0,
    initialWeight: 0,
    targetWeight: 0,
    actualWeight: 0
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
export async function getOrCreateUserProfile(userId: string, email: string, displayName?: string, _retrying = false): Promise<UserProfile> {
  const isDanitrviner = email.toLowerCase() === 'danitrviner@gmail.com';
  
  if (forceLocalOnly) {
    return getLocalUserProfile(userId, email, displayName, isDanitrviner);
  }

  await authReady;
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
    // Valores a cero: un atleta recién dado de alta no tiene nivel, racha ni
    // pesos — los datos de demo aquí contaminaban las métricas reales.
    const defaultProfile: UserProfile = {
      userId,
      email,
      displayName: displayName || email.split('@')[0],
      role: isDanitrviner ? 'coach' : 'client',
      avatarUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCYz2_Air0WvwmWSYIQa5y_UDyaCn_Q6_9svDchpvtBkmUWTc8FiyWhSMuCjtRY7LlsNOw4V_5kLPOiJKltz34rykip9l0MOBlGocGYKgm8e52cdv4ITKm6PCscmnFqa-nyGlSEIQ0SR5yfQ-MMuRYVQuqIVZnGzTjaiE48OhsGciJFk_Ab8qsRKRmi_XQcWbQSWiHga5jHiVNC6Lp1hPwVFbwiVbD_Q4Qd3sMFxZiVeNoyuZKvU-Xm46DHhVyDcfKicnVJGjCcwF1K',
      level: 1,
      xp: 0,
      currentStreak: 0,
      maxStreak: 0,
      initialWeight: 0,
      targetWeight: 0,
      actualWeight: 0
    };

    await setDoc(docRef, stripUndefined(defaultProfile));
    saveLocalUserProfile(userId, defaultProfile);
    markInviteJoined(email).catch(() => {}); // best-effort, never blocks account creation
    return defaultProfile;
  } catch (err: any) {
    if (!_retrying && (err?.code === 'permission-denied' || err?.code === 'unauthenticated') && auth.currentUser) {
      // Auth token not yet propagated to Firestore SDK; retry once after a short delay.
      await new Promise(r => setTimeout(r, 400));
      return getOrCreateUserProfile(userId, email, displayName, true);
    }
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

export async function getAllUsersAdmin(): Promise<UserProfile[]> {
  if (forceLocalOnly) {
    const profiles: UserProfile[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('enforma_profile_')) {
          const raw = localStorage.getItem(key);
          if (raw) profiles.push(JSON.parse(raw));
        }
      }
    } catch (e) {}
    return deduplicateByEmail(profiles);
  }

  try {
    const snap = await getDocs(collection(db, 'user_profiles'));
    const profiles: UserProfile[] = [];
    snap.forEach(d => profiles.push(d.data() as UserProfile));
    return deduplicateByEmail(profiles);
  } catch (err) {
    console.warn('getAllUsersAdmin: Firestore failed:', err);
    return [];
  }
}

export async function updateUserProfile(userId: string, updates: Partial<UserProfile>): Promise<void> {
  if (forceLocalOnly) {
    updateLocalUserProfile(userId, updates);
    return;
  }

  try {
    const docRef = doc(db, 'user_profiles', userId);
    await updateDoc(docRef, stripUndefined(updates) as Record<string, unknown>);
    updateLocalUserProfile(userId, updates);
  } catch (err) {
    console.warn('Firestore user_profiles write failed, using local storage:', err);
    setLocalBypassMode(true);
    updateLocalUserProfile(userId, updates);
  }
}

// El coach lee sin filtro por atleta (para el badge de revisiones pendientes y
// las tarjetas de ClientsScreen/ClientHub) — sin límite esto crecía sin techo
// con el historial completo de todos los atletas en cada login/refresh del
// coach. 300 cubre de sobra el uso real (revisiones pendientes y último
// check-in por atleta son siempre recientes); un atleta muy longevo puede
// perder algún check-in muy antiguo del historial dentro de ClientHub — no
// hay paginación por atleta todavía, es la solución completa pendiente.
const COACH_CHECKINS_LIMIT = 300;

// Fetch Checkins.
// Pass userId for athlete reads (Firestore rules deny unfiltered list to athletes).
// Omit userId for coach reads (coach can read all).
export async function getCheckIns(userId?: string): Promise<WeightCheckIn[]> {
  if (forceLocalOnly) {
    const all = getLocalCheckIns();
    return userId ? all.filter(c => c.userId === userId) : all;
  }

  try {
    const colRef = collection(db, 'checkins');
    // where + orderBy on different fields requires a composite index, so we sort client-side
    const q = userId
      ? query(colRef, where('userId', '==', userId))
      : query(colRef, orderBy('timestamp', 'desc'), limit(COACH_CHECKINS_LIMIT));
    const querySnap = await getDocs(q);

    const entries: WeightCheckIn[] = [];
    querySnap.forEach((d) => {
      const data = d.data();
      // Legacy docs can be missing `timestamp` entirely — new Date(undefined) is an
      // Invalid Date that later blows up any .toISOString() call on it (ClientStatusCard
      // does this when picking the most recent checkin). Fall back to "now" instead.
      const parsed = data.timestamp?.toDate ? data.timestamp.toDate() : new Date(data.timestamp);
      entries.push({
        id: d.id,
        ...data,
        timestamp: isNaN(parsed.getTime()) ? new Date() : parsed,
      } as WeightCheckIn);
    });

    // Client-side sort when querying by userId (no composite index needed)
    if (userId) {
      entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }

    saveLocalCheckIns(entries);
    return entries;
  } catch (err) {
    console.warn('Firestore checkins read failed, using local storage:', err);
    setLocalBypassMode(true);
    const all = getLocalCheckIns();
    return userId ? all.filter(c => c.userId === userId) : all;
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
    const docRef = await addDoc(colRef, stripUndefined(newEntry));
    
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
    // Filter by userId so athletes can read without permissions error
    const snap = await getDocs(query(colRef, where('userId', '==', userId)));
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


export async function updateCheckIn(
  id: string,
  updates: Partial<Pick<WeightCheckIn, 'weight' | 'adherence' | 'mood' | 'notes' | 'dateStr'>>,
): Promise<void> {
  const data = stripUndefined(updates) as Record<string, unknown>;
  const patch = (list: WeightCheckIn[]) =>
    list.map(c => c.id === id ? { ...c, ...updates } : c);
  if (forceLocalOnly) { saveLocalCheckIns(patch(getLocalCheckIns())); return; }
  try {
    await updateDoc(doc(db, 'checkins', id), data);
    saveLocalCheckIns(patch(getLocalCheckIns()));
  } catch (err) {
    console.warn('updateCheckIn failed:', err);
    setLocalBypassMode(true);
    saveLocalCheckIns(patch(getLocalCheckIns()));
  }
}

export async function deleteCheckIn(id: string): Promise<void> {
  const remove = (list: WeightCheckIn[]) => list.filter(c => c.id !== id);
  if (forceLocalOnly) { saveLocalCheckIns(remove(getLocalCheckIns())); return; }
  try {
    await deleteDoc(doc(db, 'checkins', id));
    saveLocalCheckIns(remove(getLocalCheckIns()));
  } catch (err) {
    console.warn('deleteCheckIn failed:', err);
    setLocalBypassMode(true);
    saveLocalCheckIns(remove(getLocalCheckIns()));
  }
}


// ─── USER PROFILE BY EMAIL ────────────────────────────────────────────────────

export async function getUserProfileByEmail(email: string): Promise<UserProfile | null> {
  const normalEmail = email.toLowerCase();

  if (forceLocalOnly) {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key?.startsWith('enforma_profile_')) continue;
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const p = JSON.parse(raw) as UserProfile;
        if (p.email.toLowerCase() === normalEmail) return p;
      }
    } catch { }
    return null;
  }

  try {
    const q = query(collection(db, 'user_profiles'), where('email', '==', email));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const d = snap.docs[0];
      return { id: d.id, ...d.data(), userId: d.id } as unknown as UserProfile;
    }
    // Try lowercase variant
    const q2 = query(collection(db, 'user_profiles'), where('email', '==', normalEmail));
    const snap2 = await getDocs(q2);
    if (!snap2.empty) {
      const d = snap2.docs[0];
      return { ...d.data(), userId: d.id } as unknown as UserProfile;
    }
    return null;
  } catch (err) {
    console.warn('getUserProfileByEmail failed:', err);
    return null;
  }
}

