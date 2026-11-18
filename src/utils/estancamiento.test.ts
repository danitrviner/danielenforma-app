import { describe, it, expect } from 'vitest';
import type { WorkoutLog, WorkoutSetLog } from '../types';
import {
  detectarEstancamiento, nivelesDe, tramoSinMejorar, textoDeSemanas,
  SEMANAS_SIN_MEJORAR, SEMANAS_PARA_CAMBIAR_VARIANTE, SESIONES_SIN_MEJORAR,
} from './estancamiento';
import { MEJORA_SOSTENIDA_RM_PCT, RUIDO_RM_PCT, SESIONES_DEL_NIVEL } from './ruidoDeMedida';
import { rmCdg } from './oneRepMax';
import { addDays } from './trainingWeek';

/* ═══════════════════════════════════════════════════════════════════════════
   Estancamiento en semanas y con mejora sostenida (auditoría de cifras,
   17-11-2026).

   La segunda mitad de este archivo es la SIMULACIÓN de la auditoría, fijada
   con semilla: si alguien toca la regla, estas cifras dicen si ha vuelto a
   avisar a quien progresa o ha dejado de avisar a quien está parado.
   ═══════════════════════════════════════════════════════════════════════════ */

const INICIO = '2026-06-01';
let n = 0;
const sesion = (date: string, sets: WorkoutSetLog[]): WorkoutLog =>
  ({ id: `e${n++}`, athleteId: 'a', workoutId: 'w', assignmentId: 'x', date, completedAt: '', entries: [{ exerciseId: 'press', sets }] }) as WorkoutLog;
/** Una serie de 80 kg a RIR 1: la del enunciado de la auditoría. */
const serie = (reps: number, kg = 80, rir = 1): WorkoutSetLog => ({ weight: kg, repsDone: reps, rir });
/** Día de la sesión `i` a frecuencia 1 (lunes) o 2 (lunes y jueves). */
const dia = (i: number, frecuencia: 1 | 2) => addDays(INICIO, frecuencia === 1 ? i * 7 : Math.floor(i / 2) * 7 + (i % 2) * 3);
/** Un bloque con las repeticiones de cada sesión. */
const bloque = (reps: readonly number[], frecuencia: 1 | 2) => reps.map((r, i) => sesion(dia(i, frecuencia), [serie(r)]));
const puntos = (marcas: readonly number[], frecuencia: 1 | 2 = 1) => marcas.map((marca, i) => ({ date: dia(i, frecuencia), marca }));

describe('las cifras de la regla', () => {
  it('seis semanas para avisar, doce para cambiar de variante, un 2 % sobre la mediana de tres', () => {
    expect(SEMANAS_SIN_MEJORAR).toBe(6);
    expect(SEMANAS_PARA_CAMBIAR_VARIANTE).toBe(12);
    expect(SESIONES_SIN_MEJORAR).toBe(6);
    expect(MEJORA_SOSTENIDA_RM_PCT).toBe(2);
    expect(SESIONES_DEL_NIVEL).toBe(3);
    // El ruido de UNA medida sigue en el 3 %: es otra cosa.
    expect(RUIDO_RM_PCT).toBe(3);
  });

  it('una repetición ganada supera el 2 % en todo el rango válido (5 a 15), y no llega al 3 %', () => {
    for (let reps = 5; reps < 15; reps++) {
      const sube = (rmCdg(80, reps + 1, 1) / rmCdg(80, reps, 1) - 1) * 100;
      expect(sube).toBeGreaterThanOrEqual(MEJORA_SOSTENIDA_RM_PCT);
      expect(sube).toBeLessThan(RUIDO_RM_PCT);
    }
  });
});

