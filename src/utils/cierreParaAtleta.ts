import type { Mesocycle, UserProfile } from '../types';
import type { CierreMesociclo } from './cierreMesociclo';
import { addDays, diasEntreFechas } from './trainingWeek';

/* ═══════════════════════════════════════════════════════════════════════════
   El mes y la renovación (tanda 8, 29-10-2026)

   · `bloqueCerradoRecientemente`: el mesociclo que acabó hace ≤ 14 días. Es
     el momento del cierre de bloque: la única baja medida (Pedro R.) se fue
     cinco días después de acabar un bloque sin siguiente y sin cierre.
   · `textoCierre`: las tres cifras del motor (`cierreMesociclo`) y las
     frases para el cliente, como borrador que Dani firma.
   · `diasHastaFinDePlan`: los últimos días del plan contratado, para la
     tarjeta de renovación del atleta y la señal de la bandeja.
   ═══════════════════════════════════════════════════════════════════════════ */

export const DIAS_CIERRE_RECIENTE = 14;
export const DIAS_ULTIMOS_DEL_PLAN = 10;

export function bloqueCerradoRecientemente(mesociclos: readonly Mesocycle[], hoy: string): Mesocycle | null {
  const cerrados = mesociclos
    .filter(m => !!m.startDate)
    .map(m => ({ m, fin: addDays(m.startDate, m.weeks * 7 - 1) }))
    .filter(x => x.fin < hoy && diasEntreFechas(x.fin, hoy) <= DIAS_CIERRE_RECIENTE)
    .sort((a, b) => b.fin.localeCompare(a.fin));
  return cerrados[0]?.m ?? null;
}

export function idDeCierre(mesoId: string): string {
  return `cierre_${mesoId}`;
}

export function textoCierre(c: Pick<CierreMesociclo, 'numero' | 'sesiones' | 'volumen' | 'informe' | 'resumenParaCliente'>, nombreBloque?: string | null): string {
  const bloque = nombreBloque?.trim() ? `«${nombreBloque.trim()}»` : `#${c.numero}`;
  const records = c.informe?.perExercise?.filter(e => e.isPR).length ?? 0;
  const partes = [
    `${c.sesiones.completadas} de ${c.sesiones.programadas} sesiones`,
    c.volumen.pct != null ? `${c.volumen.pct} % del trabajo programado` : null,
    records > 0 ? `${records} récord${records === 1 ? '' : 's'}` : null,
  ].filter((x): x is string => !!x);
  const cifras = `Bloque ${bloque} terminado: ${partes.join(', ')}.`;
  return c.resumenParaCliente?.trim() ? `${cifras} ${c.resumenParaCliente.trim()}` : cifras;
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
