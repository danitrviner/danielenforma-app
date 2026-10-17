# Motor CDG en En Forma · informe

Rama `cdg-motor` (desde `main`), worktree `~/en-forma-cdg`. **Sin commits ni push.** Nada escrito en Firestore: solo lecturas y simulacros.
Las decisiones por defecto y lo que queda por decidir están en [`cdg-decisiones-pendientes.md`](cdg-decisiones-pendientes.md).

## Resultado
- `npm run lint` ✔ · `npx vitest run` ✔ (2.560 tests, 210 archivos) · `npm run test:reglas` ✔ (emulador, 27 tests) · `npx tsx scripts/cdg/probarCatalogo.mjs` ✔.
- Los 6 IF del Día 1 de «MESOCICLO 1 ISRAEL» (24.76702, 16.91235, 9.01756, 12.0135, 4.626, 7.068) salen idénticos desde un `WorkoutExercise` real: `src/utils/cdg/programacion.test.ts`.
- Los 22 tests originales del motor siguen en verde y NO se tocó ninguna fórmula (`motor.ts` y `seguimiento.ts` solo cambian los imports a `.js`).

## Emparejado de ejercicios (634 ejercicios reales de Firestore, leídos hoy)
| Estado | Nº |
|---|---|
| Exactos | 506 |
| Probables (coincide el id original `sys_…` con UN nombre CDG; la limpieza acortó el nombre) | 123 |
| Ambiguos | 2 |
| Sin pareja clara | 3 |

Los 5 que hay que mirar a mano (todos en la pantalla, filtro «Por revisar»):
- `Spoto press en multipower` (ambiguo): el catálogo CDG tiene la versión «plana» y la «amplia»; el id del ejercicio dice «plana».
- `Spoto press` (sin pareja): el nombre CDG está mal escrito en la hoja («Spoto press (caja torácica plana) Pectoral, …», sin guion), por eso no encaja solo; el id dice «plana».
- `Rotación de hombro a 90º` (ambiguo) y `Rotación de hombro a 90º (Rotadores internos)` (sin pareja): el CDG tiene dos con el mismo nombre, «… - Rotadores internos» y «… - Rotadores externos». El segundo es claramente el de internos; el primero (sin sufijo) probablemente es externos: a confirmar tú.
- `Encogimientos de trapecio en polea bilateral` (id `MilpBdi5yCABkuvtbhnK`, ejercicio propio): no hay equivalente claro; el candidato más cercano es «Curl de bíceps en polea» (38 %), que NO es. Sin equivalente, salvo que quieras buscar otro.
- Lista completa de los 128 no exactos, con candidatos: `scripts/out/emparejamiento-cdg.csv` (en `scripts/out/`, ignorado por git).

## Qué he cambiado, archivo por archivo
**Nuevo**
- `src/utils/cdg/emparejado.ts` · propuesta de emparejado y buscador sobre el catálogo (misma lógica que el script).
- `src/utils/cdg/programacion.ts` · resumen de sesión: IF, IEM (con compuestos), estrés articular, tiempo, avisos (RIR 5, sin vínculo, fuera de catálogo).
- `src/utils/cdg/integracion.ts` · seguimiento al vuelo desde logs: semanas realizadas por `dayIndex`, Gestión, aguda/crónica, rendimiento del ciclo.
- `src/utils/cdg/estimulo.ts` · IEM de lo realizado (cierre y correlaciones).
- `src/utils/cdg/*.test.ts` · `emparejado`, `programacion`, `integracion`, `estimulo` (más los 22 del motor).
- `src/db/cdg.ts`, `src/hooks/useMotorCdg.ts` · lectura del catálogo (solo coach, React Query) y `crearMotor(expandirCatalogo(json))`.
- `src/components/EmparejadoCdgScreen.tsx` · revisión del emparejado.
- `src/components/mesociclo/PanelIndicesCdg.tsx` · panel en vivo del editor.
- `src/components/mesociclo/SeguimientoCdg.tsx` · pestaña de seguimiento.
- `src/utils/oneRepMax.test.ts`.
- `scripts/exportarEjerciciosCdg.mjs` (lectura), `scripts/aplicarEmparejadoCdg.mjs`, `scripts/subirCatalogoCdg.mjs` (simulacro por defecto), `scripts/cdg/probarCatalogo.mjs`, `scripts/emparejarCdg.mjs` (ahora también empareja por id original).
- `docs/cdg-decisiones-pendientes.md`, `docs/cdg-informe.md`.

