# 05 · Modelos de datos y motores (propuesta)

> Todo lo marcado «propuesto» es diseño, no código. Regla general: **motores puros en `src/utils/` con tests**, escrituras por `dbService`/`src/db/*` con `stripUndefined`, claves por email, reglas `isOwner()/isCoach()`.

## 1. Fuente única de objetivos nutricionales (N-01)

**Hoy** (comprobado): `onboarding.macroGrams` (semilla Mifflin, `utils/energyCalc.ts:63`), `Diet.budget` (lo que ve el atleta), `nutritionPrograms.phases[].targetKcal` (si existe manda sobre el budget en `resolvePhaseTargetKcal`, `nutritionPeriodization.ts:47`), `athleteDietConfigs.weeklySchedule` (gana a `activeDietIds`, `utils/nutritionSummary.ts:37`). Solo hay **aviso** de discrepancia (`NutritionPlansScreen.tsx:285`).

**Propuesto**:
```ts
// Puro. Única forma de saber «qué le toca comer hoy» a un atleta.
objetivoDelDia(ctx: { programa, configDietas, dietas, semanasNutricion, fecha }): {
  fecha: string; faseId?: string; tipoDia: 'entreno'|'descanso'|'refeed'|'libre';
  kcal: number; g: { p: number; hc: number; grasa: number };
  intercambios: Record<'HC'|'PROT'|'GRASA', number>;   // derivado con GRAMS_PER_EXCHANGE
  origen: 'fase'|'dieta'|'calendario';                   // trazabilidad
}
```
- Orden de resolución: fase activa (kcal/macros) → tipo de día (ciclado, refeed con su `dietId`) → ajustes de semana (`dietaDeLaSemana`) → dieta pautada solo aporta el **reparto por comidas**.
- `onboarding.macroGrams` queda como semilla inicial (no se lee para el día).
- Constantes únicas: `utils/nutritionConstants.ts` (`GRAMS_PER_EXCHANGE`); eliminar `G_PER_EXCH` local; MIX contados igual en todos los sitios.
- Migración: ninguna de datos; sí test de paridad con todos los atletas reales (script en seco que compara objetivo resuelto vs. budget actual y lista diferencias).

**Compartido vs. propio** (el atleta usa los dos métodos): compartido = objetivo, tipo de día, recetas, alimentos personales; Intercambios = `Diet.meals` + `dietCompletionLogs`; Diario = `foodLog`.

## 2. Catálogo de alimentos (N-04)

```ts
interface FoodItem {             // foodItems (311) — se AÑADEN campos, label se conserva
  id; label; category; mode;     // existentes
  porCien?: { kcal: number; p: number; hc: number; grasa: number; fibra?: number };
  estado?: 'crudo'|'cocido'|'seco'|'escurrido'|'listo';
  unidad?: { nombre: 'unidad'|'rebanada'|'cucharada'; gramos: number };
  fuente?: { tipo: 'bedca'|'etiqueta'|'off'|'propio'; ref?: string; fecha?: string };
  gramosPorIntercambio?: number;  // = 10.000 / kcal por 100 g (ya existe en alimentoDesdeMacros)
}
```
- Cocido vs. crudo: **dos entradas distintas** (no conversión automática) salvo factor validado por Dani por alimento (arroz ×2,5–3, pasta ×2–2,2, legumbre ×2,4…) → **pendiente de validar** (06).

## 3. Recetas calculadas y motor de ajuste (N-05, N-06)

```ts
interface RecetaBase {            // colección propuesta: recetasBase (coach)
  id; nombre; tipoComida: ('desayuno'|'comida'|'cena'|'snack')[]; minutos; tupper?; etiquetas[];
  nivel: 'base'|'ampliada';
  ingredientes: { foodId: string; gramos: number; min: number; max: number;
                  palanca?: 'hc'|'proteina'|'grasa'; fijo?: boolean }[];
  pasos?: string[]; historial?: CambioReceta[];
}
```
**Cálculo**: `nutrientes(receta) = Σ ingrediente.gramos × foodItem.porCien / 100`. Si algún ingrediente no tiene `porCien` → la receta queda «sin calcular» (no se estima).

