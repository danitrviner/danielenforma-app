# Contrato de datos — En Forma

Nombres de campo y forma de los documentos, para que la implementación no se los invente. Firebase/Firestore, `camelCase`, fechas ISO 8601 con zona, pesos en kg y minutos en enteros.

## Escalas y unidades

- **RIR** (repeticiones en reserva), entero **0–5**. RIR 2 = podía haber hecho dos más. RIR 0 = al fallo. Sustituye a RPE en todo lo que es fuerza.
- **Esfuerzo** en cardio sin pulsómetro, entero **1–10**. Campo distinto, no mezclarlo con RIR.
- **Carga**: número con un decimal, paso 2,5 kg. Se muestra con coma decimal.
- **Intercambio**: 1 intercambio ≈ 100 kcal. HC 25 g · PROT 25 g · GRASA 11 g.

## Colecciones

```
atletas/{atletaId}
  nombre, email, avatarUrl, estado: 'activo'|'pausa'|'impago'|'archivado'
  coachId, altaEn, zonaHoraria
  tutorial: { completado: bool, pasoAlcanzado: int, ejemplosVistos: [string], completadoEn }
  checklistInicial: { primeraSesion: bool, ingestasDelDia: bool, leccionRir: bool }
  permisos: { notificaciones: 'concedido'|'denegado'|'sinPedir', salud: idem }

planes/{planId}
  atletaId, bloque: int, semanas: int, diasPorSemana: int
  publicadoEn            // null mientras el coach lo monta → pantalla de espera
  dias: [{ orden, nombre, ejercicios: [ejercicioPrescrito] }]

ejercicioPrescrito
  ejercicioId, orden, series: int, repsObjetivo: '8-10', rirObjetivo: int
  descansoSeg: int, tipoSerie: 'normal'|'dropset'|'myoreps'|'amrap'|'fallo'
  bloqueado: bool        // el chip con candado: parámetro impuesto por el coach
  notaCoach: string|null

sesiones/{sesionId}
  atletaId, planId, diaOrden, fecha, iniciadaEn, terminadaEn
  ejercicios: [{ ejercicioId, series: [serie] }]

serie
  numero: int            // 1-indexed, se muestra como '01'
  reps: int, kg: number, rir: int
  hecha: bool, registradaEn
  prellenadaDe: sesionId|null   // de dónde salen los valores por defecto

ejercicios/{ejercicioId}
  nombre, grupos: [string], equipamiento: [string], patron: string
  videoUrl: string|null, videoEstado: 'listo'|'subiendo'|'sinVideo'
  notaCoach: string|null

dietas/{dietaId}
  atletaId, publicadoEn
  presupuesto: { hc: int, pr: int, gr: int }     // en intercambios, por tipo de día
  tipoDia: 'entreno'|'descanso'|'refeed'
  ingestas: [{ orden, nombre, hora, intercambios: {hc,pr,gr}, alimentos: [alimentoAsignado] }]

alimentoAsignado
  alimentoId, gramos: number, intercambios: number, tipo: 'hc'|'pr'|'gr'
  equivalenciaHumana: string      // '1 pechuga', '2 cucharadas'

registrosNutricion/{atletaId}/{fecha}
  ingestas: [{ orden, registrada: bool, registradaEn, intercambios: {hc,pr,gr} }]
  cerrado: bool, dentroDePresupuesto: bool

recetas/{recetaId}
  nombre, fotoUrl, racionBase, macros: {hc,pr,gr}, kcal
  favoritaDe: [atletaId], vetadaPor: [atletaId]

cardio/{sesionCardioId}
  atletaId, fecha, tipo: 'liss'|'hiit'|'pasos'
  minutos: int, esfuerzo: int|null, fcMedia: int|null, fcMax: int|null
  segundosPorZona: [int,int,int,int,int]
  origen: 'app'|'manual'|'salud'|'garmin'
  movidaA: fecha|null              // 'mover a mañana'

objetivosCardio/{atletaId}/{semanaIso}
  minutosObjetivo: int, minutosHechos: int, sesionesObjetivo: int, cerrada: bool

progreso/{atletaId}/{fecha}
  peso: number|null
  fotos: { frontal: url|null, lateral: url|null, espalda: url|null }
  visiblePara: 'coach'              // nunca público

mensajes/{hiloId}/{mensajeId}
  de: 'coach'|'atleta', texto, videoUrl|null, enviadoEn, leidoEn|null

academia/{moduloId}
  orden, titulo, lecciones: [{ id, titulo, duracionSeg, videoUrl }]
progresoAcademia/{atletaId}
  leccionesHechas: [leccionId], leccionEnCurso: leccionId|null
```

## Reglas de cálculo

**Intercambios → gramos.** `gramos = intercambios × gramosPorIntercambio[tipo]`. Se redondea **al múltiplo de 5 g más cercano** para que el atleta pueda pesarlo, con mínimo de 5 g. Los intercambios nunca se redondean: son la unidad contable.

**Intercambiar un alimento.** Se conservan los intercambios, se recalculan los gramos con la regla de arriba. Si el alimento nuevo no admite fracciones (un huevo, una tarrina), se redondea a la unidad más cercana y se muestra la diferencia en la equivalencia humana, nunca en el contador.

**Escalar una receta.** `macrosEscalados = macrosBase × factor`, factor de 0,25 a 3 en pasos de 0,25. Los intercambios resultantes se redondean a un decimal para el contador y a entero para los chips.

**Kcal.** Siempre derivadas y siempre marcadas con `≈`. `kcal = intercambiosTotales × 100`. No se guardan: se calculan.

**Presupuesto restante.** `restante = presupuesto − sum(intercambios registrados)`. Puede ser negativo: la barra se pinta roja y se muestra `+n`, no se recorta a cero.

**Semana de cardio.** Semana ISO, empieza el lunes. Se cierra cuando `minutosHechos ≥ minutosObjetivo`; el haptic success salta **solo** en ese momento, no por sesión.

**Prerrelleno de la serie.** Los valores por defecto salen de la última sesión del mismo `ejercicioId` con el mismo `numero` de serie. Si no hay histórico, se usa `repsObjetivo` y `rirObjetivo` de la prescripción y la carga queda a 0.

## Estados que dependen del plan

- `planes.publicadoEn == null` → el atleta ve la **pantalla de espera** y el tutorial **no arranca**.
- `dietas.publicadoEn == null` → Nutrición muestra el vacío «Dani está montando tu dieta».
- Sin histórico (adherencia, mejor serie, fotos) → se muestra un ejemplo marcado `EJEMPLO`, se anota su id en `tutorial.ejemplosVistos` y no vuelve a marcarse.
