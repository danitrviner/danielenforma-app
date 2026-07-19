import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CoachReport } from '../types';
import { getSentReportsForAthlete } from '../dbService';
import { fmtReportDate } from '../utils/reportBuilder';
import ReportView from './ReportView';
import Skeleton from './Skeleton';

// Athlete-facing, self-loading card on the Home screen: shows the reports the
// coach has sent (persistent history, newest first). Tapping one opens the same
// read-only ReportView the coach previewed.
export default function AthleteReportsPanel({ athleteEmail }: { athleteEmail: string }) {
  const { data: reports = [], isPending: loading } = useQuery({
    queryKey: ['sentReportsForAthlete', athleteEmail],
    queryFn: () => getSentReportsForAthlete(athleteEmail),
  });
  const [open, setOpen] = useState<CoachReport | null>(null);

  // Hide the card entirely until there is at least one report (avoids empty noise on Home).
  if (!loading && reports.length === 0) return null;

  return (
    <section className="bg-[#181816] border border-white/7 rounded-2xl p-4 sm:p-5">
      <h2 className="font-sans font-bold text-base text-white mb-3 pb-2 border-b border-white/7 flex items-center gap-2">
        <span className="material-symbols-outlined text-[#fbcb1a]" style={{ fontVariationSettings: "'FILL' 1" }}>analytics</span>
        Reportes de tu entrenador
      </h2>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : (
        <div className="space-y-2">
          {reports.map((r, i) => (
            <button
              key={r.id}
              onClick={() => setOpen(r)}
              className={`w-full flex items-center justify-between gap-3 rounded-lg p-3 text-left transition-all border ${
                i === 0 ? 'bg-[#1e1e1b] border-[#fbcb1a]/30 hover:border-[#fbcb1a]/60' : 'bg-[#1e1e1e] border-white/7 hover:border-[#fbcb1a]/40'
              }`}
            >
              <div className="min-w-0">
                <p className="font-sans text-sm text-white truncate flex items-center gap-2">
                  {r.title}
                  {i === 0 && <span className="font-sans text-[8px] font-bold uppercase bg-[#fbcb1a] text-black px-1.5 py-0.5 rounded flex-shrink-0">Nuevo</span>}
                </p>
                <p className="font-mono text-[10px] text-[#c6c9ab] mt-0.5">
                  {fmtReportDate(r.periodStart)}–{fmtReportDate(r.periodEnd)}
                  {r.sentAt && ` · ${new Date(r.sentAt).toLocaleDateString('es-ES')}`}
                </p>
              </div>
              <span className="material-symbols-outlined text-[#c6c9ab] flex-shrink-0">chevron_right</span>
            </button>
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 overflow-y-auto">
          <div className="min-h-full flex items-start justify-center sm:p-4">
            <div className="bg-[#111110] border border-white/7 sm:rounded-2xl w-full sm:max-w-2xl shadow-2xl">
              <div className="sticky top-0 z-10 bg-[#111110] border-b border-white/7 px-4 sm:px-6 py-4 flex items-center justify-between">
                <p className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider">Reporte</p>
                <button onClick={() => setOpen(null)} className="text-white bg-[#2a2a2a] hover:bg-[#3e3e3e] p-1.5 h-9 w-9 rounded-full flex items-center justify-center transition-colors">
                  <span className="material-symbols-outlined text-base">close</span>
                </button>
              </div>
              <div className="p-4 sm:p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
                <ReportView report={open} />
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
