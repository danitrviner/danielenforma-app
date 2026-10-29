import type { BloquesRespuesta, QuestionnaireQuestion, QuestionnaireResponse } from '../types';
import type { CambioAtleta } from './cambiosAtleta';
import type { EvaluacionDelPlan, SemanaDelPlan } from './seguimientoPlan';
import { alertasDeRespuesta, type AlertaRevision } from './alertasRevision';
import { esComentario } from './textoDeRespuesta';

/* ═══════════════════════════════════════════════════════════════════════════
   Borrador de la respuesta a la revisión (29-10-2026)

   Decisión de Dani (28-10): la respuesta de la semana la PREPARA el asistente
   y la FIRMA él. Tres bloques fijos —cómo ha ido · qué cambia · qué espero
   ver— rellenados con lo que ya está medido: el seguimiento del plan
   (`seguimientoPlan.ts`), los cambios que el coach hizo esta semana
   (`cambiosAtleta`), las alertas del cuestionario y lo que el atleta escribió.

   Es determinista a propósito: mismos datos, mismo texto, cero coste y sin
   esperar a nada. El modelo no hace falta para esto; lo que convierte el
   borrador en una respuesta es que Dani lo lea, lo toque y lo firme. Nada de
   aquí llega al atleta sin ese paso (RespuestaCoachBox).

   Reglas de voz (referencias/tono.md de la skill whatsapp-clientes): tuteo,
   nombre de pila, frases cortas, sin reproche, sin cifras que el atleta no
   pueda interpretar (ni «desvío» ni rojo: si va lento, qué hacer esta semana).
   ═══════════════════════════════════════════════════════════════════════════ */

export interface EntradaBorrador {
  nombre: string;
  respuesta: Pick<QuestionnaireResponse, 'answers'>;
  preguntas: QuestionnaireQuestion[];
  /** Sesiones hechas y pautadas en los últimos 7 días. */
  sesiones?: { hechas: number; pautadas: number } | null;
  evaluacion?: EvaluacionDelPlan | null;
  /** La semana que viene del plan, para «qué espero ver». */
  semanaQueViene?: SemanaDelPlan | null;
  /** Cambios del coach de los últimos 7 días (`cambiosAtleta`). */
  cambios?: CambioAtleta[];
}

const nombreCorto = (n: string) => {
  const p = n.trim().split(/\s+/)[0] ?? '';
  return p ? p[0].toUpperCase() + p.slice(1) : '';
};
const kg = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const miles = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** Lo que el atleta escribió a mano: textos de más de 20 caracteres, con su pregunta. */
export function textosLibres(preguntas: QuestionnaireQuestion[], respuesta: Pick<QuestionnaireResponse, 'answers'>): { pregunta: string; texto: string }[] {
  const porId = new Map(preguntas.map(q => [q.id, q]));
  const out: { pregunta: string; texto: string }[] = [];
  for (const a of respuesta.answers) {
    if (typeof a.value !== 'string' || a.value.trim().length <= 20) continue;
    const base = esComentario(a.questionId) ? a.questionId.replace(/__comentario$/, '') : a.questionId;
    const q = porId.get(base);
    if (q && q.type !== 'text' && !esComentario(a.questionId)) continue;
    out.push({ pregunta: q?.tituloCorto ?? q?.label ?? '', texto: a.value.trim() });
  }
  return out;
}

function fraseSesiones(s: EntradaBorrador['sesiones']): string | null {
  if (!s || s.pautadas === 0) return null;
  if (s.hechas >= s.pautadas) return `${s.hechas} de ${s.pautadas} entrenos hechos`;
  if (s.hechas === 0) return `ningún entreno registrado de ${s.pautadas}`;
  return `${s.hechas} de ${s.pautadas} entrenos`;
}

function frasePeso(ev: EvaluacionDelPlan | null | undefined): string | null {
  if (!ev || ev.ritmo == null) return null;
  const r = ev.ritmo;
  const texto = r === 0 ? 'el peso igual' : `el peso ${r < 0 ? 'bajando' : 'subiendo'} ${kg(Math.abs(r))} kg a la semana`;
  if (ev.estado === 'en-plan') return `${texto}, justo en el ritmo que buscamos`;
  // Nada de «desvío» ni de rojo (Dani, 28-10): se dice lo que hay y lo que se hace.
  const objetivoBaja = (ev.ritmoPlan ?? 0) < 0;
  const lento = objetivoBaja ? ev.estado === 'por-encima' : ev.estado === 'por-debajo';
  return lento ? `${texto}, algo más despacio de lo previsto` : `${texto}, más rápido de lo previsto`;
}

