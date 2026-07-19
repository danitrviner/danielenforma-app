import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceArea, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { NutritionProgram } from '../types';
import {
  getNutritionProgram, getDietsForAthlete, getOnboarding,
  getDietCompletionLogsForAthlete, getStepsForAthlete, getAthleteNutritionConfig,
  computeActivePhase, computePhaseStartDate,
} from '../dbService';
import { useAthleteWeight } from '../hooks/useAthleteWeight';
import { DEFAULT_KCAL_PER_STEP } from '../utils/nutritionConstants';
import { computeAdherenceRate, computeStepCompletionRate, DEFAULT_THRESHOLDS } from '../utils/nutritionAnalysis';
import {
  buildPhaseEnergyPlans, buildWeightProjection, computePeriodizationPerformance,
  computePhaseEnergyBalance, resolvePhaseTargetKcal, PhaseEnergyPlan,
} from '../utils/nutritionPeriodization';
import Skeleton from './Skeleton';

const DEFAULT_STEP_GOAL = 8000;
const PHASE_COLORS = ['#fbcb1a', '#00eefc', '#a78bfa', '#ff8c69'];

// recharts' ReferenceArea prop types don't declare `key`, even though React
// accepts it on any element — cast so mapping a dynamic list of phase bands typechecks.
const ReferenceAreaAny = ReferenceArea as unknown as React.FC<Record<string, unknown>>;

interface Props {
  athleteEmail: string;
  athleteName?: string;
  targetWeightKg?: number;
  onEdit?: () => void;
  // Bump this from a parent (e.g. after saving the periodization form) to force
  // a refetch — this component owns its own copy of program/diets/etc. fetched
  // once per mount, so it has no other way to learn they just changed elsewhere.
  refreshToken?: number;
}

type CurveMode = 'both' | 'exp' | 'adh';

interface ChartRow {
  week: number;
  date: string;
  label: string;
  expected100: number | null;
  expectedAdherence: number | null;
  real: number | null;
}

function fmtDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function fmtKg(n: number | null | undefined, withSign = false): string {
  if (n == null) return '—';
  const s = n.toFixed(1);
  return withSign && n >= 0 ? `+${s}` : s;
}

function fmtKcal(n: number | null | undefined): string {
  return n == null ? '—' : Math.round(n).toLocaleString('es-ES');
}

// 1-indexed week number within the currently active phase (for "Semana X/Y").
function weekIndexInPhase(program: NutritionProgram, phaseId: string, today: string): number | null {
  const idx = program.phases.findIndex(p => p.id === phaseId);
  if (idx < 0) return null;
  const phase = program.phases[idx];
  const phaseStart = computePhaseStartDate(program, idx);
  const days = Math.floor((new Date(today + 'T00:00:00').getTime() - new Date(phaseStart + 'T00:00:00').getTime()) / 86400000);
  return Math.min(Math.max(Math.floor(days / 7) + 1, 1), phase.weeks);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ProjectionTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const row: ChartRow = payload[0]?.payload;
  if (!row) return null;
  const dev = (row.real != null && row.expected100 != null) ? row.real - row.expected100 : null;
  return (
    <div className="bg-[#1e1e1b] border border-white/7 rounded-xl px-3 py-2.5 text-xs font-mono shadow-xl min-w-[170px]">
      <p className="text-[#c6c9ab] mb-1.5 uppercase text-[10px] tracking-wider">{row.label} · {fmtDate(row.date)}</p>
      {row.expected100 != null && (
        <p className="flex items-center justify-between gap-3">
          <span className="text-[#00eefc]">Esperado 100%</span>
          <span className="text-white font-bold">{fmtKg(row.expected100)} kg</span>
        </p>
      )}
      {row.expectedAdherence != null && (
        <p className="flex items-center justify-between gap-3">
          <span className="text-[#a78bfa]">S/ adherencia</span>
          <span className="text-white font-bold">{fmtKg(row.expectedAdherence)} kg</span>
        </p>
      )}
      {row.real != null && (
        <p className="flex items-center justify-between gap-3">
          <span className="text-[#fbcb1a]">Real</span>
          <span className="text-white font-bold">{fmtKg(row.real)} kg</span>
        </p>
      )}
      {dev != null && (
        <p className="flex items-center justify-between gap-3 mt-1 pt-1 border-t border-white/7">
          <span className="text-[#c6c9ab]">Desvío</span>
          <span className={`font-bold ${dev > 0 ? 'text-[#fdba74]' : 'text-[#86efac]'}`}>{fmtKg(dev, true)} kg</span>
        </p>
      )}
    </div>
  );
}