**Modificado**
- `.gitignore`: `scripts/cdg/*.json` (el catálogo no va al repo).
- `firestore.rules`: `cdgCatalogo` → lectura `isCoach()`, escritura `false`. Tests en `src/db/reglas.emulador.test.ts` (4 nuevos).
- `src/db/borradoCuenta.test.ts`: `cdgCatalogo` clasificada como «sin datos del atleta».
- `src/types.ts`: `Exercise.cdgNombre?`, `Exercise.cdgSinEquivalente?`, `UserProfile.cdgUmbralesCarga?`.
- `src/components/ExerciseTriageScreen.tsx`: tercer modo «Emparejado CDG» (los atajos de teclado se apagan en ese modo).
- `src/components/MesocycleManager.tsx`: `PanelIndicesCdg` encima de los días (plegado), pestaña nueva «Seguimiento CDG».
- **RM (D4)** `src/utils/oneRepMax.ts`: `epley` desaparece; `rmCdg` / `rmDeSerie` / `rirEfectivo` sobre `calcularRM`. Usos: `trainingReport`, `verificacionObjetivo`, `loadTrend`, `athleteMetrics` (+`BestSet.rir`), `challengeOptions`, `warmup/WarmupEngine`, `LoadHistoryPanel`, `CorrelationPanel`, `TrainingScreen`, `training/ExerciseCloseCard`. Todos pasan el RIR real de la serie (al fallo = 0). Tests `loadTrend.test` y `weeklyChallenge.test` actualizados (valores recalculados a mano; en uno cambié 100 kg RIR 1 por 95 kg para que el progreso siga cayendo entre línea base y objetivo).
- **IEA → IEM (D2)**: `cierreMesociclo.ts` y `revisionCoach.ts` ya no calculan el IEA acumulado; `MesocycleReviewPanel.tsx` (vista «Estímulo (IEM)») y `CorrelationPanel.tsx` (familia «Estímulo (IEM)») usan el IEM. «IEA» solo queda para estrés articular.
- Textos «Epley» → «fórmula de CDG»: `BloqueMejoresEjercicios.tsx`, `revisionCoach.ts` (comentario), `ai/systemPrompt.ts`, `ai/tools.ts`.
- `src/utils/cdg/{motor,seguimiento,adaptadores,index}.ts`: solo imports con `.js`.

## Programar con el IEM (objetivo, agujetas, freno/acelerador)

- **Panel CDG del editor:** arriba va «IEM por zona», con las sesiones en columnas, la semana, el **Objetivo** (editable; se guarda en `Mesocycle.cdgObjetivosIem`), lo que **Falta**, las series efectivas, la variación frente a la semana anterior y las últimas **agujetas a las 48 h**. Las zonas con objetivo salen primero.
- **En la matriz** hay tres filas nuevas: IEM total, IEM por punto de IF e IEM por minuto.
- **Aviso articular:** sale cuando el estrés articular de una zona sube más que su IEM.
- **Bloques de definición** (`phaseType` o el objetivo): una línea compara el IEM y el IF con la semana anterior («mantener IEM, bajar IF»).
- **Barra fija de objetivos** (`BarraObjetivosCdg`): se queda encima de los días mientras editas ejercicios y muestra, en cada zona con objetivo, una barra con lo programado frente al objetivo. Solo sale si el bloque tiene objetivos.
- **«Aporte de cada ejercicio»** (desplegable): cuánto IEM da cada ejercicio a cada zona, con las zonas objetivo marcadas. Sirve para elegir los últimos ejercicios.
- **Seguimiento CDG → «Freno / acelerador por zona»:** muestra la actitud del bloque (estático, dinámico o agresivo, en `Mesocycle.cdgActitud`), el sueño reciente y una tabla. Cada fila de la tabla tiene la zona, las agujetas (anterior → última), el IEM de la semana realizada y su variación, el objetivo y la propuesta: frenar, vigilar, mantener o acelerar.
- **Cuestionario nuevo «Agujetas a las 48 h»** (1-5 por zona). Está en los presets y en la plantilla «Hipertrofia · 6 sem». Para que salga hay que asignarlo al atleta.
- **Vista previa del generador:** muestra la tabla de zonas sin objetivos.

## Catálogo completo en la app (hecho el 16-10)

