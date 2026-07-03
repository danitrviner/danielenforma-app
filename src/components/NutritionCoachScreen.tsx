import React, { useState } from 'react';
import FoodLibraryScreen from './FoodLibraryScreen';
import NutritionPlansScreen from './NutritionPlansScreen';
import RecipeBuilderScreen from './RecipeBuilderScreen';
import NutritionAIDashboard from './NutritionAIDashboard';

type Tab = 'tipos' | 'alimentos' | 'recetas' | 'dashboard';

interface Props {
  coachId: string;
}

export default function NutritionCoachScreen({ coachId }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('tipos');

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'tipos',     label: 'Dietas',    icon: 'nutrition' },
    { id: 'alimentos', label: 'Alimentos', icon: 'set_meal' },
    { id: 'recetas',   label: 'Recetas',   icon: 'skillet' },
    { id: 'dashboard', label: 'Dashboard', icon: 'insights' },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 pb-4 border-b border-white/60">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center px-2 py-0.5 rounded bg-[#201f1f] text-[10px] font-mono border border-[#fbcb1a]/30 text-[#fbcb1a] font-bold uppercase tracking-wider">
            Consola de Entrenador
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-mono text-[#00eefc]">
            <span className="w-2 h-2 rounded-full bg-[#00eefc] animate-pulse"></span>
            Sincronizado
          </span>
        </div>
        <h1 className="font-sans font-black text-3xl tracking-tight text-white uppercase">Nutrición</h1>
      </header>

      <div className="flex gap-2 flex-wrap">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-mono text-xs uppercase tracking-wider font-bold transition-all ${
              activeTab === tab.id
                ? 'bg-[#fbcb1a] text-black shadow-md'
                : 'bg-[#1c1b1b] text-[#c6c9ab] border border-white/7 hover:border-[#fbcb1a]/40 hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-sm">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'tipos'     && <NutritionPlansScreen coachId={coachId} />}
      {activeTab === 'alimentos' && <FoodLibraryScreen coachId={coachId} />}
      {activeTab === 'recetas'   && <RecipeBuilderScreen coachId={coachId} />}
      {activeTab === 'dashboard' && <NutritionAIDashboard />}
    </div>
  );
}
