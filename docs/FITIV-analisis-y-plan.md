# FITIV Pulse — mapa funcional completo y plan de réplica en el Cardio de En Forma

> **Objetivo:** replicar el apartado de cardio de FITIV Pulse dentro de `en-forma`.
> **Fecha:** 2026-08-01 · **Versión analizada:** iOS 10.11.0 / Android 4.0.10
>
> **Método:** (a) extracción y lectura completa de los **150 artículos** de la base de conocimiento
> oficial (`support.fitiv.com`, Zendesk API); (b) **grabación de pantalla de 4:38 del iPhone de
> Dani** (46 fotogramas analizados) + 3 capturas del informe post-entreno; (c) fichas de App Store
> y Google Play, web de producto y quejas de usuarios.
> Todo lo de este documento está observado o documentado por ellos — nada supuesto. Las fórmulas
> están **verificadas numéricamente** contra una sesión real (§4bis.4).
>
> **Estado de en-forma:** ya existe un módulo Cardio (commit `e9eb819`). Esto es análisis de
> diferencias, no construcción desde cero.

---

## 1. Ficha del producto

| | |
|---|---|
| **Desarrollador** | MotiFIT Fitness Inc. |
| **Paquete Android** | `com.fitiv.fitivapplication` · 43,8 MB · Android 8+ · 62 permisos |
| **iOS** | 465,7 MB · iOS 17+ · watchOS 10+ · iPadOS · macOS 14 (M1) · visionOS |
| **Valoración** | 4,6★ (13.000 valoraciones) · Apple App of the Day |
| **Modelo** | Freemium. **FITIV Pro** 9,99 $/mes · 59,99 $/año. Suscripción Familiar |
| **Idiomas** | Inglés + 6 (incluye español) |
| **Ecosistema** | FITIV Run · FITIV Ride · FITIV Sync (Fitbit) |

**Lectura del tamaño:** 465 MB en iOS frente a 44 MB en Android. La diferencia es la app de
Apple Watch, sus assets y los modelos on-device. **El Apple Watch es el centro de gravedad del
producto**, no un accesorio — dato decisivo para el §7.

---

## 2. Arquitectura de navegación

Cuatro pestañas inferiores — orden real confirmado en la grabación. Toda la app cuelga de aquí.

```
┌─ HOY  (Today) ─────────── Los 7 scores diarios (el "dashboard de estado")
├─ HISTORIA (History) ───── Historial, filtros, comparativas, alta manual, import
├─ ENTRENAMIENTO (Workout)─ Lanzador de entrenos + gestor de dispositivos + ajustes
└─ PERFIL (Profile) ─────── Identidad, carrera, logros, social + ⚙️ TODOS los ajustes
```

### 2.1 — Árbol completo de ajustes

Todo cuelga de **Profile → ⚙️ (gear, arriba a la derecha)**:

```
Profile → Settings
├── Heart Rate Preferences
│   ├── Maximum Heart Rate      → Haskell & Fox | Tanaka | Nes | Manual
│   ├── Resting Heart Rate      → Apple Health (auto) | Manual
│   ├── Lactate Threshold (LTHR)→ Automatic | Manual
│   ├── Training Method         → %Max HR | %HRR | %LTHR
│   └── Zonas Z0–Z5             → rangos editables + NOMBRE editable por zona
├── Workout Preferences
│   ├── Voice Coaching
│   │   ├── Apple Watch Workout      (on/off)
│   │   ├── iPhone Workout           (on/off)
│   │   ├── Audio output             → Watch | Phone | Both
│   │   ├── Volumen
│   │   ├── Triggers
│   │   │   ├── Duration   → cada 1 / 5 / 10 / 30 min
│   │   │   ├── Distance   → cada 0,1 / 0,25 / 0,5 / 1 / 2 / 5 / 10 km
│   │   │   └── HR Zone    → al cambiar de zona
│   │   ├── Spoken Metrics           (on/off por métrica)
│   │   └── Heart Rate Alerts
│   │       ├── Alert type   → Voice | Notification
│   │       ├── High Heart Rate → toggle + % ajustable (ej. 90% = 161 BPM)
│   │       └── Low Heart Rate  → toggle + % ajustable
│   ├── Calorie Formula        → FITIV | Apple
│   └── Post-Workout Reminder  (recordatorio para registrar el PE)
├── App Settings
│   ├── Workout Auto-Pause     (on/off — solo GPS)
│   ├── Units                  (métrico/imperial)
│   └── Language
└── Profile → Profile Visibility   (privacidad del perfil social)
```

### 2.2 — Ajustes accesibles **durante** el entreno

Ruta rápida: **chevron ▲ abajo → ⚙️**. Contiene:

| Ajuste | Opciones |
|---|---|
| Auto Lock Workout Controls | on/off — bloquea Start/Pause/Stop; **desbloqueo deslizando de izquierda a derecha** |
| Music Source | Apple Music · Spotify · YouTube Music · Deezer · None |
| Metrics Layout ("Metrics per Row") | Basic (3) · Standard (5) · Advanced (7) |
| Split Alert Duration | 5 · 10 · 20 · 30 · 60 s · sin timeout |
| Voice Coaching | on/off |
| Heart Rate Sync | on/off (emitir FC a máquinas) |

---

## 3. Pestaña TODAY — los 7 scores

Cada score se calcula **contra la línea base personal del usuario**, no contra una media
poblacional. Esta es la capa que convierte datos en producto.

