import { db, storage, storageRef, uploadBytes, getDownloadURL, deleteObject, collection, doc, setDoc, getDocs, addDoc, updateDoc, deleteDoc, query, where } from '../firebase';
import { ProgressPhoto, PhotoView, PhotoAssignment } from '../types';
import { forceLocalOnly, setLocalBypassMode, stripUndefined, esFalloDePermisos } from './core';
import { compressImage } from '../utils/compressImage';

// ─── PROGRESS PHOTOS ──────────────────────────────────────────────────────────

/* 05-11. Este era el único módulo del atleta sin respaldo local: el `catch` de
   la lectura hacía `console.warn` y devolvía `[]`, y la pantalla no tiene forma
   de distinguir «no tienes fotos» de «no he podido leerlas». El atleta veía
   «Sube tu primera foto para empezar a registrar tu evolución» encima de sus
   seis meses de fotos y se creía que se habían borrado. Son, además, las fotos
   de su cuerpo: el dato más sensible que guarda la app.

   Ahora hay copia local, como en el resto de dominios, y el array vacío vuelve
   a significar una sola cosa. Cuando la lectura falla y NO hay copia de la que
   tirar, la función relanza: es mejor que la pantalla enseñe un error a que
   afirme algo que no sabe. */

const LOCAL_PROGRESS_PHOTOS = 'enforma_progress_photos_v1';

function clavePorAtleta(athleteEmail: string): string {
  return `${LOCAL_PROGRESS_PHOTOS}_${athleteEmail}`;
}

function getLocalProgressPhotos(athleteEmail: string): ProgressPhoto[] | null {
  try {
    const raw = localStorage.getItem(clavePorAtleta(athleteEmail));
    // `null` (nunca se leyó en este dispositivo) y `[]` (se leyó y no había
    // fotos) NO son lo mismo, y toda la corrección depende de distinguirlos.
    return raw ? (JSON.parse(raw) as ProgressPhoto[]) : null;
  } catch {
    return null;
  }
}

function saveLocalProgressPhotos(athleteEmail: string, photos: ProgressPhoto[]): void {
  try {
    localStorage.setItem(clavePorAtleta(athleteEmail), JSON.stringify(photos));
  } catch {
    // best-effort
  }
}

export async function getProgressPhotos(athleteEmail: string): Promise<ProgressPhoto[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'progressPhotos'), where('athleteId', '==', athleteEmail))
    );
    const photos = snap.docs
      .map(d => d.data() as ProgressPhoto)
      .sort((a, b) => a.date.localeCompare(b.date));
    saveLocalProgressPhotos(athleteEmail, photos);
    return photos;
  } catch (err) {
    console.warn('getProgressPhotos failed:', err);
    setLocalBypassMode(true, err);
    const local = getLocalProgressPhotos(athleteEmail);
    if (local) return local;
    // Sin copia local no se puede afirmar nada. Relanzar hace que la pantalla
    // diga «no hemos podido cargar tus fotos» en vez de «no tienes fotos».
    throw err;
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
  // 05-11. La copia local se mantiene al día aquí y en el borrado; si no, tras
  // subir una foto y perder la conexión, la pantalla tiraría de una copia que
  // no la incluye y parecería que la subida no se hizo.
  const local = getLocalProgressPhotos(athleteEmail);
  if (local) {
    saveLocalProgressPhotos(athleteEmail, [
      ...local.filter(p => p.id !== photo.id),
      photo,
    ].sort((a, b) => a.date.localeCompare(b.date)));
  }
  return photo;
}

export async function deleteProgressPhoto(photo: ProgressPhoto): Promise<void> {
  const path = `progressPhotos/${photo.athleteId}/${photo.date}_${photo.view}`;
  await deleteObject(storageRef(storage, path)).catch(() => {});
  await deleteDoc(doc(db, 'progressPhotos', photo.id));
  const local = getLocalProgressPhotos(photo.athleteId);
  if (local) saveLocalProgressPhotos(photo.athleteId, local.filter(p => p.id !== photo.id));
}

// ─── QUESTIONNAIRE MEDIA (respuestas tipo 'media') ────────────────────────────
// Sube un vídeo/foto de respuesta de cuestionario y devuelve su URL — el
// valor de la respuesta ES la URL (no hay doc propio, vive dentro de
// QuestionnaireResponse.answers como cualquier otro tipo de pregunta).

export async function uploadQuestionnaireMedia(
  athleteEmail: string,
  questionId: string,
  file: File,
): Promise<string> {
  const uploadData = file.type.startsWith('image/') ? await compressImage(file) : file;
  const path = `questionnaireMedia/${athleteEmail}/${Date.now()}_${questionId}`;
  const sRef = storageRef(storage, path);
  await uploadBytes(sRef, uploadData);
  return getDownloadURL(sRef);
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
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
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
    setLocalBypassMode(true, err);
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
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    localStorage.setItem(LOCAL_PHOTO_ASSIGNMENTS, JSON.stringify(getLocalPhotoAssignments().map(a => a.id === id ? { ...a, active: false } : a)));
  }
}


