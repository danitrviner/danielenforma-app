import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AthleteCardioProfile, CardioZones, HrTest, CardioSessionType, CardioIntervalBlock } from '../types';
import {
  getAllUserProfiles, getCardioProfile, saveCardioProfile, defaultZonesFromAge,
  getAllPendingHrTests, updateHrTest, createCardioAssignment, createNotificationDeduped,
} from '../dbService';
import { ZONE_ORDER, ZONE_LABEL } from '../utils/cardioZones';
import { grantXp } from '../utils/xp';
import { addRoadmapMilestone } from '../utils/roadmapMilestones';
import Skeleton from './Skeleton';

const XP_PER_APPROVED_TEST = 30;

interface Props {
  coachEmail: string;
}

type Tab = 'zonas' | 'tests' | 'prescripcion';

export default function CardioCoachScreen({ coachEmail }: Props) {
  const [tab, setTab] = useState<Tab>('zonas');
  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'zonas', label: 'Zonas', icon: 'speed' },
    { id: 'tests', label: 'Tests pendientes', icon: 'monitor_heart' },
    { id: 'prescripcion', label: 'Prescripción', icon: 'assignment' },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 pb-4 border-b border-hairline">
        <span className="inline-flex items-center px-2 py-0.5 rounded-control bg-raised text-caption font-sans border border-accent/30 text-accent font-bold uppercase tracking-wider w-fit">
          Consola de Entrenador
        </span>
        <h1 className="font-sans font-black text-display tracking-tight text-white uppercase">Cardio</h1>
      </header>

      <div className="overflow-x-auto -mx-1 px-1 pb-0.5">
        <div className="flex bg-surface border border-hairline p-1 rounded-surface gap-1 w-max sm:w-fit">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-control font-sans text-label font-bold tracking-wider uppercase whitespace-nowrap transition-all ${tab === t.id ? 'bg-accent text-black shadow-lg shadow-accent/10' : 'text-ink-2 hover:text-white'}`}>
              <span className="material-symbols-outlined text-title-s">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'zonas' && <ZonesTab coachEmail={coachEmail} />}
      {tab === 'tests' && <PendingTestsTab coachEmail={coachEmail} />}
      {tab === 'prescripcion' && <PrescriptionTab />}
    </div>
  );
}

// ─── ZONAS POR ATLETA ───────────────────────────────────────────────────────

function ZonesTab({ coachEmail }: { coachEmail: string }) {
  const { data: profiles = [], isPending } = useQuery({ queryKey: ['userProfiles'], queryFn: getAllUserProfiles });
  const [selected, setSelected] = useState<string | null>(null);
  const athletes = profiles.filter(p => p.role === 'client');

  if (isPending) return <Skeleton className="h-40 w-full rounded-surface" />;

  if (selected) {
    return <AthleteZonesEditor athleteEmail={selected} coachEmail={coachEmail} onBack={() => setSelected(null)} />;
  }

  return (
    <section className="bg-surface border border-hairline rounded-surface p-4 sm:p-5 space-y-2">
      <h2 className="font-sans font-bold text-title-s text-white mb-2">Elige un atleta</h2>
      {athletes.map(a => (
        <button key={a.email} onClick={() => setSelected(a.email)} className="w-full flex items-center gap-3 bg-raised border border-hairline rounded-control p-3 hover:border-accent/40 transition-colors">
          <img src={a.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
          <p className="flex-1 min-w-0 font-sans font-semibold text-body-s text-white text-left truncate">{a.displayName}</p>
          <span className="material-symbols-outlined text-ink-2 text-title-s">chevron_right</span>
        </button>
      ))}
    </section>
  );
}

function AthleteZonesEditor({ athleteEmail, coachEmail, onBack }: { athleteEmail: string; coachEmail: string; onBack: () => void }) {
  const queryClient = useQueryClient();
  const { data: profile, isPending } = useQuery({ queryKey: ['cardioProfile', athleteEmail], queryFn: () => getCardioProfile(athleteEmail) });
  const [restingHR, setRestingHR] = useState('60');
  const [maxHR, setMaxHR] = useState('190');
  const [zones, setZones] = useState<CardioZones | null>(null);
  const [saving, setSaving] = useState(false);

  const active = zones ?? profile?.zones ?? defaultZonesFromAge(Number(restingHR) || 60, Number(maxHR) || 190);

  const regenerate = () => setZones(defaultZonesFromAge(Number(restingHR) || 60, Number(maxHR) || 190));

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveCardioProfile({
        athleteId: athleteEmail, restingHR: Number(restingHR) || undefined, maxHR: Number(maxHR) || undefined,
        method: 'hrr', zones: active, updatedAt: new Date().toISOString(), updatedBy: coachEmail,
      });
      queryClient.setQueryData(['cardioProfile', athleteEmail], { athleteId: athleteEmail, zones: active, method: 'hrr', updatedAt: new Date().toISOString(), updatedBy: coachEmail, restingHR: Number(restingHR), maxHR: Number(maxHR) });
    } finally { setSaving(false); }
  };

  if (isPending) return <Skeleton className="h-40 w-full rounded-surface" />;

  return (
    <section className="bg-surface border border-hairline rounded-surface p-4 sm:p-5 space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 text-label font-mono text-ink-2 hover:text-white">
        <span className="material-symbols-outlined text-title-s">arrow_back</span> Atletas
      </button>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-caption font-mono uppercase text-ink-2">FC reposo</label>
          <input type="number" value={restingHR} onChange={e => setRestingHR(e.target.value)} className="w-full bg-bg border border-hairline rounded-control p-2 text-label text-white focus:outline-none focus:border-accent" />
        </div>
        <div className="flex-1">
          <label className="text-caption font-mono uppercase text-ink-2">FCmax</label>
          <input type="number" value={maxHR} onChange={e => setMaxHR(e.target.value)} className="w-full bg-bg border border-hairline rounded-control p-2 text-label text-white focus:outline-none focus:border-accent" />
        </div>
        <button onClick={regenerate} className="self-end px-3 py-2 bg-white/7 text-ink-2 text-caption font-mono uppercase rounded-control hover:text-white">Recalcular</button>
      </div>
      <div className="space-y-2">
        {ZONE_ORDER.map(z => (
          <div key={z} className="flex items-center gap-2">
            <span className="text-label font-mono text-ink-2 w-32 flex-shrink-0">{ZONE_LABEL[z]}</span>
            <input type="number" value={active[z].min} onChange={e => setZones({ ...active, [z]: { ...active[z], min: Number(e.target.value) } })}
              className="w-20 bg-bg border border-hairline rounded-control p-1.5 text-label text-white focus:outline-none focus:border-accent" />
            <span className="text-ink-3">–</span>
            <input type="number" value={active[z].max} onChange={e => setZones({ ...active, [z]: { ...active[z], max: Number(e.target.value) } })}
              className="w-20 bg-bg border border-hairline rounded-control p-1.5 text-label text-white focus:outline-none focus:border-accent" />
          </div>
        ))}
      </div>
      <button onClick={handleSave} disabled={saving} className="w-full py-2.5 bg-accent text-black font-sans font-bold text-label uppercase rounded-control hover:bg-accent-press disabled:opacity-50">
        {saving ? 'Guardando...' : 'Guardar zonas'}
      </button>
    </section>
  );
}

// ─── TESTS PENDIENTES DE APROBACIÓN ─────────────────────────────────────────

function PendingTestsTab({ coachEmail }: { coachEmail: string }) {
  const queryClient = useQueryClient();
  const { data: tests = [], isPending } = useQuery({ queryKey: ['pendingHrTests'], queryFn: getAllPendingHrTests });
  const { data: profiles = [] } = useQuery({ queryKey: ['userProfiles'], queryFn: getAllUserProfiles });

  const approve = async (t: HrTest) => {
    await updateHrTest(t.id, { approvedByCoach: true });
    queryClient.setQueryData<HrTest[]>(['pendingHrTests'], prev => prev?.filter(x => x.id !== t.id));
    // Aplica el resultado a las zonas del atleta si trae LTHR (Friel) o z2Ceiling/restingHR/maxHR (Karvonen).
    const existing = await getCardioProfile(t.athleteId);
    const restingHR = t.result.restingHR ?? existing?.restingHR;
    const maxHR = t.result.maxHR ?? existing?.maxHR;
    if (t.result.lthr) {
      const { zonesFromLthr } = await import('../utils/cardioZones');
      await saveCardioProfile({
        athleteId: t.athleteId, restingHR, maxHR, lthr: t.result.lthr, method: 'lthr',
        zones: zonesFromLthr(t.result.lthr), updatedAt: new Date().toISOString(), updatedBy: coachEmail,
      });
      addRoadmapMilestone(t.athleteId, `milestone_lthr_${t.id}`, `Test de umbral de FC aprobado (LTHR ${t.result.lthr} bpm)`)
        .catch(err => console.warn('addRoadmapMilestone (lthr) failed:', err));
    } else if (restingHR && maxHR) {
      await saveCardioProfile({
        athleteId: t.athleteId, restingHR, maxHR, method: 'hrr',
        zones: defaultZonesFromAge(restingHR, maxHR), updatedAt: new Date().toISOString(), updatedBy: coachEmail,
      });
    }
    const athlete = profiles.find(p => p.email === t.athleteId);
    if (athlete) grantXp(athlete, XP_PER_APPROVED_TEST).catch(err => console.warn('grantXp (hrtest approved) failed:', err));
    createNotificationDeduped(`notif_hrtest_approved_${t.id}`, {
      recipientEmail: t.athleteId, type: 'hrtest_approved', title: 'Zonas de FC actualizadas',
      body: 'Tu entrenador aprobó tu test y actualizó tus zonas de frecuencia cardíaca.',
      link: 'cardio', createdAt: new Date().toISOString(), read: false,
    }).catch(err => console.warn('createNotificationDeduped (hrtest approved) failed:', err));
  };

  if (isPending) return <Skeleton className="h-40 w-full rounded-surface" />;

  return (
    <section className="bg-surface border border-hairline rounded-surface p-4 sm:p-5 space-y-2">
      <h2 className="font-sans font-bold text-title-s text-white mb-2">Tests pendientes de revisión</h2>
      {tests.length === 0 ? (
        <p className="text-label text-ink-3 font-mono py-2">No hay tests pendientes.</p>
      ) : tests.map(t => {
        const athlete = profiles.find(p => p.email === t.athleteId);
        return (
          <div key={t.id} className="bg-raised border border-hairline rounded-surface p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-sans font-semibold text-body-s text-white">{athlete?.displayName ?? t.athleteId}</p>
              <span className="text-caption font-mono text-ink-2">{t.date}</span>
            </div>
            <p className="text-label font-mono text-data">{t.type}</p>
            <p className="text-caption font-mono text-ink-2">
              {t.result.restingHR && `FC reposo: ${t.result.restingHR} `}
              {t.result.maxHR && `FCmax: ${t.result.maxHR} `}
              {t.result.lthr && `LTHR: ${t.result.lthr} `}
              {t.result.z2Ceiling && `Techo Z2: ${t.result.z2Ceiling} `}
              {t.result.decouplingPct !== undefined && `Desacople: ${t.result.decouplingPct}% `}
            </p>
            <button onClick={() => approve(t)} className="w-full py-2 bg-accent text-black font-sans font-bold text-caption uppercase rounded-control hover:bg-accent-press">Aprobar y aplicar a zonas</button>
          </div>
        );
      })}
    </section>
  );
}

// ─── PRESCRIPCIÓN ────────────────────────────────────────────────────────────

const EMPTY_BLOCK = (): CardioIntervalBlock => ({ label: '', durationSec: 30, targetZone: 'z5' });

function PrescriptionTab() {
  const { data: profiles = [], isPending } = useQuery({ queryKey: ['userProfiles'], queryFn: getAllUserProfiles });
  const athletes = profiles.filter(p => p.role === 'client');
  const [athleteEmail, setAthleteEmail] = useState('');
  const [type, setType] = useState<CardioSessionType>('zona2');
  const [durationMin, setDurationMin] = useState('45');
  const [timesPerWeek, setTimesPerWeek] = useState('3');
  const [blocks, setBlocks] = useState<CardioIntervalBlock[]>([EMPTY_BLOCK(), { label: '', durationSec: 30, targetZone: 'z1' }]);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);

  const validBlocks = blocks.filter(b => b.label.trim() && b.durationSec > 0);

  const handleCreate = async () => {
    if (!athleteEmail) return;
    if (type === 'intervalos' && validBlocks.length === 0) return;
    setSaving(true);
    try {
      await createCardioAssignmentSafe();
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 2000);
    } finally { setSaving(false); }
  };

  const createCardioAssignmentSafe = async () => {
    const intervalsDurationSec = validBlocks.reduce((sum, b) => sum + b.durationSec, 0);
    await createCardioAssignment({
      athleteId: athleteEmail, type,
      targetDurationSec: type === 'intervalos' ? intervalsDurationSec : Number(durationMin) * 60,
      targetZone: type === 'zona2' ? 'z2' : undefined,
      intervals: type === 'intervalos' ? validBlocks : undefined,
      timesPerWeek: Number(timesPerWeek),
      active: true, createdAt: new Date().toISOString(),
    });
  };

  const updateBlock = (i: number, patch: Partial<CardioIntervalBlock>) => {
    setBlocks(blocks.map((b, idx) => idx === i ? { ...b, ...patch } : b));
  };

  if (isPending) return <Skeleton className="h-40 w-full rounded-surface" />;

  return (
    <section className="bg-surface border border-hairline rounded-surface p-4 sm:p-5 space-y-3">
      <h2 className="font-sans font-bold text-title-s text-white">Prescribir cardio</h2>
      <select value={athleteEmail} onChange={e => setAthleteEmail(e.target.value)}
        className="w-full bg-bg border border-hairline rounded-control p-2 text-label text-white focus:outline-none focus:border-accent">
        <option value="">Selecciona atleta...</option>
        {athletes.map(a => <option key={a.email} value={a.email}>{a.displayName}</option>)}
      </select>
      <div className="flex gap-2">
        <select value={type} onChange={e => setType(e.target.value as CardioSessionType)}
          className="flex-1 bg-bg border border-hairline rounded-control p-2 text-label text-white focus:outline-none focus:border-accent">
          <option value="zona2">Sesión Zona 2</option>
          <option value="libre">Libre</option>
          <option value="intervalos">Intervalos</option>
        </select>
        {type !== 'intervalos' && (
          <input type="number" value={durationMin} onChange={e => setDurationMin(e.target.value)} placeholder="Min" className="w-20 bg-bg border border-hairline rounded-control p-2 text-label text-white focus:outline-none focus:border-accent" />
        )}
        <input type="number" value={timesPerWeek} onChange={e => setTimesPerWeek(e.target.value)} placeholder="x/sem" className="w-20 bg-bg border border-hairline rounded-control p-2 text-label text-white focus:outline-none focus:border-accent" />
      </div>

      {type === 'intervalos' && (
        <div className="space-y-2 bg-bg border border-hairline rounded-surface p-3">
          <p className="text-caption font-mono uppercase text-ink-2">Bloques (se repiten en orden, uno tras otro)</p>
          {blocks.map((b, i) => (
            <div key={i} className="flex gap-1.5 items-center">
              <input value={b.label} onChange={e => updateBlock(i, { label: e.target.value })} placeholder={`Bloque ${i + 1}`}
                className="flex-1 min-w-0 bg-surface border border-hairline rounded-control p-1.5 text-caption text-white focus:outline-none focus:border-accent" />
              <input type="number" min={5} value={b.durationSec} onChange={e => updateBlock(i, { durationSec: Number(e.target.value) })}
                className="w-14 bg-surface border border-hairline rounded-control p-1.5 text-caption text-white focus:outline-none focus:border-accent" />
              <span className="text-caption text-ink-2 font-mono">s</span>
              <select value={b.targetZone} onChange={e => updateBlock(i, { targetZone: e.target.value as keyof CardioZones })}
                className="bg-surface border border-hairline rounded-control p-1.5 text-caption text-white focus:outline-none focus:border-accent">
                {ZONE_ORDER.map(z => <option key={z} value={z}>{z.toUpperCase()}</option>)}
              </select>
              <button onClick={() => setBlocks(blocks.filter((_, idx) => idx !== i))} className="text-ink-2 hover:text-red-400 transition-colors">
                <span className="material-symbols-outlined text-body-s">close</span>
              </button>
            </div>
          ))}
          <button onClick={() => setBlocks([...blocks, EMPTY_BLOCK()])} className="text-caption font-mono uppercase text-accent hover:text-white transition-colors flex items-center gap-1">
            <span className="material-symbols-outlined text-body-s">add</span> Añadir bloque
          </button>
          {validBlocks.length > 0 && (
            <p className="text-caption font-mono text-ink-2">Total: {Math.round(validBlocks.reduce((s, b) => s + b.durationSec, 0) / 60 * 10) / 10} min · {validBlocks.length} bloques</p>
          )}
        </div>
      )}

      <button onClick={handleCreate} disabled={saving || !athleteEmail || (type === 'intervalos' && validBlocks.length === 0)}
        className="w-full py-2.5 bg-accent text-black font-sans font-bold text-label uppercase rounded-control hover:bg-accent-press disabled:opacity-50">
        {saving ? 'Guardando...' : savedMsg ? 'Prescrito ✓' : 'Prescribir'}
      </button>
    </section>
  );
}
