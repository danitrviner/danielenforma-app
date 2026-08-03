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
      <header className="flex flex-col gap-3 pb-4 border-b border-hairline">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center px-2 rounded-control bg-raised text-caption font-sans border border-accent/30 text-accent font-bold uppercase tracking-wider">
            Consola de Entrenador
          </span>
          <span className="inline-flex items-center gap-2 text-label font-mono text-data">
            <span className="w-2 h-2 rounded-full bg-data animate-pulse"></span>
            Sincronizado
          </span>
        </div>
        <h1 className="font-sans font-extrabold text-display tracking-tight text-white uppercase">Entrenamiento</h1>
      </header>

      <Tabs items={tabs} value={activeTab} onChange={id => setActiveTab(id as Tab)} label="Secciones de Entrenamiento" />

      {activeTab === 'rutinas'    && <WorkoutsScreen coachId={coachId} />}
      {activeTab === 'ejercicios' && <ExerciseLibraryScreen coachId={coachId} />}
      {activeTab === 'plantillas' && <MesocycleTemplateLibrary coachId={coachId} />}
    </div>
  );
}
