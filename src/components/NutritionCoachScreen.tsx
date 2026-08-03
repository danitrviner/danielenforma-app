import React, { useState } from 'react';
import FoodLibraryScreen from './FoodLibraryScreen';
import NutritionPlansScreen from './NutritionPlansScreen';
import RecipeBuilderScreen from './RecipeBuilderScreen';

type Tab = 'tipos' | 'alimentos' | 'recetas';

interface Props {
  coachId: string;
}

export default function NutritionCoachScreen({ coachId }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('tipos');

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'tipos',     label: 'Dietas',    icon: 'nutrition' },
    { id: 'alimentos', label: 'Alimentos', icon: 'set_meal' },
    { id: 'recetas',   label: 'Recetas',   icon: 'skillet' },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 pb-4 border-b border-hairline">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center px-2 py-0.5 rounded-control bg-raised text-caption font-sans border border-accent/30 text-accent font-bold uppercase tracking-wider">
            Consola de Entrenador
          </span>
          <span className="inline-flex items-center gap-1.5 text-label font-mono text-data">
            <span className="w-2 h-2 rounded-full bg-data animate-pulse"></span>
            Sincronizado
          </span>
        </div>
        <h1 className="font-sans font-extrabold text-display tracking-tight text-white uppercase">Nutrición</h1>
      </header>

      <div className="flex bg-surface border border-hairline p-1 rounded-surface gap-1 w-fit flex-wrap">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-control font-sans text-label font-bold tracking-wider uppercase transition-all ${
              activeTab === tab.id
                ? 'bg-accent text-black shadow-lg shadow-accent/10'
                : 'text-ink-2 hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-title-s">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'tipos'     && <NutritionPlansScreen coachId={coachId} />}
      {activeTab === 'alimentos' && <FoodLibraryScreen coachId={coachId} />}
      {activeTab === 'recetas'   && <RecipeBuilderScreen coachId={coachId} />}
    </div>
  );
}
