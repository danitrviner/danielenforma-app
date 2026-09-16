import { desviacionDelRitmo } from './ritmoDePeso';
import type { Confianza } from './mantenimientoEstimado';

/* ═══════════════════════════════════════════════════════════════════════════
   Qué hacer cuando el atleta no va al ritmo previsto

   La auditoría es explícita (§19): «La aplicación debería proponer ajustes,
   pero no realizar cambios críticos de forma silenciosa. El entrenador debe
   poder revisar/aceptar el ajuste.»

   Así que esto NO cambia nada. Devuelve una propuesta con su porqué, y ya
   decide una persona.

   Y el porqué importa tanto como el número. Lo que pedía §23 no es «según una
   fórmula deberías gastar X, luego estás en déficit de X», sino:

     «Come 2.500 kcal. En las últimas semanas ha perdido 0,2 kg por semana.
      Con esos datos, su mantenimiento parece rondar las 2.900. Va por debajo
      del objetivo de 0,5. El siguiente paso sería bajar a 2.300.»
   ═══════════════════════════════════════════════════════════════════════════ */

export interface EntradaDeAjuste {
  ritmoObjetivo: number;
  ritmoReal: number | null;
  kcalActuales: number;
  mantenimientoEstimado: number | null;
  confianza: Confianza;
}

export interface PropuestaDeAjuste {
  hayPropuesta: boolean;
  kcalPropuestas: number | null;
  /** Frase lista para enseñar al entrenador, con SUS números. */
  explicacion: string;
}

const KCAL_POR_KG = 7700;
const DIAS = 7;

/** Nadie baja de aquí por un ajuste automático. */
const SUELO_KCAL = 1400;

/** Tope de movimiento en un solo ajuste: un desvío grande no justifica un tajo. */
const MAXIMO_AJUSTE_KCAL = 400;

/** Redondeo a 50 kcal: pautar 2.347 kcal es precisión fingida. */
const PASO_KCAL = 50;

export function proponerAjuste(entrada: EntradaDeAjuste): PropuestaDeAjuste {
  const { ritmoObjetivo, ritmoReal, kcalActuales, mantenimientoEstimado, confianza } = entrada;

  const desviacion = desviacionDelRitmo(ritmoObjetivo, ritmoReal);

  if (desviacion.estado === 'sin-datos') {
    return {
      hayPropuesta: false,
      kcalPropuestas: null,
      explicacion: 'Todavía no hay semanas suficientes para saber a qué ritmo está yendo.',
    };
  }

  if (desviacion.estado === 'en-rumbo') {
    return {
      hayPropuesta: false,
      kcalPropuestas: null,
      explicacion: `Va al ritmo previsto (${fmtKg(ritmoReal!)} kg/semana frente a `
                 + `${fmtKg(ritmoObjetivo)} de objetivo). No hace falta tocar nada.`,
    };
  }

  /* Con la señal ruidosa, se avisa pero no se propone número.
   *
   * Mover las calorías por dos semanas contradictorias es peor que esperar una
   * más: el atleta acaba persiguiendo el ruido, y el entrenador pierde la
   * referencia de qué efecto tuvo cada cambio. */
  if (confianza === 'baja' || confianza === 'sin-datos') {
    return {
      hayPropuesta: false,
      kcalPropuestas: null,
      explicacion: `Parece ir ${desviacion.estado === 'por-debajo' ? 'por debajo' : 'por encima'} `
                 + `del ritmo objetivo, pero son pocos datos todavía para proponer un cambio. `
                 + `Con una o dos semanas más se podrá afinar.`,
    };
  }

  // Cuántas kcal/día separan el ritmo real del objetivo.
  const kcalDelDesvio = (desviacion.diferencia * KCAL_POR_KG) / DIAS;

  // Si va por debajo del objetivo hay que empujar en la dirección de la fase:
  // bajando en un déficit, subiendo en un superávit.
  const direccion = ritmoObjetivo < 0 ? -1 : 1;
  const signo = desviacion.estado === 'por-debajo' ? direccion : -direccion;

  const ajusteBruto = signo * Math.min(kcalDelDesvio, MAXIMO_AJUSTE_KCAL);
  const propuestas = Math.max(
    SUELO_KCAL,
    Math.round((kcalActuales + ajusteBruto) / PASO_KCAL) * PASO_KCAL,
  );

  return {
    hayPropuesta: propuestas !== kcalActuales,
    kcalPropuestas: propuestas,
    explicacion: explicar({ ritmoObjetivo, ritmoReal: ritmoReal!, kcalActuales, mantenimientoEstimado, propuestas, estado: desviacion.estado }),
  };
}

function explicar(d: {
  ritmoObjetivo: number;
  ritmoReal: number;
  kcalActuales: number;
  mantenimientoEstimado: number | null;
  propuestas: number;
  estado: 'por-encima' | 'por-debajo';
}): string {
  const partes = [
    `Come ${fmtKcal(d.kcalActuales)} kcal.`,
    `En las últimas semanas ha ${d.ritmoReal < 0 ? 'perdido' : 'ganado'} ${fmtKg(Math.abs(d.ritmoReal))} kg por semana.`,
  ];
  if (d.mantenimientoEstimado != null) {
    partes.push(`Con esos datos, su mantenimiento parece rondar las ${fmtKcal(d.mantenimientoEstimado)} kcal.`);
  }
  partes.push(
    `Su ritmo real está por ${d.estado === 'por-debajo' ? 'debajo' : 'encima'} del objetivo `
    + `de ${fmtKg(Math.abs(d.ritmoObjetivo))} kg/semana.`,
    `El siguiente paso sería ${d.propuestas < d.kcalActuales ? 'bajar' : 'subir'} a ${fmtKcal(d.propuestas)} kcal.`,
  );
  return partes.join(' ');
}

/** Miles con punto, como se escriben en español. */
function fmtKcal(n: number): string {
  return n.toLocaleString('es-ES');
}

function fmtKg(n: number): string {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}
