import React from 'react';
import type { BodyweightLog, UserProfile } from '../../types';
import type { ObjetivoCorporalTipo } from '../../utils/verificacionObjetivo';
import { antesAhora } from './LoQueVinisteABuscar';
import { diasHastaFinDePlan, finDePlan, DIAS_ULTIMOS_DEL_PLAN } from '../../utils/cierreParaAtleta';
import { COACH_NOMBRE } from '../../utils/coach';
import { hoyIsoLocal } from '../../utils/trainingWeek';
import { Icon } from '../ui';

/* «Esto hemos conseguido · esto viene» (tanda 8): los últimos diez días del
   plan contratado. Es lo que decide la renovación: llegar con la sensación
   de haber conseguido algo y con un siguiente paso claro. El siguiente paso
   lo escribe Dani (Lo último de Dani); aquí solo se dice que llega. Tarjeta
   con el antes → ahora (versión elegida por Dani el 29-10). */

const kg = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fechaLarga = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

interface Props {
  profile: Pick<UserProfile, 'planStartDate' | 'planDurationMonths'>;
  pesos: readonly Pick<BodyweightLog, 'date' | 'weight'>[];
  objetivo: ObjetivoCorporalTipo | null;
  pesoMeta: number | null;
}

export default function RenovacionCard({ profile, pesos, objetivo, pesoMeta }: Props) {
  const hoy = hoyIsoLocal();
  const dias = diasHastaFinDePlan(profile, hoy);
  if (dias === null || dias < 0 || dias > DIAS_ULTIMOS_DEL_PLAN) return null;
  const fin = finDePlan(profile)!;
  const aa = antesAhora(pesos, pesoMeta, objetivo, hoy);
  const cuando = dias === 0 ? 'hoy' : dias === 1 ? 'mañana' : `en ${dias} días`;

  return (
    <section className="rounded-canvas border border-accent-line bg-surface p-4 space-y-3" aria-label="Tu plan termina pronto">
      <div className="flex items-center gap-2.5">
        <Icon name="flag" size="m" className="text-accent-ink" />
        <div>
          <p className="font-sans font-bold text-body-s text-ink">Tu plan termina {cuando}</p>
          <p className="font-mono text-caption text-ink-3">{fechaLarga(fin)}</p>
        </div>
      </div>
      {aa.ahora != null && (
        <div>
          <p className="font-mono text-caption uppercase tracking-widest text-accent-ink">Esto hemos conseguido</p>
          <p className="font-sans text-body-s text-ink">
            {aa.empezaste != null && <>De {kg(aa.empezaste)} a </>}<span className="font-bold">{kg(aa.ahora)} kg</span>
            {aa.cambio != null && aa.cambio !== 0 && <span className="text-ink-2"> ({aa.cambio > 0 ? '+' : ''}{kg(aa.cambio)})</span>}
            {aa.faltan != null && aa.faltan > 0 && <span className="text-ink-2"> · a {kg(aa.faltan)} kg de tu meta</span>}
            {aa.faltan != null && aa.faltan <= 0 && <span className="text-success"> · meta conseguida</span>}
          </p>
        </div>
      )}
      <div>
        <p className="font-mono text-caption uppercase tracking-widest text-accent-ink">Esto viene</p>
        <p className="font-sans text-body-s text-ink-2 text-pretty">{COACH_NOMBRE} te cuenta el siguiente paso estos días: el bloque que viene y qué cambia.</p>
      </div>
    </section>
  );
}
