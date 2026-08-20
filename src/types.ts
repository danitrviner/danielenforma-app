// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────

export type NotificationType =
  | 'checkin_submitted'
  | 'questionnaire_submitted'
  | 'nutrition_phase_change'
  | 'plan_expiring'
  | 'checkin_late'
  | 'report_sent'
  | 'weekly_challenge_new'
  | 'weekly_challenge_won'
  | 'plan_phase_change'
  | 'level_up'
  | 'hrtest_pending'
  | 'hrtest_approved'
  | 'academy_access_granted'
  | 'lesson_completed';

export interface AppNotification {
  id: string;                   // deterministic dedup key
  recipientEmail: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;               // tab to navigate to on click
  createdAt: string;           // ISO string
  read: boolean;
}

// ─── COACH REPORTS ────────────────────────────────────────────────────────────
// Persistent, coach-authored performance/nutrition report the athlete keeps and
// can revisit. The coach reviews an auto-generated draft, edits the message and
// decides which sections are shown, then sends. The numeric `data` of each
// section is a SNAPSHOT taken at generation time, so the history never changes
// retroactively; the coach only curates title/intro/section visibility/notes.

export type CoachReportKind = 'entrenamiento' | 'nutricion' | 'combinado';

export interface CoachReportSection {
  id: string;            // 'tonnage' | 'per-exercise' | 'muscle-progression' | 'nutrition' | 'micros'
  title: string;
  included: boolean;     // coach toggles whether this section is shown to the athlete
  data: unknown;         // structured payload, snapshotted at generation time
  coachNote?: string;    // optional per-section note from the coach
}

export interface CoachReport {
  id: string;
  athleteId: string;     // email
  coachId: string;
  kind: CoachReportKind;
  periodStart: string;   // YYYY-MM-DD
  periodEnd: string;
  createdAt: string;     // ISO
  updatedAt: string;     // ISO
  status: 'draft' | 'sent';
  sentAt?: string;       // ISO, set when status flips to 'sent'
  title: string;         // editable
  intro: string;         // editable free-text message from the coach
  sections: CoachReportSection[];
}

// ─────────────────────────────────────────────────────────────────────────────

export interface UserProfile {
  userId: string;
  email: string;
  displayName: string;
  role: 'client' | 'coach';
  avatarUrl: string;
  level: number;
  xp: number;
  currentStreak: number;
  maxStreak: number;
  initialWeight: number;
  targetWeight: number;
  actualWeight: number;
  planStartDate?: string;       // ISO YYYY-MM-DD set by coach
  planDurationMonths?: 3 | 6 | 12;
  // Personal reorder of ProfileScreen's content blocks — block ids not present here
  // fall back to the default order (see ProfileScreen.tsx DEFAULT_BLOCK_ORDER).
  dashboardOrder?: string[];
  // Cached result of computeSetupChecklist, refreshed whenever the coach opens
  // the Setup tab — lets the clients grid show a % without recomputing per card.
  setupSummary?: { pct: number; attention: number; updatedAt: string };
  // ISO timestamp of first profile creation. Missing on profiles created before
  // this field existed — treat as undefined (no daysSinceJoin drip gating) rather
  // than backfilling, since the real join date is unrecoverable for those.
  createdAt?: string;

  // ── Campos CRM (2026-08-01) ───────────────────────────────────────────────
  // Todos opcionales: un perfil sin ellos es exactamente lo que era antes, y
  // ninguna pantalla existente los lee. El CRM extiende este documento en vez
  // de crear una colección `clientes` paralela.
  //
  // OJO con las reglas: `dni`, `direccion` y `telefono` son datos del propio
  // atleta y puede editarlos; `estadoCrm` NO — está en la lista de campos
  // bloqueados del `allow update` de user_profiles, junto a planStartDate/role/xp,
  // porque es una decisión comercial del coach. Sin eso, un cliente se
  // reactivaría solo desde la consola del navegador.
  dni?: string;                                  // normalizado: mayúsculas, sin guiones ni espacios
  direccion?: string;
  telefono?: { prefijo: string; numero: string }; // prefijo con '+' («+34»)
  estadoCrm?: EstadoCrm;                          // ausente ⇒ se trata como 'activo'

  // ── Bienvenida guiada / tutorial (F3.12, Fase 3) ──────────────────────────
  // Dato del propio atleta (su progreso viendo el tour), no una decisión
  // comercial del coach — por eso NO está en la lista bloqueada del `allow
  // update` de arriba: el atleta puede escribirlo sin pasar por el coach.
  tutorial?: {
    completado: boolean;
    pasoAlcanzado: number;    // índice del último paso visto, para reanudar si se cierra la app
    ejemplosVistos: string[]; // ids de paso cuyo aviso "EJEMPLO" ya no debe repetirse
    completadoEn?: string;    // ISO
  };
  checklistInicial?: {
    primeraSesion: boolean;
    cincoIngestas: boolean;
    leccionRir: boolean;
  };

  // ── Preferencias de notificaciones (F3.13e) ────────────────────────────────
  // Silencia un tipo en la campanita (NotificationBell) — NO evita que se
  // escriba en Firestore (createNotificationDeduped no lee esto: hacerlo
  // añadiría una lectura extra en cada notificación de la app entera, atleta
  // incluido). Ausente o `true` ⇒ activada; solo `false` la silencia.
  notificationPrefs?: Partial<Record<NotificationType, boolean>>;

  // ── Churn + atribución (2026-08-02) ────────────────────────────────────────
  // Sin fechaBaja/motivoBaja, marcar a alguien de baja pierde para siempre
  // CUÁNDO y POR QUÉ — y el churn (KPI real del negocio, objetivo <10%) queda
  // incalculable hacia atrás. Se capturan juntos, en el mismo momento en que
  // se cambia estadoCrm a 'baja' — nunca por separado, para que no pueda haber
  // una baja sin motivo registrado.
  fechaBaja?: string;               // ISO 'YYYY-MM-DD', el día en que estadoCrm pasó a 'baja'
  motivoBaja?: MotivoBaja;
  motivoBajaDetalle?: string;       // texto libre — obligatorio en la UI si motivoBaja === 'otro'
  // Canal de captación. Ya existía en CrmContacto (gente sin cuenta); aquí se
  // espeja para que TODOS los clientes tengan atribución, no solo los
  // importados — sin esto, el CAC por canal es incalculable para cualquiera
  // que ya tenga cuenta en la app.
  origen?: string;                  // 'instagram' | 'referido' | 'ads' | ... (mismo campo libre que CrmContacto.origen)

  // ── Borrado de cuenta (2026-07-23) ─────────────────────────────────────────
  // api/delete-account.ts ANONIMIZA en vez de borrar (a propósito: el cuadro de
  // mandos sigue contando altas/bajas sobre estos documentos), y ya escribe
  // estos dos campos en Firestore — pero el tipo no los tenía, así que nadie en
  // src/ los leía y el perfil `borrado_…@anonimo.local` seguía apareciendo en
  // todas las listas de atletas. Ver src/utils/atletas.ts.
  anonimizado?: boolean;
  anonimizadoEn?: string; // ISO

  // ── Publicación del plan (T7.b, 2026-08-18) ────────────────────────────────
  // Antes la puerta de la sala de espera era `hasPlan` (asignaciones > 0), una
  // deducción: en cuanto el coach asignaba un mesociclo, el atleta veía su
  // plan sin que Dani hubiera decidido el momento. `hasPlan` sigue existiendo
  // como señal separada — es lo que decide si el botón "Mostrar el plan al
  // atleta" puede pulsarse, y lo que arranca el tour — pero lo que abre la
  // sala de espera ahora es esto, una decisión explícita del coach.
  planPublishedAt?: string; // ISO, el día en que el coach le mostró su primer plan

  // ISO timestamp de la última vez que el atleta abrió la app (escrito por su
  // propio cliente en cada arranque de sesión, ver App.tsx loadUserSession).
  // Solo para mostrarlo en la tarjeta del coach — no gatea nada.
  lastLoginAt?: string;
}

// Estado comercial del cliente. Deliberadamente separado de `role`, que es un
// permiso de la app ('client' | 'coach'), no una situación de negocio.
//
// 'lead' y 'llamada_agendada' son las dos etapas previas a ser cliente —
// preventa. En la práctica solo se usan en `CrmContacto` (gente sin cuenta
// todavía): un `UserProfile` ya implica que la persona se registró en la app,
// así que nunca debería tener estos dos valores, pero el tipo es el mismo en
// ambos sitios para no duplicarlo — la UI es quien restringe qué opciones
// ofrece según de dónde viene el cliente.
export type EstadoCrm = 'lead' | 'llamada_agendada' | 'activo' | 'pausado' | 'baja';