- 633 ejercicios ya existentes vinculados con `aplicarEmparejadoCdg.mjs`: 629 automáticos y 4 revisados a mano (Spoto press ×2 y rotación de hombro a 90º ×2).
- Los **403 ejercicios CDG que faltaban se crearon** con `scripts/crearEjerciciosCdg.mjs`. Nacen como los del sistema (`system`, tipo fuerza, `cdgNombre` y vídeo del catálogo). El nombre conserva la variante (goma, caja torácica, straps). El grupo principal y los secundarios salen de los músculos del nombre CDG; en los 22 fullbody, y en «Pull over en máquina», salen de los pesos del catálogo, con un máximo de 3 secundarios.
- Ahora la app tiene 1.037 ejercicios y los 1.034 de CDG están todos vinculados. Queda «Encogimientos de trapecio en polea bilateral» (tuyo, sin equivalente CDG) por decidir.

## Comandos pendientes (los ejecutas tú, en este orden)
Todos desde `~/en-forma-cdg`. Cada uno es simulacro hasta que le añades `--aplicar`.

1. **Reglas** (sin esto la app no puede leer el catálogo). Ojo: despliega las reglas de ESTA rama, que son `main` + `cdgCatalogo`:
```bash
cd ~/en-forma-cdg && npx firebase deploy --only firestore:rules
```
2. **Subir el catálogo** (362 KB → `cdgCatalogo/v4`):
```bash
cd ~/en-forma-cdg && GOOGLE_APPLICATION_CREDENTIALS="$HOME/Desktop/CLave FIREBASE.json" node scripts/subirCatalogoCdg.mjs --aplicar
```
3. **Escribir `cdgNombre` en los 506 exactos** (añade `--incluir-probables` para sumar los 123 probables):
```bash
cd ~/en-forma-cdg && GOOGLE_APPLICATION_CREDENTIALS="$HOME/Desktop/CLave FIREBASE.json" node scripts/aplicarEmparejadoCdg.mjs --incluir-probables --aplicar
```
4. Revisar los dudosos en la app (abajo), exportar y aplicar:
```bash
cd ~/en-forma-cdg && GOOGLE_APPLICATION_CREDENTIALS="$HOME/Desktop/CLave FIREBASE.json" node scripts/aplicarEmparejadoCdg.mjs --revisiones ~/Downloads/revisiones-cdg.json --aplicar
```
Sin `--aplicar` los tres scripts de escritura enseñan qué harían y no tocan nada. Tras escribir en `exercises` el script marca el catálogo como cambiado para que los dispositivos relean.

## Cómo probarlo en la app (sesión de coach)
- **Emparejado:** pestaña «Ejercicios» de la sección de entrenamiento › «Revisar catálogo» › selector «Emparejado CDG». Filtros Por revisar / Probables / Exactos / Decididos; Confirmar, Cambiar (buscador) y Sin equivalente; «Exportar revisiones».
- **Panel en vivo (siempre visible):** Macrociclo › editor de un mesociclo › pestaña «Ejercicios», debajo de las series efectivas: «Índices CDG · Base/Semana N», con las sesiones en COLUMNAS (como se programa en la plantilla) y una columna «Semana»: IF, tiempo, IEM por grupo y por músculo, estrés articular. Sigue a la barra de semanas. Avisa de RIR 5 y de ejercicios sin vínculo.
- **IF en la cabecera de cada día** («… · IF 31,8», con aviso si algo no cuenta), en el editor y en la vista previa del generador.
- **Vista previa del generador** (Distribución › Generar rutinas): el mismo panel en columnas, calculado sobre lo que se va a asignar (semana Base), antes de pulsar «Asignar».
- **Seguimiento:** misma pantalla, pestaña «Seguimiento CDG»: Gestión, carga aguda/crónica con umbrales por atleta, rendimiento (RM y tonelaje), mejora del ciclo, antropometría.
- **IEM en el cierre:** pestaña «Cierre» › «Estímulo (IEM)». **Correlaciones:** familia «Estímulo (IEM)».
- **RM nuevo:** cualquier «1RM est.» (historial de cargas, cierre de ejercicio, PR al terminar sesión) ya usa RIR.
- Mientras el catálogo no esté en Firestore, los paneles lo dicen y la pantalla de emparejado deja cargar `catalogo-cdg.json` a mano.

## Verificado y no verificado
- **Sí:** tests, lint, reglas en emulador, simulacros contra tu Firestore real (lectura), y una página temporal (ya borrada) con el catálogo completo y datos de prueba donde comprobé en el navegador el panel, el seguimiento y la pantalla de emparejado (filtros, confirmar en lote, borrador). Sin errores de consola propios.
- **No:** el flujo real con login de coach dentro de `MesocycleManager` ni con un atleta real (no puedo iniciar sesión); solo en tema claro y ancho de escritorio; el Día 1 de «MESOCICLO 1 ISRAEL» se verifica con los números de la hoja en el test, no creando el mesociclo en la atleta de pruebas (sería escribir en Firestore).
