# Plan maestro — TrainingLab · Cardio · Tests de FC · Widget de bloqueo

> **Documento de handoff autocontenido.** Pensado para pegarse en una conversación nueva con un agente que no tiene contexto previo. Fecha: 2026-07-21.

---

## 0. Contexto para el agente (leer primero)

- **App:** `en-forma`, en `/Users/dani/en-forma`. Coaching fitness (atleta + coach).
- **Stack:** React 19 + Vite + TypeScript + Tailwind v4 + Firebase (Firestore + Storage) + TanStack Query. Desplegado en **Vercel**. Es una **PWA** (`public/manifest.json`, `display: standalone`).
- **Estado clave del código existente que se reutiliza:**
  - `src/App.tsx`: routing con react-router; `ATHLETE_TABS` y `COACH_TABS` definen la navegación.
  - `src/components/TrainingScreen.tsx`: ya **registra series** (peso / reps / RIR / done) y los ejercicios ya tienen `restSeconds` y `videoUrl`. El "modo sesión en vivo" del widget se construye encima de esto.
  - `src/types.ts`: perfil de atleta con `birthDate` (→ edad), `createdAt` (→ días en la app para el drip). `ResourceKind` incluye `'video'`.
  - `src/dbService.ts`: capa de acceso a Firestore (lecturas/escrituras que absorben errores y caen a local; **no** añadir toasts de error redundantes por pantalla en lecturas).
  - Firebase Storage disponible (`src/firebase.ts`).
- **Cómo arrancar:** `npm run dev` (Vite, puerto 3000). `npm run lint` = `tsc --noEmit`. `npm test` = vitest.
- **Regla de trabajo:** no iniciar acciones destructivas/deploy sin OK. La web/PWA en Vercel debe seguir viva; lo nativo es una capa encima.

### Decisiones ya cerradas con el dueño (Dani)
1. **Plataforma:** envolver en **nativo con Capacitor** (no PWA pura). Habilita BLE en iPhone, Live Activity y notificación persistente.
2. **Fuente de FC:** **banda de pecho/brazo BLE** (Polar H10, Coospo, Wahoo, Garmin HRM…) por el Heart Rate Service estándar. No Apple Watch.
3. **Vídeos de la academia:** **YouTube/Vimeo no listados** (embed, sin coste de storage).
4. **Academia:** **cursos > lecciones con progreso** + **desbloqueo progresivo (drip)** por nivel del atleta o días desde `createdAt`.

---

## 1. Resumen ejecutivo

Cuatro módulos sobre una base nativa común:

1. **TrainingLab** — academia de vídeo (entrenamiento, nutrición, fisiología, biomecánica…) con cursos, progreso por atleta y desbloqueo progresivo. *No necesita nativo: funciona en web.*
2. **Cardio** — zonas de FC individualizadas (Zona 2 el protagonista), **dashboard de pulsaciones en directo** por BLE, sesiones guiadas y análisis de tiempo-en-zona. *Necesita la capa BLE nativa para iPhone.*
3. **Tests de FC** — batería de **tests de campo guiados** que la banda graba y la app auto-calcula, para determinar FCmax, umbrales y zonas **de verdad** (no estimadas). *Vive dentro de Cardio.*
4. **Widget de pantalla de bloqueo** — durante el entreno de fuerza: ejercicio, serie X/Y y **cuenta atrás del descanso** en la pantalla de bloqueo, con botones rápidos. *Live Activity en iOS + notificación persistente en Android.*

Transversal: un **sistema de nivel/XP** (entrenos + cardio + lecciones + check-ins) que alimenta el drip de la academia y gamifica la experiencia.

### Por qué Capacitor
La app hoy es una PWA web pura y una web **no puede** leer el pulsómetro en vivo en iPhone (Apple bloquea Web Bluetooth) ni pintar un widget real de pantalla de bloqueo. **Capacitor** envuelve el mismo código React en una app nativa iOS+Android (WebView) y da BLE nativo, Live Activities, notificaciones persistentes y hápticos, **sin reescribir la app**. Un solo código; en navegador degrada con elegancia.

### Coste / overhead a asumir
- Apple Developer Program: **99 $/año** · Google Play: **25 $** pago único.
- Xcode (Mac ✓) + Android Studio · revisión en stores en cada envío.
- Firestore: series de FC **submuestreadas** para no disparar la cuota (§7.4).

---