export type MotivoBaja =
  | 'precio'
  | 'resultados'
  | 'tiempo_disponibilidad'
  | 'insatisfaccion'
  | 'lesion_salud'
  | 'otro';

export interface WeightCheckIn {
  id: string;
  userId: string;
  email: string;
  timestamp: Date;
  dateStr: string; // "12 Oct" or standard format
  weight: number;
  mood: string; // 😩, 😴, 😐, 😊, 🔥
  adherence: 'Sí' | 'Parcial' | 'No';
  notes: string;
  coachFeedback?: string; // written by coach
  approved?: boolean;
  approvedAt?: Date;
}

export type FoodCategory = 'HC' | 'PROT' | 'GRASA' | 'MIX_HC' | 'MIX_GRASA';
export type DietMode = 'OMNIVORO' | 'VEGANO' | 'SIN_PESAR';

export interface MealItem {
  id: string;
  mode: DietMode;
  category: FoodCategory;
  label: string; // texto completo "1 intercambio = ..."
}

export interface AthleteNutritionConfig {
  athleteId: string; // email
  enabledModes: DietMode[];
  stepGoal?: number;      // daily step target set by the coach
  kcalPerStep?: number;   // configurable conversion rate; falls back to DEFAULT_KCAL_PER_STEP when unset
  vegServingsPerDay?: number; // assumed daily vegetable servings for the micronutrient estimate (veg are "libre" in the exchange system, so uncounted)
  vegTypes?: string[];    // ids from data/micronutrients VEGETABLES — the athlete's usual vegetables; empty/unset = generic mixed-veg profile
  // AI dashboard "share with athlete" — private by default, only set when the coach shares a snapshot
  sharedReportSnapshot?: { generatedAt: string; summary: string; flags: string[] };
  menuVariety?: number; // 1 (repetitive/monotone) - 5 (max variety); athlete-adjustable override of OnboardingData.menuVariety
  batchCookingPreferred?: boolean; // athlete prefers cooking the whole week at once; pre-fills the coach's batch toggle
  preferredDishTypes?: string[]; // DishType ids the athlete wants to see more of (see utils/dishTypes)
  excludedDishTypes?: string[];  // DishType ids the athlete never wants in the menu
  /** Cuándo el atleta tiene más hambre — alimenta el reparto automático de
   *  intercambios por comida (utils/mealDistribution.ts). Sin valor = reparto
   *  uniforme (comportamiento histórico). */
  hungerProfile?: HungerProfile;
  /** Franja (escala 1-5, ver DietMeal.slot) de la ingesta pegada al entreno,
   *  para cuando ninguna comida de la dieta trae `aroundTraining` explícito. */
  trainingSlot?: number;
}

export type HungerProfile = 'manana' | 'equilibrado' | 'noche';

export interface Exercise {
  id: string;
  ownerId: string;
  name: string;
  primaryFocus: string;      // legacy free-form label
  muscleGroup?: MuscleGroup; // typed macrocycle key (optional; old docs lack it)
  type: 'fuerza' | 'cardio' | 'estiramiento' | 'pliometría';
  enduranceProfile?: 'ascendente' | 'campana' | 'descendente'; // curva de esfuerzo a lo largo de la serie (cardio)
  // Dónde carga más el ejercicio de fuerza dentro de su rango de movimiento —
  // no es lo mismo que enduranceProfile (esa es la curva de esfuerzo dentro
  // de UNA serie de cardio; esta es dónde está el pico de tensión mecánica en
  // el recorrido, un concepto de hipertrofia). 'estiramiento' = carga máxima
  // en posición alargada (ej. curl femoral, aperturas), 'acortamiento' =
  // carga máxima en contracción máxima (ej. gemelo en máquina, curl en
  // polea baja), 'campana' = carga máxima a mitad de recorrido (la mayoría
  // de ejercicios con peso libre — sentadilla, press banca).
  strengthCurve?: 'estiramiento' | 'acortamiento' | 'campana';
  equipment?: string[];      // material necesario; undefined/empty = siempre disponible
  videoUrl?: string;
  imageUrl?: string;
  instructions?: string;     // descripción global — visible para cualquier atleta
  isCustom: boolean;

  // ─── Curaduría del coach ────────────────────────────────────────────────
  // El catálogo son 1.721 ejercicios: 40 escritos a mano y 1.681 importados de
  // un banco de vídeos y traducidos con un diccionario palabra por palabra, así
  // que muchos tienen el nombre mal o describen algo que el vídeo no hace. Estos
  // campos son el resultado de que el coach los revise uno a uno en
  // ExerciseTriageScreen. Todos opcionales: un ejercicio sin revisar es el
  // estado normal de partida, no un error.

  // Dónde aparece en los buscadores del coach. 'alta' = los que prescribe a
  // diario y quiere ver primero; 'baja' = los relega al final sin ocultarlos.
  prioridad?: 'alta' | 'normal' | 'baja';

  // El coach ha validado nombre, grupo muscular y curva mirando el vídeo. Es
  // lo que da el progreso de la revisión y lo que permite reanudarla.
  revisado?: boolean;
  revisadoAt?: string;       // ISO

  // Marcado como "esto sobra" durante la revisión. NO borra nada: la decisión
  // de eliminar ejercicios y sus vídeos es aparte y del coach.
  descartado?: boolean;

  // Nota libre del coach durante la revisión (dudas, "falta grabar de otro
  // ángulo", "confirmar con fisio"...). Solo la ve el coach, nunca el atleta.
  notasRevision?: string;

  // Se puede hacer en casa sin ir al gimnasio (peso corporal, banda, mancuernas
  // ligeras...). Curación manual del coach, no se infiere de `equipment`.
  casa?: boolean;
}

// Observación personalizada de un ejercicio, visible únicamente para un atleta concreto
// (distinta de `Exercise.instructions`, que es la descripción global). Doc ID determinista
// `${exerciseId}_${athleteId}` — evita duplicados y permite getDoc directo sin query.
export interface ExercisePersonalNote {
  id: string;
  exerciseId: string;
  athleteId: string; // email
  observation: string;
  updatedAt: string; // ISO timestamp
}

// ─── CATÁLOGO DE MÁQUINAS DE GIMNASIO ─────────────────────────────────────────
// Eje SEPARADO de `Exercise.equipment[]` (texto libre, taxonomía divergente): esto
// describe máquinas concretas de marca concreta que existen físicamente en el
// gimnasio del atleta. La relación máquina→ejercicio NO está implementada; ver
// docs/catalogo-maquinas.md para el diseño de la colección puente futura.
//
// El catálogo publicado vive como JSON en src/data/maquinas/<marca>.json (entra en
// el bundle, cero lecturas de Firestore); la colección `maquinas` guarda SOLO los
// cambios del admin sobre esa semilla y las máquinas creadas a mano. El catálogo
// efectivo es el merge de ambos — ver src/db/machines.ts.

// Abierto a propósito: añadir Panatta/Matrix/Prime es un importador nuevo, no un
// cambio de tipo. Los literales están para autocompletado de lo ya importado.
export type MarcaMaquina = 'hammerStrength' | 'technogym' | (string & {});

export const MARCA_LABELS: Record<string, string> = {
  hammerStrength: 'Hammer Strength',
  technogym: 'Technogym',
};

export interface Maquina {
  // Slug determinista `${marca}-${familia}-${nombreOriginal}` calculado en el
  // importador y congelado en el JSON. A diferencia de los IDs de `Exercise`
  // (autogenerados por addDoc, irreproducibles entre entornos), reimportar no
  // duplica ni renumera. Es la garantía de las migraciones y de la futura
  // relación con ejercicios.
  id: string;
  nombreOriginal: string;   // 'Iso-Lateral Incline Press' — nunca se le muestra al atleta
  nombreMostrado: string;   // 'Press inclinado' — lo único que ve el atleta
  marca: MarcaMaquina;
  familia: string;          // 'Plate Loaded' | 'Pure Strength'
  categoria: MuscleGroup;   // agrupa el swipe; reutiliza el enum ya tipado
  fotoUrl: string;          // ruta relativa a public/ para el catálogo, URL de Storage para las manuales
  fuente: 'scraping' | 'manual';
  visible: boolean;
  publicadoEn: string | null; // null = importada pero sin revisar; el scraping nunca publica directo
  creadoPor: 'admin' | 'sistema';
}

