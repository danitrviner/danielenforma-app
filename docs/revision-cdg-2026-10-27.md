# Revisión CDG de punta a punta · 27-10-2026

Rama `revision-cdg` (desde `origin/main` `ba07fef`), worktree `~/en-forma-revision-cdg`. **Sin commits, sin push, sin escrituras en Firestore**: solo lecturas con la clave y simulacros. No se ha tocado ninguna fórmula de `motor.ts` ni `seguimiento.ts`.

La guía `~/Desktop/Clases de Hacker Gym/Guia-Indice-de-Hipertrofia.md` **ya no está en esa ruta** (la carpeta solo tiene `Transcripciones/` y `output.mp4`); las reglas se han contrastado contra las 28 transcripciones. Donde cito «clase», es el archivo de `Transcripciones/`.

---

## Parte 1 · Comprobaciones automáticas

| Comprobación | Resultado |
|---|---|
| `npm run lint` (tsc + iconos) | ✔ 0 errores · 303 iconos OK |
| `npx vitest run` | ✔ 268 archivos · 3.111 tests al empezar; 3.114 tras los arreglos (3 nuevos) · 9,8 s |
| `npm run test:reglas` (emulador) | ✔ 30 tests |
| `npx tsx scripts/cdg/probarCatalogo.mjs` | ✔ 1.034 ejercicios · 33 músculos y 11 articulaciones en todos · sin nombres repetidos · IF búlgara 24,76702 · IF pike push up 9,01756 |
| Día 1 «MESOCICLO 1 ISRAEL» (`programacion.test.ts`) | ✔ 24,76702 · 16,91235 · 9,01756 · 12,0135 · 4,626 · 7,068 |
| 22 tests originales (`cdg.test.ts`) | ✔ (33 tests entre los dos archivos) |
| `aplicarEmparejadoCdg.mjs --incluir-probables` (simulacro) | ✔ **0 a actualizar** · 1.028 ya iguales · 0 inexistentes · 0 conflictos (emparejado regenerado hoy: 905 exactos, 125 probables, 2 ambiguos, 5 por revisar; los 7 no automáticos ya están decididos en Firestore) |
| `crearEjerciciosCdg.mjs` (simulacro) | ✔ **0 a crear** · 1.037 en la app · 1.034 en CDG |
| `exercises`: todos con `cdgNombre` válido | ✔ 1.037 docs · 0 sin `cdgNombre` · 0 nombres fuera del catálogo · los 1.034 nombres CDG están usados |
| «Encogimientos de trapecio en polea bilateral» | ✔ vinculado a «Encogimientos de hombros con mancuernas - Trapecio» (`MilpBdi5yCABkuvtbhnK`) |
| `cdgNombre` repetidos | ⚠️ 3: el del trapecio (intencionado) y **dos hip thrust mal vinculados** (ver F1) |
| Reglas en producción vs `firestore.rules` | ✔ idénticas (964 líneas; la única diferencia es un carácter de dibujo roto en un comentario de la línea 255 en producción). `cdgCatalogo`: `read: isCoach()`, `write: false` |
| ESLint sobre `utils/cdg`, `components/mesociclo`, hooks CDG | ✔ 0 avisos |

### Ejercicios cuyo grupo salió «por pesos» (fullbody y «Pull over en máquina»)

El script asigna como grupo principal el músculo CDG con más peso. En los fullbody el peso más alto suele ser un estabilizador (antebrazo, lumbares, abdomen), así que el grupo que queda es discutible. Los 22 fullbody + pull over, con mi valoración:

| Ejercicio | Grupo en la app (principal · secundarios) | Valoración |
|---|---|---|
| Pull over en máquina | dorsal · antebrazo, bíceps | ✔ |
| Snatch pull · Clean pull | trapecio · glúteo, antebrazo, … | ✔ (tirón: trapecio/complejo escapular) |
| Hang snatch pull · Hang clean pull | glúteo · trapecio, antebrazo, … | ✔ aceptable |
| Snatch · Landmine clean · Dumbbell clean · Single/Dual kettlebell clean | glúteo · lumbares/bíceps/core | ✔ aceptable |
| Rope climb estricto | bíceps · dorsal, core, antebrazo | ✔ aceptable (dorsal sería igual de válido) |
| **Thruster** | **core** · lumbares, pecho, glúteo | ❌ debería ser cuádriceps o deltoide anterior; «core» cuenta sus series como abdomen |
| **Split jerk** | **core** · antebrazo | ❌ debería ser deltoide anterior (empuje vertical) |
| **Ring muscle up** | **pecho** · dorsal, antebrazo, core | ⚠️ dorsal o tríceps encajan mejor que pecho |
| **Push jerk** · **Push press** | **sin grupo** | ❌ no cuentan series en ningún grupo (no los creó el script: ya existían sin grupo) |

Los cuatro marcados en rojo son **D1** de las decisiones pendientes; el arreglo va en `scripts/arreglarEjerciciosCdg.mjs --grupos` (simulacro).

---

## Parte 2 · Código contra lo acordado

### Decisiones D1-D6