function fraseAlertas(alertas: AlertaRevision[], libres: { pregunta: string; texto: string }[]): string | null {
  const molestia = alertas.find(a => a.tipo === 'molestia');
  if (molestia) {
    const detalle = molestia.texto.replace(/^Molestia:\s*/, '');
    return detalle === 'Ha marcado una molestia o lesión'
      ? 'Lo de la molestia que has marcado lo he leído.'
      : `Lo de «${detalle.length > 60 ? `${detalle.slice(0, 57)}…` : detalle}» lo he leído.`;
  }
  const lesion = libres.find(l => /lesi|molest|dolor/i.test(l.pregunta));
  if (lesion && !/^(no|nada|ninguna|ninguno)[.!\s]*$/i.test(lesion.texto)) {
    return `Lo de «${lesion.texto.length > 60 ? `${lesion.texto.slice(0, 57)}…` : lesion.texto}» lo he leído.`;
  }
  const agujetas = alertas.find(a => a.tipo === 'agujetas');
  if (agujetas) return `${agujetas.texto.replace(/^Agujetas 5 en /, 'Las agujetas fuertes en ')}: lo tengo en cuenta esta semana.`;
  return null;
}

function cambiosEnSuIdioma(cambios: CambioAtleta[]): string[] {
  return cambios.slice(0, 3).map(c => {
    const lineas = c.lineas.filter(l => !/→ otra dieta/.test(l)).slice(0, 2).join('; ');
    const que = c.titulo.replace(/^Dieta «(.+)»$/, 'la dieta $1').replace(/^Mesociclo /, 'el bloque ');
    return lineas ? `${que}: ${lineas}` : que;
  });
}

export function borradorDeRespuesta(e: EntradaBorrador): BloquesRespuesta {
  const nombre = nombreCorto(e.nombre);
  const alertas = alertasDeRespuesta(e.preguntas, e.respuesta.answers);
  const libres = textosLibres(e.preguntas, e.respuesta);

  // ── Cómo ha ido ──────────────────────────────────────────────────────────
  const hechos = [fraseSesiones(e.sesiones), frasePeso(e.evaluacion)].filter((x): x is string => !!x);
  const buena = e.sesiones ? e.sesiones.hechas >= Math.max(1, e.sesiones.pautadas - 1) : true;
  const arranque = hechos.length > 0
    ? `${buena ? 'Buena semana' : 'Semana floja'}${nombre ? `, ${nombre}` : ''}: ${hechos.join(' y ')}.`
    : `${nombre ? `${nombre}, ` : ''}he leído tu revisión.`;
  const comoHaIdo = [arranque, fraseAlertas(alertas, libres)].filter(Boolean).join(' ');

  // ── Qué cambia ───────────────────────────────────────────────────────────
  const cambios = cambiosEnSuIdioma(e.cambios ?? []);
  const queCambia = cambios.length > 0
    ? `Esta semana cambio ${cambios.join('. ')}. Lo demás sigue igual.`
    : 'Esta semana no cambio nada: el plan sigue igual.';
  const seguimiento = alertas.some(a => a.tipo === 'molestia')
    ? ' Si la molestia sigue, me lo pones el viernes y lo cambio.'
    : '';

  // ── Qué espero ver ───────────────────────────────────────────────────────
  const s = e.semanaQueViene;
  const partes: string[] = [];
  if (s?.franja) partes.push(`el peso entre ${kg(s.franja[0])} y ${kg(s.franja[1])} kg`);
  if (s?.pasosPlan) partes.push(`los pasos en torno a ${miles(s.pasosPlan)}`);
  if (e.sesiones?.pautadas) partes.push(`${e.sesiones.pautadas === 1 ? 'el entreno hecho' : `los ${e.sesiones.pautadas} entrenos hechos`}`);
  const queEspero = partes.length > 0
    ? `La semana que viene: ${partes.join(', ')}. Con eso te ajusto el lunes.`
    : 'Que registres entrenos y comida: con eso te ajusto el lunes.';

  return { comoHaIdo, queCambia: queCambia + seguimiento, queEspero };
}

const TITULOS: Record<keyof BloquesRespuesta, string> = {
  comoHaIdo: 'Cómo ha ido',
  queCambia: 'Qué cambia esta semana',
  queEspero: 'Qué espero ver',
};

/** Los tres bloques como un solo texto (lo que se guarda en `texto` y se copia a WhatsApp). */
export function textoDeBloques(b: BloquesRespuesta, conTitulos = false): string {
  return (Object.keys(TITULOS) as (keyof BloquesRespuesta)[])
    .map(k => b[k].trim())
    .map((t, i) => (conTitulos && t ? `${Object.values(TITULOS)[i]}: ${t}` : t))
    .filter(Boolean)
    .join('\n\n');
}

export { TITULOS as TITULOS_BLOQUES };
