# Estado del proyecto — traspaso por cambio de cuenta

Fecha: 2026-09-03. Hecho para que, al migrar de cuenta, no se pierda nada de lo que
está a medias. Todo lo que hay aquí sale del repo `~/en-forma` y de la memoria de
trabajo (`~/.claude/projects/-Users-dani-Desktop-App-enforma/memory/`).

---

## 0. Lo primero que hay que saber

| Cosa | Estado |
|---|---|
| Rama activa | `nutricion-registro-diario` (es donde está TODO el trabajo vivo) |
| `origin/main` | `de070cf` — al día, en producción |
| `main` local | `0d60b2e` — **atrasado**, hay que hacer `git checkout main && git pull` |
| Cambios sin commitear | **95 archivos** (54 modificados, 41 nuevos sin seguimiento) |
| Reglas de Firestore | Modificadas y **SIN desplegar** (a propósito) |
| Binario iOS | La última build enviada a Apple es la 1.0 (5) |

> ⚠️ Nada de lo que hay sin commitear está respaldado en ningún sitio salvo este disco.
> Antes de tocar la cuenta: commitear a la rama o, como mínimo, copiar el repo entero.

---

## ⛔ CONGELACIÓN — hasta ~2026-09-13

La app está **en revisión en Play Store**. Decisión de Dani (2026-09-03):
**no se sube nada durante ~10 días**. Se sigue trabajando en local con normalidad.

**No se toca:**
- Binarios (ni Play ni App Store).
- `firestore.rules` — llegan al instante a los binarios ya instalados.
- Índice de `cardioSessions`.
- Deploy a Vercel.
- Migración de Play Console (no se puede con una revisión en curso).

**Sí se puede, no afecta a usuarios:**
- Commits en local (`git commit`). No llega a nadie y es lo único que protege los 95
  archivos que ahora mismo solo existen en este disco.
- Firebase: añadir la cuenta nueva como **Propietario (Owner)** en IAM del proyecto
  `fleet-operator-z5xj8` y vincular la facturación nueva **antes** de soltar la vieja.
  Mismo proyecto, mismo id, mismo binario: los usuarios no se enteran.
  **NUNCA crear un proyecto de Firebase nuevo**: el id va compilado dentro del binario
  (`ios/App/App/public/assets/index-*.js` y el equivalente de Android), así que las
  instalaciones existentes y la build en revisión seguirían apuntando al viejo.

**Cuando Play apruebe, en este orden:**
1. Sale el binario nuevo.
2. Luego, y solo luego, se despliegan las reglas de Firestore y el índice.
3. Después, la transferencia de Play Console.


---

## 1. Trabajo SIN COMMITEAR (lo que se pierde si se borra el disco)

Son 95 archivos acumulados de varias tandas que nunca se cerraron. Por bloques:

### 1.1 Registro diario de nutrición (el bloque grande)
Ficheros: `src/hooks/useDiaActual.ts`, `src/utils/diaDeDieta.ts`, `src/utils/filasDelPlan.ts`,
`src/utils/cupoDeRecetas.test.ts`, `src/db/recetasHidratacion.ts`, `NutritionScreen.tsx`,
`ClientDietsPanel.tsx`, `RecipesScreen.tsx`, `RecipeBuilderScreen.tsx`, `WeeklyMenuEditor.tsx`,
`nutrition/MealItemSwipeRow.tsx`, `nutrition/dietHelpers.ts`.

- El día se guarda en su propio documento, con fecha **local** (no UTC).
- Fuera la dieta del coach del lado atleta; historial editable; marcado automático sin tachado.
- Receta = una fila. Recetas privadas por dueño. 673 «no-platos» fuera de principales.
- Fila de alimento reescrita: sin botones, deslizar derecha = comido / izquierda = quitar.
- Tests verdes en su momento (~1.202). **Reglas de Firestore de esto SIN desplegar.**

### 1.2 CRM — archivar, borrar y cobros futuros
Ficheros: `src/features/crm/**` (hooks, modales, tablas, tipos, rutas),
`src/features/crm/lib/archivado.ts` + test, `src/db/crm.ts`, `api/delete-account.ts`,
`src/db/borradoCuenta.test.ts`, `docs/crm-servicios-pagos-renovaciones.md`.

- Archivado de clientes con filtro «Archivados».
- Borrado en cascada acotado a contactos sin cuenta y perfiles anonimizados.
- Borrar suscripciones y su primer cobro aunque sea futuro.
- El borrado de cuenta ya no deja perfiles «borrado_xxxx».
- 1.255 tests verdes. **Reglas SIN desplegar.**

### 1.3 Sesión en vivo / widget de bloqueo (nativo)
Nuevos: `ios/App/App/SesionEnVivoPlugin.swift`, `ios/App/RestTimerWidget/EnFormaBuzon.swift`,
`SesionEnVivoIntents.swift`, `RestTimerWidget.entitlements`,
`android/.../SesionEnVivoPlugin.kt`, `SesionEnVivoService.kt`, `SesionEnVivoBuzon.kt`,
layouts y drawables `ef_*`, `src/services/sesionEnVivo.ts`.
Borrados: `RestTimerPlugin.kt`, `RestTimerService.kt`, `LiveActivityPlugin.swift`,
`src/services/restTimer.ts`.

- Sustituye el temporizador viejo por una «sesión en vivo» en pantalla de bloqueo.
- **Sin compilar ni probar en dispositivo.** Necesita Xcode / JDK.

