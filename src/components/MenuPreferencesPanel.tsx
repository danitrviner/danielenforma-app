import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AthleteNutritionConfig, HungerProfile } from '../types';
import { getOnboarding, getAthleteNutritionConfig, saveAthleteNutritionConfig } from '../dbService';
import VegetableSelector from './VegetableSelector';
import { DISH_TYPES, DishType } from '../utils/dishTypes';
import { SLOT_LABEL } from '../utils/mealDistribution';
import { Icon, SegmentedControl, Select, Skeleton } from './ui';
import type { SegmentedOption } from './ui';

interface Props {
  athleteEmail: string;
}

const HUNGER_OPTIONS: SegmentedOption[] = [
  { value: 'manana', label: 'Por la mañana' },
  { value: 'equilibrado', label: 'Equilibrado' },
  { value: 'noche', label: 'Por la noche' },
];

const TRAINING_SLOT_FALLBACK_OPTIONS = [1, 2, 3, 4, 5].map(s => ({ value: String(s), label: SLOT_LABEL[s] }));

// Deducción de partida desde la ficha — el atleta ya contó en el onboarding
// cuándo tiene más apetito, en texto libre. Sirve de valor por defecto
// mientras no diga lo contrario aquí, no sustituye a su elección explícita.
function inferHungerProfile(text?: string): HungerProfile | undefined {
  if (!text) return undefined;
  const t = text.toLowerCase();
  if (/noche|cena/.test(t)) return 'noche';
  if (/mañana|desayun/.test(t)) return 'manana';
  return undefined;
}

