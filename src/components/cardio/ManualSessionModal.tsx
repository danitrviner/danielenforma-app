import React, { useState } from 'react';
import { CardioSession, CardioSessionType } from '../../types';
import { createCardioSession } from '../../dbService';
import { mensajeDeErrorFirestore } from '../../utils/erroresFirestore';
import { Dialog, Button } from '../ui';

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
  const [error, setError] = useState('');

  // `createCardioSession` relanza si Firestore deniega la escritura (ver
  // src/db/escriturasHonestas.test.ts: una sesión que no se guarda no puede
  // darse por guardada). Sin el try/finally, ese caso dejaba el botón en
  // "Guardando..." para siempre y sin decir por qué.
  const handleSave = async () => {
    const minutes = Number(durationMin);
    if (!minutes || minutes <= 0) return;
    setSaving(true);
    setError('');
    try {
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
    } catch (err) {
      console.error('createCardioSession failed:', err);
      setError(mensajeDeErrorFirestore(err, 'guardar la sesión'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Añadir sesión a mano"
      size="s"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || !durationMin} loading={saving} className="flex-1">
            {saving ? 'Guardando...' : 'Guardar'}
          </Button>
        </>
      )}
    >
      <div className="space-y-3">
        <p className="text-caption font-sans text-ink-2">Sin banda de por medio — no suma XP ni puntos.</p>

        {error && <p className="font-sans text-caption text-danger">{error}</p>}

        <div className="flex gap-2">
          <select value={type} onChange={e => setType(e.target.value as CardioSessionType)}
            className="flex-1 bg-bg border border-hairline rounded-control p-3 text-title-s text-white focus:outline-none focus:border-accent">
            <option value="libre">Libre</option>
            <option value="zona2">Zona 2</option>
            <option value="intervalos">Intervalos</option>
          </select>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="flex-1 bg-bg border border-hairline rounded-control p-3 text-title-s text-white focus:outline-none focus:border-accent" />
        </div>

        <div className="flex gap-2">
          <input type="number" min={1} value={durationMin} onChange={e => setDurationMin(e.target.value)} placeholder="Minutos"
            className="flex-1 bg-bg border border-hairline rounded-control p-3 text-title-s text-white focus:outline-none focus:border-accent" />
          <input type="number" min={0} value={avgHR} onChange={e => setAvgHR(e.target.value)} placeholder="FC media (opcional)"
            className="flex-1 bg-bg border border-hairline rounded-control p-3 text-title-s text-white focus:outline-none focus:border-accent" />
        </div>

        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Notas (opcional)"
          className="w-full bg-bg border border-hairline rounded-control p-3 text-title-s text-white focus:outline-none focus:border-accent resize-none" />
      </div>
    </Dialog>
  );
}
