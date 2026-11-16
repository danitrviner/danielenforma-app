import type { CierreMesociclo } from './cierreMesociclo.js';
import type { EvolucionDelBloque, EvolucionPregunta } from './evolucionDelBloque.js';
import { OBJETIVO_LABEL } from './verificacionObjetivo.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONCLUSIONES DEL BLOQUE — de los datos a las decisiones.
//
// El cierre ya junta los números (progresión, volumen, adherencia, cuerpo,
// cuestionarios). Esto contesta la pregunta de Dani: «¿y qué hacemos con
// esos datos?». Dos listas:
//   · Hallazgos: lo que el bloque nos ha enseñado de este atleta.
//   · Acciones: qué cambia en el siguiente bloque por culpa de ese hallazgo.
//
// Son reglas, no IA: cada una se dispara con un umbral explícito y cita la
// cifra que la dispara, para que el coach pueda estar en desacuerdo con
// conocimiento de causa. Si falta el dato, la regla calla.
// ═══════════════════════════════════════════════════════════════════════════

export type TonoConclusion = 'bien' | 'atencion' | 'neutro';

export interface Conclusion {
  id: string;
  tono: TonoConclusion;
  texto: string;
}

export interface ConclusionesDelBloque {
  hallazgos: Conclusion[];
  acciones: Conclusion[];
  /** Frases para el mensaje al cliente (segunda persona), además de las del rendimiento. */
  paraElCliente: string[];
}

const fmt = (n: number, d = 1) => n.toLocaleString('es-ES', { maximumFractionDigits: d });
const signo = (n: number, d = 1) => `${n > 0 ? '+' : ''}${fmt(n, d)}`;

function pregunta(ev: EvolucionDelBloque, re: RegExp): EvolucionPregunta | undefined {
  return ev.preguntas.find(p => re.test(p.label.toLowerCase()) || re.test(p.clave));
}

