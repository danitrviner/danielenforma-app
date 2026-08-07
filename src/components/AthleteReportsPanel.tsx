import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CoachReport } from '../types';
import { getSentReportsForAthlete } from '../dbService';
import { fmtReportDate } from '../utils/reportBuilder';
import ReportView from './ReportView';
import { Skeleton } from './ui';
import { Icon, ListRow, Badge, Dialog } from './ui';

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
        <Icon name="analytics" size="l" filled className="text-accent" />
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
            <ListRow
              key={r.id}
              onClick={() => setOpen(r)}
              className={`rounded-control border ${i === 0 ? 'bg-raised border-accent/30' : 'bg-raised border-hairline'}`}
              title={r.title}
              subtitle={`${fmtReportDate(r.periodStart)}–${fmtReportDate(r.periodEnd)}${r.sentAt ? ` · ${new Date(r.sentAt).toLocaleDateString('es-ES')}` : ''}`}
              trailing={
                <div className="flex items-center gap-2 flex-shrink-0">
                  {i === 0 && <Badge tone="neutral">Nuevo</Badge>}
                  <Icon name="chevron_right" size="m" className="text-ink-2" />
                </div>
              }
            />
          ))}
        </div>
      )}

      {open && (
        <Dialog open onClose={() => setOpen(null)} title="Reporte" size="xl">
          <ReportView report={open} />
        </Dialog>
      )}
    </section>
  );
}
