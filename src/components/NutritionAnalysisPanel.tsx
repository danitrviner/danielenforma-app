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
import { NotaDeFuente } from './FuentesCientificasSheet';
import VegetableSelector from './VegetableSelector';
import { Icon, Button, Skeleton, EmptyState } from './ui';

const DEFAULT_STEP_GOAL = 8000;
const DEFAULT_VEG_SERVINGS = 3;

const STATUS_BAR_COLOR: Record<MicroStatus, string> = {
  low:     'bg-danger',
  ok:      'bg-success',
  high:    'bg-warning',
  unknown: 'bg-ink-3',
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
    return (
      <div className="space-y-5">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (!report) {
    return (
      <EmptyState
        icon="nutrition"
        title="Sin datos suficientes"
        description={`Todavía no hay datos de dieta, pasos o peso para ${athleteName}.`}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-sans font-bold text-title-m tracking-tight text-white uppercase flex items-center gap-2">
          <Icon name="nutrition" size="l" filled className="text-accent" />
          Análisis nutricional
        </h2>
        <p className="font-sans text-label text-ink-2 mt-1">Adherencia, macros, pasos y micronutrientes estimados. Privado hasta que lo compartas.</p>
      </div>

      {/* Summary */}
      <div className="bg-surface border border-hairline rounded-surface p-5">
        <p className="font-mono text-caption text-ink-2 uppercase tracking-wider mb-2">Resumen</p>
        <p className="text-body-s text-white font-sans leading-relaxed">{report.summary}</p>
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
        <div className="bg-surface border border-hairline rounded-surface p-5">
          <p className="font-sans text-caption text-ink-2 uppercase tracking-wider mb-3">Macros del plan vs objetivo</p>
          <div className="grid grid-cols-3 gap-3">
            {report.macroDeviation.map(m => (
              <div key={m.category}>
                <span className="block font-sans text-caption text-ink-2">{m.category}</span>
                <span className={`block font-mono text-body-s font-bold ${Math.abs(m.deviationPct) > 15 ? 'text-danger' : 'text-success'}`}>
                  {m.planGrams}g / {m.targetGrams}g
                </span>
                <span className="block font-mono text-caption text-ink-2">{m.deviationPct > 0 ? '+' : ''}{m.deviationPct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Micronutrientes (estimados) ── */}
      <div className="bg-surface border border-hairline rounded-surface p-5 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="font-mono text-caption text-ink-2 uppercase tracking-wider">Micronutrientes (estimados)</p>
          <div className="flex items-center gap-2">
            <span className="font-mono text-caption text-ink-2 uppercase">Verdura/día</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setVegServings(vegServings - 1)} className="w-6 h-6 rounded-control bg-raised border border-hairline text-ink-2 hover:text-white flex items-center justify-center">−</button>
              <span className="font-mono text-label text-white w-5 text-center">{vegServings}</span>
              <button onClick={() => setVegServings(vegServings + 1)} className="w-6 h-6 rounded-control bg-raised border border-hairline text-ink-2 hover:text-white flex items-center justify-center">+</button>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <p className="font-sans text-caption text-ink-2 uppercase tracking-wider">Verduras habituales del atleta</p>
          <VegetableSelector selected={vegTypes} onToggle={toggleVegType} />
        </div>

        <div className="grid sm:grid-cols-2 gap-x-5 gap-y-3">
          {micros.perMicro.map(m => (
            <div key={m.key}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-sans text-caption text-ink-2">
                  {m.label}
                  {m.status === 'low' && <span className="ml-2 text-danger">déficit</span>}
                  {m.status === 'high' && <span className="ml-2 text-warning">{m.limit ? 'alto' : 'exceso'}</span>}
                </span>
                <span className="font-mono text-caption font-bold text-white">
                  {m.intake}{m.unit} <span className="text-ink-3">· {m.rdaPct}%{m.limit ? ' ref.' : ' RDA'}</span>
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-raised overflow-hidden">
                <div className={`h-full rounded-full transition-all ${STATUS_BAR_COLOR[m.status]}`} style={{ width: `${Math.min(100, m.rdaPct)}%` }} />
              </div>
            </div>
          ))}
        </div>

        <p className="font-mono text-caption text-ink-3 leading-relaxed">
          {micros.note}
          {micros.unmatched.length > 0 && ` · ${micros.unmatched.length} alimento(s) sin estimación.`}
          {!activeDiet && ' · Sin dieta activa: sólo cuenta la línea base de verdura.'}
        </p>

        {/* 1.4.1 de Apple: los porcentajes de IDR son información nutricional
            de salud; su origen va aquí mismo, no a dos pantallas de distancia. */}
        <NotaDeFuente>
          Ingestas diarias de referencia según EFSA (Dietary Reference Values) y el límite de sodio de
          la OMS; composición de los alimentos según BEDCA y USDA FoodData Central. Es una estimación a
          partir de porciones tipo, no una analítica ni un diagnóstico.
        </NotaDeFuente>
      </div>

      {/* Flags */}
      {report.flags.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-surface p-5 space-y-2">
          <p className="font-mono text-caption text-amber-400 uppercase tracking-wider mb-1">Alertas</p>
          {report.flags.map((f, i) => (
            <p key={i} className="text-label text-amber-200 font-sans">{f}</p>
          ))}
        </div>
      )}

      {/* Share */}
      <div className="flex items-center justify-between bg-surface border border-hairline rounded-surface p-4 gap-3 flex-wrap">
        <div>
          <p className="text-label text-white font-sans font-bold">
            {nutritionConfig?.sharedReportSnapshot ? 'Resumen compartido con el atleta' : 'Análisis privado'}
          </p>
          <p className="text-caption text-ink-2 font-mono ">
            {nutritionConfig?.sharedReportSnapshot
              ? `Compartido el ${new Date(nutritionConfig.sharedReportSnapshot.generatedAt).toLocaleDateString('es-ES')}`
              : 'El atleta no ve este análisis hasta que lo compartas.'}
          </p>
        </div>
        {nutritionConfig?.sharedReportSnapshot ? (
          <Button variant="secondary" size="s" onClick={handleUnshare} disabled={sharing}>Dejar de compartir</Button>
        ) : (
          <Button size="s" onClick={handleShare} disabled={sharing}>Compartir resumen</Button>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-surface border border-hairline rounded-surface p-4 text-center">
      <span className="block font-sans text-caption text-ink-2 uppercase tracking-wider">{label}</span>
      <span className="block font-sans font-bold text-title-m text-white mt-1">{value}</span>
      <span className="block font-mono text-caption text-ink-2 ">{sub}</span>
    </div>
  );
}
