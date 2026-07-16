import React, { useState } from 'react';
import ExerciseLibraryScreen from './ExerciseLibraryScreen';
import WorkoutsScreen from './WorkoutsScreen';
import MesocycleTemplateLibrary from './MesocycleTemplateLibrary';

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
      <header className="flex flex-col gap-3 pb-4 border-b border-white/60">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center px-2 py-0.5 rounded bg-[#201f1f] text-[10px] font-sans border border-[#fbcb1a]/30 text-[#fbcb1a] font-bold uppercase tracking-wider">
            Consola de Entrenador
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-mono text-[#00eefc]">
            <span className="w-2 h-2 rounded-full bg-[#00eefc] animate-pulse"></span>
            Sincronizado
          </span>
        </div>
        <h1 className="font-sans font-black text-3xl tracking-tight text-white uppercase">Entrenamiento</h1>
      </header>

      {/* Sub-tab switcher */}
      <div className="overflow-x-auto snap-x snap-mandatory -mx-1 px-1 pb-0.5">
        <div className="flex bg-[#181816] border border-white/7 p-1 rounded-lg gap-1 w-max sm:w-fit min-w-full sm:min-w-0">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`snap-start flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-md font-sans text-xs font-bold tracking-wider uppercase whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? 'bg-[#fbcb1a] text-black shadow-lg shadow-[#fbcb1a]/10'
                  : 'text-[#c6c9ab] hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-base">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'rutinas'    && <WorkoutsScreen coachId={coachId} />}
      {activeTab === 'ejercicios' && <ExerciseLibraryScreen coachId={coachId} />}
      {activeTab === 'plantillas' && <MesocycleTemplateLibrary coachId={coachId} />}
    </div>
  );
}
