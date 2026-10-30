import type { CoachDayNote, MensajeCoach, QuestionnaireResponse } from '../types';
import type { CambioAtleta } from './cambiosAtleta';
import type { AlertaRevision } from './alertasRevision';
import { aperturaDelCiclo } from './cicloRevision';
import { addDays } from './trainingWeek';

/* ═══════════════════════════════════════════════════════════════════════════
   Lógica pura del canal de mensajes del coach (29-10-2026).

   · `traducirCambio`: las líneas técnicas de `cambiosAtleta` («Kcal 2.200 →
     2.050») en una frase para el atleta («He bajado la dieta Déficit a 2.050
     kcal»). Es un borrador: Dani lo retoca y le pone el porqué.
   · `cambiosSinContar`: qué cambios de esta semana no tienen mensaje.
   · `loUltimoDeDani`: lo que la tarjeta de Inicio enseña, mezclando mensajes
     aprobados, la respuesta a la revisión y la nota del día, por fecha.
   · `acuseDeProblema`: el texto neutro que escribe la propia app al recibir
     una molestia. No va firmado: no lo ha visto nadie todavía.
   ═══════════════════════════════════════════════════════════════════════════ */

const kcalDe = (s: string) => s.match(/Kcal\s+([\d.]+)\s*→\s*([\d.]+)/);
const miles = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

export function traducirCambio(c: CambioAtleta): string {
  const nombre = c.titulo.replace(/^Dieta «(.+)»$/, 'la dieta $1').replace(/^Mesociclo (.+)$/, 'el bloque $1').replace(/^Sesión (.+)$/, 'la sesión $1');
  const lineas = c.lineas.filter(l => !/→ otra dieta/.test(l));
  const k = lineas.map(kcalDe).find(Boolean);
  if (k) {
    const antes = Number(k[1].replace('.', '')), despues = Number(k[2].replace('.', ''));
    const verbo = despues < antes ? 'He bajado' : 'He subido';
    return `${verbo} ${nombre} a ${miles(despues)} kcal.`;
  }
  const cambioEj = lineas.find(l => /→/.test(l) && !/^Kcal/.test(l));
  if (cambioEj) {
    const [a, b] = cambioEj.split('→').map(s => s.trim());
    return `En ${nombre} he cambiado ${a} por ${b}.`;
  }
  if (/Dieta nueva/i.test(lineas[0] ?? '')) return `Tienes ${nombre} nueva en tu plan.`;
  if (/Objetivo editado/i.test(lineas[0] ?? '')) return `He ajustado el objetivo de ${nombre}.`;
  return lineas.length > 0 ? `He tocado ${nombre}: ${lineas.slice(0, 2).join('; ').toLowerCase()}.` : `He tocado ${nombre}.`;
}

/** Cambios de los últimos `dias` días sin un mensaje que los cuente. */
export function cambiosSinContar(cambios: CambioAtleta[], mensajes: MensajeCoach[], hoy: string, dias = 7): CambioAtleta[] {
  const desde = addDays(hoy, -(dias - 1));
  const contados = new Set(mensajes.filter(m => m.origen?.coleccion === 'cambiosAtleta').map(m => m.origen!.id));
  return cambios
    .filter(c => c.at.slice(0, 10) >= desde && !contados.has(c.id))
    .sort((a, b) => b.at.localeCompare(a.at));
}

export interface ItemDeDani {
  id: string;
  fecha: string; // YYYY-MM-DD
  /** Etiqueta pequeña encima del texto. */
  etiqueta: string;
  texto: string;
  porque?: string;
  problema?: MensajeCoach['problema'];
  mediaUrl?: string;
  mediaKind?: 'audio' | 'video';
  /** A qué pantalla lleva al pulsar, si a alguna. */
  destino?: 'checkin' | 'nutrition' | 'training';
  /** Firmado por el coach o escrito por la app (acuse). */
  firmado: boolean;
}

const ETIQUETA: Record<MensajeCoach['tipo'], string> = {
  cambio: 'Cambio en tu plan',
  problema: 'Lo que me contaste',
  hito: 'Hito',
  implantacion: 'Bienvenida',
  libre: 'Mensaje',
};

