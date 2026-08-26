import { CardioAssignment, CardioIntervalBlock, CardioProgram, CardioSession, CardioZones } from '../types';

/* ═══════════════════════════════════════════════════════════════════════════
   Progresión de cardio — Zona 2 y VO₂máx

   Petición de Dani (26-08): «igual que hay un trabajo de zona dos, un trabajo
   de VO2máx… que la aplicación sea capaz de hacer una progresión de ese tipo
   de cardio; la frecuencia cardíaca va a ir mejorando y el atleta va a tener
   que ir acumulando más carga de trabajo o más tiempo».

   Dos ejes de progresión, uno por tipo, porque la adaptación que se busca es
   distinta:

   · **Zona 2** progresa en TIEMPO. El estímulo es volumen a baja intensidad
     (densidad mitocondrial, oxidación de grasas): se sube la duración, nunca
     el ritmo. Por eso aquí se toca `targetDurationSec` y jamás la zona.
   · **VO₂máx** progresa en CARGA DE TRABAJO EN ZONA ALTA — número de series.
     Lo que importa es cuántos minutos se acumulan cerca del VO₂máx, y eso se
     consigue añadiendo repeticiones, no alargando cada una (un intervalo más
     largo del debido baja la intensidad y deja de ser VO₂máx).

   Y un tercer eje que ya funcionaba solo: al mejorar el atleta, su FCmax/LTHR
   se recalibran con un test y `defaultZonesFromAge`/`zonesFromLthr` mueven
   TODAS las bandas. Las series se prescriben por ZONA, nunca en ppm fijos, así
   que el programa se reajusta a la nueva forma física sin tocar nada.

   ── Cómo se decide la semana ──────────────────────────────────────────────
   No por calendario. La semana del programa es 1 + el número de semanas
   anteriores en las que el atleta HIZO al menos una sesión de ese programa.
   Quien se salta una semana la repite en vez de encontrarse una carga que no
   se ha ganado; quien entrena, avanza. Es la misma regla que un coach aplica
   a mano, y evita el fallo clásico del plan de 12 semanas por fecha: volver de
   dos semanas de vacaciones a la semana 8.

   ── Descargas ─────────────────────────────────────────────────────────────
   Cada cuarta semana baja la carga (3 de subida + 1 de descarga). No es
   decoración: el trabajo de VO₂máx es el que más fatiga central acumula, y sin
   descarga la progresión se rompe sola a las 5-6 semanas.

   Todo el módulo es lógica pura y testeable: no toca Firestore ni React. La
   prescripción NO se guarda semana a semana — se DERIVA del programa igual que
   `resolveExerciseForWeek` deriva la rutina de la semana del mesociclo.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface ProtocoloVo2max {
  id: string;
  label: string;
  /** Una línea para el coach: de dónde sale y para qué sirve. */
  descripcion: string;
  workSec: number;
  restSec: number;
  workZone: keyof CardioZones;
  restZone: keyof CardioZones;
  /** Series por semana del bloque. La longitud define el bloque (≥ 4). */
  repsPorSemana: number[];
  /** Sesiones de este tipo a la semana, por semana del bloque. */
  sesionesPorSemana: number[];
  warmupSec: number;
  cooldownSec: number;
}

/**
 * Los tres protocolos con más respaldo para subir el VO₂máx, cada uno para un
 * atleta distinto. Las series se prescriben en Z5 (>90% FCmax) porque es donde
 * está el estímulo; el 4×4 noruego se deja en Z4-Z5 a propósito: cuatro
 * minutos seguidos por encima del 90% no los sostiene nadie que no compita.
 *
 * La dosis manda sobre el protocolo. Lo que decide si una sesión de VO₂máx
 * sirve no es el formato (30/30, 4×4, 30/90) sino los MINUTOS DE TRABAJO
 * acumulados en zona: la horquilla útil son 10-20 min por sesión, 1-2 sesiones
 * a la semana y nunca dos seguidas — 48 h de margen como mínimo. Por eso:
 *
 * · las tablas de abajo llevan cada protocolo hasta esa horquilla en las
 *   semanas altas (Billat llega a 20 series = 10 min; el 4×4 a 5 = 20 min);
 * · `sesionesPorSemana` no pasa nunca de 2;
 * · el resumen dice los minutos de trabajo, que es el número con el que se
 *   juzga la sesión, no el número de series.
 */