// Lo que el admin cambia sobre una máquina de la semilla. Es lo único que se
// guarda en Firestore para las máquinas importadas — un doc por máquina tocada,
// no uno por máquina del catálogo.
export interface MaquinaOverride extends Partial<Omit<Maquina, 'id'>> {
  id: string;
  actualizadoEn: string;
}

export interface DecisionMaquina {
  maquinaId: string;
  tengo: boolean;
  decididoEn: string; // ISO
}

// Máquina que el atleta añade con foto propia. Vive SOLO en su gimnasio; nunca
// entra al catálogo global hasta que un admin la promueve.
export interface MaquinaPropia {
  id: string;
  nombre: string;
  fotoUrl: string;
  creadaEn: string;
  candidataAPublica: boolean;
}

export interface ProgresoCatalogo {
  revisadas: number;
  total: number;
  categoriaActual: MuscleGroup | null;
  completado: boolean;
  // true si el atleta cerró el onboarding sin completar el catálogo. Lo leen
  // PendingTasksPanel (tarjeta en Hoy) y el badge de la pestaña.
  pendienteRecordatorio: boolean;
  // Versión del catálogo con la que se completó. Sin esto, al importar una marca
  // nueva el atleta que ya terminó queda `completado: true` para siempre y nunca
  // ve las máquinas añadidas.
  versionCatalogo: string;
}

export interface Gimnasio {
  atletaId: string; // email — misma convención que onboarding/, tasks, progressPhotos
  maquinas: DecisionMaquina[];
  progresoCatalogo: ProgresoCatalogo;
  maquinasPropias: MaquinaPropia[];
}

// High-intensity techniques a coach can flag on an exercise so the athlete sees a
// distinct badge + explanation of what to actually do. See utils/workoutTechniques.ts.
export type WorkoutTechnique = 'amrap' | 'dropset' | 'myoreps' | 'restpause' | 'fallo';

// One warm-up approximation set — display-only, never logged, never counts toward
// volume/records/progression. See src/utils/warmup/.
export interface WarmupSet {
  weight: number;
  reps: number;
}

// 'none' (default, opt-in) — no warm-up shown. 'auto' — WarmupGenerator computes the
// ramp live from the athlete's typed set-1 weight + exercise history. 'manual' — coach's
// own `manualWarmupSets` are shown as-is (still scored by ReadinessCalculator).
export type WarmupMode = 'none' | 'auto' | 'manual';

// A block of sets sharing the same rep range/RIR within one exercise — lets a coach
// split e.g. "4 series" into "2 series @ 10-12" (top sets) + "2 series @ 14-19"
// (back-off sets). `label` is free text (not a fixed enum) so it isn't limited to
// exactly those two names. All of these are effective sets — unlike warm-up sets they
// count for volume/records/progression like any other logged set.
export interface WorkoutSetGroup {
  label?: string;      // e.g. "Top set", "Back-off" — optional, shown as a badge
  sets: number;
  reps: string;        // "8-10", "AMRAP", "12", etc.
  rir: number;
}

export interface WorkoutExercise {
  exerciseId: string;
  order: number;
  sets: number;
  reps: string;        // "8-10", "AMRAP", "12", etc.
  restSeconds: number;
  rir: number;         // reps in reserve (0-5)
  notes?: string;
  muscleGroup?: MuscleGroup;
  // Coach flags this exercise so the athlete is reminded to film it with the phone —
  // 'all' highlights every set, a number highlights only that set (1-indexed).
  recordVideoSet?: number | 'all';
  technique?: WorkoutTechnique;
  warmupMode?: WarmupMode;            // undefined behaves as 'none'
  manualWarmupSets?: WarmupSet[];     // only read when warmupMode === 'manual'
  // When present (non-empty), overrides the uniform `sets`/`reps`/`rir` scheme above —
  // those three fields stay in sync as an aggregate (total sets, joined rep ranges,
  // first group's RIR) purely so summary views that just print "3×8-10" keep working
  // without knowing about groups. See src/utils/setGroups.ts.
  setGroups?: WorkoutSetGroup[];
}

export interface TemplateDay {
  id: string;
  name: string;
  exercises: WorkoutExercise[];
}

export interface TemplateStage {
  id: string;
  name: string;
  weeks: number;
  daysPerWeek: number;
  groups: Record<MuscleGroup, MuscleGroupConfig>;
  days?: TemplateDay[];
}

export interface Workout {
  id: string;
  ownerId: string;
  name: string;
  tags?: string[];
  exercises: WorkoutExercise[];
  mesocycleId?: string;
}

export interface WorkoutSetLog {
  weight: number;   // kg lifted
  repsDone: number; // actual reps completed
  rir: number;      // perceived reps in reserve — se ignora si alFallo es true
  // Fase 3 (decisión de Dani, 2026-08-07): FALLO no es RIR 0. Son dos cosas
  // distintas ("no podía hacer ni una más pero paré ahí" vs "seguí hasta que
  // la forma se rompió") y el contrato de datos original lo mezclaba. Cuando
  // es true, `rir` no se lee — se conserva por compatibilidad con logs viejos.
  alFallo?: boolean;
}

export interface WorkoutEntryLog {
  exerciseId: string;
  sets: WorkoutSetLog[];
  note?: string;         // athlete's note on this specific exercise
  noteCoachSeen?: boolean;
}

export interface WorkoutLog {
  id: string;
  athleteId: string;
  workoutId: string;
  assignmentId: string;
  mesocycleId?: string; // resolved from assignment at creation time; older logs may lack it
  date: string;        // YYYY-MM-DD
  completedAt: string; // ISO timestamp string
  entries: WorkoutEntryLog[];
  note?: string;         // athlete's note on the workout as a whole
  noteCoachSeen?: boolean;
}

export interface WorkoutAssignment {
  id: string;
  workoutId: string;
  athleteId: string;
  date: string;
  status: 'pending' | 'completed' | 'skipped' | 'perdido';
  mesocycleId?: string;
}

// ─── QUESTIONNAIRES ───────────────────────────────────────────────────────────

export type QuestionType = 'numeric' | 'scale' | 'choice' | 'text' | 'boolean' | 'metric' | 'media';

export type QScheduleType = 'once' | 'weekdays' | 'interval' | 'monthly' | 'plan_week' | 'mesocycle_end';

export interface QSchedule {
  type: QScheduleType;
  weekdays?: number[];    // 0=Sun..6=Sat  (for 'weekdays')
  intervalDays?: number;  // (for 'interval')
  dayOfMonth?: number;    // (for 'monthly')
  planWeek?: number;          // (for 'plan_week') 1-indexed week since assignment.startDate
  planWeekday?: number;       // (for 'plan_week') 0=Sun..6=Sat, default = startDate's weekday
  mesocycleOffsetDays?: number; // (for 'mesocycle_end') days before/after the mesocycle's last day, default 0
}

// Perímetros y peso corporal recogidos vía preguntas tipo 'metric'. El peso
// (`bodyweight`) no genera un BodyMeasurement — reutiliza bodyweightLogs para
// no partir en dos la serie que ya alimenta perfil/reportes/periodización.
export type BodyMetricKey =
  | 'bodyweight' | 'altura' | 'pecho' | 'cintura' | 'abdomen' | 'cadera'
  | 'biceps_izq' | 'biceps_der' | 'muslo_izq' | 'muslo_der' | 'gemelo' | 'cuello';

export interface QuestionnaireQuestion {
  id: string;
  label: string;
  type: QuestionType;
  required: boolean;
  helpText?: string;
  graphable?: boolean;       // auto-true for numeric/scale; used in R2 charts
  // numeric
  unit?: string;
  min?: number;
  max?: number;
  decimals?: number;
  // scale
  scaleMin?: number;         // default 1
  scaleMax?: number;         // default 10
  scaleMinLabel?: string;
  scaleMaxLabel?: string;
  // choice
  options?: string[];
  multiSelect?: boolean;
  // text
  maxChars?: number;
  // boolean
  labelTrue?: string;        // default 'Sí'
  labelFalse?: string;       // default 'No'
  // metric
  metricKey?: BodyMetricKey;
  // media
  mediaKind?: 'video' | 'image';
  maxSizeMb?: number;        // default 50
}

export interface Questionnaire {
  id: string;
  ownerId: string;   // coachUid
  title: string;
  description?: string;
  questions: QuestionnaireQuestion[];
}

