# Extras exactos del catálogo (28-10-2026)

Rama `extras-exactos`. Lo que pidió Dani: «ahora sabemos cuál es el peso medio de un plátano: que se use esa referencia en vez de la general de antes, y lo que no entre en la fruta de ese día que pase a la comida o a la cena».

## Catálogo (ya en Firestore)
47 alimentos con medida casera nueva (`scripts/out/catalogo-unidades-2026-10-28.csv`, aplicado con `importarCatalogoAlimentos.ts --aplicar`): naranja 150 g, nectarina 140, albaricoque 45, paraguayo 100, higo 50, dátil 8, mango 200, pomelo 200, granada 150, aguacate 150, huevo cocido 50; a puñados/raciones la fruta de cortar (melón y sandía tajada 200, piña rodaja 80, uvas y cerezas puñado 100, fresas ración 150, frambuesas y arándanos 100, pasas 30); frutos secos puñado 30; yogures sin medida 120-150; pan tostado rebanada 20, panes sin gluten 30, wraps 60. Pesos de tabla (BEDCA/USDA): revisables desde el catálogo del coach.

## Motor
- `utils/extrasDelCatalogo.ts`: qué alimento del catálogo puede ser extra (fruta, lácteo, pan, frutos secos; nunca zumos, bebidas, cremas, harinas, mermeladas ni nada que haya que cocinar), en qué cantidades (piezas de ½ en ½ hasta 3; sin medida, de 25 g en 25 entre 50 y 300), y cómo se elige: macro a macro, la cantidad que más cubre sin pasarse de ningún macro más de 3 g, prefiriendo piezas enteras y los alimentos que le gustan (`likedFoods` del alta); alergias, «no me gusta», condiciones (celiaquía sin pan, lactosa sin lácteo) y vegano (sin yogur de leche) quitan.
- `MenuComplement` lleva `alimentoId`, `gramos`, `piezas`, `unidad` y `macros` exactos (`quantity` 0). Los menús viejos siguen en raciones del banco y se leen igual (`macrosDeAcompanamiento`).
- `finalizeDay`: tras la ración extra del plato, los extras van comida a comida y **lo que una pieza no cubre se arrastra a la siguiente**; lo que sobra tras la última vuelve al plato que admite más ración (empezando por la cena); lo que ni así entra se deja. El tope de cada comida (`objetivoMacros`) incluye lo arrastrado, así nada se recorta al guardar. Tope de 400 kcal/día de extras se mantiene.
- Sin catálogo (sin red, tests) todo sigue con el banco de intercambios.
- Al guardar (`acotarExtrasDeComida`) un extra del catálogo que no cabe baja de media pieza en media pieza; la lista de la compra suma sus gramos; al marcar o añadir al plan entra en el Diario como alimento del catálogo con sus gramos y macros.

## Pantallas
- Mi menú: las filas de extras dicen «1½ Plátano · 150 g · 134 kcal»; el buscador «+ Extra» es del catálogo: sin buscar, fruta/lácteo/pan/frutos secos con «Te gusta» delante; buscando, el catálogo entero; el stepper va de media pieza (o 25 g) y se apaga cuando la comida ya llega.
- Editor del coach y generador automático pasan el catálogo; los chips del editor enseñan pieza, gramos y kcal.

## Tests
`extrasDelCatalogo.test.ts` (+11), `menuEngine.test.ts` (+4). 3.192 en verde, `tsc` y `lint` limpios. Sin QA visual.