export const PROTOCOLOS_VO2MAX: ProtocoloVo2max[] = [
  {
    id: 'noruego4x4',
    label: 'Noruego 4×4',
    descripcion: '4 min fuertes / 3 min suaves. El protocolo más estudiado para subir el VO₂máx (Helgerud, 2007). Para quien ya tiene base aeróbica.',
    workSec: 240, restSec: 180, workZone: 'z4', restZone: 'z2',
    repsPorSemana: [3, 4, 4, 3, 4, 5, 5, 4],
    sesionesPorSemana: [1, 1, 2, 1, 2, 2, 2, 1],
    warmupSec: 600, cooldownSec: 300,
  },
  {
    id: 'billat30_30',
    label: 'Billat 30/30',
    descripcion: '30 s fuertes / 30 s suaves encadenados. Acumula mucho tiempo cerca del VO₂máx con poca fatiga por serie — el mejor punto de entrada.',
    workSec: 30, restSec: 30, workZone: 'z5', restZone: 'z2',
    repsPorSemana: [8, 10, 12, 8, 12, 16, 20, 12],
    sesionesPorSemana: [1, 1, 2, 1, 2, 2, 2, 1],
    warmupSec: 600, cooldownSec: 300,
  },
  {
    id: 'sprints30_90',
    label: 'Series 30/90',
    descripcion: '30 s muy fuertes / 90 s de recuperación. Más anaeróbico y con descanso largo: el que mejor tolera quien viene solo de fuerza.',
    workSec: 30, restSec: 90, workZone: 'z5', restZone: 'z1',
    repsPorSemana: [6, 8, 10, 6, 10, 12, 14, 10],
    sesionesPorSemana: [1, 1, 2, 1, 2, 2, 2, 1],
    warmupSec: 600, cooldownSec: 300,
  },
];

export function protocoloVo2max(id: string): ProtocoloVo2max {
  return PROTOCOLOS_VO2MAX.find(p => p.id === id) ?? PROTOCOLOS_VO2MAX[1];
}

/** Semanas de un bloque antes de repetir el último microciclo. */
const CICLO = 4;

/**
 * Índice (0-based) dentro de la tabla del protocolo para la semana `n`
 * (1-based). Pasada la última semana definida no se congela la carga ni se
 * dispara al infinito: se repite el ÚLTIMO microciclo de 4 semanas, que ya
 * lleva su descarga dentro. Un programa así puede correr indefinidamente sin
 * quedarse plano ni acabar prescribiendo 30 series.
 */
export function indiceSemana(n: number, longitud: number): number {
  const semana = Math.max(1, Math.round(n));
  if (semana <= longitud) return semana - 1;
  const base = longitud - CICLO;
  return base + ((semana - longitud - 1) % CICLO);
}

/** ¿Es semana de descarga? Lo es cuando su carga baja respecto a la anterior. */
function esDescarga(reps: number[], i: number): boolean {
  return i > 0 && reps[i] < reps[i - 1];
}

export interface PrescripcionSemana {
  /** Semana del programa, 1-based, ya ajustada por lo que el atleta hizo. */
  semana: number;
  esDescarga: boolean;
  sesionesPorSemana: number;
  /** Frase para la tarjeta del atleta y para el panel del coach. */
  resumen: string;
  /** Solo 'vo2max': minutos acumulados EN LA ZONA DE TRABAJO, sin contar
   *  recuperaciones, calentamiento ni vuelta a la calma. Es la dosis real de
   *  la sesión y lo único que decide si sirve (horquilla útil: 10-20 min). */
  minutosDeTrabajo?: number;
  /** 'zona2' */
  targetDurationSec?: number;
  /** 'vo2max' */
  intervals?: CardioIntervalBlock[];
}

