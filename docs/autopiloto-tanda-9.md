# Autopiloto · tanda 9 — comparador de sombra, prueba de punta a punta e informe

Rama `ia-autonoma` (PR #27). Diseño: `docs/diseno-ia-autonoma-2026-10-28.md` §4.1 (modo sombra), §9.8 (pruebas) y fila 9 del plan. Como en las anteriores, **nada se despliega**.

## Qué hay

### 1 · Comparador de sombra — `src/autopiloto/sombra.ts` (puro, 10 tests)
En sombra el asistente decide y la propuesta queda como `status: 'sombra'`. `compararSombra(sombras, referencia, ahora)` mira qué hizo Dani con ese atleta en los **7 días** siguientes (`VENTANA_DIAS`) y da un veredicto por decisión:

| Tipo | Con qué se compara | coincide | distinto |
|---|---|---|---|
| Respuesta a la revisión | `questionnaireResponses.respuestaCoach` de la misma revisión (o una respuesta aprobada por Dani a la misma) | Dani también contestó | — |
| Ajustes de kcal | objetivo de kcal de una dieta aprobada por Dani, o la última cifra «N kcal» de un cambio a mano (`cambiosAtleta`, área nutrición) | a ±5 % (`TOLERANCIA_KCAL`) | más lejos |
| El resto | una propuesta aprobada por Dani del **mismo tipo** (`tipoDeDecision`), o un cambio a mano de la **misma área** | las frases de «qué cambia» se solapan (`solapeDeFrases`: sin tildes, sin signos, 2.300 = 2300) | mismo tipo y ninguna frase en común |

Y dos más: **parecido** (mismo tipo de acción sin poder afinar), **nada** (pasó la ventana sin que Dani tocara eso) y **pendiente** (ventana sin cumplir). Nunca compara contra decisiones del propio asistente ni de otro atleta.

`informeDeSombra(comparaciones)` → fila por tipo con recuentos, tasa `(coincide + parecido) / decididas` y **recomendación**: `subir` (≥ 8 decididas y ≥ 7/8, los mismos umbrales del rodaje), `seguir`, `pocos_datos`, `siempre_humano`.

### 2 · El bloque «Sombra · coincidencia contigo» en Política
`PoliticaVista` gana `sombra?: InformeDeSombra`; `PoliticaAutopiloto` lee las `sombra` (`getAiProposalsPorEstado`), las decisiones de Dani (`getAiProposalsRecientes`, 90 días), y por cada atleta con sombras sus `cambiosAtleta` y sus respuestas de cuestionario. Fila por tipo: `✓ ≈ ✗ ∅ …`, tasa y recomendación; en modo Política, «↑ a aviso» sube ese tipo con un clic. Vacío, lo dice. Captura: `App enforma/variantes-autopiloto-29-10/tanda8/politica-con-sombra-29-10.jpg`.

### 3 · Prueba de punta a punta del consumidor — `api/autopiloto.integracion.test.ts` (6 tests)
Firestore de mentira que **aplica** las escrituras (una ronda ve lo de la anterior) y un modelo guionado por turnos. Cubre: episodio en sombra que llama a `add_coach_task` y cierra con su «PARA DANI» (alias en el prompt, nunca el nombre completo; gasto en `aiUsage`/`aiAuditLog`; resumen sin correos); una tool que propone en sombra deja la propuesta `status: 'sombra'` con `autor`/`episodioId` y **no escribe nada más**; `?seco=1` lista por prioridad sin escribir ni llamar; presupuesto diario agotado para la cola; un episodio `escalado` se **reanuda** cuando Dani decidió (el modelo recibe «APROBADA «…»») y queda `hecho` con `aplicadas`; un atleta sin consentimiento no bloquea a los demás.

**Fallo que destapó y se arregló:** en sombra, `registrarPropuesta` dejaba en la **ficha viva** del atleta un «propuso X» de algo que nunca se aplicó. `fuenteAdmin.appendDossierFacts` ahora no escribe cuando el contexto del episodio es `sombra`.

## Decisiones cerradas en esta tanda
- **D2 (cron): dos veces por semana** (Dani, 29-10). Propuesta de horario: **lunes y jueves a las 03:00 UTC** (04:00/05:00 en Madrid), una hora después del latido (02:00 UTC). El lunes recoge la semana nueva y los cuestionarios del viernes-domingo; el jueves, los emergentes de mitad de semana. Queda dicho el coste: una molestia del martes espera al jueves y la del viernes, al lunes. Se añade al «de golpe», no ahora.

## Verificado
- Suite completa: 306 archivos / 3.451 tests verdes; `tsc` y `eslint` limpios.
- `/dev/autopiloto` §1 con el informe de sombra de ejemplo (5 de 7 comparadas, global 80 %).

## Lo que queda (ver `docs/autopiloto-informe-final.md`)
El «de golpe» y las dos semanas de sombra real con tres atletas.
