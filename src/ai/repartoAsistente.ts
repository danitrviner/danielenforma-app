import { MUSCLE_LABELS, MUSCLE_ORDER, type MuscleGroup, type RepartoPropio, type Mesocycle } from '../types';
import { DESCANSO } from '../utils/trainingSplits';
import { calcularRepartos, evaluarRepartoActual, type OpcionDeReparto, type EntradaCalculadora } from '../utils/calculadoraReparto';
import type { ValidationIssue } from './validators';

/* ═══════════════════════════════════════════════════════════════════════════
   Repartos para el asistente

   El asistente usa las MISMAS piezas que el coach en Distribución: la
   calculadora de frecuencias, «Mis repartos» y el reparto propio del
   mesociclo. Aquí solo se traduce entre lo que escribe/lee el modelo y lo que
   guarda la app:

     { nombre, dias: [{ tipo: "Empuje", grupos: ["pecho", …] }, { tipo: "Descanso" }, …] }

   Un día «Descanso» es un `null` del reparto. Lo que devuelve
   `calcular_reparto` ya va en esta forma, así que el modelo puede pasarlo tal
   cual a `propose_mesocycle`.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface DiaParaAsistente { tipo: string; grupos?: string[] }
export interface RepartoParaAsistente {
  nombre?: string;
  dias: DiaParaAsistente[];
  frecuencias?: Record<string, number>;
}

const GRUPOS_VALIDOS = new Set<string>(MUSCLE_ORDER);
const esDescanso = (tipo: unknown) => typeof tipo === 'string' && tipo.trim().toLowerCase() === DESCANSO.toLowerCase();

export function repartoParaAsistente(r: RepartoPropio): RepartoParaAsistente {
  return {
    nombre: r.nombre,
    dias: r.dias.map(d => (d ? { tipo: d.tipo, grupos: [...d.grupos] } : { tipo: DESCANSO })),
    ...(r.frecuencias ? { frecuencias: { ...r.frecuencias } as Record<string, number> } : {}),
  };
}

/**
 * El reparto que manda el modelo, validado. `null` si no viene. Los problemas
 * se devuelven todos juntos y con el campo, como el resto de validadores, para
 * que el modelo corrija de una vez.
 */
export function repartoDesdeAsistente(raw: unknown): { reparto: RepartoPropio | null; issues: ValidationIssue[] } {
  if (raw === undefined || raw === null) return { reparto: null, issues: [] };
  const issues: ValidationIssue[] = [];
  const obj = raw as Partial<RepartoParaAsistente>;
  if (!Array.isArray(obj.dias) || obj.dias.length === 0) {
    return { reparto: null, issues: [{ field: 'reparto.dias', message: 'reparto.dias necesita un día por cada día del ciclo (los libres con tipo "Descanso")' }] };
  }
  if (obj.dias.length > 28) issues.push({ field: 'reparto.dias', message: `Un ciclo de ${obj.dias.length} días es demasiado largo (máx. 28)` });

  const dias = obj.dias.map((d, i): RepartoPropio['dias'][number] => {
    if (esDescanso(d?.tipo)) return null;
    const tipo = typeof d?.tipo === 'string' ? d.tipo.trim() : '';
    if (!tipo) issues.push({ field: `reparto.dias[${i}].tipo`, message: `El día ${i + 1} no tiene nombre (usa "Descanso" para los días libres)` });
    const grupos = Array.isArray(d?.grupos) ? d.grupos : [];
    const malos = grupos.filter(g => !GRUPOS_VALIDOS.has(g));
    if (malos.length) issues.push({ field: `reparto.dias[${i}].grupos`, message: `Grupos inválidos en el día ${i + 1}: ${malos.join(', ')} — válidos: ${MUSCLE_ORDER.join(', ')}` });
    const validos = [...new Set(grupos.filter(g => GRUPOS_VALIDOS.has(g)))] as MuscleGroup[];
    if (validos.length === 0) issues.push({ field: `reparto.dias[${i}].grupos`, message: `El día ${i + 1} («${tipo}») no entrena ningún grupo` });
    return { tipo, grupos: validos };
  });
  if (!dias.some(Boolean)) issues.push({ field: 'reparto.dias', message: 'El reparto no tiene ningún día de entrenamiento' });

  let frecuencias: RepartoPropio['frecuencias'];
  if (obj.frecuencias && typeof obj.frecuencias === 'object') {
    frecuencias = {};
    for (const [g, f] of Object.entries(obj.frecuencias)) {
      if (GRUPOS_VALIDOS.has(g) && typeof f === 'number' && f > 0) frecuencias[g as MuscleGroup] = f;
    }
  }

  const reparto: RepartoPropio = {
    nombre: typeof obj.nombre === 'string' && obj.nombre.trim() ? obj.nombre.trim() : 'Reparto del asistente',
    dias,
    ...(frecuencias && Object.keys(frecuencias).length ? { frecuencias } : {}),
  };
  return { reparto: issues.length ? null : reparto, issues };
}