// Personalización por cliente sobre la plantilla maestra: el questionId se
// conserva siempre, así que gráficas/correlaciones/reportes pueden seguir
// comparando la misma pregunta entre atletas y en el tiempo aunque cada uno
// tenga su propia versión (ocultada, reformulada o con preguntas extra).
export interface QuestionnaireOverrides {
  hidden?: string[];                       // questionIds ocultos para este atleta
  relabeled?: Record<string, string>;      // questionId -> enunciado propio
  required?: Record<string, boolean>;      // questionId -> forzar/quitar obligatoriedad
  extra?: QuestionnaireQuestion[];         // preguntas exclusivas de este atleta (id con prefijo 'x_')
  order?: string[];                        // orden personalizado de questionIds (plantilla + extra)
}

export interface QuestionnaireAssignment {
  id: string;
  questionnaireId: string;
  athleteId: string;           // email
  schedule: QSchedule;
  startDate: string;           // YYYY-MM-DD
  active: boolean;
  createdAt: string;
  overrides?: QuestionnaireOverrides;
}

export interface QuestionnaireResponse {
  id: string;
  questionnaireId: string;
  assignmentId: string;
  athleteId: string;           // email
  submittedAt: string;
  answers: { questionId: string; value: string | number | boolean }[];
}

// ─── BODY MEASUREMENTS ─────────────────────────────────────────────────────────
// Serie propia de perímetros corporales. Se escribe desde una respuesta de
// cuestionario (pregunta tipo 'metric') o manualmente. docId determinista
// `${athleteId}_${date}_${metricKey}` (mismo patrón que progressPhotos) para
// que responder dos veces el mismo día sobrescriba en vez de duplicar.

export interface BodyMeasurement {
  id: string;
  athleteId: string;  // email
  date: string;       // YYYY-MM-DD
  metricKey: BodyMetricKey;
  value: number;
  unit: 'cm' | 'kg';
  source: 'questionnaire' | 'manual';
  responseId?: string;
  createdAt: string;  // ISO timestamp
}

export const BODY_METRIC_LABELS: Record<BodyMetricKey, string> = {
  bodyweight: 'Peso corporal',
  altura:     'Altura',
  pecho:      'Contorno de pecho',
  cintura:    'Perímetro de cintura',
  abdomen:    'Perímetro de abdomen',
  cadera:     'Perímetro de cadera',
  biceps_izq: 'Bíceps izquierdo',
  biceps_der: 'Bíceps derecho',
  muslo_izq:  'Muslo izquierdo',
  muslo_der:  'Muslo derecho',
  gemelo:     'Gemelo',
  cuello:     'Cuello',
};

export const BODY_METRIC_UNITS: Record<BodyMetricKey, 'cm' | 'kg'> = {
  bodyweight: 'kg', altura: 'cm', pecho: 'cm', cintura: 'cm', abdomen: 'cm', cadera: 'cm',
  biceps_izq: 'cm', biceps_der: 'cm', muslo_izq: 'cm', muslo_der: 'cm', gemelo: 'cm', cuello: 'cm',
};

// ─── BODYWEIGHT ───────────────────────────────────────────────────────────────

export interface BodyweightLog {
  id: string;
  athleteId: string;  // email
  date: string;       // YYYY-MM-DD
  weight: number;
  kind?: 'daily' | 'weekly_avg'; // cómo lo registró el atleta; undefined (docs antiguos) = 'daily'
  createdAt: string;  // ISO timestamp
}

// Kept separate from BodyweightLog so step tracking never has to carry a
// placeholder weight value — manual entry until Fase 3 wires up Apple Health /
// Google Health Connect (see AthleteNutritionConfig.stepGoal for the target).
export interface StepLog {
  id: string;
  athleteId: string;  // email
  date: string;       // YYYY-MM-DD
  steps: number;
  source: 'manual' | 'apple_health' | 'google_health_connect';
  createdAt: string;  // ISO timestamp
}

// ─── ONBOARDING ──────────────────────────────────────────────────────────────

export type DietType        = 'omnivoro' | 'vegano' | 'vegetariano' | 'otro';
export type ExperienceLevel = 'principiante' | 'intermedio' | 'avanzado';
export type ActivityLevel   = 'sedentario' | 'poco_activo' | 'activo' | 'muy_activo';
export type GoalBody        = 'aumentar_musculo' | 'reducir_grasa' | 'mantener';
export type GoalCapacity    = 'fuerza' | 'fuerza_resistencia' | 'salud';

export interface OnboardingMeal {
  intakeType:  number;    // 1=Desayuno 2=Media 3=Comida 4=Merienda 5=Cena
  name:        string;
  needsTupper: boolean;
}

export interface MacroSplit { hc: number; prot: number; grasa: number }
export interface MacroGrams { hc: number; prot: number; grasa: number }

export interface SupplementEntry { name: string; dose: string; frequency: string }

export type ProgressFrequency = 'cada_semana' | 'cada_varias_semanas' | 'con_dificultad';
export type TechniqueLevel    = 'mala' | 'regular' | 'buena' | 'muy_buena';
export type SleepRoutineOrScreen = 'rutina' | 'pantalla';

export interface OnboardingData {
  athleteId:          string;         // email
  /** A-2. Consentimiento explícito para que sus datos se analicen con IA
   *  (Anthropic). Ausente = no ha contestado, y sin respuesta NO se envía nada:
   *  son datos de salud, art. 9 del RGPD. La lógica y el porqué, en
   *  `src/ai/consentimientoIA.ts`. */
  consentimientoIA?:  { aceptado: boolean; fecha: string; version: number };
  // ── Composición corporal ──────────────────────────────────────────────────
  sex?:               'male' | 'female';
  birthDate?:         string;         // YYYY-MM-DD
  weightKg?:          number;
  heightCm?:          number;
  bodyFatPct?:        number;
  musclePct?:         number;
  // ── Datos personales adicionales ───────────────────────────────────────────
  occupation?:        string;
  referralSource?:    string;         // ¿cómo nos conociste?
  goalFreeText?:      string;         // objetivo en texto libre (además de goalBody/goalCapacity)
  // ── Actividad ─────────────────────────────────────────────────────────────
  activityLevel?:     ActivityLevel;
  // ── Objetivo ──────────────────────────────────────────────────────────────
  goalBody?:          GoalBody;
  goalCapacity?:      GoalCapacity;
  // ── Salud ─────────────────────────────────────────────────────────────────
  hasCurrentInjury?:      boolean;
  currentInjuryLocation?: string;
  currentInjuryIntensity?: number;    // 1–10
  currentInjuryMovements?: string;    // gestos/movimientos que duelen
  hadPastInjuries?:       boolean;
  pastInjuriesDetail?:    string;
  takesMedication?:       boolean;
  medicationDetail?:      string;
  recentSurgery?:         boolean;
  recentSurgeryDetail?:   string;
  smokesAlcoholSubstances?: string;   // tabaco/alcohol/otras sustancias, texto libre
  sunExposureWeekly?:     string;
  // ── Nutrición ─────────────────────────────────────────────────────────────
  dietType:           DietType;
  targetCalories:     number;
  macroSplit:         MacroSplit;     // percentages (hc+prot+grasa = 100)
  macroGrams:         MacroGrams;     // computed grams/day
  appetitePeakTime?:      string;     // momento del día con más apetito
  dietSince?:             string;     // desde cuándo sigue dieta vegana/vegetariana
  hadOverweightHistory?:  boolean;
  foodRelationshipGood?:  boolean;
  foodRelationshipReason?: string;    // por qué, si la relación no es buena
  eatsTooFast?:           boolean;
  supplements?:           SupplementEntry[];
  weightTendency?:        string;     // tendencia a ganar/perder peso, texto libre
  neckCm?:                number;
  waistCm?:               number;
  hipCm?:                 number;
  // ── Alimentos ─────────────────────────────────────────────────────────────
  likedFoods:         string[];
  dislikedFoods:      string[];
  allergies:          string[];
  // ── Comidas ───────────────────────────────────────────────────────────────
  mealCount?:         number;         // 3 | 4 | 5
  meals?:             OnboardingMeal[];
  // ── Cocina ────────────────────────────────────────────────────────────────
  cookingLevel?:      number;         // 1–5
  cookingMaxTime?:    number;         // minutes
  breakfastVariety?:  number;         // 1–5
  lunchVariety?:      number;         // 1–5
  menuVariety?:       number;         // 1–5, preference for the auto-generated weekly menu (1=repetitive, 5=max variety)
  batchCookingPreferred?: boolean;    // prefers cooking the whole week's meals in one session
  preferredDishTypes?: string[];      // dish types the athlete wants more of (see utils/dishTypes)
  excludedDishTypes?: string[];       // dish types the athlete wants to avoid
  // ── Entrenamiento ─────────────────────────────────────────────────────────
  equipment:          string[];
  favoriteExercises:  string[];
  hatedExercises:     string[];
  experienceLevel:    ExperienceLevel;
  injuries:           string;
  oneRepMaxTotal?:        number;     // press banca + sentadilla + peso muerto
  progressFrequency?:     ProgressFrequency;
  techniqueLevel?:        TechniqueLevel;
  currentMotivation?:     number;     // 1–10
  muscleGroupsToImprove?: string;
  restDayActive?:         boolean;
  restDayActiveDetail?:   string;
  sittingHoursPerDay?:    number;
  stressReason?:          string;     // motivo del nivel de estrés (complementa la plantilla)
  // ── Descanso ──────────────────────────────────────────────────────────────
  sleepDeficitCauses?:    string[];   // checkboxes: cuesta dormir / estrés / pensamientos / ansiedad / duerme pero no descansa
  sleepRoutineOrScreen?:  SleepRoutineOrScreen;
  sleepMedication?:       boolean;
  sleepMedicationDetail?: string;
  // ── Meta ──────────────────────────────────────────────────────────────────
  completedAt:        string;         // ISO timestamp
  extraAnswers?:      Record<string, string | number>;
}

