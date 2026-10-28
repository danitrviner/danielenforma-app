# Diseño del autopiloto · 28-10-2026

Entrega 2 del encargo «coach automático con Dani de supervisor». Parte de la auditoría `docs/auditoria-ia-autonoma-2026-10-28.md` (hallazgos H1-H25) y de las respuestas de Dani del 28-10. **No hay código: esto es el plano y el orden de obra.** Nada se programa hasta que Dani lo apruebe.

---

## 0 · Decisiones de Dani (28-10) y lo que queda abierto

| Tema | Decisión | Consecuencia en el diseño |
|---|---|---|
| Niveles de autonomía | «Mi reparto, imagino; de momento quiero poder revisar todo lo que va haciendo» | Arranque en **modo rodaje global**: todo lo que decide el modelo se **propone**; lo determinista que ya hace el latido sigue igual. La tabla del §4 es el destino, no el arranque, y el nivel sube por tipo solo con datos (§4.3). Todo lo aplicado, por quien sea, aparece en «Hecho hoy» con deshacer |
| Firma al atleta | **Dani** | Un solo remitente; nada firmado «el equipo» ni «el asistente». En rodaje, cada texto al atleta es una propuesta que Dani aprueba o edita |
| Presupuesto | «Tu recomendación, pero que lo pueda modificar» → 50 $/mes | Tope mensual y diario editables en la pantalla de Política (`coachSettings/autopiloto.presupuesto`), con `AI_DAILY_USD_LIMIT` como techo duro de respaldo |
| Proteína y grasa | **Manda el alta: 2 g/kg** | Reescribir doctrina §7 a 1,6-2,2 g/kg (2,0-2,4 en déficit profundo); validador avisa < 1,4 g/kg y rechaza < 1,2; grasa ≥ 0,6 g/kg y ≥ 15 % kcal. Revierte el descarte de CR1 |
| Umbrales de desvío | **Los del motor** | Peso fuera del rango de la fase 2 semanas seguidas (`verificacionObjetivo.ts`); adherencia por kcal < 70 % dos semanas; 3 sesiones perdidas en 14 días; 10 días sin pesarse |
| Menú automático | **Borrador 24 h y luego solo** | Se genera el sábado en servidor; si el domingo a la misma hora Dani no lo ha tocado, se publica |
| Chat del atleta | **Todo a través de Dani** | El atleta no habla con el asistente. Las `preguntas` del expediente van a Dani como tarea; él pregunta por WhatsApp y apunta la respuesta en la ficha. Los textos al atleta salen solo de episodios, firmados Dani |
| Decisiones siempre de Dani | «De momento supervisar todo» + renovación, baja y dinero | Lo comercial nunca entra en la política; el resto, rodaje |
| Atletas sin consentimiento | «Volver a enseñarlo, pero quiero los términos y condiciones todos juntos, de manera general y que sea obligatorio aceptar» | Muro legal unificado (tanda 8). **Aviso:** un consentimiento para datos de salud que sea condición obligatoria del servicio no es «libre» según el RGPD (art. 9 y considerando 43); la forma segura es un muro único con una casilla específica y explícita para el análisis con el asistente, y quien no la marque sigue llevándolo Dani a mano (como hoy). Lo marco como **decisión pendiente** y recomiendo revisar el texto con quien le redactó la privacidad |

**Abiertas:** (D1) el texto y la base jurídica del muro unificado; (D2) frecuencia del cron en el plan de Vercel actual (hoy diario; el autopiloto necesita cada 15-30 min, ver §2.4); (D3) si en rodaje Dani quiere **también** aprobar el menú de cada semana o le vale el borrador de 24 h (he asumido que le vale).

---

## 1 · Principio de arquitectura: motores deciden, el modelo redacta y arbitra

1. **Todo número sale de un motor** y es el mismo que ve Dani en pantalla: kcal objetivo (`gastoReal.kcalParaObjetivo` / Mifflin de `energyCalc`), ritmo de peso (`verificacionObjetivo.verificarObjetivo`), adherencia (`diaDeDieta.adherenciaPorKcal`), series (`volumeSuggestion.suggestVolume`, `calculadoraReparto`), progresión (`progression.resolveExerciseForWeek`, `semanasDelBloque`, `cdg/progresionIem.proponerProgresionIem`), freno/acelerador (`cdg/agujetas.propuestaZona`), menú (`menuEngine.generateWeek` + `extrasDelCatalogo`), reto (`weeklyChallenge.generateAutoChallenge`), revisión (`revisionCoach.buildRevisionCoach`, `titularesRevision`), cierre (`cierreMesociclo`). El modelo recibe esos números ya calculados y **no los recalcula**: regla 2 del prompt de sistema, que pasa a estar también en código (el validador rechaza una kcal que no coincida con la opción del motor ±2 %).
2. **El modelo hace cuatro cosas:** elegir entre opciones equivalentes que el motor le da (qué ejercicio del mismo patrón, qué reto de los 3 calculados, qué fase de las que caben), interpretar lo que el motor no ve (texto libre, contradicciones entre alta y datos, contexto de vida), redactar (para el atleta en nombre de Dani, para Dani en una línea) y escalar (decir «esto es tuyo» cuando la política o la clínica lo exigen).
3. **Toda decisión queda escrita como `AiProposal`, se aplique o no.** Campos nuevos (H4): `episodioId`, `autor: 'asistente' | 'latido' | 'coach'`, `politica: 'automatico' | 'aviso' | 'proponer' | 'sombra'`, `status` amplía a `'aplicada' | 'deshecha' | 'caducada'`, `snapshotAntes: { coleccion, id, datos | null }[]` (lo que había antes de escribir; `null` = no existía, deshacer = borrar), `aplicadaEn`, `avisoHasta` (para «con aviso»), `resultado?: { comprobadoEn, cumplioEsperado: boolean | null, nota }` (cierra el `esperado` del expediente en el episodio siguiente), `paraAtleta?: string` (el texto que llegó al atleta, literal).
4. **Un solo aplicador.** `src/autopiloto/aplicarPropuesta.ts` (puro, H3): `(kind, payload, lector) → { escrituras: Escritura[], snapshot }`. El hook de React y el servidor lo llaman; el servidor lo ejecuta con Admin SDK en un `WriteBatch` por entidad compuesta (bloque + sesiones + asignaciones).

