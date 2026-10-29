import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/* ═══════════════════════════════════════════════════════════════════════════
   El consumidor del autopiloto de punta a punta, contra un Firestore y un
   modelo de mentira (tanda 9).

   Lo que ya está cubierto por piezas: la puerta (autopiloto.test.ts), el bucle
   (agente.test.ts), la política, la reanudación. Lo que falta cubrir es el
   CABLE: que un episodio pendiente se lea, que el modelo reciba el guion, que
   una tool que crea una propuesta en SOMBRA la deje como `sombra` y no toque
   nada más, que el episodio se guarde cerrado con su «PARA DANI», que el gasto
   quede en `aiUsage`/`aiAuditLog`, que `?seco=1` no escriba, que el presupuesto
   pare la cola y que lo que esperaba a Dani se reanude.
   ═══════════════════════════════════════════════════════════════════════════ */

const SECRETO = 'secreto-de-pruebas';
type Doc = Record<string, unknown> & { id?: string };
type Escritura = { coleccion: string; id: string; op: 'set' | 'update' | 'create' | 'add'; datos: unknown };

/** Un Firestore mínimo: lo que usan db-admin.ts y fuenteAdmin.ts. Las escrituras
 *  se APLICAN a los datos (y se anotan), para que una ronda vea lo que escribió la anterior. */
function firestoreFalso(datos: Record<string, Record<string, Doc>>) {
  const escrituras: Escritura[] = [];
  let n = 0;
  const col = (c: string) => (datos[c] ??= {});
  const hacerConsulta = (coleccion: string, filtros: [string, string, unknown][], limite?: number) => ({
    where(campo: string, op: string, valor: unknown) { return hacerConsulta(coleccion, [...filtros, [campo, op, valor]], limite); },
    limit(l: number) { return hacerConsulta(coleccion, filtros, l); },
    orderBy() { return hacerConsulta(coleccion, filtros, limite); },
    async get() {
      const docs = Object.entries(col(coleccion))
        .filter(([, d]) => filtros.every(([campo, op, valor]) => {
          const v = (d as Record<string, unknown>)[campo];
          if (op === '==') return v === valor;
          if (op === 'in') return (valor as unknown[]).includes(v);
          if (op === '>=') return String(v) >= String(valor);
          if (op === '<=') return String(v) <= String(valor);
          return true;
        }))
        .map(([id, d]) => ({ id, data: () => d, exists: true }));
      return { docs: limite ? docs.slice(0, limite) : docs, empty: docs.length === 0 };
    },
  });
  const documento = (coleccion: string, id: string): Record<string, unknown> => ({
    id,
    get: async () => { const d = col(coleccion)[id]; return { exists: !!d, id, data: () => d, ref: documento(coleccion, id) }; },
    set: async (v: Record<string, unknown>, opts?: { merge?: boolean }) => {
      col(coleccion)[id] = opts?.merge ? { ...(col(coleccion)[id] ?? {}), ...v } : { ...v };
      escrituras.push({ coleccion, id, op: 'set', datos: v });
    },
    update: async (v: Record<string, unknown>) => { col(coleccion)[id] = { ...(col(coleccion)[id] ?? {}), ...v }; escrituras.push({ coleccion, id, op: 'update', datos: v }); },
    create: async (v: Record<string, unknown>) => {
      if (col(coleccion)[id]) throw new Error('ya existe');
      col(coleccion)[id] = { ...v }; escrituras.push({ coleccion, id, op: 'create', datos: v });
    },
  });
  return {
    collection(coleccion: string) {
      return {
        ...hacerConsulta(coleccion, []),
        doc(id?: string) { return documento(coleccion, id ?? `auto_${++n}`); },
        add: async (v: Record<string, unknown>) => {
          const id = `auto_${++n}`;
          col(coleccion)[id] = { ...v }; escrituras.push({ coleccion, id, op: 'add', datos: v });
          return { id };
        },
      };
    },
    escrituras,
    datos,
  };
}

