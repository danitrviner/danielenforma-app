# Autopiloto · tanda 8 — centro de supervisión y canal del atleta

Rama `ia-autonoma` (PR #27). Diseño: `docs/diseno-ia-autonoma-2026-10-28.md` §5.2, §5.4 y §6. Como en las tandas 4-7, **nada se despliega**: ni reglas, ni cron, ni `--aplicar`.

Regla de Dani (29-10): todo lo visual nuevo en 2-3 variantes; él elige al final. Las seis piezas de esta tanda están en `/dev/autopiloto` (secciones 3-6) y las capturas en `App enforma/variantes-autopiloto-29-10/tanda8/`. La variante activa en la app es siempre la **A** hasta que elija (`VARIANTE_*_ACTUAL` en cada contenedor).

## Qué hay

### 1 · «Lo que ha hecho el asistente» (Revisión del coach) — §5.2
- `src/autopiloto/lineaDeTiempo.ts` (puro, 13 tests): `construirLineaDeTiempo(episodios, propuestas, {inicioPlan, mesociclos, dietas})` → una entrada por episodio con sus decisiones (resumen o «antes → después», autor, política, **desenlace** `automatico | aviso | aprobada | editada | rechazada | deshecha | pendiente | sombra | caducada`, resultado del esperado ✓/✗/—), las propuestas del chat como entradas sueltas y las del latido agrupadas por día; semana del plan (S1 = la del inicio); recuentos; y **«Plan inicial vs ahora»** con `calcularDerivas` sobre las propuestas del episodio `alta_completada`.
- `autorDelPaso(items, propuestas)` + `textoDeAutor`: quién cerró cada paso del Setup (tabla `KINDS_POR_ITEM` ítem de checklist → tipos de propuesta). Sin propuesta = «Lo hiciste tú, a mano». Se enseña en `implantacion/DetallePaso.tsx` bajo el título del paso hecho.
- `src/db/episodios.ts` → `getEpisodiosDeAtleta(email)` (las reglas ya dejan leer al coach).
- UI: `components/autopiloto/LineaDeTiempoAsistente.tsx` (lógica) + `LineaDeTiempoVista.tsx` (A tabla por semana / B hilo / C tarjetas). Montada en `ClientRevisionPanel` como sección **«Lo que ha hecho el asistente»**, antes de «Lo que he cambiado». Cada decisión enlaza a Propuestas (`/propuestas?filtro=aplicadas&propuesta=ID`).

### 2 · Calidad, «la auditoría de 5 minutos» — §5.4
- `src/autopiloto/calidad.ts` (puro, 11 tests): `muestraDeCalidad(propuestas, hoy)` → hasta 5 `aplicada`+`automatico` de la **semana anterior** (lunes-domingo), en orden pseudoaleatorio **determinista por semana** (FNV-1a de `lunes|id`): la misma muestra todos los días de la semana. `resumenCalidad`, `bajarPorNoVuelvas`, `instruccionDeNoVuelvas`, `anadirInstruccionFija`, filtros `filtrarPropuestas` / `ESTADOS_POR_FILTRO`.
- `AiProposal.calidad?: { veredicto: 'bien'|'mal'|'no_vuelvas'; en; nota? }` (types.ts).
- «No vuelvas» = veredicto en la propuesta **+** ese tipo de decisión baja a `proponer` en `coachSettings/autopiloto` **+** una línea fechada en las instrucciones fijas del coach (`coachSettings/instructions`, las que el agente ya lee en cada episodio).
- UI: `CalidadAutopiloto.tsx` (lógica) + `CalidadVista.tsx` (A una a una / B lista / C tabla). Los tres botones pesan igual.

### 3 · Propuestas con pestañas y filtros — §5.4
- `CoachProposalsScreen.tsx`: pestañas **Propuestas | Calidad** y chips **pendientes / aplicadas / rechazadas / sombra** (estado en la URL: `?pestana=calidad`, `?filtro=…`, `?propuesta=…` para destacar una). Las no pendientes se enseñan en `PropuestaDecididaCard` (solo lectura: qué pasó, qué cambió, motivo del rechazo, expediente, texto al atleta, veredicto) y las aplicadas con **Deshacer** (confirmación en línea, `planDeDeshacer`).
- `src/db/ai.ts` → `getAiProposalsPorEstado(estados)` (`in` sobre `status`, sin índice compuesto).

### 4 · Canal del atleta: `mensajesCoach` en Inicio — §6
- `MensajesDelCoach.tsx` (lógica: leer, marcar `leidoEn` optimista) + `autopiloto/MensajesCoachVista.tsx` (A tarjeta como la nota del día / B burbujas tipo chat / C bandeja). Firma **Dani**; ninguna etiqueta nombra al asistente (test). Solo los de las últimas 3 semanas (`mensajesVigentes`). Montado en `HomeScreen` bajo la nota del coach.

### 5 · Muro legal unificado — D1 PENDIENTE, **no cableado**
- `components/MuroLegalUnificado.tsx` (A un documento / B acordeón / C resumen llano + letra): un solo scroll, las cuatro casillas obligatorias de hoy, y la del análisis con el asistente **aparte, específica y desmarcada**, con la línea de transparencia del §6 («tu plan se ajusta cada semana con lo que registras; lo revisa Dani»). Mismas reglas que el muro de dos pasos (nada premarcado, botón apagado hasta leer y marcar, salida visible) y una sola escritura.
- Se ve en `/dev/autopiloto` §6 y en `/dev/legal?unificado=A|B|C`. `AceptacionLegalGate` sigue siendo lo que ve el atleta. Para cablearlo hay que (a) decidir D1 y (b) si cambia el texto, subir la versión de los documentos, lo que vuelve a pedírselo a todos.

## Verificado
- Suite completa: 304 archivos / 3.437 tests verdes; `tsc` y `eslint` limpios en lo tocado.
- `/dev/autopiloto` en el navegador: «Bien» avanza a «2 de 5 · 2 juzgadas»; «Mal» pide nota y suma al histórico; «Marcar leído» baja el contador; sin errores de consola.

## Fuera de esta tanda (apuntado)
- La bandeja de Inicio del coach (§5.1: «Propuesto» y «Escalado» junto a «Hecho hoy») sigue como en la tanda 4.
- Episodios por atleta se leen con `where athleteId ==`; si algún día son miles, paginar.
- Las decisiones de sombra no se comparan automáticamente con lo que hizo Dani (eso es la tanda 9).