export type OnboardingSection = 'entrenamiento' | 'nutricion' | 'descanso';

export interface OnboardingTemplateQuestion {
  id: string;
  label: string;
  section: OnboardingSection;
  type: 'numeric' | 'scale' | 'choice' | 'text';
  options?: string[];
  unit?: string;
  scaleMin?: number;
  scaleMax?: number;
}

export interface OnboardingTemplate {
  coachEmail: string;
  questions: OnboardingTemplateQuestion[];
}

// ─── DIET ─────────────────────────────────────────────────────────────────────

export interface DietItem {
  category: FoodCategory;
  foodLabel: string;
  quantity: number;   // multiples of 0.25 (e.g. 0.25, 0.5, 1, 1.25)
  grams?: number;     // computed: parsed base weight × quantity
  originRecipeId?: string; // set when the item was added via "Usar receta" — scopes "Cambiar comida"
}

export interface DietMeal {
  id: string;
  name: string;
  items: DietItem[];
  target?: Record<FoodCategory, number>; // per-meal exchange targets (optional, set by coach)
  /** Franja horaria: 1=Desayuno 2=Media mañana 3=Comida 4=Merienda 5=Cena.
   *  Misma escala que OnboardingMeal.intakeType y MenuMeal.slot (utils/menuEngine.ts).
   *  Ausente en dietas antiguas — se resuelve con utils/mealDistribution.ts:resolveSlots(). */
  slot?: number;
  /** Ingesta pegada al entreno (pre/post) — como mucho una por dieta. El
   *  reparto automático (utils/mealDistribution.ts) sesga hidratos hacia ella. */
  aroundTraining?: boolean;
}

export interface Diet {
  id: string;
  athleteId: string;  // email
  name: string;
  budget: Record<FoodCategory, number>; // total exchanges per category for the day
  meals: DietMeal[];
  coachNote?: string;
  isDraft?: boolean;
  selfManaged?: boolean; // true = created by the athlete in "Mis Dietas", private to them
}

export type WeekDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface AthleteDietConfig {
  athleteId: string;        // email
  activeDietIds: string[];  // which of their diets are enabled in the tracker
  weeklySchedule?: Partial<Record<WeekDay, string | null>>; // day → dietId or null (libre)
}

// Doc id = `${athleteId}_${date}`. One log per athlete per day; doneItemIds keys
// match NutritionScreen's in-memory item keys (`${mealId}_${itemIdx}`) so the
// persisted state can be loaded straight into the existing itemStates shape.
export interface DietCompletionLog {
  id: string;
  athleteId: string;  // email
  date: string;        // YYYY-MM-DD
  dietId: string;
  doneItemIds: string[];
}

export interface NutritionPhase {
  id: string;
  name: string;
  weeks: number;
  dietId: string;
  targetWeight?: number; // kg at end of phase; undefined = not projected
  targetKcal?: number;   // kcal/day objective driving the deficit/surplus calc; undefined = derive from the linked diet's exchange budget
}

export interface NutritionProgram {
  athleteId: string;          // email, also the Firestore doc id
  startDate: string;          // YYYY-MM-DD
  phases: NutritionPhase[];
  lastSeenPhaseId?: string;   // tracks when athlete saw the phase change banner
}

export interface RoadmapItem {
  id: string;
  title: string;
  description?: string;
  type: 'objetivo' | 'hito' | 'nota';
  lane: 'entreno' | 'nutricion' | 'movilidad' | 'general';
  startDate?: string;   // YYYY-MM-DD
  targetDate?: string;  // YYYY-MM-DD
  status?: 'pendiente' | 'en_progreso' | 'logrado';
}

export interface Roadmap {
  athleteId: string;    // email, also Firestore doc id
  items: RoadmapItem[];
  planPhases?: PlanPhase[];   // fases macro por progresión; ausente en docs antiguos
  levelLadder?: LevelLadder;  // undefined → usar DEFAULT_LEVEL_LADDER
  challengeConfig?: ChallengeConfig;
}

// Configuración de retos por atleta (dentro del doc roadmap).
export interface ChallengeConfig {
  // Ejercicios en los que se pueden proponer retos de carga; undefined/vacío →
  // fallback a los básicos por keyword (BASIC_LIFT_KEYWORDS).
  liftExerciseIds?: string[];
}

// ─── PLAN PHASES ──────────────────────────────────────────────────────────────
// Fases macro del asesoramiento por PROGRESIÓN, no por tiempo (metodología del
// coach). El paso de fase lo decide el coach manualmente; la app solo informa
// del % de avance de las métricas objetivo de la fase actual.

export type PhaseMetricKind =
  | 'peso'            // llegar a X kg
  | 'peso_perdido'    // perder X kg desde el inicio
  | 'sentadilla_xbw'  // e1RM sentadilla ÷ peso corporal ≥ X
  | 'pasos_media'     // media diaria de pasos ≥ X
  | 'adherencia'      // adherencia semanal a la dieta ≥ X %
  | 'manual';         // el coach lo marca a mano (sin datos en la app)

export interface PhaseMetricTarget {
  id: string;
  kind: PhaseMetricKind;
  label: string;            // "Bajar a 82 kg", "Sentadilla 1.25x peso corporal"
  targetValue?: number;
  unit?: string;            // 'kg' | 'xBW' | 'pasos' | '%'
  manualDone?: boolean;     // solo kind 'manual'
}

export type WeightDirection = 'deficit' | 'superavit' | 'mantenimiento';

export interface PlanPhase {
  id: string;
  order: number;
  name: string;             // "Pérdida de grasa", "Recomposición"…
  motto?: string;           // frase motivadora corta
  description?: string;
  color: string;            // de PHASE_COLORS (theme.ts)
  icon: string;             // material symbol
  status: 'futura' | 'actual' | 'completada';
  startedAt?: string;       // YYYY-MM-DD
  completedAt?: string;
  metrics: PhaseMetricTarget[];
  exitCriteria?: string;    // texto libre: qué hace falta para pasar de fase
  // Datos para generar la periodización nutricional desde las fases del plan.
  suggestedWeeks?: number;       // duración orientativa (las fases van por progresión)
  weightDirection?: WeightDirection;
  weightRateKgWeek?: number;     // magnitud kg/semana; el signo lo da weightDirection
  nutritionPhaseId?: string;     // NutritionPhase generada/enlazada (`nph_${id}`)
}

// ─── LEVEL LADDER ─────────────────────────────────────────────────────────────
// Escalera vertical de niveles con nombres motivadores. Un nivel se alcanza
// cuando se cumplen TODOS sus criterios; una vez alcanzado no se pierde
// (achievedLevelIds persiste el logro).

export type LevelCriterionKind =
  | 'peso_perdido_kg'     // kg perdidos desde el peso inicial
  | 'sentadilla_xbw'      // e1RM del ejercicio ÷ peso corporal ≥ target
  | 'pasos_media_diaria'  // media diaria de pasos (4 semanas) ≥ target
  | 'manual';             // verificado por el coach (flexiones, dominadas…)

