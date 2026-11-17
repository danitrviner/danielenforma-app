import { SEMANAS_SIN_MEJORAR, SESIONES_SIN_MEJORAR, textoDeSemanas, type Estancamiento } from '../estancamiento.js';
import type { EstadoDeEjercicio } from './estadoDelBloqueAnterior.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Qué ejercicios señalar al crear el bloque siguiente (17-11-2026)

   El bloque nuevo se CLONA del anterior: cambiar ejercicios porque sí rompe la
   referencia con la que se mide el resultado de la hipótesis. Solo se señalan
   para cambiar los que tienen un motivo:

     · parado     — 6 semanas o más sin mejorar su nivel, con la misma tarea
                    (`detectarEstancamiento`, que ya mira esfuerzo y contexto).
                    Hasta la auditoría de cifras (17-11-2026) eran 6 SESIONES:
                    tres semanas a frecuencia 2, y se señalaba para cambiar a
                    quien solo necesitaba más tiempo;
     · molestia   — el atleta apuntó molestia en él durante el bloque;
     · lo_quitaria — lo marcó «lo quitaría» en el cuestionario de cierre
                    (`utils/cierrePorEjercicio.ts`, `idsConVoto(votos, 'quitar')`).

   Señalar no es cambiar: decide el coach. El resto se clona tal cual.
   ═══════════════════════════════════════════════════════════════════════════ */

export type MotivoDeCambio = 'parado' | 'molestia' | 'lo_quitaria';

/** Orden en el que se enseñan: primero lo que no puede esperar. */
export const ORDEN_DE_MOTIVOS: readonly MotivoDeCambio[] = ['molestia', 'parado', 'lo_quitaria'];

export interface CandidatoACambio {
  exerciseId: string;
  nombre?: string;
  motivos: MotivoDeCambio[];
  /** Semanas sin mejorar, si está parado. */
  semanasParado?: number;
  /** Sesiones comparables con marca en esas semanas. */
  sesionesParado?: number;
  /** Qué hacer con el parón según `detectarEstancamiento` (no siempre es cambiar el ejercicio). */
  accionDelParon?: string;
  molestia?: { veces: number; maxima: number | null };
  /** Los motivos en una frase, para la lista. */
  detalle: string;
}

export interface CandidatosACambio {
  /** Ejercicios a revisar, del que más motivos tiene al que menos. */
  cambiar: CandidatoACambio[];
  /** Ids que se clonan tal cual, en el orden recibido. */
  clonar: string[];
}

/** ¿El parón llega a las seis semanas? Un estancamiento guardado antes del
 *  17-11-2026 no trae semanas: ahí se sigue mirando por sesiones. */
function estaParado(e: Estancamiento | null | undefined): e is Estancamiento {
  if (!e) return false;
  return e.semanas != null ? e.semanas >= SEMANAS_SIN_MEJORAR : e.sesiones >= SESIONES_SIN_MEJORAR;
}

export function candidatosACambio(o: {
  /** Los ejercicios del bloque que se clona, en su orden. */
  ejercicios: readonly string[];
  /** `estadoDeLosEjercicios(...)` del bloque anterior. */
  estado: readonly EstadoDeEjercicio[];
  /** Ids que el atleta dijo que quitaría en el cuestionario de cierre. */
  quitaria?: readonly string[];
  nombreDe?: (exerciseId: string) => string | undefined;
}): CandidatosACambio {
  const estadoDe = new Map(o.estado.map(e => [e.exerciseId, e]));
  const quitaria = new Set(o.quitaria ?? []);
  const cambiar: CandidatoACambio[] = [];
  const clonar: string[] = [];

  for (const exerciseId of [...new Set(o.ejercicios)]) {
    const e = estadoDe.get(exerciseId);
    const parado = estaParado(e?.estancamiento) ? e!.estancamiento! : null;
    const molestia = e?.molestia ?? null;
    const motivos = ORDEN_DE_MOTIVOS.filter(m => (m === 'parado' ? !!parado : m === 'molestia' ? !!molestia : quitaria.has(exerciseId)));
    if (motivos.length === 0) { clonar.push(exerciseId); continue; }

    const frases: string[] = [];
    if (molestia) {
      frases.push(`molestia apuntada en ${molestia.veces} ${molestia.veces === 1 ? 'sesión' : 'sesiones'}${molestia.maxima != null ? ` (hasta ${molestia.maxima}/10)` : ''}`);
    }
    if (parado) {
      frases.push(parado.semanas != null
        ? `parado ${textoDeSemanas(parado.semanas)} (${parado.sesiones} sesiones comparables)`
        : `parado ${parado.sesiones} sesiones comparables`);
    }
    if (quitaria.has(exerciseId)) frases.push('el atleta lo quitaría');
    const nombre = o.nombreDe?.(exerciseId);
    cambiar.push({
      exerciseId,
      ...(nombre ? { nombre } : {}),
      motivos,
      ...(parado ? { ...(parado.semanas != null ? { semanasParado: parado.semanas } : {}), sesionesParado: parado.sesiones, accionDelParon: parado.accion } : {}),
      ...(molestia ? { molestia: { veces: molestia.veces, maxima: molestia.maxima } } : {}),
      detalle: `${frases.join('; ')[0].toUpperCase()}${frases.join('; ').slice(1)}.`,
    });
  }
  // Estable: a igual número de motivos se conserva el orden del bloque.
  cambiar.sort((a, b) => b.motivos.length - a.motivos.length);
  return { cambiar, clonar };
}
