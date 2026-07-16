import React, { useEffect, useMemo, useState } from 'react';
import {
  UserProfile, WeeklyMenu, OnboardingData, AthleteNutritionConfig,
  WeekDay, MenuDay, MenuMeal, Recipe, FoodCategory,
} from '../types';
import {
  getPublishedMenu, getOnboarding, getAthleteNutritionConfig, saveAthleteNutritionConfig,
  updateWeeklyMenu, getDietCompletionLog, saveDietCompletionLog,
  queryIndyaForGenerator, getRecipes, getRecipeById,
} from '../dbService';
import { findSwapAlternatives, recipeMatchesSlot, GeneratorPrefs, MenuCandidate } from '../utils/menuEngine';

const WEEK_DAYS: WeekDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WEEK_DAY_SHORT: Record<WeekDay, string> = { mon: 'L', tue: 'M', wed: 'X', thu: 'J', fri: 'V', sat: 'S', sun: 'D' };
const WEEK_DAY_FULL: Record<WeekDay, string> = {
  mon: 'Lunes', tue: 'Martes', wed: 'Miércoles', thu: 'Jueves', fri: 'Viernes', sat: 'Sábado', sun: 'Domingo',
};
const CAT_LABEL: Record<FoodCategory, string> = { HC: 'HC', PROT: 'PROT', GRASA: 'GRASA', MIX_HC: 'MIX·HC', MIX_GRASA: 'MIX·GRASA' };

const TODAY_DATE: string = new Date().toISOString().split('T')[0];

// JS getDay(): 0=Sun..6=Sat → our WeekDay array is Mon-first.
function todayWeekDay(): WeekDay {
  const jsDay = new Date().getDay();
  return WEEK_DAYS[(jsDay + 6) % 7];
}

function fmtExch(exch: { HC: number; PROT: number; GRASA: number }): string {
  const parts: string[] = [];
  if (exch.HC > 0) parts.push(`${exch.HC} HC`);
  if (exch.PROT > 0) parts.push(`${exch.PROT} PROT`);
  if (exch.GRASA > 0) parts.push(`${exch.GRASA} GRASA`);
  return parts.join(' · ') || '—';
}

interface Props {
  profile: UserProfile;
}