| Punto | Estado | Dónde |
|---|---|---|
| D1 · Todo `Exercise` lleva `cdgNombre` exacto; sin él cuenta 0 y se avisa | ✅ | `adaptadores.ts:41-42` (sin nombre → `[]`), `programacion.ts:49` (`sinVinculo`), aviso en `PanelIndicesCdg.tsx:747` y chip ⚠ en `ResumenCdgDia.tsx:19`. En Firestore: 1.037/1.037 con `cdgNombre` |
| D2 · IF = fatiga, IEM = estímulo, IEA = articular | ✅ | `PanelIndicesCdg.tsx:23-25`, bloque «Estrés articular (IEA)» `:693`. `MesocycleReviewPanel.tsx:71` y `CorrelationPanel.tsx:390` usan el IEM |
| D2 · Sin restos de `accumulatedStimulusIndex` / `seriesIEAPorGrupo` | ✅ | `grep` en `src/`: 0 usos (solo un comentario histórico en `stimulusSeries.ts:12`). Un comentario en `titularesRevision.ts:22` decía «IEA» hablando de estímulo: **corregido** a IEM |
| D3 · Técnica en la ÚLTIMA serie (dropset→Drop 1, myoreps→Myo rep, restpause→Rest Pause 1, amrap/fallo→normal) | ✅ | `adaptadores.ts:24-30` (`TECNICA_POR_DEFECTO`) y `:55-56` (por defecto la última; si el ejercicio tiene `ajustes` por serie, las que diga, E-06). `seriesRealizadas` `:85` |
| D4 · Ningún Epley suelto; todo por `rmCdg` con el RIR real | ✅ | `oneRepMax.ts`: `rmCdg`/`rmDeSerie`/`rirEfectivo` sobre `calcularRM`. Usos (todos con el set completo, que lleva `rir` y `alFallo`): `loadTrend.ts:18`, `WarmupEngine.ts:25`, `LoadHistoryPanel.tsx:194,215`, `ExerciseCloseCard.tsx:60`, `CorrelationPanel.tsx:347`, `TrainingScreen.tsx:671`, `trainingReport.ts:107,134`, `verificacionObjetivo.ts:273`, `athleteMetrics.ts:59-61` (+`BestSet.rir`), `challengeOptions.ts:243,254` (con `best.rir`). `grep epley` fuera de tests: solo el comentario de `SeguimientoCdg.tsx:31` |
| D4 · 10-15 reps solo Epley; resto media Epley/Mayhew/Wathen | ✅ | `seguimiento.ts` `calcularRM` (validado contra la hoja; no se toca) |
| D5 · «Al fallo» = RIR 0 | ✅ | `adaptadores.ts:81` (`rirARpe(s.alFallo ? 0 : s.rir)`), `oneRepMax.ts:18` |
| D5 · CR5 (peso corporal) frente a la hoja | ⚠️ | Ver «Dónde aplica cada criterio» abajo. **IF/IEM programado no cambia** (no usa el peso). La Semana X realizada contaría el peso del atleta **solo si se le pasa `pesoCorporal`**, y hoy ninguna pantalla CDG se lo pasa (`SeguimientoCdg.tsx:103`, `PanelIndicesCdg.tsx:273`, `usePropuestaIem.ts`): se comporta exactamente como la hoja. Decisión **D2** |
| D6 · Sin regresiones en pantallas ajenas | ✅ | 3.111 tests en verde, lint y tipos limpios; el cambio de la rama son dos comentarios y un script nuevo |

**Dónde aplica cada criterio (D5 / CR5).**
- *Programación* (`seriesProgramadas`, panel, chips, barra, generador, planificador): la hoja solo usa RPE, reps y técnica. El peso no entra, así que CR5 no la toca: el Día 1 de Israel sigue dando los IF de la hoja.
- *Semana X realizada* (`seriesRealizadas` → Gestión, carga aguda/crónica, freno/acelerador): la hoja salta las series a 0 kg. Con CR5, `pesoDeSerie` suma el peso del atleta **si se conoce**; sin él (`pesoCorporal: null`, que es lo que pasan hoy todas las pantallas) se saltan como en la hoja. Es decir: el motor ya puede contar dominadas y fondos, pero nadie lo ha activado.
- *RM, tonelaje y récords de los informes* (`trainingReport`, `verificacionObjetivo`, `allTimeBestBefore`): ahí sí se pasa el peso (`reportBuilder.ts`) y las dominadas cuentan con el peso del atleta. Es la única pantalla donde CR5 está vivo.
- Si se activa en el seguimiento CDG, la Semana X dejará de cuadrar con la hoja en atletas con ejercicios a peso corporal (de más, no de menos). Las series de RM también cambian (`rendimientoSemana` usa `weight`).

### Programar con el IEM

| Punto | Estado | Dónde |
|---|---|---|
| Panel CDG en el editor con sesiones en columnas + columna «Semana» | ✅ | `PanelIndicesCdg.tsx:170-176` (columnas = sesiones + «Semana» con `total: true`) |
| Filas IF y «Nivel de IF» (<40/40-70/70-100/>100) | ✅ | `:616-627`, `referencias.ts:9-14` |
| Tiempo frente al máximo del atleta (`sessionMaxMinutes`) + consejos | ✅ | `:629-634`, `avisosTiempo` `:260`, `referencias.ts:consejosDeTiempo` |
| IEM total, por punto de IF, por minuto | ✅ | `:636-647` |
| IEM por grupo (compuestos) y por músculo | ✅ | `:648-649` (`Bloque`), `iemCompuesto` del motor |
| Estrés articular | ✅ | `:655-709` con avisos |
| Tabla «IEM por zona» (14 zonas) | ✅ | `zonas.ts:19-34` (14), tabla `:548-589` |
| Objetivo editable → `Mesocycle.cdgObjetivosIem` | ✅ | input `:436-446`, guardado en `MesocycleManager.tsx:1332-1337` |
| «Falta» con «✓ +x» al pasarse | ✅ | `:466-468` |
| Series efectivas | ✅ | `:432` (`seriesPorGrupo`, la misma cuenta que el balance) |
| Variación frente a la semana anterior | ✅ | `:469` (`vs S{n-1}`), solo desde la semana 2 (`anterior` `:157`) |
| Últimas agujetas a las 48 h | ✅ | `:470-474`; `*` si vienen del 0-10. ⚠️ El panel enseña la última lectura aunque sea vieja (la fecha va en el tooltip); el Seguimiento sí aplica la vigencia de 7 días (`agujetasVigentes`) |
| Barra fija de objetivos (`BarraObjetivosCdg`) | ✅ | `BarraObjetivosCdg.tsx`, montada en `MesocycleManager.tsx:1347`; solo si hay objetivos |
| Desplegable «Aporte de cada ejercicio» | ✅ | `:716-737`, zonas objetivo marcadas |
| Avisos: RIR 5 · sin vínculo · fuera de catálogo | ✅ | `:744-748`; `programacion.ts:27-30` |
| Aviso: el estrés articular sube más que el IEM | ✅ | `zonas.ts:avisosIemIea`, `:202-205`, `:681-688` |
| En definición: «mantener IEM y bajar IF» | ✅ | `:593-602`, `definicion` = `clasificarFaseEntreno(meso) === 'definicion'` |
| Chip «· IF x» en la cabecera de cada día (editor y generador) | ✅ | `ResumenCdgDia.tsx`; `MesocycleManager.tsx:1013` (resuelto por semana) y `RoutinePreview.tsx:177` |
| Vista previa del generador: panel sin objetivos | ✅ | `RoutinePreview.tsx:153-158` (`meso={{}}`, `semana={0}`, sin `onCambiarObjetivo`) |

