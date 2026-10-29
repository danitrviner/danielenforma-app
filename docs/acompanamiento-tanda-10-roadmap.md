# Acompañamiento · Tanda 10 · El Road map, cuatro mejoras

29-10-2026 (tarde) · rama `acompanamiento-11-roadmap` (apilada sobre la 10, elección) · a petición de Dani («la parte del roadmap es muy importante»).

## Qué cambia para el atleta

1. **Nunca sale vacío.** Sin fases del programa, el camino es una sola fase **«Tu arranque»**: desde que se publicó el plan (o empezó el bloque), dura lo que el bloque (4 semanas si no hay) y nunca se queda en el pasado. Dentro: su último peso, «Estas semanas cuenta el hábito…», comida (kcal de su dieta), pasos, bloque y fuerza. Solo sin plan publicado y sin bloque sigue la tarjeta «En cuanto Dani publique tu plan».
2. **Abre con sus palabras.** La frase del alta (`goalFreeText`) encabeza el Road map. Dos versiones a elegir en `/dev/roadmap`: **A · cita** (tarjeta encima: «Lo que viniste a buscar · El camino hasta ahí pasa por 79,0 kg») y **B · meta** (la frase como titular dentro del plan, con «Ahora: Déficit · bajar a 79,0 kg antes del 29 nov»). La app usa A hasta que elija.
3. **El primer mes no está en blanco.** Hitos del arranque, con su fecha: primera sesión hecha, primer peso registrado, primera revisión enviada, primera semana con todos los entrenos.
4. **No todo es peso.** En «Esta semana», cuarta cifra **Fuerza**: récords de la semana (1RM estimado por encima de su mejor marca anterior en ese ejercicio; un ejercicio nuevo no cuenta) y kilos movidos; sin récord, el cambio por sesión frente a la semana pasada. Dominadas y fondos suman el peso corporal.

## Qué cambia para Dani

- **Bandeja:** con plan publicado hace 7 días o más, «Sin fases en el plan: su Road map va en arranque» o «Fases sin peso meta: su Road map no enseña lo que falta» → Plan › Objetivo. Una lectura de programas por lote (misma clave que Semana del coach).

## Cómo

- `utils/roadmapDelAtleta.ts`: `caminoDeArranque`, `hitosDelArranque`, `fuerzaDeLaSemana` (sobre `aggregate`/`allTimeBestBefore` de `trainingReport`), `construirRoadmap` con `planPublishedAt`, `pesos`, `kcalDieta`, `ctxFuerza`; `RoadmapDelAtleta.arranque` y `estaSemana.fuerza`. Tests +9.
- `utils/bandejaDelDia.ts`: `programasPorEmail`, señales `sin_fases` / `sin_peso_meta`, `DIAS_PARA_PONER_FASES = 7`. Tests +4.
- `RoadmapDelAtletaVista`: `frase`, `cabecera: 'cita' | 'meta'`, título «Tu arranque», rejilla 2×2 con Fuerza. `AthleteRoadmapScreen`: carga el alta (misma clave que Inicio), kcal de la dieta del último día registrado, contexto de peso corporal. `HomeCoachScreen`: programas por lote.
- Capturas `16a` (A · B · arranque) y `16b` (A en móvil).

## Pruebas

`tsc` 0 · `vitest` 3.379 en verde · eslint e iconos OK · `/dev/roadmap` comprobado.

## Lo que decide Dani

Cabecera A o B. Y, cuando la rama de Plan › Objetivo esté en main, una línea por fase escrita por él (lo que más huele a persona).