export function loUltimoDeDani(e: {
  mensajes: MensajeCoach[];
  respuestas: QuestionnaireResponse[];
  notaDeHoy?: CoachDayNote | null;
  hoy: string;
  dias?: number;
}): ItemDeDani[] {
  const dias = e.dias ?? 7;
  const desde = addDays(e.hoy, -(dias - 1));
  const items: ItemDeDani[] = [];

  for (const m of e.mensajes) {
    if (m.estado !== 'aprobado' || m.fecha < desde) continue;
    items.push({
      id: m.id, fecha: m.fecha, etiqueta: ETIQUETA[m.tipo], texto: m.texto, porque: m.porque, problema: m.problema,
      mediaUrl: m.mediaUrl, mediaKind: m.mediaKind, firmado: m.autor === 'coach',
      destino: m.tipo === 'problema' ? 'checkin' : m.tipo === 'cambio' ? (/dieta|kcal|comida|menú/i.test(m.texto) ? 'nutrition' : 'training') : undefined,
    });
  }
  for (const r of e.respuestas) {
    const rc = r.respuestaCoach;
    if (!rc) continue;
    const fecha = rc.enviadaEn.slice(0, 10);
    if (fecha < desde) continue;
    const porWhatsApp = rc.canal === 'whatsapp';
    items.push({
      id: `rc_${r.id}`, fecha, etiqueta: porWhatsApp ? 'Te ha escrito por WhatsApp' : 'Ha revisado tu semana',
      texto: porWhatsApp ? 'Tu revisión está contestada ahí.' : (rc.bloques?.comoHaIdo || rc.texto),
      mediaUrl: rc.mediaUrl, mediaKind: rc.mediaKind, destino: 'checkin', firmado: true,
    });
  }
  if (e.notaDeHoy?.text) {
    items.push({ id: `nota_${e.notaDeHoy.id}`, fecha: e.notaDeHoy.date, etiqueta: 'Para hoy', texto: e.notaDeHoy.text, firmado: true });
  }
  return items.sort((a, b) => b.fecha.localeCompare(a.fecha) || a.id.localeCompare(b.id));
}

/** Cuándo se abre la próxima revisión (viernes del ciclo siguiente, o el día del coach). */
export function proximaRevision(hoy: string, diaRevision?: number | null): string {
  const apertura = aperturaDelCiclo(hoy, diaRevision);
  return apertura > hoy ? apertura : addDays(apertura, 7);
}

/**
 * En qué punto está la revisión de esta semana (30-10, Dani): la revisión se
 * abre tres días antes del día de revisión y se puede rellenar hasta ese
 * mismo día. Si hoy cae dentro y no la ha mandado, está ABIERTA; si la ha
 * mandado, Dani la mira el día de revisión; si no, se abre el próximo ciclo.
 */
export type EstadoRevision =
  | { tipo: 'abierta'; hasta: string }
  | { tipo: 'enviada'; revision: string }
  | { tipo: 'cerrada'; seAbre: string };

/** Días de la ventana en que se enseña el aviso de revisión abierta (que lo vea un par de veces). */
export const DIAS_AVISO_REVISION = 2;

/** Si toca enseñar el aviso de revisión en Inicio: activado por el coach, ventana abierta y dentro de sus dos primeros días. */
export function mostrarAvisoRevision(hoy: string, diaRevision: number | null | undefined, activado: boolean | undefined): boolean {
  if (!activado) return false;
  const apertura = aperturaDelCiclo(hoy, diaRevision);
  return hoy >= apertura && hoy < addDays(apertura, DIAS_AVISO_REVISION);
}

export function estadoDeRevision(hoy: string, diaRevision: number | null | undefined, respuestas: readonly Pick<QuestionnaireResponse, 'submittedAt'>[]): EstadoRevision {
  const apertura = aperturaDelCiclo(hoy, diaRevision);
  const revision = addDays(apertura, 3);
  if (hoy >= apertura && hoy <= revision) {
    const enviada = respuestas.some(r => { const d = r.submittedAt.slice(0, 10); return d >= apertura && d <= revision; });
    return enviada ? { tipo: 'enviada', revision } : { tipo: 'abierta', hasta: revision };
  }
  return { tipo: 'cerrada', seAbre: proximaRevision(hoy, diaRevision) };
}

/** Texto neutro del acuse de recibo que escribe la propia app. Sin firma. */
export function acuseDeProblema(alertas: AlertaRevision[]): string {
  const molestia = alertas.find(a => a.tipo === 'molestia');
  const que = molestia
    ? molestia.texto.replace(/^Molestia:\s*/, '').replace(/^Ha marcado una molestia o lesión$/, 'la molestia que has marcado')
    : alertas[0]?.texto ?? 'lo que has contado';
  const corto = que.length > 70 ? `${que.slice(0, 67)}…` : que;
  return `Recibido: ${corto}. Lo lee Dani en tu revisión y te dice qué cambia.`;
}
