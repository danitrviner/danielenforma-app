# Auditoría de septiembre de 2026 — qué se encontró y qué se hizo

Entrega de lo que pedía el §28 del documento de auditoría. Cada fase vive en su
propia rama; nada está desplegado todavía.

| Rama | Commits | Ficheros |
|---|---|---|
| `fase-0-copias` | 2 | 6 |
| `fase-1-entrenos` | 3 | 9 |
| `fase-2-nutricion` | 7 | 21 |
| `fase-3-crm` | 5 | 23 |
| `fase-5-periodizacion` | 2 | 14 |

Suite completa: **1.802 tests en verde**, lint limpio en todas las ramas.

---

## Lo que resultó no ser lo que parecía

Tres de los cuatro fallos críticos tenían una causa distinta de la que se
suponía. Merece la pena leer esto antes que nada.

### 1. Los entrenos completados no se perdían

**Se suponía:** un fallo de guardado o de sincronización.

**Era:** «completado» vivía en dos sitios que podían contradecirse — el
`WorkoutLog` con las series que apuntó el atleta, y `WorkoutAssignment.status`.
Toda la interfaz leía el segundo, y el segundo se reescribía solo: al reasignar
un mesociclo, `handleAssign` borraba **todas** las asignaciones —también las de
días ya entrenados— y las recreaba en `pending`. El entreno seguía guardado; lo
que se perdía era la marca.

**Daño real en producción, medido:** 2 entrenos de un atleta sin ninguna
asignación (su día desapareció del calendario) y 3 asignaciones duplicadas. Nada
más. El resto de lo que parecía roto no lo estaba.

### 2. El servicio del CRM sí se guardaba

**Se suponía:** el formulario o la petición fallaban.

**Era:** la caché de catálogos. Está construida sobre el supuesto de que quien
escribe ya tiene el dato en su copia local, y por eso adelanta su sello de
versión en vez de invalidarlo — así se ahorra re-bajar el catálogo entero, que
es lo que agotó la cuota en agosto. El supuesto es cierto para
`addDoc`/`setDoc`/`updateDoc`/`writeBatch`, y **falso para `runTransaction`**,
que se ejecuta en el servidor y no alimenta la caché del dispositivo. Como el
sello local y el remoto coincidían, el servicio quedaba invisible **para siempre
en ese navegador**.

Las dos únicas escrituras por transacción del módulo eran, precisamente, «crear
servicio con sus cobros» y «registrar cobro de suscripción».

### 3. Los gramos de las recetas no se calculaban mal

**Se suponía:** un error de suma o de redondeo.

**Era:** dos fallos encadenados, reproducidos con recetas reales
(`scripts/diagGramosReceta.mjs`, detalle en `docs/gramos-e-intercambios.md`):

- `Recipe.exchanges` sale de los macros del **plato entero**. La pantalla
  reconstruía los gramos de **un ingrediente** multiplicando eso por el gramaje
  que el banco asigna a ese alimento. Al pan de un sándwich se le atribuía todo
  el hidrato del relleno.
- El banco y la receta miden estados distintos: «30 g arroz» es crudo, «125 g de
  arroz cocido» es cocido.

Medido: 60 g de pan salían como 40, 50 o **70 g según la receta**; 125 g de
arroz cocido, como 37,5 g. Los desvíos eran imprevisibles porque dependían de
qué más llevara el plato.

**El gramaje original no se guardaba en ninguna parte del plan diario**, así que
no había nada que reconstruir. Ahora se guarda.

### 4. Y las altas y renovaciones ya se calculaban bien

`facturacionDelMes` repartía correctamente. Lo que faltaba era el dato: el
`tipo` no se escribía casi nunca —ni al registrar un pago a mano ni en los
cobros que genera una suscripción—, así que el desglose salía en blanco y el
panel escondía la fila entera.

---

## Fase 0 — Copias de seguridad

No existía ninguna. Cualquier arreglo que escribiera en Firestore se hacía a
ciegas.

- **Copia automática diaria** programada en Google (id `df5ed8e7`), 7 versiones,
  fuera del Mac. Coste: céntimos al año (la base entera ocupa 26 MB).
