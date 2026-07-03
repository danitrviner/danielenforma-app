# En Forma — Claude Code context

Coach: Dani (@danielenforma). App web de coaching fitness remoto enfocada en **fuerza**. Dos vistas: coach y atleta.

---

## Stack

- **Frontend:** React 19 + TypeScript + Vite 6 + Tailwind. Recharts para gráficas.
- **Backend:** Firebase Blaze — Auth (Email/Password + Google), Firestore (named DB), Storage. Gemini API.
- **Dev:** `localhost:3005` (Vite). Sin deploy aún.

---

## ⚠️ Gotchas críticos

### 1 — Base de datos Firestore NOMBRADA (no `(default)`)
```
projectId:  fleet-operator-z5xj8
databaseId: ai-studio-b38fc63b-000e-4d2c-b774-20351883e870
```
`firebase.ts` inicializa con `getFirestore(app, 'ai-studio-b38fc63b-000e-4d2c-b774-20351883e870')`. Cualquier script también.

### 2 — Owner permanente
`danitrviner@gmail.com` es coach blindado. Google OAuth para el coach, `atleta@enforma.com` (email/pwd) para sandbox atleta.

### 3 — Firestore no acepta `undefined`
Usar `stripUndefined(obj)` (helper recursivo en `dbService.ts`) en **todas** las escrituras.

### 4 — Queries deben filtrar por dueño
Las reglas de Firestore deniegan queries de colección completa. Siempre incluir `where('athleteId','==', email)` o equivalente.

### 5 — Taxonomía email vs UID mixta (ver tabla colecciones)

### 6 — Reglas Firestore sugeridas por IA casi siempre MAL
Usar patrón `isOwner()` / `isCoach()`. Consola Firebase es la fuente de verdad.

---

## Colecciones Firestore (clave de propiedad)

| Colección | Doc ID | Owner key |
|---|---|---|
| `user_profiles` | UID | `userId` (UID) |
| `checkins` | auto | `userId` (UID) + `email` |
| `exercises` | auto | `ownerId` (UID) |
| `workouts` | auto | `ownerId` (UID coach) |
| `workoutAssignments` | auto | `athleteId` = **UID** |
| `workoutLogs` | auto | `athleteId` = **EMAIL** |
| `foodItems` | auto | — |
| `diets` | auto | `athleteId` = **EMAIL** (`selfManaged: true` = creada por el atleta en "Mis Dietas", el coach no la ve/edita) |
| `athleteDietConfigs` | email | docId = email |
| `athleteNutritionConfig` | email | docId = email |
| `mesocycles` | auto | `athleteId` = **EMAIL** |
| `mesocycleTemplates` | auto | `ownerId` (UID coach) |
| `recipes` | auto/UUID | `ownerId` (UID \| "indya") |
| `recipeFavorites` | email | docId = email |
| `progressPhotos` | `${email}_${date}_${view}` | `athleteId` = EMAIL |
| `bodyweightLogs` | auto | `athleteId` = EMAIL |
| `questionnaires` | auto | `ownerId` (UID coach) |
| `questionnaireAssignments` | auto | `athleteId` = EMAIL |
| `questionnaireResponses` | auto | `athleteId` = EMAIL |
| `onboarding` | email | docId = email |
| `nutritionPrograms` | email | docId = email |
| `roadmaps` | email | docId = email |
| `notifications` | determinista | `recipientEmail` |
| `tasks` | auto | `athleteId` = EMAIL |
| `resources` | auto | `coachId` (UID coach) — se lee sin filtrar (1 solo coach) |
| `stepLogs` | auto | `athleteId` = EMAIL |
| `dietCompletionLogs` | `${email}_${date}` | `athleteId` = EMAIL |
| `exerciseNotes` | `${exerciseId}_${email}` | `athleteId` = EMAIL |
| `photoAssignments` | auto | `athleteId` = EMAIL |

---

## Sistema de intercambios (nutrición)

```ts
// 1 intercambio = 100 kcal
const G_PER_EXCH = { HC: 25, PROT: 25, GRASA: 11 };
// HC=g/25  PROT=g/25  GRASA=g/11  (redondear a 0.25 con roundQ)
// MIX_HC   = 0.5 HC + 0.5 PROT
// MIX_GRASA= 0.5 GRASA + 0.5 PROT

// kcal por intercambio: HC=100, PROT=100, GRASA=99, MIX_HC=100, MIX_GRASA=100
```

## Mifflin-St Jeor (kcal automáticas — OnboardingForm)

