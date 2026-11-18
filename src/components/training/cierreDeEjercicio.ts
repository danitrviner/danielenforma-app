import type { WorkoutSetLog } from '../../types';
import { mejorSerieValida } from '../../utils/marcaDeSesion';
import { rmDeSerie } from '../../utils/oneRepMax';
import { logrosDelEjercicio, type Logro } from '../../utils/logrosDelEjercicio';
import { comprobarRir, type Comprobacion } from '../../utils/calibracionRir';
import { seriesPrincipales } from '../../utils/seriesPrincipales';

/* ═══════════════════════════════════════════════════════════════════════════
   Lo que se le dice al atleta al cerrar un ejercicio (17-11-2026)

   Casi todo lo que sale en la tarjeta de cierre —el récord, «sigues
   progresando», «hoy ha salido por debajo», «tu RIR, comprobado»— se calcula
   con el RIR. Y el RIR llegaba prerrellenado con el pautado: bastaba subirlo
   en el desplegable para que saliera confeti, y a quien no lo tocaba se le
   opinaba de un esfuerzo que no había apuntado.

   Aquí está el filtro, en un solo sitio y sin tocar los motores:

     · D9  — el récord de RM estimado solo se celebra con una serie válida
             (`esSerieValidaParaRm`). Si no la hay, se celebra lo que sí es un
             hecho: más repeticiones que nunca con ese peso.
     · D1d — lo que opina del esfuerzo solo sale si el RIR de esas series lo
             apuntó él.
   ═══════════════════════════════════════════════════════════════════════════ */

export type SerieDeCierre = Pick<WorkoutSetLog, 'weight' | 'repsDone' | 'rir' | 'alFallo' | 'segmento' | 'rirApuntado'>;

/**
 * ¿Se sabe cuánto apretó en esta serie? Sí si el RIR lo apuntó él o si fue al
 * fallo; no si se guardó el pautado sin tocar. Los registros antiguos no
 * llevan la marca y se dan por buenos (mismo criterio que `rmValido.ts`).
 */
export function rirConocido(s: Pick<SerieDeCierre, 'alFallo' | 'rirApuntado'>): boolean {
  return !!s.alFallo || s.rirApuntado !== false;
}

const kg = (n: number) => `${String(Math.round(n * 10) / 10).replace('.', ',')}\u00a0kg`;

/** El mejor RM estimado entre las series VÁLIDAS (`esSerieValidaParaRm`), con
 *  su serie. `null` si ninguna vale: sin serie válida no hay marca de RM. */
export function mejorRmValido<T extends SerieDeCierre>(sets: readonly T[]): { serie: T; rm: number } | null {
  // Un solo motor para «la mejor serie válida»: el de marcaDeSesion.ts.
  const mejor = mejorSerieValida(sets);
  return mejor && mejor.rm > 0 ? { serie: mejor.serie, rm: mejor.rm } : null;
}

/**
 * Récord de repeticiones de la sesión: la serie principal más pesada en la que
 * ha hecho más repeticiones que nunca con ese peso. Sin historial con ese peso
 * no hay récord (estrenar un peso no es mejorar una marca).
 */
export function recordDeRepeticiones(
  hechas: readonly SerieDeCierre[],
  /** Más repeticiones hechas hasta hoy con ese peso o más (0 = nunca lo ha movido). */
  repsMaximasAntes: (peso: number) => number,
): { peso: number; reps: number; antes: number } | null {
  let mejor: { peso: number; reps: number; antes: number } | null = null;
  for (const s of seriesPrincipales(hechas)) {
    if (!(s.weight > 0) || !(s.repsDone > 0)) continue;
    const antes = repsMaximasAntes(s.weight);
    if (!(antes > 0) || s.repsDone <= antes) continue;
    if (!mejor || s.weight > mejor.peso || (s.weight === mejor.peso && s.repsDone > mejor.reps)) {
      mejor = { peso: s.weight, reps: s.repsDone, antes };
    }
  }
  return mejor;
}

/**
 * Los logros que se celebran al cerrar el ejercicio (D9). El récord de RM y
 * «sigues progresando» los decide el motor de siempre (`logrosDelEjercicio`),
 * que solo mira las series válidas para el RM; aquí se le pasan las series con
 * su marca de RIR apuntado y se añade lo que el motor no ve: si no hay récord
 * de RM pero hizo más repeticiones que nunca con ese peso, se celebra eso. El
 * tonelaje cuenta todo lo levantado, como siempre.
 */