### Seguimiento CDG

| Punto | Estado | Dónde |
|---|---|---|
| Freno / acelerador por zona | ✅ | `SeguimientoCdg.tsx:149-280`, `agujetas.ts:propuestaZona` |
| Tipo de bloque en dos ejes `cdgSensibilidad` × `cdgVelocidad` + traducción de `cdgActitud` | ⚠️ | `agujetas.ts:tipoDeBloque` traduce bien (estático/dinámico/agresivo → ejes). En pantalla solo se elige la **Velocidad** (`:195-201`); la sensibilidad global ya no se toca: se sustituyó por el **modo por zona** (`cdgModoPorZona`, Dani 25-10: con objetivo = dinámico, resto estático). `cdgSensibilidad` se guarda pero no manda sobre las zonas |
| Sueño, estrés, motivación y cansancio al salir | ✅ | `useAgujetasCdg.ts` (`sleep_hours_weekly` EWMA; `stress_weekly`, `motivation_weekly`, `fatigue_post_weekly` último valor); `:218-233` |
| Gestión (IF por sesión) | ✅ | `:284-300` |
| Carga aguda/crónica con umbrales por atleta | ✅ | `:302-363`, `user_profiles.cdgUmbralesCarga` (`MesocycleManager.tsx:3972-3976`) |
| RM y tonelaje · rendimiento del ciclo | ✅ | `:365-409` |
| Antropometría inicio → último | ✅ | `:472-487` |
| «Lectura del rendimiento» y «¿Toca cambiar de bloque?» | ✅ | `:411-470`, `lecturaBloque.ts` |

### Cuestionario «Agujetas a las 48 h»

| Punto | Estado | Dónde |
|---|---|---|
| Escala 1-5 por zona (14) | ✅ | `questionnairePresets.ts:181-192`, señales `agujetas.<zona>` |
| Convive con el DOM's 0-10; convierte con `max(1, round(v/2))` y marca `*` | ✅ | `agujetas.ts:aEscala5` (= `min(5, max(1, round(v/2)))`, idéntico en 0-10), `agujetasPorZona` `:96-103` (por fecha, el peor grupo de la zona) |
| IRP y sugeridor de volumen siguen leyendo el 0-10 | ✅ | `readinessIndex.ts:56` (`domsCronicoGlobalEn` → `doms.<grupo>`), `volumeSuggestion.ts:220-226` (`feedback.doms`, umbral ≥ 8) |

### Regla de freno/acelerador contra el curso

Clase de referencia: **`master-pkg-t-1755172416000.txt`** (seguimiento semanal e interpretación) y **`master-pkg-t-1755172453000.txt`** (programación científica: tipos de bloque). Caso práctico: `master-pkg-t-1755172551000.txt`.

