// ─── Modal "Plantilla de cuestionarios del mesociclo" ──────────────────────────
// Las 4 plantillas del handoff de diseño (Hipertrofia·6, Fuerza·7, Definición·8,
// Descarga·2), pero mapeadas a los CUESTIONARIOS REALES del coach en vez de a
// nombres inventados: "Aplicar al bloque" crea `QuestionnaireAssignment`
// reales, no un dato de attrezzo. Una fila cuyo disparador es un EVENTO real
// ("tras cada sesión de pierna") no genera asignación — el motor de
// cuestionarios (QSchedule) no modela "después de X", así que se deja
// informativa en la tabla y fuera del recuento de "se crearán N cuestionarios".

import { QSchedule, Mesocycle } from '../types';
import { addDays } from './trainingWeek';

// ── Modelo de fila ───────────────────────────────────────────────────────────

export type FilaSchedule =
  // Patrón semanal — uno o varios días de la semana (0=dom..6=sáb, igual que
  // QSchedule/Date.getDay()), opcionalmente solo cada N semanas empezando en
  // una semana concreta (1-indexada) — así "viernes de semanas 2, 4 y 6" es
  // `{ weekdays: [5], cadaNSemanas: 2, primeraSemanaConOcurrencia: 2 }`.
  | { kind: 'semanal'; weekdays: number[]; cadaNSemanas?: number; primeraSemanaConOcurrencia?: number }
  // Días concretos del bloque, 1-indexados desde el inicio (día 1 = fecha de
  // inicio del mesociclo).
  | { kind: 'dias-del-bloque'; dias: number[] }
  // Disparado por un evento real (p. ej. "tras cada sesión de pierna") que el
  // motor de cuestionarios no puede programar por calendario — no genera
  // asignación automática.
  | { kind: 'evento' };

export interface FilaPlantilla {
  /** Nombre tal cual lo pide el handoff — se muestra en la tabla del modal. */
  etiqueta: string;
  /** Título EXACTO de un cuestionario real de `QUESTIONNAIRE_PRESETS` /
   *  la biblioteca del coach — nunca un nombre inventado. */
  cuestionarioTitulo: string;
  cuando: string;   // texto libre para la columna "Cuándo" (igual que el handoff)
  canal: string;
  tipo: 'Obligatorio' | 'Opcional';
  schedule: FilaSchedule;
}

export interface PlantillaCuestionarios {
  clave: string;              // 'Hipertrofia · 6 sem', etc. — clave de UI
  semanasSugeridas: number;
  filas: FilaPlantilla[];
  excepciones: string[];
}

// ── Las 4 plantillas ─────────────────────────────────────────────────────────
// Los títulos de `cuestionarioTitulo` son los reales de la biblioteca del
// coach (ver src/data/questionnairePresets.ts) — si alguno no existe todavía
// en Firestore, `construirAsignaciones` lo crea antes desde el preset.

