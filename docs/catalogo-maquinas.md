# Catálogo de máquinas del gimnasio

Módulo introducido en Fase 3 (2026-08-07). Responde a una sola pregunta: **qué máquinas
existen físicamente en el gimnasio de cada atleta**. No responde a "qué ejercicios hace"
ni a "qué máquina se usa para qué ejercicio" — eso es la relación futura, diseñada abajo
pero deliberadamente no implementada.

## Por qué es un eje separado de `Exercise.equipment[]`

Ya existía un `equipment?: string[]` de texto libre en `Exercise` (`src/types.ts`) y otro
en `OnboardingData`, con dos listas de opciones que no casan entre sí
(`ExerciseLibraryScreen.tsx` dice `barra`/`gomas`/`máquina`; `AthleteOnboardingWizard.tsx`
dice `Barra y discos`/`Bandas elásticas`/`Máquinas`). El matcher `exIsCompatible` de
`MesocycleManager.tsx` compara en minúsculas sin normalizar sinónimos, así que hoy marca
casi todo como incompatible y solo se salva porque ningún ejercicio semilla trae
`equipment` y cae en el escape `if (eq.length === 0) return true`.

Ese campo describe **categorías de material** ("necesita una barra"). Este módulo describe
**unidades concretas de inventario** ("hay un Hammer Strength Iso-Lateral Incline Press").
Mezclarlos habría metido la deuda existente en un módulo nuevo. Se dejan separados; la
unificación de la taxonomía legacy es un trabajo aparte.

## Dónde vive cada cosa

| Dato | Sitio | Por qué |
|---|---|---|
| Catálogo publicado | `src/data/maquinas/<marca>.json`, agregado en `index.ts` | Cientos de máquinas idénticas para todos: en Firestore serían cientos de lecturas por atleta. En el bundle cuestan cero. |
| Cambios del admin | Firestore `maquinas/{id}` | Solo el delta contra la semilla: ocultar, renombrar, cambiar imagen, publicar. Colección pequeña. |
| Máquinas creadas a mano | Firestore `maquinas/{id}` | Un override sin semilla detrás. |
| Imágenes del catálogo | `public/maquinas/<id>.webp` | Estáticas y públicas: CDN de Vercel, cacheadas, coste cero. |
| Imágenes subidas por el admin | Storage `maquinas/{id}` | No se pueden commitear desde la app. |
| Gimnasio del atleta | Firestore `gimnasios/{email}` | Un doc por atleta. |
| Fotos de máquinas propias | Storage `gymPhotos/{email}/{ts}` | Las sube el atleta. |

El catálogo efectivo es `merge(semilla, overrides)` — ver `mergeCatalogo` en
`src/db/machines.ts`. El atleta solo ve `visible && publicadoEn != null`: **el scraping
nunca publica directo**, los importadores escriben `publicadoEn: null` y el admin revisa.

`atletaId` es el **email**, no el UID. Es la convención de todo el repo (`onboarding/{email}`,
`TaskItem.athleteId`, `progressPhotos/{email}`) y sobrevive a que la misma persona acabe con
dos UID distintos al registrarse por Google tras haberlo hecho por contraseña — cosa que ya
ha pasado aquí, de ahí `deduplicateByEmail` en `src/db/profiles.ts`.

## IDs estables

`maquinaId(marca, familia, nombreOriginal)` en `src/utils/maquinaId.ts` produce
`hammerstrength-plate-loaded-iso-lateral-incline-press`. Determinista: el mismo importador
ejecutado dos veces da los mismos IDs, y reimportar actualiza en vez de duplicar.

Es el punto crítico del módulo. Los `Exercise` de hoy usan IDs autogenerados por `addDoc`,
irreproducibles entre entornos, y por eso son inservibles como ancla de relaciones. Las
máquinas no repiten ese error: cualquier migración futura y la relación con ejercicios
cuelgan de estos IDs.

La única definición del slug es `src/utils/maquinaId.ts`, importada tanto por la app como
por el importador. No hay una segunda copia que pueda derivar.

## Versionado del catálogo