- `scripts/backupFirestore.mjs` y `scripts/restaurarFirestore.mjs` para copias en
  mano antes de cada script que escriba en producción. La restauración exige
  confirmar el id de la base a mano y trae simulacro por defecto.
- `scripts/_lib/codecFirestore.mjs`: el primer volcado **falló a propósito** al
  encontrar `Timestamp` de Firestore en `checkins`, que JSON habría convertido en
  basura silenciosamente. El codec los convierte en los dos sentidos, y cualquier
  tipo que no conozca hace fallar la copia en voz alta.
- Procedimiento escrito en `docs/copias.md`.

**Medición de la base:** 11.898 documentos en 55 colecciones, de los cuales 8.500
son el recetario. Lo que cambia de verdad son ~3.400.

**Pendiente:** ensayar la restauración de una copia *automática*. La primera no
se había generado todavía al cerrar esto. La restauración desde copia local sí
está probada y funciona.

## Fase 1 — Entrenos completados

- `src/utils/estadoDeAsignacion.ts` — la regla del hecho consumado: si hay
  entreno guardado para ese día, ese día está hecho. Empareja por **atleta y
  fecha, no por rutina**: al regenerar, las rutinas se crean de cero y todos los
  `workoutId` son nuevos por definición, así que casar por rutina habría fallado
  justo en el caso que esto viene a arreglar. *(Lo descubrió un test.)*
- Reprogramar conserva los días pasados y los de hoy ya entrenados, **y sus
  rutinas** — si no, la asignación conservada apuntaría a una sesión inexistente
  y el atleta abriría su lunes vacío.
- Los tres sitios que borraban historial, corregidos.
- `scripts/repararEntrenosPerdidos.mjs` informa de lo que no puede arreglar solo.

**Corrección importante:** la primera versión de ese script daba 17 asignaciones
«a reparar». Estaba mal: contaba pendientes de días que ya tenían otra
asignación completada. Aplicarlo habría **inventado entrenos** e inflado la
adherencia de 4 atletas.

## Fase 2 — Nutrición

- `src/utils/conversionNutricional.ts` — única puerta. Separa por nombre las dos
  tablas que se confundían: `intercambiosDeGramosDeAlimento` (60 g de pan ÷ 40)
  frente a `intercambiosDeGramosDeMacro` (60 g de hidrato ÷ 25), con un test que
  **exige que discrepen**.
- `DietItem.baseGrams`: gramos de alimento por **un** intercambio. Per-intercambio
  y no absoluto, para que los escaladores muevan la cantidad y los gramos les
  sigan solos. Ya se notó: uno de los tres escaladores se quedó sin código.
- Una fila que representa un plato entero **deja de inventar gramos**. Antes
  pintaba «×2» o una cifra falsa.
- **Paridad de caminos**: marcar una comida en «Mi menú» y añadirla con el botón
  daban resultados distintos — el botón pasaba la receta cruda, sin la escala ni
  los extras. Era el «20 intercambios salen 26». Los dos caminos pasan ahora por
  la misma función, con un test que lo vigila.
- **Duplicados**: el guardia de doble clic usaba estado de React, que no se
  actualiza entre dos toques seguidos. Ahora usa un ref.
- **Comida fija**: las filas que vienen del menú llevan candado y no se pueden
  reescalar. Y quitarlas del plan las **desmarca** en el menú — sin eso, el
  atleta se quedaba sin poder devolverlas.
- **Tope de extras**: el objetivo por comida no estaba en el documento (sale del
  perfil de hambre del onboarding). Ahora se persiste, y el recorte se aplica en
  `updateWeeklyMenu`, por donde pasan todas las ediciones.

**Dicho en claro:** el tope es un invariante de **cliente**. Las reglas de
Firestore no pueden sumar arrays y esta app no tiene backend propio. La auditoría
pedía validarlo «obligatoriamente en backend»; ese backend no existe.

## Fase 3 — CRM

- Crear servicio pasa de transacción a lote. Cobrar suscripción **sí** necesita
  la transacción (lee antes de escribir, es lo que impide cobrar dos veces), así
  que invalida su sello y paga una relectura.