**Ajuste a objetivo de comida** (determinista):
1. Objetivo `T = {p, hc, g}` de la comida (de `objetivoDelDia` + reparto).
2. Variables = gramos de los ingredientes con `palanca` (los `fijo` no se tocan).
3. Resolver mínimos cuadrados ponderados con límites `[min, max]` (problema pequeño: 2-4 variables → solución cerrada por ingrediente-palanca en orden proteína → HC → grasa, con 2-3 pasadas de corrección cruzada; sin dependencias nuevas).
4. Redondeo práctico (5 g sólidos, 1 g aceite) y recálculo exacto.
5. Error relativo por macro; si alguno > tolerancia (propuesta 10 % o 5 g) → «no encaja» + candidatas de `menuEngine.rankCandidates` que sí.
6. Salida explicable: `{ingrediente, antes, después, motivo}`.
- Reutiliza: `bestScaleFit` (`menuEngine.ts:274`) como plan B de escala global; `escalarRecetaEntera` para recetas importadas sin ingredientes vinculados.

### Acceso a recetas (N-03)

```ts
// Extiende athleteRecipeRules/{email} (hoy: reglas[] para esconder, recomendadas[])
interface AccesoRecetas {            // documento global `recipeAccess/global` + `recipeAccess/grupo_{id}`
  nivelAmpliada: boolean;            // ¿ve la biblioteca ampliada?
  ocultas?: string[]; extra?: string[];
}
// Resolución para un atleta: atleta > grupo > global. Recetas: nivel: 'base'|'ampliada'.
```
Las dietas de kcal no se tocan: siguen siendo por atleta.

## 4. Diario de alimentos y fuentes (D-01…D-05)

```ts
interface FoodLogEntry {          // colección propuesta foodLog, id auto; athleteId = email
  athleteId; fecha: 'YYYY-MM-DD'; comida: 'desayuno'|'comida'|'merienda'|'cena'|'snack';
  origen: { tipo: 'catalogo'|'personal'|'off'|'receta'; id: string; codigo?: string };
  nombre; marca?; gramos: number;
  nutrientes: { kcal; p; hc; grasa } | null;   // instantánea; null = datos incompletos
  creado; editado?;
}
```
Totales del día = suma en cliente (o doc resumen por día si el volumen lo pide).

**Fuentes evaluadas**

| Fuente | Cobertura España | Código de barras | Licencia / uso | API | Encaje |
|---|---|---|---|---|---|
| **Open Food Facts** | Alta en marcas de supermercado; calidad variable | Sí | **ODbL**: atribución + «compartir igual» para la base derivada; imágenes CC-BY-SA | 15 lecturas/min/IP producto, 10/min búsqueda; volcado completo CSV/JSONL para uso masivo | Productos comerciales por código. Caché propia por código. |
| **AESAN – base de alimentos comercializados (2022)** | 29.575 productos, ~85,7 % del mercado | No consta | No encontré licencia de reutilización ni descarga | — | Por ahora no integrable; preguntar a AESAN. |
| **BEDCA** | Alimentos genéricos españoles | No | Citar fuente; **uso no personal/comercial requiere autorización expresa** (condiciones v1.0, 2010) | Web, sin API pública | Valores por 100 g de genéricos, **solo con autorización**. |
| Banco propio En Forma | 311 alimentos del método | No | Propio | — | Base del método y de las recetas. |

**Recomendación**: banco propio (con `porCien`) para genéricos + Open Food Facts para marcas (consulta en vivo con caché en `offCache/{codigo}`; mantener los datos OFF en una colección separada para no «contaminar» con ODbL el banco propio) + alimentos personales. BEDCA solo si AESAN autoriza. Mostrar la atribución «Datos de Open Food Facts (ODbL)».

