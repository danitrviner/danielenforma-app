import type { Mesocycle, UserProfile } from '../types';
import { finDeBloque } from './finDeBloque';
import { diasEntreFechas } from './trainingWeek';

/* ═══════════════════════════════════════════════════════════════════════════
   El mes y la renovación (tanda 8, 29-10-2026)

   · `bloqueCerradoRecientemente`: el mesociclo que acabó hace ≤ 14 días. Es
     el momento del cierre de bloque: la única baja medida (Pedro R.) se fue
     cinco días después de acabar un bloque sin siguiente y sin cierre.
     «Acabó» es su último día REAL (`finDeBloque`: vueltas × ciclo), no
     `weeks × 7`: con ciclos de 5 o 10 días el aviso saltaba antes de tiempo.
   · El texto del borrador que Dani firma ya no se monta aquí: es el mensaje
     único del cierre (`mensajeDeCierre`, en `cierreCompleto.ts`). El de aquí
     repetía las sesiones dos veces y salía sin peso corporal (17-11-2026).
   · `diasHastaFinDePlan`: los últimos días del plan contratado, para la
     tarjeta de renovación del atleta y la señal de la bandeja.
   ═══════════════════════════════════════════════════════════════════════════ */

export const DIAS_CIERRE_RECIENTE = 14;
export const DIAS_ULTIMOS_DEL_PLAN = 10;

export function bloqueCerradoRecientemente(mesociclos: readonly Mesocycle[], hoy: string): Mesocycle | null {
  const cerrados = mesociclos
    .filter(m => !!m.startDate)
    .map(m => ({ m, fin: finDeBloque(m) }))
    .filter(x => x.fin < hoy && diasEntreFechas(x.fin, hoy) <= DIAS_CIERRE_RECIENTE)
    .sort((a, b) => b.fin.localeCompare(a.fin));
  return cerrados[0]?.m ?? null;
}

export function idDeCierre(mesoId: string): string {
  return `cierre_${mesoId}`;
}

/** Fin del plan contratado (YYYY-MM-DD) o null. */
export function finDePlan(profile: Pick<UserProfile, 'planStartDate' | 'planDurationMonths'>): string | null {
  if (!profile.planStartDate || !profile.planDurationMonths) return null;
  const [y, m, d] = profile.planStartDate.split('-').map(Number);
  const fin = new Date(y, m - 1 + profile.planDurationMonths, d);
  return `${fin.getFullYear()}-${String(fin.getMonth() + 1).padStart(2, '0')}-${String(fin.getDate()).padStart(2, '0')}`;
}

/** Días hasta el fin del plan (negativo = vencido) o null sin plan. */
export function diasHastaFinDePlan(profile: Pick<UserProfile, 'planStartDate' | 'planDurationMonths'>, hoy: string): number | null {
  const fin = finDePlan(profile);
  return fin ? diasEntreFechas(hoy, fin) : null;
}
