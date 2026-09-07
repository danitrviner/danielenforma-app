// Validación de payloads propuestos por la IA antes de crear un AiProposal.
// Si algo no cuadra, el ejecutor de la tool devuelve estos issues como
// tool_result de error para que el modelo se autocorrija — nunca llega una
// propuesta rota a la tarjeta de revisión de Dani.
import { FoodCategory, DietMeal, MuscleGroup, MUSCLE_LABELS } from '../types';
import { CATS, BUDGET_CATS, computeDietPlaced } from '../utils/exchangeHelpers';
import { SYSTEM_FOODS } from '../nutricion_seed_en_forma';

export interface ValidationIssue { field: string; message: string }

const KNOWN_FOOD_LABELS = new Set(SYSTEM_FOODS.map(f => f.label));
const BUDGET_TOLERANCE = 0.26; // margen por redondeos de 0.25 en varias comidas

export interface DietUpdatePayload {
  budget: Record<FoodCategory, number>;
  meals: { name: string; items: { category: FoodCategory; foodLabel: string; quantity: number }[] }[];
}

export function validateDietPayload(payload: DietUpdatePayload): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const cat of BUDGET_CATS) {
    const v = payload.budget?.[cat];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
      issues.push({ field: `budget.${cat}`, message: `budget.${cat} debe ser un número ≥ 0 (recibido: ${JSON.stringify(v)})` });
    }
  }

  if (!Array.isArray(payload.meals) || payload.meals.length === 0) {
    issues.push({ field: 'meals', message: 'La dieta necesita al menos una comida' });
  }

  for (const meal of payload.meals ?? []) {
    if (!meal.name?.trim()) issues.push({ field: 'meals[].name', message: 'Cada comida necesita un nombre' });
    for (const item of meal.items ?? []) {
      if (!CATS.includes(item.category)) {
        issues.push({ field: 'item.category', message: `Categoría inválida "${item.category}" en "${item.foodLabel}" — válidas: ${CATS.join(', ')}` });
      }
      const q = item.quantity;
      if (typeof q !== 'number' || !Number.isFinite(q) || q <= 0 || Math.abs(Math.round(q * 4) - q * 4) > 1e-6) {
        issues.push({ field: 'item.quantity', message: `Cantidad inválida en "${item.foodLabel}" (${q}) — debe ser múltiplo positivo de 0.25` });
      }
      if (!KNOWN_FOOD_LABELS.has(item.foodLabel)) {
        issues.push({
          field: 'item.foodLabel',
          message: `Alimento no reconocido: "${item.foodLabel}" — usa get_food_library para ver las etiquetas exactas válidas`,
        });
      }
    }
  }

  // Coherencia: lo colocado en las comidas debe cuadrar con el presupuesto.
  if (issues.length === 0) {
    const placed = computeDietPlaced(payload.meals as DietMeal[]);
    for (const cat of BUDGET_CATS) {
      const budget = payload.budget[cat] ?? 0;
      if (Math.abs(placed[cat] - budget) > BUDGET_TOLERANCE) {
        issues.push({
          field: `budget.${cat}`,
          message: `budget.${cat}=${budget} pero las comidas colocan ${placed[cat]} — deben cuadrar (ajusta el presupuesto o los items)`,
        });
      }
    }
  }

  return issues;
}

// ── Mesociclos ──────────────────────────────────────────────────────────────

const VALID_MUSCLE_GROUPS = new Set(Object.keys(MUSCLE_LABELS) as MuscleGroup[]);
const MAX_SERIES_PER_GROUP = 25; // tope semanal por grupo (heatmap del MesocycleManager)
// Tope de series semanales totales, en función de los días que entrena. Estaba
// en 12 y rechazaba repartos perfectamente normales: con 8-12 series por
// músculo y sesión (criterio de Dani), un torso que toca 3 músculos ya son
// ~30. Subido a 25 por sesión el 2026-09-02 — sigue bloqueando por encima,
// que es lo que evita que un error del modelo cuele 200 series.
const SERIES_PER_DAY_SOFT_CAP = 25;

export interface MesocycleProposalPayload {
  weeks: number;
  daysPerWeek: number;
  objective: string;
  groups: Partial<Record<MuscleGroup, { series: number; priority?: 'alta' | 'media' | 'baja' }>>;
}

