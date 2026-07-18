import { db, collection, doc, getDoc, setDoc, getDocs, deleteDoc, query, where } from '../firebase';
import { Roadmap, LevelLadder, WeeklyChallenge, ChallengeTemplate } from '../types';
import { forceLocalOnly, setLocalBypassMode, stripUndefined } from './core';

// ─── ROADMAPS ─────────────────────────────────────────────────────────────────

const LOCAL_ROADMAP = 'enforma_roadmaps_v1';

function getLocalRoadmaps(): Roadmap[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_ROADMAP) || '[]'); } catch { return []; }
}
function saveLocalRoadmaps(list: Roadmap[]): void {
  localStorage.setItem(LOCAL_ROADMAP, JSON.stringify(list));
}

export async function getRoadmap(athleteEmail: string): Promise<Roadmap> {
  const empty: Roadmap = { athleteId: athleteEmail, items: [] };
  if (forceLocalOnly) {
    return getLocalRoadmaps().find(r => r.athleteId === athleteEmail) ?? empty;
  }
  try {
    const snap = await getDoc(doc(db, 'roadmaps', athleteEmail));
    if (!snap.exists()) return empty;
    return { athleteId: athleteEmail, ...snap.data() } as Roadmap;
  } catch (err) {
    console.warn('getRoadmap Firestore failed:', err);
    setLocalBypassMode(true);
    return getLocalRoadmaps().find(r => r.athleteId === athleteEmail) ?? empty;
  }
}

export async function saveRoadmap(roadmap: Roadmap): Promise<void> {
  const { athleteId, ...rest } = roadmap;
  const data = stripUndefined(rest);
  if (forceLocalOnly) {
    const list = getLocalRoadmaps().filter(r => r.athleteId !== athleteId);
    saveLocalRoadmaps([...list, roadmap]);
    return;
  }
  try {
    await setDoc(doc(db, 'roadmaps', athleteId), data);
    const list = getLocalRoadmaps().filter(r => r.athleteId !== athleteId);
    saveLocalRoadmaps([...list, roadmap]);
  } catch (err) {
    console.warn('saveRoadmap Firestore failed:', err);
    setLocalBypassMode(true);
    const list = getLocalRoadmaps().filter(r => r.athleteId !== athleteId);
    saveLocalRoadmaps([...list, roadmap]);
  }
}

// Escritura parcial para el atleta al subir de nivel: merge solo del campo
// levelLadder, sin tocar items/planPhases/challengeConfig. El saveRoadmap
// completo desde el snapshot del atleta podía revertir ediciones de fases que
// el coach hubiera hecho después de que el atleta cargara la pantalla.
export async function saveRoadmapLevelProgress(athleteEmail: string, ladder: LevelLadder): Promise<void> {
  const patchLocal = () => {
    const list = getLocalRoadmaps();
    const rm = list.find(r => r.athleteId === athleteEmail) ?? { athleteId: athleteEmail, items: [] };
    saveLocalRoadmaps([...list.filter(r => r.athleteId !== athleteEmail), { ...rm, levelLadder: ladder }]);
  };
  if (forceLocalOnly) { patchLocal(); return; }
  try {
    await setDoc(doc(db, 'roadmaps', athleteEmail), { levelLadder: stripUndefined(ladder) }, { merge: true });
    patchLocal();
  } catch (err) {
    // Auto-reparable: los niveles se recalculan de los logs en la próxima visita.
    console.warn('saveRoadmapLevelProgress Firestore failed:', err);
    patchLocal();
  }
}

// ─── WEEKLY CHALLENGES (docId = `${email}_${isoWeek}`) ────────────────────────

const LOCAL_CHALLENGES = 'enforma_weekly_challenges_v1';

function getLocalChallenges(): WeeklyChallenge[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_CHALLENGES) || '[]'); } catch { return []; }
}
function saveLocalChallenges(list: WeeklyChallenge[]): void {
  localStorage.setItem(LOCAL_CHALLENGES, JSON.stringify(list));
}
function upsertLocalChallenge(ch: WeeklyChallenge): void {
  saveLocalChallenges([...getLocalChallenges().filter(c => c.id !== ch.id), ch]);
}

export function weeklyChallengeDocId(athleteEmail: string, isoWeek: string): string {
  return `${athleteEmail}_${isoWeek}`;
}

