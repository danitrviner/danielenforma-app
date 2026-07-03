import React, { useState, useEffect } from 'react';
import { UserProfile, Mesocycle, NutritionProgram, Roadmap, BodyweightLog } from '../types';
import { getMesocycles, getNutritionProgram, getRoadmap, getBodyweightForAthlete } from '../dbService';
import RoadmapTimeline from './RoadmapTimeline';

interface Props {
  profile: UserProfile;
}

export default function AthleteRoadmapScreen({ profile }: Props) {
  const [mesocycles, setMesocycles] = useState<Mesocycle[]>([]);
  const [nutritionProgram, setNutritionProgram] = useState<NutritionProgram | null>(null);
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [bodyweightLogs, setBodyweightLogs] = useState<BodyweightLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [mesos, nutri, rm, bwLogs] = await Promise.all([
          getMesocycles(profile.email),
          getNutritionProgram(profile.email),
          getRoadmap(profile.email),
          getBodyweightForAthlete(profile.email),
        ]);
        if (!cancelled) {
          setMesocycles(mesos);
          setNutritionProgram(nutri);
          setRoadmap(rm);
          setBodyweightLogs(bwLogs);
        }
      } catch (err) {
        console.warn('AthleteRoadmapScreen load error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [profile.email]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="material-symbols-outlined text-3xl text-[#fbcb1a] animate-spin">refresh</span>
      </div>
    );
  }

  if (!roadmap) {
    return (
      <div className="text-center py-24">
        <span className="material-symbols-outlined text-5xl text-[#2a2a2a] block mb-3">map</span>
        <p className="font-sans font-bold text-white text-sm mb-1">Road map</p>
        <p className="text-[#c6c9ab] text-xs font-mono">No hay planificación disponible todavía.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-sans font-black text-2xl text-white uppercase tracking-tight">Road map</h1>
        <p className="text-[#c6c9ab] text-xs font-mono mt-1">Tu planificación a largo plazo</p>
      </div>
      <RoadmapTimeline
        mesocycles={mesocycles}
        nutritionProgram={nutritionProgram}
        roadmap={roadmap}
        readonly={true}
        bodyweightLogs={bodyweightLogs}
        initialWeight={profile.actualWeight ?? profile.initialWeight}
      />
    </div>
  );
}