## 2. Fundación nativa (Capacitor) — *prerrequisito de Cardio y Widget*

**Objetivo:** que el mismo `en-forma` arranque como app nativa en iPhone y Android, con Firebase dentro, y BLE + hápticos operativos.

- Instalar `@capacitor/core`, `/cli`, `/ios`, `/android`.
- `capacitor.config.ts`: `appId` (ej. `com.danielenforma.app`), `appName "En Forma"`, `webDir: "dist"`.
- Router compatible con WebView; revisar rutas absolutas / `start_url`.
- Generar `ios/` y `android/`; iconos/splash desde el logo Atlas existente.
- Plugins base: `@capacitor/haptics`, `@capacitor/local-notifications`, `@capacitor-community/bluetooth-le`.
- `Capacitor.isNativePlatform()` para elegir implementación nativa o degradación web por feature.

**Entregable:** apps que compilan en dispositivo real, login Firebase OK dentro, prueba BLE mostrando BPM.

---

## 3. TrainingLab (academia)

### 3.1 Concepto
Cursos temáticos → lecciones en vídeo ordenadas → el atleta marca completado y avanza. Contenido "drip": se revela según **nivel** o **días en la app**.

### 3.2 Modelo de datos (Firestore)
```
academyCourses/{courseId}
  title, description, category, coverImageUrl, order,
  published (bool), unlockRule, lessonCount

academyLessons/{lessonId}
  courseId, title, description, order,
  videoProvider: 'youtube'|'vimeo', videoId, durationSec,
  resources: [{ kind:'pdf'|'link', title, url }],
  unlockRule?

academyProgress/{athleteId}
  completed: { [lessonId]: ISOdate },
  courseProgress: { [courseId]: number },   // 0..100
  lastLessonId, lastCourseId                 // "continuar donde lo dejaste"
```
Categorías: `entrenamiento · nutricion · fisiologia · biomecanica · mentalidad · recuperacion`.

### 3.3 Reproductor
`iframe` de YouTube/Vimeo (no listados). Al 90% de reproducción o botón "Marcar completada" → se registra progreso y suma XP (§8).

### 3.4 Acceso + desbloqueo progresivo (modelo de DOS capas)
> El dueño quiere **elegir a mano a qué atletas se les desbloquea la academia**. Por eso hay dos capas:

**Capa 1 — Entitlement por atleta (la llave maestra, la decide el coach).**
```
academyAccess/{athleteId}
  enabled: bool,
  grantedCourses?: courseId[],   // opcional: acceso granular a cursos sueltos
  grantedBy, grantedAt
```
- Sin `enabled`, el atleta **ni ve la pestaña Academia**. Es el interruptor "quién entra".
- Sigue el **mismo patrón de asignación por `athleteId`** que ya usa la app (WorkoutAssignment, QuestionnaireAssignment, PhotoAssignment). No es una estructura nueva paralela.

**Capa 2 — Drip encima (solo para quien ya tiene acceso).**
`unlockRule` por curso o lección, evaluada en cliente:
```
{ type:'immediate' }
{ type:'daysSinceJoin', value:14 }      // 14 días desde createdAt
{ type:'level', value:4 }               // nivel ≥ 4
{ type:'prerequisite', value:courseId } // completar antes otro
```
- Los bloqueados se ven **difuminados** con el motivo: *"Se desbloquea en 3 días"* / *"Nivel 4 (te faltan 120 XP)"* / *"Completa antes 'Fundamentos'"*.
- El coach puede **forzar** desbloqueo o adelantar cursos por atleta (override).

Así combinas *"elijo a quién"* (capa 1) con *"se le va revelando"* (capa 2). UI en §13.

### 3.5 Pantallas
- **Atleta — `AcademyScreen`** (nueva pestaña "Academia"): rejilla por categoría, progreso, "Continuar", bloqueados con pista. Detalle curso → lecciones → reproductor + siguiente.
- **Coach — `AcademyCoachScreen`**: CRUD cursos/lecciones, orden (drag), categoría, reglas de desbloqueo, publicar, panel de progreso por atleta.

---

## 4. Cardio (zonas + FC en directo)

### 4.1 Modelo de zonas
Por atleta (`athleteCardioProfile`): `restingHR`, `maxHR`, `lthr` (umbral, §5), método (`hrr`/`hrmax`/`lthr`) y las bandas en BPM.

