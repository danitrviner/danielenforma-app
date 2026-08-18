import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserProfile } from '../types';
import { getOnboarding } from '../dbService';
import OnboardingForm from './OnboardingForm';
import { Icon, Button } from './ui';

/* Extraído de ProfileScreen (T7.a): la sala de espera del atleta sin plan
   (PlanEnEsperaScreen) necesita "ver mi anamnesis" sin montar el ProfileScreen
   completo — sus cinco pestañas y el Sheet de Ajustes eran una fuga de la sala
   de espera (bloqueo total, roto). Mismo componente, mismo `queryKey` de
   onboarding que el resto de ProfileScreen, así que comparten caché. */

interface Props {
  profile: UserProfile;
}

export default function MiFichaCard({ profile }: Props) {
  const queryClient = useQueryClient();
  const onboardingKey = ['onboarding', profile.email] as const;
  const { data: onboarding = null } = useQuery({
    queryKey: onboardingKey,
    queryFn: () => getOnboarding(profile.email),
  });
  const [editingFicha, setEditingFicha] = useState(false);

  if (editingFicha) {
    return (
      <div className="bg-surface border border-hairline p-4 rounded-surface">
        <OnboardingForm
          athleteEmail={profile.email}
          initialData={onboarding}
          onSaved={data => { queryClient.setQueryData(onboardingKey, data); setEditingFicha(false); }}
          onCancel={() => setEditingFicha(false)}
        />
      </div>
    );
  }

  return (
    <div className="bg-surface border border-hairline p-5 rounded-surface flex items-center justify-between gap-4">
      <div>
        <h3 className="font-sans font-bold text-title-s text-white flex items-center gap-2">
          <Icon name="assignment_ind" size="m" className="text-accent" />
          {onboarding ? 'Mi ficha de iniciación' : 'Ficha de iniciación'}
        </h3>
        <p className="font-mono text-caption text-ink-3 mt-1">
          {onboarding
            ? `Actualizada el ${new Date(onboarding.completedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}`
            : 'Completa tu ficha para que tu entrenador personalice tu plan.'}
        </p>
      </div>
      <Button onClick={() => setEditingFicha(true)} icon="edit_note" className="shrink-0">
        {onboarding ? 'Editar' : 'Completar'}
      </Button>
    </div>
  );
}