export function validateMesocyclePayload(payload: MesocycleProposalPayload): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!Number.isInteger(payload.weeks) || payload.weeks < 1 || payload.weeks > 12) {
    issues.push({ field: 'weeks', message: `weeks debe ser un entero entre 1 y 12 (recibido: ${JSON.stringify(payload.weeks)})` });
  }
  // Hasta 10: por encima de 7 el mesociclo deja de ser semanal y pasa a ser un
  // ciclo largo que se repite cada N días (ver diasDeCiclo en utils/progression).
  if (!Number.isInteger(payload.daysPerWeek) || payload.daysPerWeek < 1 || payload.daysPerWeek > 10) {
    issues.push({ field: 'daysPerWeek', message: `daysPerWeek debe ser un entero entre 1 y 10 (recibido: ${JSON.stringify(payload.daysPerWeek)})` });
  }
  if (!payload.objective?.trim()) {
    issues.push({ field: 'objective', message: 'objective (objetivo del mesociclo) es obligatorio' });
  }

  const entries = Object.entries(payload.groups ?? {}) as [string, { series: number; priority?: string }][];
  if (entries.length === 0) {
    issues.push({ field: 'groups', message: 'groups necesita al menos un grupo muscular con series > 0' });
  }

  let totalSeries = 0;
  for (const [group, cfg] of entries) {
    if (!VALID_MUSCLE_GROUPS.has(group as MuscleGroup)) {
      issues.push({ field: 'groups', message: `Grupo muscular inválido "${group}" — válidos: ${[...VALID_MUSCLE_GROUPS].join(', ')}` });
      continue;
    }
    const s = cfg?.series;
    if (typeof s !== 'number' || !Number.isFinite(s) || s < 0 || s > MAX_SERIES_PER_GROUP) {
      issues.push({ field: `groups.${group}.series`, message: `series de "${group}" debe estar entre 0 y ${MAX_SERIES_PER_GROUP} (recibido: ${JSON.stringify(s)})` });
    } else {
      totalSeries += s;
    }
    if (cfg?.priority && !['alta', 'media', 'baja'].includes(cfg.priority)) {
      issues.push({ field: `groups.${group}.priority`, message: `priority de "${group}" debe ser alta, media o baja` });
    }
  }

  // Sanidad de volumen: series totales imposibles de repartir en los días.
  if (issues.length === 0 && payload.daysPerWeek > 0) {
    const cap = payload.daysPerWeek * SERIES_PER_DAY_SOFT_CAP;
    if (totalSeries > cap) {
      issues.push({
        field: 'groups',
        message: `Volumen total ${totalSeries} series/semana supera lo razonable para ${payload.daysPerWeek} días (máx ≈ ${cap}). Reduce series o sube daysPerWeek.`,
      });
    }
  }

  return issues;
}

// ── Periodización nutricional ───────────────────────────────────────────────
// Cada fase va enlazada a una dieta: o una que ya existe (dietId) o una que se
// crea al aprobar (diet). Una fase sin dieta enlazada no le enseña nada al
// atleta, y una dieta que no cuadra con su presupuesto se cuela hasta que
// alguien la abre — mejor rechazarla aquí, con el motivo, para que el modelo
// se corrija solo.

export interface NutritionPhaseInput {
  name?: unknown;
  weeks?: unknown;
  diet_id?: unknown;
  diet?: unknown;
}

export function validateNutritionPhases(
  fases: NutritionPhaseInput[], dietIdsDelAtleta: string[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!Array.isArray(fases) || fases.length === 0) {
    return [{ field: 'phases', message: 'La periodización necesita al menos una fase' }];
  }

  const ids = new Set(dietIdsDelAtleta);
  fases.forEach((f, i) => {
    const donde = typeof f.name === 'string' && f.name.trim() ? `"${f.name.trim()}"` : `${i + 1}`;
    if (typeof f.name !== 'string' || !f.name.trim()) {
      issues.push({ field: `phases[${i}].name`, message: `Fase ${donde}: falta el nombre` });
    }
    const semanas = Number(f.weeks);
    if (!Number.isFinite(semanas) || semanas <= 0 || semanas > 52) {
      issues.push({ field: `phases[${i}].weeks`, message: `Fase ${donde}: weeks debe ser un número entre 1 y 52 (recibido: ${JSON.stringify(f.weeks)})` });
    }

    const tieneId = typeof f.diet_id === 'string' && f.diet_id.length > 0;
    const tieneDieta = !!f.diet && typeof f.diet === 'object';
    if (!tieneId && !tieneDieta) {
      issues.push({ field: `phases[${i}].diet`, message: `Fase ${donde}: necesita diet_id (una dieta que ya existe) o diet (la dieta nueva de esta fase)` });
    }
    if (tieneId && tieneDieta) {
      issues.push({ field: `phases[${i}].diet`, message: `Fase ${donde}: manda diet_id o diet, no las dos` });
    }
    if (tieneId && !ids.has(f.diet_id as string)) {
      issues.push({ field: `phases[${i}].diet_id`, message: `Fase ${donde}: la dieta ${f.diet_id} no es de este atleta` });
    }
    if (tieneDieta) {
      const d = f.diet as { name?: unknown; budget?: unknown; meals?: unknown };
      if (typeof d.name !== 'string' || !d.name.trim() || !d.budget || !Array.isArray(d.meals)) {
        issues.push({ field: `phases[${i}].diet`, message: `Fase ${donde}: la dieta necesita name, budget y meals` });
      } else {
        for (const issue of validateDietPayload({ budget: d.budget as Record<FoodCategory, number>, meals: d.meals as DietUpdatePayload['meals'] })) {
          issues.push({ field: `phases[${i}].diet.${issue.field}`, message: `Fase ${donde}: ${issue.message}` });
        }
      }
    }
  });
  return issues;
}

