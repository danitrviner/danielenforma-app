import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AthleteNutritionConfig } from '../types';
import {
  getDietsForAthlete, getAthleteDietConfig, getDietCompletionLogsForAthlete,
  getStepsForAthlete, getBodyweightForAthlete, getOnboarding, getAthleteNutritionConfig, saveAthleteNutritionConfig,
} from '../dbService';
import { bodyweightForAthleteKey } from '../hooks/useAthleteWeight';
import { buildNutritionReport, NutritionReport } from '../utils/nutritionAnalysis';
import { buildMicronutrientEstimate, MicroStatus } from '../utils/micronutrients';
import VegetableSelector from './VegetableSelector';

const DEFAULT_STEP_GOAL = 8000;
const DEFAULT_VEG_SERVINGS = 3;

const STATUS_COLOR: Record<MicroStatus, string> = {
  low:     '#f87171', // red-400
  ok:      '#34d399', // emerald-400
  high:    '#fbbf24', // amber-400
  unknown: '#555',
};

interface Props {
  athleteEmail: string;
  athleteName: string;
  targetWeight?: number;
}

// Per-client nutrition analysis (moved from the global coach console). Self-loads
// the athlete's diet/adherence/steps/weight data, runs the deterministic report
// engine plus the micronutrient estimate. Coach shares a snapshot with the athlete.
export default function NutritionAnalysisPanel({ athleteEmail, athleteName, targetWeight }: Props) {
  const queryClient = useQueryClient();
  const nutritionConfigKey = ['athleteNutritionConfig', athleteEmail] as const;

  const { data: diets, isPending: loadingDiets } = useQuery({
    queryKey: ['dietsForAthlete', athleteEmail],
    queryFn: () => getDietsForAthlete(athleteEmail),
  });
  const { data: dietConfig, isPending: loadingDietConfig } = useQuery({
    queryKey: ['athleteDietConfig', athleteEmail],
    queryFn: () => getAthleteDietConfig(athleteEmail).catch(() => null),
  });
  const { data: completionLogs, isPending: loadingCompletionLogs } = useQuery({
    queryKey: ['dietCompletionLogsForAthlete', athleteEmail],
    queryFn: () => getDietCompletionLogsForAthlete(athleteEmail),
  });
  const { data: stepLogs, isPending: loadingSteps } = useQuery({
    queryKey: ['stepsForAthlete', athleteEmail],
    queryFn: () => getStepsForAthlete(athleteEmail),
  });
  const { data: bodyweightLogs, isPending: loadingBodyweight } = useQuery({
    queryKey: bodyweightForAthleteKey(athleteEmail),
    queryFn: () => getBodyweightForAthlete(athleteEmail),
  });
  const { data: onboarding, isPending: loadingOnboarding } = useQuery({
    queryKey: ['onboarding', athleteEmail],
    queryFn: () => getOnboarding(athleteEmail).catch(() => null),
  });
  const { data: nutritionConfigData, isPending: loadingNutConfig } = useQuery({
    queryKey: nutritionConfigKey,
    queryFn: () => getAthleteNutritionConfig(athleteEmail).catch(() => null),
  });

  const loading = loadingDiets || loadingDietConfig || loadingCompletionLogs
    || loadingSteps || loadingBodyweight || loadingOnboarding || loadingNutConfig;

  const nutritionConfig: AthleteNutritionConfig = nutritionConfigData
    ?? { athleteId: athleteEmail, enabledModes: ['OMNIVORO'] };

  const coachDiets = useMemo(() => (diets ?? []).filter(d => !d.selfManaged), [diets]);
  const activeDiet = useMemo(() => {
    const activeId = dietConfig?.activeDietIds?.[0] ?? null;
    return activeId ? coachDiets.find(d => d.id === activeId) ?? null : (coachDiets[0] ?? null);
  }, [coachDiets, dietConfig]);
  const stepGoal = nutritionConfigData?.stepGoal ?? DEFAULT_STEP_GOAL;

  const report = useMemo<NutritionReport | null>(() => {
    if (loading) return null;
    try {
      return buildNutritionReport({
        completionLogs: completionLogs ?? [],
        diets: coachDiets,
        activeDiet,
        stepLogs: stepLogs ?? [],
        stepGoal,
        bodyweightLogs: bodyweightLogs ?? [],
        targetWeight,
        onboarding: onboarding ?? null,
      });
    } catch (err) {
      console.error('NutritionAnalysisPanel report build error:', err);
      return null;
    }
  }, [loading, completionLogs, coachDiets, activeDiet, stepLogs, stepGoal, bodyweightLogs, targetWeight, onboarding]);

  const [sharing, setSharing] = useState(false);

  const vegServings = nutritionConfig.vegServingsPerDay ?? DEFAULT_VEG_SERVINGS;
  const vegTypes = nutritionConfig.vegTypes ?? [];

  const micros = useMemo(
    () => buildMicronutrientEstimate(activeDiet, { sex: onboarding?.sex, vegServingsPerDay: vegServings, vegTypes }),
    [activeDiet, onboarding, vegServings, vegTypes],
  );

  const setVegServings = async (n: number) => {
    if (n < 0 || n > 8) return;
    const next: AthleteNutritionConfig = { ...nutritionConfig, vegServingsPerDay: n };
    queryClient.setQueryData(nutritionConfigKey, next);
    saveAthleteNutritionConfig(next).catch(console.error);
  };

  const toggleVegType = (id: string) => {
    const next: AthleteNutritionConfig = {
      ...nutritionConfig,
      vegTypes: vegTypes.includes(id) ? vegTypes.filter(v => v !== id) : [...vegTypes, id],
    };
    queryClient.setQueryData(nutritionConfigKey, next);
    saveAthleteNutritionConfig(next).catch(console.error);
  };

  const handleShare = async () => {
    if (!report) return;
    setSharing(true);
    try {
      const next: AthleteNutritionConfig = {
        ...nutritionConfig,
        sharedReportSnapshot: { generatedAt: report.generatedAt, summary: report.summary, flags: report.flags },
      };
      await saveAthleteNutritionConfig(next);
      queryClient.setQueryData(nutritionConfigKey, next);
    } catch (err) { console.error(err); } finally { setSharing(false); }
  };

  const handleUnshare = async () => {
    setSharing(true);
    try {
      const next: AthleteNutritionConfig = { ...nutritionConfig, sharedReportSnapshot: undefined };
      await saveAthleteNutritionConfig(next);
      queryClient.setQueryData(nutritionConfigKey, next);
    } catch (err) { console.error(err); } finally { setSharing(false); }
  };

  if (loading) {
    return <div className="text-center py-10 font-mono text-sm text-[#c6c9ab] animate-pulse">Analizando…</div>;
  }
  if (!report) {
    return <div className="text-center py-10 font-mono text-xs text-[#c6c9ab] italic">Sin datos suficientes para {athleteName}.</div>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-sans font-black text-xl tracking-tight text-white uppercase flex items-center gap-2">
          <span className="material-symbols-outlined text-[#fbcb1a]" style={{ fontVariationSettings: "'FILL' 1" }}>nutrition</span>
          Análisis nutricional
        </h2>
        <p className="font-mono text-xs text-[#c6c9ab] mt-1">Adherencia, macros, pasos y micronutrientes estimados. Privado hasta que lo compartas.</p>
      </div>

      {/* Summary */}
      <div className="bg-[#181816] border border-white/7 rounded-2xl p-5">
        <p className="font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wider mb-2">Resumen</p>
        <p className="text-sm text-white font-sans leading-relaxed">{report.summary}</p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-3 gap-3">
        <MetricCard label="Adherencia" value={`${report.adherence.avgPct}%`} sub={`${report.adherence.daysLogged} días`} />
        <MetricCard label="Pasos" value={`${report.steps.avgPct}%`} sub={`${report.steps.daysLogged} días`} />
        <MetricCard
          label="Peso"
          value={report.weightTrend.latestWeight != null ? `${report.weightTrend.latestWeight}kg` : '—'}
          sub={report.weightTrend.deltaFromFirst != null ? `${report.weightTrend.deltaFromFirst >= 0 ? '+' : ''}${report.weightTrend.deltaFromFirst}kg` : 'sin datos'}
        />
      </div>

      {/* Macro deviation */}
      {report.macroDeviation.length > 0 && (
        <div className="bg-[#181816] border border-white/7 rounded-2xl p-5">
          <p className="font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wider mb-3">Macros del plan vs objetivo</p>
          <div className="grid grid-cols-3 gap-3">
            {report.macroDeviation.map(m => (
              <div key={m.category}>
                <span className="block font-mono text-[9px] text-[#c6c9ab]">{m.category}</span>
                <span className={`block font-mono text-sm font-bold ${Math.abs(m.deviationPct) > 15 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {m.planGrams}g / {m.targetGrams}g
                </span>
                <span className="block font-mono text-[9px] text-[#c6c9ab]">{m.deviationPct > 0 ? '+' : ''}{m.deviationPct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Micronutrientes (estimados) ── */}
      <div className="bg-[#181816] border border-white/7 rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wider">Micronutrientes (estimados)</p>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[9px] text-[#c6c9ab] uppercase">Verdura/día</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setVegServings(vegServings - 1)} className="w-6 h-6 rounded-md bg-[#1e1e1b] border border-white/7 text-[#c6c9ab] hover:text-white flex items-center justify-center">−</button>
              <span className="font-mono text-xs text-white w-5 text-center">{vegServings}</span>
              <button onClick={() => setVegServings(vegServings + 1)} className="w-6 h-6 rounded-md bg-[#1e1e1b] border border-white/7 text-[#c6c9ab] hover:text-white flex items-center justify-center">+</button>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wider">Verduras habituales del atleta</p>
          <VegetableSelector selected={vegTypes} onToggle={toggleVegType} />
        </div>

        <div className="grid sm:grid-cols-2 gap-x-5 gap-y-2.5">
          {micros.perMicro.map(m => (
            <div key={m.key}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-[10px] text-[#c6c9ab]">
                  {m.label}
                  {m.status === 'low' && <span className="ml-1.5 text-red-400">déficit</span>}
                  {m.status === 'high' && <span className="ml-1.5 text-amber-400">{m.limit ? 'alto' : 'exceso'}</span>}
                </span>
                <span className="font-mono text-[10px] font-bold text-white">
                  {m.intake}{m.unit} <span className="text-[#555]">· {m.rdaPct}%{m.limit ? ' ref.' : ' RDA'}</span>
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-[#1e1e1b] overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, m.rdaPct)}%`, backgroundColor: STATUS_COLOR[m.status] }} />
              </div>
            </div>
          ))}
        </div>

        <p className="font-mono text-[9px] text-[#444] leading-relaxed">
          {micros.note}
          {micros.unmatched.length > 0 && ` · ${micros.unmatched.length} alimento(s) sin estimación.`}
          {!activeDiet && ' · Sin dieta activa: sólo cuenta la línea base de verdura.'}
        </p>
      </div>

      {/* Flags */}
      {report.flags.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-5 space-y-1.5">
          <p className="font-mono text-[9px] text-amber-400 uppercase tracking-wider mb-1">Alertas</p>
          {report.flags.map((f, i) => (
            <p key={i} className="text-xs text-amber-200 font-sans">{f}</p>
          ))}
        </div>
      )}

      {/* Share */}
      <div className="flex items-center justify-between bg-[#181816] border border-white/7 rounded-2xl p-4 gap-3 flex-wrap">
        <div>
          <p className="text-xs text-white font-sans font-bold">
            {nutritionConfig?.sharedReportSnapshot ? 'Resumen compartido con el atleta' : 'Análisis privado'}
          </p>
          <p className="text-[10px] text-[#c6c9ab] font-mono mt-0.5">
            {nutritionConfig?.sharedReportSnapshot
              ? `Compartido el ${new Date(nutritionConfig.sharedReportSnapshot.generatedAt).toLocaleDateString('es-ES')}`
              : 'El atleta no ve este análisis hasta que lo compartas.'}
          </p>
        </div>
        {nutritionConfig?.sharedReportSnapshot ? (
          <button onClick={handleUnshare} disabled={sharing}
            className="px-3.5 py-2 bg-[#1c1b1b] border border-white/7 text-[#c6c9ab] font-mono text-[10px] font-bold uppercase rounded-lg hover:border-red-400/40 hover:text-red-400 transition-all disabled:opacity-50"
          >Dejar de compartir</button>
        ) : (
          <button onClick={handleShare} disabled={sharing}
            className="px-3.5 py-2 bg-[#fbcb1a] text-black font-sans text-[10px] font-bold uppercase rounded-lg hover:bg-[#d4a800] transition-all disabled:opacity-50"
          >Compartir resumen</button>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-[#181816] border border-white/7 rounded-2xl p-4 text-center">
      <span className="block font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wider">{label}</span>
      <span className="block font-sans font-bold text-lg text-white mt-1">{value}</span>
      <span className="block font-mono text-[9px] text-[#c6c9ab] mt-0.5">{sub}</span>
    </div>
  );
}