```
BMR(H) = 10×peso + 6.25×altura − 5×edad + 5
BMR(M) = 10×peso + 6.25×altura − 5×edad − 161
TDEE   = BMR × actividad (1.2 / 1.375 / 1.55 / 1.725)
kcal   = TDEE × objetivo (Reducir grasa 0.8 / Mantener 1.0 / Aumentar músculo 1.1)
Macros: PROT 2g/kg · GRASA 25% kcal · HC el resto
```

## 1RM

```ts
// Epley
1RM = peso * (1 + reps / 30)
```

---

## Firebase Storage — paths

| Path | Uso |
|---|---|
| `progressPhotos/{email}/{date}_{view}` | Fotos de progreso |
| `dietNotes/{email}/{dietId}.{webm\|mp4\|mov}` | Vídeo-notas de dieta |

**Regla necesaria:** `allow read, write: if request.auth != null;`

---

## Archivos clave en `src/`

```
firebase.ts              — init app, exporta storage/storageRef/uploadBytes/getDownloadURL
dbService.ts             — toda la lógica Firestore + Storage; stripUndefined aquí
types.ts                 — Diet, DietMeal, OnboardingData, Recipe, etc.

components/
  NutritionScreen.tsx        — tracker nutrición del atleta (vista LISTA/FOTOS/NÚMEROS)
  NutritionPlansScreen.tsx   — editor de dietas del coach
  DietMealsView.tsx          — DietViewSelector, DietFotosView, DietNumerosView, useDietViewMode
  OnboardingForm.tsx         — anamnesis completa (Mifflin, comidas, cocina, objetivo, salud, descanso)
  ClientHub.tsx              — hub del coach (Revisiones, Entrenamientos, Dietas, etc.) — 2230 líneas
  ProfileScreen.tsx          — perfil atleta (gamificación + Editar ficha, oculto para el coach)
  DietAutoGenerator.tsx      — generador automático de dieta desde onboarding
  ProgressRing.tsx           — anillo SVG de progreso compartido (HomeScreen + ClientHub)
  theme.ts                   — constantes de color/tipografía/spacing extraídas (solo referencia, no
                                interpolable en className por las reglas de JIT de Tailwind — ver
                                comentario en el propio archivo)
```

**Nota:** `CoachNoteEditor.tsx` (nota + vídeo-nota de dieta) se **eliminó** en la sesión 2026-07-02 —
la vídeo-nota no se usaba y se quitó por completo (`Diet.coachVideoUrl`, `uploadDietVideo` también
eliminados). La nota de texto de dieta hoy es un `<textarea>` simple inline en `NutritionPlansScreen.tsx`.

---

## Persistencia onboarding

- **Nueva ficha:** `saveOnboarding(data)` → `setDoc` (overwrite completo)
- **Editar ficha:** `updateOnboarding(data)` → `updateDoc` (merge parcial)
- `likedFoods` / `dislikedFoods` los gestiona `FoodPreferencesPanel` por separado vía `updateOnboardingFoods`

---

## Tipos relevantes (resumen)

```ts
interface Diet {
  id: string; athleteId: string; name: string;
  budget: Record<FoodCategory, number>;
  meals: DietMeal[];
  coachNote?: string;
  isDraft?: boolean;
}

type FoodCategory = 'HC' | 'PROT' | 'GRASA' | 'MIX_HC' | 'MIX_GRASA';
type DietViewMode = 'lista' | 'fotos' | 'numeros';  // localStorage: 'enforma_diet_view_mode'

interface OnboardingData {
  athleteId: string;            // email
  sex?: 'male' | 'female';
  birthDate?: string;           // YYYY-MM-DD
  weightKg?: number; heightCm?: number;
  bodyFatPct?: number; musclePct?: number;
  activityLevel?: 'sedentario' | 'poco_activo' | 'activo' | 'muy_activo';
  goalBody?: 'aumentar_musculo' | 'reducir_grasa' | 'mantener';
  goalCapacity?: 'fuerza' | 'fuerza_resistencia' | 'salud';
  dietType: DietType; targetCalories: number;
  macroSplit: MacroSplit; macroGrams: MacroGrams;
  likedFoods: string[]; dislikedFoods: string[]; allergies: string[];
  mealCount?: number; meals?: OnboardingMeal[];
  cookingLevel?: number; cookingMaxTime?: number;
  breakfastVariety?: number; lunchVariety?: number;
  equipment: string[]; favoriteExercises: string[]; hatedExercises: string[];
  experienceLevel: ExperienceLevel; injuries: string;
  completedAt: string;
}
```

---

## Sesión 2026-07-03 (cont.) — Intercambios pasa a ser constructor de menús