**Modelo por defecto de 5 zonas (Karvonen / %HRR):**
| Zona | Nombre | %HRR | Uso |
|---|---|---|---|
| Z1 | Recuperación | 50–60% | Calentar / soltar |
| **Z2** | **Base aeróbica / oxidación grasa** | **60–70%** | **Objetivo del módulo** |
| Z3 | Tempo | 70–80% | Aeróbico medio |
| Z4 | Umbral | 80–90% | Umbral láctico |
| Z5 | VO₂máx | 90–100% | Máximo esfuerzo |

Cuando el atleta ha hecho el test de umbral (§5), se pasa a un **modelo anclado en LTHR** (más preciso, ver §5.6). El coach puede **ajustar la banda Z2** por atleta.

### 4.2 Dashboard en directo (BLE)
- Conexión por **Heart Rate Service** (`0x180D`, característica Heart Rate Measurement `0x2A37` en *notify*) vía `@capacitor-community/bluetooth-le`. Funciona en iOS y Android por la capa nativa.
- Pantalla en vivo: **BPM grande** + zona con color, gauge de zona, **gráfica en tiempo real** (recharts), **tiempo acumulado por zona**, adherencia al objetivo (*"18:32 en Z2 / objetivo 40:00"*), y **aviso háptico + sonoro al salirse de la zona objetivo** (clave en Z2).
- Tipos de sesión: **libre**, **Sesión Zona 2** (duración + zona objetivo, guiada), **intervalos** (bloques trabajo/descanso por zonas).

### 4.3 Prescripción y revisión (coach)
- Coach prescribe cardio como los entrenos: *"3×/sem Z2, 45 min"* → `cardioAssignments`.
- Coach revisa tendencias: minutos en Z2/semana, adherencia, evolución de FC reposo/umbral.

---

## 5. Tests de FC — determinar FCmax, umbrales y zonas DE VERDAD

> Respuesta a "¿es viable determinar la FCmax real y cuál es la mejor forma?": **sí, con tests de campo guiados + la banda.** Pero para entrenar por zonas lo más útil **no es solo la FCmax** — es anclar en **dos umbrales**. La app guía cada test, la banda graba, y la app **auto-calcula** los anclajes y **escribe las zonas** en el perfil (el coach revisa/aprueba).

### 5.1 Qué queremos determinar
- **FC reposo** — para Karvonen/%HRR.
- **FCmax** — máximo real (no estimado por fórmula).
- **Umbral aeróbico (VT1/LT1) ≈ techo de Zona 2** — el dato clave para la base aeróbica.
- **Umbral anaeróbico (LTHR/FTHR)** — el anclaje más reproducible para zonas altas.

### 5.2 Batería de tests (biblioteca guiada en la app)

**Test 0 — FC en reposo** · *riesgo nulo, continuo.*
- Tumbado al despertar, banda puesta, 2–3 min; la app toma el valor mínimo estable. Se puede repetir a menudo (buen marcador de recuperación/sobrecarga).

**Test 1 — Talk test / MAF (techo de Z2 provisional)** · *riesgo bajo, hacer el primero.*
- Esfuerzo estable en el que aún puedes hablar frases completas cómodamente → proxy de VT1.
- Alternativa de anclaje: **MAF = 180 − edad**, ajustado ±5–10 según condición/enfermedad/medicación.
- Fija una Z2 conservadora inicial sin esfuerzo máximo.

**Test 2 — 30 min contrarreloj → LTHR** · *el más útil y reproducible. Esfuerzo alto.*
- Calentar 10–15 min. Luego **30 min a máximo sostenible en solitario** (correr/bici/remo, en la modalidad que va a entrenar).
- **Media de FC de los últimos 20 min = LTHR (umbral).** (Variante corta: 20 min TT → LTHR ≈ 95% de la media.)
- La app cronometra, marca el arranque del tramo que cuenta, graba la FC y calcula el LTHR automáticamente.

**Test 3 — Rampa a FCmax** · *opcional, esfuerzo máximo, mayor riesgo → solo tras cribado (§9).*
- Calentar bien. Rampa progresiva (idealmente en cuesta o cinta inclinada), 2–3 min subiendo intensidad hasta no poder + 30 s de sprint final. **La FC más alta registrada ≈ FCmax.**
- Nota: la FCmax varía por modalidad (correr > bici ~5–10 bpm); testar en la modalidad de entreno.
- A menudo la FCmax también aparece en el pico del Test 2, así que este test puede ser secundario.

