import { describe, it, expect } from 'vitest';
import {
  DOCTRINA_DEFAULTS,
  DOCTRINA_ENTRENAMIENTO_DEFAULT,
  DOCTRINA_NUTRICION_DEFAULT,
  buildDoctrinaBlock,
} from './doctrina';
import { MUSCLE_LABELS, type MuscleGroup } from '../types';

describe('buildDoctrinaBlock', () => {
  it('devuelve cadena vacía si no hay doctrina — el bloque no debe añadirse al system', () => {
    expect(buildDoctrinaBlock('', '')).toBe('');
    expect(buildDoctrinaBlock('   ', '\n')).toBe('');
  });

  it('incluye una sola doctrina si la otra está vacía', () => {
    const soloEntreno = buildDoctrinaBlock('criterio de entreno', '');
    expect(soloEntreno).toContain('criterio de entreno');
    expect(soloEntreno).toContain('CRITERIO DEL COACH');
  });

  it('deja claro que el criterio manda sobre la convención genérica', () => {
    const bloque = buildDoctrinaBlock('a', 'b');
    expect(bloque).toContain('prioridad');
  });
});

describe('doctrina por defecto', () => {
  it('no está vacía — el asistente nunca debe operar sin criterio', () => {
    expect(DOCTRINA_ENTRENAMIENTO_DEFAULT.length).toBeGreaterThan(500);
    expect(DOCTRINA_NUTRICION_DEFAULT.length).toBeGreaterThan(500);
    expect(DOCTRINA_DEFAULTS.entrenamiento).toBe(DOCTRINA_ENTRENAMIENTO_DEFAULT);
    expect(DOCTRINA_DEFAULTS.nutricion).toBe(DOCTRINA_NUTRICION_DEFAULT);
  });

  // La doctrina de entrenamiento da un rango de series por grupo usando las
  // claves REALES del enum. Si alguien renombra un grupo en types.ts y no toca
  // esto, el asistente pautaría volumen para una clave que ya no existe y
  // propose_mesocycle lo rechazaría — mejor que falle aquí.
  //
  // 'aductores' (T10, 18-08) llevó un rango de referencia (6-12, investigado
  // — la literatura de hipertrofia no publica landmarks MEV/MRV específicos
  // para aductores; 6-12 sale de combinar 3-4 series × 2-3 sesiones/semana de
  // trabajo directo, más bajo que isquios/glúteo porque ya reciben trabajo
  // indirecto de sentadilla, zancada e hip thrust) hasta que Dani lo ajuste
  // con la respuesta real de sus atletas — ya no está excluido de este test.
  it('nombra todas las claves de MuscleGroup tal y como las valida propose_mesocycle', () => {
    // Longitud derivada de MUSCLE_LABELS, no fija a mano — un número fijo es
    // justo lo que se quedó desfasado la última vez que se añadió un grupo
    // (T-lumbares/rotadores) sin que este test lo avisara.
    const claves = Object.keys(MUSCLE_LABELS) as MuscleGroup[];
    expect(claves.length).toBeGreaterThan(0);
    const faltan = claves.filter(k => !DOCTRINA_ENTRENAMIENTO_DEFAULT.includes(k));
    expect(faltan).toEqual([]);
  });

  it('la doctrina de nutrición fija la proteína en g/kg, no en gramos absolutos', () => {
    expect(DOCTRINA_NUTRICION_DEFAULT).toMatch(/g\/kg/);
  });
});

/* Cifras y reglas que Dani decidió expresamente (2026-09-02) y que no deben
   perderse en una reescritura de estilo. No se comprueba la redacción: se
   comprueba que el número o la regla siguen ahí. Si Dani cambia de criterio,
   este test se actualiza CON él, no se borra. */
describe('decisiones de Dani que no se pueden perder', () => {
  it('la proteína va por fase: 0,8-1 en volumen y 1-1,4 en déficit', () => {
    expect(DOCTRINA_NUTRICION_DEFAULT).toContain('0,8-1 g/kg');
    expect(DOCTRINA_NUTRICION_DEFAULT).toContain('1-1,4 g/kg');
  });

  it('la dieta parte de lo que el atleta ya come, y el giro hacia comida vegetal se propone, no se aplica solo', () => {
    expect(DOCTRINA_NUTRICION_DEFAULT).toMatch(/ya come/);
    expect(DOCTRINA_NUTRICION_DEFAULT).toMatch(/PROPÓNMELA|propónmela/);
  });

  it('mantiene la ventana de 8-12 series por músculo y sesión', () => {
    expect(DOCTRINA_ENTRENAMIENTO_DEFAULT).toContain('8-12 series por músculo y sesión');
  });

  it('en definición no se recorta volumen por defecto', () => {
    expect(DOCTRINA_ENTRENAMIENTO_DEFAULT).toMatch(/No se recorta volumen por defecto/);
  });

  it('el superávit lo gobierna el ritmo de 150-250 g/semana, no las calorías', () => {
    expect(DOCTRINA_NUTRICION_DEFAULT).toContain('150-250 g');
    expect(DOCTRINA_NUTRICION_DEFAULT).toContain('0,2% del peso');
  });

  it('el techo del déficit es 700, con fase acelerada solo para quien llega con mucha grasa', () => {
    expect(DOCTRINA_NUTRICION_DEFAULT).toContain('Techo general 700 kcal');
    expect(DOCTRINA_NUTRICION_DEFAULT).toMatch(/pérdida acelerada/);
  });

  it('las dos doctrinas abren mandando preguntar en vez de asumir', () => {
    expect(DOCTRINA_ENTRENAMIENTO_DEFAULT).toContain('Pregunta antes de asumir');
    expect(DOCTRINA_NUTRICION_DEFAULT).toContain('Pregunta antes de asumir');
  });

  it('no repite lo que ya dice el SYSTEM_PROMPT (get_food_library, múltiplos de 0.25)', () => {
    expect(DOCTRINA_NUTRICION_DEFAULT).not.toContain('get_food_library');
    expect(DOCTRINA_NUTRICION_DEFAULT).not.toContain('0.25');
  });
});