---

## 2 · El bucle: episodios por eventos

### 2.1 Definición

Un **episodio** es la unidad de trabajo: `disparador → leer (un brief) → decidir (motores + modelo) → actuar (aplicar o proponer según política) → explicar (atleta y Dani) → programar la siguiente comprobación`. Vive en `episodios/{id}` con id determinista (`{tipo}_{email}_{clave}`; la clave es la fecha, la semana ISO o el id del documento que lo disparó): repetirlo el mismo día **no duplica**, retoma.

```ts
interface Episodio {
  id: string; tipo: TipoEpisodio; athleteId: string;
  disparador: { fuente: string; docId?: string; fecha: string };
  estado: 'pendiente' | 'leyendo' | 'decidiendo' | 'aplicando' | 'hecho' | 'escalado' | 'fallido' | 'sombra';
  ronda: number;                 // del bucle de agente, para reanudar
  historial?: AiChatMessage[];   // solo mientras dura; se compacta al cerrar
  propuestas: string[];          // ids de aiProposals
  paraDani: string;              // una línea
  coste: { usd: number; llamadas: number; modelo: string };
  siguienteComprobacion?: { fecha: string; que: string };
  creadoEn: string; cerradoEn?: string; error?: string;
}
```

### 2.2 Quién dispara y quién consume

- **El latido detecta y encola.** `api/latido-diario.ts` ya lee por atleta casi todo lo necesario (`:142-157`); se le añaden `leerRespuestasDeCuestionarios` completo, `leerMesociclos`, `leerOnboarding` y un módulo puro `src/autopiloto/detectores.ts` que, con la foto del atleta y la fecha, devuelve los episodios que tocan hoy. El latido crea los documentos `episodios/*` en estado `pendiente` (idempotente por id) y **no llama al modelo**.
- **`api/autopiloto.ts` consume la cola.** Protegido con el mismo `CRON_SECRET`. Cada invocación: toma hasta N episodios `pendiente` (prioridad: emergentes > cuestionario > semana > revisión > alta), y para cada uno ejecuta **una ronda** del bucle de agente (una llamada a Anthropic + sus tools), guarda `historial` y `ronda`, y sigue con el siguiente. Un episodio de 13 rondas tarda 13 invocaciones; ninguna pasa de 60-90 s. Tope de rondas por episodio (20) y de coste (§9).
- **Eventos que no esperan al latido.** La respuesta de un cuestionario y la molestia marcada se encolan **también** desde el cliente del atleta al enviar (`CheckInScreen.tsx:282-295` ya crea la notificación; añade `episodios/cuestionario_{responseId}` con regla de Firestore `create` solo para el propio atleta y solo con su email). El consumidor lo recoge en la siguiente pasada.
- **Convivencia con el latido:** el latido sigue haciendo lo determinista (perdidas, fase, niveles, reto, recordatorios) exactamente igual; el autopiloto **nunca** repite esas escrituras. Lo que el latido aplica se anota como `AiProposal` con `autor: 'latido'`, `politica: 'automatico'` y snapshot, para que salga en «Hecho hoy» (H5) y se pueda deshacer.

### 2.3 Los episodios

Para cada uno: disparador exacto, qué lee (siempre **un** `get_client_brief` con una sección nueva por episodio), motores, escrituras, qué va al atleta, qué va a Dani, coste estimado, idempotencia.