**Test 4 — Validación de Z2 (desacople / decoupling)** · *riesgo bajo, confirma la Z2.*
- 60 min a ritmo fijo dentro de la Z2 estimada. Si la **FC deriva >5%** respecto al ritmo/potencia (o la FC sube sola manteniendo el ritmo), ibas **por encima** del umbral aeróbico → bajar el techo de Z2. Mejor con footpod/potenciómetro, pero orientativo solo con FC + ritmo.

### 5.3 Estrategia recomendada de zonas (la "mejor forma")
Modelo **anclado en umbrales**, más individual que %FCmax:
1. **LTHR** (Test 2) → define Z3/Z4/Z5 con precisión (modelo tipo Friel basado en umbral).
2. **Techo de Z2** (Test 1 + validado con Test 4) → fija la base aeróbica.
3. **FCmax + FC reposo** (Test 3 / pico del Test 2) → respaldo Karvonen y cálculo de %HRR.

Karvonen con FCmax real + FC reposo es el **fallback** mientras el atleta no haya hecho el TT de umbral.

### 5.4 Recalibración
- **Retest cada 8–12 semanas** o al cerrar un bloque. La app lo recuerda.
- **Auto-detección:** si en sesiones normales la FC supera con regularidad la FCmax registrada, o el umbral deriva, la app **sugiere recalibrar**. Misma FC a mayor ritmo = más en forma (feedback motivador).

### 5.5 Modelo de datos
```
hrTests/{id}
  athleteId, type:'resting'|'talktest'|'tt30'|'maxramp'|'decoupling',
  date, durationSec,
  result: { restingHR? , maxHR? , lthr? , z2Ceiling? , decouplingPct? },
  samples: number[]  // FC submuestreada 1/3-5s
  approvedByCoach: bool, notes
```
Los resultados aprobados escriben `athleteCardioProfile` (zonas). Historial de tests = progreso de forma física a lo largo del tiempo.

### 5.6 Fórmulas de referencia (implementación)
- Tanaka FCmax estimada: `208 − 0.7·edad` (solo como valor inicial hasta test).
- Karvonen: `FCobjetivo = FCreposo + %·(FCmax − FCreposo)`.
- Zonas Friel por LTHR (correr, ejemplo): Z1 <85% LTHR · Z2 85–89% · Z3 90–94% · Z4 95–99% · Z5a 100–102% · Z5b 103–106% · Z5c >106%. (Cortes distintos para bici/remo.)
- MAF: `180 − edad` ± ajuste.

---

## 6. Widget de pantalla de bloqueo + registro en vivo

### 6.1 Qué es realista (expectativas claras)
- **iOS — Live Activity (ActivityKit):** vive en **pantalla de bloqueo + Dynamic Island** durante el entreno. Muestra ejercicio actual, serie X/Y, reps/peso objetivo y **cuenta atrás del descanso** animada. iOS 17+ permite **botones interactivos** (App Intents): *"✓ serie hecha"*, *"+30 s"*, *"saltar descanso"*. Requiere una pequeña extensión **Swift**.
- **Android — servicio en primer plano + notificación persistente** con botones de acción (mismo contenido). Opcional: widget de pantalla de inicio. Requiere algo de Kotlin/plugin.
- **NO realista:** teclear peso/reps numéricos completos desde la pantalla de bloqueo → eso se hace en la app; el widget muestra lo prescrito y permite **confirmar/ajustar con acciones rápidas**.

### 6.2 Backbone: temporizador de descanso robusto
- El registro de series ya existe en `TrainingScreen` (peso/reps/RIR/done, `restSeconds`). Se añade **"modo sesión en vivo"**:
  - Marcar serie hecha → **arranca descanso** automático.
  - Cuenta atrás **segura en segundo plano** (sigue con pantalla bloqueada) vía Live Activity (iOS) / foreground service (Android).
  - **Sonido + háptico** al llegar a 0.
- El widget refleja ese temporizador.

### 6.3 Puente nativo
- iOS: plugin Capacitor para ActivityKit (comunitario tipo `capacitor-live-activities`, o extensión Swift mínima propia).
- Android: notificación persistente con layout y acciones (plugin propio o `local-notifications` + foreground service).
- React envía updates (ejercicio, serie, segundos) al widget vía el plugin.

---

## 7. Sistema de nivel / XP (transversal)

