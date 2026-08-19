import React, { useState } from 'react';
import ExerciseLibraryScreen from './ExerciseLibraryScreen';
import WorkoutsScreen from './WorkoutsScreen';
import MesocycleTemplateLibrary from './MesocycleTemplateLibrary';
import { Tabs } from './ui';

interface TrainingCoachScreenProps {
  coachId: string;
}

type Tab = 'rutinas' | 'ejercicios' | 'plantillas';

export default function TrainingCoachScreen({ coachId }: TrainingCoachScreenProps) {
  const [activeTab, setActiveTab] = useState<Tab>('plantillas');

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'plantillas', label: 'Plantillas', icon: 'library_books'        },
    { id: 'ejercicios', label: 'Ejercicios', icon: 'fitness_center'       },
    { id: 'rutinas',    label: 'Rutinas',    icon: 'format_list_bulleted' },
  ];

  return (
    <div className="space-y-6">
      {/* Sin cabecera propia: esta pantalla se monta dentro de Biblioteca
          (CoachLibraryScreen), que ya pone la ceja y el título. */}
      <Tabs items={tabs} value={activeTab} onChange={id => setActiveTab(id as Tab)} label="Secciones de Entrenamiento" />

      {activeTab === 'rutinas'    && <WorkoutsScreen coachId={coachId} />}
      {activeTab === 'ejercicios' && <ExerciseLibraryScreen coachId={coachId} />}
      {activeTab === 'plantillas' && <MesocycleTemplateLibrary coachId={coachId} />}
    </div>
  );
}
