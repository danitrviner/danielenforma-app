import { db, collection, doc, setDoc, getDocs, deleteDoc, query, where, orderBy } from '../firebase';
import { CoachReport } from '../types';
import { forceLocalOnly, setLocalBypassMode, stripUndefined } from './core';

// ─── COACH REPORTS (persistent coach→athlete performance/nutrition reports) ─────

const COACH_REPORTS_LOCAL_KEY = 'enforma_coach_reports_v1';

function getLocalCoachReports(): CoachReport[] {
  try {
    const raw = localStorage.getItem(COACH_REPORTS_LOCAL_KEY);
    return raw ? (JSON.parse(raw) as CoachReport[]) : [];
  } catch { return []; }
}

function saveLocalCoachReports(reports: CoachReport[]): void {
  localStorage.setItem(COACH_REPORTS_LOCAL_KEY, JSON.stringify(reports));
}

// Coach view — all reports (drafts + sent) for one athlete, newest first.
export async function getCoachReportsForAthlete(athleteId: string): Promise<CoachReport[]> {
  const local = getLocalCoachReports().filter(r => r.athleteId === athleteId);
  if (forceLocalOnly) return local.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  try {
    const q = query(collection(db, 'coachReports'), where('athleteId', '==', athleteId), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as CoachReport));
  } catch (err) {
    console.warn('getCoachReportsForAthlete Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return local.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

// Athlete view — only sent reports (Firestore rules block drafts, so the query
// must constrain status to 'sent' or it would be rejected). Newest first.
export async function getSentReportsForAthlete(athleteId: string): Promise<CoachReport[]> {
  const local = getLocalCoachReports().filter(r => r.athleteId === athleteId && r.status === 'sent');
  if (forceLocalOnly) return local.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  try {
    const q = query(
      collection(db, 'coachReports'),
      where('athleteId', '==', athleteId),
      where('status', '==', 'sent'),
      orderBy('createdAt', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as CoachReport));
  } catch (err) {
    console.warn('getSentReportsForAthlete Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return local.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

// Upsert (create or update). Deterministic doc id lives on the report itself so
// draft→sent edits keep the same document. Fires a notification when a report is
// sent (status 'sent' with a fresh sentAt handled by the caller).
export async function saveCoachReport(report: CoachReport): Promise<void> {
  const others = getLocalCoachReports().filter(r => r.id !== report.id);
  saveLocalCoachReports([...others, report]);
  if (forceLocalOnly) return;
  try {
    await setDoc(doc(db, 'coachReports', report.id), stripUndefined(report));
  } catch (err) {
    console.warn('saveCoachReport Firestore failed, saving local:', err);
    setLocalBypassMode(true);
  }
}

export async function deleteCoachReport(id: string): Promise<void> {
  const filtered = getLocalCoachReports().filter(r => r.id !== id);
  if (forceLocalOnly) { saveLocalCoachReports(filtered); return; }
  try {
    await deleteDoc(doc(db, 'coachReports', id));
    saveLocalCoachReports(filtered);
  } catch (err) {
    console.warn('deleteCoachReport Firestore failed, deleting local:', err);
    setLocalBypassMode(true);
    saveLocalCoachReports(filtered);
  }
}

