import { describe, it, expect } from 'vitest';
import { TAREAS, TAREAS_PROMPT, tareaPorId } from './tareas';
import { TOOL_DEFINITIONS } from './tools';
import { SYSTEM_PROMPT } from './systemPrompt';

describe('las tres tareas', () => {
  it('son exactamente las tres que hace Dani y cada una empieza por el brief', () => {
    expect(TAREAS.map(t => t.id)).toEqual(['mes_nuevo', 'revision', 'renovar_mes']);
    for (const t of TAREAS) {
      const prompt = t.prompt('Marcos', 'marcos@x.com');
      expect(prompt.startsWith('TAREA:')).toBe(true);
      expect(prompt).toContain('get_client_brief');
      expect(prompt).toContain(`"${t.id}"`);
      expect(prompt).toContain('marcos@x.com');
    }
  });

  it('montar un mes (nuevo o renovado) recorre TODOS los planos de la app', () => {
    // La lista es la misma que la checklist de Setup del cliente: si allí se
    // añade un item, este test recuerda que el guion también lo necesita.
    const imprescindibles = [
      'propose_mesocycle', 'propose_workout_days', 'propose_publish_block',
      'propose_nutrition_program', 'propose_diet_update', 'propose_setup_config',
      'propose_level_ladder', 'propose_roadmap_items', 'propose_special_day',
      'get_challenge_options', 'propose_weekly_challenge', 'propose_dossier_update',
      'add_coach_task',
    ];
    for (const id of ['mes_nuevo', 'renovar_mes'] as const) {
      const prompt = tareaPorId(id)!.prompt('M', 'm@x.com');
      for (const tool of imprescindibles) {
        expect(prompt, `${id} debe pedir ${tool}`).toContain(tool);
      }
      expect(prompt).toContain('CÓMO PROGRAMA DANI');
      // Los planos, por su nombre en la app.
      for (const plano of ['PASOS', 'CALENDARIO semanal de dietas', 'CUESTIONARIO', 'FOTOS', 'CARDIO', 'RETOS']) {
        expect(prompt, `${id} debe cubrir ${plano}`).toContain(plano);
      }
    }
  });

  it('el guion dice que el presupuesto sí y las comidas no', () => {
    const prompt = tareaPorId('mes_nuevo')!.prompt('M', 'm@x.com');
    expect(prompt).toContain('PRESUPUESTO de intercambios');
    expect(prompt).toMatch(/NO rellenes comidas/);
  });

  it('lo que la IA no puede arreglar acaba en una nota para Dani', () => {
    for (const id of ['mes_nuevo', 'revision', 'renovar_mes'] as const) {
      expect(tareaPorId(id)!.prompt('M', 'm@x.com'), id).toContain('add_coach_task');
    }
  });

  it('la revisión no monta un mes: compara y propone solo lo que cambia', () => {
    const prompt = tareaPorId('revision')!.prompt('M', 'm@x.com');
    expect(prompt).toContain('draft_checkin_feedback');
    expect(prompt).not.toContain('propose_level_ladder');
    expect(prompt).toContain('Repaso plano por plano');
    // El análisis de nutrición y el del cuerpo llegan DENTRO del brief, no
    // como llamadas sueltas: si no estuvieran, la revisión decidiría a ciegas.
    expect(tareaPorId('revision')!.brief).toContain('nutricion');
    expect(tareaPorId('revision')!.brief).toContain('cuerpo');
    expect(prompt).toContain('qué había antes y qué propones ahora');
  });

  it('todas las tools que nombran los guiones existen de verdad', () => {
    const nombres = new Set(TOOL_DEFINITIONS.map(t => t.name));
    for (const t of TAREAS) {
      const prompt = t.prompt('M', 'm@x.com');
      for (const m of prompt.matchAll(/\b(get|propose|add|draft)_[a-z_]+/g)) {
        expect(nombres.has(m[0]), `${t.id} nombra una tool que no existe: ${m[0]}`).toBe(true);
      }
    }
  });

  it('las secciones del brief de cada tarea existen en la tool', () => {
    const tool = TOOL_DEFINITIONS.find(t => t.name === 'get_client_brief');
    expect(tool).toBeDefined();
    const enumTareas = (tool!.input_schema as { properties: { tarea: { enum: string[] } } }).properties.tarea.enum;
    expect(enumTareas).toEqual(TAREAS.map(t => t.id));
    expect(tareaPorId('mes_nuevo')!.brief).toContain('alta');
    expect(tareaPorId('revision')!.brief).toContain('entrenos');
    expect(tareaPorId('renovar_mes')!.brief).toContain('ajustes');
  });

  it('el prompt de sistema describe las tareas y cómo presentar las propuestas', () => {
    expect(SYSTEM_PROMPT).toContain(TAREAS_PROMPT);
    expect(SYSTEM_PROMPT).toContain('CÓMO PROGRAMA DANI');
    expect(SYSTEM_PROMPT).toContain('El mes de un vistazo');
  });
});
