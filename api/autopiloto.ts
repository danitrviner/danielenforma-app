// El consumidor de la cola de episodios del autopiloto.
//
// El latido (api/latido-diario.ts) y la app del atleta ENCOLAN episodios en
// `episodios/{id}` sin llamar al modelo. Esto los consume: toma los pendientes
// por prioridad y, para cada uno, encadena rondas del bucle de agente
// (api/_lib/agente.ts) mientras quede tiempo de función, guardando el episodio
// después de cada ronda. Si la función muere, la siguiente invocación retoma.
//
// Guardarraíles, en este orden: secreto del cron; cuenta de servicio;
// presupuesto diario compartido con el chat del coach (`aiUsage/daily_*` y
// AI_DAILY_USD_LIMIT); tope por episodio (episodios.ts); tope de rondas; tope de
// tiempo. `?seco=1` lista lo que correría sin llamar al modelo ni escribir.
//
// Modo sombra: los episodios llevan `politica: 'sombra'` y las propuestas que
// crean quedan con `status: 'sombra'` (fuenteAdmin.createAiProposal): se
// comparan con lo que hizo Dani, no se aprueban.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { timingSafeEqual } from 'node:crypto';
import { COACH_EMAIL, getAdminDb } from './_lib/auth.js';
import { fuenteAdmin, uidDelCoach, leerDoctrina, leerInstruccionesFijas, leerPoliticaAutopiloto } from './_lib/fuenteAdmin.js';
import { aplicarPropuestaEnServidor } from './_lib/aplicarEnServidor.js';
import { ejecutarRonda, type ClienteModelo } from './_lib/agente.js';
import { leerEpisodiosPendientes, guardarEpisodio } from './_lib/db-admin.js';
import { usarFuenteDeDatos } from '../src/ai/tools.server.js';
import { DOCTRINA_DEFAULTS } from '../src/ai/doctrina.js';
import { aliasDeAtleta } from '../src/ai/consentimientoIA.js';
import { MODELO_POR_DEFECTO } from '../src/ai/costes.js';
import { hoyIsoLocal } from '../src/utils/trainingWeek.js';
import type { Episodio } from '../src/autopiloto/episodios.js';
import type { AiContentBlock } from '../src/types.js';

export const config = { maxDuration: 300 };
/** Margen para guardar y responder antes de que la plataforma corte. */
const TIEMPO_MAX_MS = 230_000;
/** Episodios por invocación: los que quepan en el tiempo, hasta este tope. */
const EPISODIOS_POR_PASADA = 5;
const DAILY_USD_LIMIT = Number(process.env.AI_DAILY_USD_LIMIT) || 0;

