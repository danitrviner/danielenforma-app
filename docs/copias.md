# Copias de seguridad y restauración

Qué hacer el día que se borre o se corrompa algo. Escrito para leerlo **con prisa**.

---

## Si acabas de perder datos, empieza aquí

1. **Para de escribir.** No vuelvas a ejecutar el script que lo rompió, y avisa de no tocar la pantalla afectada. Cada escritura nueva encima complica la recuperación.
2. **Mira qué copias tienes**: las locales están en `~/copias-enforma/`, una carpeta por copia con la fecha en el nombre.
3. **Ensaya primero.** El script de restauración no escribe nada si no se lo pides dos veces:
   ```bash
   node scripts/restaurarFirestore.mjs ~/copias-enforma/<fecha>
   ```
   Eso te dice qué escribiría. Si cuadra, lo aplicas (ver abajo).
4. **Restaura lo mínimo.** Casi nunca hace falta la base entera: normalmente es una colección, o un solo documento.

---

## Datos del proyecto

| | |
|---|---|
| Proyecto | `fleet-operator-z5xj8` |
| Base | `ai-studio-b38fc63b-000e-4d2c-b774-20351883e870` — **nombrada, no `(default)`** |
| Tamaño (15-09-2026) | 11.898 documentos en 55 colecciones; 8.500 son el recetario |
| Tope de lecturas | 50.000/día. Al superarlo la base **se pausa**, no cobra |

La base `(default)` existe y está **vacía**. Un script que la abra por error dice «0 documentos» sin dar ningún error. Por eso todos los scripts usan `scripts/_lib/firestoreDb.mjs`, que lanza si falta el id.

---

## Las dos copias, y para qué sirve cada una

### 1. Copia automática diaria (Google)

Se hace sola cada noche, vive fuera de tu Mac, guarda 7 días y se restaura con un comando. Es la red de verdad.

**Coste:** ~0,50 $ al año a este tamaño. No lee documentos, así que no gasta cuota ni compite con los atletas.

Comprobar que sigue programada:
```bash
gcloud firestore backups schedules list \
  --database=ai-studio-b38fc63b-000e-4d2c-b774-20351883e870 \
  --project=fleet-operator-z5xj8
```

Ver las copias que hay ahora mismo:
```bash
gcloud firestore backups list --project=fleet-operator-z5xj8
```

Restaurar una copia **sobre una base nueva** (nunca encima de la de producción):
```bash
gcloud firestore databases restore \
  --source-backup=<nombre-de-la-copia> \
  --destination-database=restauracion-prueba \
  --project=fleet-operator-z5xj8
```
Después se comparan las dos y se copia a mano lo que falte. Restaurar directamente encima de producción machaca también lo bueno que se haya creado desde la copia.

### 2. Copia local en mano (este repo)

La que se hace **justo antes** de ejecutar cualquier script que escriba en producción, para no depender de la copia de anoche.

```bash
node scripts/backupFirestore.mjs                 # todo (~11.900 lecturas, ~2 min)
node scripts/backupFirestore.mjs --sin-catalogos # solo lo que cambia (~3.400 lecturas)
```

Deja una carpeta con fecha en `~/copias-enforma/`, un JSON por colección más un `_manifiesto.json`.

`--sin-catalogos` salta `recipes`, `exercises`, `foodItems`, `knowledgeBase` y `maquinas`: no los edita nadie en el día a día y sus scripts de importación los regeneran.

---

## Restaurar desde una copia local

Siempre en dos pasos. El primero no escribe nada.

```bash
# 1. Simulacro: qué escribiría
node scripts/restaurarFirestore.mjs ~/copias-enforma/2026-09-15-12-00-00

# 2. De verdad — hay que escribir el id de la base a mano
node scripts/restaurarFirestore.mjs ~/copias-enforma/2026-09-15-12-00-00 \
  --aplicar --confirmar-base ai-studio-b38fc63b-000e-4d2c-b774-20351883e870
```

Acotar lo que se restaura:

```bash
--coleccion crmServicios          # solo esa colección
--doc crmServicios/abc123         # un único documento
```

**Restaurar suma, no sustituye.** Escribe los documentos de la copia encima de lo que haya y deja intacto lo que se creó después. Es lo que quieres cuando has borrado algo. Si lo que quieres es volver a un estado exacto, hay que borrar a mano antes — el script no lo hace por ti a propósito.

---

## Dos cosas que hacen que una restauración parezca no funcionar

**El sello de los catálogos.** La app sirve `recipes`, `exercises`, `foodItems`, `workouts` y las colecciones del CRM desde la caché del dispositivo mientras el documento `catalogos/{nombre}` diga la misma versión (`src/db/catalogoVersionado.ts`). Una escritura con el Admin SDK no pasa por ahí. `restaurarFirestore.mjs` toca el sello de las colecciones afectadas al terminar; si restauras por cualquier otra vía, hazlo tú o los móviles seguirán enseñando lo viejo sin un solo error.

**Los tipos que JSON no sabe guardar.** `checkins` guarda `Timestamp` de Firestore, no texto. `scripts/_lib/codecFirestore.mjs` los convierte en los dos sentidos. Si algún día se guarda un tipo nuevo que el codec no conozca (`GeoPoint`, una referencia, bytes), **la copia falla en voz alta** en vez de guardarlo mal: hay que añadirlo al codec antes de fiarse de esa copia.

---

## Simulacro periódico

Una copia que no se ha restaurado nunca no es una copia. Cada vez que se toque el sistema de copias, y como mínimo antes de cada fase de trabajo grande:

1. Hacer una copia local.
2. Borrar a propósito un documento de pruebas.
3. Restaurarlo con `--doc`.
4. Comprobar en la app que ha vuelto.

El último simulacro está anotado al final de este documento.

---

## Historial de simulacros

| Fecha | Qué se probó | Resultado |
|---|---|---|
| 15-09-2026 | Volcado completo: 11.898 documentos, 26 MB, ~2 min | ✅ |
| 15-09-2026 | Volcado `--sin-catalogos`: 2.080 documentos, 2,4 MB | ✅ |
| 15-09-2026 | Crear documento → copiar → borrar → restaurar con `--doc` → comprobar | ✅ vuelve idéntico |
| 15-09-2026 | Ida y vuelta del codec sobre un `checkin` real con `Timestamp` | ✅ exacta, tipos incluidos |
| 15-09-2026 | El codec falla en voz alta ante un tipo desconocido | ✅ cubierto por test |