```
athleteProgression/{athleteId}
  xp:number, level:number,
  sources:{ workouts, cardio, lessons, checkins, streak }
```
- **XP** por: lección completada, entreno registrado, sesión de cardio, check-in, racha, **tests de FC completados**.
- **Nivel** = f(XP) (curva creciente). Alimenta las `unlockRule` de tipo `level`.
- El coach puede **conceder XP/nivel** manualmente (override).
- Barra de nivel visible en Home/Roadmap del atleta.

### 7.4 Protección de Firestore
Nunca guardar FC cruda por segundo. **Submuestrear a 1 cada 3–5 s** (60 min ≈ 720–1200 números ≈ pocos KB). Si hace falta detalle fino: resumen en el doc + array detallado en Storage. Límite de doc Firestore = 1 MB.

---

## 8. Mejoras sugeridas (para atleta y para coach)

1. **Readiness / HRV matinal** — con bandas que dan intervalos RR (Polar H10), medir HRV al despertar → **score de recuperación** diario. Ajusta el objetivo de Z2 del día y avisa de sobreentrenamiento. Gran valor para el coach.
2. **Recalibración automática de zonas** (§5.4) — la app propone retest cuando detecta cambios de forma.
3. **Flujo test → revisión del coach** — que replique el patrón de check-ins/reportes ya existente: el atleta hace el test, el coach aprueba las zonas. Coherencia con la UX actual.
4. **Prescripción de cardio ligada al plan** — que el coach vea el cumplimiento de Z2 junto al resto del programa (una vista, no islas).
5. **Academia ligada al nivel real de entreno** — desbloquear "Fisiología del umbral" cuando el atleta hace su primer test de umbral, etc. (drip por hitos, no solo por tiempo).
6. **Fuente de FC alternativa en F4** — para atletas que solo tengan Apple Watch/Garmin: **import post-sesión** (Apple Health/Strava/Garmin Connect) como respaldo del BLE en vivo (ya había intención previa de integrar Apple Health para pasos).
7. **Exportar sesión de cardio** al informe del coach y al histórico (tendencia de minutos en Z2, FC reposo, umbral).

---

## 9. Seguridad (tests de esfuerzo) — obligatorio
Los tests 2 y 3 son de esfuerzo alto/máximo. Antes de habilitarlos:
- **Cuestionario PAR-Q** de aptitud + recomendación de **valoración médica** para mayores o con factores de riesgo.
- **Reglas de parada** visibles: dolor torácico, mareo, disnea desproporcionada → detener.
- La app da **protocolos estándar**, no consejo médico individualizado.

---

## 10. Fases de entrega

| Fase | Contenido | Depende de | Valor |
|---|---|---|---|
| **F0** | Fundación Capacitor (§2) | — | Desbloquea iOS BLE + widget |
| **F1** | TrainingLab (§3) + base nivel/XP (§7) | — (web) | Valor formativo ya |
| **F2** | Cardio: zonas + BLE en vivo + tests de FC (§4, §5) | F0 | El diferenciador de rendimiento |
| **F3** | Widget/Live Activity + descanso en vivo (§6) | F0 | Experiencia "pro" de entreno |
| **F4** | Pulido: gamificación, readiness/HRV, import Apple Health, analíticas coach (§8) | F0–F3 | Redondeo |

**F1 puede ir en paralelo a F0** (no necesita nativo). F0 de-riesga lo demás.

---

## 11. Modelo de datos consolidado (colecciones nuevas)
```
academyCourses, academyLessons, academyProgress, academyAccess   // TrainingLab (academyAccess = quién tiene acceso)
athleteCardioProfile, cardioAssignments, cardioSessions  // Cardio
hrTests                                                   // Tests de FC
athleteProgression                                        // Nivel/XP
```
Reutiliza: perfil (`birthDate`, `createdAt`), `TrainingScreen`/`restSeconds` (widget), `ResourceKind`, patrón coach de CRUD y de revisión de check-ins.

---

## 12. Primer paso propuesto
Arrancar **F1 (TrainingLab)** ya (todo en `src/`, reversible, sin nativo) y en paralelo montar **F0 (Capacitor)**. Al cerrar F0 → F2 (Cardio + tests) → F3 (Widget). Confirmar antes de tocar la infraestructura nativa (crea `ios/` y `android/`).

---

## 13. Integración con la app existente (NO son islas)

Los módulos nuevos se enganchan a patrones que YA existen. Ficheros/estructuras reales a reutilizar:

