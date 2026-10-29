import React from 'react';
import type { BodyweightLog, QuestionnaireResponse, UserProfile, WorkoutAssignment } from '../../types';
import { listaPrimeraSemana, diaDePlan } from '../../utils/primeraSemana';
import { COACH_NOMBRE } from '../../utils/coach';
import { hoyIsoLocal } from '../../utils/trainingWeek';
import { Icon, ListRow } from '../ui';

/* «Tu primera semana» (29-10): los tres primeros pasos con plan, con lo que
   ya está hecho, los primeros 14 días. Sustituye al `checklistInicial` que
   HomeScreen documentaba como pendiente: no hace falta un campo nuevo, los
   tres se deducen de lo registrado desde que se publicó el plan. */

interface Props {
  profile: UserProfile;
  assignments: readonly Pick<WorkoutAssignment, 'date' | 'status'>[];
  pesos: readonly Pick<BodyweightLog, 'date'>[];
  respuestas: readonly Pick<QuestionnaireResponse, 'submittedAt'>[];
  onNavigate: (tab: 'training' | 'checkin') => void;
}

export default function PrimeraSemanaCard({ profile, assignments, pesos, respuestas, onNavigate }: Props) {
  const hoy = hoyIsoLocal();
  const items = listaPrimeraSemana({ profile, assignments, pesos, respuestas, hoy });
  if (!items) return null;
  const dia = diaDePlan(profile, hoy)!;
  const hechos = items.filter(i => i.hecho).length;
  const completa = hechos === items.length;

  return (
    <section className="rounded-canvas border border-hairline bg-surface p-4 space-y-3" aria-label="Tu primera semana">
      <div className="flex items-baseline gap-2">
        <h2 className="font-sans font-bold text-title-s text-ink flex-1">Tu primera semana</h2>
        <span className="font-mono text-caption uppercase tracking-widest text-ink-3">Día {dia} · {hechos}/{items.length}</span>
      </div>
      {completa ? (
        <p className="font-sans text-body-s text-ink-2">
          Los tres primeros pasos, hechos. {COACH_NOMBRE} te dice el lunes qué cambia con lo que has registrado.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map(it => (
            <ListRow
              key={it.id}
              onClick={it.hecho ? undefined : () => onNavigate(it.destino)}
              className={`rounded-control border ${it.hecho ? 'bg-success/6 border-success/20' : 'bg-raised border-hairline'}`}
              leading={<Icon name={it.hecho ? 'check_circle' : 'radio_button_unchecked'} size="l" className={it.hecho ? 'text-success' : 'text-ink-2'} />}
              title={it.titulo}
              subtitle={it.detalle}
            />
          ))}
          <p className="font-sans text-caption text-ink-3">{COACH_NOMBRE} está pendiente estos días: si algo no te cuadra, díselo.</p>
        </div>
      )}
    </section>
  );
}
