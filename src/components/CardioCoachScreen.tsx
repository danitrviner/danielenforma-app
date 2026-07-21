import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AthleteCardioProfile, CardioZones, HrTest, CardioSessionType } from '../types';
import {
  getAllUserProfiles, getCardioProfile, saveCardioProfile, defaultZonesFromAge,
  getAllPendingHrTests, updateHrTest, createCardioAssignment, createNotificationDeduped,
} from '../dbService';
import { ZONE_ORDER, ZONE_LABEL } from '../utils/cardioZones';
import { grantXp } from '../utils/xp';
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
      <header className="flex flex-col gap-3 pb-4 border-b border-white/60">
        <span className="inline-flex items-center px-2 py-0.5 rounded bg-[#201f1f] text-[10px] font-sans border border-[#fbcb1a]/30 text-[#fbcb1a] font-bold uppercase tracking-wider w-fit">
          Consola de Entrenador
        </span>
        <h1 className="font-sans font-black text-3xl tracking-tight text-white uppercase">Cardio</h1>
      </header>

      <div className="overflow-x-auto -mx-1 px-1 pb-0.5">
        <div className="flex bg-[#181816] border border-white/7 p-1 rounded-lg gap-1 w-max sm:w-fit">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-md font-sans text-xs font-bold tracking-wider uppercase whitespace-nowrap transition-all ${tab === t.id ? 'bg-[#fbcb1a] text-black shadow-lg shadow-[#fbcb1a]/10' : 'text-[#c6c9ab] hover:text-white'}`}>
              <span className="material-symbols-outlined text-base">{t.icon}</span>
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

  if (isPending) return <Skeleton className="h-40 w-full rounded-2xl" />;

  if (selected) {
    return <AthleteZonesEditor athleteEmail={selected} coachEmail={coachEmail} onBack={() => setSelected(null)} />;
  }

  return (
    <section className="bg-[#181816] border border-white/7 rounded-2xl p-4 sm:p-5 space-y-2">
      <h2 className="font-sans font-bold text-base text-white mb-2">Elige un atleta</h2>
      {athletes.map(a => (
        <button key={a.email} onClick={() => setSelected(a.email)} className="w-full flex items-center gap-3 bg-[#1e1e1e] border border-white/7 rounded-lg p-3 hover:border-[#fbcb1a]/40 transition-colors">
          <img src={a.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
          <p className="flex-1 min-w-0 font-sans font-semibold text-sm text-white text-left truncate">{a.displayName}</p>
          <span className="material-symbols-outlined text-[#c6c9ab] text-base">chevron_right</span>
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

  if (isPending) return <Skeleton className="h-40 w-full rounded-2xl" />;

  return (
    <section className="bg-[#181816] border border-white/7 rounded-2xl p-4 sm:p-5 space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 text-xs font-mono text-[#c6c9ab] hover:text-white">
        <span className="material-symbols-outlined text-base">arrow_back</span> Atletas
      </button>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-[10px] font-mono uppercase text-[#c6c9ab]">FC reposo</label>
          <input type="number" value={restingHR} onChange={e => setRestingHR(e.target.value)} className="w-full bg-[#0e0e0e] border border-white/7 rounded p-2 text-xs text-white focus:outline-none focus:border-[#fbcb1a]" />
        </div>
        <div className="flex-1">
          <label className="text-[10px] font-mono uppercase text-[#c6c9ab]">FCmax</label>
          <input type="number" value={maxHR} onChange={e => setMaxHR(e.target.value)} className="w-full bg-[#0e0e0e] border border-white/7 rounded p-2 text-xs text-white focus:outline-none focus:border-[#fbcb1a]" />
        </div>
        <button onClick={regenerate} className="self-end px-3 py-2 bg-white/7 text-[#c6c9ab] text-[10px] font-mono uppercase rounded hover:text-white">Recalcular</button>
      </div>
      <div className="space-y-2">
        {ZONE_ORDER.map(z => (
          <div key={z} className="flex items-center gap-2">
            <span className="text-xs font-mono text-[#c6c9ab] w-32 flex-shrink-0">{ZONE_LABEL[z]}</span>
            <input type="number" value={active[z].min} onChange={e => setZones({ ...active, [z]: { ...active[z], min: Number(e.target.value) } })}
              className="w-20 bg-[#0e0e0e] border border-white/7 rounded p-1.5 text-xs text-white focus:outline-none focus:border-[#fbcb1a]" />
            <span className="text-[#555]">–</span>
            <input type="number" value={active[z].max} onChange={e => setZones({ ...active, [z]: { ...active[z], max: Number(e.target.value) } })}
              className="w-20 bg-[#0e0e0e] border border-white/7 rounded p-1.5 text-xs text-white focus:outline-none focus:border-[#fbcb1a]" />
          </div>
        ))}
      </div>
      <button onClick={handleSave} disabled={saving} className="w-full py-2.5 bg-[#fbcb1a] text-black font-sans font-bold text-xs uppercase rounded-lg hover:bg-[#d4a800] disabled:opacity-50">
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

  if (isPending) return <Skeleton className="h-40 w-full rounded-2xl" />;

  return (
    <section className="bg-[#181816] border border-white/7 rounded-2xl p-4 sm:p-5 space-y-2">
      <h2 className="font-sans font-bold text-base text-white mb-2">Tests pendientes de revisión</h2>
      {tests.length === 0 ? (
        <p className="text-xs text-[#555] font-mono py-2">No hay tests pendientes.</p>
      ) : tests.map(t => {
        const athlete = profiles.find(p => p.email === t.athleteId);
        return (
          <div key={t.id} className="bg-[#1e1e1e] border border-white/7 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-sans font-semibold text-sm text-white">{athlete?.displayName ?? t.athleteId}</p>
              <span className="text-[10px] font-mono text-[#c6c9ab]">{t.date}</span>
            </div>
            <p className="text-xs font-mono text-[#00eefc]">{t.type}</p>
            <p className="text-[10px] font-mono text-[#c6c9ab]">
              {t.result.restingHR && `FC reposo: ${t.result.restingHR} `}
              {t.result.maxHR && `FCmax: ${t.result.maxHR} `}
              {t.result.lthr && `LTHR: ${t.result.lthr} `}
              {t.result.z2Ceiling && `Techo Z2: ${t.result.z2Ceiling} `}
              {t.result.decouplingPct !== undefined && `Desacople: ${t.result.decouplingPct}% `}
            </p>
            <button onClick={() => approve(t)} className="w-full py-2 bg-[#fbcb1a] text-black font-sans font-bold text-[10px] uppercase rounded hover:bg-[#d4a800]">Aprobar y aplicar a zonas</button>
          </div>
        );
      })}
    </section>
  );
}

// ─── PRESCRIPCIÓN ────────────────────────────────────────────────────────────

function PrescriptionTab() {
  const { data: profiles = [], isPending } = useQuery({ queryKey: ['userProfiles'], queryFn: getAllUserProfiles });
  const athletes = profiles.filter(p => p.role === 'client');
  const [athleteEmail, setAthleteEmail] = useState('');
  const [type, setType] = useState<CardioSessionType>('zona2');
  const [durationMin, setDurationMin] = useState('45');
  const [timesPerWeek, setTimesPerWeek] = useState('3');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);

  const handleCreate = async () => {
    if (!athleteEmail) return;
    setSaving(true);
    try {
      await createCardioAssignmentSafe();
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 2000);
    } finally { setSaving(false); }
  };

  const createCardioAssignmentSafe = async () => {
    await createCardioAssignment({
      athleteId: athleteEmail, type, targetDurationSec: Number(durationMin) * 60,
      targetZone: type === 'zona2' ? 'z2' : undefined, timesPerWeek: Number(timesPerWeek),
      active: true, createdAt: new Date().toISOString(),
    });
  };

  if (isPending) return <Skeleton className="h-40 w-full rounded-2xl" />;

  return (
    <section className="bg-[#181816] border border-white/7 rounded-2xl p-4 sm:p-5 space-y-3">
      <h2 className="font-sans font-bold text-base text-white">Prescribir cardio</h2>
      <select value={athleteEmail} onChange={e => setAthleteEmail(e.target.value)}
        className="w-full bg-[#0e0e0e] border border-white/7 rounded p-2 text-xs text-white focus:outline-none focus:border-[#fbcb1a]">
        <option value="">Selecciona atleta...</option>
        {athletes.map(a => <option key={a.email} value={a.email}>{a.displayName}</option>)}
      </select>
      <div className="flex gap-2">
        <select value={type} onChange={e => setType(e.target.value as CardioSessionType)}
          className="flex-1 bg-[#0e0e0e] border border-white/7 rounded p-2 text-xs text-white focus:outline-none focus:border-[#fbcb1a]">
          <option value="zona2">Sesión Zona 2</option>
          <option value="libre">Libre</option>
        </select>
        <input type="number" value={durationMin} onChange={e => setDurationMin(e.target.value)} placeholder="Min" className="w-20 bg-[#0e0e0e] border border-white/7 rounded p-2 text-xs text-white focus:outline-none focus:border-[#fbcb1a]" />
        <input type="number" value={timesPerWeek} onChange={e => setTimesPerWeek(e.target.value)} placeholder="x/sem" className="w-20 bg-[#0e0e0e] border border-white/7 rounded p-2 text-xs text-white focus:outline-none focus:border-[#fbcb1a]" />
      </div>
      <button onClick={handleCreate} disabled={saving || !athleteEmail} className="w-full py-2.5 bg-[#fbcb1a] text-black font-sans font-bold text-xs uppercase rounded-lg hover:bg-[#d4a800] disabled:opacity-50">
        {saving ? 'Guardando...' : savedMsg ? 'Prescrito ✓' : 'Prescribir'}
      </button>
    </section>
  );
}