describe('el nivel y el tramo sin mejorar', () => {
  it('el nivel es la mediana de las tres últimas marcas: una sesión rara no lo mueve', () => {
    expect(nivelesDe([100, 100])).toEqual([]);
    expect(nivelesDe([100, 100, 100, 110, 100])).toEqual([100, 100, 100]);
    expect(nivelesDe([100, 100, 103, 103])).toEqual([100, 103]);
  });

  it('sin mejora en todo el tramo se cuenta desde su primera sesión, en semanas de calendario', () => {
    expect(tramoSinMejorar(puntos([100, 100]))).toBeNull();
    expect(tramoSinMejorar(puntos([100, 100, 100, 100, 100, 100, 100]))).toEqual({ desde: dia(0, 1), semanas: 6, sesiones: 7 });
    // Las mismas siete sesiones a frecuencia 2 son tres semanas, no seis.
    expect(tramoSinMejorar(puntos([100, 100, 100, 100, 100, 100, 100], 2))).toMatchObject({ semanas: 3, sesiones: 7 });
  });

  it('una subida del 2 % que se mantiene es mejora; por debajo, no', () => {
    // Sube un 2,3 % (una repetición) en la sesión 5 y lo mantiene: la cuenta
    // empieza en la sesión en la que el nivel lo confirma (dos de tres).
    expect(tramoSinMejorar(puntos([100, 100, 100, 100, 100, 102.3, 102.3, 102.3]))).toEqual({ desde: dia(6, 1), semanas: 1, sesiones: 2 });
    // Un 1,5 % no es una repetición: sigue parado desde el principio.
    expect(tramoSinMejorar(puntos([100, 100, 100, 100, 100, 101.5, 101.5, 101.5]))).toMatchObject({ desde: dia(0, 1), semanas: 7 });
  });

  it('un pico que se deshace no reinicia la cuenta, ni tapa la mejora que viene después', () => {
    // Dos sesiones buenas (semanas 3 y 4) y vuelta a lo de siempre.
    const conPico = [100, 100, 100, 102.3, 102.3, 100, 100, 100, 100];
    expect(tramoSinMejorar(puntos(conPico))).toMatchObject({ desde: dia(0, 1), semanas: 8 });
    // Si luego llega a ese nivel de verdad, lleva sin mejorar desde el pico…
    expect(tramoSinMejorar(puntos([...conPico, 102.3, 102.3]))).toMatchObject({ desde: dia(4, 1) });
    // …y la siguiente repetición sí cuenta como mejora nueva.
    expect(tramoSinMejorar(puntos([...conPico, 102.3, 102.3, 104.7, 104.7]))).toMatchObject({ desde: dia(12, 1), semanas: 0 });
  });

  it('bajar no es mejorar: quien cae sigue «sin mejorar» desde antes de la caída', () => {
    expect(tramoSinMejorar(puntos([100, 100, 100, 100, 97, 97, 97, 97]))).toMatchObject({ desde: dia(0, 1), semanas: 7 });
  });
});

describe('detectarEstancamiento, en semanas', () => {
  it('seis sesiones iguales en tres semanas (frecuencia 2) ya no son estancamiento', () => {
    expect(detectarEstancamiento(bloque(Array(6).fill(8), 2), 'press')).toBeNull();
    expect(detectarEstancamiento(bloque(Array(12).fill(8), 2), 'press')).toBeNull(); // cinco semanas y media
  });

  it('seis semanas iguales sí, a cualquier frecuencia, y dice semanas y sesiones', () => {
    expect(detectarEstancamiento(bloque(Array(13).fill(8), 2), 'press')).toMatchObject({ semanas: 6, sesiones: 13, veredicto: 'subir_series' });
    expect(detectarEstancamiento(bloque(Array(7).fill(8), 1), 'press')).toMatchObject({ semanas: 6, sesiones: 7, veredicto: 'subir_series' });
  });

  it('seis semanas con menos de seis sesiones con marca no dicen nada', () => {
    // Cinco sesiones repartidas en ocho semanas.
    const logs = [0, 2, 4, 6, 8].map(sem => sesion(addDays(INICIO, sem * 7), [serie(8)]));
    expect(detectarEstancamiento(logs, 'press')).toBeNull();
  });

  it('ganar una repetición y mantenerla ya no es estar parado', () => {
    // El caso de la auditoría: 8 repeticiones seis semanas y 9 las seis siguientes.
    const reps = [...Array(6).fill(8), ...Array(6).fill(9)];
    expect(detectarEstancamiento(bloque(reps, 1), 'press')).toBeNull();
    expect(detectarEstancamiento(bloque([...reps, ...reps].sort((a, b) => a - b), 2), 'press')).toBeNull();
  });

  it('el cambio de variante llega a las doce semanas, no antes', () => {
    expect(detectarEstancamiento(bloque(Array(12).fill(8), 1), 'press')).toMatchObject({ semanas: 11, veredicto: 'subir_series' });
    const doce = detectarEstancamiento(bloque(Array(13).fill(8), 1), 'press');
    expect(doce).toMatchObject({ semanas: 12, veredicto: 'cambiar_variante' });
    expect(doce!.accion).toContain('demasiadas semanas');
    // A frecuencia 2, doce sesiones ya no bastan: hacen falta las doce semanas.
    expect(detectarEstancamiento(bloque(Array(24).fill(8), 2), 'press')).toMatchObject({ semanas: 11, veredicto: 'subir_series' });
    expect(detectarEstancamiento(bloque(Array(25).fill(8), 2), 'press')).toMatchObject({ semanas: 12, veredicto: 'cambiar_variante' });
  });

  it('«6 semanas», «1 semana»', () => {
    expect(textoDeSemanas(6)).toBe('6 semanas');
    expect(textoDeSemanas(1)).toBe('1 semana');
  });
});