// ── Sesiones de un mesociclo (los días con sus ejercicios) ───────────────────
// Es la propuesta con más superficie de error de todas: un nombre de ejercicio
// que no existe, un RIR de 9, 40 series en un día. Nada de eso puede llegar a
// la tarjeta de revisión, así que se valida aquí y el modelo se corrige solo
// con los issues de vuelta.

export interface WorkoutDayInput {
  day_index?: unknown;
  name?: unknown;
  exercises?: unknown;
}

export interface WorkoutExerciseInput {
  exercise?: unknown;
  sets?: unknown;
  reps?: unknown;
  rir?: unknown;
  rest_seconds?: unknown;
  notes?: unknown;
}

const MAX_SETS_POR_EJERCICIO = 10;
const MAX_SERIES_POR_SESION = 40;

/** Normaliza para comparar nombres de ejercicio: sin acentos, sin dobles
 *  espacios, en minúsculas. "Press Banca " y "press banca" son el mismo. */
export function claveDeEjercicio(nombre: string): string {
  return nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function validateWorkoutDays(
  dias: WorkoutDayInput[],
  catalogo: { id: string; name: string }[],
  daysPerWeek: number,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!Array.isArray(dias) || dias.length === 0) {
    return [{ field: 'days', message: 'days necesita al menos una sesión' }];
  }

  const porNombre = new Map(catalogo.map(e => [claveDeEjercicio(e.name), e]));
  const vistos = new Set<number>();

  dias.forEach((dia, i) => {
    const idx = Number(dia.day_index);
    if (!Number.isInteger(idx) || idx < 0 || idx >= daysPerWeek) {
      issues.push({ field: `days[${i}].day_index`, message: `day_index debe ser un entero entre 0 y ${daysPerWeek - 1} (el mesociclo tiene ${daysPerWeek} sesiones por ciclo); recibido ${JSON.stringify(dia.day_index)}` });
    } else if (vistos.has(idx)) {
      issues.push({ field: `days[${i}].day_index`, message: `day_index ${idx} repetido — una sesión por día` });
    } else {
      vistos.add(idx);
    }

    const ejercicios = Array.isArray(dia.exercises) ? (dia.exercises as WorkoutExerciseInput[]) : [];
    if (ejercicios.length === 0) {
      issues.push({ field: `days[${i}].exercises`, message: `La sesión ${idx} no tiene ejercicios` });
    }

    let seriesDelDia = 0;
    ejercicios.forEach((ex, j) => {
      const donde = `days[${i}].exercises[${j}]`;
      const nombre = typeof ex.exercise === 'string' ? ex.exercise.trim() : '';
      if (!nombre) {
        issues.push({ field: `${donde}.exercise`, message: 'Falta el nombre del ejercicio' });
      } else if (!porNombre.has(claveDeEjercicio(nombre))) {
        // Sugerir por prefijo ahorra una vuelta entera del modelo.
        const pista = catalogo
          .filter(e => claveDeEjercicio(e.name).includes(claveDeEjercicio(nombre).split(' ')[0]))
          .slice(0, 5)
          .map(e => e.name);
        issues.push({
          field: `${donde}.exercise`,
          message: `"${nombre}" no está en el catálogo${pista.length ? ` — ¿querías decir ${pista.join(' / ')}?` : ''}. Usa get_exercise_library para los nombres exactos.`,
        });
      }

      const sets = Number(ex.sets);
      if (!Number.isInteger(sets) || sets < 1 || sets > MAX_SETS_POR_EJERCICIO) {
        issues.push({ field: `${donde}.sets`, message: `sets debe ser un entero entre 1 y ${MAX_SETS_POR_EJERCICIO} (recibido: ${JSON.stringify(ex.sets)})` });
      } else {
        seriesDelDia += sets;
      }

      if (typeof ex.reps !== 'string' || !ex.reps.trim()) {
        issues.push({ field: `${donde}.reps`, message: 'reps es obligatorio — un rango ("8-10"), un número ("12") o "AMRAP"' });
      }

      const rir = Number(ex.rir);
      if (!Number.isFinite(rir) || rir < 0 || rir > 5) {
        issues.push({ field: `${donde}.rir`, message: `rir debe estar entre 0 y 5 (recibido: ${JSON.stringify(ex.rir)})` });
      }

      if (ex.rest_seconds !== undefined) {
        const rest = Number(ex.rest_seconds);
        if (!Number.isFinite(rest) || rest < 0 || rest > 600) {
          issues.push({ field: `${donde}.rest_seconds`, message: `rest_seconds debe estar entre 0 y 600 (recibido: ${JSON.stringify(ex.rest_seconds)})` });
        }
      }
    });

    if (seriesDelDia > MAX_SERIES_POR_SESION) {
      issues.push({ field: `days[${i}].exercises`, message: `La sesión ${idx} suma ${seriesDelDia} series — por encima de ${MAX_SERIES_POR_SESION} no es una sesión, es un error` });
    }
  });

  return issues;
}

