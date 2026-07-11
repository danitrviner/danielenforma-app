import React from 'react';
import { CoachReport, CoachReportSection } from '../types';
import {
  HighlightsSectionData, TonnageSectionData, PerExerciseSectionData, MuscleSectionData,
  BodyweightSectionData, AdherenceSectionData, NutritionSectionData, ChallengesSectionData,
  fmtReportDate,
} from '../utils/reportBuilder';

// Read-only render of a CoachReport, shared by the coach's live preview
// (ReportEditor) and the athlete's viewer (AthleteReportsScreen) so both see
// exactly the same thing. Renders only sections flagged `included`.

function DeltaBadge({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="font-mono text-[10px] text-[#555]">—</span>;
  const up = pct >= 0;
  return (
    <span className={`font-mono text-[10px] font-bold ${up ? 'text-green-400' : 'text-red-400'}`}>
      {up ? '+' : ''}{pct}%
    </span>
  );
}

function SectionShell({ section, children }: { section: CoachReportSection; children: React.ReactNode }) {
  return (
    <div className="bg-[#181816] border border-white/7 rounded-2xl p-4 space-y-3">
      <p className="font-sans font-bold text-sm text-white">{section.title}</p>
      {children}
      {section.coachNote && (
        <div className="bg-[#1e1e1b] border-l-2 border-[#fbcb1a] rounded-r-lg px-3 py-2">
          <p className="font-mono text-[9px] text-[#fbcb1a] uppercase tracking-wider mb-0.5">Nota del entrenador</p>
          <p className="text-xs text-[#c6c9ab] font-sans leading-relaxed">{section.coachNote}</p>
        </div>
      )}
    </div>
  );
}

function HighlightsSection({ section }: { section: CoachReportSection }) {
  const d = section.data as HighlightsSectionData;
  if (!d.items?.length) return null;
  return (
    <SectionShell section={section}>
      <ul className="space-y-1.5">
        {d.items.map((it, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="material-symbols-outlined text-[#fbcb1a] text-base flex-shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>trophy</span>
            <span className="text-xs text-white font-sans leading-snug">{it}</span>
          </li>
        ))}
      </ul>
    </SectionShell>
  );
}

function TonnageSection({ section }: { section: CoachReportSection }) {
  const d = section.data as TonnageSectionData;
  return (
    <SectionShell section={section}>
      <div className="flex items-end gap-3 flex-wrap">
        <span className="font-mono font-black text-3xl text-white">{d.current.toLocaleString('es-ES')}<span className="text-base text-[#c6c9ab] font-bold"> kg</span></span>
        <div className="flex items-center gap-2 pb-1">
          <DeltaBadge pct={d.deltaPct} />
          {d.previous != null && <span className="font-mono text-[10px] text-[#555]">{d.comparisonLabel} ({d.previous.toLocaleString('es-ES')} kg)</span>}
        </div>
      </div>
      <p className="font-mono text-[10px] text-[#c6c9ab]">{d.sessions} {d.sessions === 1 ? 'sesión' : 'sesiones'} en el periodo</p>
    </SectionShell>
  );
}

function PerExerciseSection({ section }: { section: CoachReportSection }) {
  const d = section.data as PerExerciseSectionData;
  if (!d.rows?.length) return null;
  return (
    <SectionShell section={section}>
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-left" style={{ minWidth: 420 }}>
          <thead>
            <tr className="border-b border-white/7">
              {['Ejercicio', 'Series', 'Reps', 'Tonelaje', '1RM est.'].map(h => (
                <th key={h} className="font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wider py-1.5 px-2 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.rows.map(r => (
              <tr key={r.exerciseId} className="border-b border-white/7 last:border-0">
                <td className="py-2 px-2">
                  <span className="text-xs text-white font-sans flex items-center gap-1.5">
                    {r.name}
                    {r.isPR && <span className="font-mono text-[8px] font-bold uppercase bg-[#fbcb1a] text-black px-1 py-0.5 rounded">PR</span>}
                  </span>
                </td>
                <td className="py-2 px-2 font-mono text-xs text-[#c6c9ab]">{r.sets}</td>
                <td className="py-2 px-2 font-mono text-xs text-[#c6c9ab]">{r.reps}</td>
                <td className="py-2 px-2 font-mono text-xs text-[#fbcb1a]">{r.tonnage.toLocaleString('es-ES')} kg</td>
                <td className="py-2 px-2 whitespace-nowrap">
                  <span className="font-mono text-xs text-[#00eefc]">{r.bestOrm} kg</span>
                  {r.deltaOrmPct != null && <span className="ml-1.5"><DeltaBadge pct={r.deltaOrmPct} /></span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionShell>
  );
}

function MuscleSection({ section }: { section: CoachReportSection }) {
  const d = section.data as MuscleSectionData;
  if (!d.rows?.length) return null;
  return (
    <SectionShell section={section}>
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-left" style={{ minWidth: 420 }}>
          <thead>
            <tr className="border-b border-white/7">
              {['Grupo', 'Tonelaje', 'Δ vol.', '1RM medio', 'Δ fuerza'].map(h => (
                <th key={h} className="font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wider py-1.5 px-2 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.rows.map(r => (
              <tr key={r.group} className="border-b border-white/7 last:border-0">
                <td className="py-2 px-2 text-xs text-white font-sans whitespace-nowrap">{r.label}</td>
                <td className="py-2 px-2 font-mono text-xs text-[#fbcb1a]">{r.tonnage.toLocaleString('es-ES')} kg</td>
                <td className="py-2 px-2"><DeltaBadge pct={r.tonnageDeltaPct} /></td>
                <td className="py-2 px-2 font-mono text-xs text-[#00eefc]">{r.meanOrm != null ? `${r.meanOrm} kg` : '—'}</td>
                <td className="py-2 px-2"><DeltaBadge pct={r.ormDeltaPct} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionShell>
  );
}

function BodyweightSection({ section }: { section: CoachReportSection }) {
  const d = section.data as BodyweightSectionData;
  if (d.endWeight == null) return null;
  const dir = d.deltaKg == null ? null : d.deltaKg === 0 ? 'flat' : d.deltaKg > 0 ? 'up' : 'down';
  const good = d.towardsTarget;
  return (
    <SectionShell section={section}>
      <div className="flex items-end gap-3 flex-wrap">
        <span className="font-mono font-black text-3xl text-white">{d.endWeight.toLocaleString('es-ES')}<span className="text-base text-[#c6c9ab] font-bold"> kg</span></span>
        {d.deltaKg != null && (
          <span className={`font-mono text-[10px] font-bold pb-1.5 flex items-center gap-1 ${
            good === true ? 'text-green-400' : good === false ? 'text-amber-300' : 'text-[#c6c9ab]'
          }`}>
            <span className="material-symbols-outlined text-sm">{dir === 'up' ? 'trending_up' : dir === 'down' ? 'trending_down' : 'trending_flat'}</span>
            {d.deltaKg > 0 ? '+' : ''}{d.deltaKg} kg en el periodo
          </span>
        )}
      </div>
      {d.targetWeight != null && (
        <p className="font-mono text-[10px] text-[#c6c9ab]">
          Objetivo: {d.targetWeight} kg
          {good === true && ' · vas en la buena dirección'}
          {good === false && ' · esta semana en dirección contraria — sin drama, vigilamos la tendencia'}
        </p>
      )}
    </SectionShell>
  );
}

function AdherenceSection({ section }: { section: CoachReportSection }) {
  const d = section.data as AdherenceSectionData;
  if (!d.planned) return null;
  const pct = d.pct ?? 0;
  return (
    <SectionShell section={section}>
      <div className="flex items-center gap-3">
        <span className="font-mono font-black text-3xl text-white">{d.completed}<span className="text-base text-[#c6c9ab] font-bold">/{d.planned}</span></span>
        <div className="flex-1">
          <div className="h-2 bg-[#1e1e1b] rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${pct >= 100 ? 'bg-green-400' : pct >= 60 ? 'bg-[#fbcb1a]' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
          <p className="font-mono text-[10px] text-[#c6c9ab] mt-1">
            {pct}% de sesiones programadas completadas{d.prevPct != null ? ` · periodo anterior: ${d.prevPct}%` : ''}
          </p>
        </div>
      </div>
    </SectionShell>
  );
}

function NutritionSection({ section }: { section: CoachReportSection }) {
  const d = section.data as NutritionSectionData;
  if (!d.daysLogged) return null;
  const pct = d.avgPct ?? 0;
  return (
    <SectionShell section={section}>
      <div className="flex items-center gap-3">
        <span className="font-mono font-black text-3xl text-white">{pct}<span className="text-base text-[#c6c9ab] font-bold">%</span></span>
        <div className="flex-1">
          <div className="h-2 bg-[#1e1e1b] rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${pct >= 85 ? 'bg-green-400' : pct >= 60 ? 'bg-[#fbcb1a]' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
          <p className="font-mono text-[10px] text-[#c6c9ab] mt-1">
            Cumplimiento medio de la dieta · {d.daysLogged} de {d.periodDays} días registrados
            {d.prevAvgPct != null ? ` · antes: ${d.prevAvgPct}%` : ''}
          </p>
        </div>
      </div>
    </SectionShell>
  );
}

const CHALLENGE_STYLE: Record<string, { icon: string; cls: string; label: string }> = {
  conseguido: { icon: 'emoji_events', cls: 'text-green-400', label: 'Conseguido' },
  fallido:    { icon: 'close',        cls: 'text-amber-300', label: 'No salió' },
  activo:     { icon: 'timelapse',    cls: 'text-[#00eefc]', label: 'En marcha' },
};

function ChallengesSection({ section }: { section: CoachReportSection }) {
  const d = section.data as ChallengesSectionData;
  if (!d.items?.length) return null;
  return (
    <SectionShell section={section}>
      <ul className="space-y-2">
        {d.items.map((c, i) => {
          const st = CHALLENGE_STYLE[c.status] ?? CHALLENGE_STYLE.activo;
          return (
            <li key={i} className="flex items-center gap-2.5">
              <span className={`material-symbols-outlined text-base flex-shrink-0 ${st.cls}`} style={{ fontVariationSettings: "'FILL' 1" }}>{st.icon}</span>
              <span className="text-xs text-white font-sans flex-1 min-w-0">{c.title}</span>
              <span className={`font-mono text-[10px] font-bold flex-shrink-0 ${st.cls}`}>
                {st.label}{c.progressValue != null ? ` · ${c.progressValue}/${c.target} ${c.unit}` : ''}
              </span>
            </li>
          );
        })}
      </ul>
    </SectionShell>
  );
}

function renderSection(section: CoachReportSection) {
  switch (section.id) {
    case 'highlights':          return <HighlightsSection section={section} />;
    case 'tonnage':             return <TonnageSection section={section} />;
    case 'per-exercise':        return <PerExerciseSection section={section} />;
    case 'muscle-progression':  return <MuscleSection section={section} />;
    case 'bodyweight':          return <BodyweightSection section={section} />;
    case 'adherence':           return <AdherenceSection section={section} />;
    case 'nutrition':           return <NutritionSection section={section} />;
    case 'challenges':          return <ChallengesSection section={section} />;
    default:                    return null;
  }
}

export default function ReportView({ report }: { report: CoachReport }) {
  const included = report.sections.filter(s => s.included);
  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-sans font-bold text-lg text-white">{report.title}</h3>
        <p className="font-mono text-[10px] text-[#c6c9ab] mt-0.5">
          {fmtReportDate(report.periodStart)} – {fmtReportDate(report.periodEnd)}
          {report.sentAt && ` · enviado el ${new Date(report.sentAt).toLocaleDateString('es-ES')}`}
        </p>
      </div>
      {report.intro.trim() && (
        <div className="bg-[#1e1e1b] border border-white/7 rounded-2xl p-4">
          <p className="text-sm text-[#c6c9ab] font-sans leading-relaxed whitespace-pre-wrap">{report.intro}</p>
        </div>
      )}
      {included.map(s => <React.Fragment key={s.id}>{renderSection(s)}</React.Fragment>)}
    </div>
  );
}
