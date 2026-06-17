import React, { useState } from 'react';
import ExerciseLibraryScreen from './ExerciseLibraryScreen';
import WorkoutsScreen from './WorkoutsScreen';

interface TrainingCoachScreenProps {
  coachId: string;
}

type Tab = 'ejercicios' | 'rutinas';

export default function TrainingCoachScreen({ coachId }: TrainingCoachScreenProps) {
  const [activeTab, setActiveTab] = useState<Tab>('rutinas');

  return (
    <div className="space-y-6">
      {/* Sub-tab switcher */}
      <div className="flex bg-[#121212] border border-[#2a2a2a] p-1 rounded-lg gap-1 w-fit">
        <button
          onClick={() => setActiveTab('rutinas')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md font-sans text-xs font-bold tracking-wider uppercase transition-all ${
            activeTab === 'rutinas'
              ? 'bg-[#e2ff00] text-black shadow-lg shadow-[#e2ff00]/10'
              : 'text-[#c6c9ab] hover:text-white'
          }`}
        >
          <span className="material-symbols-outlined text-base">format_list_bulleted</span>
          Rutinas
        </button>
        <button
          onClick={() => setActiveTab('ejercicios')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md font-sans text-xs font-bold tracking-wider uppercase transition-all ${
            activeTab === 'ejercicios'
              ? 'bg-[#e2ff00] text-black shadow-lg shadow-[#e2ff00]/10'
              : 'text-[#c6c9ab] hover:text-white'
          }`}
        >
          <span className="material-symbols-outlined text-base">fitness_center</span>
          Ejercicios
        </button>
      </div>

      {activeTab === 'rutinas'    && <WorkoutsScreen coachId={coachId} />}
      {activeTab === 'ejercicios' && <ExerciseLibraryScreen coachId={coachId} />}
    </div>
  );
}
