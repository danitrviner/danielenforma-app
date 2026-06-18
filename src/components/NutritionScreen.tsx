import React, { useState, useEffect } from 'react';
import { UserProfile, MealState, MealItem, NutritionDayType, FoodCategory, DietMode } from '../types';
import { getOrCreateMealState, updateMealState, getActiveNutritionAssignment, getFoodItems, seedFoodItemsIfEmpty, getAthleteNutritionConfig } from '../dbService';

const CAT_LABEL: Record<FoodCategory, string> = {
  HC:        'HC',
  PROT:      'Proteína',
  GRASA:     'Grasa',
  MIX_HC:    '½ Prot + ½ HC',
  MIX_GRASA: '½ Prot + ½ Grasa',
};

const CAT_COLOR: Record<FoodCategory, string> = {
  HC:        'text-amber-300',
  PROT:      'text-blue-300',
  GRASA:     'text-orange-300',
  MIX_HC:    'text-violet-300',
  MIX_GRASA: 'text-pink-300',
};

const MODE_LABEL: Record<DietMode, string> = {
  OMNIVORO:  'Omnívoro',
  VEGANO:    'Vegano',
  SIN_PESAR: 'Sin pesar',
};

const ALL_CATEGORIES: FoodCategory[] = ['HC', 'PROT', 'GRASA', 'MIX_HC', 'MIX_GRASA'];

interface NutritionScreenProps {
  profile: UserProfile;
}

