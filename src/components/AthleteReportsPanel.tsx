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
    <section className="bg-surface border border-hairline rounded-surface p-4 sm:p-5">
      <h2 className="font-sans font-bold text-title-s text-white mb-3 pb-2 border-b border-hairline flex items-center gap-2">
        <span className="material-symbols-outlined text-accent" style={{ fontVariationSettings: "'FILL' 1" }}>analytics</span>
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
              className={`w-full flex items-center justify-between gap-3 rounded-control p-3 text-left transition-all border ${
                i === 0 ? 'bg-raised border-accent/30 hover:border-accent/60' : 'bg-raised border-hairline hover:border-accent/40'
              }`}
            >
              <div className="min-w-0">
                <p className="font-sans text-body-s text-white truncate flex items-center gap-2">
                  {r.title}
                  {i === 0 && <span className="font-sans text-caption font-bold uppercase bg-accent text-black px-1.5 py-0.5 rounded-control flex-shrink-0">Nuevo</span>}
                </p>
                <p className="font-mono text-caption text-ink-2 mt-0.5">
                  {fmtReportDate(r.periodStart)}–{fmtReportDate(r.periodEnd)}
                  {r.sentAt && ` · ${new Date(r.sentAt).toLocaleDateString('es-ES')}`}
                </p>
              </div>
              <span className="material-symbols-outlined text-ink-2 flex-shrink-0">chevron_right</span>
            </button>
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 overflow-y-auto">
          <div className="min-h-full flex items-start justify-center sm:p-4">
            <div className="bg-bg border border-hairline sm:rounded-surface w-full sm:max-w-2xl shadow-2xl">
              <div className="sticky top-0 z-10 bg-bg border-b border-hairline px-4 sm:px-6 py-4 flex items-center justify-between">
                <p className="font-mono text-caption text-ink-2 uppercase tracking-wider">Reporte</p>
                <button onClick={() => setOpen(null)} className="text-white bg-raised hover:bg-raised p-1.5 h-9 w-9 rounded-full flex items-center justify-center transition-colors">
                  <span className="material-symbols-outlined text-title-s">close</span>
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