export const PLANTILLAS: PlantillaCuestionarios[] = [
  {
    clave: 'Hipertrofia · 6 sem',
    semanasSugeridas: 6,
    filas: [
      { etiqueta: 'Check-in semanal', cuestionarioTitulo: 'Revisión Semanal', cuando: 'Lunes de cada semana · 08:00', canal: 'App + push', tipo: 'Obligatorio', schedule: { kind: 'semanal', weekdays: [1] } },
      { etiqueta: 'Foto + medidas', cuestionarioTitulo: 'Mediciones', cuando: 'Día 1 y día 42 del bloque', canal: 'App', tipo: 'Obligatorio', schedule: { kind: 'dias-del-bloque', dias: [1, 42] } },
      { etiqueta: 'Agujetas tras pierna', cuestionarioTitulo: 'DOM\'s o "agujetas"', cuando: 'Viernes de semanas 2, 4 y 6', canal: 'App', tipo: 'Opcional', schedule: { kind: 'semanal', weekdays: [5], cadaNSemanas: 2, primeraSemanaConOcurrencia: 2 } },
      { etiqueta: 'Revisión de mitad de bloque', cuestionarioTitulo: 'Revisión Semana 3', cuando: 'Día 21 · con videollamada', canal: 'Coach', tipo: 'Obligatorio', schedule: { kind: 'dias-del-bloque', dias: [21] } },
      { etiqueta: 'Feedback de sesión de pierna', cuestionarioTitulo: '', cuando: 'Tras cada sesión de pierna', canal: 'In-app al cerrar sesión', tipo: 'Opcional', schedule: { kind: 'evento' } },
      { etiqueta: 'Test de fuerza · cierre de bloque', cuestionarioTitulo: 'Datos sobre final de mesociclo', cuando: 'Día 41 del bloque', canal: 'App', tipo: 'Obligatorio', schedule: { kind: 'dias-del-bloque', dias: [41] } },
    ],
    excepciones: [
      'Semana de descarga: solo check-in semanal, se omite el resto.',
      'Festivos y vacaciones marcadas: el cuestionario salta al día siguiente hábil.',
      'Sin respuesta en 48 h: un recordatorio y aviso al coach.',
      'Si el atleta pausa el plan, los cuestionarios pendientes se posponen, no se pierden.',
    ],
  },
  {
    clave: 'Fuerza · 7 sem',
    semanasSugeridas: 7,
    filas: [
      { etiqueta: 'Check-in semanal', cuestionarioTitulo: 'Revisión Semanal', cuando: 'Lunes de cada semana · 08:00', canal: 'App + push', tipo: 'Obligatorio', schedule: { kind: 'semanal', weekdays: [1] } },
      { etiqueta: 'RPE de sesión pesada', cuestionarioTitulo: '', cuando: 'Tras cada sesión de básicos', canal: 'In-app', tipo: 'Obligatorio', schedule: { kind: 'evento' } },
      { etiqueta: 'Foto + medidas', cuestionarioTitulo: 'Mediciones', cuando: 'Día 1 y día 49', canal: 'App', tipo: 'Opcional', schedule: { kind: 'dias-del-bloque', dias: [1, 49] } },
      { etiqueta: 'Test de 1RM estimado', cuestionarioTitulo: 'Datos sobre final de mesociclo', cuando: 'Día 48', canal: 'Coach', tipo: 'Obligatorio', schedule: { kind: 'dias-del-bloque', dias: [48] } },
    ],
    excepciones: [
      'Semana de test: se omite el RPE diario.',
      'Molestia articular reportada: se inserta cuestionario de dolor a las 24 h.',
      'Sin respuesta en 48 h: un recordatorio y aviso al coach.',
    ],
  },
  {
    clave: 'Definición · 8 sem',
    semanasSugeridas: 8,
    filas: [
      { etiqueta: 'Check-in semanal', cuestionarioTitulo: 'Revisión Semanal', cuando: 'Lunes de cada semana · 08:00', canal: 'App + push', tipo: 'Obligatorio', schedule: { kind: 'semanal', weekdays: [1] } },
      { etiqueta: 'Peso y cintura', cuestionarioTitulo: 'Control de medidas', cuando: 'Lunes, miércoles y viernes', canal: 'App', tipo: 'Obligatorio', schedule: { kind: 'semanal', weekdays: [1, 3, 5] } },
      { etiqueta: 'Hambre, sueño y energía', cuestionarioTitulo: '📝Revisión express (semanal)', cuando: 'Domingos', canal: 'App', tipo: 'Obligatorio', schedule: { kind: 'semanal', weekdays: [0] } },
      { etiqueta: 'Foto de progreso', cuestionarioTitulo: 'Mediciones', cuando: 'Día 1, 28 y 56', canal: 'App', tipo: 'Obligatorio', schedule: { kind: 'dias-del-bloque', dias: [1, 28, 56] } },
      { etiqueta: 'Revisión de macros', cuestionarioTitulo: 'Revisión Quincenal Completa', cuando: 'Día 14, 28 y 42', canal: 'Coach', tipo: 'Obligatorio', schedule: { kind: 'dias-del-bloque', dias: [14, 28, 42] } },
    ],
    excepciones: [
      'Adherencia por debajo del 70% dos semanas: se adelanta la revisión de macros.',
      'Semana de recarga: no se pide peso diario.',
      'Sin respuesta en 48 h: un recordatorio y aviso al coach.',
    ],
  },
  {
    clave: 'Descarga · 2 sem',
    semanasSugeridas: 2,
    filas: [
      { etiqueta: 'Check-in semanal', cuestionarioTitulo: 'Revisión Semanal', cuando: 'Lunes de cada semana', canal: 'App', tipo: 'Obligatorio', schedule: { kind: 'semanal', weekdays: [1] } },
      { etiqueta: 'Fatiga y sueño', cuestionarioTitulo: '📝Revisión express (semanal)', cuando: 'Día 7 y día 14', canal: 'App', tipo: 'Obligatorio', schedule: { kind: 'dias-del-bloque', dias: [7, 14] } },
    ],
    excepciones: [
      'Nada de tests ni fotos durante la descarga.',
      'Sin respuesta en 48 h: un recordatorio, sin aviso al coach.',
    ],
  },
];

// ── Expansión de fechas ──────────────────────────────────────────────────────

export interface OcurrenciaFila {
  fila: FilaPlantilla;
  fecha: string; // YYYY-MM-DD
}

