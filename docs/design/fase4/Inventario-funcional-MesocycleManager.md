# Inventario funcional · Mesociclos (`MesocycleManager`)

> Contrato para el rediseño. Todo lo que está aquí existe hoy en código y el
> diseño tiene que conservarlo. Lo que NO está aquí no existe: si el diseño lo
> añade, se pregunta antes de construirlo.
>
> Fuente: `src/components/MesocycleManager.tsx` (3.066 líneas) y sus paneles
> hijos, leídos el 16-09-2026 sobre `main`.

## 0. Dónde vive y quién lo usa

- **Solo coach.** Se monta dentro de `ClientHub → pestaña Entrenos →
  ClientWorkoutsPanel`, debajo de la lista de asignaciones del atleta. Siempre
  con `athleteEmail` fijado: el atleta ya está elegido.
- El modo «standalone» (título «Macrociclo» + selector de atleta) existe en el
  código pero **nadie lo monta**. No se diseña.
- Es un panel dentro de una pantalla que ya tiene scroll y cabecera propias.
  El diseño no puede asumir pantalla completa.
- Ancho variable: el panel del cliente cambia de ancho según la pantalla del
  coach; hay que resolver **≥ 375 px** (móvil) y **escritorio ancho**.

## 1. Estructura

```
[Columna izquierda: lista de mesociclos]   [Editor del mesociclo seleccionado]
                                            ├─ Cabecera (datos del bloque)
                                            ├─ Pestañas: Volumen · Distribución · Ejercicios · Cierre
                                            ├─ Contenido de la pestaña
                                            └─ Zona de borrado
```

En escritorio (`xl`) la lista va a la izquierda (256 px) y el editor a la
derecha; por debajo, apilados.

## 2. Lista de mesociclos (columna izquierda)