| Score | Qué combina | Escala |
|---|---|---|
| **Strain** | Actividad total del día: entrenos + movimiento pasivo | 0 → Peak (100), **curva no lineal** (de 0 a 40 es fácil; de 80 a Peak, muy difícil) |
| **Recovery** | FC reposo + HRV + frecuencia respiratoria + SpO₂ + temperatura de muñeca | Low <33 · Normal 34–66 · Excellent 67+ |
| **Sleep** | Tiempo dormido + fases + eficiencia del sueño | 0–100 |
| **Stress** | FC + HRV + frecuencia respiratoria | 0–100 |
| **Battery** | Interacción de Recovery × Sleep × Strain | 0–100 (reservas de energía del día) |
| **Training Load** | Carga a 7 días vs 28–42 días | ver §5.4 |
| **Training Readiness** | Compuesto de Recovery + Strain + Battery + Training Load | Poor → Prime |

**Métricas "Vitals" que alimentan lo anterior:** HRV, RHR, frecuencia respiratoria, SpO₂,
temperatura de muñeca, fases de sueño, VO₂máx, Heart Rate Recovery.

---

## 4. Pestaña WORKOUT — el corazón del cardio

### 4.1 — Tres categorías de entreno

| Categoría | Qué es | Editable | Borrable |
|---|---|---|---|
| **Standard** | +90 tipos predefinidos ("de Archery a Zumba") | ❌ (solo datos post-entreno) | ❌ |
| **Custom** | Construidos por el usuario en el Workout Builder | ✅ | ✅ (swipe → papelera) |
| **Weight Lifting Templates** | Fuerza: ejercicios, series, reps, superseries, timers | ✅ | ✅ |

**Favoritos:** hasta **6**, mezclando las tres categorías. Icono de chincheta 📌.
**Recents:** los 3 últimos, automático.
Favoritos + Recents se sincronizan con el Apple Watch.

### 4.2 — Workout Builder (crear entreno personalizado)

`Workout → Custom Workouts → + (arriba dcha.)`

| Campo | Detalle |
|---|---|
| Name | Texto libre ("Long Sunday Run", "Zona 2 Bici") |
| Activity Type | El tipo estándar más cercano |
| Voice Coaching | Toggle |
| **Add Intervals** | → editor de intervalos (§4.3) |
| **Advanced Options** | Icon · GPS Route · Speed unit (MIN/KM o KPH) · Estimate Distance (solo Watch) · Auto Water Lock |

### 4.3 — Editor de intervalos: **6 tipos de objetivo**

Esta es la pieza que hace de FITIV una app de entrenamiento y no solo un registrador.
Cada bloque de un intervalo se cierra por uno de estos criterios:

| Tipo | Cierra el bloque cuando… | Caso de uso |
|---|---|---|
| **Time** | pasa X tiempo | Tabata, HIIT, 7-min workout |
| **Zone** | alcanzas/mantienes una zona de FC | calentar hasta Z2, soltar en Z1 |
| **Heart Rate** | cruzas un umbral alto/bajo de BPM | trabajo por umbral exacto |
| **Distance** | recorres X distancia | series de pista, Couch-to-5K |
| **Calories** | quemas X kcal | objetivo de déficit |
| **Manual** | el usuario lo marca | circuitos, cambio de ejercicio |

Cada intervalo admite además **rest timers**.

### 4.4 — Gestor de dispositivos (Device Manager)

`Workout tab → barra de selector de dispositivo → Discover Devices`

- Emparejamiento **siempre desde dentro de la app**, nunca desde los ajustes Bluetooth del móvil.
- Se designa un **main tracking device**.
- Marcas compatibles declaradas: Polar, Garmin, Wahoo, MyZone, Coospo, WHOOP, Powr Labs, Coros, Scosche.
- Otras fuentes: Apple Watch, Fitbit Air (vía Google Health), Garmin (broadcast), AirPods Pro 3, Powerbeats Pro 2.

**Regla dura documentada:** una banda BLE solo habla con **un** dispositivo a la vez. Si está
emparejada en otro sitio, no aparece. Es su causa nº1 de soporte.

### 4.5 — Heart Rate Sync (emisión a máquinas)

La app se convierte en **periférico BLE** y emite la FC con el nombre `FITIV HRSync` a cintas,
bicis, remos y elípticas: Peloton, Concept2, Zwift, OrangeTheory, iFit, Precor, Life Fitness,
Echelon, NordicTrack, Wahoo, Schwinn.

### 4.6 — Pantalla de entreno en vivo

- **Layouts:** Basic (3 métricas) · Standard (5) · Advanced (7), con posiciones fijas
  (Top Right / Top Middle / Top Left / Middle / Bottom Right / Bottom Middle / Bottom Left).
- **Cambio de métrica en caliente:** se toca la métrica y se elige otra de la lista.
- Se pueden configurar métricas **distintas en el móvil y en el reloj**.
- Auto Lock + desbloqueo por deslizamiento.
- Finalizar: chevron ▲ → deslizar para elegir **Save** o **Discard**.

### 4.7 — Catálogo completo de métricas en vivo

Agrupadas como las agrupa la app:

| Grupo | Métricas |
|---|---|
| **Heart Rate** | Heart Rate · Average HR · Maximum HR · **Heart Rate Zone** · **Intensity** · Split Avg HR · Split Max HR · Last Split Avg HR · Last Split Max HR |
| **Calories** | Calories Active · Calories Total |
| **Pace** | Pace · Average Pace · Best Pace · **Rolling Pace** · Split Avg/Best · Last Split Avg/Best |
| **Speed** | Speed · Average · Best · **Rolling Speed** · Split Avg/Best · Last Split Avg/Best |
| **Cadence** | Cadence · Average · Best · Split Avg/Best · Last Split Avg/Best |
| **Elevation** | Elevation · Gain · Loss · Split Gain · Last Split Gain |
| **Steps** | Steps · Split Steps · Last Split Steps |
| **Distance / Duration** | Distance · Duration |
| **Otros** | **METs** · **FITIV Points** |

**Patrón de diseño a copiar:** casi toda métrica existe en cuatro variantes —
*actual · media · split actual · split anterior*. Esa regularidad es lo que hace que 7 huecos
configurables cubran a todo tipo de atleta sin pantallas distintas por deporte.

---

## 4bis. La app observada — capturas y grabación de pantalla

> Analizado sobre grabación de 4:38 del iPhone de Dani (46 fotogramas) + 3 capturas del informe
> post-entreno. Esto cierra la capa visual que la documentación no cubre.

### Pestañas reales (en español)

```
Hoy · Historia · Entrenamiento · Perfil
```
Barra inferior en píldora oscura, iconos: ☀️ 📊 🏃 👤.

### 4bis.1 — La pantalla de entreno en vivo *(lo más importante a copiar)*

**🎨 El fondo de TODA la pantalla es el color de la zona actual.** No un badge, no un borde: el
fondo completo. En Z1 la pantalla entera es azul; al subir a Z2 se vuelve verde. Es la decisión de
diseño más potente de la app: **sabes tu zona sin leer nada, con el móvil a un metro**. Barato de
implementar y de altísimo impacto.

Estructura de arriba abajo:

| Zona de pantalla | Contenido |
|---|---|
| Barra superior | Chip Bluetooth (punto verde = conectado) · widget de música (Apple Music ⏮▶⏭) · botón **Ocultar** |
| Fila de métricas | 3 tarjetas: **FC PROM. · METS · FC MAX** |
| Panel central | **Carrusel de 5 páginas** con puntos indicadores |
| Barra inferior | ⏸ (círculo ámbar) · **cronómetro grande + hora real** · ▲ chevron |

**Las 5 páginas del carrusel:**
1. **RITMO** — ritmo grande (`--:--` en cinta sin GPS)
2. Métricas secundarias — CAL ACTIVA · CAL TOTAL · PUNTOS
3. **Tiempo por zona en vivo** — 6 píldoras de color (rojo→gris) con **% y tiempo** por zona
4. **Gráfica de FC con bandas de zona de fondo** — bandas de color a ancho completo, etiquetas de
   BPM a la izquierda (171/152/133/114) y **% de FCmax a la derecha** (90/80/70/60)
5. Otras métricas configurables

**Cajón inferior expandido** (▲): dos **deslizadores de confirmación**, no botones:
- 🔴 **"Desliza para guardar"**
- 🗑️ **"Deslizar para descartar"**
- Abajo: 🔓 desbloquear · ⚙️ ajustes

> Patrón a copiar: deslizar en vez de pulsar para terminar. Con las manos sudadas o en marcha,
> un botón "Terminar" se pulsa sin querer. Tú ya tienes ese riesgo en `CardioScreen`.

### 4bis.2 — Ajustes durante el entreno (hoja ⚙️)

```
Dispositivo de entrenamiento
├── Google Fitbit Air · Conectado ✓
└── Sincronización de la Frecuencia Cardíaca        [toggle]
    "Transmite la frecuencia cardíaca a Peloton, Zwift, Concept2 y otros"
Configuración del entrenamiento
├── Entrenamiento por voz                            [toggle ON]
├── Controles de entrenamiento de bloqueo automático [toggle OFF]
├── Fuente de música                → Apple Music
├── Diseño de Métricas              → Avanzado
└── Duración de la alerta de división → 10 Segundos
```

**Selector "Diseño de Métricas":** muestra una **maqueta real del teléfono** con datos de ejemplo
(AVG PACE 4:50 · DISTANCE 0.78 · **HR 167 sobre fondo naranja = Zona 4** · CAL ACTIVE · AVG HR) y
debajo tres miniaturas: **Básico · Estándar · Avanzado**. Se elige viendo, no leyendo.

**Cambio de métrica en caliente:** al tocar un hueco se abre una hoja (ej. *"Centro"*) con la lista
de métricas disponibles y ✓ en la activa: Duración · Frecuencia Cardíaca · Intensidad de FC ·
Puntos FITIV · Distancia · Ritmo · Velocidad.

### 4bis.3 — Detalles de UX que merece la pena robar

1. **Chip de dispositivo con FC en vivo antes de empezar.** En la pestaña Entrenamiento, abajo:
   `🔵 Google Fitbit Air · Conectado    ♥ 99`. Ves que la banda funciona **antes** de arrancar.
   Elimina el fallo nº1: descubrir a los 10 minutos que no estaba midiendo.
2. **Mini-reproductor persistente.** Al navegar durante un entreno queda una barra fija abajo:
   `Cinta de correr · 01:02 · --:-- /km ⏸`. El entreno nunca se pierde de vista.