| Regla en el código | En el curso | Veredicto |
|---|---|---|
| **5** → nunca subir; reducir o pausar, sin % fijo (`propuestaZona`) | «si es un 5 casi siempre hago esa reducción» (1755172416000, pos. 66.063). No da porcentaje para el 5 | ✅ coherente. El «20-30 %» de tu encargo lo dice el curso para el **4 en zona no propensa**: «aunque fuera un 4 bajaría… un 15, 20, 30 %» (pos. ~64.900). El código pone −20 % por defecto en ese caso y texto «15-30 %». Para el 5 no propone cifra (decisión tuya del 25-10) → **D3** |
| **4 en zona propensa** → esperar una semana; si repite, bajar | «si es un grupo muscular más susceptible a tener agujetas como podrían ser los isquios… me planteo esperar a ver si la semana siguiente hay recuperación… no se recupera, le bajo» (misma clase) | ✅ |
| Zonas propensas = **isquios y aductores** (`zonas.ts`) | El curso solo nombra los isquios en esa regla. Aductores: «experimenten muchas agujetas en este grupo… tendinopatía del aductor mayor» (anatomía, 1755172346000). Glúteo: «búlgara… al día siguiente flipas» (9qrQDw51Rp), y en el caso práctico 3 las DOMS altas de glúteo+aductores se tratan quitando estiramiento, no series. Dorsal: «agujetas al día siguiente impresionantes» en depresión escapular (1755172579000) | ⚠️ Isquios es literal; aductores razonable; **glúteo** tiene el mismo apoyo que aductores y hoy frena con un 4 → **D4** |
| **1-3** → subir según sensibilidad; **desfavorable → no subir** | «entre el 1 y el 3 invita… a plantearse pisar incluso si el contexto no es favorable, en el grupo muscular en concreto» (pos. 66.063); «a más favorable el contexto, más podemos incrementar… si todo es favorable… un 20, un 30 %» (pos. 74.514) | ⚠️ El curso no veta subir con contexto malo; lo hace más prudente. El código lo bloquea → **D5** |
| **Estático** = sube solo con 1 en zonas objetivo · **Dinámico** = con 1, 2 y 3 | «estático… sólo voy a generar aumentos en los grupos objetivo cuando puntúa un 1… dinámico… acelerar con un 1, un 2, un 3» (1755172453000, pos. 12.585). Caso 3: «un 2, por debajo del límite de 3 para comenzar el dinamismo» | ✅ literal |
| Velocidad **suave ~10 %** | «bloques suaves… IEM entre 30 y 80… cambios de un 10 %» (pos. 16.464) | ✅ |
| **Medio ~20 % · agresivo ~30 %** | El curso dice «suaves, medios y agresivos» y, para lo favorable, «un 20, un 30 %» (pos. 74.514); el caso 3 aplica +30 % en un bloque agresivo | ⚠️ 20/30 no están asignados a «medio»/«agresivo» de forma literal, pero es la lectura natural |
| **Contexto neutro → la mitad del %** | No aparece | ❌ umbral propio (`agujetas.ts:206`) → **D6** |
| **Base ≥ 100 → máximo 10 %** | «de 80 a más de 110… 120-130 en deltoides medial, incrementar un 10 % supone mucho IEM» (pos. 16.464). «Mantén los puntos, no el %» no es literal | ⚠️ el umbral 100 y el tope 10 % son interpretación → **D6** |
| **IEM < 10 → «admite subidas mucho mayores»** | «cuando el IEM es muy bajito… un cambio del 200 %… no hace falta hacerlo de 10 en 10» | ✅ (el 10 es propio, el texto no propone cifra) |
| **Cansancio al salir ≥ 8 → no subir IEM; bajar IF** | «fatiga pos sesión entre 0 y 7… mucho margen… con 8 o 9… decido bajar el índice de fatiga global… para subirle el IEM» (pos. 67.988) | ✅ literal |
| Contexto malo: **estrés ≥ 7, sueño < 6 h, motivación ≤ 4**; bueno: ≤ 4, ≥ 7 h, ≥ 7 | El curso pide empezar por el seguimiento semanal (estrés, sueño, motivación) para «poner el pie» pero no fija números | ❌ umbrales propios; la pantalla ya los marca «pendientes de validar» (`UMBRALES_PROTOCOLO.validados = false`) → **D6** |
| Agujetas vigentes **7 días** | No aparece (lógico con cuestionario semanal) | ⚠️ propio |
| Primera semana tras parón: no frenar de golpe | «no apretéis el freno de forma apresurada… la primera semana» (pos. ~63.000) | ⚠️ no está en `propuestaZona`; existe `Mesocycle.vuelveDeParon` (S1 a RIR ≥ 3) pero el freno/acelerador no lo mira → **P5** |
| Cambio de bloque: ~2 meses, caída 2 semanas no es motivo, molestias pesan más | «los mismos ejercicios… dos meses o más… se aburra» (3RG28GM7Z4, pos. 4.671); «cae el rendimiento dos sesiones consecutivas… indicativo de cambiar» (1755172228000) | ✅ |

### Rendimiento y caché

| Punto | Estado | Dónde |
|---|---|---|
| El atleta no descarga el catálogo | ✅ | `useMotorCdg.ts:46` (`enabled = esElCoachPermanente(email)`), la regla lo deniega además |
| Catálogo en el persister de localStorage | ⚠️ | `main.tsx:87-107`: todas las consultas se persisten (`maxAge` 24 h, `buster` = release). El string compacto (~362 KB) entra en `['cdgCatalogo','v4']`. Medición real en la parte 3 |
| Lecturas al abrir un mesociclo | ⚠️ | `exercises`: 0 lecturas si el sello `catalogos/exercises` coincide (`leerCatalogo`); si cambia, **1.037 docs** de golpe (antes 634). `questionnaireResponses` del atleta: consulta completa sin límite (`db/questionnaires.ts:310`), compartida con la ficha (misma clave); crece una por cuestionario y semana. `cdgCatalogo/v4`: 1 lectura cada 24 h. `onboarding`, `dossier`: 1 cada una |

---

## Parte 3 · Revisión visual

Sesión de coach de Dani en `http://localhost:3021`, solo lectura (nada guardado: ni objetivos ni distribución; el generador se abrió hasta la vista previa y se cerró con «Volver»). Capturas en `docs/revision-cdg-capturas/` (01-27). Escritorio emulado a 1400 px (la captura sale a 800 px por el tamaño del panel del navegador), móvil a 375 px, tema oscuro y claro.

### Recorrido