| Episodio | Disparador (campo) | Lee | Motores | Escribe (según política) | Al atleta (firma Dani) | A Dani | Coste | Idempotencia |
|---|---|---|---|---|---|---|---|---|
| **alta_completada** | `onboarding/{email}.completedAt` presente + consentimiento aceptado + `user_profiles.planStartDate` + sin `episodios/alta_{email}` | brief `mes_nuevo` + `get_coach_adjustments` global (siempre) | `suggestVolume`, `calcularReparto`/`list_mis_repartos`, `energyCalc`, `generateWeek`, `generateChallengeOptions`, `computeSetupChecklist`; CDG si procede (§7) | Las 19 piezas del recorrido **dentro del episodio en orden**: el bucle aplica el mesociclo (en sombra/rodaje: lo propone y el episodio queda `escalado` hasta que Dani apruebe; al aprobar, el hook reencola `alta_{email}` y el episodio **continúa** con sesiones → publicar → nutrición → menú → setup → roadmap → reto → ficha). Resuelve H13 sin tocar la regla «sesiones exigen mesociclo real» | Mensaje de bienvenida con su primera semana (solo cuando el bloque esté publicado) | «Plan montado: N piezas aplicadas, M propuestas, K preguntas» + las preguntas del expediente como tareas | 0,7-2,3 $ (medido) | id `alta_{email}`; cada pieza comprueba la checklist antes de proponerla |
| **semana_nueva** | lunes 02:00: `mesocycleWeekNumber(meso.startDate, hoy)` cambia y/o `semanaDelPrograma(program, hoy)` cambia; sin `episodios/semana_{email}_{isoWeek}` | brief corto: plan, novedades de la semana (`novedadesNutricion`, `resolveExerciseForWeek` por sesión), agujetas y bienestar de la semana anterior, adherencia, peso | `progression` (ya programado: se aplica solo, es del latido), `proponerProgresionIem` + `propuestaZona` (CDG), `semanasNutricion.aplicarAjustes`, `generateWeek` (menú, sábado), `generateAutoChallenge` | Progresión IEM de la semana (**aviso** cuando salga de rodaje; en rodaje proponer); menú: borrador sábado → publicado domingo si no se toca; reto: lo elige el motor, el modelo solo redacta | «Esta semana: …» (qué cambia en entreno y comida, una vez, lunes) | Línea en Hecho hoy | 0,03-0,05 $ (1 llamada) | id `semana_{email}_{isoWeek}` |
| **cuestionario_recibido** | `questionnaireResponses` nuevo (`submittedAt` ≥ último latido) o cola del cliente; sin `episodios/cuestionario_{responseId}` | brief `revision` reducido + la respuesta + `alertasDeRespuesta` en servidor + `get_revision_engine` periodo `semana` | `construirTitulares`, `adherenciaPorKcal`, `verificarObjetivo`, `alertasDeRespuesta`, `contextoDeLaSemana` | `respuestaCoach` del cuestionario (tool nueva `propose_respuesta_revision`, H9): **automático solo en rutina** (sin alertas, sin desvío); si hay alerta clínica → `escalado` a Dani con borrador; si hay desvío → encola `ajuste_*` | La respuesta a su revisión (texto; el audio/vídeo sigue siendo de Dani) | Si rutina: línea; si alerta: tarea «revisar ya» | 0,08-0,15 $ | id por `responseId` |
| **revision** | `mesocycleWeekNumber` = mitad del bloque (`floor(weeks/2)`) o última semana; o `tasks` tipo `revision` con `dueDate` = hoy; sin `episodios/revision_{email}_{mesoId}_{mitad|fin}` | brief `revision` completo + `get_revision_engine` periodo `bloque` + `resultado` de las propuestas anteriores (¿pasó lo esperado?) | `buildRevisionCoach`, `verificarObjetivo`, `calcularGastoReal`, `computePeriodizationPerformance`, `indicadoresCambioDeBloque`, `calcularDerivas` | Veredicto + ajustes como propuestas (kcal, sesiones, reparto, hitos) + ficha viva; cierra el `esperado` de las propuestas previas | Nada directo: la revisión le llega con la respuesta a su cuestionario de esa semana | «Veredicto en 3 frases» + propuestas | 0,5-1 $ | id por meso y mitad/fin |
| **fin_de_bloque** | última semana del mesociclo + 1 día; sin `episodios/cierre_{mesoId}` | brief `renovar_mes` + `buildCierreMesociclo` | `cierreMesociclo`, `leerRendimiento`, `calcularDerivas`, `suggestVolume` con historial | Cierre (solo lectura) + bloque nuevo como `alta_completada` pero con «qué cambia respecto al anterior» obligatorio; **la renovación comercial no entra**: si `planDurationMonths` vence, tarea a Dani y el episodio para | Nada hasta que el bloque nuevo esté publicado | «Bloque cerrado: X. Bloque nuevo propuesto. ¿Renueva?» | 0,7-2,3 $ | id por meso |
| **dolor** (emergente) | `alertasDeRespuesta` → tipo `molestia`, o `exerciseNotes` nueva con palabras clave, o `WeightCheckIn.notes` | brief corto + lesiones del alta + sesiones del bloque + alternativas por patrón (`seleccionEjercicios`, `agruparEjerciciosPorPatron`) | motor: candidatos del mismo patrón sin la articulación/gesto; modelo: elige y redacta | Sustituir el ejercicio en las sesiones desde esta semana (`propose_week_plan.cambios`) — **nunca automático** (§5 clínica): aviso 24 h si molestia leve y el alta no declara lesión; proponer si lesión declarada o dolor persistente | «He cambiado X por Y esta semana; si sigue, me lo dices» | Tarea «revisar ya» siempre | 0,1-0,3 $ | id por `responseId`/nota |
| **perdidas** | 3 asignaciones `perdido` en 14 días (agregado nuevo en `detectores.ts`) | asignaciones, logs, último login, eventos de semana | determinista + modelo redacta | Nada en el plan (doctrina §15: adherencia antes que programación); mensaje + tarea | «Te he visto faltar tres días: ¿qué está pasando?» (rodaje: lo aprueba Dani) | Tarea «hablar con él» | 0,05 $ | id por quincena |
| **peso_sin_registrar** | `leerPesajes` sin dato en 10 días y fase con objetivo de peso | pesajes, último login | determinista | Nada | Recordatorio una vez | Línea | 0 $ (sin modelo) o 0,02 $ | id por decena |
| **desvio_peso** | `clasificarRitmo` = lento/rápido 2 semanas seguidas (umbral de Dani) | brief nutrición + `gastoReal` + `proponerAjuste` + `evaluarReglasDePeso` | `kcalParaObjetivo`, `proponerAjuste` (suelo 1.400, paso 50, máximo 400) | Ajuste de kcal: ≤ 5 % automático (fuera de rodaje), 5-10 % aviso, > 10 % proponer; nunca si adherencia < 70 % (entonces `desvio_adherencia`) | «Subo/bajo X kcal: …» | Línea o propuesta | 0,1 $ | id por semana |
| **desvio_adherencia** | `adherenciaPorKcal` semanal < 70 % dos semanas | registros, menú, gustos | `comidaDeLaSemana`, `senalesDeCambios` | No toca kcal; propone simplificar (menú con sus recetas habituales, menos comidas) o mensaje | «Veo que la comida no está saliendo: …» | Tarea | 0,1 $ | id por semana |
| **nota_libre** | texto nuevo en cuestionario/check-in con palabras clave (viaje, enfermo, vacaciones, regla, estrés, cambiar, no puedo) **o** cualquier texto > 80 caracteres | el texto + brief corto | modelo clasifica: `viaje | enfermedad | disponibilidad | material | pregunta | otro` | Según clase: viaje → `eventosSemana` + sesiones reducidas (aviso); enfermedad → pausa de progresión esa semana (aviso) + tarea; disponibilidad/material → propuesta de sesiones; pregunta → tarea a Dani | Acuse breve | Tarea con la clasificación | 0,05-0,1 $ | id por texto (hash) |
| **bienestar** | `contextoDeLaSemana` = desfavorable 2 semanas, o sueño < 6 h, estrés ≥ 7 | cuestionario, IRP | `contextoDeLaSemana`, `historialIRP` | Nada automático: modula `semana_nueva` (mitad de la subida) y tarea | — | Línea | 0 $ | por semana |
| **renovacion / baja** | `planDurationMonths` vence en ≤ 14 días; `estadoCrm` cambia | — | — | **Humano**: tarea a Dani con el resumen del bloque (`cierreMesociclo`) | — | Tarea | 0,05 $ (resumen) | por plan |