export async function getWeeklyChallenge(athleteEmail: string, isoWeek: string): Promise<WeeklyChallenge | null> {
  const id = weeklyChallengeDocId(athleteEmail, isoWeek);
  if (forceLocalOnly) {
    return getLocalChallenges().find(c => c.id === id) ?? null;
  }
  try {
    const snap = await getDoc(doc(db, 'weeklyChallenges', id));
    if (!snap.exists()) return null;
    return { ...snap.data(), id } as WeeklyChallenge;
  } catch (err) {
    console.warn('getWeeklyChallenge Firestore failed:', err);
    setLocalBypassMode(true);
    return getLocalChallenges().find(c => c.id === id) ?? null;
  }
}

// Blind setDoc sobre ID determinista: un único reto por atleta y semana ISO,
// idempotente para el auto-generador (generate-on-read) y sobrescribible por
// el coach al asignar manualmente.
export async function saveWeeklyChallenge(challenge: WeeklyChallenge): Promise<void> {
  const data = stripUndefined(challenge);
  if (forceLocalOnly) {
    upsertLocalChallenge(challenge);
    return;
  }
  try {
    await setDoc(doc(db, 'weeklyChallenges', challenge.id), data);
    upsertLocalChallenge(challenge);
  } catch (err) {
    console.warn('saveWeeklyChallenge Firestore failed:', err);
    setLocalBypassMode(true);
    upsertLocalChallenge(challenge);
  }
}

export async function getWeeklyChallengesForAthlete(athleteEmail: string): Promise<WeeklyChallenge[]> {
  if (forceLocalOnly) {
    return getLocalChallenges()
      .filter(c => c.athleteId === athleteEmail)
      .sort((a, b) => b.isoWeek.localeCompare(a.isoWeek));
  }
  try {
    const snap = await getDocs(
      query(collection(db, 'weeklyChallenges'), where('athleteId', '==', athleteEmail))
    );
    const list = snap.docs.map(d => ({ ...d.data(), id: d.id } as WeeklyChallenge));
    list.sort((a, b) => b.isoWeek.localeCompare(a.isoWeek));
    return list;
  } catch (err) {
    console.warn('getWeeklyChallengesForAthlete Firestore failed:', err);
    setLocalBypassMode(true);
    return getLocalChallenges()
      .filter(c => c.athleteId === athleteEmail)
      .sort((a, b) => b.isoWeek.localeCompare(a.isoWeek));
  }
}

// ─── CHALLENGE TEMPLATES (biblioteca de retos del coach) ──────────────────────

const LOCAL_CHALLENGE_TEMPLATES = 'enforma_challenge_templates_v1';

function getLocalChallengeTemplates(): ChallengeTemplate[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_CHALLENGE_TEMPLATES) || '[]'); } catch { return []; }
}
function saveLocalChallengeTemplates(list: ChallengeTemplate[]): void {
  localStorage.setItem(LOCAL_CHALLENGE_TEMPLATES, JSON.stringify(list));
}

export async function getChallengeTemplates(): Promise<ChallengeTemplate[]> {
  if (forceLocalOnly) return getLocalChallengeTemplates();
  try {
    const snap = await getDocs(collection(db, 'challengeTemplates'));
    const list = snap.docs.map(d => ({ ...d.data(), id: d.id } as ChallengeTemplate));
    list.sort((a, b) => a.title.localeCompare(b.title));
    saveLocalChallengeTemplates(list);
    return list;
  } catch (err) {
    console.warn('getChallengeTemplates Firestore failed:', err);
    setLocalBypassMode(true);
    return getLocalChallengeTemplates();
  }
}

export async function saveChallengeTemplate(template: ChallengeTemplate): Promise<void> {
  const data = stripUndefined(template);
  const upsertLocal = () =>
    saveLocalChallengeTemplates([...getLocalChallengeTemplates().filter(t => t.id !== template.id), template]);
  if (forceLocalOnly) {
    upsertLocal();
    return;
  }
  try {
    await setDoc(doc(db, 'challengeTemplates', template.id), data);
    upsertLocal();
  } catch (err) {
    console.warn('saveChallengeTemplate Firestore failed:', err);
    setLocalBypassMode(true);
    upsertLocal();
  }
}

export async function deleteChallengeTemplate(templateId: string): Promise<void> {
  const removeLocal = () =>
    saveLocalChallengeTemplates(getLocalChallengeTemplates().filter(t => t.id !== templateId));
  if (forceLocalOnly) {
    removeLocal();
    return;
  }
  try {
    await deleteDoc(doc(db, 'challengeTemplates', templateId));
    removeLocal();
  } catch (err) {
    console.warn('deleteChallengeTemplate Firestore failed:', err);
    setLocalBypassMode(true);
    removeLocal();
  }
}

