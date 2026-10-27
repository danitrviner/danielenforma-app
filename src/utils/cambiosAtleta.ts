import type {
  AthleteDietConfig, AthleteNutritionConfig, Diet, Mesocycle, NutritionPhase, NutritionProgram, WeekDay,
} from '../types';
import { MUSCLE_LABELS, MUSCLE_ORDER } from '../types';
import { kcalDeDieta } from './semanasNutricion';
import { etiquetaDeDias, type ReglasDeReceta } from './reglasDeReceta';
import { filtroDeTarjeta, resumenDeFiltro, TODAS_LAS_DIETAS } from './seleccionDeRecetas';
import { dishTypeLabel } from './dishTypes';
import { objetivoDeDieta } from './macrosLegado';

/* ═══════════════════════════════════════════════════════════════════════════
   Historial de cambios del coach sobre un atleta

   Aquí solo vive la parte pura: dado el antes y el después de un documento,
   qué frases lo cuentan («Kcal 2.300 → 2.150», «Pecho 12 → 14 series»).
   Quién lo guarda y cuándo está en db/cambios.ts.

   Una frase por cambio, corta y con la flecha: el coach lo lee de un vistazo,
   que es justo lo que el historial de la ficha no conseguía.
   ═══════════════════════════════════════════════════════════════════════════ */

export type AreaCambio = 'nutricion' | 'entreno';

export interface CambioAtleta {
  id: string;
  athleteId: string;
  area: AreaCambio;
  /** Qué documento tocó: `dieta:<id>`, `programa`, `config`, `calendario`, `meso:<id>`. */
  objeto: string;
  /** «Dieta «Descanso»», «Mesociclo #3»… */
  titulo: string;
  lineas: string[];
  at: string;
  autor: string;
}

// A mano y no con `toLocaleString`: en es-ES el ICU no agrupa los cuatro dígitos
// («2300») y el resultado cambiaría según el motor; el historial siempre dice 2.300.
const n = (v: number) => {
  const [entero, decimal] = (Math.round(v * 10) / 10).toString().split('.');
  const miles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return decimal ? `${miles},${decimal}` : miles;
};
const flecha = (antes: unknown, despues: unknown) => `${antes} → ${despues}`;
const DIAS: Record<WeekDay, string> = {
  mon: 'lunes', tue: 'martes', wed: 'miércoles', thu: 'jueves', fri: 'viernes', sat: 'sábado', sun: 'domingo',
};
const ORDEN_DIAS: WeekDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function nombresDeAlimentos(d: Diet): string[] {
  return d.meals.flatMap(m => m.items.map(i => i.foodLabel ?? '')).filter(Boolean);
}

/** Dieta: nombre, cupo (kcal y macros), nº de comidas y alimentos añadidos o quitados. */
export function resumirDieta(antes: Diet | undefined, despues: Diet): string[] {
  if (!antes) return [`Dieta nueva · ${n(kcalDeDieta(despues))} kcal`];
  const l: string[] = [];
  if (antes.name !== despues.name) l.push(`Nombre: ${flecha(antes.name, despues.name)}`);

  const kA = kcalDeDieta(antes);
  const kD = kcalDeDieta(despues);
  if (kA !== kD) l.push(`Kcal ${flecha(n(kA), n(kD))}`);
  // En gramos del objetivo (o del cupo viejo traducido), no en intercambios (M7, 26-10-2026).
  const oA = objetivoDeDieta(antes);
  const oD = objetivoDeDieta(despues);
  for (const [macro, etiqueta] of [['hc', 'Hidratos'], ['p', 'Proteína'], ['g', 'Grasa']] as const) {
    if (Math.round(oA[macro]) !== Math.round(oD[macro])) l.push(`${etiqueta} ${flecha(n(Math.round(oA[macro])), n(Math.round(oD[macro])))} g`);
  }
  if (antes.meals.length !== despues.meals.length) {
    l.push(`Comidas ${flecha(antes.meals.length, despues.meals.length)}`);
  }
  const prev = new Set(nombresDeAlimentos(antes));
  const ahora = new Set(nombresDeAlimentos(despues));
  const añadidos = [...ahora].filter(x => !prev.has(x));
  const quitados = [...prev].filter(x => !ahora.has(x));
  if (añadidos.length) l.push(`Añade ${resumenLista(añadidos)}`);
  if (quitados.length) l.push(`Quita ${resumenLista(quitados)}`);
  if ((antes.coachNote ?? '') !== (despues.coachNote ?? '')) l.push('Nota del coach editada');
  return l;
}

function resumenLista(xs: string[]): string {
  return xs.length <= 3 ? xs.join(', ') : `${xs.slice(0, 3).join(', ')} y ${xs.length - 3} más`;
}