/** Sesiones de un reparto (sus días no libres). */
export const sesionesDelReparto = (r: RepartoPropio) => r.dias.filter(Boolean).length;

const LETRAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const NOMBRES = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

/** Días de la semana (0 = lunes) desde lo que mande el modelo: "L", "lunes", 0… */
export function diasSemanaDesdeAsistente(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const dias = raw.map(d => {
    if (typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 6) return d;
    if (typeof d !== 'string') return -1;
    const t = d.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const porLetra = LETRAS.findIndex(l => l.toLowerCase() === t);
    return porLetra >= 0 ? porLetra : NOMBRES.findIndex(n => n === t || (t.length >= 3 && n.startsWith(t)));
  }).filter(d => d >= 0);
  return [...new Set(dias)].sort((a, b) => a - b);
}

function resumirOpcion(o: OpcionDeReparto, inicioSemana: number, mejor: boolean) {
  return {
    estrategia: o.estrategia,
    ...(mejor ? { mejorEncaje: true } : {}),
    cicloDias: o.cicloDias,
    sesiones: o.sesiones.map(s => ({
      dia: `${LETRAS[(inicioSemana + s.dia) % 7]} (día ${s.dia + 1})`,
      tipo: s.tipo,
      series: s.grupos.filter(x => x.series > 0).map(x => `${MUSCLE_LABELS[x.grupo]} ${x.series}`).join(', '),
      total: s.total,
    })),
    frecuenciasQueNoCumple: Object.entries(o.frecuencias)
      .filter(([, f]) => f && f.objetivo > 0 && f.objetivo !== f.conseguida)
      .map(([g, f]) => `${MUSCLE_LABELS[g as MuscleGroup]}: ${f!.conseguida}× (pides ${f!.objetivo}×)`),
    avisos: o.avisos,
    reparto: repartoParaAsistente(o.reparto),
  };
}

/**
 * Lo que devuelve `calcular_reparto`: las mismas opciones que la hoja de la
 * calculadora, más el reparto actual del atleta si tiene mesociclo.
 */
export function calcularRepartoParaAsistente(entrada: EntradaCalculadora, mesoActual?: Mesocycle | null) {
  const r = calcularRepartos(entrada);
  const inicio = entrada.inicioSemana ?? 0;
  const mejor = r.opciones.length ? r.opciones.reduce((a, b) => (b.coste < a.coste ? b : a)).id : null;
  const actual = mesoActual ? evaluarRepartoActual(mesoActual, entrada) : null;
  return {
    cicloDias: r.cicloDias,
    avisos: r.avisos,
    ...(actual ? { repartoActual: resumirOpcion(actual, inicio, false) } : {}),
    opciones: r.opciones.map(o => resumirOpcion(o, inicio, o.id === mejor)),
    note: r.opciones.length
      ? `Para proponerlo: propose_mesocycle con reparto = el "reparto" de la opción elegida tal cual y days_per_week = sus sesiones (${r.opciones[0].sesiones.length}). Explícale a Dani por qué esa opción y no otra.`
      : 'No sale ningún reparto con estos datos: revisa los avisos.',
  };
}
