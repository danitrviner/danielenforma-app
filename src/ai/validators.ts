// Validación de payloads propuestos por la IA antes de crear un AiProposal.
// Si algo no cuadra, el ejecutor de la tool devuelve estos issues como
// tool_result de error para que el modelo se autocorrija — nunca llega una
// propuesta rota a la tarjeta de revisión de Dani.
import { FoodCategory, DietItem, Macros, MealItem, MuscleGroup, MUSCLE_LABELS } from '../types';
import { CATS, BUDGET_CATS } from '../utils/exchangeHelpers';
import { SYSTEM_FOODS } from '../nutricion_seed_en_forma';
import { parseBaseGrams } from '../utils/conversionNutricional';
import { macrosDesdeGramos, redondearMacros } from '../utils/macros';
import { macrosDeLineas, objetivoDeDieta } from '../utils/macrosLegado';

export interface ValidationIssue { field: string; message: string }

/**
 * Los alimentos del catálogo del sistema. NO son todos los que valen: Dani
 * añade los suyos al banco (`foodItems`), y esos están en Firestore, adonde
 * este módulo no puede ir ni debe.
 *
 * Por eso `validateDietPayload` acepta alimentos extra: quien la llama sabe
 * leer el banco del coach y le pasa la unión. Sin eso, el asistente proponía
 * un alimento que Dani tiene creado, el validador lo rechazaba por
 * «no reconocido» y el modelo se quedaba dando vueltas buscando un sinónimo
 * del sistema para algo que ya existía.
 */
type AlimentoDelBanco = Pick<MealItem, 'label' | 'category' | 'gramosPorIntercambio'>;
const SYSTEM_FOOD_BY_LABEL = new Map<string, AlimentoDelBanco>(SYSTEM_FOODS.map(f => [f.label, f]));

/* Dietas en kcal y gramos (10-2026). El asistente pauta el OBJETIVO del día en
 * gramos de proteína, hidratos y grasa —las kcal salen solas, 4/4/9— y, si
 * Dani se lo pide, alimentos por gramos (o por raciones los que van sin pesar).
 * Un cupo en intercambios (`budget`) aún puede llegar de un chat empezado
 * antes del cambio: se lee con las equivalencias de siempre. */

/** El objetivo del día, tal y como lo manda el asistente. */
export interface ObjetivoPropuesto { proteina_g: number; hidratos_g: number; grasa_g: number; kcal?: number }

/** Un alimento de una comida propuesta. `category`/`quantity` son el formato
 *  viejo (intercambios): `quantity` se lee como raciones. */
export interface ItemPropuesto {
  foodLabel: string;
  gramos?: number;
  raciones?: number;
  category?: FoodCategory;
  quantity?: number;
}

export interface DietUpdatePayload {
  objetivo?: ObjetivoPropuesto;
  budget?: Partial<Record<FoodCategory, number>>;
  meals?: { name: string; items: ItemPropuesto[] }[];
}

export interface DietaLeida {
  issues: ValidationIssue[];
  /** El objetivo en kcal y gramos; null si no se pudo leer. */
  objetivo: Macros | null;
  /** Las comidas con sus alimentos ya como líneas de dieta. */
  meals: { name: string; items: DietItem[] }[];
}

/** Por debajo o por encima de esto, el objetivo es casi seguro un error. */
const KCAL_MIN = 600;
const KCAL_MAX = 7000;
/** Lo que pueden separarse las kcal que manda el modelo de las de sus gramos. */
const TOLERANCIA_KCAL_DECLARADAS = 0.05;
/** Lo que pueden separarse las comidas del objetivo, por macro: el 10 % o 10 g
 *  (5 g en grasa), lo que sea mayor. */
const TOLERANCIA_COMIDAS = { p: 10, hc: 10, g: 5 } as const;

const numeroValido = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

function leerObjetivo(payload: DietUpdatePayload, issues: ValidationIssue[]): Macros | null {
  const o = payload.objetivo;
  if (o) {
    const campos = [['proteina_g', o.proteina_g], ['hidratos_g', o.hidratos_g], ['grasa_g', o.grasa_g]] as const;
    for (const [campo, v] of campos) {
      if (!numeroValido(v)) issues.push({ field: `objetivo.${campo}`, message: `objetivo.${campo} debe ser un número ≥ 0 en gramos (recibido: ${JSON.stringify(v)})` });
    }
    if (issues.length) return null;
    const m = macrosDesdeGramos(Math.round(o.proteina_g), Math.round(o.hidratos_g), Math.round(o.grasa_g));
    if (m.kcal < KCAL_MIN || m.kcal > KCAL_MAX) {
      issues.push({ field: 'objetivo', message: `P ${m.p} g · HC ${m.hc} g · G ${m.g} g son ${m.kcal} kcal: fuera de lo razonable (${KCAL_MIN}-${KCAL_MAX})` });
    }
    if (o.kcal !== undefined) {
      if (!numeroValido(o.kcal)) {
        issues.push({ field: 'objetivo.kcal', message: `objetivo.kcal debe ser un número (recibido: ${JSON.stringify(o.kcal)})` });
      } else if (Math.abs(o.kcal - m.kcal) > m.kcal * TOLERANCIA_KCAL_DECLARADAS) {
        issues.push({
          field: 'objetivo.kcal',
          message: `objetivo.kcal=${o.kcal} no cuadra con los gramos: P×4 + HC×4 + G×9 = ${m.kcal} kcal. Ajusta los gramos o quita kcal (se calcula sola).`,
        });
      }
    }
    return m;
  }
  if (payload.budget) {
    for (const cat of BUDGET_CATS) {
      const v = payload.budget[cat];
      if (!numeroValido(v)) issues.push({ field: `budget.${cat}`, message: `budget.${cat} debe ser un número ≥ 0 (recibido: ${JSON.stringify(v)})` });
    }
    return issues.length ? null : objetivoDeDieta({ budget: { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0, ...payload.budget } });
  }
  issues.push({ field: 'objetivo', message: 'Falta objetivo: { proteina_g, hidratos_g, grasa_g } del día, en gramos' });
  return null;
}

