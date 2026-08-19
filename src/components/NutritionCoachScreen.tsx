import React, { useState } from 'react';
import FoodLibraryScreen from './FoodLibraryScreen';
import NutritionPlansScreen from './NutritionPlansScreen';
import RecipeBuilderScreen from './RecipeBuilderScreen';
import { Tabs } from './ui';

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
      {/* Sin cabecera propia: la pone Biblioteca (CoachLibraryScreen). */}
      <Tabs items={tabs} value={activeTab} onChange={id => setActiveTab(id as Tab)} label="Secciones de Nutrición" />

      {activeTab === 'tipos'     && <NutritionPlansScreen coachId={coachId} />}
      {activeTab === 'alimentos' && <FoodLibraryScreen coachId={coachId} />}
      {activeTab === 'recetas'   && <RecipeBuilderScreen coachId={coachId} />}
    </div>
  );
}
