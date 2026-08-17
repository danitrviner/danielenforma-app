import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UserProfile, Recipe } from '../types';
import { getAthleteNutritionConfig } from '../dbService';
import NutritionScreen from './NutritionScreen';
import MyMenuScreen from './MyMenuScreen';
import RecipesScreen from './RecipesScreen';
import NutritionPerformanceDashboard from './NutritionPerformanceDashboard';
import { Tabs } from './ui';

interface NutritionHubScreenProps {
  profile: UserProfile;
}

// Antes 5 pestañas: "Intercambios" y "Mis Dietas" eran dos editores del mismo
// objeto (Diet) — se fusionan en "Mi plan" (NutritionScreen ahora absorbe la
// gestión de dietas). "Tus verduras habituales" se movió a Perfil >
// Preferencias, junto con el resto de config de menú de MyMenuScreen.
type NutritionTab = 'mi-plan' | 'mi-menu' | 'recetas' | 'periodizacion';

const TABS: { id: NutritionTab; label: string; icon: string }[] = [
  { id: 'mi-plan',       label: 'Mi Plan',        icon: 'restaurant' },
  { id: 'mi-menu',       label: 'Mi Menú',        icon: 'menu_book' },
  { id: 'recetas',       label: 'Recetas',        icon: 'skillet' },
  { id: 'periodizacion', label: 'Periodización',  icon: 'monitoring' },
];

export default function NutritionHubScreen({ profile }: NutritionHubScreenProps) {
  const nutritionConfigKey = ['athleteNutritionConfig', profile.email] as const;
  const [activeSubTab, setActiveSubTab] = useState<NutritionTab>('mi-plan');
  const [pendingRecipe, setPendingRecipe] = useState<Recipe | null>(null);

  const { data: nutritionConfig = null } = useQuery({
    queryKey: nutritionConfigKey,
    queryFn: () => getAthleteNutritionConfig(profile.email),
  });

  const handleAddToIntercambios = (recipe: Recipe) => {
    setPendingRecipe(recipe);
    setActiveSubTab('mi-plan');
  };

  return (
    <div className="space-y-6">
      {nutritionConfig?.sharedReportSnapshot && (
        <div className="bg-surface border border-hairline rounded-surface p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-accent text-title-s">insights</span>
            <p className="font-sans font-bold text-body-s text-white">Análisis de tu entrenador</p>
          </div>
          <p className="text-label text-ink-2 font-sans leading-relaxed">{nutritionConfig.sharedReportSnapshot.summary}</p>
          {nutritionConfig.sharedReportSnapshot.flags.length > 0 && (
            <ul className="mt-2 space-y-1">
              {nutritionConfig.sharedReportSnapshot.flags.map((f, i) => (
                <li key={i} className="text-caption text-amber-300 font-mono">• {f}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Tabs items={TABS} value={activeSubTab} onChange={id => setActiveSubTab(id as NutritionTab)} label="Secciones de Nutrición" />

      {activeSubTab === 'mi-plan' && (
        <NutritionScreen
          profile={profile}
          pendingRecipe={pendingRecipe}
          onConsumedPendingRecipe={() => setPendingRecipe(null)}
        />
      )}
      {activeSubTab === 'mi-menu'      && <MyMenuScreen profile={profile} />}
      {activeSubTab === 'recetas'      && <RecipesScreen profile={profile} onAddToIntercambios={handleAddToIntercambios} />}
      {activeSubTab === 'periodizacion' && (
        <NutritionPerformanceDashboard athleteEmail={profile.email} targetWeightKg={profile.targetWeight} />
      )}
    </div>
  );
}
