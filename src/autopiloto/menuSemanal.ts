/* El menú de la semana que se publica solo (decisión de Dani del 28-10:
   «borrador 24 h y luego solo»).

   El borrador lo genera `services/menuSemanalAutomatico.ts` cuando el coach
   abre Inicio y la dieta de la semana cambia; se llama «Menú semana N · generado
   solo». Aquí se decide, sin Firestore, cuáles de esos borradores han cumplido
   el plazo sin que Dani los tocara y toca publicarlos. Un borrador que Dani
   renombró o editó ya no es «generado solo» y no se toca.

   La política lo gobierna: `borrador` (nunca publica, como antes),
   `borrador24h` (publica tras el plazo), `publicar` (publica en la primera
   pasada, sin esperar). */
import type { WeeklyMenu } from '../types.js';
import type { PoliticaAutopiloto } from './politica.js';

export const MARCA_GENERADO_SOLO = 'generado solo';
export const HORAS_DE_BORRADOR = 24;

export function esBorradorAutomatico(m: Pick<WeeklyMenu, 'status' | 'name'>): boolean {
  return m.status === 'draft' && m.name.includes(MARCA_GENERADO_SOLO);
}

/** Los borradores automáticos que toca publicar ahora. */
export function menusQuePublicar(
  menus: WeeklyMenu[], politica: Pick<PoliticaAutopiloto, 'menuAutomatico'>, ahoraIso: string,
): WeeklyMenu[] {
  if (politica.menuAutomatico === 'borrador') return [];
  const ahora = Date.parse(ahoraIso);
  const candidatos = menus.filter(esBorradorAutomatico).filter(m =>
    politica.menuAutomatico === 'publicar' || ahora - Date.parse(m.createdAt) >= HORAS_DE_BORRADOR * 3600_000);
  // Si hubiera dos borradores de semanas distintas, el de la semana más
  // avanzada es el que vale: el otro ya pasó.
  const porSemana = new Map<number, WeeklyMenu>();
  for (const m of candidatos) {
    const s = m.semanaPrograma ?? -1;
    const previo = porSemana.get(s);
    if (!previo || m.createdAt > previo.createdAt) porSemana.set(s, m);
  }
  const ultimaSemana = Math.max(...[...porSemana.keys()]);
  const elegido = porSemana.get(ultimaSemana);
  return elegido ? [elegido] : [];
}

/** Lo que hay que escribir para publicar un menú: igual que `publishWeeklyMenu`
 *  del cliente (el publicado anterior se archiva; los archivados de hace más de
 *  4 semanas se borran). */
export function planDePublicacion(menu: WeeklyMenu, todos: WeeklyMenu[], ahoraIso: string): {
  publicar: { id: string; publishedAt: string };
  archivar: string[];
  borrar: string[];
} {
  const hace4Semanas = Date.parse(ahoraIso) - 28 * 864e5;
  const archivar: string[] = [];
  const borrar: string[] = [];
  for (const otro of todos) {
    if (otro.id === menu.id) continue;
    if (otro.status === 'published') archivar.push(otro.id);
    else if (otro.status === 'archived' && Date.parse(otro.createdAt) < hace4Semanas) borrar.push(otro.id);
  }
  return { publicar: { id: menu.id, publishedAt: ahoraIso }, archivar, borrar };
}