export interface LevelCriterion {
  id: string;
  kind: LevelCriterionKind;
  label: string;              // "10 dominadas estrictas", "Sentadilla 1x peso corporal"
  targetValue?: number;       // no aplica a 'manual'
  exerciseNameMatch?: string; // sentadilla_xbw: substring del nombre del ejercicio
  manualDone?: boolean;       // el coach lo marca al verificarlo
}

export interface LadderLevel {
  id: string;
  order: number;              // 0 = base
  name: string;               // "Club" → "Hombre Sano" → …
  icon: string;
  criteria: LevelCriterion[]; // deben cumplirse TODOS
}

export interface LevelLadder {
  levels: LadderLevel[];
  achievedLevelIds?: Record<string, string>; // levelId → YYYY-MM-DD en que se logró
}

// ─── WEEKLY CHALLENGES ────────────────────────────────────────────────────────
// Reto semanal del atleta. Doc ID determinista `${athleteId}_${isoWeek}` en la
// colección weeklyChallenges: garantiza un único reto por semana y hace
// idempotente la auto-generación (generate-on-read, sin backend).

export type ChallengeKind =
  | 'pasos_media'          // media diaria de pasos ≥ target
  | 'pasos_total'          // pasos totales de la semana ≥ target
  | 'carga_ejercicio'      // superar e1RM en un ejercicio concreto
  | 'adherencia_dieta'     // adherencia semanal ≥ target %
  | 'peso_objetivo'        // terminar la semana en ≤/≥ target kg (según baseline)
  | 'entrenos_completados' // completar los entrenos asignados de la semana
  | 'custom';              // creado por el coach sin métrica automática

export interface WeeklyChallenge {
  id: string;               // `${athleteId}_${isoWeek}`
  athleteId: string;        // email
  isoWeek: string;          // '2026-W28'
  weekStart: string;        // YYYY-MM-DD (lunes)
  weekEnd: string;          // YYYY-MM-DD (domingo)
  kind: ChallengeKind;
  title: string;
  description: string;
  origin: 'coach' | 'auto';
  templateId?: string;
  metric: {
    unit: string;           // 'pasos' | 'kg' | '%' | 'sesiones'
    target: number;
    baseline?: number;      // punto de partida (media previa, peso actual…)
    exerciseId?: string;    // carga_ejercicio
    exerciseName?: string;  // snapshot para pintar sin lookup
  };
  status: 'activo' | 'conseguido' | 'fallido';
  progressValue?: number;   // snapshot de la última evaluación
  createdAt: string;        // ISO
  resolvedAt?: string;      // ISO
}

// Plantilla de la biblioteca de retos del coach (colección challengeTemplates).
export interface ChallengeTemplate {
  id: string;
  ownerId: string;          // UID del coach
  kind: ChallengeKind;
  title: string;
  description: string;
  defaultTarget?: number;
  unit: string;
}

// Coach invites a new client by email (passwordless sign-in link). Doc id = email.
export interface Invite {
  id: string;          // = email
  email: string;
  invitedAt: string;   // ISO timestamp, overwritten on resend
  status: 'pending' | 'joined';
  joinedAt?: string;
}

export type PhotoView = 'front' | 'side' | 'back';

export interface ProgressPhoto {
  id: string;          // `${athleteId}_${date}_${view}`
  athleteId: string;   // email
  date: string;        // YYYY-MM-DD
  view: PhotoView;
  url: string;
  uploadedAt: string;  // ISO timestamp
}

export interface PhotoAssignment {
  id: string;
  athleteId: string;   // email
  schedule: QSchedule;
  startDate: string;   // YYYY-MM-DD
  views: PhotoView[];  // which views must be uploaded per occurrence
  active: boolean;
  createdAt: string;
}

export interface RecipeIngredient {
  foodLabel: string;
  category: FoodCategory;
  mode: DietMode;
  quantity: number; // multiples of 0.25
}

export interface RecetaIngrediente {
  name: string;
  quantity: number; // grams or units
}

export interface RecetaPaso {
  position: number;
  description: string;
}

export interface Recipe {
  id: string;
  ownerId: string;    // UID de Firebase, o el centinela del recetario importado (OWNER_RECETARIO en db/recipes)
  name: string;
  photoUrl?: string;
  // ── Coach / athlete builder ───────────────────────────────────────────────
  categories: string[];
  ingredients: RecipeIngredient[];
  extras: string[];
  steps: string[];
  // ── imported only fields (all optional) ────────────────────────────────────
  image?: string;
  ingredientsText?: RecetaIngrediente[];
  stepsText?: RecetaPaso[];
  macros?: { carb: number; prot: number; fat: number };
  kcal?: number;
  weight?: number;
  cookingTime?: number;
  difficulty?: number;
  tupper?: boolean;
  intakeTypes?: number[];
  categoria?: string;
  exchanges?: { HC: number; PROT: number; GRASA: number };
}

export interface RecipeFavorites {
  athleteId: string; // email
  recipeIds: string[];    // favorites — surface more in the generator/swaps
  dislikedIds?: string[]; // "no me gusta" — hard-excluded from the generator/swaps
}

// ─── WEEKLY MENUS ─────────────────────────────────────────────────────────────
// Recipe-first weekly menu generated by the coach from a client's exchange-type
// diets (Diet.budget) and their weeklySchedule. Athlete can swap meals freely
// within tolerance once published; see utils/menuEngine.ts for the generator.

export type BudgetVec = { HC: number; PROT: number; GRASA: number };

export interface MenuComplement {
  foodLabel: string;
  category: FoodCategory;
  quantity: number; // exchanges, multiples of 0.25
}

export interface MenuMeal {
  id: string;
  slot: number; // intakeType 1-5
  name: string; // "Desayuno", "Comida"...
  recipeId: string;
  recipeName: string;  // denormalized so the viewer can render without a fetch
  recipeImage?: string;
  scale: number;       // 0.5-2.0, steps of 0.25
  exch: BudgetVec;      // exchanges already scaled
  kcal: number;
  complements: MenuComplement[];
  // Athlete swapped an ingredient for a same-group equivalent (e.g. leche → bebida
  // de avena). Approximate equivalence, so exch/kcal are left unchanged; the viewer
  // renders `to` in place of `from`. See utils/ingredientSubstitutions.
  ingredientSwaps?: { from: string; to: string }[];
}

export interface MenuDay {
  day: WeekDay;
  dietId: string | null;
  dietName?: string;
  target: BudgetVec;   // snapshot of the linked diet's budget at generation time
  meals: MenuMeal[];
}

export interface MenuSwapEntry {
  at: string; // ISO timestamp
  day: WeekDay;
  mealId: string;
  fromRecipeId: string;
  fromRecipeName: string;
  toRecipeId: string;
  toRecipeName: string;
  toScale: number;
}

export interface WeeklyMenu {
  id: string;
  athleteId: string; // email
  status: 'draft' | 'published' | 'archived';
  name: string;
  createdAt: string;
  publishedAt?: string;
  varietyLevel: number; // 1 (monotone) - 5 (max variety)
  batchCooking?: boolean; // true = generated to minimize distinct recipes so the athlete can cook the whole week at once
  days: MenuDay[];
  coachNote?: string;
  swapHistory: MenuSwapEntry[];
}

// Athlete's tick-off of a published menu's meals. Kept in its own collection
// (doc id = `${athleteId}_${date}`) rather than reusing DietCompletionLog, so
// menu progress never mixes with the Intercambios tracker's per-item state and
// can't inflate that diet's adherence. Keys are `${day}_${mealId}`.
export interface MenuCompletionLog {
  id: string;
  athleteId: string;  // email
  date: string;        // YYYY-MM-DD
  menuId: string;
  doneMealKeys: string[];
}

// ─── MESOCYCLE ────────────────────────────────────────────────────────────────

export type MuscleGroup =
  | 'pecho' | 'dorsal' | 'trapecio'
  | 'deltoide_ant' | 'deltoide_lat' | 'deltoide_post'
  | 'biceps' | 'triceps' | 'antebrazo'
  | 'cuadriceps' | 'isquios' | 'gluteo' | 'aductores' | 'gemelo' | 'core';

export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  pecho:         'Pecho',
  dorsal:        'Dorsal',
  trapecio:      'Trapecio',
  deltoide_ant:  'Deltoides ant.',
  deltoide_lat:  'Deltoides lat.',
  deltoide_post: 'Deltoides post.',
  biceps:        'Bíceps',
  triceps:       'Tríceps',
  antebrazo:     'Antebrazo',
  cuadriceps:    'Cuádriceps',
  isquios:       'Isquiotibiales',
  gluteo:        'Glúteo',
  aductores:     'Aductores',
  gemelo:        'Gemelo',
  core:          'Core',
};

