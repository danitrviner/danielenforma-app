// Arrastre automático entre comidas (decisión de Dani, 10-2026): si en una
// comida te pasas, lo que sobra se resta del objetivo de las siguientes; si te
// quedas corto, lo que falta se les suma. Por categoría de presupuesto (HC,
// PROT, GRASA — los mixtos ya han repartido su mitad y mitad vía `addToPlaced`
// antes de llegar aquí, así que esta función no sabe nada de ellos).
//
// Es una función PURA y no toca `meal.target`: el objetivo guardado en la
// dieta sigue siendo el reparto original de siempre. Lo que se calcula aquí es
// el objetivo EFECTIVO —el que se le enseña al atleta y contra el que cuadran
// el selector de recetas y "Encajan"— a partir de ese reparto y de lo que ya
// hay colocado. Por eso quitar el alimento que sobraba lo deshace solo: la
// próxima vez que se llame, ya no hay exceso que arrastrar.
import { roundQuarter } from './exchangeHelpers';

export type CategoriaCupo = 'HC' | 'PROT' | 'GRASA';
export const CATEGORIAS_CUPO: CategoriaCupo[] = ['HC', 'PROT', 'GRASA'];

export interface ComidaParaArrastre {
  id: string;
  /** Solo para el texto del ajuste ("−0,5 por Desayuno"). */
  nombre: string;
  /** Sin reparto asignado, o comida libre: no genera ni recibe arrastre —
   *  como si no existiera para esta función. */
  target?: Partial<Record<CategoriaCupo, number>>;
  libre?: boolean;
  /** Lo que hay puesto en la comida, por categoría (después de `addToPlaced`,
   *  con los mixtos ya repartidos). Todos los alimentos puestos, no solo los
   *  marcados como comidos: con una dieta que llega con los alimentos ya
   *  colocados, lo que se compara con el objetivo es lo que hay en el plato. */
  colocado: Record<CategoriaCupo, number>;
}

/** De dónde viene un ajuste y cuánto mueve. `delta` positivo = le llega
 *  (le faltaba a esa comida anterior); negativo = se le resta (esa comida
 *  anterior se pasó). */
export interface AjusteArrastre {
  mealId: string;
  nombre: string;
  delta: number;
}

export interface ObjetivoEfectivoComida {
  mealId: string;
  /** Objetivo efectivo por categoría — solo las categorías que tenían reparto
   *  original. */
  objetivo: Partial<Record<CategoriaCupo, number>>;
  /** Ajustes que han movido el objetivo de esta comida, por categoría. Vacío
   *  si no le ha llegado nada. */
  ajustes: Partial<Record<CategoriaCupo, AjusteArrastre[]>>;
}

/** ¿Tiene esta comida algo colocado? Es GLOBAL —no por categoría—: basta con
 *  que haya algo en cualquier categoría para que la comida cuente como
 *  "con alimentos" y genere arrastre en todas las que tenía repartidas. */
function tieneAlgoColocado(c: ComidaParaArrastre): boolean {
  return CATEGORIAS_CUPO.some(cat => (c.colocado[cat] ?? 0) > 0);
}

/** Comidas que de verdad participan del arrastre: con reparto y no libres. */
function esElegible(c: ComidaParaArrastre): boolean {
  return !c.libre && c.target != null;
}

/*
 * La regla (Dani, 01-10): lo que sobra o falta en una comida se descuenta en
 * la SIGUIENTE, tenga ya alimentos o no. Con dietas que el coach entrega con
 * los alimentos ya puestos, todas las comidas nacen llenas: si el arrastre solo
 * cayera en comidas vacías no actuaría nunca. Así, comer 2,5 en el desayuno
 * deja la comida en «objetivo 1,5 · tienes 2: quita medio».
 *
 * Por categoría, recorriendo las comidas en orden:
 *  · objetivo efectivo = reparto original + lo que llega de antes (nunca < 0).
 *  · Una comida CON alimentos pasa a la siguiente la diferencia entre su
 *    objetivo efectivo (sin recortar a 0) y lo que tiene: si el atleta la
 *    corrige, no pasa nada; si no la toca (ya se la comió tal cual), la
 *    siguiente hereda el desajuste.
 *  · Una comida VACÍA todavía no se ha comido: se queda con lo que le llega y
 *    no pasa nada, salvo lo que no le quepa por debajo de 0.
 *  · Si al final queda algo sin colocar, se reparte entre las comidas vacías
 *    que hubo (p. ej. se apuntó la cena antes que el desayuno).
 */
export function calcularArrastreEntreComidas(comidas: ComidaParaArrastre[]): ObjetivoEfectivoComida[] {
  const elegibles = comidas.filter(esElegible);
  const salida = new Map<string, ObjetivoEfectivoComida>();
  for (const c of elegibles) salida.set(c.id, { mealId: c.id, objetivo: { ...c.target }, ajustes: {} });

  for (const cat of CATEGORIAS_CUPO) {
    // Solo las comidas con reparto puesto en ESTA categoría entran en su
    // cadena de arrastre — una comida sin HC pautado ni genera ni recibe HC.
    const cadena = elegibles.filter(c => c.target![cat] !== undefined);
    if (cadena.length === 0) continue;

    // Pendiente de aplicar a la siguiente: cuánto (+ falta / − sobra) y de
    // qué comidas viene, para el desglose.
    let pendiente = 0;
    let fuentes: AjusteArrastre[] = [];
    const vacias: string[] = [];

    for (const c of cadena) {
      const base = c.target![cat] ?? 0;
      const bruto = roundQuarter(base + pendiente);
      const entrada = salida.get(c.id)!;
      if (pendiente !== 0) {
        entrada.objetivo[cat] = Math.max(0, bruto);
        entrada.ajustes[cat] = fuentes;
      }

      if (tieneAlgoColocado(c)) {
        const propio = roundQuarter(base - (c.colocado[cat] ?? 0)); // + le faltó, − se pasó
        pendiente = roundQuarter(bruto - (c.colocado[cat] ?? 0));
        if (pendiente === 0) {
          fuentes = [];
        } else if (propio !== 0) {
          fuentes = [...fuentes, { mealId: c.id, nombre: c.nombre, delta: propio }];
        }
        continue;
      }

      vacias.push(c.id);
      // Lo que no le cabe por debajo de 0 sigue de camino, con sus fuentes.
      pendiente = bruto < 0 ? bruto : 0;
      if (pendiente === 0) fuentes = [];
    }

    if (pendiente !== 0 && vacias.length > 0) {
      const porCabeza = roundQuarter(pendiente / vacias.length);
      for (const id of vacias) {
        const entrada = salida.get(id)!;
        const actual = entrada.objetivo[cat] ?? 0;
        entrada.objetivo[cat] = Math.max(0, roundQuarter(actual + porCabeza));
        entrada.ajustes[cat] = [...(entrada.ajustes[cat] ?? []), ...fuentes];
      }
    }
  }

  return Array.from(salida.values());
}
