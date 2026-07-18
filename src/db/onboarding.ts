import { db, doc, getDoc, setDoc, updateDoc } from '../firebase';
import { OnboardingData, OnboardingTemplate } from '../types';
import { forceLocalOnly, setLocalBypassMode, stripUndefined } from './core';

// ─── ONBOARDING ───────────────────────────────────────────────────────────────

const ONBOARDING_LS = 'enforma_onboarding_v1';

function getLocalOnboardingAll(): OnboardingData[] {
  try { return JSON.parse(localStorage.getItem(ONBOARDING_LS) ?? '[]'); } catch { return []; }
}
function setLocalOnboardingAll(data: OnboardingData[]) {
  localStorage.setItem(ONBOARDING_LS, JSON.stringify(data));
}

export async function getOnboarding(email: string): Promise<OnboardingData | null> {
  const localAll = getLocalOnboardingAll();
  const local = localAll.find(o => o.athleteId === email) ?? null;
  if (forceLocalOnly) return local;
  try {
    const snap = await getDoc(doc(db, 'onboarding', email));
    if (!snap.exists()) return null;
    const data = snap.data() as OnboardingData;
    setLocalOnboardingAll([...localAll.filter(o => o.athleteId !== email), data]);
    return data;
  } catch (err) {
    console.warn('getOnboarding Firestore failed, using local:', err);
    return local;
  }
}

export async function updateOnboardingFoods(
  email: string,
  likedFoods: string[],
  dislikedFoods: string[],
): Promise<void> {
  const all = getLocalOnboardingAll();
  const existing = all.find(o => o.athleteId === email);
  if (existing) {
    setLocalOnboardingAll([
      ...all.filter(o => o.athleteId !== email),
      { ...existing, likedFoods, dislikedFoods },
    ]);
  }
  if (forceLocalOnly) return;
  try {
    await updateDoc(doc(db, 'onboarding', email), { likedFoods, dislikedFoods });
  } catch (err) {
    console.warn('updateOnboardingFoods Firestore failed:', err);
    setLocalBypassMode(true);
  }
}

export async function saveOnboarding(data: OnboardingData): Promise<void> {
  const others = getLocalOnboardingAll().filter(o => o.athleteId !== data.athleteId);
  setLocalOnboardingAll([...others, data]); // backup always saved locally
  if (forceLocalOnly) {
    throw new Error('Sin conexión con Firestore. Recarga la página e inténtalo de nuevo.');
  }
  await setDoc(doc(db, 'onboarding', data.athleteId), stripUndefined(data));
}

export async function updateOnboarding(data: OnboardingData): Promise<void> {
  const all = getLocalOnboardingAll();
  const existing = all.find(o => o.athleteId === data.athleteId);
  setLocalOnboardingAll([
    ...all.filter(o => o.athleteId !== data.athleteId),
    existing ? { ...existing, ...data } : data,
  ]); // backup always saved locally
  if (forceLocalOnly) {
    throw new Error('Sin conexión con Firestore. Recarga la página e inténtalo de nuevo.');
  }
  await updateDoc(doc(db, 'onboarding', data.athleteId), stripUndefined(data) as unknown as Record<string, unknown>);
}

// ── Onboarding template (per coach, keyed by coach email) ────────────────────

const OBT_LS = 'onboardingTemplates_local';

function getLocalOBT(coachEmail: string): OnboardingTemplate | null {
  try {
    const all = JSON.parse(localStorage.getItem(OBT_LS) || '{}') as Record<string, OnboardingTemplate>;
    return all[coachEmail] ?? null;
  } catch { return null; }
}

function setLocalOBT(coachEmail: string, tpl: OnboardingTemplate) {
  try {
    const all = JSON.parse(localStorage.getItem(OBT_LS) || '{}') as Record<string, OnboardingTemplate>;
    all[coachEmail] = tpl;
    localStorage.setItem(OBT_LS, JSON.stringify(all));
  } catch { /* ignore */ }
}

export async function getOnboardingTemplate(coachEmail: string): Promise<OnboardingTemplate | null> {
  const local = getLocalOBT(coachEmail);
  if (forceLocalOnly) return local;
  try {
    const snap = await getDoc(doc(db, 'onboardingTemplates', coachEmail));
    if (!snap.exists()) return null;
    const tpl = snap.data() as OnboardingTemplate;
    setLocalOBT(coachEmail, tpl);
    return tpl;
  } catch (err) {
    console.warn('getOnboardingTemplate Firestore failed, using local:', err);
    return local;
  }
}

export async function saveOnboardingTemplate(coachEmail: string, tpl: OnboardingTemplate): Promise<void> {
  setLocalOBT(coachEmail, tpl);
  if (forceLocalOnly) return;
  try {
    await setDoc(doc(db, 'onboardingTemplates', coachEmail), stripUndefined(tpl));
  } catch (err) {
    console.warn('saveOnboardingTemplate Firestore failed, saving local:', err);
    setLocalBypassMode(true);
  }
}