**Escáner**: Safari iOS no soporta `BarcodeDetector` por defecto (WebKit, 2026) → en web, lector WebAssembly (ZXing); en Capacitor, plugin ML Kit. Ambas son **dependencias nuevas** que habría que aprobar. Ampliar `NSCameraUsageDescription`.

## 5. IEM / IF en volumen (E-01, E-05)

Motor existente (`origin/main`, `src/utils/cdg/motor.ts`, réplica «Índice de hipertrofia V4» de CulturaDeGym):
- **IF por serie** = Σ(factor tamaño × valor músculo) + inestabilidad, × (1 − ajuste por RPE {6:0,73, 7:0,53, 8:0,41, 9:0,25, 10:0}) × técnica × factor de reps.
- **IEM por músculo** = valor × intensidad por RPE {6:0,95 … 10:3}, ÷2 si reps mín. < 5, × (1 o 0,6) × técnica.
- Agregación serie → ejercicio → sesión → semana. RIR→RPE; **RIR 5 cuenta 0** (decisión pendiente).
- **No se cambian fórmulas.** La propuesta es de presentación: resumen semanal (series, IEM total, IF semana, ratio agudo/crónico, avisos) + detalle por zona plegable + IF y estrés articular plegados; valores de ejercicio siempre etiquetados «por serie».

## 6. Serie principal + técnica (T-01, E-06)

```ts
interface SeriePrescrita { reps: string; rir?: number; carga?: string;
  tecnica?: { tipo: 'dropset'; bajadas: number; pctBajada: number; objetivo: 'fallo'|number }
          | { tipo: 'myoreps'; repsActivacion: string; miniSeries: number; repsObjetivo: number; descansoSeg: number }
          | { tipo: 'restpause'; pausas: number; descansoSeg: number; repsObjetivo: number } }
// WorkoutExercise: series?: SeriePrescrita[]  (si falta → expandSetGroups como hoy)
// WorkoutSetLog: + segmentoDe?: number (índice de la serie principal), + tipoSegmento?
```
- Compatibilidad: `technique` a nivel ejercicio ⇒ se interpreta como técnica **en la última serie** (igual que `utils/cdg/adaptadores.ts`).
- **Volumen**: solo series principales. **IEM/IF**: el factor de técnica del motor se aplica a la serie principal que la lleva; los segmentos no se cuentan como series (evita doble conteo).
- Logs históricos con D1/D2 como series: recalcular volumen al leer si se marca la sesión como «drop legado» → **decisión** (06).

## 7. Motor de progresiones por objetivo de IEM (E-08, E-09)

Entradas: prescripción por semana (`resolverEjercicioDelMeso`), catálogo CDG, `ejerciciosClave`, grupos incluidos, modo/velocidad, palancas permitidas, contexto semanal (agujetas 48 h, sueño, estrés, motivación, fatiga post-sesión, rendimiento/tonelaje de `realDeLaSemana`), límites del atleta.

Algoritmo (determinista, por semana s → s+1):
1. Para cada ejercicio de un grupo incluido: `IEM_obj(s+1) = IEM(s) × (1 + v)` con `v` = 10/20/30 % según velocidad; en modo dinámico `v` se reduce o anula según reglas de contexto.
2. Candidatos ordenados por coste de fatiga (ΔIF/ΔIEM): bajar RIR (si RIR > mínimo) → añadir serie (si ≤ +1/semana y bajo MRV) → técnica (solo si permitida y ejercicio de aislamiento).
3. Elegir el candidato de menor ΔIF que alcanza el objetivo (o combinación de 2).
4. Validar: tope de series por zona (MRV de `data/volumeLandmarks.ts`), tope de IF de sesión (tolerado por atleta, rama IH), grupos excluidos intactos.
5. Emitir propuesta con motivo; nada se escribe sin aprobación.

