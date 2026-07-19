import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Roadmap } from '../types';
import {
  getMesocycles, getNutritionProgram, getRoadmap, saveRoadmap, getUserProfileByEmail,
  getStepsForAthlete, getWorkoutLogs, getExercises, getDietCompletionLogsForAthlete,
  getDietsForAthlete, getWorkoutAssignments,
} from '../dbService';
import { useAthleteWeight } from '../hooks/useAthleteWeight';
import RoadmapTimeline from './RoadmapTimeline';
import PlanPhaseEditor from './roadmap/PlanPhaseEditor';
import ChallengeManager from './roadmap/ChallengeManager';
import LevelLadderEditor from './roadmap/LevelLadderEditor';
import { PhaseData } from '../utils/planPhase';
import { LadderData } from '../utils/levelLadder';
import { ChallengeData } from '../utils/weeklyChallenge';

interface Props {
  athleteEmail: string;
}

type SubTab = 'fases' | 'retos' | 'niveles' | 'timeline';

const SUB_TABS: { id: SubTab; label: string; icon: string }[] = [
  { id: 'fases', label: 'Fases', icon: 'route' },
  { id: 'retos', label: 'Retos', icon: 'flag' },
  { id: 'niveles', label: 'Niveles', icon: 'military_tech' },
  { id: 'timeline', label: 'Timeline', icon: 'view_timeline' },
];

export default function CoachRoadmapView({ athleteEmail }: Props) {
  const queryClient = useQueryClient();
  const [subTab, setSubTab] = useState<SubTab>('fases');
  const { logs: bodyweightLogs } = useAthleteWeight(athleteEmail);

  const roadmapKey = ['roadmap', athleteEmail] as const;

  const { data: profile, isPending: loadingProfile } = useQuery({
    queryKey: ['userProfileByEmail', athleteEmail],
    queryFn: () => getUserProfileByEmail(athleteEmail),
  });
  const { data: mesocycles = [], isPending: loadingMesos } = useQuery({
    queryKey: ['mesocycles', athleteEmail],
    queryFn: () => getMesocycles(athleteEmail),
  });
  const { data: nutritionProgram = null, isPending: loadingNutri } = useQuery({
    queryKey: ['nutritionProgram', athleteEmail],
    queryFn: () => getNutritionProgram(athleteEmail),
  });
  const { data: roadmap, isPending: loadingRoadmap } = useQuery({
    queryKey: roadmapKey,
    queryFn: () => getRoadmap(athleteEmail),
  });
  const { data: stepLogs = [], isPending: loadingSteps } = useQuery({
    queryKey: ['stepsForAthlete', athleteEmail],
    queryFn: () => getStepsForAthlete(athleteEmail),
  });
  const { data: workoutLogs = [], isPending: loadingWorkoutLogs } = useQuery({
    queryKey: ['workoutLogs', athleteEmail],
    queryFn: () => getWorkoutLogs(athleteEmail),
  });
  const { data: exercises = [], isPending: loadingExercises } = useQuery({
    queryKey: ['exercises'],
    queryFn: getExercises,
  });
  const { data: dietCompletionLogs = [], isPending: loadingDcl } = useQuery({
    queryKey: ['dietCompletionLogsForAthlete', athleteEmail],
    queryFn: () => getDietCompletionLogsForAthlete(athleteEmail),
  });
  const { data: diets = [], isPending: loadingDiets } = useQuery({
    queryKey: ['dietsForAthlete', athleteEmail],
    queryFn: () => getDietsForAthlete(athleteEmail),
  });
  const uid = profile?.userId;
  const { data: assignments = [], isPending: loadingAssignments } = useQuery({
    queryKey: ['workoutAssignments', uid],
    queryFn: () => getWorkoutAssignments(uid!),
    enabled: !!uid,
  });

  const initialWeight = profile?.actualWeight ?? profile?.initialWeight;
  const loading = loadingProfile || loadingMesos || loadingNutri || loadingRoadmap
    || loadingSteps || loadingWorkoutLogs || loadingExercises || loadingDcl || loadingDiets
    || (!!uid && loadingAssignments);

  async function handleSave(updated: Roadmap) {
    await saveRoadmap(updated);
    queryClient.setQueryData(roadmapKey, updated);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="material-symbols-outlined text-3xl text-[#fbcb1a] animate-spin">refresh</span>
      </div>
    );
  }

  const rm = roadmap ?? { athleteId: athleteEmail, items: [] };
  const today = new Date().toISOString().split('T')[0];

  const phaseData: PhaseData = {
    bodyweightLogs, stepLogs, workoutLogs, exercises, initialWeight, today,
    completionLogs: dietCompletionLogs, coachDiets: diets.filter(d => !d.selfManaged),
  };
  const ladderData: LadderData = { bodyweightLogs, stepLogs, workoutLogs, exercises, initialWeight, today };
  const challengeData: ChallengeData = {
    stepLogs, bodyweightLogs, workoutLogs, exercises,
    completionLogs: dietCompletionLogs, coachDiets: diets.filter(d => !d.selfManaged),
    assignments, projection: null, liftExerciseIds: rm.challengeConfig?.liftExerciseIds,
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-sans font-black text-xl text-white uppercase tracking-tight">Road map del atleta</h2>
        <p className="text-[#c6c9ab] text-xs font-mono mt-1">Fases, retos semanales y niveles — editable por el coach</p>
      </div>

      <div className="flex bg-[#181816] border border-white/7 p-1 rounded-lg gap-1 w-fit flex-wrap">
        {SUB_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md font-sans text-xs font-bold tracking-wider uppercase transition-all ${
              subTab === t.id ? 'bg-[#fbcb1a] text-black shadow-lg shadow-[#fbcb1a]/10' : 'text-[#c6c9ab] hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-base">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'fases' && (
        <PlanPhaseEditor
          roadmap={rm}
          onSave={handleSave}
          phaseData={phaseData}
          nutritionProgram={nutritionProgram}
          currentWeightKg={initialWeight}
          onProgramSaved={program => queryClient.setQueryData(['nutritionProgram', athleteEmail], program)}
        />
      )}
      {subTab === 'retos' && (uid
        ? <ChallengeManager athleteEmail={athleteEmail} challengeData={challengeData} roadmap={rm} onSaveRoadmap={handleSave} />
        : <p className="text-xs text-[#555] font-mono py-4">No se ha podido cargar el perfil del atleta.</p>
      )}
      {subTab === 'niveles' && <LevelLadderEditor roadmap={rm} onSave={handleSave} ladderData={ladderData} />}
      {subTab === 'timeline' && (
        <RoadmapTimeline
          mesocycles={mesocycles}
          nutritionProgram={nutritionProgram}
          roadmap={rm}
          readonly={false}
          onSave={handleSave}
          bodyweightLogs={bodyweightLogs}
          initialWeight={initialWeight}
        />
      )}
    </div>
  );
}
