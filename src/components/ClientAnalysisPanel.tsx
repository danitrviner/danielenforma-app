import React from 'react';
import {
  UserProfile, WorkoutLog, Exercise, WorkoutAssignment, BodyweightLog,
  QuestionnaireResponse, Questionnaire,
} from '../types';
import ReportsPanel from './ReportsPanel';
import NutritionAnalysisPanel from './NutritionAnalysisPanel';
import CorrelationPanel from './CorrelationPanel';
import { AnalisisTab } from './ClientHub';
import { Tabs } from './ui';

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
      <Tabs
        items={[
          { id: 'reportes',      label: 'Reportes',      icon: 'analytics' },
          { id: 'nutricion',     label: 'Nutrición',     icon: 'nutrition' },
          { id: 'correlaciones', label: 'Correlaciones', icon: 'insights'  },
        ]}
        value={analisisTab}
        onChange={id => onAnalisisTabChange(id as AnalisisTab)}
        label="Secciones de Análisis"
      />

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
          assignments={assignments}
        />
      )}
    </div>
  );
}
