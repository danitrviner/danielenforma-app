import React, { useState, useEffect } from 'react';
import { UserProfile, MealState, MealItem } from '../types';
import { FOOD_ITEMS } from '../data';
import { getOrCreateMealState, updateMealState } from '../dbService';

interface NutritionScreenProps {
  profile: UserProfile;
}

export default function NutritionScreen({ profile }: NutritionScreenProps) {
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0]; // YYYY-MM-DD
  });

  const [mealState, setMealState] = useState<MealState | null>(null);
  const [activeMealIdForPicker, setActiveMealIdForPicker] = useState<number | null>(null);
  const [activeCategoryForPicker, setActiveCategoryForPicker] = useState<'carbs' | 'protein' | 'fat'>('carbs');
  
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  // Parse neat display date
  const displayDateStr = new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });

  // Fetch or create Meal State on date change
  useEffect(() => {
    const fetchState = async () => {
      setLoading(true);
      try {
        const state = await getOrCreateMealState(profile.userId, selectedDate);
        setMealState(state);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchState();
  }, [profile.userId, selectedDate]);

  // Handle checking/submitting meal completion
  const handleToggleMealComplete = async (mealNum: 1 | 2 | 3 | 4 | 5) => {
    if (!mealState) return;

    const key = `comida${mealNum}` as keyof MealState;
    const currentVal = mealState[key] as any;
    
    // If empty slot, let's open picker instead
    if (!currentVal) {
      handleOpenPicker(mealNum, mealNum === 1 || mealNum === 4 ? 'carbs' : mealNum === 2 || mealNum === 5 ? 'protein' : 'protein');
      return;
    }

    const updatedCol = {
      ...currentVal,
      completed: !currentVal.completed
    };

    const updates = { [key]: updatedCol };
    setMealState(prev => prev ? { ...prev, ...updates } : null);
    await updateMealState(profile.userId, selectedDate, updates);
  };

  // Switch dynamically between days
  const handleShiftDay = (days: number) => {
    const date = new Date(selectedDate + 'T12:00:00');
    date.setDate(date.getDate() + days);
    setSelectedDate(date.toISOString().split('T')[0]);
  };

  // Open food picker bottom sheet
  const handleOpenPicker = (mealNum: number, category: 'carbs' | 'protein' | 'fat') => {
    setActiveMealIdForPicker(mealNum);
    setActiveCategoryForPicker(category);
    setSearchTerm('');
  };

  // Assign food chosen from options
  const handleSelectFood = async (food: MealItem) => {
    if (!mealState || !activeMealIdForPicker) return;

    const key = `comida${activeMealIdForPicker}` as keyof MealState;
    const foodCatBadge = food.category === 'carbs' ? 'HC' : food.category === 'protein' ? 'Prot' : 'Grasa';
    
    const updatedCol = {
      completed: false,
      foodId: food.id,
      title: food.name,
      portion: food.portionSize,
      specs: `${foodCatBadge === 'HC' ? '2' : '1'} ${foodCatBadge}`
    };

    const updates = { [key]: updatedCol };
    setMealState(prev => prev ? { ...prev, ...updates } : null);
    await updateMealState(profile.userId, selectedDate, updates);
    
    // Close picker sheet
    setActiveMealIdForPicker(null);
  };

  // Count progress completed out of total defined meal slots
  let completedCount = 0;
  let totalDefined = 0;
  if (mealState) {
    if (mealState.comida1) { totalDefined++; if (mealState.comida1.completed) completedCount++; }
    if (mealState.comida2) { totalDefined++; if (mealState.comida2.completed) completedCount++; }
    if (mealState.comida3) { totalDefined++; if (mealState.comida3.completed) completedCount++; }
    if (mealState.comida4) { totalDefined++; if (mealState.comida4.completed) completedCount++; }
    if (mealState.comida5) { totalDefined++; if (mealState.comida5.completed) completedCount++; }
  }

  // Filter foods for picker
  const filteredFoods = FOOD_ITEMS.filter(f => {
    if (f.category !== activeCategoryForPicker && !(activeCategoryForPicker === 'carbs' && f.category === 'veg')) return false;
    if (searchTerm) {
      return f.name.toLowerCase().includes(searchTerm.toLowerCase());
    }
    return true;
  });

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="font-sans font-extrabold text-3xl text-white tracking-tight">Nutrition Tracker</h1>
        <p className="text-[#c6c9ab] text-sm mt-1">Intercambia alimentos de forma equivalente manteniendo tus requerimientos calóricos.</p>
      </div>

      {/* Date Selector Header */}
      <div className="flex items-center justify-between bg-[#1c1b1b] rounded-xl p-4 border border-[#2a2a2a] shadow-md">
        <button 
          onClick={() => handleShiftDay(-1)}
          className="text-[#c6c9ab] hover:text-[#e2ff00] transition-colors p-2 rounded-full hover:bg-[#201f1f] flex items-center justify-center"
        >
          <span className="material-symbols-outlined select-none text-2xl">chevron_left</span>
        </button>
        
        <div className="text-center select-none">
          <span className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-widest font-bold">FECHA REGISTRADA</span>
          <span className="block font-sans font-bold text-lg text-white mt-0.5">{displayDateStr}</span>
          <span className="block font-mono text-[9px] text-[#00eefc] uppercase mt-1 tracking-wider">Plan de macros optimizado</span>
        </div>
        
        <button 
          onClick={() => handleShiftDay(1)}
          className="text-[#c6c9ab] hover:text-[#e2ff00] transition-colors p-2 rounded-full hover:bg-[#201f1f] flex items-center justify-center"
        >
          <span className="material-symbols-outlined select-none text-2xl">chevron_right</span>
        </button>
      </div>

      {/* Progress tracker */}
      <div className="bg-[#121212] border border-[#2a2a2a] p-4 rounded-xl">
        <div className="flex justify-between items-end mb-2">
          <h2 className="font-sans font-bold text-sm text-[#e5e2e1] uppercase tracking-wide">Progreso del plan</h2>
          <span className="font-mono text-xs text-[#e2ff00] font-bold">
            {completedCount} / {Math.max(1, totalDefined)} COMPLETADAS
          </span>
        </div>
        <div className="h-2 w-full bg-[#1c1b1b] rounded-full overflow-hidden">
          <div 
            className="h-full bg-[#e2ff00] rounded-full transition-all duration-500 volt-glow" 
            style={{ width: `${(completedCount / Math.max(1, totalDefined)) * 100}%` }}
          ></div>
        </div>
      </div>

      {/* Meal blocks expandable */}
      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-10 font-mono text-sm text-[#c6c9ab] animate-pulse">
            Sincronizando nutrientes con base de datos...
          </div>
        ) : mealState ? (
          ([1, 2, 3, 4, 5] as const).map((num) => {
            const key = `comida${num}` as keyof MealState;
            const data = mealState[key] as any;
            
            return (
              <div 
                key={num} 
                className={`bg-[#201f1f] rounded-xl overflow-hidden border transition-all ${data?.completed ? 'border-[#e2ff00]/40 bg-[#121212]' : 'border-[#2a2a2a]'}`}
              >
                {/* Expandable/Click Header */}
                <div className="w-full flex items-center justify-between p-4 bg-[#1c1b1b]/80">
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => handleToggleMealComplete(num)}
                      className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${data?.completed ? 'bg-[#e2ff00] text-black border-transparent' : 'border border-[#c6c9ab]/40 text-transparent hover:border-[#e2ff00]'}`}
                    >
                      <span className="material-symbols-outlined text-sm font-black">check</span>
                    </button>
                    <div>
                      <span className="font-sans font-bold text-white text-base">Comida {num}</span>
                      <p className="text-[10px] text-[#c6c9ab] font-mono mt-0.5">Definida según requerimiento específico</p>
                    </div>
                  </div>

                  {data ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] bg-[#2a2a2a] text-[#c6c9ab] px-2 py-1 rounded font-mono uppercase tracking-wider">{data.specs}</span>
                    </div>
                  ) : null}
                </div>

                {/* Sub details block */}
                <div className="p-4 border-t border-[#2a2a2a]/60 space-y-3 bg-[#131313]/40">
                  {data ? (
                    <div className="flex items-center justify-between bg-[#121212] p-3 rounded-lg border border-[#2a2a2a]">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded bg-[#2a2a2a] flex items-center justify-center text-white font-mono text-xs uppercase font-extrabold text-[#e2ff00]">
                          {data.title[0]}
                        </div>
                        <div>
                          <span className={`block font-sans font-bold text-xs ${data.completed ? 'line-through text-[#c6c9ab]' : 'text-white'}`}>{data.title}</span>
                          <span className="block font-mono text-[10px] text-[#c6c9ab]">{data.portion} ({data.specs})</span>
                        </div>
                      </div>

                      {/* Swap button option to exchange food items! */}
                      <button 
                        onClick={() => handleOpenPicker(num, num === 1 || num === 4 ? 'carbs' : num === 2 || num === 5 ? 'protein' : 'protein')}
                        className="text-xs text-[#00eefc] hover:underline font-mono flex items-center gap-1 hover:text-white transition-colors"
                      >
                        <span className="material-symbols-outlined text-sm select-none">swap_horiz</span>
                        Intercambiar
                      </button>
                    </div>
                  ) : (
                    /* Slot is empty! Create Click trigger */
                    <button 
                      onClick={() => handleOpenPicker(num, num === 1 || num === 4 ? 'carbs' : num === 2 || num === 5 ? 'protein' : 'protein')}
                      className="w-full flex items-center justify-center gap-2 bg-[#201f1f]/50 border border-dashed border-[#2a2a2a] py-3.5 rounded-lg text-xs font-mono text-[#c6c9ab] hover:border-[#e2ff00] hover:text-[#e2ff00] transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm">add_circle</span>
                      ELEGIR ALIMENTO ({num === 1 || num === 4 ? 'HC' : num === 2 || num === 5 ? 'PROTEÍNA' : 'PROTEÍNA'})
                    </button>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-[#c6c9ab] text-center italic py-20">
            No se pudo instanciar el plan del día. Intentando de nuevo.
          </div>
        )}
      </div>

      {/* Alimento picker Bottom Sheet Modal */}
      {activeMealIdForPicker !== null && (
        <div className="fixed inset-0 bg-black/85 z-[100] flex items-end justify-center p-0 md:p-4">
          <div className="bg-[#1c1b1b] border-t md:border border-[#2a2a2a] w-full max-w-lg rounded-t-2xl md:rounded-xl max-h-[85vh] flex flex-col overflow-hidden animate-slide-up">
            
            {/* Modal Header */}
            <div className="p-4 border-b border-[#2a2a2a] flex items-center justify-between sticky top-0 bg-[#1c1b1b] z-10">
              <div>
                <h3 className="font-sans font-bold text-lg text-white">Seleccionar Alimento</h3>
                <span className="font-mono text-[10px] text-[#c6c9ab] uppercase">Equivalentes para Comida {activeMealIdForPicker}</span>
              </div>
              <button 
                onClick={() => setActiveMealIdForPicker(null)}
                className="text-white bg-[#2a2a2a] hover:bg-[#3e3e3e] p-1.5 h-8 w-8 rounded-full flex items-center justify-center transition-colors"
              >
                <span className="material-symbols-outlined text-sm select-none">close</span>
              </button>
            </div>

            {/* Filter Tabs */}
            <div className="p-4 bg-[#121212] border-b border-[#2a2a2a] flex gap-2">
              {(['carbs', 'protein', 'fat'] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategoryForPicker(cat)}
                  className={`px-4 py-1.5 rounded-full font-mono text-[10px] font-bold uppercase transition-all tracking-wider ${activeCategoryForPicker === cat ? 'bg-[#e2ff00] text-black shadow-md' : 'bg-[#201f1f] text-[#c6c9ab] border border-transparent hover:border-[#2a2a2a]'}`}
                >
                  {cat === 'carbs' ? 'CARBS & VEG' : cat === 'protein' ? 'PROTEIN' : 'FAT'}
                </button>
              ))}
            </div>

            {/* Search Input bar */}
            <div className="px-4 py-2 bg-[#121212] flex items-center gap-2 border-b border-[#2a2a2a]">
              <span className="material-symbols-outlined text-[#c6c9ab] text-sm select-none">search</span>
              <input 
                type="text"
                placeholder="Buscador libre..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-transparent border-none text-white text-xs focus:ring-0 focus:outline-none p-2 placeholder-[#c6c9ab]/45"
              />
            </div>

            {/* Scrollable Food Options list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">
              
              <div>
                <span className="block font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wider mb-2 select-none flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-xs text-[#e2ff00]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                  MIS FAVORITOS RECOMENDADOS
                </span>
                
                <div className="space-y-2">
                  {filteredFoods.slice(0, 2).map((food) => (
                    <button
                      key={food.id + '_fav'}
                      onClick={() => handleSelectFood(food)}
                      className="w-full flex items-center justify-between p-3.5 bg-[#121212] hover:bg-[#201f1f] rounded-lg border border-[#2a2a2a] hover:border-[#e2ff00]/40 text-left transition-all group"
                    >
                      <div>
                        <span className="block font-sans font-bold text-xs text-white group-hover:text-[#e2ff00] transition-colors">{food.name}</span>
                        <span className="block font-mono text-[10px] text-[#c6c9ab] mt-0.5">{food.portionSize} = {food.exchangeInfo}</span>
                      </div>
                      <span className="material-symbols-outlined text-[#c6c9ab] group-hover:text-[#e2ff00] transition-colors select-none text-base">add_circle</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="block font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wider mb-3 select-none flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-xs">list</span>
                  LISTA ESTÁNDAR EN FORMA FIT
                </span>

                <div className="space-y-2">
                  {filteredFoods.map((food) => (
                    <button
                      key={food.id}
                      onClick={() => handleSelectFood(food)}
                      className="w-full flex items-center justify-between p-3.5 bg-[#121212] hover:bg-[#201f1f] rounded-lg border border-[#2a2a2a] hover:border-[#e2ff00]/40 text-left transition-all group"
                    >
                      <div>
                        <span className="block font-sans font-bold text-xs text-white group-hover:text-[#e2ff00] transition-colors">{food.name}</span>
                        <span className="block font-mono text-[10px] text-[#c6c9ab] mt-0.5">{food.portionSize} = {food.exchangeInfo}</span>
                      </div>
                      <span className="material-symbols-outlined text-[#c6c9ab] group-hover:text-[#e2ff00] transition-colors select-none text-base">add_circle</span>
                    </button>
                  ))}

                  {filteredFoods.length === 0 && (
                    <div className="text-center py-10 font-mono text-xs text-[#c6c9ab] italic">
                      Ningún alimento coincide con la búsqueda.
                    </div>
                  )}
                </div>
              </div>

            </div>

          </div>
        </div>
      )}
    </div>
  );
}