export function logrosDelCierre(p: {
  nombre: string;
  /** Las filas marcadas, bajadas y miniseries incluidas. */
  hechas: readonly SerieDeCierre[];
  mejorRmAntes: number | undefined;
  tonelajeMaxAntes: number | undefined;
  ultimaVez: readonly SerieDeCierre[] | undefined;
  repsMaximasAntes: (peso: number) => number;
}): Logro[] {
  const { nombre, hechas, mejorRmAntes, tonelajeMaxAntes, ultimaVez, repsMaximasAntes } = p;
  const delMotor = logrosDelEjercicio({ nombre, hechas, mejorRmAntes, tonelajeMaxAntes, ultimaVez })
    // Red de seguridad: sin ninguna serie válida no hay marca de RM que celebrar.
    .filter(l => l.tipo === 'tonelaje' || mejorRmValido(hechas) !== null);
  if (delMotor.some(l => l.tipo === 'record')) return delMotor;

  const reps = recordDeRepeticiones(hechas, repsMaximasAntes);
  if (!reps) return delMotor;
  return [
    {
      tipo: 'record',
      titulo: `Más repeticiones que nunca con ${kg(reps.peso)}`,
      detalle: `${kg(reps.peso)} × ${reps.reps} en ${nombre} — tu tope con ese peso eran ${reps.antes}`,
    },
    // Con un récord delante, «sigues progresando» sobra (igual que en el motor).
    ...delMotor.filter(l => l.tipo !== 'progreso'),
  ];
}

export const MENSAJE_IGUAL = 'Igual que la última vez. Una sesión igual no es estancarse: lo que cuenta es cómo vas en varias semanas.';
export const MENSAJE_POR_DEBAJO = 'Hoy ha salido un poco por debajo de la última vez. Una sesión suelta no dice nada: sueño, comida y cansancio mueven el número de un día para otro.';

/**
 * F3: la frase que pone en contexto el resultado cuando no hay nada que
 * celebrar. «Hoy ha salido por debajo» opina de cómo ha rendido, así que solo
 * sale si el RIR de las series de hoy y de la última vez lo apuntó él (D1d).
 * Sin ese dato solo se compara peso y repeticiones, y solo se dice lo neutro:
 * que ha salido igual.
 */
export function mensajeTrasCerrar(hoy: readonly SerieDeCierre[], antes: readonly SerieDeCierre[] | undefined): string | undefined {
  if (!antes) return undefined;
  const deHoy = seriesPrincipales(hoy);
  const deAntes = seriesPrincipales(antes);
  const conRir = deHoy.every(rirConocido) && deAntes.every(rirConocido);
  const rm = (s: SerieDeCierre) => rmDeSerie(conRir ? s : { ...s, rir: 0, alFallo: false });
  const rmHoy = Math.max(0, ...deHoy.map(rm));
  const rmAntes = Math.max(0, ...deAntes.map(rm));
  if (!(rmHoy > 0) || !(rmAntes > 0)) return undefined;
  const cambio = (rmHoy - rmAntes) / rmAntes;
  if (Math.abs(cambio) <= 0.01) return MENSAJE_IGUAL;
  if (cambio < 0 && conRir) return MENSAJE_POR_DEBAJO;
  return undefined;
}

const conDatos = (s: SerieDeCierre) => s.weight > 0 && s.repsDone > 0;

/**
 * F4 «Tu RIR, comprobado», solo con RIR que el atleta apuntó (D1d). La
 * comprobación entre sesiones compara la primera serie de hoy con la primera
 * de la última vez: vale si se conoce el RIR de las dos. Si no, queda la de
 * dentro de la sesión, mirando solo las series con el RIR apuntado.
 */
export function comprobacionDelRir(hoy: readonly SerieDeCierre[], anterior?: readonly SerieDeCierre[]): Comprobacion | null {
  const c = comprobarRir(hoy, anterior);
  if (c?.entreSesiones) {
    const primera = hoy.filter(conDatos)[0];
    const previa = anterior?.filter(conDatos)[0];
    if (primera && previa && rirConocido(primera) && rirConocido(previa)) return c;
  }
  return comprobarRir(hoy.filter(rirConocido));
}

/** El RIR medio de las series principales cuyo RIR apuntó el atleta (al fallo
 *  cuenta 0). `null` si no apuntó ninguno: no hay nada suyo que promediar. */
export function rirMedioApuntado(hechas: readonly SerieDeCierre[]): number | null {
  const rirs = seriesPrincipales(hechas).filter(rirConocido).map(s => (s.alFallo ? 0 : Number(s.rir) || 0));
  return rirs.length > 0 ? rirs.reduce((a, b) => a + b, 0) / rirs.length : null;
}
