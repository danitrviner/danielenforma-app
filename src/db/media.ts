import { db, storage, storageRef, uploadBytes, getDownloadURL, deleteObject, collection, doc, setDoc, getDocs, addDoc, updateDoc, deleteDoc, query, where } from '../firebase';
import { ProgressPhoto, PhotoView, PhotoAssignment } from '../types';
import { forceLocalOnly, setLocalBypassMode, stripUndefined } from './core';
import { compressImage } from '../utils/compressImage';

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
  const uploadData = await compressImage(file);
  await uploadBytes(sRef, uploadData);
  const url = await getDownloadURL(sRef);
  const photo: ProgressPhoto = {
    id: `${athleteEmail}_${date}_${view}`,
    athleteId: athleteEmail,
    date,
    view,
    url,
    uploadedAt: new Date().toISOString(),
  };
  await setDoc(doc(db, 'progressPhotos', photo.id), stripUndefined(photo));
  return photo;
}

export async function deleteProgressPhoto(photo: ProgressPhoto): Promise<void> {
  const path = `progressPhotos/${photo.athleteId}/${photo.date}_${photo.view}`;
  await deleteObject(storageRef(storage, path)).catch(() => {});
  await deleteDoc(doc(db, 'progressPhotos', photo.id));
}

// ─── PHOTO CHECK-IN ASSIGNMENTS ───────────────────────────────────────────────
// Collection: photoAssignments  (athleteId = email) — same shape/pattern as
// questionnaireAssignments, so the athlete's photo check-ins can have a
// pending/upcoming calendar like questionnaires do.

const LOCAL_PHOTO_ASSIGNMENTS = 'photoAssignments_v1';

function getLocalPhotoAssignments(): PhotoAssignment[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_PHOTO_ASSIGNMENTS) || '[]'); } catch { return []; }
}

export async function assignPhotoCheckIn(data: Omit<PhotoAssignment, 'id'>): Promise<PhotoAssignment> {
  const safeData = { ...data, schedule: data.schedule ?? { type: 'once' as const } };
  if (forceLocalOnly) {
    const a: PhotoAssignment = { ...safeData, id: `local_pa_${Date.now()}` };
    localStorage.setItem(LOCAL_PHOTO_ASSIGNMENTS, JSON.stringify([...getLocalPhotoAssignments(), a]));
    return a;
  }
  try {
    const ref = await addDoc(collection(db, 'photoAssignments'), stripUndefined(safeData));
    return { ...safeData, id: ref.id };
  } catch (err) {
    console.warn('assignPhotoCheckIn Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    const a: PhotoAssignment = { ...safeData, id: `local_pa_${Date.now()}` };
    localStorage.setItem(LOCAL_PHOTO_ASSIGNMENTS, JSON.stringify([...getLocalPhotoAssignments(), a]));
    return a;
  }
}

export async function getPhotoAssignmentsForAthlete(email: string): Promise<PhotoAssignment[]> {
  if (forceLocalOnly) return getLocalPhotoAssignments().filter(a => a.athleteId === email);
  try {
    const snap = await getDocs(query(collection(db, 'photoAssignments'), where('athleteId', '==', email)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as PhotoAssignment));
  } catch (err) {
    console.warn('getPhotoAssignmentsForAthlete Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getLocalPhotoAssignments().filter(a => a.athleteId === email);
  }
}

export async function deactivatePhotoAssignment(id: string): Promise<void> {
  if (forceLocalOnly) {
    localStorage.setItem(LOCAL_PHOTO_ASSIGNMENTS, JSON.stringify(getLocalPhotoAssignments().map(a => a.id === id ? { ...a, active: false } : a)));
    return;
  }
  try {
    await updateDoc(doc(db, 'photoAssignments', id), { active: false });
  } catch (err) {
    console.warn('deactivatePhotoAssignment Firestore failed:', err);
    setLocalBypassMode(true);
    localStorage.setItem(LOCAL_PHOTO_ASSIGNMENTS, JSON.stringify(getLocalPhotoAssignments().map(a => a.id === id ? { ...a, active: false } : a)));
  }
}


