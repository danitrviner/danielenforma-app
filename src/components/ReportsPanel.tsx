import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CoachReport, WorkoutLog, Exercise, Mesocycle,
  WorkoutAssignment, BodyweightLog,
} from '../types';
import {
  getMesocycles, getCoachReportsForAthlete, saveCoachReport, deleteCoachReport, createNotificationDeduped,
  getDietCompletionLogsForAthlete, getDietsForAthlete, getWeeklyChallengesForAthlete,
} from '../dbService';
import { buildTrainingReportDraft, buildReportText, fmtReportDate, ReportExtrasInput } from '../utils/reportBuilder';
import { addDays } from '../utils/trainingWeek';
import ReportEditor from './ReportEditor';
import Skeleton from './Skeleton';

interface Props {
  athleteEmail: string;
  athleteName: string;
  coachId: string;
  logs: WorkoutLog[];
  exercises: Exercise[];
  assignments: WorkoutAssignment[];
  bodyweightLogs: BodyweightLog[];
  targetWeight?: number;
}

type PeriodMode = '7d' | '14d' | 'meso';

const PERIOD_DAYS: Record<'7d' | '14d', number> = { '7d': 7, '14d': 14 };
const COMPARE_WEEK_OPTIONS = [1, 2, 4, 8];

function today(): string { return new Date().toISOString().split('T')[0]; }