3. **Buscador de entrenos + lista alfabética con secciones** (A, C, D, P, R…), cada fila con `⋯`
   y `⊖` para quitarla de tu lista. +90 tipos sin que abrume.
4. **Favoritos: máximo 6**, con explicación en pantalla del porqué.
5. **Error honesto y con salida:** *"No se pudo iniciar en el Apple Watch… Puedes iniciar este
   entrenamiento con tu iPhone en su lugar"* → **Cambiar dispositivo / Cancelar**.

### 4bis.4 — El informe post-entreno (las 3 capturas)

Orden exacto de la pantalla, de arriba abajo:

| # | Bloque | Contenido observado |
|---|---|---|
| 1 | Cabecera | ✕ · fecha · compartir · ⋯ |
| 2 | Título | **Cinta de correr** + icono · `7:34 PM - 7:58 PM` |
| 3 | **Información de Entrenamiento** | **Narrativa generada por IA** con 👍/👎, borde degradado |
| 4 | Comparativa | *VS. Promedio de los últimos 30 días (0 Entrenamientos)* — desplegable |
| 5 | Duración / Puntos | `23:39` · **194 pts** |
| 6 | FC media / máxima | `131 (68%)` · `171 (90%)` — **siempre con % de FCmax** |
| 7 | **Gráfica de FC** | Bandas de zona a color de fondo + traza blanca + BPM izq / % dcha |
| 8 | Recuperación de FC – 1 Minuto | `41` en gauge **Pobre 20 · Activo 25 · En forma 30 · Élite** |
| 9 | Condición física cardiovascular | **VO₂ Máx 41.5** en gauge `Pobre 38 · Activo 48 · En forma 57 · Élite` |
| 10 | Tarjetas 2×2 | Distancia (⊕ Agregar) · Calorías Activas **244** · Calorías Totales **278** · METs **8,1** |
| 11 | **Carga de entrenamiento** | **TRIMP 24.8** · **TSS de FC 14.8** |
| 12 | **Esfuerzo Percibido** | *"Muy Intenso" **7,5*** + descripción + slider 1–10 en degradado · **Minutos de Esfuerzo 177.4** |
| 13 | **Zonas de FC** | Fila por zona: nombre · rango ppm · barra · tiempo · **%** — incluye *"No en zona <95bpm"* · enlace **Establecer Zonas** |
| 14 | Anotaciones | **Notas** · **Etiquetas** · **Fotos** (*Agregar +*) |
| 15 | Pie | *Rastreado con FITIV Pulse – iPhone 15 Pro Max* |

**Fórmulas confirmadas con datos reales de la sesión:**

- **Zonas por %FCmax con FCmax = 190** (Haskell & Fox, 30 años):
  `Z1 95–113 (50-60%) · Z2 114–132 (60-70%) · Z3 133–151 (70-80%) · Z4 152–170 (80-90%) · Z5 171+ (90%+)`
  → confirma el modelo %FCmax del §5.2, y que **hay una banda "No en zona" por debajo del 50%**.
- **Minutos de Esfuerzo = PE × duración**: `7,5 × 23,65 min = 177,4` ✅ **exacto**.
- **Puntos FITIV = METs × minutos**: `8,1 × 23,65 = 191,6 ≈ 194` ✅ (usa METs sin redondear).
- Calorías activas 244 / totales 278 → la diferencia (34 kcal en 23,6 min) es el metabolismo basal.

**Fallos observados en su app** (oportunidades directas):
- **La narrativa de IA sale en inglés con la interfaz en español.** Localización a medias.
- `"1 de August de 2026"` — el mes sin traducir. Formato de fecha mal montado.
- Distancia vacía en cinta con un `⊕ Agregar` — no infiere distancia sin GPS.

### 4bis.5 — Pestaña Hoy y Preparación para el entrenamiento

- **Hoy** — cabecera `Hoy, 1 Aug · Actualizado: ahora mismo`; barra **Preparación para el
  entrenamiento** en degradado con marcas 0/25/50/75/90; tres anillos **Recuperación · Esfuerzo ·
  Sueño**; barras **Batería** (Descargado→Cargado) y **Estrés** (Bajo→Alto); **Resumen del
  entrenamiento (TRIMP)** con slider **Bajo · Óptimo · Alto · Riesgo** y las marcas 0.8 / 1.1 /
  1.3 / 1.5 — exactamente los cortes de TLR del §5.4, ahora confirmados visualmente; tarjetas
  *Corto Plazo (ATL)* / *Largo Plazo (CTL)* / *Carga* y *Promedio de 7 Días* / *42 Días*;
  **Objetivo de peso**; **Energía** (Consumido / Quemado); botón **Personalizar** — la pestaña Hoy
  es configurable por el usuario.
