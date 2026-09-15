import { describe, it, expect } from 'vitest';
import { SEEDED_ITEMS } from './clientSetup';
import {
  PASOS_DEL_RECORRIDO, BLOQUES_RECORRIDO, ORDEN_BLOQUES, pasosDeBloque,
  textoDelPlanCompleto, idDePaso,
} from './recorridoDelPlan';

/* El guion tal y como estaba escrito a mano en `ai/tareas.ts` antes de que se
   generara desde `PASOS_DEL_RECORRIDO`.
   
   Está aquí entero y a propósito: es TEXTO DE PROMPT, lo que decide qué hace el
   asistente con el plan de un cliente real. Un cambio accidental —un espacio,
   un paso reordenado, una tool mal escrita— no da error de compilación ni rompe
   ninguna pantalla; se manifiesta semanas después como «la IA ya no publica el
   bloque». Este test es lo que hace que ese cambio se vea en el diff. */
const GUION_ORIGINAL = `### El plan entero, en este orden (no pares a la mitad ni preguntes «¿sigo?»)

**A. Antes de proponer nada — el alta**
0. Repasa el ALTA del brief entera. Todo lo que esté sin contestar, a medias o se contradiga con lo que ves en sus datos, déjalo como nota con add_coach_task (una nota por cosa, con el dato dentro: "En el alta puso 5 días pero solo registra 3 entrenos: confirmar días reales"). Bloquean de verdad: días que va a entrenar, minutos por sesión, material, lesiones activas. Lo que bloquea se pregunta; lo que no, se asume y se dice qué has asumido.
0b. Si le falta la fecha de inicio, la duración del plan o el peso objetivo, van en el paso 8 (propose_setup_config), no en una nota.

**B. Entrenamiento**
1. **Mesociclo** (propose_mesocycle): semanas, días por ciclo, objetivo y reparto de series por grupo. Sale del criterio de volumen de tu doctrina y de lo que el atleta puede de verdad.
2. **Sesiones** (propose_workout_days): cada día con sus ejercicios, series, reps, RIR y descansos. Elige del bloque «CÓMO PROGRAMA DANI» del contexto — no pidas get_exercise_usage ni recorras el catálogo grupo a grupo; get_exercise_library solo si un grupo no tiene nada usable ahí o el material lo descarta.
3. **Publicar el bloque** (propose_publish_block): vuelca las sesiones al calendario del atleta. Sin este paso tiene un plan que no ve. Va siempre después del 2.

**C. Nutrición**
4. **Periodización nutricional** (propose_nutrition_program): las fases encadenadas con sus semanas, kcal y recargas, y dentro de cada fase su dieta. Manda solo el PRESUPUESTO de intercambios de cada dieta (HC / PROT / GRASA): los alimentos los coloca Dani en el editor de dietas. NO rellenes comidas salvo que te lo pida.
5. **Ajuste de dieta suelto** (propose_diet_update) solo si hace falta una dieta fuera de la periodización (día de descanso, día libre). Mismo criterio: presupuesto sí, comidas no.

**D. Configuración del plan** (todo esto va en UNA propose_setup_config)
6. Fecha de inicio, duración del plan y peso objetivo, si faltan.
7. Objetivo diario de PASOS.
8. Qué dietas quedan activas y el CALENDARIO semanal de dietas (qué come cada día de la semana). Ojo: se resuelven por nombre, así que esta propuesta se aprueba DESPUÉS de la periodización.
9. CUESTIONARIO periódico con su cadencia, y FOTOS de seguimiento con sus vistas y cadencia.
10. Ejercicios elegibles para RETOS de carga (sus básicos reales).
11. CARDIO: programa de Zona 2 o de VO₂máx, si le toca.

**E. Road map — lo que el atleta ve venir**
12. **Escalera de niveles** (propose_level_ladder), solo si la de por defecto no le sirve. Si le sirve, dilo y no propongas por proponer.
13. **Fases del plan e hitos** (propose_roadmap_items): las fases macro y los hitos con fecha.
14. **Días señalados** (propose_special_day): toma de marcas, AMRAP, recarga. Uno o dos en el mes, no diez.
15. **Reto de la semana** (get_challenge_options y luego propose_weekly_challenge): mira antes las opciones que calcula el motor con SUS datos.

**F. Cierre**
16. **Ficha viva** (propose_dossier_update): objetivos con sus palabras, dónde está hoy, qué esperamos ver en estas semanas, el foco de la próxima revisión y las preguntas abiertas.
17. Termina con «El mes de un vistazo»: una línea por pieza, en el orden en que Dani debe aprobarlas, y las notas que le has dejado. Nada después de eso.

Si te falta un dato que cambia una decisión, agrupa las preguntas (máximo 5, de más a menos bloqueante) y propón igualmente el 80% que sí puedes, diciendo qué has asumido y qué cambiaría si la respuesta fuese otra.`;

