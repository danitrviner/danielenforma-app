import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AthleteCardioProfile, CardioZones, HrTest } from '../types';
import {
  getAllUserProfiles, getCardioProfile, saveCardioProfile, defaultZonesFromAge,
  getAllPendingHrTests, updateHrTest, createNotificationDeduped,
} from '../dbService';
import { ZONE_ORDER, ZONE_LABEL } from '../utils/cardioZones';
import { grantXp } from '../utils/xp';
import { addRoadmapMilestone } from '../utils/roadmapMilestones';
import { Avatar, Skeleton } from './ui';
import { atletasActivos } from '../utils/atletas';
import { Button, Tabs, ListRow } from './ui';
import CardioPrescriptionForm from './cardio/CardioPrescriptionForm';

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
      {/* Sin cabecera propia: la pone Biblioteca (CoachLibraryScreen). */}

      <Tabs items={tabs} value={tab} onChange={id => setTab(id as Tab)} label="Secciones de Cardio" />

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
  const athletes = atletasActivos(profiles).filter(p => p.role === 'client');

  if (isPending) return <Skeleton className="h-40 w-full rounded-surface" />;

  if (selected) {
    return <AthleteZonesEditor athleteEmail={selected} coachEmail={coachEmail} onBack={() => setSelected(null)} />;
  }

  return (
    <section className="bg-surface border border-hairline rounded-surface p-4 sm:p-5 space-y-2">
      <h2 className="font-sans font-bold text-title-s text-white mb-2">Elige un atleta</h2>
      {athletes.map(a => (
        <ListRow
          key={a.email}
          onClick={() => setSelected(a.email)}
          className="rounded-control border bg-raised border-hairline"
          leading={<Avatar src={a.avatarUrl} name={a.displayName} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />}
          title={a.displayName}
          chevron
        />
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
      <Button variant="ghost" size="s" onClick={onBack} icon="arrow_back">Atletas</Button>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-caption font-mono uppercase text-ink-2">FC reposo</label>
          <input type="number" value={restingHR} onChange={e => setRestingHR(e.target.value)} className="w-full bg-bg border border-hairline rounded-control p-2 text-title-s text-white focus:outline-none focus:border-accent" />
        </div>
        <div className="flex-1">
          <label className="text-caption font-mono uppercase text-ink-2">FCmax</label>
          <input type="number" value={maxHR} onChange={e => setMaxHR(e.target.value)} className="w-full bg-bg border border-hairline rounded-control p-2 text-title-s text-white focus:outline-none focus:border-accent" />
        </div>
        <Button variant="secondary" size="s" onClick={regenerate} className="self-end">Recalcular</Button>
      </div>
      <div className="space-y-2">
        {ZONE_ORDER.map(z => (
          <div key={z} className="flex items-center gap-2">
            <span className="text-label font-sans text-ink-2 w-32 flex-shrink-0">{ZONE_LABEL[z]}</span>
            <input type="number" value={active[z].min} onChange={e => setZones({ ...active, [z]: { ...active[z], min: Number(e.target.value) } })}
              className="w-20 bg-bg border border-hairline rounded-control p-2 text-title-s text-white focus:outline-none focus:border-accent" />
            <span className="text-ink-3">–</span>
            <input type="number" value={active[z].max} onChange={e => setZones({ ...active, [z]: { ...active[z], max: Number(e.target.value) } })}
              className="w-20 bg-bg border border-hairline rounded-control p-2 text-title-s text-white focus:outline-none focus:border-accent" />
          </div>
        ))}
      </div>
      <Button onClick={handleSave} disabled={saving} fullWidth>{saving ? 'Guardando...' : 'Guardar zonas'}</Button>
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
        <p className="text-label text-ink-3 font-sans py-2">No hay tests pendientes.</p>
      ) : tests.map(t => {
        const athlete = profiles.find(p => p.email === t.athleteId);
        return (
          <div key={t.id} className="bg-raised border border-hairline rounded-surface p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-sans font-bold text-body-s text-white">{athlete?.displayName ?? t.athleteId}</p>
              <span className="text-caption font-mono text-ink-2">{t.date}</span>
            </div>
            <p className="text-label font-sans text-data">{t.type}</p>
            <p className="text-caption font-mono text-ink-2">
              {t.result.restingHR && `FC reposo: ${t.result.restingHR} `}
              {t.result.maxHR && `FCmax: ${t.result.maxHR} `}
              {t.result.lthr && `LTHR: ${t.result.lthr} `}
              {t.result.z2Ceiling && `Techo Z2: ${t.result.z2Ceiling} `}
              {t.result.decouplingPct !== undefined && `Desacople: ${t.result.decouplingPct}% `}
            </p>
            <Button size="s" onClick={() => approve(t)} fullWidth>Aprobar y aplicar a zonas</Button>
          </div>
        );
      })}
    </section>
  );
}

// ─── PRESCRIPCIÓN ────────────────────────────────────────────────────────────
// El formulario en sí vive en cardio/CardioPrescriptionForm.tsx — se comparte
// con la ficha del atleta (ClientCardioPanel, Plan › Cardio). Aquí solo queda
// el desplegable de qué atleta, que es lo único que sobra cuando ya se está
// dentro de su ficha.

function PrescriptionTab() {
  const { data: profiles = [], isPending } = useQuery({ queryKey: ['userProfiles'], queryFn: getAllUserProfiles });
  const athletes = atletasActivos(profiles).filter(p => p.role === 'client');
  const [athleteEmail, setAthleteEmail] = useState('');

  if (isPending) return <Skeleton className="h-40 w-full rounded-surface" />;

  return (
    <section className="bg-surface border border-hairline rounded-surface p-4 sm:p-5 space-y-3">
      <h2 className="font-sans font-bold text-title-s text-white">Prescribir cardio</h2>
      <select value={athleteEmail} onChange={e => setAthleteEmail(e.target.value)}
        className="w-full bg-bg border border-hairline rounded-control p-2 text-title-s text-white focus:outline-none focus:border-accent">
        <option value="">Selecciona atleta...</option>
        {athletes.map(a => <option key={a.email} value={a.email}>{a.displayName}</option>)}
      </select>
      {/* `key` fuerza a React a remontar el formulario al cambiar de atleta
          en el desplegable — sin esto, el coach podía dejar 6 bloques de
          intervalos montados para un atleta, cambiar el desplegable a otro
          sin guardar, y los mismos bloques seguían ahí listos para
          prescribirse al atleta equivocado. */}
      {athleteEmail && <CardioPrescriptionForm key={athleteEmail} athleteEmail={athleteEmail} />}
    </section>
  );
}
