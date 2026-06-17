import React, { useState } from 'react';
import { UserProfile } from '../types';
import NutritionScreen from './NutritionScreen';
import RecipesScreen from './RecipesScreen';

interface NutritionHubScreenProps {
  profile: UserProfile;
}

type NutritionTab = 'intercambios' | 'recetas';

export default function NutritionHubScreen({ profile }: NutritionHubScreenProps) {
  const [activeSubTab, setActiveSubTab] = useState<NutritionTab>('intercambios');

  return (
    <div className="space-y-6">
      {/* Sub-tab switcher */}
      <div className="flex bg-[#121212] border border-[#2a2a2a] p-1 rounded-lg gap-1 w-fit">
        <button
          onClick={() => setActiveSubTab('intercambios')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md font-sans text-xs font-bold tracking-wider uppercase transition-all ${
            activeSubTab === 'intercambios'
              ? 'bg-[#e2ff00] text-black shadow-lg shadow-[#e2ff00]/10'
              : 'text-[#c6c9ab] hover:text-white'
          }`}
        >
          <span className="material-symbols-outlined text-base">restaurant</span>
          Intercambios
        </button>
        <button
          onClick={() => setActiveSubTab('recetas')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md font-sans text-xs font-bold tracking-wider uppercase transition-all ${
            activeSubTab === 'recetas'
              ? 'bg-[#e2ff00] text-black shadow-lg shadow-[#e2ff00]/10'
              : 'text-[#c6c9ab] hover:text-white'
          }`}
        >
          <span className="material-symbols-outlined text-base">menu_book</span>
          Recetas
        </button>
      </div>

      {activeSubTab === 'intercambios' && <NutritionScreen profile={profile} />}
      {activeSubTab === 'recetas' && <RecipesScreen profile={profile} />}
    </div>
  );
}