- **Preparación para el entrenamiento (detalle)** — narrativa IA (*"Tus métricas están en su
  punto"*), gauge 0–100 con etiqueta, **Recovery / Strain / Sleep** en anillos + **Battery /
  Stress**, histórico en barras con leyenda **Pobre (0-24) · Bajo (25-49) · Moderado (50-74) ·
  Alto (75-89) · Prime (90-100)** + media móvil, `30D Mejor` / `30D Promedio`, bloque **Impacto**
  desglosando qué componente resta, y tarjeta educativa *"Aprender más — SALUD 101"*.

### 4bis.6 — Perfil

Avatar · Seguidores/Siguiendo · Entrenamientos · Puntos FITIV · **Carrera** (mes en curso, días
restantes, rango Principiante→Novato) · **Edición limitada** (medallas *0 de 0 ganados*) ·
**Desafíos** · **Clasificación** semanal · **Hábitos** (*"Comienza tu racha de 21 días"* → Crear
hábito) · ⚙️ Configuración.

**Configuración:** Perfil (nombre, peso, preferencias de FC) · Cuenta · FITIV Pro ·
Apple Watch · Sensores Bluetooth · **Coaching Impulsado por IA** · Preferencias de entrenamiento ·
**Pestaña Hoy** (métricas vitales) · Preferencias de la app.

---

## 5. Motor de cálculo — fórmulas exactas

Todo esto es **ciencia del ejercicio publicada**. Se puede reimplementar con precisión y sin
tocar su código.

### 5.1 — Frecuencia cardíaca máxima (4 métodos, elegibles)

| Método | Fórmula |
|---|---|
| Haskell & Fox *(por defecto)* | `220 − edad` |
| Tanaka, Monahan & Seals | `208 − 0,7 × edad` |
| Nes et al. | `211 − 0,64 × edad` |
| Manual | valor del usuario (test real) |

### 5.2 — Zonas: 6 bandas por %FCmax

| Zona | Nombre FITIV | %FCmax | Combustible | % del volumen recomendado |
|---|---|---|---|---|
| Z0 | No Zone | <50% | — | rest |
| Z1 | Warm-Up / Recovery | 50–59% | — | calentar/enfriar |
| **Z2** | **Low Aerobic (Fat-Burning)** | **60–69%** | **grasa** | **Z2+Z3 = 60–80%** |
| Z3 | Low Aerobic | 70–79% | grasa | ↑ |
| Z4 | High Aerobic | 80–89% | glucógeno | 10–30% |
| Z5 | Maximum Effort | 90–100% | glucosa | 5–10% |

**Tres métodos de zonificación seleccionables:** %FCmax · %HRR (Karvonen) · %LTHR.
Los nombres de las zonas son **editables por el usuario**.

> ⚠️ **Divergencia con tu modelo.** Tu app usa **5 zonas con Z2 = 60–70 %HRR**. FITIV usa
> **6 zonas (Z0–Z5) con Z2 = 60–69 %FCmax**. No son lo mismo: %HRR da BPM más altos que %FCmax
> para el mismo porcentaje. **Tu modelo es el más correcto de los dos** (Karvonen individualiza
> por FC de reposo). Decisión en §8.

### 5.3 — Calorías: fórmula de Keytel (Universidad de Ciudad del Cabo)

Su documentación publica esto:

```
Calorías = (4,184 × (−55,0969 + 0,6309×FC + 0,1988×Peso + 0,2017×Edad)) × 60 × horas
```
con la constante cambiada a `−20,4022` para mujeres.

> 🔴 **Su fórmula publicada está mal transcrita.** La Keytel original **divide** entre 4,184 (pasa
> de kJ a kcal), no multiplica, y en mujeres **cambian los cuatro coeficientes**, no solo la
> constante. La versión correcta:
>
> - Hombres: `kcal/min = (−55,0969 + 0,6309×FC + 0,1988×Peso + 0,2017×Edad) / 4,184`
> - Mujeres: `kcal/min = (−20,4022 + 0,4472×FC − 0,1263×Peso + 0,0740×Edad) / 4,184`
>
> Esto explica la queja histórica de "las calorías son groseramente inexactas" y el artículo de
> su propio soporte *"Why Does FITIV Show Very Low Calories After a Long Workout?"*.
> **Implementar la Keytel correcta — es una mejora gratuita sobre ellos.**

### 5.4 — Carga de entrenamiento: 4 métodos

| Método | Cálculo | Cuándo |
|---|---|---|
| **Perceived Effort (PE)** | `Effort Minutes = PE(1–10) × duración` | cualquier entreno; único válido para fuerza |
| **TRIMP** (Banister) | FC relativa a FCmax, ponderando exponencialmente la intensidad alta | cardio |
| **TSS** | potencia, o FC si no hay potenciómetro | resistencia (correr/bici) |
| **All Day Calorie Burn** | calorías totales del día | visión global de actividad |

**Training Status** compara carga aguda y crónica:

```
TLR = ATL (7 días) / CTL (28–42 días)
```

| TLR | Estado | Significado |
|---|---|---|
| <0,8 | **Undertraining** | estímulo insuficiente, estancamiento |
| 0,8–1,1 | **Optimal** | progreso sostenible |
| 1,1–1,3 | **Peaking** | pico de forma / competición |
| 1,3–1,5 | **Overreaching** | riesgo de fatiga |
| >1,5 | **At Risk** | riesgo de lesión o burnout |

**Escala PE (1–10) con etiquetas propias:** Very Light · Light · Comfortable · Moderate ·
Challenging · Hard · Intense · Very Intense · Near Maximal · Max Effort.
FITIV **autoestima el PE desde la FC** y lo corrige aprendiendo del histórico del usuario.

### 5.5 — METs y FITIV Points

- **1 MET ≈ 70 kcal/h** (metabolismo en reposo). 700 kcal/h = 10 METs.
- **FITIV Points = METs medios × duración en minutos** (MET-minutos).
- **Umbral: solo puntúan entrenos >3,0 METs.** Estiramientos o yoga suave no dan puntos.
- Los entrenos añadidos a mano **no puntúan** (no tienen FC ni movimiento reales).
- Los Points mensuales determinan el rango de **Career Mode**: Beginner → Hall of Famer.

**Por qué existen los Points:** las calorías dependen de peso, sexo y edad, así que comparar
atletas por calorías es injusto. Los MET-minutos normalizan. **Es la métrica que hace posible la
liga social.** Es un acierto de diseño y es trivial de implementar.

### 5.6 — Heart Rate Recovery

Escanea la sesión entera y se queda con **la mejor caída a 1 minuto y a 2 minutos**.
Condiciones para calcularlo (si no, muestra el motivo):

- duración ≥ **10 min**
- FC máxima ≥ **70 %** de la FCmax estimada
- FC media ≥ **50 %** de la FCmax estimada
- que haya datos de FC **después** de terminar

**Con banda BLE:** hay que **añadir 2 minutos de vuelta a la calma antes de cerrar la sesión.**
Rangos por edad: Elite · Fit · Active · Poor.

### 5.7 — Training Focus (distribución por zonas)

Reparto objetivo que la app compara contra el real y señala desviaciones:

| Bloque | Objetivo |
|---|---|
| Anaeróbico (Z5) | 5–10% |
| Aeróbico alto (Z4) | 10–20% |
| Aeróbico bajo (Z2–Z3) | **70–80%** |

---

## 6. Pestaña HISTORY

- **Filtros:** All · **Date** (día/semana/mes/año) · **Workout Type** / **Activity Type** (con
  contador por categoría) · **Tags**.
- **Tags libres multivalor:** se crean desde una sesión (`Tags → + → Add`), varias por entreno,
  y luego se filtra por ellas. Icono de filtro arriba a la izquierda; botón **Clear** para resetear.
- **Alta manual:** `+ → Manually Add` → tipo, duración, distancia, calorías. *No otorga Points.*
- **Import:** `+ → Add From Apple Health` → lista de entrenos sincronizados; ✓ al importar.
- **Edición post-entreno:** título, duración, distancia, calorías. El **tipo no se puede cambiar**.
- **Ajuste de zonas por sesión:** al final del informe de un entreno se pueden recalcular las
  zonas **solo de esa sesión**, sin tocar las futuras. Distinción muy bien resuelta.

---

## 7. Qué es replicable y qué no

Tu decisión de hardware fue **banda de pecho BLE, no Apple Watch**
(`PLAN_TrainingLab_Cardio_Widget.md` §0). Es la decisión correcta para medir esfuerzo, pero tiene
una consecuencia estructural que hay que asumir por escrito:

| Pilar FITIV | ¿Replicable con banda BLE? | Motivo |
|---|---|---|
| FC en vivo, zonas, intervalos, alertas | ✅ **Sí, al 100%** | Es exactamente para lo que sirve una banda |
| Calorías, METs, Points, TRIMP, TSS, PE | ✅ **Sí, al 100%** | Fórmulas públicas + FC |
| Heart Rate Recovery | ✅ Sí | Requiere 2 min de cool-down, como en Fitiv |
| Training Load / TLR / Training Focus | ✅ Sí | Solo necesita histórico de sesiones |
| GPS, ruta, ritmo, splits, elevación | ✅ Sí | `@capacitor/geolocation` + Leaflet |
| HRV / Recovery Score | 🟡 **Parcial** | Solo medición **matinal puntual** (3 min tumbado, RR de Polar H10). No continua |
| **Sueño, SpO₂, temperatura, resp.** | ❌ **No** | Exigen dispositivo llevado 24/7. **Nadie duerme con banda de pecho** |
| Broadcast a máquinas (HR Sync) | 🟡 Difícil | Requiere modo periférico BLE. Nicho |

**Conclusión honesta:** de los 7 scores del Today de FITIV, con banda de pecho puedes construir
**Strain, Training Load y Training Readiness** bien; **Recovery** a medias; y **Sleep, Stress y
Battery no son alcanzables**. Perseguirlos sería construir métricas falsas.

Alternativa si algún día importa: **importar** sueño desde Apple Health / Garmin / Oura en vez de
medirlo. Ya estaba previsto como F4 en tu plan.

---

## 8. Diferencias contra el Cardio actual de En Forma

Verificado leyendo `src/components/CardioScreen.tsx`, `src/services/bleHeartRate.ts`,
`src/components/HrTestsPanel.tsx`, `src/components/CardioCoachScreen.tsx`, `src/utils/cardioZones.ts`.

### Ya lo tienes

| | |
|---|---|
| ✅ BLE Heart Rate Service (0x180D / 0x2A37) | Implementación limpia y correcta |
| ✅ BPM en vivo + zona + color + gráfica | recharts |
| ✅ Tiempo acumulado por zona | |
| ✅ Submuestreo a 4 s | Protección de cuota Firestore |
| ✅ Zonas individualizadas Karvonen/LTHR | **Mejor modelo que el de FITIV** |
| ✅ **Tests de campo guiados** (FCmax, LTHR, Z2, decoupling) | **FITIV NO tiene esto** |
| ✅ **Prescripción y revisión del coach** | **FITIV NO tiene esto** |
| ✅ Historial de sesiones · XP · widget de bloqueo | |

### Te falta (ordenado por valor/coste)

| Falta | Coste | Valor |
|---|---|---|
| **🎨 Fondo de pantalla completo del color de la zona** (§4bis.1) | **Muy bajo** | 🔥🔥 Máximo ratio valor/coste de todo el documento |
| **Alerta al salir de zona** (háptico + voz) | Bajo | 🔥 Crítico para Z2 |
| **Sesión Z2 guiada** (objetivo + progreso) | Bajo | 🔥 Crítico |
| **Chip de banda con BPM en vivo antes de arrancar** (§4bis.3) | Muy bajo | 🔥 Evita el fallo nº1: descubrir tarde que no medía |
| **Deslizar para guardar / descartar** (§4bis.1) | Muy bajo | 🔥 Evita terminar la sesión sin querer |
| **Gráfica con bandas de zona de fondo + % de FCmax** | Bajo (recharts `ReferenceArea`) | Alto |
| **Perceived Effort post-sesión (1–10)** con etiquetas | Muy bajo | Alto — es la única carga válida para fuerza |
| **Calorías (Keytel), METs, Points** | Bajo | Alto — habilita gamificación justa |
| **TRIMP / TSS / TLR / Training Focus** | Medio | Alto — es el lenguaje del coach |
| **Intervalos con 6 tipos de objetivo** | Medio | Alto |
| **Coaching por voz** con triggers | Bajo (Web Speech API) | Alto |
| **Métricas configurables** (layouts 3/5/7 + carrusel) | Medio | Alto |
| **Narrativa post-entreno** (§4bis.4) | Bajo — **ya tienes el asistente IA** | Alto |
| **Heart Rate Recovery** | Bajo | Medio — gran marcador de forma |
| **Notas / etiquetas / fotos por sesión** | Bajo | Medio |
| **Historial con filtros** (semana/mes/año) y comparativa | Medio | Medio |
| **Auto-lock de controles** | Bajo | Medio |
| **Mini-reproductor persistente de sesión** | Medio | Medio |
| **GPS: ruta, ritmo, splits** | Alto | Medio (solo si entrenáis fuera) |
| **HRV matinal + readiness** | Alto | Medio |

### 🔴 Defectos del código actual — arreglar antes de añadir nada

1. **`CardioScreen.tsx:77` — `setInterval` que nunca se limpia.** No se guarda en ninguna ref y
   `stopTicking()` solo limpia `tickRef`. Sigue vivo al terminar la sesión y **se acumula uno por
   cada sesión**: fuga de memoria y escrituras sobre un componente ya reiniciado.

2. **`CardioScreen.tsx:61` — una desconexión de la banda tira la sesión entera.** El `handleStop`
   que se pasa como callback de desconexión captura el estado del render inicial, donde
   `elapsedSec` vale 0. Al dispararse, la guarda `elapsedSec < 10` (línea 98) es cierta y **sale
   sin guardar**. Un microcorte a los 40 min de Z2 borra los 40 minutos.

3. **La sesión no sobrevive a la pantalla bloqueada.** Cronómetro y submuestreo son
   `window.setInterval` dentro del WebView; iOS y Android los estrangulan al bloquear. Una sesión
   de Z2 de 45 min con el móvil en el bolsillo — **el caso de uso central** — no se registra bien.
   Hay que reusar la infraestructura de Live Activity / foreground service que ya montaste en F3
   para el descanso de fuerza.

4. **`sessionType` es decorativo.** `'libre' | 'zona2' | 'intervalos'` se guarda pero no cambia
   nada del comportamiento.

---

## 9. Plan de réplica

Cada fase entrega valor sola y es reversible.

> **Estado (2026-08-02):** F1–F6 y F8 construidas, verificadas (`tsc` + tests + build de
> producción en commit aislado) y **desplegadas** — código en `main`/Vercel, reglas de Firestore
> en producción. **F7 (GPS) queda aparcada a propósito**, sin fecha — ver la nota en su sección
> más abajo. Nada de lo demás depende de F7.

### F1 · Reparación *(bloqueante — sin features nuevas)*
Los 4 defectos del §8. Refs para el intervalo de muestreo, estado vivo en refs o `useReducer`, y
que una desconexión **guarde lo grabado** e intente reconectar.
→ `CardioScreen.tsx`, `bleHeartRate.ts`

### F2 · Sesión que sobrevive al bolsillo
Reusar Live Activity (iOS) + foreground service (Android) de F3 para cardio: reloj de pared, BPM y
zona en la pantalla de bloqueo. **Sin esto el módulo no sirve para lo que se construyó.**

### F3 · Rediseño de la pantalla en vivo *(máximo valor por euro — empezar por aquí tras F1/F2)*
Casi todo es CSS y estado que ya tienes. Ninguna dependencia nueva.
- **🎨 Fondo completo del color de la zona**, con transición suave al cambiar (§4bis.1).
- **Chip de banda con BPM en vivo** en la pantalla previa, antes de arrancar (§4bis.3).
- **Deslizar para guardar / descartar** en lugar del botón "Terminar sesión" actual.
- **Alertas de zona:** háptico (`@capacitor/haptics`, ya instalado) + voz (Web Speech API), con
  umbral alto y bajo configurables.
- **Sesión Z2 guiada:** zona y duración objetivo, barra "18:32 / 40:00 en Z2", resumen final.
- **Gráfica con bandas de zona de fondo** (`ReferenceArea` de recharts) + BPM a la izquierda y
  **% de FCmax a la derecha**.

### F4 · Capa de cálculo *(barata y muy visible)*
Calorías **Keytel correcta** (§5.3), METs, Points con umbral de 3,0 METs, TRIMP, TSS, TLR con sus
5 estados, Training Focus, Heart Rate Recovery, y **Esfuerzo Percibido 1–10 post-sesión** con las
etiquetas del §5.4. Casi todo es aritmética sobre datos que ya guardas.

**Bonus barato:** la *"Información de Entrenamiento"* narrativa del §4bis.4 la puedes generar con
el **asistente IA del coach que ya tienes en producción** — sería el mismo patrón de reportes
humanizados, aplicado a la sesión de cardio. Y en español de verdad, que es donde ellos fallan.

### F5 · Anotación e historial
Notas, etiquetas y fotos por sesión; filtros semana/mes/año; comparativa contra la media de 30
días; ajuste de zonas por sesión concreta sin tocar las futuras (§6).

### F6 · Intervalos y métricas configurables
Los 6 tipos de objetivo del §4.3 + rest timers, editables por el coach. Carrusel de páginas en la
pantalla en vivo y layouts Básico/Estándar/Avanzado con cambio de métrica en caliente (§4bis.2).

### F7 · GPS — ⏸ APLAZADO (decisión de Dani, 2026-08-02)
`@capacitor/geolocation` + Leaflet/OSM: ruta, distancia, ritmo, splits y traza coloreada por zona.
**La queja nº1 de los usuarios de FITIV es que su GPS no pinta la ruta en iPhone** — hacerlo bien
sería ventaja directa, pero **no se construye por ahora**. Queda documentado aquí para retomarlo
cuando haga falta (entreno en exterior real); no bloquea nada de lo demás — F1-F6 y F8 son
independientes y ya están en producción sin GPS.

### F8 · Recuperación viable
HRV matinal (RR de Polar H10) + readiness que ajusta el objetivo del día y avisa al coach.
**Sin sueño propio.**

**Fuera de alcance:** GLP-1, comunidad/ligas, integraciones de terceros, broadcast a máquinas.

---

## 10. La tesis

Copiar FITIV al 100% no tiene sentido: es una app de **una sola persona sin entrenador**. Tú
tienes coach.

Lo que sale de aquí no es "FITIV para Dani", es **FITIV + supervisión**: el atleta entrena por
zonas y el coach ve la adherencia, aprueba los tests, ajusta las zonas y lo integra en el informe
mensual junto a nutrición y fuerza. Eso FITIV no puede hacerlo — no es limitación técnica suya,
es que su producto no tiene ese lado.

Las dos cosas que ya tienes y ellos no —**tests de campo guiados** y **revisión del coach**— son
el diferencial. Y hay dos sitios donde puedes ser **mejor que ellos** sin esfuerzo: las calorías
(su fórmula publicada está mal, §5.3) y el GPS (su queja nº1, §5 F5).

---

## 11. Decisiones — estado

1. ✅ **Modelo de zonas.** Resuelto: se mantiene el tuyo (5 zonas / %HRR, Karvonen) — más correcto
   que el de FITIV, individualiza por FC de reposo. Sin selector de método adicional.
2. ✅ **Banda.** Resuelta: expone intervalos RR → F8 (HRV matinal) construido y en producción.
3. ⏸ **GPS.** Aplazado — ver F7 (§9). Se retoma más adelante, no hay fecha.

---

## 12. Cobertura del análisis

| Capa | Qué da | Estado |
|---|---|---|
| **4 — Producto/mercado** | Features, pricing, changelog, quejas | ✅ Completa |
| **3 — Bundle** | Stack, permisos, tamaño, ecosistema | ✅ Suficiente (datos públicos) |
| **1 — Comportamental** | Menús, submenús, flujos, UX, diseño | ✅ **Completa** (§2, §4, §4bis) |
| **2 — Red** | Modelo de datos del servidor | ⛔ No hecha — **y no hace falta** |

**Por qué la capa 2 no aporta aquí:** la lógica de FITIV no vive en su servidor, vive en fórmulas
de fisiología del ejercicio publicadas — y las hemos **verificado numéricamente** contra una sesión
real (§4bis.4). El backend solo guarda sesiones; el tuyo ya lo hace.

**Lo único que no está cubierto:** los flujos que la grabación no recorrió — el **editor de
intervalos** en uso (§4.3 está documentado pero no visto), el asistente de **plantillas de fuerza**
(*foto de una rutina / describirla en lenguaje natural*) y la pantalla de **Establecer Zonas**.
Si en algún momento hacen falta al detalle, una grabación corta de esos tres los cierra.

---

## Fuentes

- [Base de conocimiento FITIV — 150 artículos](https://support.fitiv.com/hc/en-us) (extraída vía Zendesk API)
- [App Store](https://apps.apple.com/us/app/fitiv-pulse-ai-workout-tracker/id942494517) · [Google Play](https://play.google.com/store/apps/details?id=com.fitiv.fitivapplication) · [fitiv.com](https://www.fitiv.com/)
- [Guía de intervalos](https://fitiv.com/intervals-guide/) · [Personalización de entrenos](https://www.fitiv.com/blog/workout-customization-fitiv-pulse)
- [Uptodown — datos técnicos del APK](https://fitiv-pulse-heart-rate-monitor.en.uptodown.com/android)
- [Problemas reportados](https://probleme.app/en/fitiv-pulse-gps-cardio-tracker-problems/)
