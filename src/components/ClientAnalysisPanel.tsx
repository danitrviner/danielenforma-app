import React from 'react';
import {
  UserProfile, WorkoutLog, Exercise, WorkoutAssignment, BodyweightLog,
  QuestionnaireResponse, Questionnaire,
} from '../types';
import ReportsPanel from './ReportsPanel';
import NutritionAnalysisPanel from './NutritionAnalysisPanel';
import CorrelationPanel from './CorrelationPanel';
import { AnalisisTab } from './ClientHub';

interface Props {
  athlete: UserProfile;
  coachId: string;
  athleteLogs: WorkoutLog[];
  exercises: Exercise[];
  assignments: WorkoutAssignment[];
  bodyweightLogs: BodyweightLog[];
  athleteQResponses: QuestionnaireResponse[];
  coachQuestionnaires: Questionnaire[];
  analisisTab: AnalisisTab;
  onAnalisisTabChange: (tab: AnalisisTab) => void;
}

export default function ClientAnalysisPanel({
  athlete, coachId, athleteLogs, exercises, assignments, bodyweightLogs,
  athleteQResponses, coachQuestionnaires, analisisTab, onAnalisisTabChange,
}: Props) {
  return (
    <div className="space-y-6">
      {/* Sub-switcher */}
      <div className="flex bg-[#181816] border border-white/7 p-1 rounded-lg gap-1 w-fit">
        {([
          { id: 'reportes',      label: 'Reportes',      icon: 'analytics' },
          { id: 'nutricion',     label: 'Nutrición',     icon: 'nutrition' },
          { id: 'correlaciones', label: 'Correlaciones', icon: 'insights'  },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => onAnalisisTabChange(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md font-sans text-xs font-bold tracking-wider uppercase transition-all ${
              analisisTab === t.id ? 'bg-[#fbcb1a] text-black shadow-lg shadow-[#fbcb1a]/10' : 'text-[#c6c9ab] hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-base">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {analisisTab === 'reportes' && (
        <ReportsPanel
          athleteEmail={athlete.email}
          athleteName={athlete.displayName}
          coachId={coachId}
          logs={athleteLogs}
          exercises={exercises}
          assignments={assignments}
          bodyweightLogs={bodyweightLogs}
          targetWeight={athlete.targetWeight}
        />
      )}

      {analisisTab === 'nutricion' && (
        <NutritionAnalysisPanel
          athleteEmail={athlete.email}
          athleteName={athlete.displayName}
          targetWeight={athlete.targetWeight}
        />
      )}

      {analisisTab === 'correlaciones' && (
        <CorrelationPanel
          athleteEmail={athlete.email}
          logs={athleteLogs}
          exercises={exercises}
          responses={athleteQResponses}
          questionnaires={coachQuestionnaires}
          bodyweightLogs={bodyweightLogs}
        />
      )}
    </div>
  );
}
