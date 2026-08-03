import React, { useState } from 'react';
import { CardioSession, CardioSessionType } from '../../types';
import { createCardioSession } from '../../dbService';

// Alta manual (§6 del análisis): tipo, duración, FC media opcional, notas.
// Sin banda real de por medio, así que NUNCA otorga XP ni Puntos FITIV —
// regla explícita de FITIV, replicada aquí (§5.5: "los entrenos añadidos a
// mano no puntúan").

interface Props {
  athleteId: string;
  onClose: () => void;
  onSaved: (session: CardioSession) => void;
}

export default function ManualSessionModal({ athleteId, onClose, onSaved }: Props) {
  const [type, setType] = useState<CardioSessionType>('libre');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [durationMin, setDurationMin] = useState('30');
  const [avgHR, setAvgHR] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const minutes = Number(durationMin);
    if (!minutes || minutes <= 0) return;
    setSaving(true);
    const session = await createCardioSession({
      athleteId, type, date,
      startedAt: `${date}T12:00:00.000Z`,
      durationSec: Math.round(minutes * 60),
      avgHR: avgHR ? Number(avgHR) : undefined,
      timeInZoneSec: { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 },
      samples: [],
      sampleIntervalSec: 4,
      manual: true,
      notes: notes || undefined,
    });
    onSaved(session);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-[90] bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-surface border border-hairline rounded-surface p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <h3 className="font-sans font-bold text-base text-white">Añadir sesión a mano</h3>
        <p className="text-[10px] font-mono text-ink-2">Sin banda de por medio — no suma XP ni puntos.</p>

        <div className="flex gap-2">
          <select value={type} onChange={e => setType(e.target.value as CardioSessionType)}
            className="flex-1 bg-bg border border-hairline rounded-control p-2.5 text-xs text-white focus:outline-none focus:border-accent">
            <option value="libre">Libre</option>
            <option value="zona2">Zona 2</option>
            <option value="intervalos">Intervalos</option>
          </select>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="flex-1 bg-bg border border-hairline rounded-control p-2.5 text-xs text-white focus:outline-none focus:border-accent" />
        </div>

        <div className="flex gap-2">
          <input type="number" min={1} value={durationMin} onChange={e => setDurationMin(e.target.value)} placeholder="Minutos"
            className="flex-1 bg-bg border border-hairline rounded-control p-2.5 text-xs text-white focus:outline-none focus:border-accent" />
          <input type="number" min={0} value={avgHR} onChange={e => setAvgHR(e.target.value)} placeholder="FC media (opcional)"
            className="flex-1 bg-bg border border-hairline rounded-control p-2.5 text-xs text-white focus:outline-none focus:border-accent" />
        </div>

        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Notas (opcional)"
          className="w-full bg-bg border border-hairline rounded-control p-3 text-xs text-white focus:outline-none focus:border-accent resize-none" />

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2.5 border border-hairline text-ink-2 font-sans font-bold text-xs uppercase rounded-control hover:text-white transition-all">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving || !durationMin}
            className="flex-1 py-2.5 bg-accent text-black font-sans font-bold text-xs uppercase rounded-control hover:bg-accent-press active:scale-95 transition-all disabled:opacity-50">
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