**Prioridad de cola:** dolor > cuestionario > nota_libre > perdidas/peso > semana_nueva > desvío > revisión > alta/fin_de_bloque.

### 2.4 Frecuencia

El latido diario basta para semana_nueva, revisión, fin_de_bloque, perdidas y peso. Cuestionario, dolor y nota_libre necesitan **minutos, no días**: el consumidor `api/autopiloto.ts` debe correr cada 15-30 min (cron de Vercel) o dispararse desde el cliente del atleta al enviar (`fetch` al endpoint con un token corto). **D2:** confirmar el plan de Vercel; si solo admite cron diario, el disparo desde el cliente es el camino.

---

## 3 · Brief único y memoria

- **`get_client_brief` gana una sección por episodio** (`BriefSeccion` nuevas: `episodio`, `semana`, `resultado`): lo que disparó, los números del motor para esa decisión, y el `resultado` de las propuestas anteriores con `esperado` sin comprobar. Sigue siendo **una llamada**.
- **Ficha viva (H21):** los hechos por propuesta/aprobación se sustituyen por **un hecho por episodio** («Semana 6: +1 serie dorsal, menú publicado, reto pasos; esperado: …»), con tope por tipo (60 episodios ≈ un año). Las derivas (`calcularDerivas`) entran en el brief de **los tres** tipos de tarea, no solo mes nuevo/renovar.
- **`cambiosAtleta` con `autor: 'asistente' | 'latido'`** (`db/cambios.ts:45` deja de filtrar al coach) para que «Lo que he cambiado» cuente también lo automático, marcado.
- **El `expediente.esperado` se cierra**: el episodio `revision` (y `cuestionario_recibido` si lo esperado era a una semana) escribe `resultado.cumplioEsperado`. Es la métrica de calidad del §5.4.

---

## 4 · Política de autonomía

### 4.1 Niveles