function min(sec: number): string {
  return sec % 60 === 0 ? `${sec / 60} min` : `${Math.round(sec)} s`;
}

/**
 * Sesión de VO₂máx de la semana `semana`, bloques incluidos: calentamiento en
 * Z2, N series de trabajo/recuperación y vuelta a la calma. El calentamiento
 * no es relleno — sin él las dos primeras series se hacen por debajo de la
 * zona objetivo y el estímulo se pierde justo donde más cuesta.
 */
export function sesionVo2max(protocolo: ProtocoloVo2max, semana: number): PrescripcionSemana {
  const i = indiceSemana(semana, protocolo.repsPorSemana.length);
  const reps = protocolo.repsPorSemana[i];
  const blocks: CardioIntervalBlock[] = [
    { label: 'Calentamiento', closeType: 'time', durationSec: protocolo.warmupSec, targetZone: 'z2' },
  ];
  for (let r = 1; r <= reps; r++) {
    blocks.push({ label: `Serie ${r}`, closeType: 'time', durationSec: protocolo.workSec, targetZone: protocolo.workZone });
    blocks.push({ label: r < reps ? `Recuperación ${r}` : 'Recuperación', closeType: 'time', durationSec: protocolo.restSec, targetZone: protocolo.restZone });
  }
  blocks.push({ label: 'Vuelta a la calma', closeType: 'time', durationSec: protocolo.cooldownSec, targetZone: 'z1' });

  const minutosDeTrabajo = Math.round((reps * protocolo.workSec) / 60);
  return {
    semana,
    esDescarga: esDescarga(protocolo.repsPorSemana, i),
    sesionesPorSemana: protocolo.sesionesPorSemana[i] ?? 1,
    intervals: blocks,
    minutosDeTrabajo,
    resumen: `${reps} × ${min(protocolo.workSec)} en ${protocolo.workZone.toUpperCase()} · ${min(protocolo.restSec)} suaves entre series · ${minutosDeTrabajo} min de trabajo`,
  };
}

/** Minutos de Zona 2 de la semana 1 si el coach no dice otra cosa. */
export const ZONA2_BASE_MIN_DEFECTO = 30;
/** Techo: más del doble de la base ya no es progresión, es otro programa. */
const ZONA2_TECHO_FACTOR = 2;
/** +8% semanal — la regla del 10% de toda la vida, un punto por debajo. */
const ZONA2_INCREMENTO = 0.08;
const ZONA2_DESCARGA = 0.7;

/**
 * Duración de la sesión de Zona 2 de la semana `semana`. Sube un 8% cada
 * semana sobre la base, con descarga cada cuarta y un techo del doble de la
 * base. Se redondea a minutos enteros, no a tramos de 5: con una base de 30
 * min, un 8% son 2,4 min y redondear a 5 dejaba dos semanas seguidas con el
 * mismo número — una progresión que no progresa.
 */
export function sesionZona2(baseMin: number, semana: number, targetZone: keyof CardioZones = 'z2'): PrescripcionSemana {
  const base = Math.max(10, baseMin);
  const n = Math.max(1, Math.round(semana));
  const descarga = n % CICLO === 0;
  // Las semanas de descarga no cuentan como subida: la escalera la marcan las
  // semanas de carga, si no una descarga «gastaría» un peldaño.
  const peldanos = n - 1 - Math.floor((n - 1) / CICLO);
  const bruto = base * (1 + ZONA2_INCREMENTO * peldanos);
  const conTecho = Math.min(bruto, base * ZONA2_TECHO_FACTOR);
  const minutos = Math.round(descarga ? conTecho * ZONA2_DESCARGA : conTecho);

  return {
    semana: n,
    esDescarga: descarga,
    sesionesPorSemana: 3,
    targetDurationSec: minutos * 60,
    resumen: `${minutos} min continuos en ${targetZone.toUpperCase()}${descarga ? ' · semana de descarga' : ''}`,
  };
}