- Guardia que lee el código fuente y falla si alguien vuelve a pisar la trampa.
  **Comprobado quitándole el flag a mano**: se pone rojo y señala la línea.
- El tipo de movimiento se pide en «Registrar pago» y lo heredan los cobros de
  suscripción. Los recurrentes posteriores al primero son renovación por
  definición.
- Pagos y Reuniones fuera de la ficha individual; las pantallas globales intactas.
- Historial rehecho como registro de actividad derivado. Un plan de 3×329 € decía
  «3 cobros» y ahora dice «1 venta».

## Fase 4 — Distribución de entrenamientos

`semanal()` escribía las sesiones seguidas y amontonaba los descansos al final.
Ahora las reparte:

```
Torso - Pierna                     L · · J · · ·
Push - Pull - Legs                 L · X · V · ·
Torso - Pierna - Torso - Pierna    L M · J V · ·
```

Mover los días a mano ya funcionaba (arreglado el 10-09) y se ha comprobado.

## Fase 5 — Periodización

- `ritmoDePeso.ts` — la fase se define por peso objetivo y ritmo; la duración
  sale de ahí. Ritmos distintos por tramo. Margen de 0,15 kg/semana antes de
  avisar, porque el peso oscila solo.
- `mantenimientoEstimado.ts` — estima por lo que le pasa al atleta, nunca con una
  sola semana, siempre con nivel de confianza. Seis semanas contradictorias **no**
  dan confianza alta.
- `ajusteDePeriodizacion.ts` — propone el siguiente paso con los números del
  atleta. **Nunca aplica nada.**
- «Mantenimiento» → «Mantenimiento **estimado**» donde sale de la fórmula.
  «Mantenimiento real» → «**observado**»: la ingesta se aproxima por el % de
  ítems marcados, no se mide.
- Gráfica con línea de «Planificado · ritmo objetivo», y las series nombradas por
  lo que son.

## Fase 6 — Interfaz

Nombres de 12 a 15 px. Orden alfabético con `Intl.Collator('es')`: «Álvaro» va
entre «Alba» y «Ana».

**Cambio de comportamiento a propósito:** la lista se ordenaba por urgencia. Si
la prefieres así, se cambia en una línea.

---

## Tests

15 ficheros de test nuevos o ampliados:

```
estadoDeAsignacion · conversionNutricional · paridadDeCaminos · topeDeExtras
cambiarIntercambios · filasDelPlan · registroDesdeElMenu · selloDeCatalogo
eventosDelCliente · facturacionPorTipo · ordenAlfabetico · trainingSplits
ritmoDePeso · mantenimientoEstimado · ajusteDePeriodizacion
```

Todos escritos **antes** que el código que prueban. Tres de ellos cambiaron el
diseño al ponerse rojos por una razón que yo no había previsto.

## Cambios en el modelo de datos

Todos opcionales y retrocompatibles. **Ninguna migración.**

| Campo | Dónde | Para qué |
|---|---|---|
| `DietItem.baseGrams` | sustituye a `grams` | gramos de alimento por intercambio |
| `MenuMeal.objetivo` | nuevo | tope de extras de esa comida |
| `NutritionPhase.targetRateKgWeek` | nuevo | ritmo objetivo de la fase |
| `CrmSuscripcion.tipo` | nuevo | alta o renovación |
| `NutritionPhaseProposal.targetRateKgWeek` | nuevo | que el ritmo sobreviva al asistente |

Sin `baseGrams`, los ítems ya guardados se comportan exactamente como hasta hoy.
Sin `objetivo`, no se recorta nada. Sin ritmo, manda `weeks`.

## Lo que falta

1. **Desplegar.** Cinco ramas en local, sin tocar `main`.
2. **QA visual.** Los tests prueban la lógica, no que la pantalla se vea bien en
   un móvil.
3. **Ensayo de restauración** de la copia automática, cuando exista la primera.
4. **Los 2 entrenos huérfanos** de danielbriz8 (22-08 y 06-09): recuperar su día
   en el calendario requiere decidir a qué rutina pertenecían.
