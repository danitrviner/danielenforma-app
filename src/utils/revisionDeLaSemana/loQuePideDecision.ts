import type { WorkoutLog } from '../../types.js';
import type { RevisionDelAtleta } from '../revisionCoach.js';
import type { CambioAtleta } from '../cambiosAtleta.js';
import { estadoDeHipotesis, textoDeResultado, type Hipotesis } from '../hipotesis.js';
import { textoDeSemanas } from '../estancamiento.js';
import { fechaCorta } from '../trainingWeek.js';
import { ritmoFueraDeFase, type RitmoDePeso } from './vistazo.js';
import { num } from './ventana.js';

/* ═══════════════════════════════════════════════════════════════════════════
   «Lo que pide decisión» — la cara PREPARAR de la revisión (18-11-2026)

   Solo coach: se oculta al presentar. Junta en un sitio los avisos que la app
   ya calcula y que piden que Dani decida algo ESTA semana, sin recalcular
   nada: lo que se para seis semanas o más, las sesiones de 8 o más de
   cansancio (y la descarga si las señales se juntan), los cambios con
   hipótesis cuya fecha de mirar ha llegado y el ritmo del peso fuera de lo que
   pide la fase. El semáforo de las hipótesis del bloque y las zonas a subir,
   mantener o frenar viven en la pantalla (necesitan el motor CDG).
   ═══════════════════════════════════════════════════════════════════════════ */

export type TipoDeAviso = 'estancado' | 'sesion_dura' | 'descarga' | 'hipotesis' | 'ritmo';

export interface AvisoDeDecision {
  id: string;
  tipo: TipoDeAviso;
  titulo: string;
  detalle: string;
}

const ESTADO_RITMO: Partial<Record<RitmoDePeso['estado'], string>> = {
  lento: 'va más lento de lo que pide la fase',
  rapido: 'va más rápido de lo que pide la fase',
  contrario: 'va en dirección contraria a la fase',
  'por-encima': 'se sale de la franja por arriba',
  'por-debajo': 'se sale de la franja por abajo',
};

const gramos = (kg: number) => `${kg > 0 ? '+' : kg < 0 ? '−' : ''}${num(Math.abs(kg) * 1000, 0)} g`;

/** «Baja 240 g a la semana; la fase pide de −320 a −480 g. Unas 150 kcal/día menos…» */
export function textoDelRitmo(r: RitmoDePeso): string {
  const mueve = r.kgSemana === 0 ? 'No se mueve' : `${r.kgSemana < 0 ? 'Baja' : 'Sube'} ${num(Math.abs(r.kgSemana) * 1000, 0)} g a la semana`;
  const pide = r.rangoKg ? `; «${r.fase}» pide de ${gramos(r.rangoKg[0])} a ${gramos(r.rangoKg[1])}` : '';
  const ajuste = r.ajusteKcal
    ? `. Unas ${num(Math.abs(r.ajusteKcal), 0)} kcal/día ${r.ajusteKcal < 0 ? 'menos' : 'más'} lo llevarían al centro (orientativo)`
    : '';
  return `${mueve}${pide}${ajuste}.`;
}

export function loQuePideDecision(o: {
  revision: Pick<RevisionDelAtleta, 'estancados' | 'descarga'>;
  nombreDe: (exerciseId: string) => string;
  ritmo?: RitmoDePeso | null;
  hipotesis?: readonly Hipotesis[];
  cambios?: readonly CambioAtleta[];
  logs?: readonly WorkoutLog[];
  hoy: string;
}): AvisoDeDecision[] {
  const out: AvisoDeDecision[] = [];
  const { revision, nombreDe } = o;

  // Ritmo de peso fuera de la fase: lo primero, porque cambia las kcal.
  if (o.ritmo && ritmoFueraDeFase(o.ritmo)) {
    out.push({
      id: 'ritmo', tipo: 'ritmo',
      titulo: `El peso ${ESTADO_RITMO[o.ritmo.estado] ?? 'no va como pide la fase'}`,
      detalle: textoDelRitmo(o.ritmo),
    });
  }

  // Descarga por señales (con qué recortar) o, sin ella, sesiones de 8 o más.
  const d = revision.descarga;
  if (d?.recomendada) {
    const recortes = d.recortes.slice(0, 3).map(r => r.texto);
    out.push({
      id: 'descarga', tipo: 'descarga',
      titulo: 'Las señales piden descarga',
      detalle: `${d.senales.join('; ')}.${recortes.length ? ` Antes de una semana entera, recorta por aquí: ${recortes.join('; ')}.` : ''}`,
    });
  } else {
    for (const [i, s] of (d?.sesionesDuras ?? []).entries()) {
      out.push({ id: `sesion_dura_${i}`, tipo: 'sesion_dura', titulo: 'Sesión dura (cansancio de 8 o más)', detalle: s });
    }
  }

  // Seis semanas o más sin mejorar (el veredicto «mantener» no pide nada).
  for (const e of revision.estancados ?? []) {
    if (e.veredicto === 'mantener') continue;
    out.push({
      id: `estancado_${e.exerciseId}`, tipo: 'estancado',
      titulo: `${nombreDe(e.exerciseId)}: ${textoDeSemanas(e.semanas)} sin mejorar`,
      detalle: `${e.sesiones} sesiones comparables. ${e.accion}.`,
    });
  }

  // Cambios con hipótesis cuya fecha de mirar ya ha llegado.
  for (const h of o.hipotesis ?? []) {
    if (estadoDeHipotesis(h, o.hoy) !== 'toca_revisar') continue;
    const cambio = (o.cambios ?? []).find(c => c.id === h.id || c.id === h.cambioId);
    const resultado = o.logs ? ` ${textoDeResultado(h, o.logs, h.exerciseId ? nombreDe(h.exerciseId) : undefined)}` : '';
    out.push({
      id: `hipotesis_${h.id}`, tipo: 'hipotesis',
      titulo: `Toca mirar ${cambio ? `«${cambio.titulo}»` : 'un cambio'} (desde el ${fechaCorta(h.revisarEl)})`,
      detalle: `Esperabas: «${h.espero}».${resultado}`,
    });
  }
  return out;
}