| Pantalla | Resultado | Capturas |
|---|---|---|
| Israel Cabrera › Plan › Entrenamientos › «Meso 1 Israel Volumen» › Ejercicios · panel CDG | ✅ Tarjetas (series, IEM total, IF, carga aguda/crónica, avisos), tabla por zona con 4 sesiones en columnas + Semana, «Fatiga por sesión» con Nivel de IF / tiempo / IEM por punto de IF / por minuto / grupos / músculos, estrés articular, aporte por ejercicio, chip «· IF 45,1» en cada día. Barra fija de objetivos no sale porque Israel no tiene objetivos (correcto). Números con coma y un decimal | 01-06 |
| Cambio de semana | ✅ Base = S1-S7 (215,2 IF · 939,1 IEM); S8 y S10 suben a 231,8 / 992,1 (+6 %) por lo programado en el bloque; «vs S7» aparece desde S2; carga aguda/crónica 1,11 (S4, orientativo 3 de 6) → 1,26 (S10). El meso no tiene semana de descarga ni test, así que esa parte no se pudo ver | 06 |
| Seguimiento CDG | ✅ Freno/acelerador (velocidad, modo por zona, contexto, cansancio, tabla), Gestión, carga aguda/crónica con umbrales (0,8-1,6), RM y tonelaje, mejora del ciclo por categoría y ejercicio, Lectura («acumulación»: tonelaje +3 %, RM +0,9 %), «¿Toca cambiar?» (1 indicador: ~2 meses), antropometría (+7,6 % pecho/cintura) | 07-10, 26-27 |
| Generador (meso «Fuerza» de la cuenta demo, con distribución ya calculada) › Generar rutinas | ✅ Vista previa con el panel sin objetivos, días en columnas, chip IF por día. No se asignó | 11-12 |
| Biblioteca › Ejercicios › Revisar catálogo › Emparejado CDG | ✅ 1.037 decididos de 1.037, filtros, exportar revisiones | 13 |
| Perfil › Ajustes › Entrenadores › Cuestionarios | ⚠️ El preset «Agujetas a las 48 h» **no está creado en Firestore**: el botón dice «Cargar plantillas (1)» y es justo ese. Sin él el atleta no puede contestarlo y el seguimiento no recibe `agujetas.<zona>` (por eso todo sale «1 · antigua», del DOM's 0-10). Cargarlo es un clic tuyo (escribe en `questionnaires`); no lo he pulsado | 16 |
| Revisión › 7. El cuerpo › Explorar los datos › Estímulo (IEM) | ✅ Familia con 6 grupos + 33 músculos, gráfica semanal. ❌ El eje Y y el tooltip salían con punto decimal (82.6): **arreglado** | 14-15 |
| Móvil 375 px, oscuro y claro | ✅ Sin scroll horizontal de página (375/375); las tablas desplazan dentro. ⚠️ La tabla por zona solo enseña Zona/Series/IEM sin desplazar; en el seguimiento la columna Propuesta hace filas de ~180 px | 17-23 |
| Tema claro, escritorio | ✅ Contraste correcto en tarjetas, chips de aviso y tablas | 24-27 |
| Consola | ✅ Sin errores. Avisos ya conocidos de App Check (reCAPTCHA en localhost). Dos `console.log` de objetos al abrir el meso que no son del CDG (`App.tsx:856-876` es un banco de pruebas) | — |

### Rendimiento y caché (medido)

| Dato | Valor |
|---|---|
| localStorage total del coach | **2.810.644 caracteres (≈ 5,4 MB en UTF-16)** |
| `enforma_query_cache_v1` (persister de React Query, 77 consultas) | 2.129.807 caracteres |
| · `['exercises']` | 540.395 (19 %) |
| · `['cdgCatalogo','v4']` | 393.686 (14 %) |
| · `['workouts']` | 142.838 |
| · `responsesByQuestionnaireIds` | 117.407 |
| Prueba de escritura de +200 KB | ✔ todavía cabe |

Riesgo: medio. Chrome admite ~10 MB por origen (≈ 5 M caracteres), así que el coach va por el **56 %**; el catálogo y los 1.037 ejercicios son un tercio. En Safari/iOS el tope es la mitad y ya no cabría, pero el catálogo solo lo baja el coach. Propuesta: excluir `cdgCatalogo` del persister (`shouldDehydrateQuery`) y dejarlo en `exercisesCache`/memoria, o guardarlo en IndexedDB; 1 lectura al día no justifica 394 KB de localStorage.

Lecturas al abrir el meso de Israel: `exercises` 0 (sello igual), `cdgCatalogo` 1/día, `questionnaireResponses` del atleta (todas), `onboarding` 1, `dossier` 1, más lo que ya pedía la pantalla (logs, asignaciones, perfiles).

### Hallazgos visuales

1. ❌ **Seguimiento abría la semana en curso** (S8, 1 sesión de 4) y comparaba contra S7: «−100 %» en isquios, glúteo y gemelos, −48 % en pectoral. **Arreglado**: abre la última semana completa, el desplegable marca «Semana 8 · 1 de 4 sesiones» y hay aviso si eliges una incompleta. ⚠️ La carga crónica sigue contando S8 incompleta como una semana más (ver D8).
2. ❌ **«vs S7» partido en dos líneas** («+10» / «%») en la tabla por zona a ancho medio. **Arreglado** (`whitespace-nowrap`).
3. ❌ **Eje y tooltip de la gráfica de correlaciones con punto decimal**. **Arreglado** (`fmtNum`, coma y 1 decimal).
4. ❌ **Cabeceras del seguimiento pegadas** («VS ANTERIOROBJETIVOPROPUESTA»). **Arreglado** (padding en `Th`).
5. ⚠️ La tabla por zona mide 834 px y su contenedor 725 px a 1400 px de ancho (la barra lateral y el editor se quedan el resto): **las sesiones quedan fuera y hay que desplazar incluso en escritorio**. Es lo que ya sabías; propuesta P1.
6. ⚠️ Carga aguda/crónica lista «Sesión 5, 6, 7: 0» en un ciclo de 4 sesiones, y los avisos por articulación («Sesión 1 · Columna Cizalla: 3») no dicen qué es el 3 (ratio aguda/crónica). Propuesta P4.
7. ⚠️ Gestión y Rendimiento dicen «Sesión 1-4» en vez de «Torso A, Pierna A…». Propuesta P4.
8. ⚠️ Agujetas «1 · antigua» (del 0-10, de hace más de 7 días) en todas las zonas: sin `*` y sin la fecha a la vista. Se entiende al leer la nota al pie, pero el panel del editor sí enseña el `*`.
9. ⚠️ En móvil el panel por zona exige desplazar para ver objetivo, falta y sesiones; en el seguimiento la columna Propuesta estira cada fila. Propuesta P3.
10. ✅ Contraste, unidades (min, h, kg, %, IF/IEM sin unidad), coma decimal y textos en español correctos en todo lo recorrido; no hay «IA» en pantalla.

### ¿Es cómodo para programar?

- **Qué zona va corta**: sí, si hay objetivos («Falta» y la barra); sin objetivos solo lo dice el aviso de series por grupo («Aductores bajo mínimo»).
- **Qué día carga demasiado**: sí, con «Nivel de IF» (Pierna A = 80, Alta, en ámbar) y la tarjeta IF (máx. por sesión).
- **Qué articulación se repite en días seguidos**: **no de un vistazo**. La tabla de estrés articular da el número por sesión, pero nada resalta «Hombro articular 9,2 el lunes y 18,6 el miércoles con 48 h entre medias». Hay que leer 11 filas × 4 columnas. Propuesta P2.

### Propuestas de comodidad (máximo 5, sin implementar)

**P1 · Sesiones a la izquierda, objetivo plegado.** En la tabla por zona, poner las columnas de sesión justo después de «IEM semana» y mover Objetivo / Frente al objetivo / Falta a un bloque que solo se despliega con «Solo con objetivo» o cuando la zona tiene objetivo. Así a 1400 px se ven las 4 sesiones sin desplazar (hoy 834 px → ~620 px). Boceto: `Zona · Series · IEM · L · M · X · J · Agujetas · [Objetivo ▸]`. Captura 01/25: hoy «Pierna B» queda fuera.

**P2 · Fila de «días seguidos» en estrés articular.** Debajo de cada articulación, resaltar en ámbar las celdas de dos sesiones separadas por menos de 48 h cuando ambas pasan de un umbral (p. ej. ambas > 5), y un resumen arriba: «Hombro: L + X cargan los dos». Usa `dayIndex` y la letra del día que ya pinta la tabla por zona. Captura 04.

**P3 · Tarjetas por zona en móvil.** Por debajo de 640 px, el seguimiento y la tabla por zona pasan de tabla a tarjetas: nombre + modo, agujetas → IEM (vs anterior), propuesta en una frase. Evita filas de 180 px y el desplazamiento lateral. Captura 23.

**P4 · Nombres y sesiones reales en carga aguda/crónica y Gestión.** Mostrar «Torso A / Pierna A…» en vez de «Sesión 1-4», ocultar las sesiones 5-7 cuando el ciclo tiene 4, y escribir los avisos articulares como «Torso A · Columna cizalla: 3,0× la media (máx. 1,6)». Captura 10.

**P5 · Avisar de la primera semana tras un parón.** El curso pide no frenar en la primera semana de vuelta (`Mesocycle.vuelveDeParon` ya existe): en el freno/acelerador, si la semana evaluada es la 1 y `vuelveDeParon`, cambiar «Frenar» por «Vigilar: primera semana tras parón, espera a la siguiente». Una línea en `propuestaZona` con test.

---

## Lo arreglado, archivo por archivo

| Archivo | Qué | Test |
|---|---|---|
| `src/utils/cdg/agujetas.ts` (comentario de cabecera) | Decía «5 → bajar 20-30 %» y «zonas sensibles: isquios, glúteo, aductores, dorsal», que ya no es lo que hace `propuestaZona` ni lo que dice `zonas.ts`. Ahora describe la regla real | Solo comentario; `agujetas` sigue cubierto por `zonas.test.ts`, `vigenciaAgujetas.test.ts`, `progresionIem.test.ts` |
| `src/utils/titularesRevision.ts:22` (comentario) | «IEA» con el significado antiguo (estímulo) → «IEM» | Solo comentario |
| `scripts/arreglarEjerciciosCdg.mjs` (nuevo, simulacro) | Arregla los datos de **F1** y, con `--grupos`, **D1** (9 sin grupo + 3 con grupo absurdo). Comprueba en el catálogo que el `cdgNombre` existe y en `workouts`/`mesocycleTemplates` que nada usa los duplicados antes de borrarlos | Simulacro ejecutado: 16 operaciones con `--grupos`, 0 fallos |
| `src/utils/cdg/integracion.ts` · `semanaPorDefecto` (nueva) | La semana que abre el seguimiento: la última con todas las sesiones del ciclo | `integracion.test.ts` +3 tests (13 en el archivo) |
| `src/components/mesociclo/SeguimientoCdg.tsx` | Usa `semanaPorDefecto`; el desplegable marca «· 1 de 4 sesiones»; aviso en ámbar si la semana elegida está incompleta; cabeceras de tabla con padding y sin cortes | Visto en el navegador (S7 por defecto, S8 marcada) |
| `src/components/mesociclo/PanelIndicesCdg.tsx` | `whitespace-nowrap` en las tres celdas «vs S-1» (zona, grupo, músculo) | Visual |
| `src/components/CorrelationPanel.tsx` | `fmtNum` (coma, 1 decimal) en el eje Y y el tooltip; antes `toFixed(1)` con punto | Visual |

### F1 · Dos hip thrust mal vinculados (dato, no código)

`sys_hip-thrust-mayor-flexion-de-rodilla-maxima-aceleracion` y `…-tempo-controlado` vienen del Excel original (sus músculos secundarios incluyen cuádriceps), pero la limpieza les acortó el nombre a «Hip thrust máxima aceleración / tempo controlado» y el emparejado los vinculó al hip thrust **normal** («Glúteo, lumbares»). Después `crearEjerciciosCdg.mjs` creó los `…-cdg` con el vínculo correcto. Resultado: dos pares de ejercicios con el mismo nombre en el selector, y el original cuenta los pesos de otro ejercicio. Una rutina (`workouts/Qs8UXAUqWz6NFHcg4mSJ`) usa el original de tempo controlado; ninguna usa los `-cdg`.

Comando (simulacro; añade `--aplicar` cuando lo veas):
```bash
cd ~/en-forma-revision-cdg && GOOGLE_APPLICATION_CREDENTIALS="$HOME/Desktop/CLave FIREBASE.json" node scripts/arreglarEjerciciosCdg.mjs
```

---

## Aplicado tras tu respuesta (27-10, segunda pasada)

Dani decidió: D8 se excluye, D10 adelante, el resto como se proponía; las agujetas se preguntan una vez a la semana (el preset ya es cada 7 días, miércoles: sin cambios).

| Decisión | Qué se hizo | Dónde | Test |
|---|---|---|---|
| D1 · Grupos | **Escrito en Firestore**: 2 hip thrust revinculados y renombrados, 2 duplicados `-cdg` borrados, 9 fullbody con grupo, Thruster/Split jerk/Ring muscle up recolocados. Ahora 1.035 ejercicios, 1.035 con grupo, único `cdgNombre` repetido el del trapecio (intencionado). Sello de `exercises` actualizado | `scripts/arreglarEjerciciosCdg.mjs --grupos --aplicar` | Simulacro posterior: 0 operaciones |
| D2 · CR5 en CDG | Seguimiento y tarjeta de carga pasan `contextoPesoCorporal(allExercises, últimoPeso)`; línea en pantalla «Las series a peso corporal cuentan con el peso del atleta (X kg)» o «Sin peso registrado: … como en la hoja» | `SeguimientoCdg.tsx`, `PanelIndicesCdg.tsx` (`useAthleteWeight`) | `pesoCorporal.test.ts` (ya existía); visto en el navegador |
| D4 · Glúteo propenso | `sensible: true` en glúteo | `zonas.ts:31` | `zonas.test.ts` +1 |
| D5 · Contexto desfavorable | Ya no veta: la mitad del %, nota «contexto desfavorable: si subes, poco; si se repite varias semanas, baja» | `agujetas.ts:propuestaZona` | `zonas.test.ts` (caso cambiado a `acelerar`, 15 %) |
| D6 · Umbrales | `validados: true`: desaparece el aviso ámbar del seguimiento | `agujetas.ts:131` | `vigenciaAgujetas.test.ts` |
| D8 · Semana en curso | `cargaAgudaCronicaDelMeso({ semanaEnCurso })` la deja fuera de la crónica; Seguimiento y panel la calculan con `mesocycleWeekNumber(startDate, hoy)` | `integracion.ts` | `integracion.test.ts` +1 |
| D9 · Catálogo | `shouldDehydrateQuery` excluye `['cdgCatalogo', …]` del persister (−394 KB de localStorage) | `main.tsx` | — (una lectura por sesión del coach) |
| D10 · Respuestas | `getResponsesForAthlete` baja solo las últimas 26 semanas (`submittedAt >=`, orden desc). Índice nuevo `athleteId + submittedAt` en `firestore.indexes.json`; **si el índice no está desplegado, cae a la consulta completa** (no a modo local), así que se puede mergear antes de desplegar | `db/questionnaires.ts`, `firestore.indexes.json` | — |

Línea base final: `npm run lint` ✔ · `npx vitest run` ✔ 268 archivos, **3.116 tests** · ESLint ✔ sobre lo tocado.

**Pendiente tuyo:** desplegar el índice (`npx firebase deploy --only firestore:indexes` desde main al día). (El preset de 48 h se retiró en la tercera pasada: D7 ya no aplica.)

## Tercera pasada (27-10): agujetas semanales y propuestas P1-P5

Dani: nada de cuestionario cada dos días; las agujetas se preguntan **una vez a la semana** y el CDG trabaja con eso. Y «aplica todo» (P1-P5).

| Qué | Dónde | Test |
|---|---|---|
| **Fuera el preset «Agujetas a las 48 h»** (ya no sale «Cargar plantillas (1)»). El DOM's 0-10 pasa a ser semanal (`intervalDays: 7`) y lleva las dos preguntas de contexto del protocolo (cansancio al salir, motivación), opcionales. En la plantilla «Hipertrofia · 6 sem» queda una sola fila «Agujetas de la semana (CDG)», viernes de cada semana. El editor ya no ofrece señales `agujetas.<zona>`; el motor sigue leyéndolas si existieran | `questionnairePresets.ts`, `plantillasCuestionarios.ts`, `questionnaireSignals.ts` | `plantillasCuestionarios.test.ts` (6 viernes, 7 días) |
| Textos: el panel y el seguimiento dicen «DOM's semanal (0-10) convertido a 1-5»; desaparecen el `*` y la nota de «cuestionario antiguo» | `PanelIndicesCdg.tsx`, `SeguimientoCdg.tsx`, `agujetas.ts` | — |
| **P1** · Sesiones justo después de «IEM semana»; Objetivo / Frente al objetivo / Falta al final y plegadas tras un botón («Poner objetivos» / «Ver objetivos» / «Ocultar objetivos»), abiertas solas si el bloque ya tiene objetivos | `PanelIndicesCdg.tsx` (`verObjetivos`, cabecera y las cuatro filas) | tipos |
| **P2** · Articulaciones en días seguidos: `articulacionesEnDiasSeguidos` marca la misma articulación ≥ 5 en dos sesiones con `dayIndex` consecutivos; celdas en ámbar en la tabla de estrés articular, lista «Hombro Articular: Torso A (9,2) y Pierna A (6) en días seguidos» y cuenta en Avisos | `utils/cdg/diasSeguidos.ts`, `PanelIndicesCdg.tsx` | `diasSeguidos.test.ts` (3) |
| **P3** · Tarjetas por zona por debajo de 640 px en el panel (zona, IEM, series, vs, agujetas, objetivo, chips por sesión) y en el freno/acelerador (zona, modo, agujetas, IEM, propuesta); las tablas quedan para ≥ 640 px | `PanelIndicesCdg.tsx`, `SeguimientoCdg.tsx` (`sm:hidden` / `hidden sm:block`) | tipos |
| **P4** · Gestión, carga aguda/crónica y rendimiento enseñan el nombre del día (Torso A…) en vez de «Sesión N»; los huecos 5-7 de un ciclo de 4 no se listan; los avisos dicen «Torso A · Columna Cizalla: 3,00× la media (fuera de 0,80–1,60)». `grupos` del seguimiento lleva `name` (ya lo traía `groupMesoWorkouts`) | `SeguimientoCdg.tsx` | tipos |
| **P5** · `propuestaZona({ primeraSemanaTrasParon })`: con 4-5 de agujetas en la semana 1 de un bloque con `vuelveDeParon`, «Vigilar» en vez de «Frenar» | `agujetas.ts`, `SeguimientoCdg.tsx` | `zonas.test.ts` (+1) |

Línea base: `npm run lint` ✔ · `npx vitest run` ✔ 269 archivos, **3.120 tests**. Las pantallas de esta pasada están comprobadas por tipos y tests; **no se han vuelto a ver en el navegador** (la sesión de coach caducó al recargar). Ya no queda ningún clic de preset: solo el índice de `questionnaireResponses`.

## Comprobación en pantalla de la tercera pasada (27-10, sesión de coach de Dani)

| Qué | Visto | Captura |
|---|---|---|
| P1 | Tabla por zona a 1400 px: Zona · Series · IEM · Torso A · Pierna A · Torso B · Pierna B · Agujetas, **701 px en 725 px: sin desplazar**. Botón «Poner objetivos» abre las tres columnas al final (entonces 834 px, con desplazamiento) y «Ocultar objetivos» las quita | 28, 29 |
| P2 | Bloque de estrés articular con la lógica nueva; en el meso de Israel no hay ningún caso (Torso A y Pierna A son días seguidos pero ninguna articulación pasa de 5 en los dos), así que «Sin avisos» es correcto. El resaltado está cubierto por `diasSeguidos.test.ts`, no visto con datos reales | 30 |
| P3 | Móvil 375 px: freno/acelerador y tabla por zona en tarjetas, 0 tablas visibles, sin desplazamiento horizontal. Arreglado sobre la marcha: «· series» → «sin series directas» | 33, 34 |
| P4 | Gestión y carga con «Torso A, Pierna A, Torso B, Pierna B» y sin huecos 5-7; avisos «Torso A · Columna Cizalla: 3× la media (fuera de 0,8–1,6)» | 31 |
| P5 | Israel no vuelve de parón: sin caso en pantalla; cubierto por `zonas.test.ts` | — |
| D2 / D8 | «Las series a peso corporal cuentan con el peso del atleta (62,9 kg)»; la crónica usa S2-S7 (S8, en curso, fuera) | 32 |
| Textos | «Agujetas de la semana (DOM's 0-10, convertidas a 1-5)» en el seguimiento y «Agujetas: DOM's semanal (0-10) convertido a 1-5» en el panel; sin asteriscos | 28, 32 |
| Consola | Sin errores | — |

## Decisiones pendientes (tuyas)

1. **D1 · Grupos de los fullbody.** Nueve levantamientos olímpicos no tienen grupo (Push jerk, Push press, Clean, Hang clean, Hang power clean, Muscle clean, Dumbbell snatch, Muscle snatch, Hang power snatch: la biblioteca dice «1.028 con grupo muscular» de 1.037) y a Thruster, Split jerk y Ring muscle up les salió un estabilizador. Propuesta, ya en `arreglarEjerciciosCdg.mjs --grupos`: cleans y snatches → glúteo (como sus hermanos con mancuerna/kettlebell), muscle clean/snatch → trapecio, push jerk/press y split jerk → deltoide anterior, thruster → cuádriceps, ring muscle up → dorsal. Simulacro: 16 operaciones.
2. **D2 · CR5 en el seguimiento CDG.** El motor ya suma el peso del atleta a dominadas y fondos, pero ninguna pantalla CDG se lo pasa: la Semana X va como la hoja (0 kg no cuenta). Recomiendo **activarlo** pasando `contextoPesoCorporal(allExercises, últimoPeso)` desde `SeguimientoCdg` y `PanelIndicesCdg` (carga aguda/crónica), avisando en pantalla de que las series a peso corporal cuentan con el peso del atleta. Es lo que pediste en CR5; la hoja no lo hacía solo porque no tenía el dato.
3. **D3 · ¿Cifra para el 5?** Hoy «Frenar» con 5 no propone IEM nuevo (tu decisión del 25-10). El curso tampoco da cifra para el 5 (sí 15-30 % para el 4 no propenso). Recomiendo dejarlo como está.
4. **D4 · Zonas propensas.** Hoy isquios y aductores. El curso solo nombra isquios de forma literal; aductores y **glúteo** tienen el mismo apoyo (anatomía + caso práctico 3). Recomiendo añadir glúteo; dorsal lo dejaría fuera.
5. **D5 · Contexto desfavorable.** Hoy bloquea la subida. El curso lo hace «más prudente», no lo veta. Recomiendo: con 1-3 y contexto desfavorable, proponer la mitad del % y texto «contexto malo: si subes, poco», en vez de «mantener».
6. **D6 · Umbrales propios** (ya marcados en pantalla como pendientes): estrés ≥ 7 / sueño < 6 h / motivación ≤ 4; neutro = mitad; base ≥ 100 → máx. 10 %; vigencia 7 días. Ninguno sale del curso. Recomiendo validarlos tú y poner `validados: true` para que desaparezca el aviso, o cambiarlos.
7. **D7 · Cargar el preset «Agujetas a las 48 h».** No existe en Firestore (`Cargar plantillas (1)` en Ajustes › Entrenadores › Cuestionarios). Hasta que lo cargues y lo asignes, el freno/acelerador solo tiene el DOM's 0-10 convertido. Recomiendo cargarlo y meterlo en el paquete semanal del miércoles (la plantilla «Hipertrofia · 6 sem» ya lo lleva).
8. **D8 · Semana en curso en la carga crónica.** `cargaAgudaCronicaDelMeso` mete la semana incompleta (S8 con 1 sesión) en la media de 6: la crónica baja y el ratio sube (1,26 en S10). La hoja hace lo mismo si rellenas a medias, pero aquí es automático. Recomiendo excluir la semana del calendario en curso de la crónica (es un cambio en `integracion.ts`, no en el motor); si prefieres fidelidad a la hoja, se queda.
9. **D9 · Catálogo fuera de localStorage.** 394 KB de los 5,4 MB; con `exercises` son un tercio. Recomiendo excluirlo del persister (ver medición).
10. **D10 · `questionnaireResponses` sin límite.** Cada apertura de la ficha o del meso baja todas las respuestas del atleta. Recomiendo limitar a las últimas 26 semanas (`orderBy('submittedAt','desc').limit(…)`) cuando tengas índice; no es urgente.