### 1.4 Cardio y varios
`cardioLiveActivity.ts`, `CardioSessionPlugin.kt`, `CardioSessionService.kt`, `haptics.ts`,
`sesionEnCurso.ts` + test, `WorkoutSessionPlayer.tsx`, `TrainingScreen.tsx`, `HomeScreen.tsx`,
`ui/Pager.tsx`, `athleteMetrics.ts`, `nutritionAnalysis.ts`, `nutritionPeriodization.ts`,
`recipeMatch.ts`, `reportExtras.ts`, `roadmapCalendar.ts`, `dbService.ts`, `types.ts`.

### 1.5 Configuración de Claude (`.claude/`)
Todo el directorio está sin seguimiento: `agents/`, `skills/`, `commands/`, `rules/`,
`scripts/`, `settings.json`, `marketplace.json`, `mcp-configs/`, `plugin.json`.
**Esto es lo más fácil de perder al migrar de cuenta y no está en git.**

---

## 2. Pendiente de DESPLEGAR

1. **Reglas de Firestore** (`firestore.rules`, +27 −2): cubren nutrición diaria y CRM.
   Ojo con el orden: las reglas llegan **al instante** a los binarios ya instalados, así
   que se despliegan **después** de que salga el binario nuevo, nunca antes.
2. **Índice de `cardioSessions`** (motor de retos v2) — nunca se desplegó.
3. **App Check**: activo en modo *no aplicado*. Falta pulsar «Enforce» tras ver métricas limpias.

---

## 3. Pendiente en las tiendas / binario

- La web va **dentro** del binario (sin `server.url`): un cambio en `src/` solo llega al
  móvil con una build nueva. Manual completo en `docs/publicar-actualizaciones.md`.
- No se le pueden meter cambios a una build que ya está en revisión.
- Live updates: pendiente de decidir.
- Build 1.0 (5) enviada a Apple con la respuesta al rechazo 1.4.1 (citas médicas) en Notas.
- El proyecto iOS sincroniza (`sync:native`) y compila; falta el Archive + subida en Xcode.

---

## 4. Aparcado por decisión tuya

- **Animación de cambio de ejercicio**: implementada entera y pasando tsc/eslint/tests/build,
  pero con fallos en QA visual. Dijiste «está lleno de bugs, lo dejamos, no tocamos nada».
  Handoff en `~/Downloads/design_handoff_cambio_ejercicio`; prototipo aprobado en el artifact
  `8c1482c3`. El código NO está commiteado.
- **Rebranding fase 3**: bloques 1–4 hechos, bloque 5 (Nutrición) parcial (falta el lado
  coach), 6–9 sin empezar. Plan en `~/.claude/plans/swirling-inventing-journal.md`.
- **Revisión pre-App-Store/Play**: sistema construido en `~/en-forma` (maestro + 7 prompts +
  workflow), sin ejecutar y sin commitear.

---

## 5. Pendiente de QA tuyo (código ya en producción)

- Mesociclos: nombre, asignación y orden (en producción, sin QA).
- Roadmap → Calendario del coach (desplegado, falta QA visual).
- Doctrina IA editable + ficha viva del atleta + fase 3 (en producción). **Tienes que
  RE-PEGAR los prompts a mano: tu copia no se actualiza sola.**
- Muro legal / consentimientos (en producción; falta el binario iOS).
- Asistente IA del coach: falta QA + sincronizar la bóveda.
- Programación de entrenos + cierre de mesociclo.
- Catálogo de máquinas: QA con sesión de **atleta**, no de coach.

---

## 6. Cosas que hay que recordar sí o sí al migrar

- **Métrica de cuota de Firestore**: usar `document/read_count`, NUNCA
  `api/billable_realtime_read_units` (da casi cero en tramo gratuito y engaña).
- La base de Firestore está en el grupo «AI shared quota» de AI Studio (50.000 u/día, y al
  tocarlo **pausa** la base). Se arregla con «Upgrade database» en la consola; vincular Blaze
  no basta.
- Cualquier escritor de servidor nuevo debe marcar el sello de versión de catálogos.
- Nunca barrer colecciones enteras: usar consulta de frontera (`orderBy` + `limit(1)`).
- Fotos del recetario: el bucket bueno es `storage.getindya.com` (el viejo `storage.get.com` da 404).
- `workoutAssignments` está migrado a email; queda soltar la rama del uid cuando no queden
  bundles nativos viejos.
- Alta de atletas: va por servidor (`/api/create-athlete` + correo de reset). Solo necesita
  «Correo/contraseña» habilitado (confirmado ON). `docs/QA-pendiente-dani.md` §1 está anticuado.

---

## 7. Checklist de migración de cuenta

- [ ] `git add -A && git commit` en `nutricion-registro-diario` (o copia completa del repo).
- [ ] Pushear la rama a `origin` para que no viva solo en este disco.
- [ ] Copiar `~/en-forma/.claude/` (no está en git).
- [ ] Copiar `~/.claude/projects/-Users-dani-Desktop-App-enforma/memory/` (esta memoria).
- [ ] Copiar `~/.claude/plans/` (planes vivos del rebranding y del asistente).
- [ ] Copiar `~/Downloads/design_handoff_cambio_ejercicio`.
- [ ] Copiar la bóveda de Obsidian (ATLAS, transcripciones, prompt maestro de entrenos).
- [ ] Reconectar en la cuenta nueva: Firebase, Vercel, Apple Developer, Google Play, Sentry.
- [ ] Volver a hacer `/login` en el CLI `claude` (el panel de ATLAS depende de eso).