export default function MyMenuScreen({ profile }: Props) {
  const [loading, setLoading] = useState(true);
  const [menu, setMenu] = useState<WeeklyMenu | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingData | null>(null);
  const [nutritionConfig, setNutritionConfig] = useState<AthleteNutritionConfig | null>(null);
  const [selectedDay, setSelectedDay] = useState<WeekDay>(todayWeekDay());
  const [doneKeys, setDoneKeys] = useState<Set<string>>(new Set());

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRecipe, setDetailRecipe] = useState<Recipe | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [swapFor, setSwapFor] = useState<{ mealId: string; slot: number } | null>(null);
  const [swapLoading, setSwapLoading] = useState(false);
  const [swapCandidates, setSwapCandidates] = useState<MenuCandidate[]>([]);
  const [savingVariety, setSavingVariety] = useState(false);

  useEffect(() => {
    Promise.all([
      getPublishedMenu(profile.email),
      getOnboarding(profile.email),
      getAthleteNutritionConfig(profile.email),
      getDietCompletionLog(profile.email, TODAY_DATE),
    ]).then(([m, ob, cfg, log]) => {
      setMenu(m);
      setOnboarding(ob);
      setNutritionConfig(cfg);
      const menuKeys = (log?.doneItemIds ?? []).filter(k => k.startsWith('menu:'));
      setDoneKeys(new Set(menuKeys));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [profile.email]);

  const prefs: GeneratorPrefs = useMemo(() => ({
    allergies: onboarding?.allergies ?? [],
    disliked: onboarding?.dislikedFoods ?? [],
    liked: onboarding?.likedFoods ?? [],
    dietType: onboarding?.dietType,
    cookingMaxTime: onboarding?.cookingMaxTime,
    variety: nutritionConfig?.menuVariety ?? onboarding?.menuVariety ?? 3,
  }), [onboarding, nutritionConfig]);

  const day: MenuDay | undefined = menu?.days.find(d => d.day === selectedDay);

  // Preserve any "menu:"-unrelated keys already in today's completion log
  // (e.g. written by the Intercambios tracker) — only this screen's own keys
  // are added/removed here, since saveDietCompletionLog overwrites the whole doc.
  async function toggleDone(mealId: string) {
    if (!menu) return;
    const key = `menu:${selectedDay}_${mealId}`;
    const next = new Set<string>(doneKeys);
    if (next.has(key)) next.delete(key); else next.add(key);
    setDoneKeys(next);
    const existing = await getDietCompletionLog(profile.email, TODAY_DATE);
    const preserved = (existing?.doneItemIds ?? []).filter(k => !k.startsWith('menu:'));
    await saveDietCompletionLog({
      athleteId: profile.email, date: TODAY_DATE,
      dietId: existing?.dietId ?? menu.id,
      doneItemIds: [...preserved, ...Array.from(next)],
    }).catch(() => {});
  }

  async function openDetail(recipeId: string) {
    if (!recipeId) return;
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailRecipe(null);
    const r = await getRecipeById(recipeId);
    setDetailRecipe(r);
    setDetailLoading(false);
  }

  function closeDetail() {
    setDetailOpen(false);
    setDetailRecipe(null);
  }

  async function openSwap(meal: MenuMeal) {
    setSwapFor({ mealId: meal.id, slot: meal.slot });
    setSwapLoading(true);
    setSwapCandidates([]);
    if (day) {
      const [indya, builder] = await Promise.all([queryIndyaForGenerator(meal.slot, 300), getRecipes()]);
      const pool = [...indya, ...builder.filter(r => recipeMatchesSlot(r, meal.slot))];
      const alts = findSwapAlternatives(day, meal.id, pool, prefs, 5);
      setSwapCandidates(alts);
    }
    setSwapLoading(false);
  }

  async function confirmSwap(candidate: MenuCandidate) {
    if (!menu || !day || !swapFor) return;
    const meal = day.meals.find(m => m.id === swapFor.mealId);
    if (!meal) return;

    const nextMeals = day.meals.map(m => m.id === meal.id
      ? { ...m, recipeId: candidate.recipe.id, recipeName: candidate.recipe.name, recipeImage: candidate.recipe.image ?? candidate.recipe.photoUrl, scale: candidate.scale, exch: candidate.exch, complements: [] }
      : m);
    const nextDay: MenuDay = { ...day, meals: nextMeals };
    const nextDays = menu.days.map(d => d.day === selectedDay ? nextDay : d);
    const swapEntry = {
      at: new Date().toISOString(), day: selectedDay, mealId: meal.id,
      fromRecipeId: meal.recipeId, fromRecipeName: meal.recipeName,
      toRecipeId: candidate.recipe.id, toRecipeName: candidate.recipe.name, toScale: candidate.scale,
    };
    const nextMenu: WeeklyMenu = { ...menu, days: nextDays, swapHistory: [...menu.swapHistory, swapEntry] };
    setMenu(nextMenu);
    setSwapFor(null);
    await updateWeeklyMenu(menu.id, { days: nextDays, swapHistory: nextMenu.swapHistory }).catch(() => {});
  }

  async function handleVarietyChange(v: number) {
    setSavingVariety(true);
    const next: AthleteNutritionConfig = { ...(nutritionConfig ?? { athleteId: profile.email, enabledModes: [] }), menuVariety: v };
    setNutritionConfig(next);
    try { await saveAthleteNutritionConfig(next); } finally { setSavingVariety(false); }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="material-symbols-outlined text-3xl text-[#fbcb1a] animate-spin">progress_activity</span>
      </div>
    );
  }

  if (!menu) {
    return (
      <div className="bg-[#181816] border border-white/7 rounded-2xl p-8 text-center space-y-2">
        <span className="material-symbols-outlined text-3xl text-[#2a2a2a] block">restaurant_menu</span>
        <p className="font-sans font-bold text-sm text-white">Todavía no tienes un menú semanal</p>
        <p className="font-mono text-xs text-[#c6c9ab]">Tu entrenador aún no ha publicado un menú basado en recetas. Mientras tanto, sigue usando Intercambios.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Week strip */}
      <div className="grid grid-cols-7 gap-1.5">
        {WEEK_DAYS.map(d => {
          const active = d === selectedDay;
          const isToday = d === todayWeekDay();
          const md = menu.days.find(x => x.day === d);
          const hasMeals = (md?.meals.length ?? 0) > 0;
          return (
            <button
              key={d}
              onClick={() => setSelectedDay(d)}
              className={`flex flex-col items-center gap-0.5 py-2 rounded-xl border transition-all ${active ? 'bg-[#fbcb1a] border-[#fbcb1a] text-black' : 'bg-[#181816] border-white/7 text-[#c6c9ab] hover:border-white/20'}`}
            >
              <span className="font-mono text-[10px] font-bold uppercase">{WEEK_DAY_SHORT[d]}</span>
              {isToday && <span className={`w-1 h-1 rounded-full ${active ? 'bg-black' : 'bg-[#fbcb1a]'}`} />}
              {!hasMeals && <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>remove</span>}
            </button>
          );
        })}
      </div>

      <div>
        <h2 className="font-sans font-extrabold text-xl text-white">{WEEK_DAY_FULL[selectedDay]}</h2>
        <p className="font-mono text-xs text-[#c6c9ab]">{day?.dietName ?? 'Día libre'}</p>
      </div>

      {/* Meals */}
      {!day || day.meals.length === 0 ? (
        <div className="bg-[#181816] border border-white/7 rounded-2xl p-6 text-center">
          <p className="font-mono text-xs text-[#c6c9ab]">Sin menú para este día — usa Intercambios si quieres montarte algo igualmente.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {day.meals.map(meal => {
            const done = doneKeys.has(`menu:${selectedDay}_${meal.id}`);
            return (
              <div key={meal.id} className={`bg-[#181816] border rounded-2xl p-3 flex gap-3 transition-all ${done ? 'border-emerald-400/30' : 'border-white/7'}`}>
                <button
                  onClick={() => toggleDone(meal.id)}
                  className={`flex-shrink-0 w-8 h-8 rounded-full border-2 flex items-center justify-center transition-colors self-start mt-1 ${done ? 'bg-emerald-400 border-emerald-400' : 'border-[#3a3a3a] hover:border-[#c6c9ab]'}`}
                  title={done ? 'Marcar como no hecha' : 'Marcar como hecha'}
                >
                  {done && <span className="material-symbols-outlined text-black text-base">check</span>}
                </button>

                <button
                  onClick={() => openDetail(meal.recipeId)}
                  className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-[#1c1b1b] border border-white/7"
                >
                  {meal.recipeImage
                    ? <img src={meal.recipeImage} alt={meal.recipeName} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center"><span className="material-symbols-outlined text-xl text-[#2a2a2a]">skillet</span></div>}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[9px] text-[#555] uppercase">{meal.name}</span>
                    {meal.scale !== 1 && <span className="font-mono text-[9px] text-[#fbcb1a]">×{meal.scale}</span>}
                  </div>
                  <p className={`font-sans font-bold text-sm leading-tight ${done ? 'text-[#c6c9ab] line-through' : 'text-white'}`}>{meal.recipeName}</p>
                  <p className="font-mono text-[9px] text-[#c6c9ab] mt-0.5">{fmtExch(meal.exch)} · {meal.kcal} kcal</p>
                  {meal.complements.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {meal.complements.map((c, ci) => (
                        <span key={ci} className="text-[9px] font-mono text-[#c6c9ab] bg-[#1c1b1b] border border-white/7 px-1.5 py-0.5 rounded">
                          +{c.quantity} {CAT_LABEL[c.category]} · {c.foodLabel}
                        </span>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => openSwap(meal)}
                    className="flex items-center gap-1 mt-1.5 text-[10px] font-mono text-[#00eefc] hover:text-white transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">swap_horiz</span>
                    Intercambiar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Variety preference */}
      <div className="bg-[#181816] border border-white/7 rounded-2xl p-4 space-y-2">
        <p className="font-mono text-[10px] text-[#c6c9ab] uppercase">¿Cómo prefieres tu menú?</p>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map(v => (
            <button
              key={v}
              disabled={savingVariety}
              onClick={() => handleVarietyChange(v)}
              className={`flex-1 py-2 rounded-lg font-mono font-bold text-xs transition-all disabled:opacity-50 ${prefs.variety === v ? 'bg-[#fbcb1a] text-black' : 'bg-[#1c1b1b] border border-white/7 text-[#c6c9ab] hover:text-white'}`}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="flex justify-between">
          <span className="font-mono text-[9px] text-[#555]">Repetitivo, más sencillo</span>
          <span className="font-mono text-[9px] text-[#555]">Muy variado</span>
        </div>
        <p className="font-mono text-[9px] text-[#555]">Se aplicará la próxima vez que tu entrenador genere el menú.</p>
      </div>

      {/* Swap sheet */}
      {swapFor && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4" onClick={() => setSwapFor(null)}>
          <div onClick={e => e.stopPropagation()} className="bg-[#181816] border border-white/7 rounded-2xl w-full max-w-md max-h-[70vh] overflow-y-auto p-4 space-y-2">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-sans font-bold text-sm text-white">Elige una alternativa</h3>
              <button onClick={() => setSwapFor(null)} className="text-[#c6c9ab] hover:text-white">
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>
            {swapLoading ? (
              <p className="font-mono text-xs text-[#555] text-center py-6">Buscando alternativas que mantengan tus puntos…</p>
            ) : swapCandidates.length === 0 ? (
              <p className="font-mono text-xs text-[#555] text-center py-6">No hay alternativas disponibles ahora mismo para este hueco.</p>
            ) : (
              swapCandidates.map((c, ci) => (
                <button
                  key={ci}
                  onClick={() => confirmSwap(c)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left bg-[#0e0e0e] border border-white/7 hover:border-[#fbcb1a]/40 rounded-xl transition-all"
                >
                  <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-[#1c1b1b]">
                    {c.recipe.image ? <img src={c.recipe.image} alt="" className="w-full h-full object-cover" /> : null}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-sans text-sm text-white truncate">{c.recipe.name}</p>
                    <p className="font-mono text-[9px] text-[#c6c9ab]">{fmtExch(c.exch)} · mantiene tus puntos del día</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Recipe detail */}
      {detailOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={closeDetail}>
          <div onClick={e => e.stopPropagation()} className="bg-[#181816] border border-white/7 rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto p-5 space-y-3">
            {detailLoading ? (
              <div className="flex items-center justify-center py-10">
                <span className="material-symbols-outlined text-2xl text-[#fbcb1a] animate-spin">progress_activity</span>
              </div>
            ) : detailRecipe ? (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="font-sans font-bold text-base text-white">{detailRecipe.name}</h3>
                  <button onClick={closeDetail} className="text-[#c6c9ab] hover:text-white">
                    <span className="material-symbols-outlined text-base">close</span>
                  </button>
                </div>
                {(detailRecipe.image ?? detailRecipe.photoUrl) && (
                  <div className="w-full aspect-[16/9] rounded-xl overflow-hidden bg-[#1c1b1b]">
                    <img src={detailRecipe.image ?? detailRecipe.photoUrl} alt={detailRecipe.name} className="w-full h-full object-cover" />
                  </div>
                )}
                {detailRecipe.kcal != null && (
                  <p className="font-mono text-[10px] text-[#c6c9ab]">{detailRecipe.kcal} kcal{detailRecipe.cookingTime != null ? ` · ${detailRecipe.cookingTime} min` : ''}</p>
                )}
                {(detailRecipe.ingredientsText?.length || detailRecipe.ingredients?.length) ? (
                  <div>
                    <p className="font-mono text-[9px] text-[#555] uppercase mb-1.5">Ingredientes</p>
                    <ul className="space-y-1">
                      {(detailRecipe.ingredientsText?.length
                        ? detailRecipe.ingredientsText.map(i => ({ label: i.name, qty: `${i.quantity}g` }))
                        : (detailRecipe.ingredients ?? []).map(i => ({ label: i.foodLabel, qty: `×${i.quantity}` }))
                      ).map((ing, idx) => (
                        <li key={idx} className="flex items-center justify-between py-1 border-b border-white/7 last:border-0">
                          <span className="text-xs text-white font-sans flex-1 pr-2">{ing.label}</span>
                          <span className="font-mono text-[10px] text-[#c6c9ab] shrink-0">{ing.qty}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {(detailRecipe.stepsText?.length || detailRecipe.steps?.length) ? (
                  <div>
                    <p className="font-mono text-[9px] text-[#555] uppercase mb-1.5">Preparación</p>
                    <ol className="space-y-1.5 list-decimal list-inside">
                      {(detailRecipe.stepsText?.length
                        ? detailRecipe.stepsText.map(s => s.description)
                        : detailRecipe.steps ?? []
                      ).map((text, idx) => (
                        <li key={idx} className="text-xs text-[#c6c9ab] font-sans leading-relaxed">{text}</li>
                      ))}
                    </ol>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div className="flex justify-end">
                  <button onClick={closeDetail} className="text-[#c6c9ab] hover:text-white">
                    <span className="material-symbols-outlined text-base">close</span>
                  </button>
                </div>
                <p className="font-mono text-xs text-[#555] text-center py-6">No se pudo cargar la receta.</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