/** Todas las fechas dentro de `[inicio, fin]` (inclusive) cuyo día de semana está en `weekdays`. */
function fechasPorDiaDeSemana(inicio: string, fin: string, weekdays: number[]): string[] {
  const set = new Set(weekdays);
  const out: string[] = [];
  let cursor = inicio;
  while (cursor <= fin) {
    const wd = new Date(cursor + 'T00:00:00').getDay();
    if (set.has(wd)) out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

/** Fechas de una fila `semanal` con `cadaNSemanas`: filtra a solo las semanas que caen en el patrón desde `primeraSemanaConOcurrencia`. */
function fechasConCadencia(inicio: string, fin: string, fila: Extract<FilaSchedule, { kind: 'semanal' }>): string[] {
  const todas = fechasPorDiaDeSemana(inicio, fin, fila.weekdays);
  if (!fila.cadaNSemanas || fila.cadaNSemanas <= 1) return todas;
  const primera = fila.primeraSemanaConOcurrencia ?? 1;
  return todas.filter(f => {
    const semana = Math.floor(Math.round((new Date(f + 'T00:00:00').getTime() - new Date(inicio + 'T00:00:00').getTime()) / 86400000) / 7) + 1;
    return semana >= primera && (semana - primera) % fila.cadaNSemanas === 0;
  });
}

/** Expande una plantilla a ocurrencias reales de fecha, recortadas a `[inicio, fin]` del bloque. */
export function expandirPlantilla(plantilla: PlantillaCuestionarios, inicio: string, fin: string): OcurrenciaFila[] {
  const ocurrencias: OcurrenciaFila[] = [];
  for (const fila of plantilla.filas) {
    if (fila.schedule.kind === 'evento') continue;
    if (fila.schedule.kind === 'semanal') {
      for (const fecha of fechasConCadencia(inicio, fin, fila.schedule)) ocurrencias.push({ fila, fecha });
    } else {
      for (const dia of fila.schedule.dias) {
        const fecha = addDays(inicio, dia - 1);
        if (fecha >= inicio && fecha <= fin) ocurrencias.push({ fila, fecha });
      }
    }
  }
  return ocurrencias.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// ── Construcción de QuestionnaireAssignment reales ──────────────────────────

export interface AsignacionAPlicar {
  fila: FilaPlantilla;
  questionnaireId: string;
  schedule: QSchedule;
  startDate: string;
}

/**
 * Traduce cada fila expresable (todas menos `evento`) a UNA asignación real
 * — `schedule` en el formato del motor de cuestionarios de la app, no el
 * `FilaSchedule` interno del modal. Necesita el id real de cada cuestionario
 * (`titulosAIds`, resuelto en `construirAsignaciones` antes de llamar aquí).
 */
export function planificarAsignaciones(
  plantilla: PlantillaCuestionarios, inicio: string, titulosAIds: Map<string, string>,
): AsignacionAPlicar[] {
  const out: AsignacionAPlicar[] = [];
  for (const fila of plantilla.filas) {
    if (fila.schedule.kind === 'evento') continue;
    const questionnaireId = titulosAIds.get(fila.cuestionarioTitulo);
    if (!questionnaireId) continue; // no debería pasar si construirAsignaciones ya creó lo que faltaba
    if (fila.schedule.kind === 'semanal') {
      const primeraFecha = fechasConCadencia(inicio, addDays(inicio, 365), fila.schedule)[0] ?? inicio;
      out.push({
        fila, questionnaireId, startDate: primeraFecha,
        schedule: fila.schedule.cadaNSemanas && fila.schedule.cadaNSemanas > 1
          ? { type: 'interval', intervalDays: fila.schedule.cadaNSemanas * 7 }
          : { type: 'weekdays', weekdays: fila.schedule.weekdays },
      });
    } else {
      // Una asignación 'once' por cada día del bloque — QuestionnaireAssignment
      // es un objeto recurrente, así que "día 1 y día 42" son DOS asignaciones,
      // no una con dos disparos.
      for (const dia of fila.schedule.dias) {
        const fecha = addDays(inicio, dia - 1);
        out.push({ fila, questionnaireId, startDate: fecha, schedule: { type: 'once' } });
      }
    }
  }
  return out;
}

/** Nº de cuestionarios que "Aplicar al bloque" va a crear de verdad — el mismo total que la expansión, para el resumen del pie del modal. */
export function totalOcurrencias(plantilla: PlantillaCuestionarios, inicio: string, fin: string): number {
  return expandirPlantilla(plantilla, inicio, fin).length;
}

/** Rango de fechas del bloque a partir de un mesociclo — conveniencia para el modal. */
export function rangoDelBloque(meso: Pick<Mesocycle, 'startDate' | 'weeks'>): { inicio: string; fin: string } {
  return { inicio: meso.startDate, fin: addDays(meso.startDate, meso.weeks * 7 - 1) };
}
