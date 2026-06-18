import React, { useState, useEffect } from 'react';
import { UserProfile, NutritionDayType, NutritionMeal, FoodCategory, DietMode, MealItem } from '../types';
import { getAthleteDayTypeConfig, getNutritionDayTypes, getFoodItems, seedFoodItemsIfEmpty, getAthleteNutritionConfig } from '../dbService';

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

const CAT_BG: Record<FoodCategory, string> = {
  HC:        'bg-amber-500/10 border-amber-500/20',
  PROT:      'bg-blue-500/10 border-blue-500/20',
  GRASA:     'bg-orange-500/10 border-orange-500/20',
  MIX_HC:    'bg-violet-500/10 border-violet-500/20',
  MIX_GRASA: 'bg-pink-500/10 border-pink-500/20',
};

const MODE_LABEL: Record<DietMode, string> = {
  OMNIVORO:  'Omnívoro',
  VEGANO:    'Vegano',
  SIN_PESAR: 'Sin pesar',
};

const ALL_CATEGORIES: FoodCategory[] = ['HC', 'PROT', 'GRASA', 'MIX_HC', 'MIX_GRASA'];

interface ExchangeSlot {
  key: string;
  category: FoodCategory;
  index: number;          // 0-based within this category+meal
  totalForCategory: number;
}

function expandMealSlots(meal: NutritionMeal): ExchangeSlot[] {
  return meal.exchanges.flatMap(ex =>
    Array.from({ length: ex.count }, (_, i) => ({
      key: `${meal.id}_${ex.category}_${i}`,
      category: ex.category,
      index: i,
      totalForCategory: ex.count,
    }))
  );
}

type SlotState = { foodId: string; foodLabel: string; done: boolean };

interface NutritionScreenProps {
  profile: UserProfile;
}