// ─── En qué semana va el atleta ────────────────────────────────────────────

/** Lunes de la semana ISO de una fecha YYYY-MM-DD, como YYYY-MM-DD. */
export function lunesDe(fechaIso: string): string {
  const d = new Date(`${fechaIso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return fechaIso;
  const dow = (d.getUTCDay() + 6) % 7; // 0 = lunes
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

/**
 * Semana del programa que le toca hoy: 1 + el número de semanas ANTERIORES a
 * la actual (desde el arranque del programa) en las que el atleta registró al
 * menos una sesión de este programa.
 *
 * Se cuentan semanas con trabajo, no semanas de calendario, por lo dicho en la
 * cabecera. `sesiones` puede traer todo el histórico del atleta: se filtra por
 * `assignmentId` para no contar el cardio suelto que hiciera por su cuenta.
 */
export function semanaDelPrograma(
  program: CardioProgram,
  assignmentId: string,
  sesiones: Pick<CardioSession, 'date' | 'assignmentId'>[],
  hoyIso: string,
): number {
  const inicio = lunesDe(program.startDate);
  const semanaActual = lunesDe(hoyIso);
  const semanasConTrabajo = new Set<string>();
  for (const s of sesiones) {
    if (s.assignmentId !== assignmentId) continue;
    const semana = lunesDe(s.date);
    if (semana < inicio || semana >= semanaActual) continue;
    semanasConTrabajo.add(semana);
  }
  return 1 + semanasConTrabajo.size;
}

/** La prescripción de esta semana para un programa, sea del tipo que sea. */
export function prescripcionDeSemana(program: CardioProgram, semana: number): PrescripcionSemana {
  return program.kind === 'vo2max'
    ? sesionVo2max(protocoloVo2max(program.protocolId), semana)
    : sesionZona2(program.baseMinutes ?? ZONA2_BASE_MIN_DEFECTO, semana, program.targetZone ?? 'z2');
}

/**
 * Devuelve la asignación con la prescripción de ESTA semana ya aplicada
 * (duración o bloques). Una asignación sin `program` se devuelve intacta: los
 * cardios sueltos que el coach ya tenía creados siguen funcionando igual.
 *
 * Se aplica en el punto en el que la app elige el cardio activo, para que la
 * pantalla del atleta, el reproductor en vivo y el panel del coach vean todos
 * exactamente la misma sesión sin duplicar la lógica.
 */
export function resolverAsignacionCardio<T extends CardioAssignment | undefined>(
  assignment: T,
  sesiones: Pick<CardioSession, 'date' | 'assignmentId'>[],
  hoyIso: string,
): T {
  if (!assignment?.program) return assignment;
  const semana = semanaDelPrograma(assignment.program, assignment.id, sesiones, hoyIso);
  const p = prescripcionDeSemana(assignment.program, semana);
  return {
    ...assignment,
    targetDurationSec: p.intervals
      ? p.intervals.reduce((sum, b) => sum + b.durationSec, 0)
      : p.targetDurationSec ?? assignment.targetDurationSec,
    intervals: p.intervals ?? assignment.intervals,
    timesPerWeek: p.sesionesPorSemana,
  };
}

/**
 * Las próximas `n` semanas del programa, para que el coach vea a dónde lleva
 * lo que acaba de prescribir antes de dárselo a nadie.
 */
export function previaDelPrograma(program: CardioProgram, semanaActual: number, n = 8): PrescripcionSemana[] {
  return Array.from({ length: n }, (_, i) => prescripcionDeSemana(program, semanaActual + i));
}
