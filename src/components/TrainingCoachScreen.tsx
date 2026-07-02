import React, { useState } from 'react';
import ExerciseLibraryScreen from './ExerciseLibraryScreen';
import WorkoutsScreen from './WorkoutsScreen';
import MesocycleTemplateLibrary from './MesocycleTemplateLibrary';

interface TrainingCoachScreenProps {
  coachId: string;
}

type Tab = 'rutinas' | 'ejercicios' | 'plantillas';

export default function TrainingCoachScreen({ coachId }: TrainingCoachScreenProps) {
  const [activeTab, setActiveTab] = useState<Tab>('rutinas');

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'rutinas',    label: 'Rutinas',    icon: 'format_list_bulleted' },
    { id: 'ejercicios', label: 'Ejercicios', icon: 'fitness_center'       },
    { id: 'plantillas', label: 'Plantillas', icon: 'library_books'        },
  ];

  return (
    <div className="space-y-6">
      {/* Sub-tab switcher */}
      <div className="flex bg-[#121212] border border-[#2a2a2a] p-1 rounded-lg gap-1 w-full sm:w-fit">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-md font-sans text-xs font-bold tracking-wider uppercase transition-all ${
              activeTab === tab.id
                ? 'bg-[#e2ff00] text-black shadow-lg shadow-[#e2ff00]/10'
                : 'text-[#c6c9ab] hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-base">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'rutinas'    && <WorkoutsScreen coachId={coachId} />}
      {activeTab === 'ejercicios' && <ExerciseLibraryScreen coachId={coachId} />}
      {activeTab === 'plantillas' && <MesocycleTemplateLibrary coachId={coachId} />}
    </div>
  );
}