function respuestaFalsa() {
  const r = { code: 0, body: null as any };
  const res = {
    status(c: number) { r.code = c; return res; },
    json(b: unknown) { r.body = b; return res; },
    setHeader() { return res; },
    end() { return res; },
  } as unknown as VercelResponse;
  return { res, r };
}
const peticion = (query: Record<string, string> = {}) => ({
  method: 'POST', headers: { authorization: `Bearer ${SECRETO}` }, query,
} as unknown as VercelRequest);

/** Lo que «contesta» el modelo en cada llamada, en orden. */
type Turno = { tool?: { name: string; input: Record<string, unknown> }; texto?: string };
function modeloGuionado(turnos: Turno[]) {
  const llamadas: { messages: unknown[]; system: unknown }[] = [];
  let i = 0;
  const create = async (params: { messages: unknown[]; system: unknown }) => {
    llamadas.push(params);
    const t = turnos[Math.min(i++, turnos.length - 1)];
    const usage = { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    if (t.tool) return { content: [{ type: 'tool_use', id: `tu_${i}`, name: t.tool.name, input: t.tool.input }], stop_reason: 'tool_use', usage };
    return { content: [{ type: 'text', text: t.texto ?? 'PARA DANI: nada que hacer.' }], stop_reason: 'end_turn', usage };
  };
  return { llamadas, Anthropic: class { messages = { create }; } };
}

const AHORA = new Date().toISOString();
const HOY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());

function datosBase(episodios: Record<string, Doc> = {}) {
  return {
    user_profiles: {
      u1: { userId: 'u1', email: 'ana@x.com', displayName: 'Ana Ruiz', role: 'client', planStartDate: '2026-10-05', planDurationMonths: 3 },
      coach: { userId: 'coach-uid', email: 'coach@x.com', displayName: 'Coach', role: 'coach' },
    },
    onboarding: { 'ana@x.com': { athleteId: 'ana@x.com', completedAt: '2026-10-05T10:00:00.000Z', consentimientoIA: { aceptado: true, fecha: '2026-10-05T10:00:00.000Z', version: 1 } } },
    coachSettings: { autopiloto: { modo: 'sombra', nivelPorTipo: {}, presupuesto: { mesUsd: 50, diaUsd: 3 }, menuAutomatico: 'publicar', horasAviso: 24 } },
    episodios,
    aiProposals: {}, aiUsage: {}, aiAuditLog: {}, autopiloto: {}, coachClientTasks: {}, athleteStatus: {},
  } as Record<string, Record<string, Doc>>;
}
const episodio = (id: string, e: Doc = {}): Doc => ({
  id, tipo: 'perdidas', athleteId: 'ana@x.com', disparador: { fuente: 'latido', fecha: HOY }, estado: 'pendiente', prioridad: 4,
  politica: 'sombra', ronda: 0, propuestas: [], paraDani: '', coste: { usd: 0, llamadas: 0, modelo: '' }, creadoEn: AHORA, actualizadoEn: AHORA, ...e,
});

async function ejecutar(db: unknown, modelo: ReturnType<typeof modeloGuionado>, query: Record<string, string> = {}) {
  vi.resetModules();
  vi.doMock('./_lib/auth.js', () => ({ COACH_EMAIL: 'coach@x.com', getAdminDb: async () => db }));
  vi.doMock('@anthropic-ai/sdk', () => ({ default: modelo.Anthropic }));
  vi.doMock('firebase-admin/firestore', () => ({ FieldValue: { increment: (x: number) => ({ __inc: x }) } }));
  const handler = (await import('./autopiloto')).default;
  const { res, r } = respuestaFalsa();
  await handler(peticion(query), res);
  return r;
}

beforeEach(() => {
  process.env.CRON_SECRET = SECRETO;
  process.env.ANTHROPIC_API_KEY = 'clave-de-pruebas';
  delete process.env.AI_DAILY_USD_LIMIT;
  vi.resetModules();
});