// ── Escalera de niveles ─────────────────────────────────────────────────────
// La escalera la ve el atleta como su progresión ("Club" → "Hombre Sano" → …),
// así que un criterio mal formado no es un dato feo: es un nivel que no se
// desbloquea nunca o que se desbloquea solo.

const KINDS_CRITERIO = ['peso_perdido_kg', 'sentadilla_xbw', 'pasos_media_diaria', 'manual'];

export interface LadderLevelInput {
  name?: unknown;
  icon?: unknown;
  criteria?: unknown;
}

export interface LadderCriterionInput {
  kind?: unknown;
  label?: unknown;
  target_value?: unknown;
  exercise_name_match?: unknown;
}

export function validateLevelLadder(niveles: LadderLevelInput[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!Array.isArray(niveles) || niveles.length < 2) {
    return [{ field: 'levels', message: 'Una escalera necesita al menos 2 niveles — si no, no es una escalera' }];
  }
  if (niveles.length > 8) {
    issues.push({ field: 'levels', message: `${niveles.length} niveles es demasiado: el atleta deja de verle el final. Máximo 8.` });
  }

  const nombres = new Set<string>();
  niveles.forEach((n, i) => {
    const nombre = typeof n.name === 'string' ? n.name.trim() : '';
    if (!nombre) issues.push({ field: `levels[${i}].name`, message: 'Cada nivel necesita nombre — lo lee el atleta' });
    else if (nombres.has(nombre.toLowerCase())) issues.push({ field: `levels[${i}].name`, message: `Nivel "${nombre}" repetido` });
    else nombres.add(nombre.toLowerCase());

    const criterios = Array.isArray(n.criteria) ? (n.criteria as LadderCriterionInput[]) : [];
    if (criterios.length === 0) {
      issues.push({ field: `levels[${i}].criteria`, message: `El nivel "${nombre || i}" no tiene criterios: se desbloquearía solo` });
    }
    criterios.forEach((c, j) => {
      const donde = `levels[${i}].criteria[${j}]`;
      const kind = typeof c.kind === 'string' ? c.kind : '';
      if (!KINDS_CRITERIO.includes(kind)) {
        issues.push({ field: `${donde}.kind`, message: `kind inválido "${kind}" — válidos: ${KINDS_CRITERIO.join(', ')}` });
      }
      if (typeof c.label !== 'string' || !c.label.trim()) {
        issues.push({ field: `${donde}.label`, message: 'label es obligatorio — es la frase que lee el atleta ("10 dominadas estrictas")' });
      }
      if (kind !== 'manual') {
        const v = Number(c.target_value);
        if (!Number.isFinite(v) || v <= 0) {
          issues.push({ field: `${donde}.target_value`, message: `target_value es obligatorio y positivo para kind "${kind}" (recibido: ${JSON.stringify(c.target_value)})` });
        }
      }
      if (kind === 'sentadilla_xbw' && (typeof c.exercise_name_match !== 'string' || !c.exercise_name_match.trim())) {
        issues.push({ field: `${donde}.exercise_name_match`, message: 'exercise_name_match es obligatorio con kind "sentadilla_xbw" — el trozo del nombre del ejercicio contra el que se mide (ej. "sentadilla")' });
      }
    });
  });

  return issues;
}
