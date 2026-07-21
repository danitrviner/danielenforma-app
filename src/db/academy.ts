import { db, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, where } from '../firebase';
import { AcademyCourse, AcademyLesson, AcademyProgress, AcademyAccess } from '../types';
import { forceLocalOnly, setLocalBypassMode, stripUndefined } from './core';

// ─── COURSES ────────────────────────────────────────────────────────────────

const COURSES_LOCAL_KEY = 'enforma_academy_courses_v1';

function getLocalCourses(): AcademyCourse[] {
  try { return JSON.parse(localStorage.getItem(COURSES_LOCAL_KEY) || '[]'); } catch { return []; }
}
function saveLocalCourses(list: AcademyCourse[]): void {
  localStorage.setItem(COURSES_LOCAL_KEY, JSON.stringify(list));
}

export async function getAllCourses(): Promise<AcademyCourse[]> {
  if (forceLocalOnly) return getLocalCourses();
  try {
    const snap = await getDocs(collection(db, 'academyCourses'));
    const courses = snap.docs.map(d => ({ id: d.id, ...d.data() } as AcademyCourse));
    saveLocalCourses(courses);
    return courses;
  } catch (err) {
    console.warn('getAllCourses Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getLocalCourses();
  }
}

export async function createCourse(data: Omit<AcademyCourse, 'id'>): Promise<AcademyCourse> {
  if (forceLocalOnly) {
    const course: AcademyCourse = { ...data, id: `local_course_${Date.now()}` };
    saveLocalCourses([...getLocalCourses(), course]);
    return course;
  }
  try {
    const ref = await addDoc(collection(db, 'academyCourses'), stripUndefined(data));
    const course: AcademyCourse = { ...data, id: ref.id };
    saveLocalCourses([...getLocalCourses(), course]);
    return course;
  } catch (err) {
    console.warn('createCourse Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    const course: AcademyCourse = { ...data, id: `local_course_${Date.now()}` };
    saveLocalCourses([...getLocalCourses(), course]);
    return course;
  }
}

export async function updateCourse(id: string, updates: Partial<AcademyCourse>): Promise<void> {
  const updated = getLocalCourses().map(c => c.id === id ? { ...c, ...updates } : c);
  if (forceLocalOnly) { saveLocalCourses(updated); return; }
  try {
    await updateDoc(doc(db, 'academyCourses', id), stripUndefined(updates) as Record<string, unknown>);
    saveLocalCourses(updated);
  } catch (err) {
    console.warn('updateCourse Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    saveLocalCourses(updated);
  }
}

export async function deleteCourse(id: string): Promise<void> {
  const filtered = getLocalCourses().filter(c => c.id !== id);
  if (forceLocalOnly) { saveLocalCourses(filtered); return; }
  try {
    await deleteDoc(doc(db, 'academyCourses', id));
    saveLocalCourses(filtered);
  } catch (err) {
    console.warn('deleteCourse Firestore failed, deleting local:', err);
    setLocalBypassMode(true);
    saveLocalCourses(filtered);
  }
}

// ─── LESSONS ────────────────────────────────────────────────────────────────

const LESSONS_LOCAL_KEY = 'enforma_academy_lessons_v1';

function getLocalLessons(): AcademyLesson[] {
  try { return JSON.parse(localStorage.getItem(LESSONS_LOCAL_KEY) || '[]'); } catch { return []; }
}
function saveLocalLessons(list: AcademyLesson[]): void {
  localStorage.setItem(LESSONS_LOCAL_KEY, JSON.stringify(list));
}

export async function getAllLessons(): Promise<AcademyLesson[]> {
  if (forceLocalOnly) return getLocalLessons();
  try {
    const snap = await getDocs(collection(db, 'academyLessons'));
    const lessons = snap.docs.map(d => ({ id: d.id, ...d.data() } as AcademyLesson));
    saveLocalLessons(lessons);
    return lessons;
  } catch (err) {
    console.warn('getAllLessons Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getLocalLessons();
  }
}

export async function createLesson(data: Omit<AcademyLesson, 'id'>): Promise<AcademyLesson> {
  if (forceLocalOnly) {
    const lesson: AcademyLesson = { ...data, id: `local_lesson_${Date.now()}` };
    saveLocalLessons([...getLocalLessons(), lesson]);
    return lesson;
  }
  try {
    const ref = await addDoc(collection(db, 'academyLessons'), stripUndefined(data));
    const lesson: AcademyLesson = { ...data, id: ref.id };
    saveLocalLessons([...getLocalLessons(), lesson]);
    return lesson;
  } catch (err) {
    console.warn('createLesson Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    const lesson: AcademyLesson = { ...data, id: `local_lesson_${Date.now()}` };
    saveLocalLessons([...getLocalLessons(), lesson]);
    return lesson;
  }
}

export async function updateLesson(id: string, updates: Partial<AcademyLesson>): Promise<void> {
  const updated = getLocalLessons().map(l => l.id === id ? { ...l, ...updates } : l);
  if (forceLocalOnly) { saveLocalLessons(updated); return; }
  try {
    await updateDoc(doc(db, 'academyLessons', id), stripUndefined(updates) as Record<string, unknown>);
    saveLocalLessons(updated);
  } catch (err) {
    console.warn('updateLesson Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    saveLocalLessons(updated);
  }
}

export async function deleteLesson(id: string): Promise<void> {
  const filtered = getLocalLessons().filter(l => l.id !== id);
  if (forceLocalOnly) { saveLocalLessons(filtered); return; }
  try {
    await deleteDoc(doc(db, 'academyLessons', id));
    saveLocalLessons(filtered);
  } catch (err) {
    console.warn('deleteLesson Firestore failed, deleting local:', err);
    setLocalBypassMode(true);
    saveLocalLessons(filtered);
  }
}

// ─── PROGRESS (doc id = athleteId/email) ───────────────────────────────────

const PROGRESS_LOCAL_KEY = 'enforma_academy_progress_v1';

function getLocalProgressMap(): Record<string, AcademyProgress> {
  try { return JSON.parse(localStorage.getItem(PROGRESS_LOCAL_KEY) || '{}'); } catch { return {}; }
}
function saveLocalProgressMap(map: Record<string, AcademyProgress>): void {
  localStorage.setItem(PROGRESS_LOCAL_KEY, JSON.stringify(map));
}

const emptyProgress = (athleteId: string): AcademyProgress => ({ athleteId, completed: {}, courseProgress: {} });

export async function getAcademyProgress(athleteId: string): Promise<AcademyProgress> {
  if (forceLocalOnly) return getLocalProgressMap()[athleteId] ?? emptyProgress(athleteId);
  try {
    const snap = await getDoc(doc(db, 'academyProgress', athleteId));
    const progress = snap.exists() ? (snap.data() as AcademyProgress) : emptyProgress(athleteId);
    const map = getLocalProgressMap();
    map[athleteId] = progress;
    saveLocalProgressMap(map);
    return progress;
  } catch (err) {
    console.warn('getAcademyProgress Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getLocalProgressMap()[athleteId] ?? emptyProgress(athleteId);
  }
}

// Marks a lesson complete and recomputes the parent course's percentage.
// courseLessonIds is every lesson id belonging to that course (caller already
// has the course's lessons loaded — avoids a second query here).
export async function markLessonComplete(athleteId: string, lessonId: string, courseId: string, courseLessonIds: string[]): Promise<AcademyProgress> {
  const current = await getAcademyProgress(athleteId);
  const completed = { ...current.completed, [lessonId]: new Date().toISOString() };
  const doneInCourse = courseLessonIds.filter(id => completed[id]).length;
  const pct = courseLessonIds.length > 0 ? Math.round((doneInCourse / courseLessonIds.length) * 100) : 0;
  const progress: AcademyProgress = {
    athleteId,
    completed,
    courseProgress: { ...current.courseProgress, [courseId]: pct },
    lastLessonId: lessonId,
    lastCourseId: courseId,
  };
  if (forceLocalOnly) {
    const map = getLocalProgressMap();
    map[athleteId] = progress;
    saveLocalProgressMap(map);
    return progress;
  }
  try {
    await setDoc(doc(db, 'academyProgress', athleteId), stripUndefined(progress), { merge: true });
    const map = getLocalProgressMap();
    map[athleteId] = progress;
    saveLocalProgressMap(map);
    return progress;
  } catch (err) {
    console.warn('markLessonComplete Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    const map = getLocalProgressMap();
    map[athleteId] = progress;
    saveLocalProgressMap(map);
    return progress;
  }
}

// ─── ACCESS (capa 1 — quién ve la pestaña Academia, doc id = athleteId) ────

const ACCESS_LOCAL_KEY = 'enforma_academy_access_v1';

function getLocalAccessMap(): Record<string, AcademyAccess> {
  try { return JSON.parse(localStorage.getItem(ACCESS_LOCAL_KEY) || '{}'); } catch { return {}; }
}
function saveLocalAccessMap(map: Record<string, AcademyAccess>): void {
  localStorage.setItem(ACCESS_LOCAL_KEY, JSON.stringify(map));
}

export async function getAllAcademyAccess(): Promise<AcademyAccess[]> {
  if (forceLocalOnly) return Object.values(getLocalAccessMap());
  try {
    const snap = await getDocs(collection(db, 'academyAccess'));
    const list = snap.docs.map(d => ({ athleteId: d.id, ...d.data() } as AcademyAccess));
    const map: Record<string, AcademyAccess> = {};
    list.forEach(a => { map[a.athleteId] = a; });
    saveLocalAccessMap(map);
    return list;
  } catch (err) {
    console.warn('getAllAcademyAccess Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return Object.values(getLocalAccessMap());
  }
}

export async function getAcademyAccess(athleteId: string): Promise<AcademyAccess | null> {
  if (forceLocalOnly) return getLocalAccessMap()[athleteId] ?? null;
  try {
    const snap = await getDoc(doc(db, 'academyAccess', athleteId));
    const access = snap.exists() ? (snap.data() as AcademyAccess) : null;
    const map = getLocalAccessMap();
    if (access) map[athleteId] = access; else delete map[athleteId];
    saveLocalAccessMap(map);
    return access;
  } catch (err) {
    console.warn('getAcademyAccess Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getLocalAccessMap()[athleteId] ?? null;
  }
}

export async function setAcademyAccess(athleteId: string, enabled: boolean, grantedBy: string, grantedCourses?: string[]): Promise<AcademyAccess> {
  const access: AcademyAccess = { athleteId, enabled, grantedCourses, grantedBy, grantedAt: new Date().toISOString() };
  if (forceLocalOnly) {
    const map = getLocalAccessMap();
    map[athleteId] = access;
    saveLocalAccessMap(map);
    return access;
  }
  try {
    await setDoc(doc(db, 'academyAccess', athleteId), stripUndefined(access), { merge: true });
    const map = getLocalAccessMap();
    map[athleteId] = access;
    saveLocalAccessMap(map);
    return access;
  } catch (err) {
    console.warn('setAcademyAccess Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    const map = getLocalAccessMap();
    map[athleteId] = access;
    saveLocalAccessMap(map);
    return access;
  }
}