export function buildConclusionesDelBloque(cierre: CierreMesociclo, ev: EvolucionDelBloque): ConclusionesDelBloque {
  const hallazgos: Conclusion[] = [];
  const acciones: Conclusion[] = [];
  const paraElCliente: string[] = [];
  const res = cierre.progresion.resumen;
  const adh = cierre.sesiones.adherenciaPct;
  const vol = cierre.volumen.pct;
  const fuerza = res.medianaPct;

  const sueno = pregunta(ev, /sue[ñn]o|dorm/);
  const estres = pregunta(ev, /estr[eé]s/);
  const cansancio = pregunta(ev, /cansad|cansancio|fatiga/);
  const agujetas = ev.preguntas.find(p => p.clave === 'agujetas');
  const recuperacionPeor = [sueno, estres, cansancio, agujetas].filter(p => p?.lectura === 'empeora') as EvolucionPregunta[];

  // ── 1. ¿Ha funcionado el bloque? ─────────────────────────────────────────
  const enDeficit = ev.peso?.objetivo === 'deficit' || ev.peso?.objetivo === 'deficit_acelerado';
  if (fuerza != null && res.comparables >= 3) {
    if (fuerza >= 5) {
      hallazgos.push({ id: 'funciona', tono: 'bien', texto: `El bloque ha funcionado: mejora en ${res.mejoran} de ${res.comparables} ejercicios, con una mediana de ${signo(fuerza)}% de fuerza estimada.` });
      // Solo si de verdad se hizo lo programado: con la mitad del volumen, «lo que funciona» no se sabe qué es.
      if ((adh ?? 100) >= 80 && (vol ?? 100) >= 80) {
        acciones.push({ id: 'mantener', tono: 'bien', texto: 'Mantener la estructura (reparto, ejercicios principales y rangos) y seguir progresando cargas: lo que funciona no se cambia.' });
      }
    } else if (fuerza >= 2) {
      hallazgos.push({ id: 'progreso_lento', tono: 'neutro', texto: `Progreso moderado: mediana de ${signo(fuerza)}% de fuerza estimada (${res.mejoran} de ${res.comparables} ejercicios mejoran).` });
    } else if (enDeficit) {
      hallazgos.push({ id: 'mantiene_deficit', tono: 'bien', texto: `En déficit mantiene la fuerza (mediana ${signo(fuerza)}%): es justo lo que se busca en esta fase.` });
    } else {
      hallazgos.push({ id: 'estancado', tono: 'atencion', texto: `El bloque no ha movido la fuerza: mediana de ${signo(fuerza)}% (${res.mejoran} de ${res.comparables} ejercicios mejoran).` });
      acciones.push({ id: 'cambiar_estimulo', tono: 'atencion', texto: 'Cambiar el estímulo en el siguiente bloque: variantes nuevas en los principales, otro rango de repeticiones o más frecuencia en lo prioritario.' });
    }
  }

  // ── 2. Lo que se ha quedado parado ───────────────────────────────────────
  const parados = cierre.progresion.ejercicios
    .filter(e => (e.estado === 'baja' || e.estado === 'estable') && e.semanasConDatos >= 3)
    .sort((a, b) => (a.deltaPct ?? 0) - (b.deltaPct ?? 0));
  if (parados.length > 0) {
    const nombres = parados.slice(0, 3).map(e => `${e.nombre} (${signo(e.deltaPct!)}%)`).join(', ');
    hallazgos.push({ id: 'parados', tono: 'atencion', texto: `Estancados o a la baja tras 3+ semanas: ${nombres}.` });
    acciones.push({ id: 'rotar_parados', tono: 'atencion', texto: `Rotar variante o cambiar el esquema en ${parados.slice(0, 3).map(e => e.nombre).join(', ')}: llevan semanas sin responder a lo mismo.` });
  }

  // ── 3. Lo mejor, para priorizarlo o protegerlo ───────────────────────────
  const mejorPatron = cierre.progresion.porPatron.find(p => p.deltaMedioPct != null);
  const peorPatron = [...cierre.progresion.porPatron].reverse().find(p => p.deltaMedioPct != null);
  const mejoresGrupos = cierre.progresion.porGrupo.filter(g => (g.deltaMedioPct ?? 0) >= 2).slice(0, 3);
  if (mejoresGrupos.length > 0) {
    hallazgos.push({ id: 'mejores_grupos', tono: 'bien', texto: `Sus mejores grupos este bloque: ${mejoresGrupos.map(g => `${g.label.toLowerCase()} (${signo(g.deltaMedioPct!)}%)`).join(', ')}.` });
  }
  if (mejorPatron && peorPatron && mejorPatron.clave !== peorPatron.clave
      && (mejorPatron.deltaMedioPct! - peorPatron.deltaMedioPct!) >= 8) {
    hallazgos.push({ id: 'desequilibrio', tono: 'neutro', texto: `Progresión desigual: ${mejorPatron.label.toLowerCase()} ${signo(mejorPatron.deltaMedioPct!)}% frente a ${peorPatron.label.toLowerCase()} ${signo(peorPatron.deltaMedioPct!)}%.` });
    acciones.push({ id: 'priorizar_flojo', tono: 'neutro', texto: `Dar prioridad a ${peorPatron.label.toLowerCase()} en el siguiente bloque (más series o colocarlo al principio de la sesión).` });
  }

  // ── 4. ¿Lo hizo? Adherencia y volumen ────────────────────────────────────
  if (adh != null) {
    if (adh >= 90) hallazgos.push({ id: 'adherencia', tono: 'bien', texto: `Adherencia excelente: ${adh}% de las sesiones.` });
    else if (adh < 75) {
      hallazgos.push({ id: 'adherencia', tono: 'atencion', texto: `Adherencia baja: ${adh}% de las sesiones programadas.` });
      acciones.push({ id: 'ajustar_dias', tono: 'atencion', texto: 'Ajustar el número de días a lo que de verdad puede hacer: un plan que se cumple entero rinde más que uno ambicioso a medias.' });
    }
  }
  const gruposCortos = cierre.volumen.filas.filter(f => f.pct != null && f.pct < 75 && f.programadas >= 6);
  if (gruposCortos.length > 0) {
    acciones.push({ id: 'volumen_irreal', tono: 'atencion', texto: `Revisar el volumen de ${gruposCortos.slice(0, 3).map(f => `${f.label.toLowerCase()} (hizo el ${f.pct}%)`).join(', ')}: lo programado no se completa; bajar series o reubicarlas.` });
  }

  // ── 5. Fatiga y recuperación ─────────────────────────────────────────────
  const rirFinal = res.rir?.final ?? null;
  const cambio = (q: EvolucionPregunta) => `${etiquetaCorta(q)} ${fmt(q.inicio)} → ${fmt(q.final)}`;
  if (recuperacionPeor.length > 0) {
    hallazgos.push({ id: 'recuperacion', tono: 'atencion', texto: `La recuperación empeora a lo largo del bloque: ${recuperacionPeor.map(cambio).join(', ')}.` });
  }
  // El resto de lo que cuenta en los cuestionarios: una línea para lo que
  // mejora y otra para lo que empeora (sin repetir una misma etiqueta).
  const unicas = (qs: EvolucionPregunta[]) => qs.filter((q, i) => qs.findIndex(o => etiquetaCorta(o) === etiquetaCorta(q)) === i);
  const mejoraBienestar = unicas(ev.preguntas.filter(q => q.lectura === 'mejora')).slice(0, 4);
  const empeoraOtras = unicas(ev.preguntas.filter(q => q.lectura === 'empeora' && !recuperacionPeor.includes(q))).slice(0, 3);
  if (mejoraBienestar.length > 0) {
    hallazgos.push({ id: 'bienestar_mejora', tono: 'bien', texto: `Según sus cuestionarios, mejora: ${mejoraBienestar.map(cambio).join(', ')}.` });
  }
  if (empeoraOtras.length > 0) {
    hallazgos.push({ id: 'bienestar_empeora', tono: 'atencion', texto: `Según sus cuestionarios, empeora: ${empeoraOtras.map(cambio).join(', ')}.` });
  }
  const fatigaAcumulada = (rirFinal != null && rirFinal <= 0.5) || recuperacionPeor.length >= 2
    || (vol != null && vol >= 100 && recuperacionPeor.length >= 1);
  if (fatigaAcumulada) {
    acciones.push({
      id: 'descarga', tono: 'atencion',
      texto: rirFinal != null && rirFinal <= 0.5
        ? `Empezar el siguiente bloque con una semana de descarga y subir el RIR objetivo: acaba entrenando casi al fallo (RIR medio ${fmt(rirFinal)}).`
        : 'Empezar el siguiente bloque con una semana de descarga: llega con fatiga acumulada.',
    });
  }
  if (sueno?.lectura === 'empeora') {
    acciones.push({ id: 'sueno', tono: 'atencion', texto: 'Trabajar el sueño antes de subir volumen: es el limitante de la recuperación ahora mismo.' });
  }

  // Percibe menos progreso del que hay: la conversación del cierre es justo eso.
  const sensacion = pregunta(ev, /progres/);
  if (sensacion?.lectura === 'empeora' && fuerza != null && fuerza >= 5) {
    acciones.push({ id: 'ensenar_numeros', tono: 'atencion', texto: `Enseñarle estos números en la llamada: su sensación de progreso baja (${fmt(sensacion.inicio)} → ${fmt(sensacion.final)}) mientras su fuerza sube un ${signo(fuerza)}%.` });
  }

  // ── 6. El cuerpo ─────────────────────────────────────────────────────────
  const p = ev.peso;
  if (p) {
    const cintura = ev.medidas.find(m => m.clave === 'cintura' || m.clave === 'abdomen');
    const extraCintura = cintura ? ` y ${cintura.label.toLowerCase()} ${signo(cintura.delta)} ${cintura.unidad}` : '';
    const base = `Peso ${fmt(p.inicio)} → ${fmt(p.final)} kg (${signo(p.deltaKg)} kg${p.ritmoPctSemana != null ? `, ${signo(p.ritmoPctSemana, 2)}%/sem` : ''})${extraCintura}`;
    if (p.objetivo && p.enRango != null) {
      const obj = OBJETIVO_LABEL[p.objetivo].toLowerCase();
      if (p.enRango) {
        hallazgos.push({ id: 'peso', tono: 'bien', texto: `${base}: dentro del ritmo de ${obj}.` });
      } else {
        const rapido = p.rango && p.ritmoPctSemana != null && Math.abs(p.ritmoPctSemana) > Math.max(Math.abs(p.rango.min), Math.abs(p.rango.max));
        hallazgos.push({ id: 'peso', tono: 'atencion', texto: `${base}: fuera del ritmo de ${obj} (${signo(p.rango!.min, 2)} a ${signo(p.rango!.max, 2)}%/sem).` });
        acciones.push({ id: 'ajustar_kcal', tono: 'atencion', texto: rapido ? 'Ajustar calorías: va más rápido de lo previsto y se arriesga a perder rendimiento.' : 'Ajustar calorías: va más lento de lo previsto para el objetivo de la fase.' });
      }
    } else {
      hallazgos.push({ id: 'peso', tono: 'neutro', texto: `${base}.` });
    }
    if (enDeficit && fuerza != null && fuerza >= 2 && p.deltaKg < 0) {
      paraElCliente.push(`Has bajado ${fmt(Math.abs(p.deltaKg))} kg y aun así eres más fuerte que al empezar: buena señal de que lo que se va es grasa y no músculo.`);
    } else if (p.deltaKg !== 0) {
      paraElCliente.push(`Tu peso ha pasado de ${fmt(p.inicio)} a ${fmt(p.final)} kg${extraCintura ? `,${extraCintura.replace(/^ y/, '')}` : ''}.`);
    }
  }

  // ── 7. Nutrición ─────────────────────────────────────────────────────────
  const d = ev.dieta;
  if (d && d.media != null) {
    const registroPct = Math.round((d.diasRegistrados / d.diasDelBloque) * 100);
    if (registroPct < 50) {
      hallazgos.push({ id: 'dieta_registro', tono: 'atencion', texto: `Solo registró la comida ${d.diasRegistrados} de ${d.diasDelBloque} días (${registroPct}%): las conclusiones de nutrición son poco fiables.` });
      acciones.push({ id: 'dieta_registro', tono: 'neutro', texto: 'Pedirle que registre la comida al menos 5 días por semana durante el siguiente bloque.' });
    } else if (d.diasEnObjetivoPct != null && d.diasEnObjetivoPct < 50) {
      hallazgos.push({ id: 'dieta_objetivo', tono: 'atencion', texto: `Solo el ${d.diasEnObjetivoPct}% de los días registrados cae dentro de ±10% de sus kcal (media ${d.media}%).` });
      acciones.push({ id: 'dieta_simplificar', tono: 'atencion', texto: 'Simplificar el plan de comidas o ajustar el objetivo: la palanca ahora es la nutrición, no el entrenamiento.' });
    } else if (d.diasEnObjetivoPct != null && d.diasEnObjetivoPct >= 70) {
      hallazgos.push({ id: 'dieta_objetivo', tono: 'bien', texto: `Nutrición muy controlada: el ${d.diasEnObjetivoPct}% de los días registrados dentro de objetivo.` });
    }
  }

  // ── 8. Lo que dice el propio atleta ──────────────────────────────────────
  const voz = ev.voz;
  if (voz) {
    if (voz.valoracion != null) {
      hallazgos.push({ id: 'valoracion', tono: voz.valoracion >= 7 ? 'bien' : voz.valoracion <= 5 ? 'atencion' : 'neutro', texto: `Su valoración del bloque: ${voz.valoracion}/10${voz.recuperacion != null ? `, recuperación ${voz.recuperacion}/10` : ''}${voz.exigencia != null ? `, exigencia ${voz.exigencia}/10` : ''}.` });
    }
    if (voz.priorizar.length > 0) acciones.push({ id: 'pide_priorizar', tono: 'neutro', texto: `Pide priorizar: ${voz.priorizar.join(', ')}.` });
    if (voz.demasiado.length > 0) acciones.push({ id: 'pide_menos', tono: 'neutro', texto: `Nota demasiado volumen en: ${voz.demasiado.join(', ')}. Valorar quitar series ahí.` });
  }

  // ── 9. Constancia del registro ───────────────────────────────────────────
  const r = ev.registro;
  const semanas = Math.max(1, r.diasDelBloque / 7);
  if (r.diasConPesaje / semanas < 2) {
    acciones.push({ id: 'pesajes', tono: 'neutro', texto: `Pedirle más pesajes: ${r.diasConPesaje} días con peso en ${Math.round(semanas)} semanas no dan una tendencia fiable (lo ideal son 3-4 por semana).` });
  }
  if (r.fotos === 0) {
    acciones.push({ id: 'fotos', tono: 'neutro', texto: 'Programar fotos de progreso al empezar el siguiente bloque: este no tiene ninguna para comparar.' });
  }

  // Para el cliente: lo que ha mejorado de cómo se siente.
  const mejoras = mejoraBienestar.slice(0, 2);
  if (mejoras.length > 0) {
    paraElCliente.push(`También ha mejorado cómo llegas: ${mejoras.map(q => `${etiquetaCorta(q)} de ${fmt(q.inicio)} a ${fmt(q.final)}`).join(' y ')}.`);
  }

  // Lo bueno primero en los hallazgos; en las acciones, primero lo que corrige.
  const orden: Record<TonoConclusion, number> = { bien: 0, neutro: 1, atencion: 2 };
  hallazgos.sort((a, b) => orden[a.tono] - orden[b.tono]);
  acciones.sort((a, b) => orden[b.tono] - orden[a.tono]);
  return { hallazgos, acciones, paraElCliente };
}

/** Nombre corto de una pregunta para meterlo en una frase. */
export function etiquetaCorta(p: Pick<EvolucionPregunta, 'label' | 'clave'>): string {
  const l = p.label.toLowerCase();
  if (p.clave === 'agujetas') return 'agujetas';
  if (/horas.*dorm|dorm.*horas/.test(l)) return 'horas de sueño';
  if (/sue[ñn]o/.test(l)) return 'sueño';
  if (/estr[eé]s/.test(l)) return 'estrés';
  if (/cansad|cansancio|fatiga/.test(l)) return 'cansancio';
  if (/pasos/.test(l)) return 'pasos';
  if (/motiva/.test(l)) return 'motivación';
  if (/energ/.test(l)) return 'energía';
  if (/cumpl.*nutri|nutri.*cumpl|dieta/.test(l)) return 'cumplimiento de la dieta';
  if (/cumpl.*entren|entren.*cumpl/.test(l)) return 'cumplimiento de entrenos';
  if (/progres/.test(l)) return 'sensación de progreso';
  if (/satisf/.test(l)) return 'satisfacción';
  return p.label.replace(/[¿?]/g, '').trim().slice(0, 40);
}
