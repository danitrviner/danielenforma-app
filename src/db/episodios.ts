/* Episodios del autopiloto (`episodios`): los escribe solo el servidor
   (api/autopiloto.ts, Admin SDK); el coach los LEE para la línea de tiempo del
   atleta. Las reglas solo dejan leer al coach y no dejan escribir a nadie. */
import { db, collection, getDocs, query, where } from '../firebase.js';
import type { Episodio } from '../autopiloto/episodios.js';
import { forceLocalOnly, setLocalBypassMode } from './core.js';

export async function getEpisodiosDeAtleta(athleteEmail: string): Promise<Episodio[]> {
  if (forceLocalOnly) return [];
  try {
    const snap = await getDocs(query(collection(db, 'episodios'), where('athleteId', '==', athleteEmail)));
    return snap.docs
      .map(d => ({ ...(d.data() as Episodio), id: d.id }))
      .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
  } catch (err) {
    console.warn('getEpisodiosDeAtleta Firestore failed:', err);
    setLocalBypassMode(true, err);
    return [];
  }
}