// Preferencias de menú del atleta — antes repartidas entre MyMenuScreen
// (tipos de comida, variedad, batch cooking) y NutritionHubScreen (verduras
// habituales), compitiendo por espacio con el menú ya publicado. Viven aquí,
// en Perfil > Preferencias, como configuración que se aplica a la PRÓXIMA vez
// que el coach genera algo — no a lo que ya está hecho. También es donde el
// atleta indica cuándo tiene más hambre, que alimenta el reparto automático
// de intercambios por comida del coach (utils/mealDistribution.ts).
export default function MenuPreferencesPanel({ athleteEmail }: Props) {
  const queryClient = useQueryClient();
  const onboardingKey = ['onboarding', athleteEmail] as const;
  const { data: onboarding = null } = useQuery({
    queryKey: onboardingKey,
    queryFn: () => getOnboarding(athleteEmail),
  });
  const nutritionConfigKey = ['athleteNutritionConfig', athleteEmail] as const;
  const { data: nutritionConfig = null, isPending } = useQuery({
    queryKey: nutritionConfigKey,
    queryFn: () => getAthleteNutritionConfig(athleteEmail),
  });

  const [savingVariety, setSavingVariety] = useState(false);
  const [savingBatchPref, setSavingBatchPref] = useState(false);
  const [savingHunger, setSavingHunger] = useState(false);
  const [savingTrainingSlot, setSavingTrainingSlot] = useState(false);

  function patch(next: Partial<AthleteNutritionConfig>) {
    const merged: AthleteNutritionConfig = { ...(nutritionConfig ?? { athleteId: athleteEmail, enabledModes: [] }), ...next };
    queryClient.setQueryData(nutritionConfigKey, merged);
    return saveAthleteNutritionConfig(merged).catch(() => {});
  }

  // Tipos de comida (tri-state: neutral → más → evitar), igual que antes en Mi menú.
  async function cycleDishType(id: DishType) {
    const pref = new Set((nutritionConfig?.preferredDishTypes ?? onboarding?.preferredDishTypes ?? []) as string[]);
    const excl = new Set((nutritionConfig?.excludedDishTypes ?? onboarding?.excludedDishTypes ?? []) as string[]);
    if (pref.has(id)) { pref.delete(id); excl.add(id); }
    else if (excl.has(id)) { excl.delete(id); }
    else { pref.add(id); }
    await patch({ preferredDishTypes: Array.from(pref), excludedDishTypes: Array.from(excl) });
  }
  function dishState(id: string): 'pref' | 'excl' | 'neutral' {
    const pref = (nutritionConfig?.preferredDishTypes ?? onboarding?.preferredDishTypes ?? []) as string[];
    const excl = (nutritionConfig?.excludedDishTypes ?? onboarding?.excludedDishTypes ?? []) as string[];
    if (pref.includes(id)) return 'pref';
    if (excl.includes(id)) return 'excl';
    return 'neutral';
  }

  const variety = nutritionConfig?.menuVariety ?? onboarding?.menuVariety ?? 3;
  async function handleVarietyChange(v: number) {
    setSavingVariety(true);
    try { await patch({ menuVariety: v }); } finally { setSavingVariety(false); }
  }

  const batchPreferred = nutritionConfig?.batchCookingPreferred ?? onboarding?.batchCookingPreferred ?? false;
  async function handleBatchPrefChange(value: boolean) {
    setSavingBatchPref(true);
    try { await patch({ batchCookingPreferred: value }); } finally { setSavingBatchPref(false); }
  }

  const inferredHunger = inferHungerProfile(onboarding?.appetitePeakTime);
  const hungerValue: HungerProfile = nutritionConfig?.hungerProfile ?? inferredHunger ?? 'equilibrado';
  const hungerIsInferred = !nutritionConfig?.hungerProfile && !!inferredHunger;
  async function handleHungerChange(v: string) {
    setSavingHunger(true);
    try { await patch({ hungerProfile: v as HungerProfile }); } finally { setSavingHunger(false); }
  }

  const trainingSlotOptions = onboarding?.meals?.length
    ? onboarding.meals.map(m => ({ value: String(m.intakeType), label: m.name || SLOT_LABEL[m.intakeType] || `Franja ${m.intakeType}` }))
    : TRAINING_SLOT_FALLBACK_OPTIONS;
  async function handleTrainingSlotChange(v: string) {
    setSavingTrainingSlot(true);
    try { await patch({ trainingSlot: v ? Number(v) : undefined }); } finally { setSavingTrainingSlot(false); }
  }

  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full rounded-surface" />
        <Skeleton className="h-40 w-full rounded-surface" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Hambre + comida de entreno — alimenta el reparto automático del coach */}
      <div className="bg-surface border border-hairline rounded-surface p-5 space-y-4">
        <h3 className="font-sans font-bold text-title-s text-white flex items-center gap-2">
          <Icon name="restaurant" size="m" className="text-accent" />
          Cuándo comes
        </h3>
        <div>
          <p className="font-sans text-caption text-ink-2 mb-2">¿Cuándo tienes más hambre?</p>
          <SegmentedControl options={HUNGER_OPTIONS} value={hungerValue} onChange={handleHungerChange} label="Cuándo tienes más hambre" />
          {hungerIsInferred && (
            <p className="font-sans text-caption text-ink-3 mt-1">Lo dedujimos de tu ficha — corrígelo si no es así.</p>
          )}
          {savingHunger && <p className="font-mono text-caption text-ink-3 mt-1">Guardando…</p>}
        </div>
        <Select
          label="¿Qué comida haces cerca del entreno?"
          value={nutritionConfig?.trainingSlot != null ? String(nutritionConfig.trainingSlot) : ''}
          onChange={handleTrainingSlotChange}
          options={trainingSlotOptions}
          placeholder="No entreno a una hora fija"
          disabled={savingTrainingSlot}
          hint="Tu coach usará esto para poner más hidratos en esa comida al repartir tus intercambios."
        />
      </div>

      {/* Tipos de comida */}
      <div className="bg-surface border border-hairline rounded-surface p-5 space-y-3">
        <h3 className="font-sans font-bold text-title-s text-white flex items-center gap-2">
          <Icon name="tune" size="m" className="text-accent" />
          Tipos de comida que prefieres
        </h3>
        <p className="font-sans text-caption text-ink-3">
          Toca una vez para que salga <span className="text-accent">más</span>, otra vez para <span className="text-red-400">evitarla</span>, otra para dejarla neutral.
        </p>
        <div className="flex flex-wrap gap-2">
          {DISH_TYPES.filter(dt => dt.id !== 'otro').map(dt => {
            const st = dishState(dt.id);
            const cls = st === 'pref'
              ? 'bg-accent border-accent text-black'
              : st === 'excl'
                ? 'bg-red-500/15 border-red-500/40 text-red-300 line-through'
                : 'bg-raised border-hairline text-ink-2 hover:text-white';
            return (
              <button
                key={dt.id}
                onClick={() => cycleDishType(dt.id)}
                className={`flex items-center gap-1 px-3 py-2 rounded-control border font-mono text-caption font-bold transition-all ${cls}`}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>{dt.icon}</span>
                {dt.label}
              </button>
            );
          })}
        </div>
        <p className="font-sans text-caption text-ink-3">Se aplica a tus intercambios de recetas y a la próxima generación del coach.</p>
      </div>

      {/* Variedad + batch cooking */}
      <div className="bg-surface border border-hairline rounded-surface p-5 space-y-2">
        <p className="font-sans text-caption text-ink-2 uppercase">¿Cómo prefieres tu menú?</p>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map(v => (
            <button
              key={v}
              disabled={savingVariety}
              onClick={() => handleVarietyChange(v)}
              className={`flex-1 py-2 rounded-control font-mono font-bold text-label transition-all disabled:opacity-50 ${variety === v ? 'bg-accent text-black' : 'bg-raised border border-hairline text-ink-2 hover:text-white'}`}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="flex justify-between">
          <span className="font-sans text-caption text-ink-3">Repetitivo, más sencillo</span>
          <span className="font-mono text-caption text-ink-3">Muy variado</span>
        </div>

        <button
          onClick={() => handleBatchPrefChange(!batchPreferred)}
          disabled={savingBatchPref}
          className="w-full flex items-center gap-3 pt-3 mt-1 border-t border-hairline text-left disabled:opacity-50"
        >
          <span className={`w-5 h-5 rounded-control flex-shrink-0 border-2 flex items-center justify-center transition-colors ${batchPreferred ? 'bg-accent border-accent' : 'border-hairline'}`}>
            {batchPreferred && <span className="material-symbols-outlined text-black" style={{ fontSize: '13px' }}>check</span>}
          </span>
          <span className="flex-1">
            <span className="flex items-center gap-2 font-sans font-bold text-label text-white">
              <Icon name="inventory_2" size="s" className="text-accent" />
              Prefiero batch cooking
            </span>
            <span className="block font-sans text-caption text-ink-2">Cocinar todo de una vez y repartirlo por días.</span>
          </span>
        </button>

        <p className="font-sans text-caption text-ink-3">Se aplicará la próxima vez que tu entrenador genere el menú.</p>
      </div>

      {/* Verduras habituales */}
      <div className="bg-surface border border-hairline rounded-surface p-5 space-y-3">
        <div>
          <h3 className="font-sans font-bold text-title-s text-white flex items-center gap-2">
            <Icon name="eco" size="m" className="text-accent" />
            Tus verduras habituales
          </h3>
          <p className="font-sans text-caption text-ink-2 mt-1">
            Marca las verduras que sueles comer en tu día a día — así tu entrenador afina la estimación de vitaminas y minerales.
          </p>
        </div>
        <VegetableSelector
          selected={nutritionConfig?.vegTypes ?? []}
          onToggle={id => {
            const cur = nutritionConfig?.vegTypes ?? [];
            patch({ vegTypes: cur.includes(id) ? cur.filter(v => v !== id) : [...cur, id] });
          }}
        />
      </div>
    </div>
  );
}