describe('api/autopiloto · de punta a punta', () => {
  it('un episodio en sombra: la tool deja la propuesta como «sombra», el episodio se cierra con su PARA DANI y el gasto queda anotado', async () => {
    const db = firestoreFalso(datosBase({ ep1: episodio('ep1') }));
    const modelo = modeloGuionado([
      { tool: { name: 'add_coach_task', input: { athlete_email: 'ana@x.com', title: 'Preguntarle por las dos sesiones perdidas', description: 'Texto para WhatsApp listo.' } } },
      { texto: 'He dejado la tarea.\nPARA DANI: dos sesiones perdidas esta semana; te he dejado la pregunta.' },
    ]);
    const r = await ejecutar(db, modelo);
    expect(r.code).toBe(200);
    expect(r.body.episodios).toBe(1);
    expect(r.body.hechos).toBe(1);

    // El modelo recibió el guion del episodio y el alias, nunca el nombre completo.
    expect(modelo.llamadas).toHaveLength(2);
    const primerMensaje = JSON.stringify(modelo.llamadas[0].messages[0]);
    expect(primerMensaje).toContain('Ana R.');
    expect(primerMensaje).not.toContain('Ana Ruiz');

    // La tool escribió la tarea con la marca del episodio.
    const tarea = db.escrituras.find(e => e.coleccion === 'coachClientTasks');
    expect(tarea).toBeDefined();

    // El episodio quedó cerrado con lo que Dani ve.
    const ep = db.datos.episodios.ep1 as { estado: string; paraDani: string; ronda: number; coste: { usd: number; llamadas: number } };
    expect(ep.estado).toBe('hecho');
    expect(ep.paraDani).toBe('dos sesiones perdidas esta semana; te he dejado la pregunta.');
    expect(ep.ronda).toBe(2);
    expect(ep.coste.llamadas).toBe(2);
    expect(ep.coste.usd).toBeGreaterThan(0);

    // Gasto y auditoría, y un resumen sin correos.
    expect(db.escrituras.filter(e => e.coleccion === 'aiAuditLog')).toHaveLength(2);
    expect(db.escrituras.filter(e => e.coleccion === 'aiUsage')).toHaveLength(2);
    const resumen = db.escrituras.find(e => e.coleccion === 'autopiloto');
    expect(resumen).toBeDefined();
    expect(JSON.stringify(resumen!.datos)).not.toContain('@');
  });

  it('una propuesta creada por una tool en sombra se guarda como status «sombra», con autor y episodio', async () => {
    const db = firestoreFalso(datosBase({ ep2: episodio('ep2', { tipo: 'semana_nueva' }) }));
    const modelo = modeloGuionado([
      { tool: { name: 'propose_mensaje_atleta', input: { athlete_email: 'ana@x.com', texto: 'Esta semana subimos a cuatro series en press.', motivo: 'semana_nueva', semana: 4, rationale: 'progresión programada' } } },
      { texto: 'PARA DANI: mensaje de la semana preparado.' },
    ]);
    const r = await ejecutar(db, modelo);
    expect(r.code).toBe(200);
    const propuestas = Object.values(db.datos.aiProposals) as { status: string; autor: string; politica: string; episodioId: string; kind: string; paraAtleta?: string }[];
    expect(propuestas).toHaveLength(1);
    expect(propuestas[0]).toMatchObject({ status: 'sombra', autor: 'asistente', politica: 'sombra', episodioId: 'ep2', kind: 'mensajeAtleta' });
    // En sombra no se escribe NADA al atleta: ni mensaje ni nada que no sea la propuesta, el episodio y el gasto.
    expect(db.escrituras.map(e => e.coleccion).filter(c => !['aiProposals', 'episodios', 'aiUsage', 'aiAuditLog', 'autopiloto'].includes(c))).toEqual([]);
    const ep = db.datos.episodios.ep2 as { estado: string; propuestas: string[]; aplicadas?: string[] };
    expect(ep.estado).toBe('hecho');
    expect(ep.propuestas).toHaveLength(1);
    expect(ep.aplicadas ?? []).toEqual([]);
  });

  it('en seco lista la cola y no escribe ni llama al modelo', async () => {
    const db = firestoreFalso(datosBase({ ep1: episodio('ep1'), ep0: episodio('ep0', { tipo: 'dolor', prioridad: 1 }) }));
    const modelo = modeloGuionado([{}]);
    const r = await ejecutar(db, modelo, { seco: '1' });
    expect(r.code).toBe(200);
    expect(r.body.enSeco).toBe(true);
    expect(r.body.pendientes.map((p: { id: string }) => p.id)).toEqual(['ep0', 'ep1']); // por prioridad
    expect(db.escrituras).toEqual([]);
    expect(modelo.llamadas).toEqual([]);
  });

  it('con el presupuesto del día gastado no llama al modelo y lo dice', async () => {
    const datos = datosBase({ ep1: episodio('ep1') });
    datos.aiUsage[`daily_${HOY}`] = { date: HOY, gastoUsd: 3.5 };
    const db = firestoreFalso(datos);
    const modelo = modeloGuionado([{}]);
    const r = await ejecutar(db, modelo);
    expect(r.code).toBe(200);
    expect(r.body.paradoPor).toMatch(/presupuesto diario/);
    expect(modelo.llamadas).toEqual([]);
    expect((db.datos.episodios.ep1 as { estado: string }).estado).toBe('pendiente');
  });

  it('lo que esperaba a Dani se reanuda cuando ha decidido y entra en la cola', async () => {
    const datos = datosBase({
      esp: episodio('esp', { tipo: 'alta_completada', politica: 'proponer', estado: 'escalado', esperaPropuestas: ['p1'], propuestas: ['p1'], ronda: 2, prioridad: 8,
        historial: [{ role: 'user', content: [{ type: 'text', text: 'guion' }] }, { role: 'assistant', content: [{ type: 'text', text: 'ESPERO: el mesociclo.\nPARA DANI: aprueba el mesociclo.' }] }] }),
    });
    datos.coachSettings.autopiloto = { ...datos.coachSettings.autopiloto, modo: 'rodaje' };
    datos.aiProposals.p1 = { athleteId: 'ana@x.com', kind: 'mesocycle', status: 'approved', summary: 'Mesociclo #1', resultEntityId: 'm1', createdAt: AHORA, reviewedAt: AHORA };
    const db = firestoreFalso(datos);
    const modelo = modeloGuionado([{ texto: 'PARA DANI: plan montado.' }]);
    const r = await ejecutar(db, modelo);
    expect(r.code).toBe(200);
    expect(r.body.reanudados).toBe(1);
    expect(r.body.episodios).toBe(1);
    // El modelo recibió lo que Dani decidió como siguiente mensaje del historial.
    const ultimo = JSON.stringify(modelo.llamadas[0].messages.at(-1));
    expect(ultimo).toContain('APROBADA «Mesociclo #1»');
    const ep = db.datos.episodios.esp as { estado: string; aplicadas?: string[]; esperaPropuestas?: string[] };
    expect(ep.estado).toBe('hecho');
    expect(ep.aplicadas).toEqual(['p1']);
    expect(ep.esperaPropuestas).toBeUndefined();
  });

  it('un episodio de un atleta sin consentimiento falla limpio y no para a los demás', async () => {
    const datos = datosBase({ sin: episodio('sin', { athleteId: 'nadie@x.com', prioridad: 1 }), ep1: episodio('ep1') });
    datos.user_profiles.u2 = { userId: 'u2', email: 'nadie@x.com', displayName: 'Nadie', role: 'client' };
    const db = firestoreFalso(datos);
    const modelo = modeloGuionado([
      { tool: { name: 'add_coach_task', input: { athlete_email: 'nadie@x.com', title: 't', description: 'd' } } },
      { texto: 'PARA DANI: hecho.' },
    ]);
    const r = await ejecutar(db, modelo);
    expect(r.code).toBe(200);
    expect(r.body.episodios).toBe(2);
    // La tool del atleta sin consentimiento devuelve error al modelo (no escribe), pero el episodio sigue y cierra.
    expect(db.escrituras.filter(e => e.coleccion === 'coachClientTasks')).toHaveLength(0);
    expect((db.datos.episodios.ep1 as { estado: string }).estado).toBe('hecho');
  });
});
