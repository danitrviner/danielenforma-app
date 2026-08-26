import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserProfile, AthleteCardioProfile } from '../../types';
import { getOnboarding, getCardioProfile, saveCardioProfile } from '../../dbService';
import { defaultZonesFromAge } from '../../db/cardio';
import { maxHREstimada } from '../../utils/cardioZones';
import { useToast } from '../../hooks/useToast';
import HrTestsPanel from '../HrTestsPanel';
import { Icon, Button, Collapsible } from '../ui';

interface Props {
  profile: UserProfile;
}

// FCmax por edad — Tanaka (208 − 0,7 × edad), en `utils/cardioZones.ts`. Antes
// aquí se calculaba a mano con 220 − edad; ver el porqué del cambio en el
// comentario de `maxHREstimada`.
function edadDesde(birthDate?: string): number | null {
  if (!birthDate) return null;
  const nacimiento = new Date(birthDate);
  if (Number.isNaN(nacimiento.getTime())) return null;
  const hoy = new Date();
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const m = hoy.getMonth() - nacimiento.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nacimiento.getDate())) edad--;
  return edad;
}

// Modelo FITIV (§1bis/§5.2 del análisis): sin tests obligatorios — pide
// edad/peso/sexo y calcula las zonas solas, con la FCmax editable a mano en
// ajustes. Antes esta pantalla enseñaba los 5 tests de FC directamente; se
// quedan detrás de "Calibrar con un test" para quien quiera medirlo de
// verdad, pero ya no son el camino obligatorio para tener zonas.
export default function CardioZonesSettingsCard({ profile }: Props) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const cardioProfileKey = ['cardioProfile', profile.email] as const;

  const { data: onboarding = null } = useQuery({
    queryKey: ['onboarding', profile.email],
    queryFn: () => getOnboarding(profile.email),
  });
  const { data: cardioProfile = null, isPending } = useQuery({
    queryKey: cardioProfileKey,
    queryFn: () => getCardioProfile(profile.email),
  });

  const [saving, setSaving] = useState(false);

  const edad = edadDesde(onboarding?.birthDate);
  const estimado = edad != null ? maxHREstimada(edad) : null;
  const maxHRActual = cardioProfile?.maxHR ?? estimado ?? undefined;
  const [draft, setDraft] = useState<string>('');
  const mostrando = draft !== '' ? draft : (maxHRActual != null ? String(maxHRActual) : '');
  const esEstimado = !cardioProfile?.maxHR && estimado != null;

  const handleSave = async () => {
    const maxHR = parseInt(draft || mostrando, 10);
    if (!maxHR || maxHR < 100 || maxHR > 230) {
      showToast('Introduce una FCmax entre 100 y 230.', 'error');
      return;
    }
    setSaving(true);
    try {
      const restingHR = cardioProfile?.restingHR ?? 60;
      const next: AthleteCardioProfile = {
        athleteId: profile.email,
        restingHR: cardioProfile?.restingHR,
        maxHR,
        lthr: cardioProfile?.lthr,
        method: cardioProfile?.method ?? 'hrr',
        zones: defaultZonesFromAge(restingHR, maxHR),
        updatedAt: new Date().toISOString(),
        updatedBy: profile.email,
      };
      await saveCardioProfile(next);
      queryClient.setQueryData(cardioProfileKey, next);
      setDraft('');
      showToast('FCmax actualizada — tus zonas se recalcularon.', 'success');
    } catch (err) {
      console.error(err);
      showToast('No se pudo guardar tu FCmax.');
    } finally {
      setSaving(false);
    }
  };

  if (isPending) return null;

  return (
    <div className="bg-surface border border-hairline rounded-surface p-5 space-y-4">
      <h3 className="font-sans font-bold text-title-s text-white flex items-center gap-2">
        <Icon name="monitor_heart" size="m" className="text-accent" />
        Mis zonas de FC
      </h3>

      <div>
        <label className="block font-mono text-caption text-ink-2 uppercase tracking-wider mb-1">FC máxima (ppm)</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={100}
            max={230}
            value={mostrando}
            onChange={e => setDraft(e.target.value)}
            className="w-28 bg-raised border border-hairline rounded-control px-3 py-2 text-white text-title-s font-mono focus:outline-none focus:border-accent/50"
          />
          <Button variant="secondary" size="s" onClick={handleSave} loading={saving} disabled={!mostrando}>
            Guardar
          </Button>
        </div>
        <p className="font-sans text-caption text-ink-3 mt-2">
          {esEstimado
            ? `Estimada por tu edad (${edad} años, fórmula de Tanaka) — corrígela si la conoces con más precisión.`
            : 'Puesta a mano. Tus zonas se recalculan a partir de este valor.'}
        </p>
      </div>

      <Collapsible
        trigger={
          <span className="flex items-center gap-2 font-sans text-body-s text-accent">
            <Icon name="speed" size="s" />
            Calibrar con un test
          </span>
        }
      >
        <div className="pt-3">
          <HrTestsPanel profile={profile} cardioProfile={cardioProfile} />
        </div>
      </Collapsible>
    </div>
  );
}