export default function NutritionPerformanceDashboard({ athleteEmail, athleteName, targetWeightKg, onEdit, refreshToken }: Props) {
  const queryClient = useQueryClient();
  const [curveMode, setCurveMode] = useState<CurveMode>('both');
  const { logs: bodyweightLogs } = useAthleteWeight(athleteEmail);

  const { data: program = null, isPending: loadingProgram } = useQuery({
    queryKey: ['nutritionProgram', athleteEmail],
    queryFn: () => getNutritionProgram(athleteEmail),
  });
  const { data: dietsRaw, isPending: loadingDiets } = useQuery({
    queryKey: ['dietsForAthlete', athleteEmail],
    queryFn: () => getDietsForAthlete(athleteEmail),
  });
  const diets = useMemo(() => (dietsRaw ?? []).filter(d => !d.selfManaged), [dietsRaw]);
  const { data: onboarding = null, isPending: loadingOnboarding } = useQuery({
    queryKey: ['onboarding', athleteEmail],
    queryFn: () => getOnboarding(athleteEmail).catch(() => null),
  });
  const { data: completionLogs = [], isPending: loadingCompletionLogs } = useQuery({
    queryKey: ['dietCompletionLogsForAthlete', athleteEmail],
    queryFn: () => getDietCompletionLogsForAthlete(athleteEmail),
  });
  const { data: stepLogs = [], isPending: loadingSteps } = useQuery({
    queryKey: ['stepsForAthlete', athleteEmail],
    queryFn: () => getStepsForAthlete(athleteEmail),
  });
  const { data: nutritionConfig = null, isPending: loadingNutConfig } = useQuery({
    queryKey: ['athleteNutritionConfig', athleteEmail],
    queryFn: () => getAthleteNutritionConfig(athleteEmail).catch(() => null),
  });

  const loading = loadingProgram || loadingDiets || loadingOnboarding
    || loadingCompletionLogs || loadingSteps || loadingNutConfig;

  // This component owns its own copy of program/diets/etc; a parent (e.g. after
  // saving the periodization form) bumps refreshToken to force a genuine
  // refetch of all of it, bypassing the query cache's staleTime — matching the
  // old effect's [athleteEmail, refreshToken] dependency. Skipped on first
  // mount since the queries above already fetch then.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    queryClient.invalidateQueries({ queryKey: ['nutritionProgram', athleteEmail] });
    queryClient.invalidateQueries({ queryKey: ['dietsForAthlete', athleteEmail] });
    queryClient.invalidateQueries({ queryKey: ['onboarding', athleteEmail] });
    queryClient.invalidateQueries({ queryKey: ['dietCompletionLogsForAthlete', athleteEmail] });
    queryClient.invalidateQueries({ queryKey: ['stepsForAthlete', athleteEmail] });
    queryClient.invalidateQueries({ queryKey: ['athleteNutritionConfig', athleteEmail] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  const stepGoal = nutritionConfig?.stepGoal ?? DEFAULT_STEP_GOAL;
  const kcalPerStep = nutritionConfig?.kcalPerStep ?? DEFAULT_KCAL_PER_STEP;
  const today = new Date().toISOString().split('T')[0];

  const plans: PhaseEnergyPlan[] = useMemo(
    () => program ? buildPhaseEnergyPlans(program, diets) : [],
    [program, diets],
  );

  const projection = useMemo(() => {
    if (!program) return null;
    return buildWeightProjection({
      program, plans, diets, onboarding, bodyweightLogs, completionLogs, stepLogs,
      stepGoal, kcalPerStep, today,
    });
  }, [program, plans, diets, onboarding, bodyweightLogs, completionLogs, stepLogs, stepGoal, kcalPerStep, today]);

  const performance = useMemo(() => {
    if (!projection) return null;
    return computePeriodizationPerformance({ projection, onboarding, stepGoal, kcalPerStep });
  }, [projection, onboarding, stepGoal, kcalPerStep]);

  const dietAdherence = useMemo(
    () => computeAdherenceRate(completionLogs, diets, DEFAULT_THRESHOLDS),
    [completionLogs, diets],
  );
  const stepAdherence = useMemo(
    () => computeStepCompletionRate(stepLogs, stepGoal, DEFAULT_THRESHOLDS),
    [stepLogs, stepGoal],
  );

  const activePhase = program ? computeActivePhase(program, today) : null;
  const activePhaseIdx = program && activePhase ? program.phases.findIndex(p => p.id === activePhase.id) : -1;
  const activePhaseColor = PHASE_COLORS[Math.max(activePhaseIdx, 0) % PHASE_COLORS.length];
  const activeWeekNum = program && activePhase ? weekIndexInPhase(program, activePhase.id, today) : null;
  const totalWeeks = program?.phases.reduce((s, p) => s + p.weeks, 0) ?? 0;
  const activeDiet = activePhase ? diets.find(d => d.id === activePhase.dietId) : undefined;
  const activeResolved = activePhase ? resolvePhaseTargetKcal(activePhase, activeDiet) : null;
  const activeBalance = activeResolved
    ? computePhaseEnergyBalance({
        targetKcal: activeResolved.kcal,
        maintenanceKcal: performance?.estimatedMaintenanceKcal ?? null,
        stepGoal, kcalPerStep,
      })
    : null;

  const chartRows: ChartRow[] = useMemo(() => {
    if (!projection || !program) return [];
    return projection.points.map(p => {
      const phase = program.phases.find(ph => ph.id === p.phaseId);
      return {
        week: p.week, date: p.date, label: phase ? phase.name : `Semana ${p.week}`,
        expected100: p.expected100, expectedAdherence: p.expectedAdherence,
        real: p.real,
      };
    });
  }, [projection, program]);

  const phaseBands = useMemo(() => {
    if (!program) return [];
    let cum = 0;
    return program.phases.map((phase, idx) => {
      const from = cum;
      cum += phase.weeks;
      return { name: phase.name, from, to: cum, color: PHASE_COLORS[idx % PHASE_COLORS.length] };
    });
  }, [program]);

  if (loading) {
    return <Skeleton className="h-40 w-full rounded-2xl" />;
  }

  if (!program || program.phases.length === 0) {
    return (
      <div className="border border-dashed border-white/7 rounded-2xl py-10 flex flex-col items-center gap-3">
        <span className="material-symbols-outlined text-3xl text-[#2a2a2a]">monitoring</span>
        <p className="font-mono text-xs text-[#c6c9ab] text-center max-w-xs">
          {onEdit
            ? `${athleteName ? `${athleteName} no tiene` : 'Aún no hay'} una periodización nutricional configurada.`
            // Vista del atleta: no puede configurarla él mismo (onEdit ausente),
            // así que el mensaje aclara que depende del entrenador en vez de
            // dejarle sin ninguna pista de qué hacer.
            : 'Tu entrenador todavía no ha configurado tu periodización nutricional. Cuando lo haga, verás aquí el plan por fases.'}
        </p>
        {onEdit && (
          <button
            onClick={onEdit}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#1c1b1b] border border-[#3a3a3a] hover:border-[#fbcb1a]/40 text-white text-xs font-mono font-bold rounded-xl transition-all"
          >
            <span className="material-symbols-outlined text-sm text-[#fbcb1a]">add</span>
            Crear periodización
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Hero: current phase */}
      {activePhase ? (
        <div className="relative bg-[#181816] border border-white/7 rounded-2xl overflow-hidden p-5 pb-4" style={{ background: `linear-gradient(135deg, ${activePhaseColor}14, transparent 65%), #181816` }}>
          <div className="absolute top-0 left-0 bottom-0 w-1" style={{ background: activePhaseColor }} />
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: activePhaseColor }}>
                Fase actual{activeWeekNum != null ? ` · Semana ${activeWeekNum}/${activePhase.weeks}` : ''}
              </span>
              <h2 className="font-sans font-black text-2xl text-white tracking-tight mt-0.5">{activePhase.name}</h2>
              {activeDiet && (
                <p className="font-mono text-[10px] text-[#c6c9ab] mt-1">Dieta: {activeDiet.name}</p>
              )}
            </div>
            {onEdit && (
              <button
                onClick={onEdit}
                className="flex-shrink-0 text-[10px] font-mono font-bold text-[#c6c9ab] hover:text-white transition-colors uppercase tracking-wider border border-white/7 hover:border-white/20 px-2.5 py-1.5 rounded-lg"
              >Editar</button>
            )}
          </div>

          {(activeResolved?.kcal != null || activeBalance?.dailyDeficit != null) && (
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3.5 font-mono text-xs">
              {activeResolved?.kcal != null && (
                <span className="text-[#c6c9ab]">Objetivo: <b className="text-white">{fmtKcal(activeResolved.kcal)} kcal</b></span>
              )}
              {activeBalance?.dailyDeficit != null && (
                <span className="text-[#c6c9ab]">
                  {activeBalance.dailyDeficit >= 0 ? 'Déficit' : 'Superávit'}:{' '}
                  <b className={activeBalance.dailyDeficit >= 0 ? 'text-[#fdba74]' : 'text-[#86efac]'}>
                    {fmtKcal(Math.abs(activeBalance.dailyDeficit))} kcal/día
                  </b>
                </span>
              )}
              {activeBalance?.weeklyDeltaKg != null && (
                <span className="text-[#c6c9ab]">Δ esperado: <b className="text-white">{fmtKg(activeBalance.weeklyDeltaKg, true)} kg/sem</b></span>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] text-[#c6c9ab] mt-3.5 pt-3 border-t border-white/7">
            <span>Inicio <b className="text-white font-bold">{fmtDate(program.startDate)}</b></span>
            <span className="text-[#3a3a3a]">·</span>
            <span><b className="text-white font-bold">{program.phases.length}</b> fase{program.phases.length !== 1 ? 's' : ''}</span>
            <span className="text-[#3a3a3a]">·</span>
            <span><b className="text-white font-bold">{totalWeeks}</b> semanas totales</span>
          </div>
        </div>
      ) : onEdit && (
        <div className="flex items-center justify-end">
          <button
            onClick={onEdit}
            className="text-[10px] font-mono font-bold text-[#fbcb1a] hover:text-white transition-colors uppercase tracking-wider"
          >Editar periodización</button>
        </div>
      )}

      <div>
        <h2 className="font-sans font-black text-xl tracking-tight text-white uppercase flex items-center gap-2">
          <span className="material-symbols-outlined text-[#fbcb1a]" style={{ fontVariationSettings: "'FILL' 1" }}>monitoring</span>
          Rendimiento de la periodización
        </h2>
        <p className="font-mono text-xs text-[#c6c9ab] mt-1">
          Proyección de peso por tramos, contrastada con la evolución real{athleteName ? ` de ${athleteName}` : ''}.
        </p>
      </div>

      {/* Chart */}
      <div className="bg-[#181816] border border-white/7 rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wider">Peso: proyección vs. real</p>
          <div className="inline-flex bg-[#141413] border border-white/7 rounded-lg p-0.5 gap-0.5">
            {([
              { id: 'both', label: 'Ambas' },
              { id: 'exp', label: 'Esperado 100%' },
              { id: 'adh', label: 'Según adherencia' },
            ] as { id: CurveMode; label: string }[]).map(opt => (
              <button
                key={opt.id}
                onClick={() => setCurveMode(opt.id)}
                aria-pressed={curveMode === opt.id}
                className={`font-mono text-[9px] px-2.5 py-1.5 rounded-md transition-colors ${
                  curveMode === opt.id ? 'bg-[#1e1e1b] text-white shadow-inner' : 'text-[#c6c9ab] hover:text-white'
                }`}
              >{opt.label}</button>
            ))}
          </div>
        </div>

        {chartRows.length > 0 && projection && (
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={chartRows} margin={{ top: 8, right: 16, bottom: 0, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" vertical={false} />
              {phaseBands.map((band, i) => (
                <ReferenceAreaAny key={i} x1={band.from} x2={band.to} strokeOpacity={0} fill={band.color} fillOpacity={0.05} />
              ))}
              <XAxis
                dataKey="week"
                tickFormatter={w => `S${w}`}
                tick={{ fill: '#c6c9ab', fontSize: 9, fontFamily: 'monospace' }}
                axisLine={{ stroke: '#2a2a2a' }}
                tickLine={false}
                minTickGap={28}
              />
              <YAxis
                domain={['auto', 'auto']}
                tick={{ fill: '#c6c9ab', fontSize: 9, fontFamily: 'monospace' }}
                axisLine={false}
                tickLine={false}
                width={36}
                tickFormatter={v => `${v}`}
              />
              <Tooltip content={props => <ProjectionTooltip {...props} />} />
              <ReferenceLine x={projection.currentWeek} stroke="#c6c9ab" strokeDasharray="3 3" strokeOpacity={0.5} label={{ value: 'HOY', position: 'insideTopRight', fill: '#c6c9ab', fontSize: 9, fontFamily: 'monospace' }} />
              {targetWeightKg != null && (
                <ReferenceLine y={targetWeightKg} stroke="#86efac" strokeDasharray="5 4" strokeOpacity={0.5} label={{ value: `Objetivo ${targetWeightKg}kg`, position: 'insideBottomRight', fill: '#86efac', fontSize: 9, fontFamily: 'monospace' }} />
              )}
              {curveMode !== 'adh' && (
                <Line type="monotone" dataKey="expected100" stroke="#00eefc" strokeWidth={2} dot={false} name="Esperado 100%" connectNulls />
              )}
              {curveMode !== 'exp' && (
                <Line type="monotone" dataKey="expectedAdherence" stroke="#a78bfa" strokeWidth={2} strokeDasharray="4 4" dot={false} name="Según adherencia" connectNulls />
              )}
              <Line
                type="monotone" dataKey="real" stroke="#fbcb1a" strokeWidth={2.6} name="Real"
                dot={{ fill: '#fbcb1a', stroke: '#181816', strokeWidth: 2, r: 3 }}
                activeDot={{ fill: '#fbcb1a', stroke: '#181816', strokeWidth: 2, r: 5 }}
                connectNulls
              />
              <Legend
                wrapperStyle={{ fontSize: 10, fontFamily: 'monospace', color: '#c6c9ab', paddingTop: 8 }}
                iconType="plainline"
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}

        {performance?.deviationKg != null && (
          <p className="font-sans text-xs text-[#c6c9ab] leading-relaxed pt-1 border-t border-white/7">
            A semana {performance.currentWeek}, el peso real (<b className="text-white">{fmtKg(performance.realToDate)} kg</b>) va{' '}
            <b className={performance.deviationKg > 0 ? 'text-[#fdba74]' : 'text-[#86efac]'}>{fmtKg(Math.abs(performance.deviationKg))} kg {performance.deviationKg > 0 ? 'por encima' : 'por debajo'}</b>{' '}
            del plan (esperado {fmtKg(performance.expected100ToDate)} kg)
            {performance.achievedPct != null && <> · <b className="text-white">{performance.achievedPct}%</b> del objetivo conseguido</>}.
            {performance.explainedByAdherenceKg != null && performance.explainedByMetabolicKg != null && (
              <> La adherencia explica <b className="text-white">{fmtKg(Math.abs(performance.explainedByAdherenceKg))} kg</b> del desvío; el resto (<b className="text-white">{fmtKg(Math.abs(performance.explainedByMetabolicKg))} kg</b>) es respuesta metabólica.</>
            )}
          </p>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Desvío vs. plan"
          value={performance?.deviationKg != null ? `${fmtKg(performance.deviationKg, true)} kg` : '—'}
          valueColor={performance?.deviationKg == null ? undefined : performance.deviationKg > 0 ? '#fdba74' : '#86efac'}
          sub={performance?.achievedPct != null ? `${performance.achievedPct}% del objetivo` : 'sin datos suficientes'}
        />
        <StatCard
          label="Mantenimiento real"
          value={performance?.realMaintenanceKcal != null ? `${fmtKcal(performance.realMaintenanceKcal)}` : '—'}
          unit="kcal"
          valueColor="#00eefc"
          sub={performance?.maintenanceGapKcal != null
            ? `${performance.maintenanceGapKcal >= 0 ? '+' : ''}${fmtKcal(performance.maintenanceGapKcal)} vs. estimado ${fmtKcal(performance.estimatedMaintenanceKcal)}`
            : 'necesita más semanas de datos'}
        />
        <StatCard
          label="Adherencia · dieta"
          value={dietAdherence.daysLogged > 0 ? `${dietAdherence.avgPct}%` : '—'}
          sub={`${dietAdherence.daysLogged} días · últimos ${dietAdherence.windowDays} d`}
          progressPct={dietAdherence.daysLogged > 0 ? dietAdherence.avgPct : undefined}
          progressColor="#fbcb1a"
        />
        <StatCard
          label="Adherencia · pasos"
          value={stepAdherence.daysLogged > 0 ? `${stepAdherence.avgPct}%` : '—'}
          sub={`${stepAdherence.daysLogged} días · meta ${stepGoal.toLocaleString('es-ES')}`}
          progressPct={stepAdherence.daysLogged > 0 ? stepAdherence.avgPct : undefined}
          progressColor="#fdba74"
        />
      </div>

      {/* Energy balance of the active phase */}
      {activePhase && activeBalance && (
        <div className="bg-[#181816] border border-white/7 rounded-2xl p-5 space-y-3">
          <p className="font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wider">
            Balance energético · tramo activo «{activePhase.name}»
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-2 font-mono text-xs">
            <span className="text-[#c6c9ab]">Objetivo: <b className="text-[#fbcb1a]">{fmtKcal(activeBalance.targetKcal)} kcal</b></span>
            <span className="text-[#c6c9ab]">Mantenimiento: <b className="text-[#00eefc]">{fmtKcal(activeBalance.maintenanceKcal)} kcal</b></span>
            <span className="text-[#c6c9ab]">+ Pasos: <b className="text-white">{fmtKcal(activeBalance.stepsKcal)} kcal</b></span>
            <span className="text-[#c6c9ab]">Gasto total: <b className="text-white">{fmtKcal(activeBalance.totalExpenditure)} kcal</b></span>
            {activeBalance.dailyDeficit != null && (
              <span className="text-[#c6c9ab]">
                {activeBalance.dailyDeficit >= 0 ? 'Déficit' : 'Superávit'}: <b className={activeBalance.dailyDeficit >= 0 ? 'text-[#fdba74]' : 'text-[#86efac]'}>{fmtKcal(Math.abs(activeBalance.dailyDeficit))} kcal/día</b>
              </span>
            )}
            {activeBalance.weeklyDeltaKg != null && (
              <span className="text-[#c6c9ab]">Δ esperado: <b className="text-white">{fmtKg(activeBalance.weeklyDeltaKg, true)} kg/sem</b></span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label, value, unit, sub, valueColor, progressPct, progressColor,
}: {
  label: string; value: string; unit?: string; sub: string;
  valueColor?: string; progressPct?: number; progressColor?: string;
}) {
  return (
    <div className="bg-[#181816] border border-white/7 rounded-2xl p-4 flex flex-col gap-2">
      <span className="font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wider">{label}</span>
      <span className="font-mono font-bold text-xl" style={{ color: valueColor ?? '#fff' }}>
        {value}{unit && <span className="text-xs text-[#c6c9ab] font-medium ml-1">{unit}</span>}
      </span>
      {progressPct != null && (
        <div className="h-1.5 rounded-full bg-[#1e1e1b] overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, progressPct)}%`, backgroundColor: progressColor ?? '#fbcb1a' }} />
        </div>
      )}
      <span className="font-mono text-[9px] text-[#c6c9ab]">{sub}</span>
    </div>
  );
}
