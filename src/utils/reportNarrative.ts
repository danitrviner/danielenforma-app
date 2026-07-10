import { TrainingReport } from './trainingReport';
import {
  BodyweightSectionData, AdherenceSectionData, NutritionSectionData, ChallengesSectionData,
} from './reportExtras';

// Redactor local del mensaje del reporte: convierte los datos deterministas en
// un borrador natural y motivador en castellano, sin IA externa. El coach lo
// edita libremente antes de enviar — esto solo le ahorra el folio en blanco.
// Cada generación varía la redacción (pick aleatorio) para que dos semanas
// seguidas no suenen a plantilla calcada.

function pick<T>(options: T[]): T {
  return options[Math.floor(Math.random() * options.length)];
}

function fmtKg(n: number): string {
  return n.toLocaleString('es-ES', { maximumFractionDigits: 1 });
}

export interface NarrativeInput {
  athleteName: string;
  training: TrainingReport;
  bodyweight?: BodyweightSectionData | null;
  adherence?: AdherenceSectionData | null;
  nutrition?: NutritionSectionData | null;
  challenges?: ChallengesSectionData | null;
}

export function buildNarrativeIntro(input: NarrativeInput): string {
  const { training: tr, bodyweight, adherence, nutrition, challenges } = input;
  const name = input.athleteName.trim().split(/\s+/)[0] || 'crack';
  const prs = tr.perExercise.filter(e => e.isPR);
  const delta = tr.tonnage.deltaPct;

  // Sin sesiones registradas: mensaje corto de reenganche, no hay nada que narrar.
  if (tr.sessions === 0) {
    return pick([
      `${name}, esta semana no tengo registros tuyos de entrenamiento. Sé que hay semanas complicadas — lo importante es volver a la rutina cuanto antes. ¿Retomamos esta semana?`,
      `${name}, no me consta ningún entrenamiento registrado en este periodo. Si has entrenado, acuérdate de apuntarlo; y si no, esta semana volvemos con todo. 💪`,
    ]);
  }

  const parts: string[] = [];

  // ── Apertura según el tono general de la semana ──
  const strongWeek = prs.length > 0 || (delta != null && delta >= 5);
  const weakWeek = delta != null && delta < -10 && prs.length === 0;
  if (strongWeek) {
    parts.push(pick([
      `¡Semanaza, ${name}!`,
      `${name}, qué semana te has marcado.`,
      `${name}, esta semana has dado un paso adelante de verdad.`,
      `Enhorabuena ${name}, semana de las que marcan diferencia.`,
    ]));
  } else if (weakWeek) {
    parts.push(pick([
      `${name}, esta semana ha sido más floja en volumen, y no pasa nada — forma parte del proceso.`,
      `${name}, semana de menos carga. A veces toca, lo importante es la tendencia.`,
    ]));
  } else {
    parts.push(pick([
      `Buen trabajo esta semana, ${name}.`,
      `${name}, semana sólida.`,
      `${name}, otra semana más sumando — así se construye.`,
    ]));
  }

  // ── Volumen / sesiones ──
  const sesiones = `${tr.sessions} sesión${tr.sessions !== 1 ? 'es' : ''}`;
  if (delta != null) {
    const dTxt = `${delta >= 0 ? '+' : ''}${delta}%`;
    if (delta >= 0) {
      parts.push(pick([
        `Has completado ${sesiones} y movido ${fmtKg(tr.tonnage.current)} kg en total, un ${dTxt} ${tr.comparisonLabel}.`,
        `Entre tus ${sesiones} has levantado ${fmtKg(tr.tonnage.current)} kg — ${dTxt} ${tr.comparisonLabel}.`,
      ]));
    } else {
      parts.push(`Has completado ${sesiones} con ${fmtKg(tr.tonnage.current)} kg de volumen total (${dTxt} ${tr.comparisonLabel}).`);
    }
  } else {
    parts.push(`Has completado ${sesiones} y movido ${fmtKg(tr.tonnage.current)} kg en total.`);
  }

  // ── Récords ──
  if (prs.length > 0) {
    const top = prs.slice(0, 3).map(e => {
      const gain = e.prevBestOrm != null ? e.bestOrm - e.prevBestOrm : null;
      return `${e.name} (${fmtKg(e.bestOrm)} kg${gain != null && gain > 0 ? `, +${fmtKg(gain)}` : ''})`;
    });
    const lista = top.length > 1 ? `${top.slice(0, -1).join(', ')} y ${top[top.length - 1]}` : top[0];
    parts.push(pick([
      `Y lo mejor: ${prs.length > 1 ? 'nuevos récords' : 'nuevo récord'} en ${lista}. 🏆`,
      `Además has firmado ${prs.length > 1 ? 'récords personales' : 'un récord personal'} en ${lista}.`,
    ]));
  } else {
    // Mejor progresión sin PR: destacar el grupo muscular que más sube.
    const best = tr.muscleGroups.filter(g => (g.tonnageDeltaPct ?? 0) > 5)[0];
    if (best) parts.push(`Donde más has progresado es en ${best.label.toLowerCase()} (+${best.tonnageDeltaPct}% de volumen).`);
  }

  // ── Peso corporal ──
  if (bodyweight && bodyweight.deltaKg != null && bodyweight.endWeight != null) {
    const d = bodyweight.deltaKg;
    const dTxt = `${d > 0 ? '+' : ''}${fmtKg(d)} kg`;
    if (bodyweight.towardsTarget === true) {
      parts.push(pick([
        `En báscula, ${dTxt} esta semana (${fmtKg(bodyweight.endWeight)} kg): vas en la dirección correcta hacia tu objetivo.`,
        `Tu peso se ha movido ${dTxt} hasta los ${fmtKg(bodyweight.endWeight)} kg — justo hacia donde queremos.`,
      ]));
    } else if (bodyweight.towardsTarget === false) {
      parts.push(`El peso se ha movido ${dTxt} (${fmtKg(bodyweight.endWeight)} kg). No es la dirección que buscamos, pero una semana no marca la tendencia — lo vigilamos juntos.`);
    } else {
      parts.push(`Peso corporal: ${fmtKg(bodyweight.endWeight)} kg (${dTxt} en el periodo).`);
    }
  }

  // ── Adherencia a sesiones ──
  if (adherence && adherence.pct != null && adherence.planned > 0) {
    if (adherence.pct >= 100) {
      parts.push(pick([
        `Y en constancia, un 10: ${adherence.completed} de ${adherence.planned} sesiones programadas completadas.`,
        `Has cumplido todas las sesiones programadas (${adherence.completed}/${adherence.planned}) — esa constancia es lo que más paga a largo plazo.`,
      ]));
    } else if (adherence.pct >= 60) {
      parts.push(`Has completado ${adherence.completed} de ${adherence.planned} sesiones programadas. Bien, y con margen para rematar la próxima.`);
    } else {
      parts.push(`Esta semana han caído ${adherence.completed} de ${adherence.planned} sesiones programadas — vamos a por más la próxima.`);
    }
  }

  // ── Nutrición ──
  if (nutrition && nutrition.avgPct != null && nutrition.daysLogged > 0) {
    const mejora = nutrition.prevAvgPct != null && nutrition.avgPct > nutrition.prevAvgPct;
    if (nutrition.avgPct >= 85) {
      parts.push(`La dieta, al ${nutrition.avgPct}% de cumplimiento medio${mejora ? ' y mejorando' : ''} — muy bien llevada.`);
    } else if (nutrition.avgPct >= 60) {
      parts.push(`La dieta va al ${nutrition.avgPct}% de cumplimiento${mejora ? ', mejorando respecto al periodo anterior' : ''}. Vamos a apretar un poco ahí.`);
    } else {
      parts.push(`La parte de nutrición es donde más margen tenemos (${nutrition.avgPct}% de cumplimiento) — pequeño foco para esta semana.`);
    }
  }

  // ── Retos ──
  const won = challenges?.items.filter(c => c.status === 'conseguido') ?? [];
  const active = challenges?.items.filter(c => c.status === 'activo') ?? [];
  if (won.length > 0) {
    parts.push(pick([
      `Reto semanal conseguido: ${won[0].title}. 💪`,
      `Y para rematar, te has llevado el reto de la semana (${won[0].title}).`,
    ]));
  } else if (active.length > 0) {
    parts.push(`Recuerda que tienes el reto "${active[0].title}" en marcha — a por él.`);
  }

  // ── Cierre ──
  parts.push(pick([
    'Seguimos construyendo. 💪',
    'A seguir así — el progreso se nota.',
    'Vamos a por otra buena semana.',
    'Paso a paso, y este ha sido de los buenos.',
  ]));

  return parts.join(' ');
}