// T10 (18-08). Antes había cuatro copias de este mismo orden repartidas por
// MesocycleDashboard, MesocycleManager, MesocycleTemplateLibrary y
// ExerciseLibraryScreen (esta última como MACRO_MUSCLE_GROUPS) — exactamente
// por eso añadir un grupo nuevo era caro: había que tocar el mismo enum en
// cinco sitios. Un único origen de verdad.
export const MUSCLE_ORDER: MuscleGroup[] = [
  'pecho', 'dorsal', 'trapecio',
  'deltoide_ant', 'deltoide_lat', 'deltoide_post',
  'biceps', 'triceps', 'antebrazo',
  'cuadriceps', 'isquios', 'gluteo', 'aductores', 'gemelo', 'core',
];

// Etiquetas cortas para tablas y gráficas estrechas (MesocycleDashboard). No
// son solo MUSCLE_LABELS truncado: "Delt.Ant" no es "Deltoides ant." cortado,
// es la abreviatura que ya se usaba.
export const MUSCLE_LABELS_SHORT: Record<MuscleGroup, string> = {
  pecho: 'Pecho', dorsal: 'Dorsal', trapecio: 'Trapecio',
  deltoide_ant: 'Delt.Ant', deltoide_lat: 'Delt.Lat', deltoide_post: 'Delt.Post',
  biceps: 'Bíceps', triceps: 'Tríceps', antebrazo: 'Antebrazo',
  cuadriceps: 'Cuáds', isquios: 'Isquios', gluteo: 'Glúteo',
  aductores: 'Aduct.', gemelo: 'Gemelo', core: 'Core',
};

export interface MuscleGroupConfig {
  series: number;          // 0..25 series semanales
  priority: 'alta' | 'media' | 'baja';
}

export interface DayAssignment {
  group: MuscleGroup;
  series: number;
}

export interface DayPlan {
  assignments: DayAssignment[];
  totalSeries: number;
  dayType?: string; // etiqueta del reparto elegido (p.ej. "Torso", "Push") — solo visual
}

export interface WeekDistribution {
  days: DayPlan[];
  overloadAlert: boolean;
  snapshot: {
    daysPerWeek: number;
    groupSeries: Partial<Record<MuscleGroup, number>>;
  };
  generatedAt: string;
}

export interface Mesocycle {
  id: string;
  athleteId: string;
  number: number;
  weeks: number;
  startDate: string;
  objective: string;
  daysPerWeek: number;
  groups: Record<MuscleGroup, MuscleGroupConfig>;
  distribution?: WeekDistribution;
  days?: TemplateDay[];
  programId?: string;      // links mesocycles created from the same template
  programOrder?: number;   // position in the sequence (0-based)
  splitId?: string;        // id del reparto de días elegido (ver utils/trainingSplits.ts)
}

export interface MesocycleTemplate {
  id: string;
  ownerId: string;
  name: string;
  description?: string;
  stages: TemplateStage[];
}

// ─── PENDING TASKS (athlete dashboard) ─────────────────────────────────────────
// Generic task feed for the "Tareas pendientes" dashboard block. New task types
// (e.g. future integrations) just add a TaskType value + a case in the renderer's
// icon/color map — no change needed to the aggregation or storage shape.

export type TaskType = 'revision' | 'cuestionario' | 'foto' | 'manual' | 'otro';

export interface TaskItem {
  id: string;
  athleteId: string;      // email
  type: TaskType;
  title: string;
  dueDate?: string;       // YYYY-MM-DD
  status: 'pending' | 'done';
  linkTab?: 'checkin' | 'training' | 'nutrition' | 'roadmap';
  createdBy: 'system' | 'coach';
  createdAt: string;      // ISO timestamp
}

// Coach's own private to-do list ("enviar mensaje a X", "cambiar rutina a Y").
// Never visible to athletes — separate from TaskItem, which is a task the
// coach assigns TO an athlete.
export interface CoachNote {
  id: string;
  text: string;
  relatedAthleteEmail?: string;  // optional link to a client
  relatedAthleteName?: string;   // denormalized for display without extra lookups
  done: boolean;
  createdAt: string;             // ISO timestamp
}

// Coach's setup checklist for a single client: seeded items (auto-detected steps
// the coach must confirm manually, e.g. "contacto diario semana 1") plus free-form
// extras the coach adds. Distinct from TaskItem (assigned TO the athlete, visible
// to them) and CoachNote (a global to-do, not tied to a checklist item/phase).
export interface CoachClientTask {
  id: string;
  athleteId: string;        // email
  itemId?: string;          // links to a SetupItem id when createdBy === 'seed'
  title: string;
  phase?: string;           // SetupPhaseId, when relevant
  done: boolean;
  doneAt?: string;          // ISO timestamp
  dueDate?: string;         // YYYY-MM-DD
  createdBy: 'seed' | 'coach';
  createdAt: string;        // ISO timestamp
}

// ─── RESOURCES (coach-shared files/links) ──────────────────────────────────────

export type ResourceKind = 'pdf' | 'video' | 'image' | 'doc' | 'link' | 'guide';

export interface Resource {
  id: string;
  coachId: string;
  title: string;
  kind: ResourceKind;
  url: string;
  createdAt: string; // ISO timestamp
}

// ─── TRAININGLAB (academia de vídeo: cursos > lecciones, drip) ─────────────────

export type AcademyCategory = 'entrenamiento' | 'nutricion' | 'fisiologia' | 'biomecanica' | 'mentalidad' | 'recuperacion';

export type UnlockRule =
  | { type: 'immediate' }
  | { type: 'daysSinceJoin'; value: number }
  | { type: 'level'; value: number }
  | { type: 'prerequisite'; value: string }; // courseId

export interface AcademyCourse {
  id: string;
  title: string;
  description: string;
  category: AcademyCategory;
  coverImageUrl?: string;
  order: number;
  published: boolean;
  unlockRule: UnlockRule;
  lessonCount: number; // denormalized, kept in sync on lesson create/delete
}

export interface AcademyLessonResource {
  kind: 'pdf' | 'link';
  title: string;
  url: string;
}

export interface AcademyLesson {
  id: string;
  courseId: string;
  title: string;
  description?: string;
  order: number;
  videoProvider: 'youtube' | 'vimeo';
  videoId: string;
  durationSec?: number;
  resources?: AcademyLessonResource[];
  unlockRule?: UnlockRule; // overrides course-level rule when present
}

export interface AcademyProgress {
  athleteId: string; // email, doc id
  completed: { [lessonId: string]: string };   // ISO date completada
  courseProgress: { [courseId: string]: number }; // 0..100
  lastLessonId?: string;
  lastCourseId?: string;
}

// Capa 1 — entitlement: quién ve la pestaña Academia. Sin doc (o enabled=false)
// el atleta ni la ve. grantedCourses opcional para acceso granular por curso.
export interface AcademyAccess {
  athleteId: string; // email, doc id
  enabled: boolean;
  grantedCourses?: string[];
  grantedBy: string;
  grantedAt: string; // ISO
}

// ─── CARDIO (zonas de FC, BLE en vivo, tests de campo) ─────────────────────────

export type CardioZoneMethod = 'hrr' | 'hrmax' | 'lthr';

export interface CardioZoneBand { min: number; max: number } // BPM

export interface CardioZones { z1: CardioZoneBand; z2: CardioZoneBand; z3: CardioZoneBand; z4: CardioZoneBand; z5: CardioZoneBand }

export interface AthleteCardioProfile {
  athleteId: string; // email, doc id
  restingHR?: number;
  maxHR?: number;
  lthr?: number;
  method: CardioZoneMethod;
  zones: CardioZones;
  updatedAt: string; // ISO
  updatedBy: string; // coach email, o 'auto' si vino de un test aprobado
}

export type CardioSessionType = 'libre' | 'zona2' | 'intervalos';

// F9 del plan de réplica FITIV (docs/FITIV-analisis-y-plan.md §4.3): un
// bloque cierra por uno de estos criterios en vez de solo por tiempo.
// 'distance' se queda fuera — depende de GPS, aparcado en F7.
export type CardioIntervalCloseType = 'time' | 'zone' | 'heartRate' | 'calories' | 'manual';