| Elemento | Comportamiento |
|---|---|
| **Nuevo mesociclo** (primario) | Crea uno con 4 semanas, 4 sesiones, fecha de hoy, sin objetivo, volumen a 0 en los 17 grupos. Lo abre en la pestaña Volumen. Texto «Creando…» mientras. |
| **Usar plantilla** (secundario) | Abre el diálogo de plantillas (§9.1). |
| Tarjeta por mesociclo | Nombre (`nombreDeMeso`: el nombre o «Meso #N»), «X sem · Y ses.», objetivo (o «(sin objetivo)»), fecha de inicio. Insignias: **Distribución** (verde, si ya tiene reparto) y **Terminado** (gris, si la fecha fin ya pasó). La seleccionada lleva borde dorado. |
| Pulsar tarjeta | Abre el editor en Volumen y resetea los estados del generador y del volcado. |

Estados: **cargando** (2 skeletons), **vacío** («Sin mesociclos todavía.»).

Sin ningún mesociclo seleccionado, el hueco del editor muestra un vacío
punteado: «Selecciona un mesociclo o crea uno nuevo.»

## 3. Cabecera del editor

Todo se **autoguarda** a los 800 ms de la última tecla. Indicador arriba a
la derecha: `…` (pendiente) · `Guardando…` (dorado, pulsa) · `✓ Guardado`
(verde, 2 s) · `⚠ Error` (rojo, se queda).

| Campo | Tipo | Reglas |
|---|---|---|
| Nombre del mesociclo | texto, máx. 60 | Placeholder «Meso #N». Vacío = se sigue llamando Meso #N. |
| Nº Meso | número ≥ 1 | |
| Semanas | número 1–16 | Duración del bloque en semanas de calendario. |
| Fecha inicio | fecha | Solo acepta ISO válido. **Aviso** si el ciclo es semanal y no empieza en lunes: texto explicativo + acción «Empezar el lunes (dd/mm)». |
| Sesiones por ciclo | chips 2…10 | Cambiarlo descarta el reparto elegido si no cuadra con él, y sube la duración del ciclo si era menor. |
| Duración del split | chips «Semanal» + 3,4,5,6,8,9,10,12,14 (solo ≥ sesiones) | Texto a la derecha: «Semanal (7 días)» / «N días · K semanas alternas» / «N días · rotativo». Si no es semanal: línea dorada «X semanas de bloque ÷ ciclo de N días = V vueltas · S sesiones en total» + párrafo explicativo (dos versiones: múltiplo de 7 vs rotativo). |
| Aviso ciclo sin descanso | banner de aviso | Si ciclo < 7 y sesiones ≥ ciclo y no hay split: explica que las sesiones se desplazan; acción «Hacerlo semanal (descanso el 7.º día)». |
| Objetivo | texto | Placeholder «Ej. Hipertrofia tren superior, puesta en forma general…». |
| Tipo (calendario) | select | Auto (según objetivo) · Fuerza · Hipertrofia · Definición · Mantenimiento · Descarga. Decide color/icono en el calendario del coach. |
| Incluye semana de descarga | toggle + número | Al activar, semana = última. Número 1…semanas. |

## 4. Pestañas

`Volumen` (trending_up) · `Distribución` (grid_view) · `Ejercicios`
(fitness_center) · `Cierre` (monitoring). Subrayado dorado (primitiva `Tabs`).
Cambiar de pestaña resetea el generador y el estado de volcado.

## 5. Pestaña Volumen (`ProgressionView`)

Objetivo: fijar **series semanales y prioridad por grupo muscular** (17
grupos) viendo el historial de mesociclos anteriores al lado.

- Leyenda de zonas de volumen (MV · MEV · MAV · MRV), colores por grupo (cada
  grupo tiene su propia tabla de landmarks: pecho y antebrazo no se miden igual).
- Botón **Sugerir volumen** → abre `VolumeSuggestionSheet` (§9.2).
- Leyenda: ▲ Sube · ▼ Baja · = Sin cambio · ⭐ Alta · ◑ Media · ⚪ Baja prioridad.

**Móvil (< sm)**: una tarjeta por grupo con: nombre, etiqueta de zona
coloreada, delta vs. meso anterior, **stepper − / valor / +** (0–25, color por
zona), **selector de prioridad** (⭐ ◑ ⚪, 44 px), barra de zona con marcas
MAV y MRV, historial en texto («Meso #1: 12 · Meso #2: 14»).

**Escritorio (≥ sm)**: tabla con scroll horizontal. Primera columna fija
(grupo). Una columna por mesociclo histórico (**solo lectura**: cifra, icono de
prioridad, delta; fondo heatmap por zona) y la columna **actual** (editable:
stepper + prioridad + delta + barra de zona; fondo heatmap). Cabecera de cada
columna: «Meso #N (actual)», fecha, «X ses. · Y sem», objetivo (2 líneas).
Pie: **Total series** (con delta), **Sesiones / ciclo**, **Semanas**.

- Tile grande: **Series semanales totales** (cifra hero) + delta.
- Nota: «N mesociclos · La columna «actual» es editable — el resto es historial
  de solo lectura.»

## 6. Pestaña Distribución

Objetivo: **repartir las series por sesión** dentro del ciclo y **generar las
rutinas**. Tiene 5 estados de generador: reposo/cargando · vista previa ·
asignando · hecho · error.

### 6.1 Reposo

1. **Aviso «Entrenamiento prediseñado»** (solo si el meso viene de una plantilla
   con días ya definidos): «N días · M ejercicios. El generador los usará en vez
   de auto-sugerir.»
2. **Reparto (N sesiones por ciclo)**: chips de splits disponibles para ese nº
   de sesiones (Torso/Pierna, Push/Pull/Legs…). Cada chip: nombre, «N d · hasta
   X×/sem por grupo». Uno lleva **★ Recomendado** (según volumen/prioridad).
   Elegir uno fija su ciclo y borra el calendario a mano; volver a pulsarlo lo
   quita. Sin splits para ese nº: texto «Sin plantillas de reparto para N
   sesiones — la distribución repartirá los grupos libremente.»
3. **Calendario del ciclo**: título «Calendario del ciclo (N días · S/S
   sesiones[ · a mano])». Una celda por día del ciclo: **día de la semana
   real** (L15, M16…) y tipo de sesión o «—». **Pulsar una celda alterna
   sesión/descanso** → el patrón pasa a «a mano» (color de aviso en vez de
   dorado), el nº de sesiones se ajusta solo y aparece **«Volver al
   automático»**. No se puede quitar el último día. Si el ciclo ≠ 7: nota «Los
   días mostrados son los de la primera vuelta…». Ayuda: «Pulsa un día para
   cambiarlo entre sesión y descanso…».
4. **Distribución Automática** (primario). Deshabilitado si el calendario a
   mano no cuadra con las sesiones (entonces aviso: «El calendario a mano tiene
   X días y el bloque Y sesiones. Ajusta uno de los dos, o vuelve al
   automático.»).
5. **Aviso «stale»**: si el volumen, sesiones, ciclo, split o calendario
   cambiaron desde el último reparto: «El volumen o los días cambiaron —
   recalcula para actualizar» (y debajo del todo: «Recalcula la distribución
   antes de generar rutinas.»).
6. **Rejilla semanal** (si hay reparto):
   - Leyenda: 9–12 series (verde) · >12 (aviso) · <9 (neutro).
   - **Tarjeta por sesión** (`DayCard`, 220–300 px): «Día N · tipo», **total
     de series** grande coloreado (verde 9–12, aviso >12), lista de
     grupos: nombre + **series editables** + **mover a otro día** (despliega
     chips «Día X» inline) + **quitar**. «Descanso» si está vacía. Al pie:
     select **«+ Añadir grupo…»** con los grupos que faltan.
   - **Frecuencia por grupo**: chips «Pecho 2/sem», tooltip con sesiones y
     días. Aviso si un grupo cae **en días seguidos** (con «entre vuelta y
     vuelta» cuando aplica): «Son fechas consecutivas para el atleta — revisa
     si le da tiempo a recuperar.»
   - Resumen: **Series totales** · **Sesiones activas** (N/M) · «Generado
     dd mmm hh:mm».
   - Vacío: «Pulsa «Distribución Automática» para repartir las series.»
7. **Rutinas del mesociclo** (solo si hay reparto al día o días prediseñados):
   botón **Generar rutinas** (secundario dorado; «Analizando…» con spinner
   mientras) + texto «Creará V vueltas × S sesiones = T sesiones».

### 6.2 Vista previa (`RoutinePreview`)

Lo que el generador propone, **editable antes de asignar**. Por sesión:
lista de ejercicios con nombre, grupo, **series (− / +, 1–20)**, reps, RIR,
descanso, **subir/bajar**, **cambiar** (abre picker §9.3), **quitar**,
**añadir ejercicio**. Avisos por sesión: grupos sin ejercicios en el catálogo y
«Material no disponible según el onboarding» por ejercicio. Muestra razones de
elección del motor cuando existen. Botones: **Volver** y **Asignar** (crea las
sesiones en el calendario del atleta).

### 6.3 Asignando

Spinner + «Creando sesiones en Firestore…» + barra de progreso «n / total
sesiones».

### 6.4 Hecho

Check verde + «¡Rutinas asignadas!» + «T sesiones creadas a partir del
dd-mm-aaaa» + **Volver a la distribución**.

### 6.5 Error

Banner de error con el mensaje (perfil del atleta no encontrado, error de
Firestore…) + **← Volver**.

## 7. Pestaña Ejercicios (`MesoExercisesView`)

Objetivo: **editar las sesiones ya generadas** del mesociclo. Cada sesión es
un único documento reutilizado en todas las vueltas: editar aquí cambia todas
las semanas restantes; las sesiones ya registradas no se tocan.

- **Cargando**: 3 skeletons. **Vacío**: «Aún no se han generado rutinas para
  este mesociclo.» + acción «Ir a Distribución para generarlas».
- Nota superior: «Cada sesión se repite igual en todas las vueltas del
  mesociclo — edita aquí y se aplica a todas a la vez.»
- **Balance de la semana** (`SeriesBalance`): pautado vs. volumen del
  mesociclo/ciclo, un chip por grupo descuadrado; **pulsar un chip salta al
  ejercicio** de ese grupo (cambia de día si hace falta y lo resalta 1,6 s).
- **Un día a la vez** (pestañas + deslizar) cuando el contenedor es estrecho;
  **rejilla de 2–3 columnas** cuando caben (≥ 380 px por columna). Mismo
  panel en los dos casos.

**Panel de un día**:
- Cabecera: **título editable** (pulsar → input; Enter guarda, Esc cancela;
  no admite vacío; en rutinas antiguas no admite repetido) · «N series · M
  ejercicios · ~X min» · balance del día vs. su distribución.
- **Tarjeta de ejercicio**: subir/bajar · nº · **nombre** (mantener pulsado o
  clic derecho → vídeo) · grupo · aviso **duplicado** («También programado otro
  día», borde y texto de error) · botón **Vídeo** (si tiene) · **cambiar** ·
  **quitar** (confirmación) · `ExerciseConfigEditor` (§9.4).
- Pie: **Añadir ejercicio** · **Usar de biblioteca** (si hay rutinas de
  biblioteca; Sheet con la lista → confirmación «¿Copiar los N ejercicios de
  “X” a este día? Se añaden a los que ya tenga.») · nota «Se aplica a todas las
  semanas de este mesociclo — las sesiones ya completadas no se tocan.»
- Sheet de **vídeo** del ejercicio.

**Bloque «Asignar al atleta»** (debajo, si hay sesiones): texto «Vuelca las N
sesiones de {meso} al calendario de {atleta}, desde el {fecha}. No toca los
ejercicios: reescribe solo las fechas.» + **Asignar mesociclo** (primario;
«Asignando…»). Resultado: «✓ N sesiones asignadas · V vueltas × S desde el
{fecha} · K días ya entrenados se conservan.» o mensaje de error.

## 8. Pestaña Cierre (`MesocycleReviewPanel`)

Lectura del bloque terminado. **Vacío**: «Sin sesiones registradas en este
mesociclo.» Con datos:
- KPIs: **Adherencia** (barra de cumplimiento) · **Volumen hecho** · **Tonelaje**
  · **Récords**.
- **Titulares** del cierre + **copiar** al portapapeles.
- Selector de detalle (`SegmentedControl`) con las secciones del análisis.
- **Borrador para el cliente** (texto) + **copiar**.
- Cargando: skeletons mientras pide logs/asignaciones (solo si no venían del
  hub).

## 9. Overlays y componentes compartidos

### 9.1 Diálogo «Usar plantilla»
«Se clonarán todos los mesociclos del programa para {email}.» Lista de
plantillas: nombre, descripción, «N mesos», «X sem en total», chips de etapas
(«Fuerza · 4sem»), acción «Usar →». Cargando (3 skeletons) · vacío («Sin
plantillas. Crea una en Ejercicios → Plantillas.»). Aplicar crea todos los
mesos encadenados por fecha y sus tareas de revisión.

### 9.2 Sheet «Sugerir volumen» (`VolumeSuggestionSheet`)
Dos pasos. **Paso 1**: nivel del atleta (segmentado), intención (segmentado),
prioridad por grupo (pulsar cicla ⭐ ◑ ⚪). Botones Cancelar · Ver propuesta.
**Paso 2**: tabla propuesta por grupo (filas desplegables con el porqué),
«Cómo aplicarlo» (reemplazar todo / solo rellenar los que están a 0). Botones
Ajustar · Aplicar.

### 9.3 Sheet «Elegir ejercicio» (`ExercisePickerSheet`)
Chips por grupo muscular (con «Todos»), buscador «Buscar ejercicio en todos
los grupos...», lista de resultados, vacío «Ningún ejercicio coincide.» Se usa
desde la vista previa y desde Ejercicios, para añadir y para cambiar.

### 9.4 `ExerciseConfigEditor` (dentro de cada tarjeta de ejercicio)
Series (stepper), reps (texto «8-10»), RIR (radiogroup FALLO·0…5), descanso,
**secciones plegables**: notas («Técnica, variante, carga, progresión…»),
técnica (chips; quitar), calentamiento (segmentado: ninguno/auto/manual; en
manual filas kg·reps con añadir/eliminar), reglas de progresión (añadir /
eliminar), **grabar vídeo** (toggle), **bloques** (agrupar ejercicios:
etiqueta del bloque, quitar, añadir; desactivar bloques).

### 9.5 Confirmaciones y avisos
`useConfirm` (diálogo Sí/No) para: quitar ejercicio, cambiar ejercicio ya
asignado, copiar rutina de biblioteca. Toasts para: renombrado duplicado,
mesociclo asignado, plantilla o borrado fallidos.

## 10. Zona de borrado
«Eliminar mesociclo» (enlace discreto) → confirmación inline «¿Eliminar este
mesociclo?» **Confirmar** (peligro) · **Cancelar**.

## 11. Reglas que el diseño no puede romper

1. **Autoguardado**: no hay botón «Guardar» en la cabecera ni en Volumen ni en
   Distribución. El indicador de estado tiene que existir y ser visible.
2. **Una acción primaria dorada por zona**: Nuevo mesociclo · Distribución
   Automática · Asignar (vista previa) · Asignar mesociclo (Ejercicios).
3. **Volumen vs. Distribución vs. Ejercicios** son tres capas distintas
   (cuántas series por grupo → en qué sesión → qué ejercicios). El diseño
   puede reordenarlas o fusionarlas visualmente, pero no eliminar ninguna.
4. El **calendario del ciclo** es editable pulsando días; no es un gráfico.
5. **Historial de mesociclos** en Volumen es solo lectura y siempre está al
   lado del actual.
6. Los avisos de **stale**, **días seguidos**, **duplicado**, **material no
   disponible**, **ciclo sin descanso** y **no empieza en lunes** existen
   todos y llevan su acción cuando la tienen.
7. Todo objetivo táctil ≥ 44 px en móvil (steppers, chips de sesiones,
   prioridad).
8. Sin «IA» en pantalla: el motor de ejercicios y el sugeridor de volumen se
   llaman por lo que hacen («Generar rutinas», «Sugerir volumen»).

## 12. Lo que hoy es deuda visual (para que el diseño lo resuelva, no lo copie)

- 25 colores de estado sin token (`red-400/500`, `orange-300/400/500`,
  `amber-400`): errores, avisos de ciclo, stale, duplicado.
- 35 `<button>` a mano: steppers ±, chips de sesiones/ciclo, selector de
  prioridad, chips de split, celdas del calendario, «Generar rutinas»,
  «Volver», confirmación de borrado, filas de plantilla.
- 3 `<input>` numéricos y 1 de texto sin la primitiva `Input` (Nº meso,
  semanas, semana de descarga, nombre).
- Iconos por `material-symbols-outlined` en texto en vez de `Icon` (12 usos).
- El toggle de descarga es un botón con estilos propios (no hay primitiva
  `Switch` en el DS: **decisión pendiente**: crearla o usar `SegmentedControl`).