`automatico` (se aplica, sale en Hecho hoy, deshacer) · `aviso` (se aplica, aviso a Dani, 24 h para deshacer; `avisoHasta`) · `proponer` (espera aprobación) · `sombra` (decide, no escribe, se compara).

### 4.2 Tabla de destino (lo que Dani llamó «mi reparto»)

| Tipo de decisión | Destino | Nunca automático |
|---|---|---|
| Respuesta rutinaria al cuestionario (sin alertas ni desvío) | automático | — |
| Menú semanal | automático (borrador 24 h → publicar) | — |
| Reto de la semana | automático (motor elige, modelo redacta) | — |
| Progresión ya programada (+1 serie, RIR, descarga, test) | automático (es del latido) | — |
| Progresión IEM de la semana (CDG) dentro del tipo de bloque | aviso | — |
| Ajuste de kcal ≤ 5 % dentro de la fase | automático | — |
| Ajuste de kcal 5-10 % | aviso | — |
| Cambio de ejercicio por molestia leve sin lesión declarada | aviso | ✗ si hay lesión declarada → proponer |
| Descarga adelantada, semana de mantenimiento | aviso | — |
| Mensaje al atleta por perdidas/adherencia | aviso | — |
| Cambio de fase ya planificado en la periodización | aviso | — |
| Ajuste de kcal > 10 %, cambio de fase no planificado | proponer | ✓ |
| Mesociclo nuevo, reparto, publicar bloque | proponer | ✓ |
| Sesiones del bloque nuevo | proponer | ✓ |
| Cualquier cosa con lesión activa, dolor persistente, embarazo/lactancia, patología, medicación, sospecha de trastorno | proponer + tarea «revisar ya» | ✓ |
| Texto al atleta que mencione salud, médico, medicación | nunca: se escala | ✓ |
| Renovación, baja, dinero, pausa del servicio | humano | ✓ |
| Atleta sin consentimiento | el autopiloto no lo toca; latido determinista sí | ✓ |

### 4.3 Rodaje

- **Arranque (decisión de Dani):** `rodajeGlobal: true` → todo lo del modelo en `proponer`, lo determinista en `automatico` con Hecho hoy. Dani ve todo.
- **Subida por tipo, medida:** un tipo pasa de `proponer` → `aviso` cuando en las últimas **8** decisiones de ese tipo Dani aprobó sin editar ≥ 7 y `calcularDerivas` no detecta cambio posterior en ≥ 6; de `aviso` → `automatico` cuando en 8 avisos no deshizo ninguno. La subida se **propone** a Dani en la pantalla de Política («el asistente lleva 8 respuestas rutinarias aprobadas sin cambios: ¿pasa a automático?»); nunca sube sola.
- **Bajada inmediata:** «No vuelvas a hacer esto» en una fila de Hecho hoy baja ese tipo un nivel para ese atleta y apunta el motivo como instrucción fija (`coachSettings.instructions`, lo que ya lee el prompt).
- **Por atleta:** `user_profiles.autopiloto?: { nivelPorTipo?: Partial<Record<TipoDecision, Nivel>>; pausado?: boolean }` manda sobre lo global.
- **Modo sombra:** antes del rodaje, 2-3 semanas con `politica: 'sombra'`: el episodio decide y escribe la propuesta como `sombra`; una pantalla compara con lo que Dani hizo (`cambiosAtleta`, derivas) y da la tasa de coincidencia por tipo.

Almacenamiento: `coachSettings/autopiloto` = `{ rodajeGlobal, nivelPorTipo, presupuesto: { mesUsd, diaUsd }, modeloPorEpisodio, umbrales }`.

---

## 5 · Supervisión de Dani (extender, no duplicar)

### 5.1 Hoy (bandeja) — `HomeCoachScreen` + `bandejaDelDia.ts`

Se añade una fuente a la bandeja: `aiProposals` con `status in ('aplicada','proposed')` de las últimas 24 h y los `episodios` en `escalado`. Tres bloques nuevos encima de las señales de hoy:

```
HECHO HOY · 7                      PROPUESTO · 3            ESCALADO · 1
──────────────────────────────────────────────────────────────────────────
▸ Marco · menú semana 7 publicado          · generador, dieta Déficit 2 · [Deshacer] [No vuelvas] [Hablar]
▸ Angel · reto: 8.000 pasos 4 días         · motor, nivel intermedio    · [Deshacer] [No vuelvas]
▸ Israel C. · +1 serie dorsal, RIR 2→1     · progresión programada S6   · [Deshacer]
▸ Rafa · respuesta a su revisión enviada   · rutina, sin alertas        · [Ver texto] [No vuelvas]
▸ latido · 4 sesiones perdidas (3 atletas) · 7 días sin registrar       · [Ver]
──────────────────────────────────────────────────────────────────────────
▸ Javier V. · bajar 150 kcal (−6 %)        · peso lento 2 semanas, adherencia 84 %  · [Aprobar] [Editar] [Rechazar]
▸ Pedro R. · bloque #3 nuevo (6 piezas)    · fin de bloque               · [Ir a Propuestas]
──────────────────────────────────────────────────────────────────────────
⚠ Gonzalo M. · molestia hombro derecho en el cuestionario · borrador: cambiar press militar por press en máquina · [Revisar ya]
```

