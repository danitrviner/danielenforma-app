import React from 'react';
import { CoachReport, CoachReportSection } from '../types';
import {
  HighlightsSectionData, TonnageSectionData, PerExerciseSectionData, MuscleSectionData, fmtReportDate,
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
      <p className="font-mono text-[10px] text-[#c6c9ab]">{d.sessions} sesión{d.sessions !== 1 ? 'es' : ''} en el periodo</p>
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

function renderSection(section: CoachReportSection) {
  switch (section.id) {
    case 'highlights':          return <HighlightsSection section={section} />;
    case 'tonnage':             return <TonnageSection section={section} />;
    case 'per-exercise':        return <PerExerciseSection section={section} />;
    case 'muscle-progression':  return <MuscleSection section={section} />;
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
