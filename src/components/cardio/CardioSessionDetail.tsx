import React, { useState } from 'react';
import { CardioSession, CardioZones } from '../../types';
import { updateCardioSession } from '../../dbService';
import { compare30DayAverage } from '../../utils/cardioHistory';
import ZoneBars from './ZoneBars';
import HrChart from './HrChart';

// Detalle y edición post-entreno (§6 del análisis): título/notas/etiquetas
// editables, el `type` no. Comparativa vs los últimos 30 días como en el
// informe de FITIV (§4bis.4 bloque 4).

const SESSION_TYPE_LABEL: Record<string, string> = { libre: 'Libre', zona2: 'Sesión Zona 2', intervalos: 'Intervalos' };

function fmtDuration(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
}

function pctDelta(value: number | undefined, avg: number | undefined): string | null {
  if (value === undefined || avg === undefined || avg === 0) return null;
  const pct = Math.round(((value - avg) / avg) * 100);
  if (pct === 0) return '=';
  return pct > 0 ? `+${pct}%` : `${pct}%`;
}

interface Props {
  session: CardioSession;
  allSessions: CardioSession[];
  zones?: CardioZones;
  onClose: () => void;
  onSaved: (updated: CardioSession) => void;
}

export default function CardioSessionDetail({ session, allSessions, zones, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(session.title ?? '');
  const [notes, setNotes] = useState(session.notes ?? '');
  const [tags, setTags] = useState<string[]>(session.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);

  const comparison = compare30DayAverage(session, allSessions);
  const chartData = session.samples.map((v, i) => ({ t: i * session.sampleIntervalSec, bpm: v }));

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput('');
  };

  const handleSave = async () => {
    setSaving(true);
    const updates = { title: title || undefined, notes: notes || undefined, tags: tags.length ? tags : undefined };
    await updateCardioSession(session.id, updates);
    onSaved({ ...session, ...updates });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-[90] bg-[#0e0e0e] overflow-y-auto">
      <div className="max-w-lg mx-auto p-4 sm:p-6 space-y-5">
        <div className="flex items-center justify-between">
          <button onClick={onClose} className="text-ink-2 hover:text-white transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
          <p className="text-[10px] font-mono uppercase text-ink-2">{session.date} · {SESSION_TYPE_LABEL[session.type] ?? session.type}</p>
          <div className="w-6" />
        </div>

        <input
          value={title} onChange={e => setTitle(e.target.value)} placeholder={SESSION_TYPE_LABEL[session.type] ?? 'Título'}
          className="w-full bg-transparent font-sans font-black text-2xl text-white placeholder:text-white/30 focus:outline-none border-b border-white/10 pb-2"
        />

        {comparison.count > 0 && (
          <div className="bg-[#181816] border border-white/7 rounded-xl p-3">
            <p className="text-[9px] font-mono uppercase text-ink-2 mb-2">VS. promedio de los últimos 30 días ({comparison.count} entrenos)</p>
            <div className="flex gap-4 text-xs font-mono">
              {pctDelta(session.durationSec, comparison.durationSec) && (
                <span className="text-white">Duración {pctDelta(session.durationSec, comparison.durationSec)}</span>
              )}
              {pctDelta(session.avgHR, comparison.avgHR) && (
                <span className="text-white">FC media {pctDelta(session.avgHR, comparison.avgHR)}</span>
              )}
              {pctDelta(session.caloriesActiveKcal ?? session.caloriesKcal, comparison.caloriesKcal) && (
                <span className="text-white">Calorías {pctDelta(session.caloriesActiveKcal ?? session.caloriesKcal, comparison.caloriesKcal)}</span>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <Metric label="Duración" value={fmtDuration(session.durationSec)} />
          <Metric label="FC media" value={session.avgHR ? `${session.avgHR}` : '—'} />
          <Metric label="FC máx" value={session.maxHR ? `${session.maxHR}` : '—'} />
          <Metric label="Calorías" value={session.caloriesActiveKcal ?? session.caloriesKcal ? `${Math.round(session.caloriesActiveKcal ?? session.caloriesKcal!)}` : '—'} />
          <Metric label="METs" value={session.mets ? session.mets.toFixed(1) : '—'} />
          <Metric label="Puntos" value={session.fitivPoints !== undefined ? `${session.fitivPoints}` : '—'} />
          <Metric label="TRIMP" value={session.trimp !== undefined ? `${Math.round(session.trimp)}` : '—'} />
          <Metric label="TSS" value={session.hrTss !== undefined ? session.hrTss.toFixed(1) : '—'} />
          <Metric label="Esfuerzo" value={session.perceivedEffort !== undefined ? `${session.perceivedEffort}/10` : '—'} />
          {session.hrr1Min !== undefined && <Metric label="HRR 1'" value={`${session.hrr1Min}`} />}
          {session.hrr2Min !== undefined && <Metric label="HRR 2'" value={`${session.hrr2Min}`} />}
        </div>

        {chartData.length > 1 && zones && (
          <div className="bg-[#181816] border border-white/7 rounded-2xl p-3">
            <HrChart data={chartData} zones={zones} />
          </div>
        )}

        {zones && (
          <div className="bg-[#181816] border border-white/7 rounded-2xl p-3">
            <ZoneBars timeInZone={session.timeInZoneSec} belowZoneSec={0} elapsedSec={session.durationSec} />
          </div>
        )}

        <div className="space-y-2">
          <p className="text-[10px] font-mono uppercase text-ink-2">Etiquetas</p>
          <div className="flex flex-wrap gap-1.5">
            {tags.map(t => (
              <span key={t} className="flex items-center gap-1 bg-[#181816] border border-white/10 rounded-full px-2.5 py-1 text-[10px] font-mono text-white">
                {t}
                <button onClick={() => setTags(tags.filter(x => x !== t))} className="text-ink-2 hover:text-white">×</button>
              </span>
            ))}
            <input
              value={tagInput} onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }}
              placeholder="+ etiqueta" className="bg-transparent text-[10px] font-mono text-white placeholder:text-ink-2 focus:outline-none w-20"
            />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-[10px] font-mono uppercase text-ink-2">Notas</p>
          <textarea
            value={notes} onChange={e => setNotes(e.target.value)} rows={3}
            className="w-full bg-[#181816] border border-white/7 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-accent resize-none"
            placeholder="¿Cómo te sentiste?"
          />
        </div>

        <button onClick={handleSave} disabled={saving}
          className="w-full py-3 bg-accent text-black font-sans font-bold text-xs uppercase rounded-lg hover:bg-[#d4a800] active:scale-95 transition-all disabled:opacity-50">
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#181816] border border-white/7 rounded-xl p-2.5 text-center">
      <p className="text-[8px] font-mono uppercase text-ink-2">{label}</p>
      <p className="text-sm font-sans font-bold text-white mt-0.5">{value}</p>
    </div>
  );
}