**Reglas de contexto (rama IH, `utils/cdg/agujetas.ts`) — pendientes de validar contra el Excel**: estrés ≥ 7, sueño < 6 h o motivación ≤ 4 = contexto desfavorable; contexto neutro → mitad de subida; fatiga post-sesión ≥ 8 → no subir; IEM ≥ 100 → máximo 10 %. Agujetas: estático sube con 1; dinámico con 1-2 (Excel: medio 1-2, dinámico 1-2-3).

## 8. Carga aguda / crónica — tabla de trazabilidad

| Concepto | Dato necesario | Fuente actual | Regla documentada | Frecuencia | Aviso / decisión | Cómo mostrarlo | ¿Automatizable? | Falta |
|---|---|---|---|---|---|---|---|---|
| Carga aguda (fuerza) | IF/IEM/estrés art. de la semana | `utils/cdg/seguimiento.ts` (lo **programado** de la semana siguiente) | Motor CDG | semanal | ratio fuera de 0,8–1,6 (`cdgUmbralesCarga`) | KPI en resumen semanal | Aviso sí; decisión no | Validar si «aguda» debe ser lo programado o lo realizado |
| Carga crónica (fuerza) | media de semanas realizadas | ídem: **exactamente 6** semanas del mismo bloque | Motor CDG | semanal | — | — | — | Cruzar bloques (EWMA 28-42 días) para mesos < 7 semanas |
| Sesión → sesión | IF por sesión, tonelaje | `ResumenCdgDia`, `workoutLogs` | Excel: IF = pérdida de rendimiento intra-sesión + readiness | por sesión | caída de rendimiento > X % | fila en Seguimiento | Aviso | Umbral X no documentado |
| Semana → semana | IEM por zona, agujetas 48 h | Panel CDG, cuestionario agujetas | Excel PROGRAMACIÓN F13-F14 (estático/medio/dinámico; suave 10/medio 20/agresivo 30 %) | 7 días | propuesta de progresión | Planificar progresión | Propuesta sí, aplicar con OK | Nivel «medio» de sensibilidad |
| Meso → meso | IEM/IF medios, cierre | `cierreMesociclo.ts`, `lecturaBloque.ts` (rama IH: tonelaje vs RM, «¿toca cambiar de bloque?») | Rama IH | por bloque | cambio de bloque | Cierre | Aviso | Reglas formales en la formación (PDF no leídos) |
| Readiness | sueño, estrés, DOMS | `readinessIndex.ts` (IRP) | código | semanal | IRP bajo → conservador | badge | Aviso | Validar con la formación |
| Cardio ATL/CTL | TRIMP | `cardioMetrics.ts:146` (7/42 días EWMA) | código | diaria | TLR > 1,3 | `BloqueCardio` | Aviso | — |

«ICB» aparece en el Excel sin definición; la nota de bóveda `metodologia-iem` está enlazada pero **no existe**.

## 9. CRM normalizado (R-01…R-03)

```ts
type TipoServicio = 'trimestral'|'semestral'|'anual'|'otro';
interface CrmServicio { /* existentes */ tipoServicio: TipoServicio; nombre: string /* derivado salvo 'otro' */ }
```
- Migración: script en seco que agrupa `nombre` normalizado (minúsculas, sin tildes, «3 meses»/«trimestre» → trimestral…) → CSV para Dani → aplicar solo `tipoServicio`.
- Indicador disponible: **ingreso neto cobrado** por tipo (pagos `pagado` + parciales − devoluciones), ticket medio, renovación. **Rentabilidad** necesitaría costes por servicio y comisiones (no existen campos).

## 10. Check-ins

```ts
interface RevisionSemana {       // derivada, no colección: revisionDeLaSemana(asignaciones, respuestas, fotos, fecha)
  id: `${email}_${viernesISO}`; pasos: Paso[]; estado: 'pendiente'|'en_curso'|'incompleta'|'completa'|'caducada' }
// questionnaireResponses: + estado: 'borrador'|'enviada', + revisionId
```
Reglas de asignación y caducidad sin cambios (`questionnaireSchedule.ts`).