Cada fila: atleta, qué (antes → después de `cambios`), el porqué en una línea (`paraDani`), y acciones: **Deshacer** (aplica `snapshotAntes`), **No vuelvas a hacer esto** (baja el nivel + instrucción fija), **Hablar con el atleta** (abre WhatsApp con el texto precargado, que es lo que Dani usa). Las señales actuales (sin publicar, sin entrar, bloque termina…) siguen debajo. El filtro por categoría gana `hecho`, `propuesto`, `escalado`.

### 5.2 Atleta — `ClientRevisionPanel` + Setup

Nueva sección en el panel de revisión, antes de «Lo que he cambiado»: **«Lo que ha hecho el asistente»**, una línea de tiempo por episodio (fecha, tipo, decisiones con antes → después, política, resultado del esperado ✓/✗/—), con la ficha viva al lado (ya está en `DossierPanel`) y un bloque «Plan inicial vs ahora» que reutiliza `calcularDerivas` sobre las propuestas del episodio `alta`. En Setup, cada ítem de la checklist enseña quién lo cerró (`autor`).

```
LO QUE HA HECHO EL ASISTENTE                              política: rodaje · 11 episodios
S1 06-10 alta        · mesociclo 12×4 · 3 dietas · menú · reto · ficha      propuesto → aprobado (Dani editó: glúteo 6→0)
S2 13-10 semana      · menú publicado · reto pasos                           automático   ✓ esperado: registro ≥ 5 días → 6
S2 15-10 cuestionario· respuesta enviada                                     automático   —
S3 20-10 semana      · +1 serie pecho/dorsal · menú                          automático
S3 22-10 dolor       · press militar → press en máquina                      escalado → Dani aplicó otra cosa (jalón)   ✗
S4 27-10 desvío peso · −150 kcal propuesto                                   propuesto → pendiente
```

### 5.3 Política — nueva pestaña en los ajustes del asistente

Tabla del §4.2 editable (global y por atleta), con la tasa de aprobación sin cambios y de deshacer por tipo (de `aiProposals` + derivas), el botón de subida propuesto por el rodaje, el presupuesto (mes/día, editable) con el gasto del mes por episodio y por atleta (de `aiAuditLog.episodioId`), y el modelo por episodio.

### 5.4 Calidad — «auditoría de 5 minutos»

Cada lunes, 5 decisiones automáticas de la semana al azar (`aiProposals` `aplicada` con `politica: 'automatico'`), con el expediente, los datos del motor que usó y el texto que llegó al atleta; Dani marca «bien» / «mal» / «no vuelvas». Vive en Propuestas como pestaña «Calidad»; `CoachProposalsScreen` gana además filtros «pendientes / aplicadas / rechazadas / sombra» (hoy solo pendientes).

---

## 6 · Lo que ve el atleta

- **Un canal:** la respuesta a su revisión (`questionnaireResponses.respuestaCoach`, ya existe con `RespuestaDelCoach.tsx`) y, para lo que no cae en revisión, un documento nuevo `mensajesCoach/{email}_{fecha}` que se enseña donde hoy están las «novedades» de la semana y la nota del día (`CoachDayNote`). Firma: **Dani**, sin más remitentes. Solo sale lo `paraCliente` de los titulares y lo que el episodio escribió en `paraAtleta`; en rodaje, todo texto al atleta es una propuesta.
- **Preguntas del expediente:** no se le hacen al atleta (decisión «todo a través de mí»): van a Dani como `coachClientTasks` con el texto listo para WhatsApp; la respuesta la apunta Dani en la ficha (`log_dossier_fact` desde la UI) y vuelve como evento `nota_libre`.
- **Transparencia:** una línea en el muro legal unificado («tu plan se ajusta cada semana con lo que registras; lo revisa Dani») — ver D1. No hay segundo consentimiento.

---

## 7 · Entrenamiento con CDG/IEM

- **Elegir en el alta:** regla determinista, no del modelo. **Reparto propio + plantillas de Dani** por defecto (es lo que usa en todos los mesociclos auditados); **CDG** cuando Dani lo marque en la plantilla elegida (`MesocycleTemplate.cdg: true`, campo nuevo) o la tipificación de la ficha (`tipificacion.freno ≤ 2` o `tiempo ≥ 4`) pida control fino de fatiga. En CDG el episodio fija `cdgObjetivosIem` por zona con `iemProgramadoPorZona` del mesociclo elegido y el tipo de bloque (`cdgModoPorZona`, velocidad `suave` para principiantes).
- **Semana nueva:** `proponerProgresionIem` con las agujetas semanales (`agujetasPorZona` del viernes), `contextoDeLaSemana` (sueño/estrés/motivación) y `propuestaZona` por zona → cambios por ejercicio (`aplicarOperaciones`, RIR mínimo 0). Política `aviso`; en rodaje, proponer. Primera semana tras parón: `vuelveDeParon` → «vigilar», no frenar.
- **Qué decide quién:** motor = series, IEM/IF objetivo, cargas (RM CDG), frecuencia, descarga; modelo = elegir entre ejercicios equivalentes (mismo patrón, mismo `cdgNombre` de familia, material disponible), orden de la sesión y redacción.
- **Doctrina en código (H10):** 8 series por grupo y sesión (`volumeSuggestion.SERIES_POR_SESION`, única constante), continuidad §15 (el episodio de bloque nuevo recibe el historial y debe declarar «qué cambio visible aporta»; validador exige al menos un ejercicio o esquema nuevo), §19 (no más días por sistema: `daysPerWeek` nunca sube sin que el alta lo diga; no planes cerrados de meses a un nuevo: primer bloque ≤ 12 semanas).
- **Tools nuevas (H20):** `get_cdg_semana` (IEM/IF programado y realizado por zona, agujetas, contexto), `propose_progresion_iem` (los cambios del motor, el modelo solo puede elegir entre alternativas que el motor marque), `get_alternativas_ejercicio` (mismo patrón, sin la articulación dolorida, con el material del atleta).

