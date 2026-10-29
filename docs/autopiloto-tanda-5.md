# Autopiloto · tanda 5 — alta y revisión en servidor, cierre del «esperado», tools CDG

**Fecha:** 29-10-2026 · **Rama:** `ia-autonoma` (PR #27) · **Estado:** commiteada, sin mergear. Hallazgos H13, H14, H20.

## Qué hace

1. **Episodio `alta_completada`** (H13): el latido lo encola cuando el alta está cerrada (`onboarding.completedAt`), hay `planStartDate` en los últimos 14 días y consentimiento; id `alta_completada_{email}`. El guion es el recorrido de 19 pasos de `utils/recorridoDelPlan.ts` (el mismo de la pestaña Implantación) más las reglas del autopiloto: comprobar el montaje antes de cada pieza, reparto propio por defecto, proteína 2 g/kg, nada médico, bienvenida solo con el bloque publicado.
2. **Esperar a Dani y reanudar** (`src/autopiloto/reanudacion.ts`): las piezas que dependen de otra REAL (sesiones ← mesociclo, publicar ← sesiones, calendario ← dietas) hacen que el modelo termine la ronda con `ESPERO: <ids>`. El agente deja el episodio en `escalado` con `esperaPropuestas`; si la política ya lo aplicó todo, sigue sin parar; en sombra se cierra. El consumidor (`api/autopiloto.ts`, paso 0) lee los escalados en espera y, cuando Dani ha decidido sobre todas (desde la bandeja de siempre, sin tocar nada nuevo), reanuda con un mensaje que cuenta qué aprobó (con el id de lo creado) y qué rechazó (con su comentario). `Episodio.aplicadas` lleva lo ya aplicado.
3. **Episodio `revision`** (H14): mitad del bloque (`floor(vueltas/2)` si tiene ≥ 4) y última semana; id `revision_{email}_{meso}_{mitad|fin}`. Guion: brief + `get_revision_engine` periodo bloque + **cerrar el esperado** + veredicto en tres frases con números del motor + cambios solo si cambian algo + ficha viva con esperado nuevo.
4. **Cierre del `esperado`** (diseño §3, métrica de calidad §5.4): tools `get_resultado_esperado` (lo aplicado con `expediente.esperado` sin `resultado`) y `cerrar_esperado` (escribe `resultado.cumplioEsperado` true/false/null + nota). `FuenteDeDatos.updateAiProposal` en cliente y Admin.
5. **Tools CDG** (H20, `src/ai/tools/cdg.ts`, mismos motores que Mesociclo › Seguimiento):
   - `get_cdg_semana`: IEM programado por zona esta semana, realizado la anterior (logs → `calcularSemana`), agujetas vigentes, contexto (sueño EWMA, estrés, motivación, fatiga post) y la propuesta freno/acelerador (`propuestaZona`) para la semana que viene.
   - `propose_progresion_iem`: `proponerProgresionIem` con el % del protocolo por zona, tiempo de sesión del alta y MRV; crea una propuesta `weekPlan` con `origenIem: true` (política `progresion_iem`: aviso al salir de rodaje). El modelo solo puede `descartar` ejercicios o pasar un % **más prudente**; uno más agresivo se ignora con aviso.
   - `get_alternativas_ejercicio`: mismo grupo, material del atleta, ordenadas por IEM de la zona en una serie de referencia; con `evitar_articulacion` solo las que cargan ≤ 60 % de la original en esa articulación.
   - `FuenteDeDatos.getCdgCatalogoJson` (cliente `db/cdg`, Admin `cdgCatalogo/v4`); el catálogo nunca sale entero en un resultado.
6. **Elección CDG vs reparto** (`src/autopiloto/eleccionCdg.ts`): plantilla marcada `cdg` (campo nuevo en `MesocycleTemplate`) o tipificación freno ≤ 2 / tiempo ≥ 4; por defecto reparto propio. La regla está en el guion del alta; fijar `cdgObjetivosIem` desde el episodio queda para cuando `propose_mesocycle` acepte campos CDG.

Tools: 50 (fixture regenerado).

## Tests

`reanudacion.test.ts` (espera, todo aplicado, sombra, reanudar con aprobadas/rechazadas), `eleccionCdg.test.ts`, `detectores.test.ts` (alta: ventana y consentimiento; revisión: mitad/fin, bloque corto; orden de prioridades), `api/agente.test.ts` (ESPERO → escalado; aplicadas), `src/ai/tools/cdg.test.ts` (catálogo de prueba: zonas, freno con agujetas 4, propuesta weekPlan S4 con origenIem, más agresivo ignorado, descarga rechazada, alternativas con material y articulación). Suite: 299 archivos, 3.389 tests; `tsc` y `eslint` limpios en lo tocado.

## Pendiente / notas

- Revisión disparada por `tasks` tipo revision con `dueDate` = hoy: no entra (solo mitad/fin de bloque).
- `cdgObjetivosIem` por zona en el alta CDG: falta que `propose_mesocycle` acepte los campos.
- Al final (de golpe): merge, reglas (sin cambios en esta tanda), cron, doctrina `--aplicar`.
