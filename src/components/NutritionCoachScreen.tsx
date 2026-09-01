import React, { useState } from 'react';
import FoodLibraryScreen from './FoodLibraryScreen';
import NutritionPlansScreen from './NutritionPlansScreen';
import RecipeBuilderScreen from './RecipeBuilderScreen';
import FuentesCientificasSheet, { EnlaceFuentes } from './FuentesCientificasSheet';
import { Tabs } from './ui';

type Tab = 'tipos' | 'alimentos' | 'recetas';

interface Props {
  coachId: string;
}

export default function NutritionCoachScreen({ coachId }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('tipos');
  const [showFuentes, setShowFuentes] = useState(false);

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

      {/* 1.4.1 de Apple: el lado del coach enseña los mismos cálculos, así que
          lleva el mismo acceso a las citas que el del atleta. */}
      <EnlaceFuentes onClick={() => setShowFuentes(true)} />
      <FuentesCientificasSheet open={showFuentes} onClose={() => setShowFuentes(false)} />
    </div>
  );
}