describe('textoDelPlanCompleto', () => {
  it('reproduce el guion del asistente carácter a carácter', () => {
    expect(textoDelPlanCompleto()).toBe(GUION_ORIGINAL);
  });
});

describe('PASOS_DEL_RECORRIDO', () => {
  it('tiene los 19 pasos repartidos en los seis bloques', () => {
    expect(PASOS_DEL_RECORRIDO).toHaveLength(19);
    expect(ORDEN_BLOQUES.map(b => pasosDeBloque(b).length)).toEqual([2, 3, 2, 6, 4, 2]);
  });

  it('los números no se repiten', () => {
    const nums = PASOS_DEL_RECORRIDO.map(p => p.numero);
    expect(new Set(nums).size).toBe(nums.length);
  });

  it('los pasos van en el orden de los bloques, sin mezclarse', () => {
    const posicion = PASOS_DEL_RECORRIDO.map(p => ORDEN_BLOQUES.indexOf(p.bloque));
    expect(posicion).toEqual([...posicion].sort((a, b) => a - b));
  });

  it('cada bloque tiene una letra distinta, en orden alfabético', () => {
    expect(ORDEN_BLOQUES.map(b => BLOQUES_RECORRIDO[b].letra)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });

  it('cada paso tiene un título corto, único y distinto del texto del prompt', () => {
    const titulos = PASOS_DEL_RECORRIDO.map(p => p.titulo);
    expect(new Set(titulos).size).toBe(titulos.length);
    for (const p of PASOS_DEL_RECORRIDO) {
      expect(p.titulo.length, `«${p.titulo}» no cabe en el índice`).toBeLessThanOrEqual(34);
      expect(p.titulo.trim()).toBe(p.titulo);
      // El título es para el coach; la instrucción, para el modelo. Si alguien
      // los iguala, el índice vuelve a llenarse de párrafos recortados.
      expect(p.titulo).not.toBe(p.instruccionIA);
    }
  });

  it('el título NO se cuela en el guion del asistente', () => {
    // Son dos audiencias. Este test salta si alguien genera el prompt desde
    // `titulo` por error y el modelo se queda sin instrucciones.
    const guion = textoDelPlanCompleto();
    expect(guion).toContain(PASOS_DEL_RECORRIDO[0].instruccionIA);
  });

  it('los ids son estables y únicos', () => {
    const ids = PASOS_DEL_RECORRIDO.map(idDePaso);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe('paso_0');
  });
});

describe('el puente con la checklist', () => {
  it('todo `comprueba` apunta a un ítem que existe de verdad en SEEDED_ITEMS', () => {
    // Esta es la costura que antes se mantenía a mano y en silencio: si alguien
    // renombra un ítem de la checklist, aquí salta en vez de dejar un paso que
    // nunca se marcará solo.
    const conocidos = new Set(SEEDED_ITEMS.map(i => i.id));
    for (const p of PASOS_DEL_RECORRIDO) {
      for (const id of p.comprueba ?? []) {
        expect(conocidos.has(id), `el paso ${p.numero} comprueba «${id}», que no existe`).toBe(true);
      }
    }
  });

  it('ningún ítem de la checklist se comprueba desde dos pasos distintos', () => {
    const vistos = new Map<string, string>();
    for (const p of PASOS_DEL_RECORRIDO) {
      for (const id of p.comprueba ?? []) {
        expect(vistos.has(id), `«${id}» lo comprueban los pasos ${vistos.get(id)} y ${p.numero}`).toBe(false);
        vistos.set(id, p.numero);
      }
    }
  });

  it('todos los ítems de MONTAJE quedan cubiertos por algún paso', () => {
    // Solo las fases de montaje: `primeras_semanas` y `consolidacion` son
    // acompañamiento y viven en el otro carril, no en el recorrido.
    const deMontaje = SEEDED_ITEMS
      .filter(i => i.phase === 'alta' || i.phase === 'programacion')
      .map(i => i.id);
    const cubiertos = new Set(PASOS_DEL_RECORRIDO.flatMap(p => p.comprueba ?? []));
    const huerfanos = deMontaje.filter(id => !cubiertos.has(id));
    // `alta_perfil` (el cliente existe) y `alta_peso_inicial` (lo registra el
    // atleta, no el coach) no son pasos que Dani ejecute al montar el mes.
    expect(huerfanos).toEqual(['alta_perfil', 'alta_peso_inicial']);
  });
});