function fasePorId(p: NutritionProgram | undefined): Map<string, NutritionPhase> {
  return new Map((p?.phases ?? []).map(f => [f.id, f]));
}

/** Programa de nutrición: fases (kcal, ritmo, duración), refeeds, ciclado, pasos y mantenimiento. */
export function resumirPrograma(antes: NutritionProgram | undefined, despues: NutritionProgram): string[] {
  const l: string[] = [];
  if (!antes) return ['Programa de nutrición creado'];
  if (antes.startDate !== despues.startDate) l.push(`Inicio ${flecha(antes.startDate, despues.startDate)}`);

  const prev = fasePorId(antes);
  const ahora = fasePorId(despues);
  for (const f of despues.phases) {
    const a = prev.get(f.id);
    if (!a) { l.push(`Fase nueva «${f.name}»${f.targetKcal ? ` · ${n(f.targetKcal)} kcal` : ''}`); continue; }
    const pre = `«${f.name}»`;
    if (a.name !== f.name) l.push(`Fase ${flecha(`«${a.name}»`, pre)}`);
    if ((a.targetKcal ?? 0) !== (f.targetKcal ?? 0)) {
      l.push(`${pre} kcal ${flecha(a.targetKcal ? n(a.targetKcal) : 'auto', f.targetKcal ? n(f.targetKcal) : 'auto')}`);
    }
    if ((a.targetRateKgWeek ?? null) !== (f.targetRateKgWeek ?? null)) {
      l.push(`${pre} ritmo ${flecha(
        a.targetRateKgWeek != null ? `${n(a.targetRateKgWeek)} kg/sem` : '—',
        f.targetRateKgWeek != null ? `${n(f.targetRateKgWeek)} kg/sem` : '—',
      )}`);
    }
    if ((a.targetWeight ?? null) !== (f.targetWeight ?? null)) {
      l.push(`${pre} peso objetivo ${flecha(a.targetWeight ?? '—', f.targetWeight ?? '—')} kg`);
    }
    if (a.weeks !== f.weeks) l.push(`${pre} duración ${flecha(a.weeks, f.weeks)} sem`);
    if (a.dietId !== f.dietId) l.push(`${pre} cambia de dieta`);
  }
  for (const f of antes.phases) if (!ahora.has(f.id)) l.push(`Fase «${f.name}» eliminada`);

  const refA = antes.refeedDays?.length ?? 0;
  const refD = despues.refeedDays?.length ?? 0;
  if (refA !== refD) l.push(`Refeeds ${flecha(refA, refD)}`);
  const cA = antes.ciclado;
  const cD = despues.ciclado;
  if (!cA && cD) l.push(`Ciclado de hidratos activado (${cD.entreno >= 0 ? '+' : ''}${cD.entreno} entreno / ${cD.descanso >= 0 ? '+' : ''}${cD.descanso} descanso)`);
  else if (cA && !cD) l.push('Ciclado de hidratos desactivado');
  else if (cA && cD && (cA.entreno !== cD.entreno || cA.descanso !== cD.descanso)) {
    l.push(`Ciclado HC ${flecha(`${cA.entreno}/${cA.descanso}`, `${cD.entreno}/${cD.descanso}`)}`);
  }
  const cambiosA = antes.cambiosSemana?.length ?? 0;
  const cambiosD = despues.cambiosSemana?.length ?? 0;
  if (cambiosA !== cambiosD) l.push(`Ajustes por semana ${flecha(cambiosA, cambiosD)}`);
  const pasosA = antes.pasosPorSemana?.length ?? 0;
  const pasosD = despues.pasosPorSemana?.length ?? 0;
  if (pasosA !== pasosD) l.push(`Pasos por semana ${flecha(pasosA, pasosD)} tramos`);
  const mantA = antes.semanasMantenimiento?.length ?? 0;
  const mantD = despues.semanasMantenimiento?.length ?? 0;
  if (mantA !== mantD) l.push(`Semanas de mantenimiento ${flecha(mantA, mantD)}`);
  return l;
}

/** Pasos objetivo y kcal por paso. */
export function resumirConfigNutricion(
  antes: AthleteNutritionConfig | undefined, despues: AthleteNutritionConfig,
): string[] {
  const l: string[] = [];
  if ((antes?.stepGoal ?? null) !== (despues.stepGoal ?? null)) {
    l.push(`Objetivo de pasos ${flecha(antes?.stepGoal ? n(antes.stepGoal) : '—', despues.stepGoal ? n(despues.stepGoal) : '—')}`);
  }
  if ((antes?.kcalPerStep ?? null) !== (despues.kcalPerStep ?? null)) {
    l.push(`Kcal por paso ${flecha(antes?.kcalPerStep ?? 'por defecto', despues.kcalPerStep ?? 'por defecto')}`);
  }
  return l;
}