Reescritura grande de la nutrición del atleta, a petición de Dani. Antes: "Intercambios"
(`NutritionScreen.tsx`) era un tracker de solo lectura de la dieta que montaba el
entrenador; "Mis Dietas" (`MyDietsScreen.tsx`) era una pantalla aislada donde el atleta
creaba dietas 100% propias (solo alimentos, sin recetas), invisibles para el entrenador.
Ahora:

- **`NutritionScreen.tsx` (Intercambios)** — el atleta puede añadir alimentos
  (`handleOpenAddPicker`/`handleSelectFood` con `pickerItem.itemIdx: number | null`,
  `null` = añadir nuevo en vez de sustituir) y recetas a cualquier comida, editar el
  objetivo diario de intercambios y gestionar comidas (añadir/renombrar/quitar). Nuevo
  **selector libre de dieta**: lista todas sus dietas (`allDietsList`, propias +
  entrenador, con icono si es del entrenador) para elegir cuál está trabajando, recordado
  en `localStorage` (`enforma_intercambios_diet_${email}`). **Guardar**: si la dieta es
  suya (`selfManaged`) actualiza directo (`updateDiet`); si es del entrenador, pregunta
  "Actualizar esta dieta" (edición directa, confirmado con Dani) vs "Guardar como nueva
  dieta mía" (copia vía `createDiet`, no toca el original). Si el atleta no tiene ninguna
  dieta, botón "Crear mi primer menú" arranca una en blanco (`blankDiet()`, id temporal
  `draft_...`, se detecta como no persistida comparando contra `allDietsList` para saber
  si Guardar debe crear o actualizar). Aviso de cambios sin guardar (`isDirty`,
  comparación de snapshot JSON) al cambiar de dieta. **Números** (antes pestaña aparte)
  ahora es un bloque siempre visible (`DietNumerosView`, sin toggle).
- **`MyDietsScreen.tsx` (Mis Dietas)** — ya no filtra por `selfManaged`: lista TODAS las
  dietas del atleta, con badge "De tu entrenador" en las que no son suyas. Editable
  siempre (edición directa); **Eliminar** sigue restringido a dietas propias (borrar el
  documento de una dieta del entrenador no se pidió explícitamente — ver plan de sesión
  si Dani quiere cambiarlo). Nuevo botón **Duplicar** en cada tarjeta (propia o del
  entrenador) → copia vía `createDiet` con `selfManaged: true`, para usar como base. El
  picker de alimentos ganó una pestaña "Recetas" (antes solo alimentos sueltos).
- **`RecipesScreen.tsx` → Intercambios**: botón "Añadir a Intercambios" en el detalle de
  receta (`onAddToIntercambios` prop) — cambia a la pestaña Intercambios y añade la
  receta a la comida (si hay una sola) o pregunta a cuál (`chooseMealForRecipe`, si hay
  varias); si no hay ninguna dieta cargada, arranca una en blanco. Estado del hand-off
  vive en `NutritionHubScreen.tsx` (`pendingRecipe`), el puente entre pestañas.
- **`DietMealsView.tsx`**: se eliminó `DietFotosView`/`DietViewSelector`/
  `useDietViewMode`/`DietViewMode` por completo (Dani: "el apartado de fotos... no
  aporta nada"). Solo queda `DietNumerosView`, ahora renderizado siempre (no detrás de
  un selector) tanto en `NutritionScreen.tsx` como en la vista previa del entrenador en
  `NutritionPlansScreen.tsx` (mismo cambio ahí, por consistencia — confirmado con Dani).

`tsc --noEmit` + `npm run build` limpios. **Sin verificar visualmente en navegador** —
superficie de cambio grande (6 archivos), este es el punto donde más vale la pena un
pase de QA real antes de dar por bueno el flujo completo.

---

## Sesión 2026-07-03 (cont.) — Recordatorio de vídeo por serie/ejercicio

`WorkoutExercise.recordVideoSet?: number | 'all'` (`types.ts`) — el coach marca en el editor de
rutinas (`WorkoutsScreen.tsx`, botón "Grabar con el móvil" bajo las notas de cada ejercicio) que
quiere que el atleta grabe con el móvil un ejercicio entero (`'all'`) o solo una serie concreta
(número 1-indexado, dropdown que aparece al activar el botón). En el player del atleta
(`TrainingScreen.tsx`): la tarjeta del ejercicio se resalta con borde dorado + banner "🎥 Tu
entrenador quiere que grabes..." bajo el header, y la fila de la serie afectada en la tabla se
resalta con fondo dorado tenue + icono de cámara junto a "S{n}". Reflejado también en el lado
coach: icono de cámara junto al ejercicio en la vista previa de cada tarjeta de rutina
(`WorkoutsScreen.tsx`, lista de rutinas) y junto al nombre de la rutina en "Entrenamientos
asignados" de `ClientHub.tsx` (si algún ejercicio de esa rutina tiene el flag activo). No requiere
colección nueva ni cambios en `dbService.ts` (viaja dentro de `Workout.exercises`, ya cubierto por `stripUndefined`
al guardar).

