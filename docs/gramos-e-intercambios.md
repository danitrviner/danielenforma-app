# Por qué los gramos no cuadraban al pasar del menú a intercambios

Reproducción del 15-09-2026 con recetas reales de producción (`scripts/diagGramosReceta.mjs`).

## Lo que ve el cliente

| Receta | Dice la receta | Pinta la app | Desvío |
|---|---|---|---|
| Sándwich integral de jamón y cheddar | 60 g de pan | **40 g** | ×0,67 |
| Tostada integral de queso y aguacate | 60 g de pan | **50 g** | ×0,83 |
| Sándwich de hummus de remolacha | 60 g de pan | **70 g** | ×1,17 |
| Arroz integral con atún | 125 g de arroz cocido | **37,5 g** | ×0,30 |
| Pad thai | 60 g de noodle de arroz | **67,5 g** | ×1,13 |

No es un desvío constante. Por eso «los números no cuadran» de forma imprevisible: unas veces sobra y otras falta.

## Causa 1 — el intercambio es del plato entero, no del ingrediente

`Recipe.exchanges` se calcula dividiendo los **macros totales del plato** entre `GRAMS_PER_EXCHANGE` (25 g de hidrato por intercambio) y redondeando a cuartos.

En el sándwich de jamón y cheddar, esos 28 g de hidrato son el pan **más** el resto del relleno. Luego la pantalla hace `gramos de pan = 40 g/intercambio × 1 intercambio` y presenta el resultado como si fuera pan.

Es decir: **se le atribuye al pan todo el hidrato del plato**, y después se convierte esa cifra a gramos de pan. El dato de que el pan eran 60 g nunca entra en el cálculo.

## Causa 2 — el banco y la receta miden cosas distintas

El banco del atleta dice «30g arroz, pasta, couscous o quinoa». Son 30 g de arroz **crudo**. La receta dice 125 g de arroz **cocido**, que al cocerse casi triplica su peso.

Multiplicar intercambios por los gramos del banco y enseñar el resultado junto al nombre de un ingrediente cocido compara dos cosas que no son comparables. De ahí el ×0,30.

## Por qué no se arregla afinando el redondeo

El redondeo a cuartos (`snapExchanges`) añade ruido, pero no es la causa: aunque fuese exacto, seguiría atribuyendo al pan el hidrato del plato entero y seguiría mezclando crudo con cocido.

**El gramaje original de la receta no se guarda en ninguna parte del plan diario.** Se tira al convertir a intercambios y luego se intenta reconstruir desde un agregado que ya perdió esa información. No se puede reconstruir: hay que dejar de tirarlo.

## Lo que se hace en consecuencia

Decisión de Dani: **manda el gramaje de la receta**. 60 g de pan siguen siendo 60 g. El banco solo se usa para derivar gramos cuando la receta no trae los suyos.

En la práctica:

- Los ítems del plan que representan un alimento identificable guardan `baseGrams`: los gramos de ALIMENTO que pesa un intercambio de ese ítem.
- El ítem agregado de una receta importada (`foodLabel` = nombre del plato) **no lleva peso**. La fila «HC» de un arroz con atún no pesa los 125 g del arroz: el plato pesa 400. Se pintan intercambios y peso del plato, y los gramos por ingrediente se ven en la ficha, que sí los tiene bien.
- Un único módulo, `src/utils/conversionNutricional.ts`, con los dos conceptos separados por nombre para que no se puedan volver a confundir:
  - `intercambiosDeGramosDeAlimento` (60 g de pan ÷ 40 g por intercambio)
  - `intercambiosDeGramosDeMacro` (24 g de hidrato ÷ 25 g por intercambio)
