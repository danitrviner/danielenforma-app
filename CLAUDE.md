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
| `diets` | auto | `athleteId` = **EMAIL** |
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
  CoachNoteEditor.tsx        — textarea nota + upload/grabar vídeo (MediaRecorder)
  OnboardingForm.tsx         — anamnesis completa (Mifflin, comidas, cocina, objetivo)
  ClientHub.tsx              — hub del coach (Revisiones, Entrenamientos, Dietas, etc.)
  ProfileScreen.tsx          — perfil atleta (gamificación + Editar ficha)
  DietAutoGenerator.tsx      — generador automático de dieta desde onboarding
```

---

## Persistencia onboarding

- **Nueva ficha:** `saveOnboarding(data)` → `setDoc` (overwrite completo)
- **Editar ficha:** `updateOnboarding(data)` → `updateDoc` (merge parcial)
- `likedFoods` / `dislikedFoods` los gestiona `FoodPreferencesPanel` por separado vía `updateOnboardingFoods`

## Persistencia dieta + vídeo

```ts
// Nueva dieta con vídeo:
const diet = await createDiet(data);                          // 1. crea doc
const url  = await uploadDietVideo(email, diet.id, blob);     // 2. sube Storage
await updateDiet(diet.id, { coachVideoUrl: url });            // 3. actualiza URL
```

---

## Tipos relevantes (resumen)

```ts
interface Diet {
  id: string; athleteId: string; name: string;
  budget: Record<FoodCategory, number>;
  meals: DietMeal[];
  coachNote?: string;
  coachVideoUrl?: string;
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
- Tailwind dark: fondo `#131313`, cards `#121212`, bordes `#2a2a2a`, acento `#e2ff00`, info `#00eefc`
- `font-mono` para datos/métricas, `font-sans` para títulos