`tsc --noEmit` + `npm run build` limpios. **Sin verificar visualmente en navegador.**

---

## Sesión 2026-07-03 (cont.) — Clientes: buscador + cuadrícula ajustable

`ClientsScreen.tsx`, a petición de Dani:
- El formulario de invitar atleta por email (antes en el header, junto al título) ya no está
  ahí — es su propia sección al final de la página, junto con "Invitaciones pendientes"
  (se movieron juntos porque están funcionalmente ligados).
- Barra de búsqueda por nombre/email sobre la cuadrícula de atletas.
- Selector de columnas (2/3/4, botones junto al buscador) para la cuadrícula de tarjetas,
  pensado para cuando crezca el número de clientes — persistido en `localStorage`
  (`enforma_clients_grid_cols`), mismo patrón que `useDietViewMode` en `DietMealsView.tsx`.

`tsc --noEmit` + `npm run build` limpios. **Sin verificar visualmente en navegador.**

---

## Sesión 2026-07-03 — Rebrand visual completo (mergeado a `main`)

**✅ Estado: `rebranding` se mergeó a `main` (fast-forward limpio, sin conflictos) y se subió a
`origin/main`.** `main` tiene ahora la paleta dorada completa. Todos los commits tienen
`tsc --noEmit` + `npm run build` limpios, pero **nada se ha verificado visualmente en navegador**
(sin herramienta de browser en esta CLI — ver [[feedback-enforma-workflow]]). Sin deploy todavía
(pendiente de que Dani decida publicar).

**1. Rebrand de color/tipografía/spacing** (todo `src/components/**` + `App.tsx` + `index.html`):
- Acento volt `#e2ff00` → dorado `#fbcb1a` (hover `#bad200` → `#d4a800`) en los 49 componentes,
  variantes de opacidad e inline styles incluidos.
- Fondos más cálidos: `#121212`/`#171717`/`#131313` → `#181816`; `#1a1a1a`/`#191919` → `#1e1e1b`;
  bordes sólidos `#2a2a2a` → `border-white/N` translúcido (preservando la opacidad original de
  cada variante).
- Botones de acción sobre fondo dorado y badges de estado: `font-mono` → `font-sans`.
- h3 de cards: `text-sm` → `text-base`. Labels uppercase reducidos un paso (`10px→xs`, `9px→10px`).
- Radios: `rounded-xl` → `rounded-2xl` en cards contenedor; `rounded-lg` → `rounded-xl` en
  secundarias. `p-4` → `p-5` solo en las cards principales con h3 dentro (no en list items).
- `index.html`: quitado el flash de color viejo antes de que cargue React (bg/text/selection del
  `<body>`), añadido `favicon.svg` (monograma "EF", placeholder) + `manifest.json` + `theme-color`.
- `src/theme.ts` (nuevo): centraliza todos los valores de color/tipografía/spacing extraídos,
  como referencia — no se usa para generar clases Tailwind (ver comentario en el archivo sobre
  por qué el JIT de Tailwind v4 exige strings literales en `className`).

**2. Rediseño de pantallas clave del atleta** (Home + Entrenamiento), inspirado en una referencia
visual que compartió Dani (mockup con anillo de progreso circular, tarjetas de foto, nav pill):
- **`HomeScreen.tsx`:** nueva card "Resumen de hoy" con `ProgressRing` (ver abajo) mostrando % de
  entrenamientos completados esta semana — dato real, mismo cálculo que ya existía en
  `TrainingScreen`. **Decisión explícita: sin fotos en tarjetas (no hay flujo de subida) ni
  calorías/tiempo activo inventados** — solo métricas con datos reales ya disponibles.
- **`TrainingScreen.tsx`:** thumbnail de ejercicio cuadrado → circular; cuando se completan todas
  las series se muestra un check circular en vez del contador de texto.
- **`App.tsx`:** el header/sidebar/nav inferior se había quedado **fuera** del sed original del
  rebrand (usaba patrones de color que no estaban en la lista de swap) — corregido. Nav inferior
  móvil rediseñada: el tab activo ahora es una píldora con fondo/borde dorado translúcido.
