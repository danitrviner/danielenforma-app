# Autopiloto · tanda 7 — fin de bloque y renovación (humano)

**Fecha:** 29-10-2026 · **Rama:** `ia-autonoma` (PR #27) · **Estado:** commiteada, sin mergear. Hallazgo H17.

## Qué hace

1. **Tool `get_cierre_bloque`** (51 tools): `buildCierreMesociclo`, el mismo motor de Mesociclo › Cierre: sesiones programadas/completadas, series por grupo programadas vs realizadas (y las semanales del bloque anterior), tonelaje y 1RM frente al bloque anterior, patrones, récords, titulares y borrador para el cliente. Solo lectura.
2. **Episodio `fin_de_bloque`** (`detectarFinDeBloque`): el bloque acabó ayer (ventana de 3 días por si el latido falló) y Dani no ha creado otro posterior; id `fin_de_bloque_{email}_{mesoId}`. El detector calcula el fin del plan contratado (`planStartDate` + `planDurationMonths`, campo nuevo `Episodio.contexto`) y el guion manda: (1) cierre solo lectura + ficha viva; (2) si el plan vence en ≤ 14 días o ya venció → `add_coach_task «Renovación: …»` y PARA (la renovación, la baja y el dinero son de Dani); (3) si sigue vigente, bloque nuevo como en el alta pero con **«qué cambia respecto al anterior» obligatorio** (doctrina §15) y `ESPERO` tras el mesociclo; nada al atleta hasta publicar.
3. **Episodio `renovacion`** (`detectarRenovacion`): el plan vence en ≤ 14 días; id por fecha de fin. Guion mínimo (`get_cierre_bloque` + `get_client_overview`) que deja una tarea de cuatro líneas a Dani: conseguido, pendiente, qué propondría. Sin propuestas ni mensajes.
4. Latido: pasa `planDurationMonths` a la foto. `finDelPlan` suma meses en fecha local.

## Tests

`detectores.test.ts` (fin de bloque: día siguiente, ventana, bloque siguiente ya creado, plan que vence / sin fecha; renovación: `finDelPlan`, ventana de 14 días), `src/ai/tools/cierre.test.ts` (cierre con 4 sesiones y una perdida; sin mesociclos; id inexistente), fixture de 51 tools. Suite: 301 archivos, 3.412 tests; `tsc` y `eslint` limpios.

## Notas

- `estadoCrm` cambiando a baja no genera episodio: el CRM es de Dani y ya quita el acceso.
- Lo que queda del plan: tanda 8 (centro de supervisión, canal `mensajesCoach` en UI, muro legal con D1) y tanda 9 (sombra + informe). Al final, de golpe: merge, reglas, cron, doctrina `--aplicar`.
