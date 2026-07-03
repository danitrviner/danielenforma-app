import React, { useState, useEffect, useMemo } from 'react';
import { UserProfile, AthleteNutritionConfig } from '../types';
import {
  getAllUserProfiles, getDietsForAthlete, getAthleteDietConfig, getDietCompletionLogsForAthlete,
  getStepsForAthlete, getBodyweightForAthlete, getOnboarding, getAthleteNutritionConfig, saveAthleteNutritionConfig,
} from '../dbService';
import { buildNutritionReport, NutritionReport } from '../utils/nutritionAnalysis';

const DEFAULT_STEP_GOAL = 8000;

export default function NutritionAIDashboard() {
  const [athletes, setAthletes] = useState<UserProfile[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<NutritionReport | null>(null);
  const [nutritionConfig, setNutritionConfig] = useState<AthleteNutritionConfig | null>(null);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    getAllUserProfiles()
      .then(list => setAthletes(list.filter(p => p.role === 'client')))
      .catch(console.error);
  }, []);

  const selectedProfile = useMemo(() => athletes.find(a => a.email === selectedEmail) ?? null, [athletes, selectedEmail]);

  useEffect(() => {
    if (!selectedEmail) { setReport(null); setNutritionConfig(null); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [diets, dietConfig, completionLogs, stepLogs, bodyweightLogs, onboarding, nutConfig] = await Promise.all([
          getDietsForAthlete(selectedEmail),
          getAthleteDietConfig(selectedEmail).catch(() => null),
          getDietCompletionLogsForAthlete(selectedEmail),
          getStepsForAthlete(selectedEmail),
          getBodyweightForAthlete(selectedEmail),
          getOnboarding(selectedEmail).catch(() => null),
          getAthleteNutritionConfig(selectedEmail).catch(() => null),
        ]);
        if (cancelled) return;

        const coachDiets = diets.filter(d => !d.selfManaged);
        const activeId = dietConfig?.activeDietIds?.[0] ?? null;
        const activeDiet = activeId ? coachDiets.find(d => d.id === activeId) ?? null : (coachDiets[0] ?? null);
        const stepGoal = nutConfig?.stepGoal ?? DEFAULT_STEP_GOAL;

        const r = buildNutritionReport({
          completionLogs,
          diets: coachDiets,
          activeDiet,
          stepLogs,
          stepGoal,
          bodyweightLogs,
          targetWeight: selectedProfile?.targetWeight,
          onboarding,
        });

        if (!cancelled) {
          setReport(r);
          setNutritionConfig(nutConfig ?? { athleteId: selectedEmail, enabledModes: ['OMNIVORO'] });
        }
      } catch (err) {
        console.error('NutritionAIDashboard load error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmail]);

  const handleShare = async () => {
    if (!report || !nutritionConfig) return;
    setSharing(true);
    try {
      const next: AthleteNutritionConfig = {
        ...nutritionConfig,
        sharedReportSnapshot: { generatedAt: report.generatedAt, summary: report.summary, flags: report.flags },
      };
      await saveAthleteNutritionConfig(next);
      setNutritionConfig(next);
    } catch (err) {
      console.error(err);
    } finally {
      setSharing(false);
    }
  };

  const handleUnshare = async () => {
    if (!nutritionConfig) return;
    setSharing(true);
    try {
      const next: AthleteNutritionConfig = { ...nutritionConfig, sharedReportSnapshot: undefined };
      await saveAthleteNutritionConfig(next);
      setNutritionConfig(next);
    } catch (err) {
      console.error(err);
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-sans font-bold text-lg text-white">Dashboard nutricional</h2>
        <p className="text-[#c6c9ab] text-sm mt-1">
          Análisis determinístico de adherencia, macros y pasos. Privado por defecto.
        </p>
      </div>

      <select
        value={selectedEmail}
        onChange={e => setSelectedEmail(e.target.value)}
        className="w-full bg-[#181816] border border-white/7 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#fbcb1a]/50"
      >
        <option value="">Selecciona un atleta...</option>
        {athletes.map(a => (
          <option key={a.email} value={a.email}>{a.displayName} ({a.email})</option>
        ))}
      </select>

      {loading && (
        <div className="text-center py-10 font-mono text-sm text-[#c6c9ab] animate-pulse">Analizando...</div>
      )}

      {!loading && report && (
        <div className="space-y-4">
          <div className="bg-[#181816] border border-white/7 rounded-xl p-5">
            <p className="font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wider mb-2">Resumen</p>
            <p className="text-sm text-white font-sans leading-relaxed">{report.summary}</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <MetricCard label="Adherencia" value={`${report.adherence.avgPct}%`} sub={`${report.adherence.daysLogged} días`} />
            <MetricCard label="Pasos" value={`${report.steps.avgPct}%`} sub={`${report.steps.daysLogged} días`} />
            <MetricCard
              label="Peso"
              value={report.weightTrend.latestWeight != null ? `${report.weightTrend.latestWeight}kg` : '—'}
              sub={report.weightTrend.deltaFromFirst != null ? `${report.weightTrend.deltaFromFirst >= 0 ? '+' : ''}${report.weightTrend.deltaFromFirst}kg` : 'sin datos'}
            />
          </div>

          {report.macroDeviation.length > 0 && (
            <div className="bg-[#181816] border border-white/7 rounded-xl p-5">
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

          {report.flags.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-5 space-y-1.5">
              <p className="font-mono text-[9px] text-amber-400 uppercase tracking-wider mb-1">Alertas</p>
              {report.flags.map((f, i) => (
                <p key={i} className="text-xs text-amber-200 font-sans">{f}</p>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between bg-[#181816] border border-white/7 rounded-xl p-4">
            <div>
              <p className="text-xs text-white font-sans font-bold">
                {nutritionConfig?.sharedReportSnapshot ? 'Reporte compartido con el atleta' : 'Reporte privado'}
              </p>
              <p className="text-[10px] text-[#c6c9ab] font-mono mt-0.5">
                {nutritionConfig?.sharedReportSnapshot
                  ? `Compartido el ${new Date(nutritionConfig.sharedReportSnapshot.generatedAt).toLocaleDateString('es-ES')}`
                  : 'El atleta no ve este análisis hasta que lo compartas.'}
              </p>
            </div>
            {nutritionConfig?.sharedReportSnapshot ? (
              <button
                onClick={handleUnshare}
                disabled={sharing}
                className="px-3.5 py-2 bg-[#1c1b1b] border border-white/7 text-[#c6c9ab] font-mono text-[10px] font-bold uppercase rounded-lg hover:border-red-400/40 hover:text-red-400 transition-all disabled:opacity-50"
              >Dejar de compartir</button>
            ) : (
              <button
                onClick={handleShare}
                disabled={sharing}
                className="px-3.5 py-2 bg-[#fbcb1a] text-black font-mono text-[10px] font-bold uppercase rounded-lg hover:bg-[#d4a800] transition-all disabled:opacity-50"
              >Compartir con el atleta</button>
            )}
          </div>
        </div>
      )}

      {!loading && selectedEmail && !report && (
        <div className="text-center py-10 font-mono text-xs text-[#c6c9ab] italic">Sin datos suficientes para este atleta.</div>
      )}
    </div>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-[#181816] border border-white/7 rounded-xl p-4 text-center">
      <span className="block font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wider">{label}</span>
      <span className="block font-sans font-bold text-lg text-white mt-1">{value}</span>
      <span className="block font-mono text-[9px] text-[#c6c9ab] mt-0.5">{sub}</span>
    </div>
  );
}
