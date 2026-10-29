# Acompañamiento · Tanda 9 · Personalización nombrada

29-10-2026 · rama `acompanamiento-9-hecho-con` (apilada sobre la 8) · plan §9 · hallazgo H-25.

## Qué cambia para el atleta

- En **Mi menú**, una línea: «Hecho con lo que me dijiste: sin lactosa · bebida de avena en vez de leche · más ensaladas.» Hasta tres cosas, de más a menos importante para él: lo que no puede comer (restricciones y alergias del alta), el tipo de dieta, los cambios que hace siempre al intercambiar (`gustosDelAtleta.senalesDeCambios`), los tipos de plato que pidió ver más, el batch cooking, sus favoritas y lo que marcó como «no me gusta». Si no hay nada que decir, no se pinta nada. Dos versiones (línea / chips) en la galería.

## Qué cambia para Dani

Nada: lo rellena el motor con lo que ya guarda.

## Cómo

- `utils/hechoCon.ts` (puro, con tests): `etiquetasHechoCon` (`MAX_ETIQUETAS = 3`).
- `components/nutrition/HechoCon.tsx` montado en `MyMenuScreen` encima de «Ajustar mis preferencias», con `onboarding`, `nutritionConfig`, `favorites` y el menú que ya están cargados.
- Galería: pieza `hecho`. Captura `15-tanda9-hecho-con.jpg`.

## Lo que queda para más adelante

«Con tu material: mancuernas y polea» en el plan de entreno (el alta guarda `equipment`): misma idea, en `WorkoutsScreen`, cuando se toque esa pantalla.

## Pruebas

`tsc` 0 · `vitest` todo en verde (+3) · eslint e iconos OK.

## Hipótesis y métrica (4 semanas)

Nombrar lo tenido en cuenta convierte un plan correcto en un plan «mío». Métrica: intercambios y recetas quitadas por semana (`MenuSwapEntry`) a la baja; preferencias actualizadas por el atleta al alza.
