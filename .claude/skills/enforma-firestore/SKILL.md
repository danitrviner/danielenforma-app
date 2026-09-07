---
name: enforma-firestore
description: Reglas de seguridad, coste de lecturas y claves de Firestore en En Forma. Úsala SIEMPRE que vayas a tocar firestore.rules o firestore.indexes.json, a desplegar reglas o índices, a escribir una consulta nueva contra Firestore, a añadir o leer un catálogo (ejercicios, alimentos, recetas, máquinas, perfiles), o cuando alguien pregunte por la cuota de lecturas, por "permission-denied", por el banner rojo de permisos, o por si una consulta es cara. También al crear un script de servidor que escriba en la base.
---

# Firestore en En Forma

Tres cosas se rompen aquí, y las tres ya se han roto una vez: el **orden** en que se
despliegan las reglas, el **coste** de las consultas sin acotar, y la **clave** con la
que se identifica a un atleta. Esta skill existe para no repetirlas.

---

## 1 · La regla de oro del despliegue

**Las reglas de Firestore se aplican al instante a los binarios que YA están instalados
en el móvil de la gente.** No solo al que estás a punto de subir.

> Una regla que exige algo que el cliente todavía no manda se despliega **DESPUÉS** de
> que los binarios nuevos estén fuera. Nunca antes.

Si te la saltas: `permission-denied` → banner rojo de permisos, pantalla vacía y Sentry
lleno. No tumba la app (un fallo de permisos no activa el modo local, ver
`setLocalBypassMode` en `src/db/core.ts`), pero el atleta lo ve.

**Antes de proponer `firebase deploy --only firestore:rules`, comprueba las tres:**

1. ¿La regla nueva **exige** algo que el cliente no manda hoy (un `where` extra, un campo
   nuevo)? Si sí → no se despliega hasta que el binario esté publicado y la gente haya
   actualizado.
2. ¿Hay una build **en revisión** ahora mismo? Si sí → no se despliega nada.
3. ¿Existe un test que lo cubra? El pie de bala está probado en
   `src/db/compat.emulador.test.ts`. Ejecútalo: `npm run test:reglas`.

Si hay que apretar la regla ya: **dos pasos**. Primero una regla que acepte las dos
formas (la vieja y la nueva); cuando no quede nadie en la versión antigua, la definitiva.

**Base nombrada**: esta base no es `(default)`. Cualquier comando de `firebase` o cliente
de servidor necesita `--database`. Olvidarlo apunta a una base vacía y el resultado
engaña.

---

## 2 · El coste de las lecturas

El 22 de agosto de 2026 se agotó la cuota diaria. La causa fueron dos patrones. Los dos
tienen ya su solución escrita en el repo; **úsalas en vez de reinventarlas**.

### Catálogos → sello de versión

Bajarse la colección entera en cada arranque (1.681 ejercicios, 310 alimentos, el listado
de perfiles) por cada atleta, dos veces al día. Firestore ya guarda copia local
(`persistentLocalCache` en `src/firebase.ts`), pero `getDocs()` va siempre al servidor.

La solución vive en `src/db/catalogoVersionado.ts`: `getDocsFromCache()` lee la copia
local sin pagar lectura, y **un** documento de sello dice si sigue valiendo.

> Si añades un catálogo nuevo, pásalo por ahí. Y si escribes un script de servidor que
> modifique un catálogo, **tiene que marcar el sello** o los clientes seguirán con datos
> viejos.

### Extremos → consulta de frontera

Para "el primer registro" o "el último", la tentación es traerse el histórico y quedarse
con un elemento: 7.644 lecturas medidas a dos años.

La solución **no** es una ventana de fechas (recorta datos reales). Es
`orderBy(...) + limit(1)`: mismo dato, **1 lectura**, sin recortar nada. Bajó de 7.644 a
63. Está en `src/db/consultasDeFrontera.ts`.

Dos trampas al usarla:
- **Claves de React Query compartidas**: si dos consultas distintas comparten clave, una
  pisa a la otra.
- **Invalidar los extremos al escribir**: si no, el "último registro" se queda congelado.

### Regla general

**Nunca barras una colección entera.** Ni para contar, ni para buscar, ni "solo esta vez"
en un script. Si necesitas un agregado, piensa en un contador escrito, no en un barrido.

Para medir de verdad usa la métrica `document/read_count`. **Nunca**
`api/billable_realtime_read_units`: da casi cero en el tramo gratuito y engaña.

---

## 3 · Las claves del atleta

Conviven dos formas de identificar a un atleta y **es a propósito**:

- **email** como ID de documento — la forma actual (`workoutAssignments` migrada, 136/136).
- **uid** — la rama vieja, que sigue viva porque hay bundles nativos antiguos instalados
  que aún la usan.

Ver `src/db/clavesDeAtleta.ts`. **No sueltes la rama del uid** hasta que no queden
binarios viejos en circulación. Al escribir código nuevo, usa email.

En las reglas, `isOwnerEmail()` e `isCoach()` exigen `email_verified == true`: sin eso,
cualquiera puede crearse una cuenta con `createUserWithEmailAndPassword` y autoproclamarse
coach solo por coincidir el string del correo (auditoría de seguridad, 23-07-2026).

---

## 4 · Al terminar

```bash
npm run test:reglas     # tests de reglas contra el emulador
npm test -- --run       # la suite completa
```

Y antes de sugerir el deploy, vuelve al apartado 1. Si alguna de las tres comprobaciones
falla, **dilo y no lo despliegues**: explica qué falta y qué orden hay que seguir.
