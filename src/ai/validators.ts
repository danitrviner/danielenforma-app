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
const SERIES_PER_DAY_SOFT_CAP = 12; // > daysPerWeek*12 dispara overloadAlert en la app

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
  if (!Number.isInteger(payload.daysPerWeek) || payload.daysPerWeek < 1 || payload.daysPerWeek > 7) {
    issues.push({ field: 'daysPerWeek', message: `daysPerWeek debe ser un entero entre 1 y 7 (recibido: ${JSON.stringify(payload.daysPerWeek)})` });
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