export interface CardioIntervalBlock {
  label: string;
  closeType: CardioIntervalCloseType;
  durationSec: number; // estimación mostrada en el resumen aunque el cierre real sea por otro criterio
  targetZone?: keyof CardioZones; // color/anuncio del bloque en todos los tipos; criterio de cierre solo si closeType === 'zone'
  hrThresholdBpm?: number; // closeType === 'heartRate'
  hrDirection?: 'above' | 'below'; // closeType === 'heartRate'
  targetKcal?: number; // closeType === 'calories', acumulado dentro del bloque
}

export interface CardioAssignment {
  id: string;
  athleteId: string;
  type: CardioSessionType;
  targetDurationSec?: number;      // 'libre' / 'zona2'
  targetZone?: keyof CardioZones;  // 'zona2' (normalmente z2)
  intervals?: CardioIntervalBlock[]; // 'intervalos'
  timesPerWeek?: number;
  date?: string; // YYYY-MM-DD si es puntual; si no, recurrente por timesPerWeek
  active: boolean;
  createdAt: string; // ISO
}

export interface CardioSession {
  id: string;
  athleteId: string;
  assignmentId?: string;
  type: CardioSessionType;
  date: string;       // YYYY-MM-DD
  startedAt: string;  // ISO
  durationSec: number;
  avgHR?: number;
  maxHR?: number;
  timeInZoneSec: { z1: number; z2: number; z3: number; z4: number; z5: number };
  samples: number[];  // FC submuestreada 1/3-5s — nunca cruda por segundo (§7.4 del plan)
  sampleIntervalSec: number;

  // ── Motor de cálculo — F4 del plan de réplica FITIV (docs/FITIV-analisis-y-plan.md §5) ──
  // Todos opcionales: requieren datos de la anamnesis (peso/edad/sexo) que un
  // atleta puede no tener rellenos, o (TSS) el LTHR del perfil cardio.
  caloriesKcal?: number;       // Keytel corregida (§5.3) — la fórmula publicada de FITIV está mal transcrita
  caloriesActiveKcal?: number; // caloriesKcal menos el BMR (Mifflin-St Jeor) del tramo — solo si hay altura en la anamnesis
  mets?: number;
  fitivPoints?: number;     // METs × min, solo si METs > 3.0 (§5.5)
  trimp?: number;           // Banister, ponderación exponencial por sexo (§5.4)
  hrTss?: number;           // TSS de FC vía IF = FC media / LTHR (§5.4)
  perceivedEffort?: number; // 1–10, autoestimado por zona dominante y ajustable por el atleta
  effortMinutes?: number;   // PE × duración en minutos (§5.4)
  hrr1Min?: number;         // Heart Rate Recovery a 1 min (§5.6) — requiere 2 min de vuelta a la calma
  hrr2Min?: number;         // Heart Rate Recovery a 2 min

  // ── Anotación e historial — F5 del plan de réplica FITIV (§6) ──────────────
  title?: string;         // editable por el atleta; el tipo (`type`) no se puede cambiar, como en FITIV
  notes?: string;
  tags?: string[];
  manual?: boolean;       // añadida a mano, sin banda real — no otorga XP ni Puntos (regla de FITIV, §6)
}

// Objetivo semanal de cardio (F3.9, `objetivosCardio` del contrato). Doc ID
// determinista `${athleteId}_${isoWeek}`, mismo patrón que WeeklyChallenge.
// `minutesGoal`/`sessionsGoal` son lo único que persiste: los minutos hechos
// siempre se derivan de `cardioSessions` (ver weeklyCardioMinutesDone) para
// que el contador nunca pueda divergir de las sesiones reales. `closed`
// existe solo para no repetir el haptic de éxito una vez la semana ya cerró.
export interface CardioWeeklyGoal {
  id: string;          // `${athleteId}_${isoWeek}`
  athleteId: string;
  isoWeek: string;      // '2026-W28'
  minutesGoal: number;
  sessionsGoal?: number;
  closed: boolean;
  closedAt?: string;    // ISO
}

export type HrTestType = 'resting' | 'talktest' | 'tt30' | 'maxramp' | 'decoupling';

export interface HrTestResult {
  restingHR?: number;
  maxHR?: number;
  lthr?: number;
  z2Ceiling?: number;
  decouplingPct?: number;
}

export interface HrTest {
  id: string;
  athleteId: string;
  type: HrTestType;
  date: string;       // YYYY-MM-DD
  durationSec: number;
  result: HrTestResult;
  samples: number[];  // FC submuestreada
  approvedByCoach: boolean;
  notes?: string;
}

// ─── HRV MATINAL (F8 — docs/FITIV-analisis-y-plan.md §7/§8) ────────────────
// Medición puntual diaria (3 min tumbado, no continua) — a diferencia de
// HrTest no es una calibración que el coach aprueba: es un hábito del atleta,
// una lectura por día, mismo patrón que BodyweightLog/StepLog.
export interface HrvReading {
  id: string;
  athleteId: string;  // email
  date: string;       // YYYY-MM-DD
  rmssd: number;
  restingHR?: number;
  readinessScore?: number; // 0–100, solo si ya hay línea base (≥3 lecturas previas)
  rrIntervals: number[];   // ms — la materia prima del RMSSD, para poder recalcular si cambia el método
  createdAt: string;  // ISO timestamp
}

// ─── AI ASSISTANT (coach-only) ─────────────────────────────────────────────────
// Chat del asistente de IA del coach + propuestas de cambio pendientes de
// aprobación. La IA nunca escribe datos visibles para el atleta: sus tools de
// escritura solo crean AiProposal; el coach aprueba/rechaza desde la UI y la
// aprobación llama a los writers normales de dbService.

// Bloques de contenido tal y como los devuelve la Messages API de Anthropic.
// Se persisten VERBATIM (incluidos los bloques thinking, con su signature) para
// poder reenviar la conversación al modelo sin alterarla — la API rechaza
// bloques thinking modificados.
export interface AiTextBlock { type: 'text'; text: string }
export interface AiThinkingBlock { type: 'thinking'; thinking: string; signature?: string }
export interface AiToolUseBlock { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
export interface AiToolResultBlock { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }
export type AiContentBlock = AiTextBlock | AiThinkingBlock | AiToolUseBlock | AiToolResultBlock;

export interface AiChatMessage {
  role: 'user' | 'assistant';
  content: AiContentBlock[];
}

export interface AiChat {
  id: string;
  title: string;
  athleteId?: string;      // email del cliente activo cuando se abrió el chat
  createdAt: string;       // ISO
  updatedAt: string;       // ISO
  messages: AiChatMessage[];
}

export type AiProposalKind = 'diet' | 'mesocycle' | 'checkinFeedback';
export type AiProposalStatus = 'proposed' | 'approved' | 'rejected';

export type AiProposalPayload =
  | Omit<Diet, 'id'>
  | Omit<Mesocycle, 'id'>
  | { checkInId: string; feedback: string };

export interface AiProposal {
  id: string;
  athleteId: string;       // email
  kind: AiProposalKind;
  status: AiProposalStatus;
  chatId: string;          // AiChat que la generó
  summary: string;         // una línea en español, para la tarjeta
  rationale: string;       // justificación de la IA, expandible
  payload: AiProposalPayload;
  baseEntityId?: string;   // dietId/mesocycleId que modifica (vs. nuevo)
  resultEntityId?: string; // id de la entidad real creada al aprobar
  createdAt: string;       // ISO
  reviewedAt?: string;     // ISO, al aprobar/rechazar
}

// Nota de metodología ingerida desde la bóveda de Obsidian del coach (apuntes
// `interno-only` de cursos). Solo-coach: la IA la consulta vía search_knowledge
// para fundamentar sus propuestas, pero debe PARAFRASEAR, nunca reproducir el
// texto del curso al atleta (material de terceros).
export interface KnowledgeNote {
  id: string;              // `${folder}/${slug}` — determinista para reimportar sin duplicar
  title: string;
  folder: 'entrenamiento' | 'nutricion';
  tags: string[];
  text: string;            // cuerpo sin frontmatter
}

// Reglas fijas del coach para el asistente IA ("siempre empieza el mesociclo
// con una semana de descarga", etc.) — editables por el coach en la app,
// se inyectan en TODAS las conversaciones con prioridad sobre convenciones
// genéricas. Doc único de la colección coachSettings.
export interface CoachInstructions {
  text: string;
  updatedAt: string; // ISO
}

// Frases reutilizables para el feedback de revisiones (check-ins) — el coach
// las guarda una vez y las inserta con un clic en vez de escribirlas cada
// vez. Doc separado ('quickReplies') en la misma colección coachSettings.
export interface CoachQuickReplies {
  replies: string[];
  updatedAt: string; // ISO
}