---

## 8 · Nutrición

- **kcal objetivo del motor:** Mifflin del alta hasta tener ≥ 4 semanas con ≥ 5 días registrados (`gastoReal.ts:35-37`); desde entonces `calcularGastoReal` manda y la fase se recalcula con `kcalParaObjetivo(gasto, tipo, peso)`. El cambio fórmula → real es un `aviso` (puede mover > 5 %).
- **Umbrales (los del motor):** `clasificarRitmo` fuera de rango **2 semanas seguidas** → `desvio_peso`; una semana → esperar. Adherencia por kcal < 70 % dos semanas → `desvio_adherencia` **antes** que tocar kcal (doctrina §12). Ajuste: `proponerAjuste` (paso 50, máximo 400, suelo 1.400); ≤ 5 % automático, 5-10 % aviso, > 10 % proponer.
- **Diet break / mantenimiento:** `semanasMantenimiento` con **+100 g HC fijos** (`gramosDeMantenimiento`); lo propone el episodio `revision` si `salidaDeDeficit` lo aconseja (≥ 8 semanas en déficit) y en la periodización ya planificada lo aplica el latido.
- **Menú:** sábado `generateWeek` con la dieta de la semana (`calendarioDeMenu`), gustos (`gustosDelAtleta`), extras exactos del catálogo (`extrasDelCatalogo`), `acotarExtrasDeComida` al guardar; borrador → publicado 24 h después si Dani no lo toca. El modelo no interviene salvo para la frase «esta semana comes…».
- **El asistente propone el objetivo, nunca coloca alimentos** (sigue). Validador: proteína 1,6-2,2 g/kg (aviso < 1,4, rechazo < 1,2), grasa ≥ 0,6 g/kg y ≥ 15 % kcal, déficit ≤ 700 kcal frente al gasto salvo fase `deficit_acelerado` abierta por Dani, suelo 1.400, superávit ≤ 500.

---

## 9 · Guardarraíles técnicos

1. **Validadores en servidor antes de escribir:** los de `validators.ts` + reglas de doctrina y clínica (H10) + «la kcal coincide con la opción del motor ±2 %».
2. **`acotarExtrasDeComida`** y tope 400 kcal/día al publicar menús desde servidor.
3. **Escrituras con Admin SDK** (no hay que abrir reglas) marcadas con `autor` y `episodioId`; `aiProposals.status: 'aplicada'` y `snapshotAntes` siempre; regla nueva solo para `episodios` (atleta `create` el suyo; lectura coach).
4. **Topes de coste:** por episodio (`alta/fin_de_bloque` 3 $, `revision` 1,5 $, resto 0,5 $) y diario/mensual del presupuesto de Dani; el consumidor comprueba `aiUsage/daily_*` (el mismo documento que `ai-chat.ts`) **antes** de cada ronda y para el episodio como `fallido: presupuesto`.
5. **Idempotencia:** ids deterministas de episodio y de propuesta (`{episodioId}_{kind}_{n}`); `WriteBatch` por entidad compuesta; publicar asignaciones por `workoutId_date` (ya).
6. **Reanudación:** estado y `historial` en el documento; `sanearHistorial` al retomar; tope 20 rondas.
7. **Auditoría:** `aiAuditLog` gana `episodioId`, `tipo`, `athleteAlias`; nada de correos en `episodios` de resumen (como `latidos`).
8. **Pruebas:** atletas sintéticos (`src/utils/cdg/__fixtures__` + fixtures nuevos por episodio en `src/autopiloto/__fixtures__`), tests puros de detectores/política/aplicador, test de integración del consumidor con Firestore en memoria (como `latido-diario.integracion.test.ts`), harness `/dev/autopiloto` que pinta Hecho hoy y la línea de tiempo con datos de fixture, y **modo sombra** real 2-3 semanas con 3 atletas.
9. **Consentimiento:** una sola puerta a la entrada del episodio (`puedeAnalizarseConIA(onboarding)`), y en `executeTool` para cualquier tool con `athlete_email` (H1). `consentimientoIA.ts` no se toca.
10. **Modelo por episodio:** Sonnet 5.5 para alta, revisión, fin de bloque, dolor y nota libre; Haiku 5.5 para redacción de semana nueva, respuesta rutinaria y acuses; `effort: 'low'` explícito; whitelist y precios actualizados (H22). Sin `thinking` explícito (Sonnet 5.5 rechaza `disabled`).

