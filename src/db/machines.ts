import {
  db, storage, storageRef, uploadBytes, getDownloadURL, deleteObject,
  collection, doc, getDoc, getDocs, setDoc,
} from '../firebase';
import { Maquina, MaquinaOverride, MaquinaPropia, Gimnasio, DecisionMaquina, ProgresoCatalogo } from '../types';
import { forceLocalOnly, setLocalBypassMode, stripUndefined, esFalloDePermisos } from './core';
import { compressImage } from '../utils/compressImage';
import { maquinaId } from '../utils/maquinaId';
import { CATALOGO_VERSION } from '../data/maquinas/version';

// La semilla se carga con import() diferido, no estático: son 28 KB de JSON que
// solo hacen falta cuando alguien abre el catálogo, y un import normal los
// metería en el chunk de entrada de la app —los descargaría todo el mundo, coach
// incluido, en el primer arranque—. Se cachea en el módulo tras la primera vez.
let semillaCache: Maquina[] | null = null;
async function cargarSemilla(): Promise<Maquina[]> {
  if (!semillaCache) semillaCache = (await import('../data/maquinas')).SEMILLA_MAQUINAS;
  return semillaCache;
}

// ─── CATÁLOGO DE MÁQUINAS ─────────────────────────────────────────────────────
//
// Dos fuentes que se mezclan:
//   · SEMILLA_MAQUINAS  — JSON en el bundle, generado por los importadores. Cero
//                         lecturas de Firestore.
//   · maquinas/{id}      — SOLO lo que el admin cambia sobre la semilla (ocultar,
//                         renombrar, cambiar imagen, publicar) y las máquinas que
//                         crea a mano. Colección pequeña: una lectura de colección.
//
// El atleta solo ve `visible && publicadoEn != null`. El scraping nunca publica
// directo: los importadores escriben `publicadoEn: null` y el admin revisa.

const MAQUINAS_COL = 'maquinas';
const OVERRIDES_LOCAL_KEY = 'enforma_maquinas_overrides_v1';

function getLocalOverrides(): MaquinaOverride[] {
  try { return JSON.parse(localStorage.getItem(OVERRIDES_LOCAL_KEY) || '[]'); } catch { return []; }
}

function saveLocalOverrides(list: MaquinaOverride[]): void {
  try { localStorage.setItem(OVERRIDES_LOCAL_KEY, JSON.stringify(list)); } catch { /* cuota llena */ }
}

let overridesCache: MaquinaOverride[] | null = null;

async function fetchOverrides(): Promise<MaquinaOverride[]> {
  if (forceLocalOnly) return getLocalOverrides();
  if (overridesCache) return overridesCache;
  try {
    const snap = await getDocs(collection(db, MAQUINAS_COL));
    const list = snap.docs.map(d => ({ ...(d.data() as MaquinaOverride), id: d.id }));
    saveLocalOverrides(list);
    overridesCache = list;
    return list;
  } catch (err) {
    console.warn('fetchOverrides Firestore failed, using local:', err);
    setLocalBypassMode(true, err);
    return getLocalOverrides();
  }
}

function invalidateCatalogo(): void {
  overridesCache = null;
}

// Semilla + overrides. Un override sin contrapartida en la semilla es una máquina
// creada a mano por el admin (o promovida desde el gimnasio de un atleta): entra
// al catálogo por derecho propio siempre que traiga los campos obligatorios.
function mergeCatalogo(semilla: Maquina[], overrides: MaquinaOverride[]): Maquina[] {
  const porId = new Map<string, Maquina>();
  for (const m of semilla) porId.set(m.id, m);
  for (const ov of overrides) {
    const base = porId.get(ov.id);
    if (base) {
      const { actualizadoEn: _ignorado, ...campos } = ov;
      porId.set(ov.id, { ...base, ...campos } as Maquina);
    } else if (ov.nombreMostrado && ov.marca && ov.categoria) {
      porId.set(ov.id, ov as unknown as Maquina);
    }
  }
  return [...porId.values()];
}

