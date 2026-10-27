# Generador · fidelidad de la receta, extras y gustos (27-10-2026)

Rama `generador-fidelidad`. Lo que pidió Dani al leer «Tortitas de avena con crema de cacahuete» con los copos bajados y las claras iguales («va a salir una papilla»).

## Qué cambia

**Recetas fieles.** Avena y tortitas, dulces y bizcochos, huevos y tortillas (`TIPOS_SIN_PALANCAS` por `dishType`) ya no se tocan ingrediente a ingrediente: ni palancas ni «más avena». Solo se multiplican enteras. Alubias, arroz, pasta, ensaladas, tostadas, batidos, carnes y pescados siguen admitiendo palancas (±30 %) y ración extra.

**Menos multiplicar.** Cada paso de ×0,25 que la ración se aleja de ×1 cuesta 40 kcal de error al ordenar (`CASTIGO_POR_PASO_DE_ESCALA`). Entre un plato que encaja tal cual y otro que hay que servir ×2,5 gana el primero aunque cuadre algo peor. Si solo llega multiplicando, se multiplica.

**Lo que falta al día se reparte en dos pasos** (`finalizeDay`):
1. Más ración del propio plato, en las comidas cuyo plato lleva algo de esa macro y admite tocarse, aunque esa comida fuera bien de por sí: la proteína que no entra en las tortitas sube el pollo de la comida.
2. Lo que nadie absorbe, en acompañamientos (fruta, pan, yogur) en las comidas cortas. Tope de 400 kcal/día se mantiene.

**Extras explícitos.** En «Mi menú» los acompañamientos salen como filas aparte debajo de la comida, en color de acento («EXTRA · DESAYUNO · 120 g plátano · 105 kcal»), editables como antes. Las raciones extra del propio plato siguen dentro de la tarjeta.

**Sin «Ajustada a tu comida».** El detalle de la receta ya no cuenta qué se tocó ni por qué; las cantidades van ajustadas y punto.

**Gustos** (`utils/gustosDelAtleta.ts`):
- Favoritas y «no me gusta» (desde Mi menú y desde Recetas, ya existían) mueven ahora también a su TIPO de plato: +75 kcal de bono por unidad de gusto (favorita +1, no me gusta −1, elegida al intercambiar +½, quitada −½; tope ±2), medido solo en la franja.
- `swapHistory` de todos los menús: receta quitada con «Intercambiar» −150/vez (hasta 3), receta elegida +100/vez (hasta 2). Quitar y volver a elegir se anula.
- `ingredientSwaps`: un alimento cambiado por el mismo otro en dos comidas (leche → bebida de avena) va ya cambiado en los menús nuevos.
- Lo leen el editor del coach, el generador automático y las alternativas de «Intercambiar».

## Tests
`menuEngine.test.ts` (+6), `gustosDelAtleta.test.ts` (+7). 3.120 en verde, `tsc` y `lint` limpios. Sin QA visual de la fila de extras.
