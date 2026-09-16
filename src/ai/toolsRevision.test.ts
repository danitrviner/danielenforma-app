import { describe, it, expect } from 'vitest';
import { TOOL_DEFINITIONS } from './tools';
import { TAREAS, tareaPorId } from './tareas';

/* La herramienta `get_revision_engine` existe para que el asistente y la
   pantalla de Revisión digan LO MISMO. Estas pruebas no ejecutan la tool —eso
   necesitaría Firestore— sino que sujetan el contrato que la hace útil: que
   esté declarada, que la tarea de revisión la use, y que haya dejado de pedir
   los logs crudos que ahora llegan masticados. */

const tool = (name: string) => TOOL_DEFINITIONS.find(t => t.name === name);

describe('get_revision_engine', () => {
  it('está declarada con el email obligatorio y el periodo opcional', () => {
    const t = tool('get_revision_engine')!;
    expect(t).toBeDefined();
    expect(t.input_schema.required).toEqual(['athlete_email']);
    expect(Object.keys(t.input_schema.properties)).toEqual(['athlete_email', 'periodo']);
  });

  it('su descripción manda no pedir por separado lo que ya trae', () => {
    const d = tool('get_revision_engine')!.description;
    expect(d).toContain('get_training_history');
    expect(d).toContain('get_checkins');
  });

  it('la tarea de revisión la llama y ya no pide los entrenos crudos', () => {
    const revision = tareaPorId('revision')!;
    expect(revision.brief).not.toContain('entrenos');
    expect(revision.prompt('Ana', 'a@x.com')).toContain('get_revision_engine');
  });

  it('montar y renovar el mes SÍ siguen pidiendo los entrenos', () => {
    // No es un descuido: al montar un bloque nuevo hace falta el historial
    // largo, no el resumen de una ventana.
    expect(tareaPorId('renovar_mes')!.brief).toContain('entrenos');
  });

  it('el prompt avisa de que solo `paraCliente` se le puede decir al atleta', () => {
    const p = tareaPorId('revision')!.prompt('Ana', 'a@x.com');
    expect(p).toContain('paraCliente');
    expect(p).toMatch(/criterio de coach/i);
  });
});

describe('las descripciones no mandan a pantallas que ya no existen', () => {
  it('ninguna tool cita la zona «Análisis», retirada el 16-09', () => {
    const culpables = TOOL_DEFINITIONS
      .filter(t => /Análisis ›/.test(t.description))
      .map(t => t.name);
    expect(culpables).toEqual([]);
  });

  it('tampoco los prompts de las tareas', () => {
    for (const t of TAREAS) {
      expect(t.prompt('Ana', 'a@x.com')).not.toMatch(/Análisis ›/);
    }
  });
});

describe('get_volume_suggestion', () => {
  it('está declarada y solo exige el email', () => {
    const t = tool('get_volume_suggestion')!;
    expect(t).toBeDefined();
    expect(t.input_schema.required).toEqual(['athlete_email']);
  });

  it('el guion manda llamarla ANTES de proponer el mesociclo', () => {
    const guion = tareaPorId('mes_nuevo')!.prompt('Ana', 'a@x.com');
    const iMotor = guion.indexOf('get_volume_suggestion');
    const iPropuesta = guion.indexOf('propose_mesocycle');
    expect(iMotor).toBeGreaterThan(-1);
    // Van en la misma línea: el motor se cita dentro del paso del mesociclo.
    expect(Math.abs(iMotor - iPropuesta)).toBeLessThan(400);
    expect(guion).toMatch(/di por qué/);
  });
});