/** Catálogo que ve el atleta: solo lo publicado y visible, ordenado por categoría. */
export async function getCatalogoMaquinas(): Promise<Maquina[]> {
  const [semilla, overrides] = await Promise.all([cargarSemilla(), fetchOverrides()]);
  const todas = mergeCatalogo(semilla, overrides);
  return todas
    .filter(m => m.visible && m.publicadoEn)
    .sort((a, b) =>
      a.categoria.localeCompare(b.categoria) ||
      a.nombreMostrado.localeCompare(b.nombreMostrado, 'es')
    );
}

/** Catálogo completo para el admin: incluye ocultas y pendientes de publicar. */
export async function getCatalogoMaquinasAdmin(): Promise<Maquina[]> {
  const [semilla, overrides] = await Promise.all([cargarSemilla(), fetchOverrides()]);
  return mergeCatalogo(semilla, overrides).sort((a, b) =>
    String(a.marca).localeCompare(String(b.marca)) ||
    a.familia.localeCompare(b.familia) ||
    a.nombreMostrado.localeCompare(b.nombreMostrado, 'es')
  );
}

export function getCatalogoVersion(): string {
  return CATALOGO_VERSION;
}

// ── Escrituras del admin ──────────────────────────────────────────────────────
// Solo se persiste el delta contra la semilla; para una máquina creada a mano el
// delta es el documento entero.

