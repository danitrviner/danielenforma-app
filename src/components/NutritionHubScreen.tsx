import React, { useState, useEffect } from 'react';
import { UserProfile, AthleteNutritionConfig } from '../types';
import { getAthleteNutritionConfig } from '../dbService';
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
  const [nutritionConfig, setNutritionConfig] = useState<AthleteNutritionConfig | null>(null);

  useEffect(() => {
    getAthleteNutritionConfig(profile.email).then(setNutritionConfig).catch(() => {});
  }, [profile.email]);

  return (
    <div className="space-y-6">
      {nutritionConfig?.sharedReportSnapshot && (
        <div className="bg-[#121212] border border-[#2a2a2a] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="material-symbols-outlined text-[#e2ff00] text-base">insights</span>
            <p className="font-sans font-bold text-sm text-white">Análisis de tu entrenador</p>
          </div>
          <p className="text-xs text-[#c6c9ab] font-sans leading-relaxed">{nutritionConfig.sharedReportSnapshot.summary}</p>
          {nutritionConfig.sharedReportSnapshot.flags.length > 0 && (
            <ul className="mt-2 space-y-1">
              {nutritionConfig.sharedReportSnapshot.flags.map((f, i) => (
                <li key={i} className="text-[11px] text-amber-300 font-mono">• {f}</li>
              ))}
            </ul>
          )}
        </div>
      )}

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