// ── La simulación de la auditoría ───────────────────────────────────────────

/** Generador con semilla (mulberry32): las cifras de abajo no bailan. */
function conSemilla(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEMANAS = 12;
const ATLETAS = 500;
const SEMILLA = 20261117;

/**
 * Un atleta: 12 semanas de una serie de 80 kg a RIR 1 con las repeticiones
 * que le tocan cada semana, y una repetición de más o de menos (a cara o
 * cruz) en una de cada tres sesiones. La marca sale del motor real (`rmCdg`
 * a través de `marcaDeSesion`).
 */
function atleta(frecuencia: 1 | 2, repsDeLaSemana: (semana: number) => number, azar: (() => number) | null): WorkoutLog[] {
  const reps: number[] = [];
  for (let semana = 0; semana < SEMANAS; semana++) {
    for (let k = 0; k < frecuencia; k++) {
      let r = repsDeLaSemana(semana);
      if (azar && azar() < 1 / 3) r += azar() < 0.5 ? 1 : -1;
      reps.push(r);
    }
  }
  return bloque(reps, frecuencia);
}

/** % de atletas con aviso de estancamiento al acabar las 12 semanas. */
function porcentajeAvisado(frecuencia: 1 | 2, repsDeLaSemana: (semana: number) => number): number {
  const azar = conSemilla(SEMILLA);
  let avisados = 0;
  for (let i = 0; i < ATLETAS; i++) {
    if (detectarEstancamiento(atleta(frecuencia, repsDeLaSemana, azar), 'press') != null) avisados++;
  }
  return (avisados * 100) / ATLETAS;
}

describe('simulación de la auditoría: 500 atletas por caso, 12 semanas, ±1 repetición en una de cada tres sesiones', () => {
  const plano = () => 8;
  const unaCadaCuatroSemanas = (semana: number) => 8 + Math.floor(semana / 4);
  const unaCadaTresSemanas = (semana: number) => 8 + Math.floor(semana / 3);

  it('(a) plano de verdad: se avisa al 85 % o más, a frecuencia 1 y a frecuencia 2', () => {
    const f1 = porcentajeAvisado(1, plano);
    const f2 = porcentajeAvisado(2, plano);
    expect(f1).toBeGreaterThanOrEqual(85);
    expect(f2).toBeGreaterThanOrEqual(85);
    // Las cifras exactas con esta semilla: si cambian, alguien ha tocado la regla.
    expect({ f1, f2 }).toEqual({ f1: 94.6, f2: 96 });
  });

  it('(b) progreso normal: se avisa al 30 % o menos (+1 repetición cada 4 semanas a frecuencia 1, cada 3 a frecuencia 2)', () => {
    const f1 = porcentajeAvisado(1, unaCadaCuatroSemanas);
    const f2 = porcentajeAvisado(2, unaCadaTresSemanas);
    expect(f1).toBeLessThanOrEqual(30);
    expect(f2).toBeLessThanOrEqual(30);
    expect({ f1, f2 }).toEqual({ f1: 8.8, f2: 1.4 });
  });

  it('(c) sin ruido, quien gana 1 repetición cada 6 semanas no recibe nunca «cambiar variante»', () => {
    // Se mira al acabar CADA sesión, no solo al final, y con el bloque alargado
    // a 36 semanas: de 8 a 13 repeticiones, todo dentro del rango válido.
    for (const frecuencia of [1, 2] as const) {
      const reps: number[] = [];
      for (let semana = 0; semana < 36; semana++) for (let k = 0; k < frecuencia; k++) reps.push(8 + Math.floor(semana / 6));
      const logs = bloque(reps, frecuencia);
      let maximo = 0;
      for (let hasta = 1; hasta <= logs.length; hasta++) {
        const e = detectarEstancamiento(logs.slice(0, hasta), 'press');
        expect(e?.veredicto).not.toBe('cambiar_variante');
        maximo = Math.max(maximo, e?.semanas ?? 0);
      }
      // Lo más que llega a estar «sin mejorar» son las seis semanas que tarda
      // en ganar la repetición: muy lejos de las doce del cambio de variante.
      expect(maximo).toBeLessThanOrEqual(SEMANAS_SIN_MEJORAR);
    }
  });
});
