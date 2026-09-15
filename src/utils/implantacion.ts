import { CoachClientTask } from '../types';
import { SetupItem, SetupResult, SetupStatus } from './clientSetup';
import {
  PasoDelRecorrido, BloqueRecorrido, MetaBloque, ORDEN_BLOQUES,
  BLOQUES_RECORRIDO, PASOS_DEL_RECORRIDO, idDePaso,
} from './recorridoDelPlan';

// ═══════════════════════════════════════════════════════════════════════════
// IMPLANTACIÓN — el estado de cada paso del recorrido.
//
// Puente entre las dos mitades que ya existían: el ORDEN lo pone
// `recorridoDelPlan.ts` y el ESTADO lo calcula `clientSetup.ts` leyendo los
// datos reales del atleta. Aquí solo se cruzan.
//
// No hay estado nuevo que guardar para los pasos que dejan rastro: si el
// mesociclo existe, el paso está hecho, y no hace falta que nadie marque una
// casilla. Solo los pasos que NO se pueden comprobar leyendo Firestore
// —«repasa el alta», «termina con un resumen»— se marcan a mano, y para eso se
// reutiliza `coachClientTasks`, que ya existe.
// ═══════════════════════════════════════════════════════════════════════════

export interface PasoConEstado {
  paso: PasoDelRecorrido;
  estado: SetupStatus;
  /** Los ítems de la checklist que lo comprueban. Vacío si se marca a mano. */
  items: SetupItem[];
  /** true = no deja rastro comprobable, se marca a mano. */
  manual: boolean;
  /** Lo que hay puesto ahora mismo: «4/7 días», «usa la default»… */
  detalle?: string;
  /** Fecha que el coach se puso para este paso (YYYY-MM-DD). */
  aviso?: string;
}

export interface BloqueConEstado {
  id: BloqueRecorrido;
  meta: MetaBloque;
  pasos: PasoConEstado[];
  /** Pasos hechos sobre el total contable del bloque. */
  donePct: number;
}

export interface RecorridoDeImplantacion {
  bloques: BloqueConEstado[];
  pct: number;
  /** El primero que reclama atención; si no hay, el primero pendiente. */
  siguiente: PasoConEstado | null;
  pendientes: number;
}

/**
 * El estado de un paso a partir de los ítems que lo comprueban.
 *
 * `attention` gana a `pending`: si una de las piezas está puesta pero mal (el
 * calendario de dietas a medias, una fase de periodización sin dieta), eso es
 * más urgente que una pieza que todavía no existe — lo segundo se ve venir, lo
 * primero parece hecho y no lo está.
 *
 * Los `na` no cuentan: un ítem que no aplica todavía no puede dejar el paso en
 * pendiente para siempre.
 */
export function estadoDeItems(items: SetupItem[]): SetupStatus {
  const contables = items.filter(i => i.status !== 'na');
  if (contables.length === 0) return 'na';
  if (contables.some(i => i.status === 'attention')) return 'attention';
  return contables.every(i => i.status === 'done') ? 'done' : 'pending';
}

/** Doc id determinista de la tarea manual de un paso — mismo patrón que los ítems sembrados. */
export function tareaDePaso(tasks: CoachClientTask[], paso: PasoDelRecorrido): CoachClientTask | undefined {
  return tasks.find(t => t.itemId === idDePaso(paso));
}

export function construirRecorrido(
  resultado: SetupResult,
  manualTasks: CoachClientTask[],
): RecorridoDeImplantacion {
  const porId = new Map<string, SetupItem>();
  for (const fase of resultado.phases) for (const item of fase.items) porId.set(item.id, item);

  const conEstado: PasoConEstado[] = PASOS_DEL_RECORRIDO.map(paso => {
    const items = (paso.comprueba ?? [])
      .map(id => porId.get(id))
      .filter((i): i is SetupItem => !!i);
    const manual = items.length === 0;
    const tarea = tareaDePaso(manualTasks, paso);

    return {
      paso,
      items,
      manual,
      estado: manual ? (tarea?.done ? 'done' : 'pending') : estadoDeItems(items),
      // El detalle sale de los propios ítems («4/7 días», «usa la default»):
      // decirle al coach QUÉ hay puesto evita que tenga que abrir el editor
      // solo para comprobar que sí.
      detalle: items.map(i => i.detail).filter(Boolean).join(' · ') || undefined,
      aviso: tarea?.dueDate,
    };
  });

  const bloques: BloqueConEstado[] = ORDEN_BLOQUES.map(id => {
    const pasos = conEstado.filter(p => p.paso.bloque === id);
    const contables = pasos.filter(p => p.estado !== 'na');
    return {
      id,
      meta: BLOQUES_RECORRIDO[id],
      pasos,
      donePct: contables.length === 0
        ? 100
        : Math.round((contables.filter(p => p.estado === 'done').length / contables.length) * 100),
    };
  });

  const contables = conEstado.filter(p => p.estado !== 'na');
  const pendientes = contables.filter(p => p.estado !== 'done').length;

  return {
    bloques,
    pct: contables.length === 0
      ? 100
      : Math.round((contables.filter(p => p.estado === 'done').length / contables.length) * 100),
    siguiente: conEstado.find(p => p.estado === 'attention')
      ?? conEstado.find(p => p.estado === 'pending')
      ?? null,
    pendientes,
  };
}