- **`src/components/ProgressRing.tsx`** (nuevo, extraído de `HomeScreen.tsx`): anillo SVG de
  progreso reutilizable (`stroke-dasharray`/`stroke-dashoffset`, sin librería de gráficos), prop
  `color` opcional. Usado en dorado en `HomeScreen` y en cian en `ClientHub` (ver abajo).

**3. Rediseño del lado coach** (`ClientsScreen.tsx`, `ReviewsScreen.tsx`, `ClientHub.tsx`):
- Limpieza de restos del rebrand que el sed inicial no cubrió: `#131313` (fondo, nunca estuvo en
  la lista de swap) y sombras `rgba(226,255,0,*)` (glow volt en rgba crudo, no hex) — 10+ archivos.
- Card de atleta en `ClientsScreen.tsx`: `rounded-xl` → `rounded-2xl`.
- Badges de estado (`Revisado`/`Pendiente`/`Activos`/`Al día`/vencimiento de plan/etc.) en
  `ClientsScreen.tsx`, `ReviewsScreen.tsx` y `ClientHub.tsx`: `font-mono` → `font-sans`,
  `rounded` → `rounded-lg`.
- `ClientHub.tsx` → card "Cumplimiento Semanal": la barra lineal cian se sustituyó por
  `<ProgressRing pct={weekPct} color="#00eefc" />` (mismos `weekCompleted`/`weekTotal` ya
  calculados) — mismo lenguaje visual que `HomeScreen`, color distinto para diferenciar coach/atleta.
- **`src/components/CoachScreen.tsx` (862 líneas) eliminado** — código muerto, nunca importado en
  `App.tsx` (`ClientsScreen.tsx` es la pantalla real del coach). Confirmado con `grep` antes de
  borrar; build limpio después (y el CSS final bajó de tamaño).

**4. Auditoría móvil de pantallas del atleta** — se revisaron a mano (no ciegamente) los "problemas"
que un análisis automático marcó como alta prioridad, para no aplicar cambios que fueran regresiones:
- **Corregido de verdad:** `NutritionScreen.tsx` — grid de "Progreso por categoría" (5-6 categorías
  de macros) iba en `grid-cols-3` fijo, apretado en 375px → `grid-cols-2 sm:grid-cols-3`.
- **Revisado y descartado a propósito** (documentado para que nadie lo "arregle" sin motivo):
  - Tríos de estadísticas cortas (`StepsWidget.tsx`, `ProfileScreen.tsx` Racha/Nivel/Meta,
    `MetricsScreen.tsx` Actual/Inicial/Dif) en `grid-cols-3` — son números cortos, colapsar a 1
    columna se vería peor, no mejor.
  - Tabla de series (`TrainingScreen.tsx`, `min-w-[480px]`) y gráfico SVG (`MetricsScreen.tsx`,
    `min-w-[450px]`) — ya envueltos en `overflow-x-auto`; son datos densos que necesitan ese ancho
    para que los inputs sigan siendo usables. El scroll horizontal contenido es el patrón correcto.
  - Iron Calendar (`ProfileScreen.tsx`, `grid-cols-7` de casillas sin texto) — cabe bien en 375px.
  - Botones de icono en `NutritionScreen.tsx` (swap/eliminar alimento) — ya usan el truco
    `p-1.5 -m-1.5` para ampliar el área táctil sin más espacio visual.

**Pendiente / próximos pasos posibles (nada urgente, a decidir con Dani):**
- Despliegue de `main` (cuando Dani decida publicar) — el merge ya está hecho.
- QA visual real en navegador de todo lo anterior (checklist: anillo en 375px, nav inferior no se
  corta, contraste de texto sobre los fondos nuevos, grid de macros en Nutrición).
- Logo/favicon real (hoy es un monograma "EF" placeholder) — **pospuesto explícitamente por Dani**
  (2026-07-03: "aún no tengo logo, de momento que se quede ese").
- Subida de fotos para ejercicios/rutinas (campo `Exercise.imageUrl` existe, sin flujo de subida —
  se dejó fuera de alcance a petición explícita de Dani).
- ~~`TrainingCoachScreen.tsx` / `NutritionCoachScreen.tsx` no exploradas~~ **Hecho 2026-07-03:**
  `TrainingCoachScreen.tsx` no tenía header (único shell de coach sin título) — añadido
  badge "Consola de Entrenador" + h1 "Entrenamiento" igual que `ClientsScreen`/`ReviewsScreen`.
  `NutritionCoachScreen.tsx` tenía el switcher de tabs con un patrón viejo (chips `font-mono`
  individuales con borde) — migrado al patrón de píldora segmentada (`bg-[#181816] p-1
  rounded-lg`) que ya usan `TrainingCoachScreen`/`NutritionHubScreen`/`CoachesScreen`; badge
  "Consola de Entrenador" `font-mono` → `font-sans`. `tsc --noEmit` + `npm run build` limpios,
  **sin verificar visualmente en navegador**. Sus pantallas hijas (`ExerciseLibraryScreen`,
  `WorkoutsScreen`, `MesocycleTemplateLibrary`, `FoodLibraryScreen`, `NutritionPlansScreen`,
  `RecipeBuilderScreen`, `NutritionAIDashboard`) ya habían recibido el swap de color base en
  el sed inicial — revisadas, sin restos de paleta antigua.

