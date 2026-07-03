import React, { useState, useEffect } from 'react';
import { Mesocycle, NutritionProgram, Roadmap, BodyweightLog } from '../types';
import { getMesocycles, getNutritionProgram, getRoadmap, saveRoadmap, getBodyweightForAthlete, getUserProfileByEmail } from '../dbService';
import RoadmapTimeline from './RoadmapTimeline';

interface Props {
  athleteEmail: string;
}

export default function CoachRoadmapView({ athleteEmail }: Props) {
  const [mesocycles, setMesocycles] = useState<Mesocycle[]>([]);
  const [nutritionProgram, setNutritionProgram] = useState<NutritionProgram | null>(null);
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [bodyweightLogs, setBodyweightLogs] = useState<BodyweightLog[]>([]);
  const [initialWeight, setInitialWeight] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [mesos, nutri, rm, bwLogs, profile] = await Promise.all([
          getMesocycles(athleteEmail),
          getNutritionProgram(athleteEmail),
          getRoadmap(athleteEmail),
          getBodyweightForAthlete(athleteEmail),
          getUserProfileByEmail(athleteEmail),
        ]);
        if (!cancelled) {
          setMesocycles(mesos);
          setNutritionProgram(nutri);
          setRoadmap(rm);
          setBodyweightLogs(bwLogs);
          setInitialWeight(profile?.actualWeight ?? profile?.initialWeight);
        }
      } catch (err) {
        console.warn('CoachRoadmapView load error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [athleteEmail]);

  async function handleSave(updated: Roadmap) {
    await saveRoadmap(updated);
    setRoadmap(updated);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="material-symbols-outlined text-3xl text-[#fbcb1a] animate-spin">refresh</span>
      </div>
    );
  }

  const rm = roadmap ?? { athleteId: athleteEmail, items: [] };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-sans font-black text-xl text-white uppercase tracking-tight">Road map del atleta</h2>
        <p className="text-[#c6c9ab] text-xs font-mono mt-1">Planificación a largo plazo — editable por el coach</p>
      </div>
      <RoadmapTimeline
        mesocycles={mesocycles}
        nutritionProgram={nutritionProgram}
        roadmap={rm}
        readonly={false}
        onSave={handleSave}
        bodyweightLogs={bodyweightLogs}
        initialWeight={initialWeight}
      />
    </div>
  );
}
