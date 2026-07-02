import React, { useState } from 'react';
import { UserProfile } from '../types';
import NutritionScreen from './NutritionScreen';
import MyDietsScreen from './MyDietsScreen';
import RecipesScreen from './RecipesScreen';

interface NutritionHubScreenProps {
  profile: UserProfile;
}

type NutritionTab = 'intercambios' | 'mis-dietas' | 'recetas';

const TABS: { id: NutritionTab; label: string; icon: string }[] = [
  { id: 'intercambios', label: 'Intercambios', icon: 'restaurant' },
  { id: 'mis-dietas',   label: 'Mis Dietas',    icon: 'bookmark' },
  { id: 'recetas',      label: 'Recetas',        icon: 'skillet' },
];

export default function NutritionHubScreen({ profile }: NutritionHubScreenProps) {
  const [activeSubTab, setActiveSubTab] = useState<NutritionTab>('intercambios');

  return (
    <div className="space-y-6">
      <div className="flex bg-[#121212] border border-[#2a2a2a] p-1 rounded-lg gap-1 w-fit">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md font-sans text-xs font-bold tracking-wider uppercase transition-all ${
              activeSubTab === tab.id
                ? 'bg-[#e2ff00] text-black shadow-lg shadow-[#e2ff00]/10'
                : 'text-[#c6c9ab] hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-base">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {activeSubTab === 'intercambios' && <NutritionScreen profile={profile} />}
      {activeSubTab === 'mis-dietas'   && <MyDietsScreen profile={profile} />}
      {activeSubTab === 'recetas'      && <RecipesScreen profile={profile} />}
    </div>
  );
}