/** Qué dieta toca cada día de la semana. `nombres` traduce ids de dieta a nombre. */
export function resumirCalendarioDietas(
  antes: AthleteDietConfig | undefined, despues: AthleteDietConfig, nombres: Record<string, string> = {},
): string[] {
  const l: string[] = [];
  const nombre = (id: string | null | undefined) => (id ? nombres[id] ?? 'otra dieta' : 'libre');
  for (const d of ORDEN_DIAS) {
    const a = antes?.weeklySchedule?.[d] ?? null;
    const b = despues.weeklySchedule?.[d] ?? null;
    if (a !== b) l.push(`${DIAS[d][0].toUpperCase()}${DIAS[d].slice(1)}: ${flecha(nombre(a), nombre(b))}`);
  }
  const act = new Set(antes?.activeDietIds ?? []);
  const nuevas = (despues.activeDietIds ?? []).filter(id => !act.has(id));
  const ahora = new Set(despues.activeDietIds ?? []);
  const quitadas = [...act].filter(id => !ahora.has(id));
  if (nuevas.length) l.push(`Activa ${nuevas.map(nombre).join(', ')}`);
  if (quitadas.length) l.push(`Desactiva ${quitadas.map(nombre).join(', ')}`);
  return l;
}

/** Mesociclo: duración, sesiones por ciclo, series por grupo, descarga, nombres y draft. */
export function resumirMeso(antes: Mesocycle | undefined, despues: Mesocycle): string[] {
  if (!antes) return [];
  const l: string[] = [];
  if ((antes.name ?? '') !== (despues.name ?? '')) l.push(`Nombre ${flecha(antes.name || '—', despues.name || '—')}`);
  if (antes.weeks !== despues.weeks) l.push(`Duración ${flecha(antes.weeks, despues.weeks)} semanas`);
  if (antes.daysPerWeek !== despues.daysPerWeek) l.push(`Sesiones por ciclo ${flecha(antes.daysPerWeek, despues.daysPerWeek)}`);
  if ((antes.cycleDays ?? 7) !== (despues.cycleDays ?? 7)) l.push(`Ciclo ${flecha(antes.cycleDays ?? 7, despues.cycleDays ?? 7)} días`);
  if (antes.startDate !== despues.startDate) l.push(`Inicio ${flecha(antes.startDate, despues.startDate)}`);
  if ((antes.objective ?? '') !== (despues.objective ?? '')) l.push('Objetivo editado');
  if ((antes.deloadWeek ?? null) !== (despues.deloadWeek ?? null)) {
    l.push(`Semana de descarga ${flecha(antes.deloadWeek ?? '—', despues.deloadWeek ?? '—')}`);
  }
  for (const g of MUSCLE_ORDER) {
    const a = antes.groups?.[g]?.series ?? 0;
    const b = despues.groups?.[g]?.series ?? 0;
    if (a !== b) l.push(`${MUSCLE_LABELS[g]} ${flecha(a, b)} series`);
    const pa = antes.groups?.[g]?.priority;
    const pb = despues.groups?.[g]?.priority;
    if (pa && pb && pa !== pb) l.push(`${MUSCLE_LABELS[g]} prioridad ${flecha(pa, pb)}`);
  }
  const nombresA = (antes.nombresSesion ?? []).join('|');
  const nombresD = (despues.nombresSesion ?? []).join('|');
  if (nombresA !== nombresD) l.push('Nombres de sesión editados');
  const cuenta = (m: Mesocycle) => Object.values(m.draft ?? {}).reduce((s, ids) => s + (ids?.length ?? 0), 0);
  if (cuenta(antes) !== cuenta(despues)) l.push(`Draft ${flecha(cuenta(antes), cuenta(despues))} ejercicios`);
  if (!antes.distribution && despues.distribution) l.push('Reparto de series generado');
  else if (antes.distribution && despues.distribution && antes.distribution.generatedAt !== despues.distribution.generatedAt) {
    l.push('Reparto de series recalculado');
  }
  return l;
}

const ETIQUETA_RECETARIO = { todas: 'todas', recomendadas: 'solo recomendadas' } as const;

/** Hasta tres nombres y «y N más»: la frase se lee de un vistazo aunque se toquen cien recetas. */
function nombres(ids: string[], nombreDe: (id: string) => string | undefined): string {
  const mostrados = ids.slice(0, 3).map(id => `«${nombreDe(id) ?? 'receta'}»`).join(', ');
  return ids.length > 3 ? `${mostrados} y ${ids.length - 3} más` : mostrados;
}

