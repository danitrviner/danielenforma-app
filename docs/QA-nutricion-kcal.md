# QA — nutrición en kcal (versión 1.1)

Lo que hay que probar con cuentas reales (el banco de pruebas `/dev/nutricion` no tiene sesión,
así que esto no se ha podido comprobar desde aquí). Marca cada punto.

## Atleta (web y, cuando salga, la app 1.1)
- [ ] El día empieza con 5 comidas vacías (Desayuno, Media mañana, Comida, Merienda, Cena).
- [ ] La tarjeta «Hoy» enseña kcal comidas, quedan y objetivo, y las barras de P/HC/G en gramos.
- [ ] «+» de una comida → hoja con Recientes · Alimentos generales · Mis comidas · Todo, y añade a ESA comida.
- [ ] Ficha de un alimento: info arriba, chips de ración con la recomendada marcada, «Otra cantidad» en gramos.
- [ ] Una receta del recetario entra **desglosada** por ingredientes, editables en gramos, y suma lo de la receta.
- [ ] «Encajan» propone recetas que caben en lo que queda.
- [ ] Escáner y «Crear alimento desde su etiqueta» (enseña kcal y gramos por 100 g).
- [ ] Un día de antes del cambio se ve igual que antes (mismas kcal).
- [ ] «Mis menús» resume cada menú en kcal y gramos.

## Coach
- [ ] Editor de dietas: objetivo en gramos de P/HC/G con las kcal calculadas.
- [ ] Periodización: ajustes semanales, ciclado y reglas de peso en gramos.
- [ ] Revisión del atleta: lo comido y la adherencia en kcal.
- [ ] Generar una semana de menú: cada día cuadra (± 100 kcal) y sin intercambios en pantalla.
- [ ] Asistente: pedirle una dieta → la propone en gramos; aprobarla desde el editor de dietas.

## Después de publicar los binarios
- [ ] Aplicar la migración (`scripts/migrarAKcal.ts --aplicar`), ver `publicar-actualizaciones.md` § 7.
