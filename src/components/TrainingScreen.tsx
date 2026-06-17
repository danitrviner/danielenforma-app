import React from 'react';
import { UserProfile } from '../types';

interface TrainingScreenProps {
  profile: UserProfile;
}

export default function TrainingScreen({ profile: _profile }: TrainingScreenProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-sans font-extrabold text-3xl tracking-tight text-white">Entrenamiento</h1>
        <p className="text-[#c6c9ab] text-sm mt-1">Tus bloques de entrenamiento y progresiones de carga.</p>
      </div>

      <div className="flex flex-col items-center justify-center py-24 text-center bg-[#121212] border border-dashed border-[#2a2a2a] rounded-xl">
        <span
          className="material-symbols-outlined text-5xl text-[#e2ff00] mb-4"
          style={{ fontVariationSettings: "'FILL' 0" }}
        >
          fitness_center
        </span>
        <h2 className="font-sans font-bold text-xl text-white mb-2">Módulo en construcción</h2>
        <p className="text-[#c6c9ab] text-sm max-w-xs">
          Aquí irán tus rutinas de entrenamiento, progresiones de carga y registros de sesión. Próximamente.
        </p>
      </div>
    </div>
  );
}
