# ADR — Un solo registro de comida

**Estado:** propuesta, sin implementar. Necesita el visto bueno de Dani.
**Fecha:** 2026-09-16
**Contexto:** fase 7 del plan 2026-09.

## El problema

Hoy, un alimento puede entrar en el día del atleta por tres puertas, y cada
una deja un rastro distinto:

| Puerta | Cómo llega | Qué queda escrito |
|---|---|---|
| A mano, desde «Mi plan» | El atleta elige alimento y cantidad | `DietMeal.items[]` sin más marcas |
| Desde una receta | Elige receta, se escalan sus ingredientes | Los ítems llevan `originRecipeId` |
| Desde el menú semanal | El coach publica el menú, el atleta lo sigue | Los ítems llevan `origenMenu` |

Los tres acaban en la misma lista, y quien la lee después no puede reconstruir
la intención con fiabilidad:

1. **La adherencia no distingue seguir el plan de improvisar.** `origenMenu`
   dice de qué comida del menú venía, pero no si el atleta se la comió tal cual
   o la editó después. Dos días con el mismo `origenMenu` pueden ser
   «siguió el menú» y «lo cambió entero», y salen iguales.
2. **Todo nace marcado como comido.** Desde que añadir un alimento en «Mi plan»
   lo da por comido, `doneItemIds` no separa lo puesto de lo comido salvo que
   el atleta desmarque. Por eso `adherenciaPorIntercambios` (T7.2a) mide comida
   contra cupo y no tics contra ítems.
3. **El bloque «Qué ha comido» tiene que adivinar.** `comidaDeLaSemana.ts`
   deduce el origen de cada línea mirando qué campos trae, que es exactamente
   el tipo de heurística que deja de funcionar cuando se añade una cuarta
   puerta.

## Decisión propuesta

Un campo `origen` explícito en cada ítem del registro, escrito por quien lo
mete, en vez de deducido por quien lo lee:

```ts
type OrigenDelItem =
  | { tipo: 'mano' }
  | { tipo: 'receta'; recetaId: string; escalado: number }
  | { tipo: 'menu'; menuId: string; comidaId: string; editado: boolean }
  | { tipo: 'plantilla'; dietaId: string };
```

Reglas:

- **Lo escribe quien lo añade**, nunca el lector. `origenMenu` y
  `originRecipeId` se mantienen como están para no romper el histórico, y el
  campo nuevo convive con ellos; los lectores prefieren `origen` cuando está.
- **`editado` se pone al tocar la cantidad**, no al añadir. Es el dato que hoy
  no existe y el que contesta a «¿sigue el plan o se lo monta él?».
- **Migración perezosa, sin barrido.** Los días viejos no se reescriben: se
  leen con la heurística actual, que para ellos es lo único que hay. Nada de
  recorrer `dietCompletionLogs` en producción.

## Consecuencias

- `comidaDeLaSemana.ts` deja de adivinar y pasa a leer un campo. La heurística
  se queda como camino de respaldo para los días anteriores a la migración.
- Se puede medir de verdad la adherencia al MENÚ, que hoy no se puede: días
  seguidos tal cual / editados / ignorados.
- Coste: tocar las tres puertas de entrada (`NutritionScreen`, el picker de
  recetas y el editor de menú semanal) y `types.ts`. Ninguna es pequeña, y
  `NutritionScreen` son 3.000 líneas.

## Por qué no se ha implementado

Toca la rama `nutricion-registro-diario`, que tiene trabajo sin commitear sobre
estos mismos ficheros. Hacerlo por separado garantiza un conflicto grande en
los tres sitios a la vez. Hay que coordinarlo con esa rama, y la decisión de
cuándo es de Dani.
