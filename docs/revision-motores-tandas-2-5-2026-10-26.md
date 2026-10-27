# Revisión de motores · tandas 2-5 aplicadas (26-10-2026)

Rama `tanda1-emparejado`, cinco commits (79ba626 → e58f8dc). Nada pusheado, nada mergeado, nada en Firestore. 3.100 tests, `tsc` y `lint` en verde. Falta QA real en la app.

## Qué cambia para el atleta y el coach

**Tanda 2 · asistente y nutrición**
- La semana de mantenimiento suma **+100 g de hidratos al día (400 kcal)** sobre el objetivo, tenga la dieta comidas o no. Antes era +1 intercambio por comida: con dieta sin comidas no subía nada; con cinco, +500 kcal. El coach puede cambiar los gramos (`+g HC/día`) junto a «Marcar mantenimiento».
- Una dieta del asistente **sin comidas se puede aprobar** desde la tarjeta; «Calidad del plan» avisa en kcal, no bloquea.
- Un ajuste del asistente sobre una dieta existente **conserva las comidas** que el coach tenía colocadas.
- El panel de periodización y Nutrición enseñan **las mismas kcal** (1.896 en vez de 1.297 para una dieta vieja con mixtos).

**Tanda 3 · fechas y adherencia**
- Cuestionarios y pasos del plan ya no se desplazan un día entre marzo y octubre (cambio de hora).
- La **adherencia de dieta es kcal comidas / objetivo** en reportes, retos, proyección, condiciones y calendario. Antes contaba líneas marcadas, que con «Mi plan» daban 100 % coma lo que coma. El reto de adherencia tiene techo 100 % y no se propone a quien ya lo cumple.
- «Mantenimiento observado» del panel sale del gasto real (kcal registradas + tendencia de peso), el mismo que la Revisión.
- Un check-in aprobado sin texto deja de salir como pendiente en la bandeja.

**Tanda 4 · generador y palancas**
- Los filtros duros (alergias, condiciones, vegano, tiempo) se aplican **antes** de recortar la franja a 300 recetas: un vegano ya no se queda con 20.
- Acompañamientos: tope de **400 kcal al día** (antes podían ser 924).
- Platos pequeños (< 250 kcal) no se sirven a media ración; platos grandes (> 450 kcal) no pasan de ×3. Si con eso no hay nada que encaje, se admite cualquier escala antes que dejar la comida vacía (tu decisión del 05-09).
- Las palancas se mueven ±30 % de la ración (no ½–2×) y el aceite no sube más de 10 g.
- 3 g de aceite ya no se convierten en 5. «Cambiar comida» busca contra lo que la comida debería sumar.

**Tanda 5 · coherencia de cifras**
- Un solo peso por ventana (mediana con 3+ pesajes) en reportes, Revisión y tendencia; el ritmo real sale por regresión.
- El cierre de un mesociclo en curso compara con las semanas vividas (semana 2 de 8 ya no es «25 %»).
- **8 series por sesión y grupo** en toda la app (doctrina §3): con 15 series la frecuencia por defecto es 2, no 2,5. Cambia las propuestas de reparto nuevas; los mesociclos existentes no se tocan.
- El historial del coach lista alimentos y gramos. Una sola tolerancia de «día en objetivo» (10 % o 100 kcal). El historial de volumen cuenta series del grupo principal.
- El 1RM estimado exige peso y 3 o más repeticiones (una serie de calentamiento con RIR vacío ya no es «récord»).

## Añadido el 27-10 (misma rama, mismo PR)

- **Desempate por kcal al revincular** (tu idea: «¿no lo puedes saber tú con las kcal?»): cuando todo menos un ingrediente está vinculado y ese tiene varias presentaciones del mismo alimento (garbanzo seco/cocido, arándano fresco/deshidratado, coco natural/rallado…), gana la que deja las kcal de la receta más cerca de las declaradas, solo si el error cabe en el margen (30 kcal o 7 %) y el segundo candidato queda claramente peor. 160 recetas desempatadas (`scripts/out/vincular-por-kcal.csv`): Arroz basmati→seco 44, Garbanzo→seco 38, Lentejas→seco 31, Arándano rojo→deshidratado 14…
- **Cinco alimentos nuevos** en el catálogo local (valores USDA/BEDCA): calabaza cruda, arroz basmati e integral en seco, pan rallado, harina de garbanzo. Están en `scripts/out/catalogo-nuevos-2026-10-26.csv` para importarlos a Firestore con `importarCatalogoAlimentos.ts` antes de subir las recetas. Sin vincular: 1.304 → **960**.
- **CR2** aplicado: ritmo de volumen 0,2-0,35 %/sem en Cuerpo y en la doctrina (centro 0,275 %: 80 kg → 0,22 kg/sem).
- **CR5** aplicado: dominadas, fondos, flexiones… suman el peso del atleta en tonelaje, 1RM, récords, señal de fuerza y CDG cuando se conoce (`Exercise.pesoCorporal` o el nombre). Falta pasar el peso desde la pantalla de Revisión y el planificador CDG.
- Decidido por Dani: CR1, CR4 y CR8 **no** se aplican; CR3 se queda con los 100 g fijos.

## Tanda 6 · lo que decidiste no tocar

| | Hoy | Propuesta del informe | Mi recomendación |
|---|---|---|---|
| CR1 proteína en doctrina | 0,8-1 g/kg volumen · 1-1,4 déficit | 1,6-2,2 g/kg (2,0-2,4 en déficit profundo), aviso del validador < 1,4 | Hacerlo: el alta ya calcula 2 g/kg y el asistente se contradice |
| CR2 ritmo de volumen | doctrina 0,2 %/sem vs motor 0,25-0,4 | alinear a 0,2-0,35 %/sem | Hacerlo |
| CR3 diet break | +100 g HC fijos (A1) | llevar las kcal al gasto real medido | Cuando haya 4 semanas de registro; si no, el fijo |
| CR4 descarga | mitad de series en todo | 1 serie en multiarticulares, 2 en el resto | Hacerlo con `esAislamiento` del CDG |
| CR5 peso corporal | dominadas/fondos no cuentan en CDG ni 1RM | peso corporal + lastre cuando `weight = 0` y el ejercicio es de peso corporal | Hacerlo; exige marcar ejercicios `bodyweight` |
| CR6 frecuencia | tres constantes (6, 6, 8) | una (8) | **Hecho en la tanda 5** |
| CR7 platos del menú | escalas ×0,5–×4 | topes por tamaño | **Hecho en la tanda 4** como preferencia con reserva |
| CR8 cardio | 3 sesiones Z2 fijas | 2 con ≥ 5 días de fuerza | Hacerlo |

## Cerrado el 27-10

- PR #16 mergeado a main; producción desplegada en Vercel (573e9ac).
- Firestore: catálogo con los 5 alimentos nuevos (473), 8.929 recetas actualizadas (929 sin vínculo, con el vínculo borrado del documento) y 79 Rápidas reescritas, todo con el catálogo vivo.
- Las Rápidas y el recetario llevan los valores por 100 g del catálogo de Firestore (la copia local traía 66 derivados de intercambios: patata, garbanzo, lentejas, coco…).

## Pendiente fuera del código

- Catálogo: quedan 929 recetas sin vincular (`scripts/out/vincular-dudas.csv`); las dudas grandes ya no son de catálogo sino de ingredientes ambiguos.
- QA en la app: semana de mantenimiento, aprobar dieta sin comidas, menú vegano, cierre de mesociclo en curso.