| Nuevo | Se engancha a | Cómo |
|---|---|---|
| **Elegir a quién / acceso** | Patrón de asignación por `athleteId` (WorkoutAssignment, QuestionnaireAssignment, PhotoAssignment, DayAssignment) | `academyAccess`/`cardioAssignments` targetean `athleteId` (email) igual que el resto. Nada nuevo conceptualmente. |
| **TrainingLab** | `Resource` + `ResourcesPanel.tsx` + `useResourceCache` (ya hay recursos con `kind:'video'`, `url`) | La academia es la evolución **estructurada** de Resources: cursos/lecciones con orden, progreso y gating. Reutilizar patrones de CRUD y visor. |
| **Gestión coach por atleta** | `ClientHub.tsx` — pestañas por zonas (`hoy`/`plan`/`analisis`): setup, revisiones, entrenamientos, dietas, roadmap, análisis (`TAB_META`, `ZONE_TABS`) | Añadir pestañas **"Academia"** y **"Cardio"** en la zona `plan`. Ahí el coach da acceso y prescribe. |
| **Acceso academia (UI)** | `ClientSetupPanel.tsx` (config por atleta con toggles) | Toggle "Dar acceso a la Academia" por atleta, más selector masivo "Conceder a…" (multi-select de atletas) en la gestión de academia. |
| **Registro en vivo / widget** | `TrainingScreen.tsx` (ya registra peso/reps/RIR/done) + `restSeconds` de cada ejercicio | El widget es el "modo sesión en vivo" montado encima; no se reescribe el logger. |
| **Avisos** | `AppNotification` + `NotificationBell.tsx` (con `link` a tab) | Curso desbloqueado, nueva lección, test de FC pendiente de aprobar, cardio prescrito → notificación con deep-link a la pestaña. |
| **Roadmap** | `RoadmapTimeline.tsx` / `AthleteRoadmapScreen.tsx` | Hitos de academia (curso completado) y cardio (test de umbral, récord de minutos en Z2) como eventos del roadmap del atleta. |
| **Reportes del coach** | `CoachReport` con `CoachReportSection` (secciones toggleables + snapshot) | Añadir secciones **"Cardio / adherencia Z2"** y **"Formación / academia"** al reporte, con el mismo patrón `included` + snapshot. |
| **Nivel/XP** | `useAdherence`, check-ins, rachas ya existentes | Esas señales alimentan el XP; no se inventan métricas nuevas. |
| **Onboarding** | `AthleteOnboardingWizard.tsx` (ya captura `birthDate`) | Capturar FC reposo y objetivos de cardio en el alta. |
| **Apple Health** | `StepsWidget.tsx` (ya hay intención de integrar Apple Health para pasos) | El import de cardio post-sesión (F4) se engancha a esa integración. |

**Regla de coherencia:** respetar el estilo de `dbService.ts` (lecturas/escrituras que absorben errores y caen a local; sin toasts de error redundantes por pantalla en lecturas) y el patrón de revisión coach→atleta de los check-ins/reportes.

---

## 14. App nativa de App Store — consideraciones (confirmado: se publica en la Store)

- **Pagos / In-App Purchase:** como el **acceso lo concede el coach** (parte del servicio de coaching, no una compra digital dentro de la app), **no** requiere IAP de Apple. ⚠️ Si algún día se vendiera el acceso a la academia **dentro** de la app, Apple exige IAP (comisión 30/15%). Mantener el desbloqueo como acción del coach lo evita.
- **Permisos / usage strings (Info.plist):** Bluetooth (`NSBluetoothAlwaysUsageDescription`), notificaciones, y HealthKit si se usa en F4. Declarar **background modes** para la Live Activity.
- **Sign in with Apple:** si hay login social de terceros, Apple lo exige como opción equivalente. Revisar el login actual antes de enviar.
- **Live Activities / push:** para actualizar el widget de bloqueo desde fuera de la app hace falta **APNs** (push a la Live Activity) además de los updates locales.
- **Privacy labels + disclaimers de salud:** el PAR-Q (§9) y el "no es consejo médico" ayudan con la revisión y el rating por edad. Declarar recogida de datos de salud (FC) en las privacy nutrition labels.
- **Android equivalente:** foreground service con tipo declarado (Android 14+), permiso de notificaciones (Android 13+), y permisos BLE runtime (`BLUETOOTH_SCAN`/`BLUETOOTH_CONNECT`).