/**
 * Lee una dieta propuesta: su objetivo en kcal y gramos y sus comidas como
 * líneas de dieta, con los problemas que haya. Sin comidas vale: el asistente
 * propone el OBJETIVO y los alimentos los coloca Dani en el editor de dietas.
 */
export function leerDietaPropuesta(
  payload: DietUpdatePayload,
  /** Alimentos del banco del coach (o sus etiquetas), además de los del sistema. */
  bancoDelCoach?: Iterable<AlimentoDelBanco | string>,
): DietaLeida {
  const issues: ValidationIssue[] = [];
  const objetivo = leerObjetivo(payload, issues);

  const banco = new Map(SYSTEM_FOOD_BY_LABEL);
  const soloEtiquetas = new Set<string>();
  for (const f of bancoDelCoach ?? []) {
    if (typeof f === 'string') soloEtiquetas.add(f);
    else if (f.label) banco.set(f.label, f);
  }

  if (payload.meals !== undefined && !Array.isArray(payload.meals)) {
    issues.push({ field: 'meals', message: 'meals debe ser una lista (o no venir)' });
  }

  const meals = (Array.isArray(payload.meals) ? payload.meals : []).map(meal => {
    if (!meal.name?.trim()) issues.push({ field: 'meals[].name', message: 'Cada comida necesita un nombre' });
    const items: DietItem[] = [];
    for (const item of meal.items ?? []) {
      const food = banco.get(item.foodLabel);
      if (!food && !soloEtiquetas.has(item.foodLabel)) {
        issues.push({
          field: 'item.foodLabel',
          message: `Alimento no reconocido: "${item.foodLabel}" — usa get_food_library para ver las etiquetas exactas válidas`,
        });
        continue;
      }
      const category = food?.category ?? item.category;
      if (!category || !CATS.includes(category)) {
        issues.push({ field: 'item.category', message: `No sé de qué grupo es "${item.foodLabel}"` });
        continue;
      }
      const base = parseBaseGrams(item.foodLabel) ?? food?.gramosPorIntercambio ?? null;
      let raciones: number;
      if (item.gramos !== undefined) {
        if (!numeroValido(item.gramos) || item.gramos <= 0) {
          issues.push({ field: 'item.gramos', message: `Gramos inválidos en "${item.foodLabel}" (${JSON.stringify(item.gramos)})` });
          continue;
        }
        if (!base) {
          issues.push({ field: 'item.gramos', message: `"${item.foodLabel}" va sin pesar: indica raciones en vez de gramos` });
          continue;
        }
        raciones = item.gramos / base;
      } else {
        const r = item.raciones ?? item.quantity;
        if (!numeroValido(r) || r <= 0) {
          issues.push({ field: 'item.gramos', message: `Falta la cantidad de "${item.foodLabel}": gramos (o raciones si va sin pesar)` });
          continue;
        }
        raciones = r;
      }
      items.push({
        category,
        foodLabel: item.foodLabel,
        quantity: Math.round(raciones * 100) / 100,
        ...(base ? { baseGrams: base } : {}),
      });
    }
    return { name: meal.name, items };
  });

  // Coherencia: lo que suman las comidas debe cuadrar con el objetivo.
  const lineas = meals.flatMap(m => m.items);
  if (issues.length === 0 && objetivo && lineas.length > 0) {
    const puesto = redondearMacros(macrosDeLineas(lineas));
    const fuera = (['p', 'hc', 'g'] as const).filter(k =>
      Math.abs(puesto[k] - objetivo[k]) > Math.max(TOLERANCIA_COMIDAS[k], objetivo[k] * 0.1));
    if (fuera.length) {
      issues.push({
        field: 'meals',
        message: `Las comidas suman P ${Math.round(puesto.p)} g · HC ${Math.round(puesto.hc)} g · G ${Math.round(puesto.g)} g (${Math.round(puesto.kcal)} kcal) y el objetivo es P ${objetivo.p} g · HC ${objetivo.hc} g · G ${objetivo.g} g (${objetivo.kcal} kcal): deben cuadrar (ajusta el objetivo o los gramos)`,
      });
    }
  }

  return { issues, objetivo, meals };
}

export function validateDietPayload(
  payload: DietUpdatePayload,
  bancoDelCoach?: Iterable<AlimentoDelBanco | string>,
): ValidationIssue[] {
  return leerDietaPropuesta(payload, bancoDelCoach).issues;
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
  // Hasta 14: por encima de 7 el mesociclo deja de ser semanal y pasa a ser un
  // ciclo largo que se repite cada N días (ver diasDeCiclo en utils/progression).
  // 14 es el ciclo de dos semanas de la calculadora de frecuencias («y media»).
  if (!Number.isInteger(payload.daysPerWeek) || payload.daysPerWeek < 1 || payload.daysPerWeek > 14) {
    issues.push({ field: 'daysPerWeek', message: `daysPerWeek debe ser un entero entre 1 y 14 (recibido: ${JSON.stringify(payload.daysPerWeek)})` });
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
      const d = f.diet as { name?: unknown; objetivo?: unknown; budget?: unknown; meals?: unknown };
      if (typeof d.name !== 'string' || !d.name.trim() || (!d.objetivo && !d.budget)) {
        issues.push({ field: `phases[${i}].diet`, message: `Fase ${donde}: la dieta necesita name y objetivo` });
      } else {
        for (const issue of validateDietPayload(d as DietUpdatePayload)) {
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
