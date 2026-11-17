import { describe, it, expect } from 'vitest';
import {
  DOCTRINA_DEFAULTS,
  DOCTRINA_ENTRENAMIENTO_DEFAULT,
  DOCTRINA_NUTRICION_DEFAULT,
  buildDoctrinaBlock,
} from './doctrina';
import { MUSCLE_LABELS, type MuscleGroup } from '../types';
import { RM_OBJETIVO_PCT, SEMANAS_ENTRE_SUBIDAS, SEMANAS_POR_DEFECTO } from '../utils/hipotesisDeBloque/cifras';
import { RUIDO_RM_PCT } from '../utils/ruidoDeMedida';
import { REPS_MAX_RM, REPS_MIN_RM, RIR_MAX_RM } from '../utils/rmValido';

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
  // 28-10-2026: Dani decidió que en proteína manda el alta (2 g/kg). El
  // criterio anterior (0,8-1 g/kg) contradecía al cálculo del alta y a lo que
  // él mismo aprobaba, y el validador (revisarObjetivoNutricional) ahora
  // rechaza por debajo de 1,2 g/kg.
  it('la proteína va a 1,6-2,2 g/kg, con 2,0-2,4 en déficit profundo', () => {
    expect(DOCTRINA_NUTRICION_DEFAULT).toContain('1,6-2,2 g/kg');
    expect(DOCTRINA_NUTRICION_DEFAULT).toContain('2,0-2,4 g/kg');
    expect(DOCTRINA_NUTRICION_DEFAULT).not.toContain('0,8-1 g/kg');
  });

  it('la dieta parte de lo que el atleta ya come, y el giro hacia comida vegetal se propone, no se aplica solo', () => {
    expect(DOCTRINA_NUTRICION_DEFAULT).toMatch(/ya come/);
    expect(DOCTRINA_NUTRICION_DEFAULT).toMatch(/PROPÓNMELA|propónmela/);
  });

  // Dani, 11-11-2026: antes «8-12 es la ventana buena». Se baja para que el
  // asistente diga lo mismo que la calculadora de reparto (tope de 8) y no
  // proponga 12 series de un músculo en un día que luego se marcan como exceso.
  it('hasta 8 series por músculo y sesión; 9-10 con motivo; más de 10 se reparte', () => {
    expect(DOCTRINA_ENTRENAMIENTO_DEFAULT).toContain('Hasta 8 series por músculo y sesión');
    expect(DOCTRINA_ENTRENAMIENTO_DEFAULT).toMatch(/9-10 solo con un motivo/);
    expect(DOCTRINA_ENTRENAMIENTO_DEFAULT).toMatch(/más de 10 se reparte/);
    expect(DOCTRINA_ENTRENAMIENTO_DEFAULT).not.toContain('8-12 series por músculo y sesión');
  });

  /* 17-11-2026: el sistema de hipótesis del bloque. Las cifras salen de
     `hipotesisDeBloque/cifras.ts`, `ruidoDeMedida.ts` y `rmValido.ts`; aquí se
     ata que la doctrina las dice y que lo que las contradecía ya no está. */
  it('cada bloque lleva hipótesis por zona prioritaria, con objetivo medible', () => {
    expect(DOCTRINA_ENTRENAMIENTO_DEFAULT).toMatch(/HIPÓTESIS por zona prioritaria, con objetivo medible/);
    expect(DOCTRINA_ENTRENAMIENTO_DEFAULT).toContain(`+${RM_OBJETIVO_PCT} % de RM estimado`);
    expect(DOCTRINA_ENTRENAMIENTO_DEFAULT).toMatch(/cambia de palanca/);
  });

  it('la subida va por escalones sostenidos 2 semanas, con techo por bloque, y desde la segunda se repiten los puntos', () => {
    expect(SEMANAS_ENTRE_SUBIDAS).toBe(2);
    expect(DOCTRINA_ENTRENAMIENTO_DEFAULT).toContain('se SOSTIENE al menos 2 semanas');
    expect(DOCTRINA_ENTRENAMIENTO_DEFAULT).toMatch(/velocidad suave por defecto,\s+~10 %/);
    expect(DOCTRINA_ENTRENAMIENTO_DEFAULT).toMatch(/TECHO por bloque: donde acabó el\s+anterior más un escalón/);
    expect(DOCTRINA_ENTRENAMIENTO_DEFAULT).toMatch(/Desde la segunda subida del bloque se repiten los PUNTOS/);
    // Lo que había antes: series sueltas por bloque y de MEV a MRV dentro del bloque.
    expect(DOCTRINA_ENTRENAMIENTO_DEFAULT).not.toMatch(/\+1-2 series|\+2-4 series/);
    expect(DOCTRINA_ENTRENAMIENTO_DEFAULT).not.toContain('Se progresa de MEV hacia MRV');
  });

  it('el bloque nuevo arranca donde acabó el anterior; semana 1 reducida solo con ejercicios nuevos o parón de más de 3 semanas', () => {
    expect(DOCTRINA_ENTRENAMIENTO_DEFAULT).toContain('ARRANCA DONDE ACABÓ EL ANTERIOR');
    expect(DOCTRINA_ENTRENAMIENTO_DEFAULT).toMatch(/Semana 1 reducida \(un 5-10 % menos\) solo en dos casos/);
    expect(DOCTRINA_ENTRENAMIENTO_DEFAULT).toMatch(/parón de más de 3 semanas/);
  });

  // 17-11-2026: norma de ejercicio nuevo. Las cifras salen de `rampaDeEjercicioNuevo.ts`.
  it('ejercicio nuevo: semanas 1-3 a 10-12 (multiarticular) o 12-14 (aislamiento), y desde la 4 el rango pautado', () => {
    expect(DOCTRINA_ENTRENAMIENTO_DEFAULT).toContain('EJERCICIO NUEVO (no lo ha hecho nunca, o no en más de 8 semanas)');
    expect(DOCTRINA_ENTRENAMIENTO_DEFAULT).toMatch(/semanas 1-3 entra con más repeticiones\s+—10-12 los multiarticulares, 12-14 los de aislamiento—/);
    expect(DOCTRINA_ENTRENAMIENTO_DEFAULT).toMatch(/desde la semana 4 pasa de golpe al rango pautado/);
    // El asistente pauta el rango real: la entrada la pone la app.
    expect(DOCTRINA_ENTRENAMIENTO_DEFAULT).toMatch(/la entrada la pone la app al guardar la rutina/);
  });

  it('bloques de 12 semanas (8 el primero) y sin fases fijas por semana', () => {
    expect(SEMANAS_POR_DEFECTO).toBe(12);
    expect(DOCTRINA_ENTRENAMIENTO_DEFAULT).toContain('### 11. Estructura del bloque (12 semanas por defecto; 8 el primer bloque)');
    expect(DOCTRINA_ENTRENAMIENTO_DEFAULT).toContain('No hay fases fijas por semana');
    expect(DOCTRINA_ENTRENAMIENTO_DEFAULT).not.toContain('1-4 / 4-8 / 9-12');
  });

  it('cuatro niveles por grupo: especializar, desarrollar, mantener a la mitad e ignorar', () => {
    for (const nivel of ['Especializar (alta)', 'Desarrollar (media)', 'Mantener (baja): la MITAD', 'Ignorar (ignorar): 0 series']) {
      expect(DOCTRINA_ENTRENAMIENTO_DEFAULT).toContain(nivel);
    }
  });

  it('en descarga o semana puente se quita volumen, nunca intensidad, y solo por señales', () => {
    expect(DOCTRINA_ENTRENAMIENTO_DEFAULT).toMatch(/Descarga y semana puente: se quita VOLUMEN, nunca intensidad/);
    expect(DOCTRINA_ENTRENAMIENTO_DEFAULT).toMatch(/solo por SEÑALES/);
    expect(DOCTRINA_ENTRENAMIENTO_DEFAULT).toMatch(/nunca por calendario/);
    // La descarga de antes iba «la última semana», con series fijas.
    expect(DOCTRINA_ENTRENAMIENTO_DEFAULT).not.toContain('Cuando toca: última semana');
  });

  it('el RM estimado tiene un ruido del 3 % y solo cuentan series de 3 a 12 repeticiones con RIR 2 o menos', () => {
    expect([RUIDO_RM_PCT, REPS_MIN_RM, REPS_MAX_RM, RIR_MAX_RM]).toEqual([3, 3, 12, 2]);
    expect(DOCTRINA_ENTRENAMIENTO_DEFAULT).toMatch(/series de 3 a 12 repeticiones\s+con RIR 2 o menos/);
    expect(DOCTRINA_ENTRENAMIENTO_DEFAULT).toContain('ruido del 3 %');
  });

  it('el grupo prioritario va primero en la sesión', () => {
    expect(DOCTRINA_ENTRENAMIENTO_DEFAULT).toMatch(/El grupo PRIORITARIO del bloque va primero en la sesión/);
  });

  it('en definición no se recorta volumen por defecto', () => {
    expect(DOCTRINA_ENTRENAMIENTO_DEFAULT).toMatch(/No se recorta volumen por defecto/);
  });

  it('el superávit lo gobierna el ritmo de 150-300 g/semana (0,2-0,35 %), no las calorías', () => {
    expect(DOCTRINA_NUTRICION_DEFAULT).toContain('150-300 g');
    expect(DOCTRINA_NUTRICION_DEFAULT).toContain('0,2 y el 0,35 %');
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