export default function NutritionScreen({ profile }: NutritionScreenProps) {
  const [availableDayTypes, setAvailableDayTypes] = useState<NutritionDayType[]>([]);
  const [selectedDayType, setSelectedDayType] = useState<NutritionDayType | null>(null);
  const [slotStates, setSlotStates] = useState<Record<string, SlotState>>({});
  const [loading, setLoading] = useState(true);

  const [foodItems, setFoodItems] = useState<MealItem[]>([]);
  const [enabledModes, setEnabledModes] = useState<DietMode[]>(['OMNIVORO']);
  const [activeDietMode, setActiveDietMode] = useState<DietMode>('OMNIVORO');

  const [pickerSlot, setPickerSlot] = useState<{ key: string; category: FoodCategory } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [pickerCategory, setPickerCategory] = useState<FoodCategory>('HC');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await seedFoodItemsIfEmpty();
        const [foods, config, allDayTypes, dtConfig] = await Promise.all([
          getFoodItems(),
          getAthleteNutritionConfig(profile.email).catch(() => null),
          getNutritionDayTypes(),
          getAthleteDayTypeConfig(profile.email).catch(() => null),
        ]);

        setFoodItems(foods);

        if (config && config.enabledModes.length > 0) {
          setEnabledModes(config.enabledModes);
          setActiveDietMode(config.enabledModes[0]);
        }

        const athleteDayTypeIds = dtConfig?.dayTypeIds ?? [];
        const available = allDayTypes.filter(dt => athleteDayTypeIds.includes(dt.id));
        setAvailableDayTypes(available);

        if (available.length === 1) {
          setSelectedDayType(available[0]);
        } else if (available.length > 1) {
          setSelectedDayType(available[0]);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [profile.email]);

  const handleSelectDayType = (dt: NutritionDayType) => {
    setSelectedDayType(dt);
    setSlotStates({});
  };

  const handleOpenPicker = (slotKey: string, category: FoodCategory) => {
    setPickerSlot({ key: slotKey, category });
    setPickerCategory(category);
    setSearchTerm('');
  };

  const handleSelectFood = (food: MealItem) => {
    if (!pickerSlot) return;
    setSlotStates(prev => ({
      ...prev,
      [pickerSlot.key]: { foodId: food.id, foodLabel: food.label, done: false },
    }));
    setPickerSlot(null);
  };

  const handleToggleDone = (slotKey: string, category: FoodCategory) => {
    const current = slotStates[slotKey];
    if (!current) {
      handleOpenPicker(slotKey, category);
      return;
    }
    setSlotStates(prev => ({ ...prev, [slotKey]: { ...current, done: !current.done } }));
  };

  // Progress counters
  const allSlots = selectedDayType
    ? selectedDayType.meals.flatMap(m => expandMealSlots(m))
    : [];
  const totalSlots = allSlots.length;
  const doneSlots = allSlots.filter(s => slotStates[s.key]?.done).length;

  const filteredFoods = foodItems.filter(f => {
    if (f.mode !== activeDietMode) return false;
    if (f.category !== pickerCategory) return false;
    if (searchTerm && !f.label.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="font-sans font-extrabold text-3xl text-white tracking-tight">Nutrition Tracker</h1>
        <p className="text-[#c6c9ab] text-sm mt-1">Registra tus intercambios del día según tu tipo de día activo.</p>
      </div>

      {/* Diet mode selector */}
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

      {loading ? (
        <div className="text-center py-16 font-mono text-sm text-[#c6c9ab] animate-pulse">Cargando tipos de día...</div>
      ) : availableDayTypes.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-[#2a2a2a] rounded-2xl">
          <span className="material-symbols-outlined text-4xl text-[#2a2a2a] block mb-3">calendar_view_day</span>
          <p className="text-[#c6c9ab] text-sm font-sans">Sin tipos de día asignados.</p>
          <p className="text-[#c6c9ab] text-xs font-mono mt-1">Tu entrenador aún no ha configurado tus tipos de día.</p>
        </div>
      ) : (
        <>
          {/* Day type selector — only shown when athlete has multiple */}
          {availableDayTypes.length > 1 && (
            <div className="flex gap-2 flex-wrap">
              {availableDayTypes.map(dt => (
                <button
                  key={dt.id}
                  onClick={() => handleSelectDayType(dt)}
                  className={`px-4 py-2.5 rounded-xl font-mono text-xs font-bold uppercase tracking-wider transition-all ${
                    selectedDayType?.id === dt.id
                      ? 'bg-[#e2ff00] text-black shadow-md'
                      : 'bg-[#1c1b1b] text-[#c6c9ab] border border-[#2a2a2a] hover:border-[#e2ff00]/40 hover:text-white'
                  }`}
                >
                  {dt.name}
                </button>
              ))}
            </div>
          )}

          {selectedDayType && (
            <>
              {/* Day type header */}
              <div className="bg-[#1c1b1b] rounded-xl p-4 border border-[#2a2a2a] flex items-center justify-between">
                <div>
                  <span className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-widest font-bold">TIPO DE DÍA ACTIVO</span>
                  <span className="block font-sans font-bold text-lg text-white mt-0.5">{selectedDayType.name}</span>
                  <span className="block font-mono text-[9px] text-[#00eefc] uppercase mt-1 tracking-wider">
                    {selectedDayType.targetCalories} kcal · {selectedDayType.meals.length} comidas
                  </span>
                </div>
                <span className="material-symbols-outlined text-3xl text-[#2a2a2a]">calendar_view_day</span>
              </div>

              {/* Progress */}
              <div className="bg-[#121212] border border-[#2a2a2a] p-4 rounded-xl">
                <div className="flex justify-between items-end mb-2">
                  <h2 className="font-sans font-bold text-sm text-[#e5e2e1] uppercase tracking-wide">Progreso del día</h2>
                  <span className="font-mono text-xs text-[#e2ff00] font-bold">{doneSlots} / {totalSlots} COMPLETADOS</span>
                </div>
                <div className="h-2 w-full bg-[#1c1b1b] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#e2ff00] rounded-full transition-all duration-500 volt-glow"
                    style={{ width: `${totalSlots > 0 ? (doneSlots / totalSlots) * 100 : 0}%` }}
                  />
                </div>
              </div>

              {/* Meal blocks */}
              <div className="space-y-4">
                {selectedDayType.meals.map((meal) => {
                  const slots = expandMealSlots(meal);
                  const mealDone = slots.length > 0 && slots.every(s => slotStates[s.key]?.done);
                  return (
                    <div
                      key={meal.id}
                      className={`bg-[#201f1f] rounded-xl overflow-hidden border transition-all ${mealDone ? 'border-[#e2ff00]/40' : 'border-[#2a2a2a]'}`}
                    >
                      {/* Meal header */}
                      <div className="px-4 py-3 bg-[#1c1b1b]/80 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${mealDone ? 'bg-[#e2ff00] border-[#e2ff00]' : 'border-[#3a3a3a]'}`}>
                            {mealDone && <span className="material-symbols-outlined text-black" style={{ fontSize: '13px' }}>check</span>}
                          </span>
                          <span className="font-sans font-bold text-white text-base">{meal.name}</span>
                        </div>
                        <span className="font-mono text-[9px] text-[#c6c9ab]">
                          {slots.length} intercambio{slots.length !== 1 ? 's' : ''}
                        </span>
                      </div>

                      {/* Exchange slots */}
                      <div className="p-3 border-t border-[#2a2a2a]/60 bg-[#131313]/40 space-y-2">
                        {slots.map(slot => {
                          const state = slotStates[slot.key];
                          const label = slot.totalForCategory > 1
                            ? `${CAT_LABEL[slot.category]} #${slot.index + 1}`
                            : CAT_LABEL[slot.category];
                          return (
                            <div
                              key={slot.key}
                              className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${state?.done ? 'bg-[#121212] border-[#e2ff00]/20 opacity-70' : 'bg-[#121212] border-[#2a2a2a]'}`}
                            >
                              {/* Checkbox */}
                              <button
                                onClick={() => handleToggleDone(slot.key, slot.category)}
                                className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center transition-all ${state?.done ? 'bg-[#e2ff00] text-black border-transparent' : 'border border-[#c6c9ab]/40 hover:border-[#e2ff00]'}`}
                              >
                                {state?.done && <span className="material-symbols-outlined text-sm font-black">check</span>}
                              </button>

                              {/* Category badge */}
                              <span className={`text-[10px] font-mono font-bold px-2 py-1 rounded border ${CAT_BG[slot.category]} ${CAT_COLOR[slot.category]} flex-shrink-0`}>
                                {label}
                              </span>

                              {/* Food info or picker trigger */}
                              {state ? (
                                <div className="flex items-center justify-between flex-1 min-w-0 gap-2">
                                  <span className={`text-xs font-sans truncate ${state.done ? 'line-through text-[#c6c9ab]' : 'text-white'}`}>
                                    {state.foodLabel}
                                  </span>
                                  <button
                                    onClick={() => handleOpenPicker(slot.key, slot.category)}
                                    className="text-[10px] text-[#00eefc] hover:underline font-mono flex items-center gap-1 flex-shrink-0"
                                  >
                                    <span className="material-symbols-outlined text-sm select-none">swap_horiz</span>
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => handleOpenPicker(slot.key, slot.category)}
                                  className="flex-1 text-left text-xs font-mono text-[#c6c9ab] hover:text-[#e2ff00] transition-colors flex items-center gap-1.5"
                                >
                                  <span className="material-symbols-outlined text-sm">add_circle</span>
                                  Elegir alimento
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {/* Food picker sheet */}
      {pickerSlot && (
        <div className="fixed inset-0 bg-black/85 z-[100] flex items-end justify-center p-0 md:p-4">
          <div className="bg-[#1c1b1b] border-t md:border border-[#2a2a2a] w-full max-w-lg rounded-t-2xl md:rounded-xl max-h-[85vh] flex flex-col overflow-hidden">

            <div className="p-4 border-b border-[#2a2a2a] flex items-center justify-between sticky top-0 bg-[#1c1b1b] z-10">
              <div>
                <h3 className="font-sans font-bold text-lg text-white">Seleccionar Alimento</h3>
                <span className="font-mono text-[10px] text-[#c6c9ab] uppercase">
                  {CAT_LABEL[pickerCategory]} · {MODE_LABEL[activeDietMode]}
                </span>
              </div>
              <button onClick={() => setPickerSlot(null)} className="text-white bg-[#2a2a2a] hover:bg-[#3e3e3e] p-1.5 h-8 w-8 rounded-full flex items-center justify-center transition-colors">
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
                  onClick={() => setPickerCategory(cat)}
                  className={`px-3 py-1.5 rounded-full font-mono text-[10px] font-bold uppercase tracking-wider transition-all ${
                    pickerCategory === cat ? 'bg-[#e2ff00] text-black shadow-md' : 'bg-[#201f1f] text-[#c6c9ab] border border-transparent hover:border-[#2a2a2a]'
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
