// Aplicar en servidor lo que el autopiloto decidió, según la política.
//
// El bucle (agente.ts) crea propuestas con las tools, igual que el chat. Lo
// que cambia aquí es quién las aprueba: si la política efectiva de ESA decisión
// es `automatico` o `aviso`, se aplican en el acto con el mismo
// `aplicarPropuesta` que usa el hook de Dani (misma decisión, mismo snapshot) y
// el ejecutor de administración. Si es `proponer` o `sombra`, no se toca nada:
// quedan para la bandeja (o para la comparación en sombra).
//
// La política efectiva se calcula AQUÍ y no en la tool, porque depende de lo
// que la tool no sabe: el modo del autopiloto, las alertas clínicas del
// episodio y la dieta que se ajusta (para medir el % de kcal).
import type { AiProposal, PoliticaPropuesta } from '../../src/types.js';
import type { FuenteDeDatos } from '../../src/ai/tools/datos.js';
import { aplicarPropuesta } from '../../src/autopiloto/aplicarPropuesta.js';
import { politicaEfectiva, tipoDeDecision, type PoliticaAutopiloto, type TipoDecision } from '../../src/autopiloto/politica.js';
import { ejecutarEnServidor, lectorDeServidor } from './ejecutarEnServidor.js';
import { getAdminDb } from './auth.js';

type Firestore = NonNullable<Awaited<ReturnType<typeof getAdminDb>>>;

export interface ResultadoAplicacionServidor {
  tipo: TipoDecision;
  politica: PoliticaPropuesta;
  /** `aplicada` si se escribió; `proponer`/`sombra` si se dejó para Dani. */
  resultado: 'aplicada' | 'dejada' | 'fallida';
  motivo?: string;
}

export async function aplicarPropuestaEnServidor(
  db: Firestore, fuente: FuenteDeDatos, propuestaId: string,
  ctx: { politica: PoliticaAutopiloto; alertas?: string[]; coachUid: string; ahora: string },
): Promise<ResultadoAplicacionServidor> {
  const snap = await db.collection('aiProposals').doc(propuestaId).get();
  if (!snap.exists) return { tipo: 'clinico', politica: 'proponer', resultado: 'fallida', motivo: 'La propuesta no existe.' };
  const p = { id: snap.id, ...(snap.data() as object) } as AiProposal;

  const dietaBase = p.kind === 'diet' && p.baseEntityId
    ? (await fuente.getDietsForAthlete(p.athleteId)).find(d => d.id === p.baseEntityId) ?? null
    : null;
  const tipo = tipoDeDecision(p, { alertas: ctx.alertas, dietaBase });
  const politica = politicaEfectiva(ctx.politica, tipo);

  // La propuesta queda marcada con la decisión tomada sobre ella, se aplique o no.
  await snap.ref.set({ politica, ...(p.status === 'proposed' && politica === 'sombra' ? { status: 'sombra' } : {}) }, { merge: true });
  if (politica === 'proponer' || politica === 'sombra') return { tipo, politica, resultado: 'dejada' };

  const decision = await aplicarPropuesta(p, lectorDeServidor(fuente), { coachUid: ctx.coachUid, ahora: ctx.ahora });
  if (decision.ok === false) {
    await snap.ref.set({ politica: 'proponer' }, { merge: true });
    return { tipo, politica, resultado: 'dejada', motivo: decision.motivo };
  }
  try {
    const ejec = await ejecutarEnServidor(db, decision.operaciones);
    const resultEntityId = decision.resultEntityId ?? (decision.resultEntityRef ? ejec.refs[decision.resultEntityRef] : undefined);
    const avisoHasta = politica === 'aviso' ? new Date(Date.parse(ctx.ahora) + ctx.politica.horasAviso * 3600_000).toISOString() : undefined;
    await snap.ref.set({
      status: 'aplicada', aplicadaEn: ctx.ahora, autor: 'asistente', politica,
      snapshotAntes: [...decision.snapshotAntes, ...ejec.creados],
      ...(resultEntityId ? { resultEntityId } : {}),
      ...(avisoHasta ? { avisoHasta } : {}),
    }, { merge: true });
    await fuente.appendDossierFacts(p.athleteId, [{
      at: ctx.ahora, kind: 'aprobacion', text: `Aplicada por el asistente (${politica}): ${p.summary}`, proposalId: p.id, chatId: p.chatId,
    }]);
    return { tipo, politica, resultado: 'aplicada' };
  } catch (err) {
    // Lo escrito a medias conserva su snapshot en la propuesta para deshacerlo.
    await snap.ref.set({ politica: 'proponer', comentarios: [...(p.comentarios ?? []), { at: ctx.ahora, text: `El autopiloto no pudo aplicarla: ${(err as Error)?.message ?? err}` }] }, { merge: true });
    return { tipo, politica, resultado: 'fallida', motivo: (err as Error)?.message ?? String(err) };
  }
}