export default function ReportsPanel({ athleteEmail, athleteName, coachId, logs, exercises, assignments, bodyweightLogs, targetWeight }: Props) {
  const queryClient = useQueryClient();
  const reportsQueryKey = ['coachReportsForAthlete', athleteEmail] as const;
  const { data: reports = [], isPending: loading } = useQuery({
    queryKey: reportsQueryKey,
    queryFn: () => getCoachReportsForAthlete(athleteEmail),
  });
  const { data: mesocycles = [] } = useQuery({
    queryKey: ['mesocycles', athleteEmail],
    queryFn: () => getMesocycles(athleteEmail),
  });
  // Datos para las secciones extra del reporte (nutrición y retos); si fallan,
  // el reporte simplemente sale sin esas secciones.
  const { data: dietLogs = [] } = useQuery({
    queryKey: ['dietCompletionLogsForAthlete', athleteEmail],
    queryFn: () => getDietCompletionLogsForAthlete(athleteEmail),
  });
  const { data: diets = [] } = useQuery({
    queryKey: ['dietsForAthlete', athleteEmail],
    queryFn: () => getDietsForAthlete(athleteEmail),
  });
  const { data: challenges = [] } = useQuery({
    queryKey: ['weeklyChallengesForAthlete', athleteEmail],
    queryFn: () => getWeeklyChallengesForAthlete(athleteEmail),
  });
  const [editing, setEditing] = useState<CoachReport | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (r: CoachReport) => {
    await navigator.clipboard.writeText(buildReportText(r));
    setCopiedId(r.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const [periodMode, setPeriodMode] = useState<PeriodMode>('7d');
  const [compareWeeks, setCompareWeeks] = useState(1);

  // The comparison window must span at least as many days as the report period,
  // or it overlaps the current period and double-counts logs in both totals.
  const minCompareWeeks = periodMode === 'meso' ? 1 : Math.ceil(PERIOD_DAYS[periodMode] / 7);
  const compareWeekOptions = COMPARE_WEEK_OPTIONS.filter(w => w >= minCompareWeeks);

  useEffect(() => {
    if (compareWeeks < minCompareWeeks) setCompareWeeks(minCompareWeeks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minCompareWeeks]);

  // Re-fetches the reports list from the server after a save/send/delete —
  // matches the old refresh()'s behavior of always trusting the server copy
  // rather than optimistically patching local state.
  const refresh = () => queryClient.invalidateQueries({ queryKey: reportsQueryKey });

  // Current + previous mesocycle by startDate (most recent that has started; the one before it).
  const mesoPair = useMemo(() => {
    const started = [...mesocycles].filter(m => m.startDate <= today()).sort((a, b) => b.startDate.localeCompare(a.startDate));
    return { current: started[0] ?? null, previous: started[1] ?? null };
  }, [mesocycles]);

  const canMeso = mesoPair.current != null;

  const handleGenerate = () => {
    const extras: ReportExtrasInput = {
      athleteName, assignments, bodyweightLogs, dietLogs, diets, challenges, targetWeight,
    };
    if (periodMode === 'meso') {
      // Guarded by `canMeso` disabling the option, but mesocycles can change
      // between render and click — bail rather than silently generate a
      // same-day, effectively empty report.
      if (!mesoPair.current) return;
      const draft = buildTrainingReportDraft({
        athleteEmail, coachId, logs, exercises, mesocycles,
        periodStart: today(), periodEnd: today(),
        comparison: { mode: 'mesocycle', currentId: mesoPair.current.id, previousId: mesoPair.previous?.id ?? null },
        extras,
      });
      setEditing(draft);
      return;
    }

    const periodStart = addDays(today(), -(PERIOD_DAYS[periodMode] - 1));
    const draft = buildTrainingReportDraft({
      athleteEmail, coachId, logs, exercises, mesocycles,
      periodStart, periodEnd: today(),
      comparison: { mode: 'weeks', n: compareWeeks },
      extras,
    });
    setEditing(draft);
  };

  const handleSaveDraft = async (r: CoachReport) => {
    const next: CoachReport = { ...r, updatedAt: new Date().toISOString() };
    await saveCoachReport(next);
    setEditing(null);
    refresh();
  };

  const handleSend = async (r: CoachReport) => {
    const now = new Date().toISOString();
    const next: CoachReport = { ...r, status: 'sent', sentAt: now, updatedAt: now };
    await saveCoachReport(next);
    // Stable key (no timestamp) so createNotificationDeduped's own dedup guarantee
    // actually holds — a wall-clock-suffixed key would defeat it on any retry/race.
    await createNotificationDeduped(`notif_report_${r.id}`, {
      recipientEmail: r.athleteId,
      type: 'report_sent',
      title: 'Nuevo reporte de tu entrenador',
      body: r.title,
      link: 'home',
      createdAt: now,
      read: false,
    }).catch(console.error);
    setEditing(null);
    refresh();
  };

  const handleDelete = async (r: CoachReport) => {
    await deleteCoachReport(r.id);
    setEditing(null);
    refresh();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-sans font-black text-xl tracking-tight text-white uppercase flex items-center gap-2">
          <span className="material-symbols-outlined text-[#fbcb1a]" style={{ fontVariationSettings: "'FILL' 1" }}>analytics</span>
          Reportes
        </h2>
        <p className="font-mono text-xs text-[#c6c9ab] mt-1">Genera un reporte de desempeño, revísalo y envíalo a {athleteName}.</p>
      </div>

      {/* Generator */}
      <div className="bg-[#181816] border border-white/7 rounded-2xl p-4 space-y-3">
        <p className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider">Nuevo reporte</p>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wider mb-1">Periodo</label>
            <select
              value={periodMode}
              onChange={e => setPeriodMode(e.target.value as PeriodMode)}
              className="bg-[#1e1e1b] border border-white/7 text-white text-xs font-mono rounded-lg px-2.5 py-2 focus:outline-none focus:border-[#fbcb1a]/50 cursor-pointer"
            >
              <option value="7d">Últimos 7 días</option>
              <option value="14d">Últimos 14 días</option>
              <option value="meso" disabled={!canMeso}>Este macrociclo{!canMeso ? ' (sin datos)' : ''}</option>
            </select>
          </div>
          {periodMode !== 'meso' && (
            <div>
              <label className="block font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wider mb-1">Comparar con</label>
              <select
                value={compareWeeks}
                onChange={e => setCompareWeeks(Number(e.target.value))}
                className="bg-[#1e1e1b] border border-white/7 text-white text-xs font-mono rounded-lg px-2.5 py-2 focus:outline-none focus:border-[#fbcb1a]/50 cursor-pointer"
              >
                {compareWeekOptions.map(w => (
                  <option key={w} value={w}>{w === 1 ? 'La semana anterior' : `${w} semanas antes`}</option>
                ))}
              </select>
            </div>
          )}
          {periodMode === 'meso' && (
            <p className="font-mono text-[10px] text-[#c6c9ab] pb-2">
              {mesoPair.previous ? `vs Macrociclo ${mesoPair.previous.number}` : 'sin macrociclo previo para comparar'}
            </p>
          )}
          <button
            onClick={handleGenerate}
            className="px-4 py-2 bg-[#fbcb1a] text-black font-sans text-xs font-bold uppercase rounded-lg hover:bg-[#d4a800] active:scale-95 transition-all flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-base">auto_awesome</span>
            Generar
          </button>
        </div>
      </div>

      {/* History */}
      <div className="space-y-3">
        <p className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider">Historial</p>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : reports.length === 0 ? (
          <div className="py-10 text-center border border-dashed border-white/7 rounded-2xl">
            <span className="material-symbols-outlined text-4xl text-[#2a2a2a] block mb-2">description</span>
            <p className="font-mono text-xs text-[#c6c9ab]">Aún no hay reportes para este atleta.</p>
          </div>
        ) : (
          reports.map(r => (
            <div
              key={r.id}
              className="w-full flex items-center gap-3 bg-[#181816] border border-white/7 rounded-xl p-3.5 hover:border-[#fbcb1a]/40 transition-all"
            >
              <button onClick={() => setEditing(r)} className="flex-1 min-w-0 flex items-center gap-3 text-left">
                <div className="min-w-0">
                  <p className="text-sm text-white font-sans font-bold truncate">{r.title}</p>
                  <p className="font-mono text-[10px] text-[#c6c9ab] mt-0.5">
                    {fmtReportDate(r.periodStart)}–{fmtReportDate(r.periodEnd)} · {r.sections.filter(s => s.included).length} secciones
                  </p>
                </div>
              </button>
              <span className={`flex-shrink-0 font-sans text-[9px] font-bold uppercase px-2 py-1 rounded-full ${
                r.status === 'sent' ? 'bg-green-500/15 text-green-400' : 'bg-[#1e1e1b] text-[#c6c9ab] border border-white/7'
              }`}>
                {r.status === 'sent' ? 'Enviado' : 'Borrador'}
              </span>
              <button
                onClick={() => handleCopy(r)}
                title="Copiar texto del reporte"
                className="flex-shrink-0 p-1.5 text-[#c6c9ab] hover:text-[#00eefc] transition-colors"
              >
                <span className="material-symbols-outlined text-base">{copiedId === r.id ? 'check' : 'content_copy'}</span>
              </button>
              <button
                onClick={() => handleSend(r)}
                title={r.status === 'sent' ? 'Reenviar al atleta' : 'Enviar al atleta'}
                className="flex-shrink-0 p-1.5 text-[#c6c9ab] hover:text-[#fbcb1a] transition-colors"
              >
                <span className="material-symbols-outlined text-base">send</span>
              </button>
            </div>
          ))
        )}
      </div>

      {editing && (
        <ReportEditor
          initial={editing}
          onSaveDraft={handleSaveDraft}
          onSend={handleSend}
          onDelete={handleDelete}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