function secretoValido(recibido: string | undefined, esperado: string): boolean {
  if (!recibido) return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

function clienteAnthropic(apiKey: string): ClienteModelo {
  const anthropic = new Anthropic({ apiKey });
  return {
    crear: async params => {
      const m = await anthropic.messages.create(params as never);
      return { content: m.content as unknown as AiContentBlock[], stop_reason: m.stop_reason, usage: m.usage };
    },
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') { res.status(405).json({ error: 'Método no permitido' }); return; }
  const secreto = process.env.CRON_SECRET;
  if (!secreto) { res.status(503).json({ error: 'CRON_SECRET no configurado' }); return; }
  const cabecera = req.headers.authorization ?? '';
  const recibido = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : undefined;
  if (!secretoValido(recibido, secreto)) { res.status(401).json({ error: 'No autorizado' }); return; }
  if (!process.env.ANTHROPIC_API_KEY) { res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurada' }); return; }

  const db = await getAdminDb();
  if (!db) { res.status(503).json({ error: 'Sin cuenta de servicio configurada' }); return; }

  const enSeco = String(req.query.seco ?? '') === '1';
  const comenzoEn = Date.now();
  const hoy = hoyIsoLocal();

  const pendientes = await leerEpisodiosPendientes(db, EPISODIOS_POR_PASADA);
  if (enSeco) {
    res.status(200).json({ fecha: hoy, enSeco: true, pendientes: pendientes.map(e => ({ id: e.id, tipo: e.tipo, estado: e.estado, ronda: e.ronda, politica: e.politica })) });
    return;
  }

  const coachUid = await uidDelCoach(db);
  const fuente = fuenteAdmin(db, coachUid);
  usarFuenteDeDatos(fuente);
  const [doctrina, instruccionesFijas, politica, perfiles] = await Promise.all([
    leerDoctrina(db, DOCTRINA_DEFAULTS),
    leerInstruccionesFijas(db),
    leerPoliticaAutopiloto(db),
    db.collection('user_profiles').where('role', '==', 'client').get().then(s => s.docs.map(d => d.data() as { email?: string; displayName?: string })),
  ]);
  const aliasDe = (email: string) => aliasDeAtleta(perfiles.find(p => p.email === email)?.displayName, email);
  const cliente = clienteAnthropic(process.env.ANTHROPIC_API_KEY);
  const modelo = MODELO_POR_DEFECTO.episodioLigero;

  const procesados: { id: string; tipo: string; estado: string; rondas: number; usd: number; paraDani?: string; error?: string }[] = [];
  let paradoPor: string | null = null;

  for (const inicial of pendientes) {
    if (Date.now() - comenzoEn > TIEMPO_MAX_MS) { paradoPor = 'tiempo'; break; }
    let ep: Episodio = inicial;
    // Rondas encadenadas mientras el episodio siga vivo y quede tiempo.
    while ((ep.estado === 'pendiente' || ep.estado === 'en_curso') && Date.now() - comenzoEn < TIEMPO_MAX_MS) {
      // Presupuesto diario, compartido con el chat del coach.
      const uso = await db.collection('aiUsage').doc(`daily_${hoy}`).get();
      const gastoHoy = (uso.data()?.gastoUsd as number | undefined) ?? 0;
      // El tope diario es el menor de los dos: el de la política que edita Dani
      // y el de la variable de entorno, que es el techo duro.
      const topeDia = [politica.presupuesto.diaUsd, DAILY_USD_LIMIT].filter(x => x > 0);
      const tope = topeDia.length ? Math.min(...topeDia) : 0;
      if (tope > 0 && gastoHoy >= tope) { paradoPor = `presupuesto diario (${gastoHoy.toFixed(2)} $ de ${tope} $)`; break; }

      const ahora = new Date().toISOString();
      let resultado;
      try {
        const alertas = ep.alertas;
        resultado = await ejecutarRonda({
          episodio: ep, modelo, cliente, sistema: { doctrina, instruccionesFijas }, alias: aliasDe(ep.athleteId), ahora,
          aplicar: id => aplicarPropuestaEnServidor(db, fuente, id, { politica, alertas, coachUid, ahora: new Date().toISOString() }),
        });
      } catch (err) {
        ep = { ...ep, estado: 'fallido', error: (err as Error)?.message ?? String(err), actualizadoEn: ahora, cerradoEn: ahora };
        await guardarEpisodio(db, ep);
        break;
      }
      ep = resultado.episodio;
      await guardarEpisodio(db, ep);
      if (resultado.auditoria) {
        const a = resultado.auditoria;
        const { FieldValue } = await import('firebase-admin/firestore');
        await Promise.all([
          db.collection('aiAuditLog').add(a),
          db.collection('aiUsage').doc(`daily_${hoy}`).set({
            date: hoy, count: FieldValue.increment(1), gastoUsd: FieldValue.increment(a.costoUsd),
            inputTokens: FieldValue.increment(a.inputTokens), outputTokens: FieldValue.increment(a.outputTokens),
            cacheReadTokens: FieldValue.increment(a.cacheReadInputTokens),
          }, { merge: true }),
        ]);
      }
    }
    procesados.push({ id: ep.id, tipo: ep.tipo, estado: ep.estado, rondas: ep.ronda, usd: Math.round(ep.coste.usd * 10000) / 10000, ...(ep.paraDani ? { paraDani: ep.paraDani } : {}), ...(ep.error ? { error: ep.error } : {}) });
    if (paradoPor) break;
  }

  // El registro persistido no lleva correos (misma regla que el latido).
  const registro = {
    fecha: hoy, ejecutadoEn: new Date().toISOString(), coach: COACH_EMAIL === 'danitrviner@gmail.com',
    episodios: procesados.length, hechos: procesados.filter(p => p.estado === 'hecho').length,
    escalados: procesados.filter(p => p.estado === 'escalado').length, fallidos: procesados.filter(p => p.estado === 'fallido').length,
    enCurso: procesados.filter(p => p.estado === 'en_curso').length, usd: procesados.reduce((s, p) => s + p.usd, 0),
    duracionMs: Date.now() - comenzoEn, paradoPor,
  };
  try { await db.collection('autopiloto').doc(`${hoy}_${Date.now()}`).set(registro); } catch (err) { console.warn('autopiloto: no se pudo guardar el resumen', err); }
  res.status(200).json({ ...registro, detalle: procesados });
}
