import React, { useState, useEffect } from 'react';
import { UserProfile, AthleteNutritionConfig, Recipe } from '../types';
import { getAthleteNutritionConfig, saveAthleteNutritionConfig } from '../dbService';
import VegetableSelector from './VegetableSelector';
import NutritionScreen from './NutritionScreen';
import MyDietsScreen from './MyDietsScreen';
import RecipesScreen from './RecipesScreen';
import NutritionPerformanceDashboard from './NutritionPerformanceDashboard';

interface NutritionHubScreenProps {
  profile: UserProfile;
}

type NutritionTab = 'intercambios' | 'mis-dietas' | 'recetas' | 'periodizacion';

const TABS: { id: NutritionTab; label: string; icon: string }[] = [
  { id: 'intercambios',  label: 'Intercambios',  icon: 'restaurant' },
  { id: 'mis-dietas',    label: 'Mis Dietas',     icon: 'bookmark' },
  { id: 'recetas',       label: 'Recetas',        icon: 'skillet' },
  { id: 'periodizacion', label: 'Periodización',  icon: 'monitoring' },
];

export default function NutritionHubScreen({ profile }: NutritionHubScreenProps) {
  const [activeSubTab, setActiveSubTab] = useState<NutritionTab>('intercambios');
  const [nutritionConfig, setNutritionConfig] = useState<AthleteNutritionConfig | null>(null);
  const [pendingRecipe, setPendingRecipe] = useState<Recipe | null>(null);

  const handleAddToIntercambios = (recipe: Recipe) => {
    setPendingRecipe(recipe);
    setActiveSubTab('intercambios');
  };

  useEffect(() => {
    getAthleteNutritionConfig(profile.email).then(setNutritionConfig).catch(() => {});
  }, [profile.email]);

  return (
    <div className="space-y-6">
      {nutritionConfig?.sharedReportSnapshot && (
        <div className="bg-[#181816] border border-white/7 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="material-symbols-outlined text-[#fbcb1a] text-base">insights</span>
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

      <div className="flex bg-[#181816] border border-white/7 p-1 rounded-lg gap-1 w-fit">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md font-sans text-xs font-bold tracking-wider uppercase transition-all ${
              activeSubTab === tab.id
                ? 'bg-[#fbcb1a] text-black shadow-lg shadow-[#fbcb1a]/10'
                : 'text-[#c6c9ab] hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-base">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {activeSubTab === 'intercambios' && (
        <>
          <NutritionScreen
            profile={profile}
            pendingRecipe={pendingRecipe}
            onConsumedPendingRecipe={() => setPendingRecipe(null)}
          />
          {/* Config al final, tras el contenido del día (visual arriba, ajustes abajo) */}
          <div className="bg-[#181816] border border-white/7 rounded-2xl p-5 space-y-3">
            <div>
              <h3 className="font-sans font-bold text-base text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-[#fbcb1a] text-base">eco</span>
                Tus verduras habituales
              </h3>
              <p className="font-mono text-[10px] text-[#c6c9ab] mt-1">
                Marca las verduras que sueles comer en tu día a día — así tu entrenador afina la estimación de vitaminas y minerales.
              </p>
            </div>
            <VegetableSelector
              selected={nutritionConfig?.vegTypes ?? []}
              onToggle={id => {
                if (!nutritionConfig) return;
                const cur = nutritionConfig.vegTypes ?? [];
                const next: AthleteNutritionConfig = {
                  ...nutritionConfig,
                  vegTypes: cur.includes(id) ? cur.filter(v => v !== id) : [...cur, id],
                };
                setNutritionConfig(next);
                saveAthleteNutritionConfig(next).catch(() => {});
              }}
            />
          </div>
        </>
      )}
      {activeSubTab === 'mis-dietas'   && <MyDietsScreen profile={profile} />}
      {activeSubTab === 'recetas'      && <RecipesScreen profile={profile} onAddToIntercambios={handleAddToIntercambios} />}
      {activeSubTab === 'periodizacion' && (
        <NutritionPerformanceDashboard athleteEmail={profile.email} targetWeightKg={profile.targetWeight} />
      )}
    </div>
  );
}