`CATALOGO_VERSION` en `src/data/maquinas/index.ts` se sube a mano al añadir o cambiar
máquinas. Sin ese campo, un atleta que completó el catálogo quedaría `completado: true`
para siempre y no vería nunca las máquinas de una marca importada después. Con él,
`getEstadoCatalogo` recalcula qué queda pendiente y el atleta solo revisa lo nuevo.

## Añadir una marca nueva

Panatta, Matrix, Prime, Atlantis, Nautilus, Cybex... es siempre el mismo procedimiento y
**nunca toca el núcleo**:

1. `scripts/machines/importers/<marca>.ts` — implementa el contrato `Importador`.
2. `npx tsx scripts/machines/run-import.ts <marca>`.
3. Importa el JSON generado en `src/data/maquinas/index.ts` y añádelo a `SEMILLA_MAQUINAS`.
4. Sube `CATALOGO_VERSION`.
5. El admin revisa y publica desde Perfil › Ajustes › Máquinas.

## Relación máquina→ejercicio (diseñada, NO implementada)

Cuando toque, la forma es una **colección puente**:

```
ejerciciosMaquinas/{ejercicioId}__{maquinaId}
  ejercicioId: string        // id de exercises/
  maquinaId: string          // slug estable de maquinas/
  tipo: 'exacta' | 'equivalente'
  creadoPor: 'admin' | 'sistema'
```

Puente y no un `maquinaIds: string[]` dentro de `Exercise` porque:

- Es N:M real. Un press inclinado se hace en el Hammer Strength, en el Technogym y en
  seis máquinas más de otras marcas.
- No obliga a reescribir los documentos de `exercises` cada vez que se importa una marca.
  Con un array dentro de `Exercise`, importar Panatta significaría tocar cientos de
  ejercicios; con el puente, solo se añaden documentos nuevos.
- Se consulta en los dos sentidos: "qué máquinas sirven para este ejercicio" y "qué
  ejercicios puedo hacer con las máquinas de mi gimnasio".
- `tipo: 'equivalente'` deja modelar sustitutos sin mentir: si el atleta no tiene la
  máquina exacta pero sí una equivalente, el generador puede proponerla y decir por qué.

Con eso, el filtro real que hoy no funciona pasa a ser: máquinas del atleta
(`gimnasios/{email}.maquinas` con `tengo: true`) → puente → ejercicios ejecutables.
Nada de esto exige cambiar el modelo actual; solo añadir la colección.

## Estado (2026-08-08)

Construido y commiteado en `ds/f3-experiencia`, sin pushear:

| Fase | Qué | Dónde |
|---|---|---|
| F0 | Tipos, `src/db/machines.ts`, reglas de Firestore y Storage | `fcf08cb` |
| F1 | Importadores + 63 máquinas + imágenes | `b47ff4b` |
| F2 | Swipe (pantallas 01-04) + gate en App.tsx | `5e6c2d8` |
| F3 | Mi gimnasio en Perfil + máquina propia (05, 06) | `7de4fe6` |
| F4 | Recordatorio en Hoy + punto en la pestaña (07) | `c47c8e9` |
| F5 | Equipamiento en el Hub del entrenador (08) | `1c76f8f` |
| F6 | Catálogo administrable (09) | `411da68` |

**Las 63 máquinas están importadas pero NO publicadas.** Hasta que un admin entre en
Perfil › Ajustes › Máquinas y pulse "Publicar todas", ningún atleta ve el catálogo y el
gate del onboarding se aparta solo. Es el primer paso para poner el módulo en marcha.

Pendiente de QA de Dani (no verificable sin sesión iniciada): el punto rojo en la pestaña
Hoy, la tarjeta de equipamiento dentro del Hub real y la pestaña de admin en su sitio.

`/dev/gimnasio` monta un banco de pruebas con las cuatro vistas (swipe, Mi gimnasio,
tarjeta del coach y admin) sin necesidad de sesión. Solo existe en desarrollo.

## Lo que este módulo NO hace

- No relaciona máquinas con ejercicios.
- No unifica la taxonomía divergente de `equipment[]`.
- No hace que el generador de entrenamientos use el equipamiento del atleta.
