# Autopiloto · tanda 8 — centro de supervisión y canal del atleta

Rama `ia-autonoma` (PR #27). Diseño: `docs/diseno-ia-autonoma-2026-10-28.md` §5.2, §5.4 y §6. Como en las tandas 4-7, **nada se despliega**: ni reglas, ni cron, ni `--aplicar`.

Regla de Dani (29-10): todo lo visual nuevo en 2-3 variantes; él elige al final. Capturas de la comparación en `App enforma/variantes-autopiloto-29-10/` (y `/tanda8/`).

## Elecciones de Dani (29-10, misma tarde) — APLICADAS
| Pantalla | Elegida | Dónde |
|---|---|---|
| Política | **B · semáforo** | `autopiloto/PoliticaVista.tsx` |
| Hecho hoy | **B · cronología** | `autopiloto/HechoHoyVista.tsx` |
| Lo que ha hecho el asistente | **C · tarjetas** | `autopiloto/LineaDeTiempoVista.tsx` |
| Calidad | **B · lista** | `autopiloto/CalidadVista.tsx` |
| Mensajes del coach | **B · burbujas** → RETIRADA al fusionar `main` (29-10 noche): el canal del atleta es «Lo último de Dani» (rama de acompañamiento, ya en producción) y el autopiloto escribe ahí | `home/LoUltimoDeDani.tsx` (main) |
| Muro legal | **A · un documento**, con la casilla del asistente **dentro de Términos de uso** (sin apartado propio) | `MuroLegalUnificado.tsx`, **cableado en App.tsx** |

Las variantes no elegidas se han borrado del código; `/dev/autopiloto` enseña ahora solo las elegidas (captura `tanda8/elegidas-29-10.jpg`). Se quitó la prop `variante` y las constantes `VARIANTE_*_ACTUAL`.

- **D1 (muro legal): DECIDIDA.** Muro de una página para quien tenga algo pendiente (nuevos y quien no aceptara aún); quien ya aceptó no lo vuelve a ver (mismos documentos, misma versión, sin cambio de texto). La casilla del asistente sigue siendo opcional y desmarcada aunque viva dentro de Términos: RGPD art. 7.4. Perfil › Ajustes sigue usando `AceptacionLegalGate` en modo revisión para cambiarla. `/dev/legal` enseña el unificado; `?clasico=1` el de dos pasos.
- **Casilla del asistente, discreta** (Dani, 29-10: «demasiado específicas… disimúlalo»): etiqueta «Permitir que mi entrenador se apoye en herramientas digitales al preparar y revisar mi plan (opcional)» con dos líneas de detalle; el qué, el a quién (Anthropic como encargado) y las condiciones quedan en la Política de privacidad completa (`public/privacidad`), que ya los nombra: información por capas, válida en el RGPD. Mismo tono en el diálogo `SolicitudConsentimientoIA` para los atletas antiguos. Sin subir versión: el texto nuevo pide menos, no más.
- **D3 (menús en rodaje): DECIDIDA.** «Se publicarían solos»: `POLITICA_POR_DEFECTO.menuAutomatico = 'publicar'` (y es el valor al que cae lo desconocido). Sigue editable en Política.
- **D2 (cron): PENDIENTE.** Dani: «como mucho una o dos a la semana». Recomendación: **una vez al día** después del latido (el latido ya corre a las 02:00 UTC; el autopiloto a las 03:00 UTC). Motivo: el latido DETECTA a diario y encola; el consumidor solo procesa la cola, y una pasada vacía no gasta nada. Con 1-2 pasadas por semana, un cuestionario del viernes se contesta el lunes y una molestia espera días. Se decide al «de golpe».

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

### 4 · Canal del atleta: `mensajesCoach` — §6 (fusionado con main el 29-10 por la noche)
La rama de acompañamiento (PRs #31→#42, en producción esa misma noche) creó el mismo canal con un modelo más completo: `MensajeCoach { tipo: cambio|problema|hito|implantacion|libre, estado: borrador|aprobado, autor, fecha, firmadoEn, origen, problema }`, reglas que solo dejan al atleta leer lo `aprobado`, «Lo último de Dani» en Inicio y el panel «Mensajes a X» en Cliente › Revisión. **Ese modelo manda.** Lo que hizo esta tanda (tipo propio, `db/mensajesCoach.ts`, vistas A/B/C en Inicio) se retiró al fusionar; el autopiloto escribe en el canal de main: una propuesta `mensajeAtleta` aplicada (por política o por Dani) crea el mensaje `aprobado`, `autor: 'asistente'`, `firmadoEn`, `origen: aiProposals/<id>` (`aplicarPropuesta.ts › tipoDeMensaje`: semana_nueva → cambio, dolor → problema «recibido», el resto → libre). En sombra no se escribe nada.

### 5 · Muro legal unificado — D1 (ver arriba: decidida y cableada)
- `components/MuroLegalUnificado.tsx`: un solo scroll con los dos textos y, bajo cada uno, sus casillas; la del análisis con el asistente va dentro de Términos, separada por una línea, **opcional y desmarcada**, con la línea de transparencia del §6 («tu plan se ajusta cada semana con lo que registras; lo revisa Dani»). Mismas reglas que el muro de dos pasos (nada premarcado, botón apagado hasta leer y marcar, re-medida del scroll, Atrás no lo cierra, salida visible) y una sola escritura con los dos documentos.

## Verificado
- Suite completa: 304 archivos / 3.435 tests verdes (tras la poda de variantes); `tsc` y `eslint` limpios en lo tocado.
- `/dev/legal` en el navegador: cinco casillas, la del asistente dentro de Términos; el botón se enciende al marcar las cuatro obligatorias y bajar al final.
- `/dev/autopiloto` en el navegador: «Bien» avanza a «2 de 5 · 2 juzgadas»; «Mal» pide nota y suma al histórico; «Marcar leído» baja el contador; sin errores de consola.

## Fuera de esta tanda (apuntado)
- La bandeja de Inicio del coach (§5.1: «Propuesto» y «Escalado» junto a «Hecho hoy») sigue como en la tanda 4.
- Episodios por atleta se leen con `where athleteId ==`; si algún día son miles, paginar.
- Las decisiones de sombra no se comparan automáticamente con lo que hizo Dani (eso es la tanda 9).