---

## Última sesión (2026-07-02)

**Roadmap de 4 fases completado en su totalidad (Fase 1-4).**

- **Fase 4 (Check-in):** las fotos de progreso ganaron calendario propio, igual que los cuestionarios. Nuevo tipo `PhotoAssignment` (colección `photoAssignments`, mismo patrón que `questionnaireAssignments`). `src/utils/scheduleEngine.ts` (nuevo) extrae `isDueToday`/`isUpcoming`/`scheduleLabel` como motor genérico reutilizado por cuestionarios y fotos; `src/utils/photoSchedule.ts` añade `hasUploadedThisOccurrence`. `src/components/ScheduleFields.tsx` (nuevo) extrae el selector de repetición (días/intervalo/mes/fecha) que antes vivía duplicado inline en `ClientHub.tsx`. Coach asigna fotos desde `ClientHub` → Revisiones; atleta ve "Fotos pendientes"/"Fotos futuras" en `CheckInScreen.tsx`; el tipo de tarea `foto` de `PendingTasksPanel.tsx` (existía desde Fase 1 pero nunca se poblaba) ya se genera.
- **Fase 3 (Nutrición):** "Mis Dietas" (atleta crea/guarda dietas propias, `Diet.selfManaged`, misma colección `diets`); consumo diario de intercambios persistido (`dietCompletionLogs`, doc id `${email}_${date}`) en vez de solo-sesión; botón "Cambiar comida" (recetas ±10% kcal, `src/utils/recipeMatch.ts`, reutilizado por `DietAutoGenerator.tsx`); `AthleteNutritionConfig.kcalPerStep` configurable (`src/utils/nutritionConstants.ts`, default 0.046 kcal/paso — nunca hardcodeado inline); dashboard nutricional IA coach-only (`NutritionAIDashboard.tsx` + `src/utils/nutritionAnalysis.ts`) — **motor de reglas determinístico, sin LLM/API externa** — con reporte compartible (`AthleteNutritionConfig.sharedReportSnapshot`, privado por defecto). `src/utils/exchangeHelpers.ts` (nuevo) extrae CATS/CAT_LABEL/CAT_COLOR/etc. duplicados entre `NutritionScreen.tsx`/`NutritionPlansScreen.tsx`.
- **Fase 2 (Entrenamiento):** biblioteca de ejercicios sin nivel Principiante/Intermedio/Avanzado, con filtro "Perfil de resistencia" (`enduranceProfile`). Observaciones de ejercicio en dos niveles: descripción global (`instructions`, cualquier atleta) + observación personalizada por atleta (`ExercisePersonalNote`, colección `exerciseNotes` doc id `${exerciseId}_${email}`). Atleta deja notas por ejercicio y por entreno completo (`WorkoutLog.note`/`WorkoutEntryLog.note`, ya preparados en Fase 1); coach las ve/marca vistas en `ClientHub`. Plantillas de programa renombradas a "Plantillas de mesociclo" + 3 grupos musculares prioritarios calculados automáticamente (`src/utils/muscleGroupRanking.ts`, reutilizado por `MesocycleManager.tsx`).
- **Fase 1 (UX y Navegación):**
- **`RecipesScreen.tsx`:** "Cargar más recetas" fallaba en silencio cuando categoría + momento de ingesta estaban filtrados a la vez — faltaba el índice compuesto `(ownerId, categoria, intakeTypes, name)`. Añadido a `firestore.indexes.json` y desplegado. Se agregó `indyaError` + botón "Reintentar" para que futuros fallos no queden atascados sin feedback.
- **`ProgressScreen.tsx` eliminado** (duplicado muerto de `HomeScreen.tsx`, sin referencias).
- **Navegación coach:** tab "Ajustes" eliminado; `CoachesScreen` (Entrenadores/Cuestionarios/Ficha/Biblioteca) ahora vive colapsado dentro de `ProfileScreen.tsx` → sección "Entrenadores" (solo coach). Icono "Perfil" quitado del dock móvil del coach (el avatar del header ya abre el perfil). `TrainingCoachScreen.tsx`'s tab bar (Rutinas/Ejercicios/Plantillas) pasó a scroll+snap para mobile.
- **`ClientsScreen.tsx`:** métricas "Racha Promedio"/"Nivel Medio" removidas, reemplazadas por "Atletas próximos a finalizar su planificación" (usa `planDaysLeft` ya calculado) + tarjeta nueva "Notas Pendientes". "Revisiones Pendientes" navega directo al tab Revisiones vía `onOpenReviews`.
- **`ReviewsScreen.tsx`:** cada item (check-in o respuesta de cuestionario) tiene botón "Ver perfil completo" que abre `ClientHub` para ese atleta (mismo componente que usa `ClientsScreen`, reutilizado vía `ClientHub`'s nuevo prop opcional `initialTab`).
- **`WorkoutLog`/`WorkoutEntryLog`** ganan `note?`/`noteCoachSeen?` opcionales (`types.ts`) — campos preparados para que Fase 2 implemente notas del atleta por ejercicio/entreno; hoy solo alimentan la tarjeta "Notas Pendientes" de Clientes (mostrará 0 hasta que exista la UI de escritura).
- **Nuevo: "Tareas pendientes"** (`PendingTasksPanel.tsx` + tipo `TaskItem` + colección `tasks`). Agrega automáticamente: check-in atrasado (7+ días sin enviar), cuestionarios R1-R7 pendientes del día (reutiliza `utils/questionnaireSchedule.ts`, extraído de `CheckInScreen.tsx`), y tareas creadas manualmente por el coach (`TaskManagerPanel.tsx`, nuevo en `ClientHub` → Revisiones; tipos `manual`/`foto` para solicitudes de fotos). Arquitectura abierta a nuevos `TaskType` sin tocar el agregador.
- **Nuevo: "Recursos"** (`ResourcesPanel.tsx` + tipo `Resource` + colección `resources`). App de un solo coach → se lee todo sin filtrar por `coachId` (mismo patrón que `foodItems`/`exercises`). Coach comparte desde `ClientsScreen`, atleta los ve desde `HomeScreen`.
- **Nuevo: pasos diarios** — `StepsWidget.tsx` + tipo `StepLog` + colección `stepLogs` (separada de `bodyweightLogs` a propósito, para no forzar un peso placeholder) + `AthleteNutritionConfig.stepGoal` configurable (no hardcodeado; default 8000 si no hay valor). Entrada manual por ahora; el cálculo kcal/objetivo dinámico y la sincronización Apple Health/Google Health Connect son Fase 3.
- **`HomeScreen.tsx` (Inicio) reescrito:** fuera el gráfico "Progresión" y el tab "Fotos" (la evolución de peso sigue en Mi Perfil vía `BodyweightPanel`). Ahora: Tareas pendientes → Pasos de hoy → Entrenamientos pendientes de esta semana + atrasados (compacto, usa `utils/trainingWeek.ts` extraído de `TrainingScreen.tsx`) → Recursos.
- **`CheckInScreen.tsx`:** centraliza `PhotosScreen` (antes en Inicio) + nueva sección colapsable "Cuestionarios futuros".
- **`firestore.rules`:** reglas nuevas para `tasks`, `resources`, `stepLogs` (desplegadas).

---

## Última sesión (2026-07-01)

- **Responsive coach hub (tanda 2) completado.** `ClientHub.tsx` y sus 6 sub-pestañas (Revisiones, Entrenamientos, Dietas, Macrociclos, Road map, Análisis) pasadas a mobile-first: tab bar del hub con scroll+snap y sticky top; modal "crear cuestionario" y `RoadmapTimeline`'s `ItemEditor` convertidos a bottom-sheet con safe-area en mobile; touch targets subidos a 44px en `LoadHistoryPanel`, `QuestionnaireChartsPanel`, `FoodPreferencesPanel`, `MesocycleManager` (Stepper/PrioritySelector/días-semana). **`RoadmapTimeline.tsx`** reescrito para mobile: las 3 lanes (Entrenamiento/Nutrición/Objetivos) + curva de peso, antes un único canvas con scroll-X combinado, ahora se apilan verticalmente en `<sm` vía componente `MiniLane`, cada una con su propio mini-scroll-X (contenido compartido con la vista desktop a través de `trainingContent`/`nutritionContent`/`objectivesContent`/`weightContent`, parametrizados por `topBase`). No se tocó paleta/tipografía (fuera de alcance, fase aparte).
- **Nav móvil del atleta:** el botón "Perfil" de la bottom nav (`App.tsx`) se quitó **solo para el atleta** (`{isCoach && (...)}`) — el perfil se sigue abriendo desde la burbuja de avatar del header (ya existía). El coach conserva su botón Perfil en la bottom nav.
- **`HomeScreen.tsx` → `CheckInScreen.tsx`:** la sección "Historial de Revisiones" (check-ins con feedback del coach) se movió de Inicio al final de Check-in. `CheckInScreen` ahora recibe `checkins` como prop (pasado desde `App.tsx`).
- **"Nuevo Check-in" eliminado por completo** de `CheckInScreen.tsx` (el formulario de peso+ánimo+adherencia+notas que creaba `WeightCheckIn` vía `addWeightCheckIn`). Se quitaron `onCheckInAdded`/`onRefreshProfile` (quedaron sin uso) y `handleNewCheckInAdded` en `App.tsx`. El peso diario se sigue registrando con el widget rápido de `bodyweightLogs` que ya vivía arriba en esa pantalla; las revisiones ahora dependen de los cuestionarios (R1-R7) + ese peso diario.
- **`TrainingScreen.tsx` (atleta) reorganizado por bloques semanales:**
  - Filtro "Pendientes" ahora muestra **"Esta semana" primero** (con el único entreno pendiente más próximo marcado "Siguiente"; si hay 3/4 hechos, esos 3 salen completados y el 4º como "Siguiente"), y **"Atrasados"** (semanas previas, pendiente ≤7 días) debajo. Las semanas futuras no se muestran hasta que pasan a ser la semana actual.
  - **Nuevo status persistido `'perdido'`** en `WorkoutAssignment.status` (`types.ts`): un `pending` con fecha de hace más de 7 días se marca automáticamente como `perdido` al cargar `TrainingScreen` (`loadAll` → `updateWorkoutAssignment`). Es visible también para el coach en `ClientHub` (`STATUS_LABEL`/`STATUS_STYLE` actualizados ahí también). Los perdidos quedan **ocultos del filtro "Pendientes"** pero visibles en **"Todos"**, con botón "Recuperar" (abre el player y permite completarlo tarde).
  - `computeAdherenceScore` (`utils/adherence.ts`) no necesitó cambios: solo cuenta `status === 'completed'`, así que `perdido` ya penalizaba igual que `pending`.

---

## Features implementadas

**Entrenamiento:** biblioteca ejercicios (muscleGroup 14 claves + equipment), workouts, mesociclos (heatmap MEV/MAV/MRV, motor 48h + antagonistas), generador de rutinas, vista atleta + registro series/pesos, historial 1RM Epley, plantillas de programa E1/A1/A2.

**Nutrición:** banco 311 alimentos, presupuesto intercambios, D1 (HC/PROT/GRASA), D2 (presupuesto por día semana), D3a (periodización + auto-cambio + banner), tracker atleta con LISTA/FOTOS/NÚMEROS, auto-generador dieta desde onboarding, 8.850 recetas Indya importadas.

**Anamnesis:** composición + Mifflin automático + comidas/tupper/cocina. Editable por atleta (Perfil → Editar ficha) y coach (ClientHub → Ficha).

**Coach hub:** ClientHub con Revisiones / Entrenamientos / Dietas / Macrociclos / Road map. Nota + vídeo-nota en dietas. Vista previa atleta en editor de dietas.

**Cuestionarios R1-R7:** motor flexible, gráficas, correlaciones Pearson, peso múltiple + media semanal.

**Gamificación + perfil atleta:** racha, XP/nivel, Iron Calendar, insignias.

**Notificaciones:** centro in-app N1.

---

## Convenciones de código

- `stripUndefined` en **todo** `setDoc` / `updateDoc` / `addDoc`
- No añadir comentarios salvo WHY no obvio
- Mobile-first en el lado atleta
- **Paleta (rebrand 2026-07-03, rama `rebranding`):** fondo `#111110`, cards `#181816`, cards
  elevadas `#1e1e1b`, bordes `border-white/7` (translúcido, no hex sólido), acento **dorado**
  `#fbcb1a` (hover `#d4a800`), info `#00eefc`. Radios: `rounded-2xl` en cards contenedor,
  `rounded-xl`/`rounded-lg` en cards secundarias/chips. Variables espejo en `src/index.css`
  (`@theme`: `--color-accent`, `--color-bg-card`, etc.) y documentadas (no interpolables en
  className) en `src/theme.ts`. **El antiguo acento volt `#e2ff00` ya no se usa en ningún sitio.**
- `font-mono` para datos/métricas/fechas/códigos cortos (HC, MEV...). `font-sans` para títulos,
  botones de acción, nombres propios y **badges de estado** (Revisado/Pendiente/Activos/etc. —
  antes eran `font-mono`, se corrigió en el rebrand).