export async function upsertOverrideMaquina(id: string, cambios: Partial<Maquina>): Promise<void> {
  const payload: MaquinaOverride = { ...cambios, id, actualizadoEn: new Date().toISOString() };
  invalidateCatalogo();
  saveLocalOverrides([...getLocalOverrides().filter(o => o.id !== id), payload]);
  if (forceLocalOnly) return;
  try {
    await setDoc(doc(db, MAQUINAS_COL, id), stripUndefined(payload), { merge: true });
  } catch (err) {
    console.warn('upsertOverrideMaquina Firestore failed, saved local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
  }
}

export async function publicarMaquina(id: string): Promise<void> {
  await upsertOverrideMaquina(id, { publicadoEn: new Date().toISOString(), visible: true });
}

export async function ocultarMaquina(id: string, oculta: boolean): Promise<void> {
  await upsertOverrideMaquina(id, { visible: !oculta });
}

/** Crea una máquina desde el admin. Publicada al momento: la ha revisado una persona. */
export async function crearMaquinaAdmin(
  datos: Omit<Maquina, 'id' | 'fuente' | 'creadoPor' | 'visible' | 'publicadoEn'>
): Promise<Maquina> {
  const id = maquinaId(String(datos.marca), datos.familia, datos.nombreOriginal || datos.nombreMostrado);
  const maquina: Maquina = {
    ...datos,
    id,
    fuente: 'manual',
    creadoPor: 'admin',
    visible: true,
    publicadoEn: new Date().toISOString(),
  };
  await upsertOverrideMaquina(id, maquina);
  return maquina;
}

/**
 * Copia una máquina propia de un atleta al catálogo global. La original se marca
 * como resuelta pero NO se borra: el atleta ya la tenía marcada como "la tengo" y
 * borrarla le vaciaría el gimnasio.
 */
export async function promoverMaquinaPropia(
  email: string,
  propia: MaquinaPropia,
  datos: { marca: string; familia: string; categoria: Maquina['categoria']; nombreMostrado: string }
): Promise<Maquina> {
  const nueva = await crearMaquinaAdmin({
    nombreOriginal: propia.nombre,
    nombreMostrado: datos.nombreMostrado,
    marca: datos.marca,
    familia: datos.familia,
    categoria: datos.categoria,
    fotoUrl: propia.fotoUrl,
  });
  const gym = await getGimnasio(email);
  if (gym) {
    await guardarGimnasio(email, {
      maquinasPropias: gym.maquinasPropias.map(p =>
        p.id === propia.id ? { ...p, candidataAPublica: false } : p
      ),
    });
  }
  return nueva;
}

/** Sube la imagen de una máquina del catálogo desde el admin. */
export async function subirImagenMaquina(id: string, file: File): Promise<string> {
  const sRef = storageRef(storage, `maquinas/${id}`);
  await uploadBytes(sRef, await compressImage(file));
  return getDownloadURL(sRef);
}

// ─── GIMNASIO DEL ATLETA (docId = email) ──────────────────────────────────────
//
// Un solo documento por atleta. Con ~500 máquinas el array de decisiones ronda los
// 40 KB, muy por debajo del límite de 1 MB de Firestore, y evita cientos de docs.
//
// Durante el swipe NO se escribe en Firestore por tarjeta: sería una escritura por
// gesto. El componente acumula en memoria, vuelca a localStorage en cada swipe
// (para que reanudar funcione aunque se cierre la app) y llama a `guardarGimnasio`
// cada 10 decisiones, al cambiar de categoría y al salir.

const GIMNASIOS_COL = 'gimnasios';
const GIMNASIO_LOCAL_KEY = 'enforma_gimnasios_v1';

function getLocalGimnasios(): Gimnasio[] {
  try { return JSON.parse(localStorage.getItem(GIMNASIO_LOCAL_KEY) || '[]'); } catch { return []; }
}

function setLocalGimnasio(gym: Gimnasio): void {
  try {
    const otros = getLocalGimnasios().filter(g => g.atletaId !== gym.atletaId);
    localStorage.setItem(GIMNASIO_LOCAL_KEY, JSON.stringify([...otros, gym]));
  } catch { /* cuota llena */ }
}

export function gimnasioVacio(email: string, total = 0): Gimnasio {
  return {
    atletaId: email,
    maquinas: [],
    maquinasPropias: [],
    progresoCatalogo: {
      revisadas: 0,
      total,
      categoriaActual: null,
      completado: false,
      pendienteRecordatorio: false,
      versionCatalogo: CATALOGO_VERSION,
    },
  };
}

export async function getGimnasio(email: string): Promise<Gimnasio | null> {
  const local = getLocalGimnasios().find(g => g.atletaId === email) ?? null;
  if (forceLocalOnly) return local;
  try {
    const snap = await getDoc(doc(db, GIMNASIOS_COL, email));
    // Que no exista en Firestore NO significa que no haya progreso: el swipe
    // escribe el respaldo local en cada tarjeta y solo vuelca cada 10. Si el
    // volcado falló (sin red, permisos, sesión caducada) y el atleta recarga,
    // devolver null aquí le borraría de golpe todas las máquinas que ya había
    // decidido. El respaldo local manda mientras el remoto esté vacío.
    if (!snap.exists()) return local;
    const gym = { ...(snap.data() as Gimnasio), atletaId: email };
    setLocalGimnasio(gym);
    return gym;
  } catch (err) {
    console.warn('getGimnasio Firestore failed, using local:', err);
    return local;
  }
}

/**
 * Patch parcial del gimnasio (mismo patrón que updateOnboardingFoods). Escribe
 * siempre el respaldo local antes de intentar Firestore, para que una caída de red
 * no pierda decisiones ya tomadas.
 */
export async function guardarGimnasio(email: string, cambios: Partial<Omit<Gimnasio, 'atletaId'>>): Promise<void> {
  const actual = getLocalGimnasios().find(g => g.atletaId === email) ?? gimnasioVacio(email);
  setLocalGimnasio({ ...actual, ...cambios, atletaId: email });
  if (forceLocalOnly) return;
  try {
    await setDoc(
      doc(db, GIMNASIOS_COL, email),
      stripUndefined({ ...cambios, atletaId: email }),
      { merge: true }
    );
  } catch (err) {
    console.warn('guardarGimnasio Firestore failed, saved local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
  }
}

/**
 * Solo respaldo local, sin tocar Firestore. Lo usa el swipe en cada tarjeta:
 * escribir en Firestore por gesto sería una escritura por dedo, pero perder las
 * decisiones al cerrar la app tampoco vale. Esto guarda al instante y barato; el
 * volcado real va cada 10 decisiones y al salir.
 */
export function guardarGimnasioLocal(email: string, cambios: Partial<Omit<Gimnasio, 'atletaId'>>): void {
  const actual = getLocalGimnasios().find(g => g.atletaId === email) ?? gimnasioVacio(email);
  setLocalGimnasio({ ...actual, ...cambios, atletaId: email });
}

export async function guardarDecisiones(
  email: string,
  maquinas: DecisionMaquina[],
  progresoCatalogo: ProgresoCatalogo
): Promise<void> {
  await guardarGimnasio(email, { maquinas, progresoCatalogo });
}

// ── Máquinas propias del atleta ───────────────────────────────────────────────

export async function subirFotoGimnasio(email: string, file: File): Promise<string> {
  const nombre = `${Date.now()}`;
  const sRef = storageRef(storage, `gymPhotos/${email}/${nombre}`);
  await uploadBytes(sRef, await compressImage(file));
  return getDownloadURL(sRef);
}

export async function addMaquinaPropia(
  email: string,
  datos: { nombre: string; fotoUrl: string }
): Promise<MaquinaPropia> {
  const gym = (await getGimnasio(email)) ?? gimnasioVacio(email);
  const propia: MaquinaPropia = {
    id: `propia_${Date.now()}`,
    nombre: datos.nombre.trim(),
    fotoUrl: datos.fotoUrl,
    creadaEn: new Date().toISOString(),
    candidataAPublica: true,
  };
  await guardarGimnasio(email, { maquinasPropias: [...gym.maquinasPropias, propia] });
  return propia;
}

export async function deleteMaquinaPropia(email: string, id: string): Promise<void> {
  const gym = await getGimnasio(email);
  if (!gym) return;
  const propia = gym.maquinasPropias.find(p => p.id === id);
  await guardarGimnasio(email, { maquinasPropias: gym.maquinasPropias.filter(p => p.id !== id) });
  if (propia && !forceLocalOnly) {
    // La foto vive en gymPhotos/{email}/{nombre}; el nombre es la cola de la URL.
    const nombre = decodeURIComponent(propia.fotoUrl.split('/o/')[1]?.split('?')[0] ?? '').split('/').pop();
    if (nombre) await deleteObject(storageRef(storage, `gymPhotos/${email}/${nombre}`)).catch(() => {});
  }
}

/** Máquinas del catálogo que el atleta ha marcado como disponibles. Para el coach. */
export async function getMaquinasDisponibles(email: string): Promise<{ catalogo: Maquina[]; propias: MaquinaPropia[] }> {
  const [gym, catalogo] = await Promise.all([getGimnasio(email), getCatalogoMaquinas()]);
  if (!gym) return { catalogo: [], propias: [] };
  const tiene = new Set(gym.maquinas.filter(d => d.tengo).map(d => d.maquinaId));
  return {
    catalogo: catalogo.filter(m => tiene.has(m.id)),
    propias: gym.maquinasPropias,
  };
}

/**
 * Estado del catálogo para un atleta, con las máquinas que aún no ha decidido.
 * `pendientes` es lo que alimenta el swipe: incluye las nuevas de una importación
 * posterior, así que un atleta que ya terminó vuelve a tener trabajo solo si el
 * catálogo ha crecido.
 */
export async function getEstadoCatalogo(email: string): Promise<{
  gimnasio: Gimnasio;
  catalogo: Maquina[];
  pendientes: Maquina[];
}> {
  const [gymGuardado, catalogo] = await Promise.all([getGimnasio(email), getCatalogoMaquinas()]);
  const gimnasio = gymGuardado ?? gimnasioVacio(email, catalogo.length);
  const decididas = new Set(gimnasio.maquinas.map(d => d.maquinaId));
  const pendientes = catalogo.filter(m => !decididas.has(m.id));
  return { gimnasio, catalogo, pendientes };
}