export default function NutritionScreen({ profile }: NutritionScreenProps) {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [mealState, setMealState] = useState<MealState | null>(null);
  const [activeMealIdForPicker, setActiveMealIdForPicker] = useState<number | null>(null);
  const [activeCategoryForPicker, setActiveCategoryForPicker] = useState<FoodCategory>('HC');
  const [activePlan, setActivePlan] = useState<NutritionDayType | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [foodItems, setFoodItems] = useState<MealItem[]>([]);
  const [enabledModes, setEnabledModes] = useState<DietMode[]>(['OMNIVORO']);
  const [activeDietMode, setActiveDietMode] = useState<DietMode>('OMNIVORO');

  const displayDateStr = new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-ES', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  // Load foods, plan, and diet mode config once
  useEffect(() => {
    (async () => {
      await seedFoodItemsIfEmpty();
      const [foods, planResult, config] = await Promise.all([
        getFoodItems(),
        getActiveNutritionAssignment(profile.email).catch(() => null),
        getAthleteNutritionConfig(profile.email).catch(() => null),
      ]);
      setFoodItems(foods);
      setActivePlan(planResult?.plan ?? null);
      if (config && config.enabledModes.length > 0) {
        setEnabledModes(config.enabledModes);
        setActiveDietMode(config.enabledModes[0]);
      }
    })();
  }, [profile.email]);

  useEffect(() => {
    setLoading(true);
    getOrCreateMealState(profile.userId, selectedDate)
      .then(setMealState)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [profile.userId, selectedDate]);

  const getMealPickerCategory = (mealNum: number): FoodCategory => {
    const meal = activePlan?.meals[mealNum - 1];
    if (meal && meal.exchanges.length > 0) return meal.exchanges[0].category;
    return 'HC';
  };

  const handleOpenPicker = (mealNum: number, category: FoodCategory) => {
    setActiveMealIdForPicker(mealNum);
    setActiveCategoryForPicker(category);
    setSearchTerm('');
  };

  const handleToggleMealComplete = async (mealNum: 1 | 2 | 3 | 4 | 5) => {
    if (!mealState) return;
    const key = `comida${mealNum}` as keyof MealState;
    const currentVal = mealState[key] as any;
    if (!currentVal) {
      handleOpenPicker(mealNum, getMealPickerCategory(mealNum));
      return;
    }
    const updatedCol = { ...currentVal, completed: !currentVal.completed };
    const updates = { [key]: updatedCol };
    setMealState(prev => prev ? { ...prev, ...updates } : null);
    await updateMealState(profile.userId, selectedDate, updates);
  };

  const handleShiftDay = (days: number) => {
    const date = new Date(selectedDate + 'T12:00:00');
    date.setDate(date.getDate() + days);
    setSelectedDate(date.toISOString().split('T')[0]);
  };

  const handleSelectFood = async (food: MealItem) => {
    if (!mealState || !activeMealIdForPicker) return;
    const key = `comida${activeMealIdForPicker}` as keyof MealState;
    const updatedCol = {
      completed: false,
      foodId: food.id,
      title: food.label,
      portion: '1 intercambio',
      specs: food.category,
    };
    const updates = { [key]: updatedCol };
    setMealState(prev => prev ? { ...prev, ...updates } : null);
    await updateMealState(profile.userId, selectedDate, updates);
    setActiveMealIdForPicker(null);
  };

  let completedCount = 0, totalDefined = 0;
  if (mealState) {
    (['comida1', 'comida2', 'comida3', 'comida4', 'comida5'] as const).forEach(key => {
      const slot = mealState[key] as any;
      if (slot) { totalDefined++; if (slot.completed) completedCount++; }
    });
  }

  const filteredFoods = foodItems.filter(f => {
    if (f.mode !== activeDietMode) return false;
    if (f.category !== activeCategoryForPicker) return false;
    if (searchTerm && !f.label.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="font-sans font-extrabold text-3xl text-white tracking-tight">Nutrition Tracker</h1>
        <p className="text-[#c6c9ab] text-sm mt-1">Intercambia alimentos de forma equivalente manteniendo tus requerimientos calóricos.</p>
      </div>

      {/* Mode selector (only shown if multiple modes enabled) */}
      {enabledModes.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {enabledModes.map(mode => (
            <button
              key={mode}
              onClick={() => setActiveDietMode(mode)}
              className={`px-4 py-2 rounded-xl font-mono text-xs font-bold uppercase tracking-wider transition-all ${
                activeDietMode === mode
                  ? 'bg-[#e2ff00] text-black shadow-md'
                  : 'bg-[#1c1b1b] text-[#c6c9ab] border border-[#2a2a2a] hover:border-[#e2ff00]/40 hover:text-white'
              }`}
            >
              {MODE_LABEL[mode]}
            </button>
          ))}
        </div>
      )}

      {/* Date Selector */}
      <div className="flex items-center justify-between bg-[#1c1b1b] rounded-xl p-4 border border-[#2a2a2a] shadow-md">
        <button onClick={() => handleShiftDay(-1)} className="text-[#c6c9ab] hover:text-[#e2ff00] transition-colors p-2 rounded-full hover:bg-[#201f1f] flex items-center justify-center">
          <span className="material-symbols-outlined select-none text-2xl">chevron_left</span>
        </button>
        <div className="text-center select-none">
          <span className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-widest font-bold">FECHA REGISTRADA</span>
          <span className="block font-sans font-bold text-lg text-white mt-0.5">{displayDateStr}</span>
          <span className="block font-mono text-[9px] text-[#00eefc] uppercase mt-1 tracking-wider">
            {activePlan ? activePlan.name : 'Plan de macros optimizado'}
          </span>
        </div>
        <button onClick={() => handleShiftDay(1)} className="text-[#c6c9ab] hover:text-[#e2ff00] transition-colors p-2 rounded-full hover:bg-[#201f1f] flex items-center justify-center">
          <span className="material-symbols-outlined select-none text-2xl">chevron_right</span>
        </button>
      </div>

      {/* Progress */}
      <div className="bg-[#121212] border border-[#2a2a2a] p-4 rounded-xl">
        <div className="flex justify-between items-end mb-2">
          <h2 className="font-sans font-bold text-sm text-[#e5e2e1] uppercase tracking-wide">Progreso del plan</h2>
          <span className="font-mono text-xs text-[#e2ff00] font-bold">{completedCount} / {Math.max(1, totalDefined)} COMPLETADAS</span>
        </div>
        <div className="h-2 w-full bg-[#1c1b1b] rounded-full overflow-hidden">
          <div className="h-full bg-[#e2ff00] rounded-full transition-all duration-500 volt-glow" style={{ width: `${(completedCount / Math.max(1, totalDefined)) * 100}%` }} />
        </div>
      </div>

      {/* Meal blocks */}
      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-10 font-mono text-sm text-[#c6c9ab] animate-pulse">Sincronizando nutrientes...</div>
        ) : mealState ? (
          ([1, 2, 3, 4, 5] as const).map((num) => {
            const key = `comida${num}` as keyof MealState;
            const data = mealState[key] as any;
            const planMeal = activePlan?.meals[num - 1];
            const mealName = planMeal?.name ?? `Comida ${num}`;
            const slotsSummary = planMeal
              ? planMeal.exchanges.map(e => `${e.count}× ${CAT_LABEL[e.category]}`).join(' · ')
              : null;
            const pickerCat = getMealPickerCategory(num);

            return (
              <div key={num} className={`bg-[#201f1f] rounded-xl overflow-hidden border transition-all ${data?.completed ? 'border-[#e2ff00]/40 bg-[#121212]' : 'border-[#2a2a2a]'}`}>
                <div className="w-full flex items-center justify-between p-4 bg-[#1c1b1b]/80">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleToggleMealComplete(num)}
                      className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${data?.completed ? 'bg-[#e2ff00] text-black border-transparent' : 'border border-[#c6c9ab]/40 text-transparent hover:border-[#e2ff00]'}`}
                    >
                      <span className="material-symbols-outlined text-sm font-black">check</span>
                    </button>
                    <div>
                      <span className="font-sans font-bold text-white text-base">{mealName}</span>
                      <p className="text-[10px] text-[#c6c9ab] font-mono mt-0.5">
                        {slotsSummary ?? 'Definida según requerimiento específico'}
                      </p>
                    </div>
                  </div>
                  {data && (
                    <span className={`text-[10px] font-mono uppercase tracking-wider font-bold ${CAT_COLOR[data.specs as FoodCategory] ?? 'text-[#c6c9ab]'}`}>
                      {CAT_LABEL[data.specs as FoodCategory] ?? data.specs}
                    </span>
                  )}
                </div>

                <div className="p-4 border-t border-[#2a2a2a]/60 space-y-3 bg-[#131313]/40">
                  {data ? (
                    <div className="flex items-center justify-between bg-[#121212] p-3 rounded-lg border border-[#2a2a2a]">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded bg-[#2a2a2a] flex-shrink-0 flex items-center justify-center font-mono text-xs font-extrabold text-[#e2ff00]">
                          {(data.title as string)[0]?.toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <span className={`block font-sans font-bold text-xs truncate ${data.completed ? 'line-through text-[#c6c9ab]' : 'text-white'}`}>{data.title}</span>
                          <span className="block font-mono text-[10px] text-[#c6c9ab]">{data.portion}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleOpenPicker(num, pickerCat)}
                        className="text-xs text-[#00eefc] hover:underline font-mono flex items-center gap-1 hover:text-white transition-colors flex-shrink-0 ml-3"
                      >
                        <span className="material-symbols-outlined text-sm select-none">swap_horiz</span>
                        Intercambiar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleOpenPicker(num, pickerCat)}
                      className="w-full flex items-center justify-center gap-2 bg-[#201f1f]/50 border border-dashed border-[#2a2a2a] py-3.5 rounded-lg text-xs font-mono text-[#c6c9ab] hover:border-[#e2ff00] hover:text-[#e2ff00] transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm">add_circle</span>
                      ELEGIR ALIMENTO ({CAT_LABEL[pickerCat]})
                    </button>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-[#c6c9ab] text-center italic py-20">No se pudo instanciar el plan del día.</div>
        )}
      </div>

      {/* Food picker sheet */}
      {activeMealIdForPicker !== null && (
        <div className="fixed inset-0 bg-black/85 z-[100] flex items-end justify-center p-0 md:p-4">
          <div className="bg-[#1c1b1b] border-t md:border border-[#2a2a2a] w-full max-w-lg rounded-t-2xl md:rounded-xl max-h-[85vh] flex flex-col overflow-hidden">

            <div className="p-4 border-b border-[#2a2a2a] flex items-center justify-between sticky top-0 bg-[#1c1b1b] z-10">
              <div>
                <h3 className="font-sans font-bold text-lg text-white">Seleccionar Alimento</h3>
                <span className="font-mono text-[10px] text-[#c6c9ab] uppercase">Comida {activeMealIdForPicker} · {MODE_LABEL[activeDietMode]}</span>
              </div>
              <button onClick={() => setActiveMealIdForPicker(null)} className="text-white bg-[#2a2a2a] hover:bg-[#3e3e3e] p-1.5 h-8 w-8 rounded-full flex items-center justify-center transition-colors">
                <span className="material-symbols-outlined text-sm select-none">close</span>
              </button>
            </div>

            {/* Mode selector inside picker */}
            {enabledModes.length > 1 && (
              <div className="px-4 py-2 bg-[#111] border-b border-[#2a2a2a] flex gap-2 flex-wrap">
                {enabledModes.map(mode => (
                  <button
                    key={mode}
                    onClick={() => setActiveDietMode(mode)}
                    className={`px-3 py-1 rounded-full font-mono text-[10px] font-bold uppercase tracking-wider transition-all ${
                      activeDietMode === mode ? 'bg-[#e2ff00] text-black' : 'bg-[#201f1f] text-[#c6c9ab] border border-[#2a2a2a]'
                    }`}
                  >
                    {MODE_LABEL[mode]}
                  </button>
                ))}
              </div>
            )}

            {/* Category tabs */}
            <div className="p-3 bg-[#121212] border-b border-[#2a2a2a] flex gap-1.5 flex-wrap">
              {ALL_CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategoryForPicker(cat)}
                  className={`px-3 py-1.5 rounded-full font-mono text-[10px] font-bold uppercase tracking-wider transition-all ${
                    activeCategoryForPicker === cat ? 'bg-[#e2ff00] text-black shadow-md' : 'bg-[#201f1f] text-[#c6c9ab] border border-transparent hover:border-[#2a2a2a]'
                  }`}
                >
                  {cat.replace('_', ' ')}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="px-4 py-2 bg-[#121212] flex items-center gap-2 border-b border-[#2a2a2a]">
              <span className="material-symbols-outlined text-[#c6c9ab] text-sm select-none">search</span>
              <input
                type="text"
                placeholder="Buscar alimento..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-transparent border-none text-white text-xs focus:ring-0 focus:outline-none p-2 placeholder-[#c6c9ab]/45"
              />
            </div>

            {/* Food list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
              {filteredFoods.length === 0 ? (
                <div className="text-center py-10 font-mono text-xs text-[#c6c9ab] italic">
                  Ningún alimento coincide.
                </div>
              ) : (
                filteredFoods.map(food => (
                  <button
                    key={food.id}
                    onClick={() => handleSelectFood(food)}
                    className="w-full flex items-center justify-between p-3.5 bg-[#121212] hover:bg-[#201f1f] rounded-lg border border-[#2a2a2a] hover:border-[#e2ff00]/40 text-left transition-all group"
                  >
                    <span className="block font-sans text-xs text-white group-hover:text-[#e2ff00] transition-colors leading-snug">{food.label}</span>
                    <span className="material-symbols-outlined text-[#c6c9ab] group-hover:text-[#e2ff00] transition-colors select-none text-base flex-shrink-0 ml-3">add_circle</span>
                  </button>
                ))
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