---

## 10 · Plan de tandas

PRs contra `main` de 1-2 días, con tests y resumen en `docs/`. Orden de menor a mayor riesgo; nada escribe en producción hasta la tanda 4 y solo en sombra hasta la 9.

| Tanda | PR | Qué entra | Hallazgos | Riesgo | Días |
|---|---|---|---|---|---|
| **1** | `autopiloto/1-deuda` | Puerta única de consentimiento en `executeTool`; `tools.ts` partido en `ai/tools/{definiciones,lectores,propuestas,despachador}.ts` sin cambiar comportamiento (test de regresión: mismo `TOOL_DEFINITIONS` byte a byte); default 12 semanas y derivas en el brief de las tres tareas; doctrina §7 a 1,6-2,2 y validador g/kg + grasa + techo de déficit; whitelist/precios Sonnet 5.5 y Haiku 5.5 | H1 H2 H15 H24 H22 H10(parte) | Bajo | 2 |
| **2** | `autopiloto/2-propuestas-v2` | `AiProposal` v2 (snapshot, política, autor, episodio, aplicada/deshecha, resultado); `aplicarPropuesta()` puro con tests y el hook usándolo; `deshacer()`; ficha viva por episodio y `cambiosAtleta` con autor; **Hecho hoy** en la bandeja con las acciones del latido (que pasa a dejar propuestas `autor: 'latido'`) | H3 H4 H5 H21 | Bajo-medio (toca el hook) | 2 |
| **3** | `autopiloto/3-servidor-sombra` | `api/_lib/lector.ts` (lecturas del brief con Admin SDK), `api/_lib/agente.ts` (bucle reanudable), `episodios` + detectores, `api/autopiloto.ts` con `?seco=1`, `alertasDeRespuesta` en servidor, tool `propose_respuesta_revision`; episodio **cuestionario_recibido en sombra** con 3 atletas | H6 H7 H8 H9 H23 | Medio (infra nueva, cero escrituras) | 2 |
| **4** | `autopiloto/4-politica-semana` | `politicaAutonomia.ts` + rodaje + pantalla Política; episodio **semana_nueva** (menú sábado/domingo, reto, progresión) en rodaje; presupuesto editable; topes por episodio | H11 H12 | Medio (primeras escrituras automáticas: menú) | 2 |
| **5** | `autopiloto/5-alta-revision` | Episodios **alta_completada** (con continuación tras aprobar) y **revision**; cierre del `esperado`; tools CDG | H13 H14 H20 | Alto (plan entero) | 2 |
| **6** | `autopiloto/6-emergentes` | dolor, perdidas, peso_sin_registrar, desvio_peso, desvio_adherencia, nota_libre, bienestar | H16 | Alto (clínica) | 2 |
| **7** | `autopiloto/7-cierre` | fin_de_bloque y renovación (humano) | H17 | Medio | 1 |
| **8** | `autopiloto/8-supervision-atleta` | Línea de tiempo por atleta, Calidad, filtros en Propuestas, `mensajesCoach`, muro legal unificado (con el texto que decida Dani, D1) | H18 H19 | Medio | 2 |
| **9** | `autopiloto/9-qa` | 3 atletas reales en sombra 2 semanas → informe de coincidencia → paso a `aviso` por tipos con Dani | H25 | — | 1 + 2 semanas de reloj |

Cada tanda: `tsc`, `vitest`, `npm run test:reglas` si toca reglas, informe `docs/autopiloto-tanda-N.md`, memoria. Reglas de Firestore: diff contra producción antes de desplegar (solo la tanda 3 añade `episodios`).

---

## 11 · Discrepancias y riesgos que digo en voz alta

1. **«Supervisar todo» y «autopiloto» tiran en direcciones opuestas.** Lo resuelvo con rodaje global + Hecho hoy: Dani ve todo sin aprobar todo. Si aprueba todo, el coste humano no baja; la subida por tipo (§4.3) es lo que lo convierte en autopiloto, y la propone la pantalla, no la máquina.
2. **Consentimiento «obligatorio»** (§0): riesgo legal real; recomiendo casilla específica dentro del muro único.
3. **Vercel:** sin cron frecuente, los emergentes dependen del disparo desde el cliente del atleta (D2).
4. **El modelo y el texto libre:** `nota_libre` es la única pieza donde el modelo decide la clase de un texto del atleta; por eso su salida siempre es `aviso` o tarea, nunca `automatico`, y el texto se trata como dato (regla 8 del prompt).
5. **Calidad medida en C:** hasta que la tanda 1 corrija defaults y doctrina, no tiene sentido medir la sombra: la tasa de coincidencia saldría baja por fallos ya conocidos.
6. **Un solo coach:** `COACH_EMAIL` fijo en servidor y en reglas; el diseño no abre nada a terceros.
