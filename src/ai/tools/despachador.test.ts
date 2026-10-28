import { describe, it, expect, vi, beforeEach } from 'vitest';

/* La puerta del consentimiento. Hasta el 28-10-2026 era una lista de diez
   tools y `get_client_brief` —la que más datos del atleta mueve— no estaba.
   Estas pruebas no ejecutan ninguna tool de verdad: lectores y propuestas van
   sustituidos por espías, y lo que se comprueba es que el despachador NO los
   llame cuando el atleta no ha dado permiso. */

const { lectores, propuestas, estado } = vi.hoisted(() => ({
  lectores: {
    getClientBrief: vi.fn(async () => 'BRIEF'),
    getRevisionEngine: vi.fn(async () => 'REVISION'),
    listClients: vi.fn(async () => 'CLIENTES'),
    leerFicha: vi.fn(async () => 'FICHA'),
    getCoachAdjustments: vi.fn(async () => 'AJUSTES'),
  },
  propuestas: {
    proposeWorkoutDays: vi.fn(async () => JSON.stringify({ valid: true })),
    proposeWorkoutTemplate: vi.fn(async () => JSON.stringify({ valid: true })),
    leerExpediente: vi.fn(() => undefined),
  },
  estado: { consentimiento: undefined as { aceptado: boolean; fecha: string; version: number } | undefined },
}));

vi.mock('./lectores', () => lectores);
vi.mock('./propuestas', () => propuestas);
vi.mock('../../dbService', () => ({
  getOnboarding: vi.fn(async () => (estado.consentimiento ? { athleteId: 'ana@x.com', consentimientoIA: estado.consentimiento } : null)),
  getAllUserProfiles: vi.fn(async () => [{ email: 'ana@x.com', displayName: 'Ana García' }]),
}));

import { executeTool, requiereConsentimiento, TOOLS_SIN_DATOS_DE_ATLETA } from './despachador';
import { TOOL_DEFINITIONS } from './definiciones';

const ana = { athlete_email: 'ana@x.com' };

beforeEach(() => {
  estado.consentimiento = undefined;
  for (const f of [...Object.values(lectores), ...Object.values(propuestas)]) f.mockClear();
});

describe('requiereConsentimiento', () => {
  it('toda tool con athlete_email se comprueba, salvo las plantillas del coach', () => {
    const conEmail = TOOL_DEFINITIONS.filter(t => 'athlete_email' in (t.input_schema as { properties: Record<string, unknown> }).properties);
    expect(conEmail.length).toBeGreaterThan(30);
    for (const t of conEmail) {
      expect(requiereConsentimiento(t.name, ana), t.name).toBe(!TOOLS_SIN_DATOS_DE_ATLETA.has(t.name));
    }
    expect([...TOOLS_SIN_DATOS_DE_ATLETA].sort()).toEqual(['propose_mesocycle_template', 'propose_workout_template']);
  });

  it('sin email no hay nada que comprobar', () => {
    expect(requiereConsentimiento('list_clients', {})).toBe(false);
    expect(requiereConsentimiento('get_client_brief', { athlete_email: '   ' })).toBe(false);
  });
});

describe('executeTool y el consentimiento', () => {
  it('get_client_brief NO se ejecuta si el atleta no ha contestado, y el mensaje no es un error', async () => {
    const r = await executeTool('get_client_brief', { ...ana, tarea: 'revision' }, 'chat1');
    expect(lectores.getClientBrief).not.toHaveBeenCalled();
    expect(r.isError).toBe(false);
    expect(r.content).toMatch(/todavía no ha decidido/);
    expect(r.content).toContain('Ana G.');
    expect(r.content).not.toContain('García');
  });

  it('tampoco una propuesta sobre sus sesiones, ni la ficha, ni el motor de revisión', async () => {
    await executeTool('propose_workout_days', { ...ana, days: [] }, 'chat1');
    await executeTool('get_athlete_dossier', ana, 'chat1');
    await executeTool('get_revision_engine', ana, 'chat1');
    expect(propuestas.proposeWorkoutDays).not.toHaveBeenCalled();
    expect(lectores.leerFicha).not.toHaveBeenCalled();
    expect(lectores.getRevisionEngine).not.toHaveBeenCalled();
  });

  it('con un «no» registrado, el motivo dice que no se reintente', async () => {
    estado.consentimiento = { aceptado: false, fecha: '2026-10-01', version: 1 };
    const r = await executeTool('get_client_brief', ana, 'chat1');
    expect(r.content).toMatch(/ha rechazado/);
    expect(lectores.getClientBrief).not.toHaveBeenCalled();
  });

  it('con consentimiento aceptado se ejecuta con normalidad', async () => {
    estado.consentimiento = { aceptado: true, fecha: '2026-10-01', version: 1 };
    const r = await executeTool('get_client_brief', { ...ana, tarea: 'revision' }, 'chat1');
    expect(lectores.getClientBrief).toHaveBeenCalledWith('ana@x.com', 'revision');
    expect(r).toEqual({ content: 'BRIEF', isError: false });
  });

  it('las tools sin atleta y las plantillas del coach no pasan por la puerta', async () => {
    await executeTool('list_clients', {}, 'chat1');
    expect(lectores.listClients).toHaveBeenCalled();
    await executeTool('propose_workout_template', { ...ana, name: 'Torso A', exercises: [] }, 'chat1');
    expect(propuestas.proposeWorkoutTemplate).toHaveBeenCalled();
  });

  it('get_coach_adjustments de toda la cartera (sin email) no se bloquea: filtra por dentro', async () => {
    await executeTool('get_coach_adjustments', {}, 'chat1');
    expect(lectores.getCoachAdjustments).toHaveBeenCalledWith(undefined);
  });
});