function difLista(antes: string[], despues: string[], etiqueta: string, nombreDe: (id: string) => string | undefined): string[] {
  const a = new Set(antes);
  const d = new Set(despues);
  const nuevas = despues.filter(id => !a.has(id));
  const quitadas = antes.filter(id => !d.has(id));
  const l: string[] = [];
  if (nuevas.length) l.push(`${etiqueta}: +${nuevas.length} (${nombres(nuevas, nombreDe)})`);
  if (quitadas.length) l.push(`${etiqueta}: −${quitadas.length} (${nombres(quitadas, nombreDe)})`);
  return l;
}

/**
 * Reglas del coach sobre las recetas de UN atleta (N-09): recetas escondidas,
 * recomendadas, lista del menú y qué navega en el recetario. `nombreDe` pone
 * nombre a los ids; sin él, «receta».
 */
export function resumirReglasDeReceta(
  antes: ReglasDeReceta | undefined,
  despues: ReglasDeReceta,
  nombreDe: (id: string) => string | undefined = () => undefined,
): string[] {
  const l: string[] = [];
  const reglasA = antes?.reglas ?? [];
  const reglasD = despues.reglas ?? [];
  l.push(...difLista(reglasA.map(r => r.recipeId), reglasD.map(r => r.recipeId), 'Recetas ocultas', nombreDe));
  // Una receta que sigue oculta pero con otros días o dónde: cuenta como cambio.
  const firma = (r: { dias?: string[]; ambitos?: string[] }) => JSON.stringify([[...(r.dias ?? [])].sort(), [...(r.ambitos ?? [])].sort()]);
  const previas = new Map(reglasA.map(r => [r.recipeId, firma(r)]));
  const reajustadas = reglasD.filter(r => previas.has(r.recipeId) && previas.get(r.recipeId) !== firma(r)).map(r => r.recipeId);
  if (reajustadas.length) l.push(`Alcance cambiado en ${reajustadas.length} ${reajustadas.length === 1 ? 'receta oculta' : 'recetas ocultas'} (${nombres(reajustadas, nombreDe)})`);

  l.push(...difLista(antes?.recomendadas ?? [], despues.recomendadas ?? [], 'Recomendadas', nombreDe));

  const listaA = antes?.listaMenu ?? [];
  const listaD = despues.listaMenu ?? [];
  if (listaA.length > 0 && listaD.length > 0) {
    // Las dos son listas propias: lo que se añade y se quita, no «79 → 79».
    l.push(...difLista(listaA, listaD, 'Lista del menú', nombreDe));
  } else if (listaA.length !== listaD.length) {
    const texto = (xs: string[]) => (xs.length ? `${xs.length} recetas` : 'la general');
    l.push(`Lista del menú: ${flecha(texto(listaA), texto(listaD))}`);
  }
  const recA = antes?.recetario ?? 'todas';
  const recD = despues.recetario ?? 'todas';
  if (recA !== recD) l.push(`Recetario: ${flecha(ETIQUETA_RECETARIO[recA], ETIQUETA_RECETARIO[recD])}`);

  // Filtros del generador por dieta. `nombreDe` también resuelve ids de dieta
  // y de paquete (el panel le pasa los tres).
  const selA = antes?.seleccion;
  const selD = despues.seleccion;
  const claves = new Set([TODAS_LAS_DIETAS, ...Object.keys(selA?.porDieta ?? {}), ...Object.keys(selD?.porDieta ?? {})]);
  for (const clave of claves) {
    const fa = filtroDeTarjeta(selA, clave);
    const fd = filtroDeTarjeta(selD, clave);
    if (JSON.stringify(fa) === JSON.stringify(fd)) continue;
    const quien = clave === TODAS_LAS_DIETAS ? 'Todas las dietas' : `Dieta «${nombreDe(clave) ?? 'borrada'}»`;
    const texto = (f: typeof fa) => resumenDeFiltro(f, nombreDe, dishTypeLabel);
    l.push(`Recetas del generador · ${quien}: ${flecha(texto(fa), texto(fd))}`);
  }
  const diasA = selA?.diasConTiempo ?? [];
  const diasD = selD?.diasConTiempo ?? [];
  if (JSON.stringify([...diasA].sort()) !== JSON.stringify([...diasD].sort())) {
    const texto = (d: typeof diasA) => (d.length ? etiquetaDeDias(d) : 'ninguno');
    l.push(`Días con tiempo para cocinar: ${flecha(texto(diasA), texto(diasD))}`);
  }
  return l;
}
