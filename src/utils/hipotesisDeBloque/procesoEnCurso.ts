import { redondearIem } from './cifras.js';

/* ═══════════════════════════════════════════════════════════════════════════
   El PROCESO de una hipótesis, a medias (auditoría de cifras, 17-11-2026)

   Al cerrar, el proceso es una sola cuenta: ¿la media del bloque llegó al
   objetivo? A mitad de bloque esa misma cuenta engaña en los dos sentidos:

     · con el objetivo viejo (media del anterior + 10 %, al 95 %) salía verde
       desde la semana 1 sin haber subido nada;
     · con el nuevo (donde acabó + medio escalón, sin tolerancia) saldría rojo
       hasta la primera subida, que por norma no llega antes de la semana 3.

   Así que a medias se mira si TODAVÍA LLEGA, que es lo que el coach puede
   corregir. Con arranque 58, techo 63,8 y objetivo 60,9 en 12 semanas, la
   media llega solo si el escalón se da en la semana 7 como tarde: hasta ahí
   «va en camino» (y se dice cuánto margen queda); pasada esa semana sin
   subir, ya no llega ni subiendo al techo, y eso es «por detrás».

   Propio (criterio técnico de la app, no una regla de entrenamiento). Puro.
   ═══════════════════════════════════════════════════════════════════════════ */

export type RitmoDeProceso =
  | 'cumplido'   // la media ya está en el objetivo y, sosteniendo el nivel de ahora, acaba en él
  | 'llega'      // aún no, pero sosteniendo el nivel de ahora hasta el final, llega
  | 'a_tiempo'   // no llega con el nivel de ahora; sí si sube al techo a tiempo
  | 'tarde';     // ya no llega ni subiendo al techo desde la semana que viene

export interface ProcesoEnCurso {
  ritmo: RitmoDeProceso;
  /** IEM medio realizado hasta ahora. */
  media: number;
  /** IEM medio con el que acabaría el bloque sosteniendo hasta el final el nivel de ahora. */
  proyeccion: number;
  /** Con `a_tiempo`: semanas que aún puede seguir en el nivel de ahora antes de subir al techo (0 = tiene que subir ya). */
  semanasDeMargen: number | null;
  /** Semanas que cuentan y aún no se han medido. */
  restantes: number;
}

/**
 * Cómo va el proceso de una zona que sube o sostiene. `null` sin ninguna
 * semana medida. Las cuentas se redondean a un decimal, como el IEM que se
 * guarda y se enseña: un 60,9 justo cuenta como llegar.
 */
export function procesoEnCurso(o: {
  /** `HipotesisDeZona.iemMedioObjetivo`. */
  objetivo: number;
  /** `HipotesisDeZona.iemTecho`: hasta dónde puede subir. */
  techo?: number | null;
  /** IEM realizado de cada semana que cuenta, en orden (`EstadoDeZona.porSemana`). */
  porSemana: readonly number[];
  /** Semanas del bloque que cuentan para la media (sin descargas, puentes ni test). */
  semanasTotales: number;
  /** Nivel de ahora; por defecto, la última semana medida en la que entrenó. */
  nivel?: number | null;
}): ProcesoEnCurso | null {
  const n = o.porSemana.length;
  if (n === 0) return null;
  const suma = o.porSemana.reduce((a, b) => a + b, 0);
  const media = redondearIem(suma / n);
  const total = Math.max(n, Math.round(o.semanasTotales) || 0);
  const restantes = total - n;
  const nivel = o.nivel ?? [...o.porSemana].reverse().find(v => v > 0.005) ?? 0;
  const proyeccion = redondearIem((suma + nivel * restantes) / total);
  const base = { media, proyeccion, restantes };
  if (proyeccion >= o.objetivo) return { ...base, ritmo: media >= o.objetivo ? 'cumplido' : 'llega', semanasDeMargen: null };
  const techo = o.techo ?? null;
  if (techo != null && techo > nivel) {
    // ¿Cuántas semanas más puede seguir como está y aun así llegar subiendo al techo el resto?
    for (let margen = restantes - 1; margen >= 0; margen--) {
      const final = redondearIem((suma + nivel * margen + techo * (restantes - margen)) / total);
      if (final >= o.objetivo) return { ...base, ritmo: 'a_tiempo', semanasDeMargen: margen };
    }
  }
  return { ...base, ritmo: 'tarde', semanasDeMargen: null };
}
