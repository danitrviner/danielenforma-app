import { BandaEntreno } from './roadmapCalendar';

/* ═══════════════════════════════════════════════════════════════════════════
   El camino del atleta — «lo recorrido» y «lo que queda»

   El calendario del coach enseña el plan como una rejilla de días: sirve para
   PROGRAMAR. El atleta necesita otra cosa encima de la misma rejilla: saber
   por dónde va del camino entero. Eso no está en ningún sitio del modelo —
   se deriva de las bandas de entreno (una por mesociclo), que ya son el plan
   ordenado en el tiempo.

   Todo el módulo trabaja con fechas ISO locales (`YYYY-MM-DD`) y las compara
   como cadenas, igual que el resto del calendario: nada de `Date` para
   ordenar, que es de donde salían los desfases de zona horaria.
   ═══════════════════════════════════════════════════════════════════════════ */

export type EstadoTramo = 'recorrido' | 'actual' | 'por-recorrer';

export interface TramoCamino {
  id: string;
  nombre: string;
  color: string;
  icono: string;
  inicio: string;
  fin: string;
  semanas: number;
  estado: EstadoTramo;
  /** 0-100. En el tramo actual, cuánto llevas de él; 100 si ya pasó, 0 si no ha llegado. */
  progresoPct: number;
  /** Semana del bloque en la que estás (1-indexada). Solo en el tramo actual. */
  semanaEnCurso: number | null;
}

export interface CaminoDelPlan {
  tramos: TramoCamino[];
  inicio: string;
  fin: string;
  semanasTotales: number;
  /** Semanas completas ya recorridas, recortadas al plan (nunca negativas ni por encima del total). */
  semanasRecorridas: number;
  progresoPct: number;
  /**
   * El bloque vigente hoy. Nada impide que el coach solape dos mesociclos
   * (crear uno nuevo sin acortar el anterior), y entonces `tramos` puede
   * traer DOS con estado `actual`; aquí gana el que empezó antes, que es el
   * que el atleta lleva recorriendo. La cabecera enseña uno solo a
   * propósito: «estás en dos bloques a la vez» no significa nada para él, y
   * el solape se ve igualmente en la barra de segmentos.
   */
  actual: TramoCamino | null;
  siguiente: TramoCamino | null;
  /** Días que faltan para el final del plan. 0 si el plan ya terminó. */
  diasRestantes: number;
  /** `true` mientras hoy caiga antes del primer día del plan. */
  aunNoEmpieza: boolean;
}

/**
 * Días de calendario entre dos fechas ISO locales. Es la ÚNICA función del
 * módulo que toca `Date`, y lo hace a propósito: contar días sí necesita
 * aritmética, comparar no.
 *
 * El `Math.round` no es decorativo — es lo que la hace inmune al cambio de
 * horario. Un tramo que cruza el último domingo de marzo dura 23 h ese día
 * (y 25 h en octubre), así que la división cruda daría 6,96 o 7,04 días;
 * redondeando salen 7 en los dos casos. Si alguien cambia el `Math.round`
 * por un `Math.floor`, la primavera empieza a contar un día de menos: hay un
 * test que fija justo eso.
 */
function diasEntre(desde: string, hasta: string): number {
  const a = new Date(desde + 'T00:00:00').getTime();
  const b = new Date(hasta + 'T00:00:00').getTime();
  return Math.round((b - a) / 86400000);
}

/**
 * Construye el camino a partir de las bandas de entreno.
 *
 * Ojo con el hueco entre bloques: el plan de un atleta real no siempre es
 * continuo (un mesociclo puede empezar dos semanas después de acabar el
 * anterior). El total se mide de la PRIMERA fecha a la ÚLTIMA, no sumando
 * `semanas` de cada bloque, para que la barra no mienta cuando hay huecos.
 */
export function construirCamino(bandas: BandaEntreno[], hoy: string): CaminoDelPlan | null {
  if (bandas.length === 0) return null;
  const ordenadas = [...bandas].sort((a, b) => a.inicio.localeCompare(b.inicio));
  const inicio = ordenadas[0].inicio;
  const fin = ordenadas.reduce((max, b) => (b.fin > max ? b.fin : max), ordenadas[0].fin);

  const tramos: TramoCamino[] = ordenadas.map(b => {
    let estado: EstadoTramo = 'por-recorrer';
    if (hoy > b.fin) estado = 'recorrido';
    else if (hoy >= b.inicio) estado = 'actual';

    const diasDelTramo = diasEntre(b.inicio, b.fin) + 1;
    const progresoPct = estado === 'recorrido' ? 100
      : estado === 'por-recorrer' ? 0
        : Math.min(100, Math.round(((diasEntre(b.inicio, hoy) + 1) / diasDelTramo) * 100));
    const semanaEnCurso = estado === 'actual'
      ? Math.min(b.semanas, Math.floor(diasEntre(b.inicio, hoy) / 7) + 1)
      : null;

    return {
      id: b.id, nombre: b.nombre, color: b.color, icono: b.icono,
      inicio: b.inicio, fin: b.fin, semanas: b.semanas,
      estado, progresoPct, semanaEnCurso,
    };
  });

  const diasTotales = diasEntre(inicio, fin) + 1;
  const semanasTotales = Math.max(1, Math.ceil(diasTotales / 7));
  const diasRecorridos = Math.min(diasTotales, Math.max(0, diasEntre(inicio, hoy) + 1));
  const semanasRecorridas = Math.min(semanasTotales, Math.max(0, Math.floor(diasEntre(inicio, hoy) / 7) + (hoy >= inicio ? 1 : 0)));

  return {
    tramos,
    inicio,
    fin,
    semanasTotales,
    semanasRecorridas,
    progresoPct: Math.round((diasRecorridos / diasTotales) * 100),
    // `tramos` ya viene ordenado por fecha de inicio, así que con bandas
    // solapadas este `find` devuelve la más antigua (ver `actual` arriba).
    actual: tramos.find(t => t.estado === 'actual') ?? null,
    siguiente: tramos.find(t => t.estado === 'por-recorrer') ?? null,
    diasRestantes: Math.max(0, diasEntre(hoy, fin)),
    aunNoEmpieza: hoy < inicio,
  };
}
