# Cómo se publican las actualizaciones

Escrito el 01-09-2026, con las apps recién enviadas a revisión. Es el manual de a dónde llega
cada cambio y qué hay que hacer para que llegue, más la lista de lo que está esperando turno.

**Nada de esto está hecho.** Es la nota para cuando toque.

---

## 1 · La regla que lo explica casi todo

En [`capacitor.config.ts`](../capacitor.config.ts) hay `webDir: 'dist'` y **no** hay `server.url`.
Eso significa que la web va **empaquetada dentro** del binario de cada tienda. De ahí sale la
única regla que hay que tener en la cabeza:

| Qué tocas | A dónde llega | Cuándo |
|---|---|---|
| Código de `src/` (pantallas, cálculos, textos) | **Solo la web** de Vercel | Al desplegar |
| Código de `src/` | iPhone y Android | **Solo con binario nuevo y revisión** |
| `firestore.rules`, `firestore.indexes.json` | **Todo el mundo a la vez** | Al desplegar, sin revisión |
| Datos de Firestore (catálogos, recetas…) | **Todo el mundo a la vez** | Al escribir |

La fila peligrosa es la tercera y tiene su propio apartado más abajo.

---

## 2 · La trampa de las reglas de Firestore

Las reglas son de servidor: se aplican **al instante a los binarios que ya están instalados**, no
solo al que estás a punto de subir. O sea que una regla nueva puede romper la app que tus atletas
tienen en el móvil desde hace semanas, sin que nadie actualice nada.

**Regla de oro: una regla que exige algo que el cliente todavía no manda se despliega DESPUÉS de
que los binarios nuevos estén fuera, nunca antes.**

Caso real que dejó esto escrito — el cierre de `recipes` de 09-2026:

- La regla nueva exige que la consulta de recetas venga acotada por dueño
  (`where('ownerId','==',uid)`).
- Los binarios de las tiendas piden la lista **sin** ese filtro.
- Si se despliega antes de tiempo: permiso denegado → banner rojo de permisos, recetario vacío y
  Sentry lleno de `permission-denied`. No tumba la app (un fallo de permisos no activa el modo
  local, ver `setLocalBypassMode` en [`src/db/core.ts`](../src/db/core.ts)), pero el atleta lo ve.

El orden correcto siempre es: **binario fuera → esperar a que la gente actualice → apretar la regla.**
Si hace falta apretarla ya, se hace en dos pasos: primero una regla que acepte las dos formas,
y cuando no quede nadie en la versión vieja, la definitiva.

---

## 3 · Publicar en la web (Vercel)

Es lo barato y lo que no depende de nadie. Un cambio de `src/` en producción, sin revisiones ni
esperas. Va solo al hacer push a `main`.

```bash
npm run lint && npm test -- --run
```

Y si el cambio toca reglas o índices, aparte (ver el aviso de arriba antes de lanzarlo):

```bash
firebase deploy --only firestore:rules
```

---

## 4 · Publicar un binario nuevo

### Antes de nada, siempre

```bash
npm run prerelease
```

Encadena `lint` + `test` + `sync:native` (build de la web, preparación del bundle nativo y
`cap sync` de las dos plataformas). Si esto no pasa, no hay nada que subir.

### Subir la versión

Los dos números se suben **a mano** y son independientes:

| | Dónde | Valor a 01-09-2026 |
|---|---|---|
| iOS | `ios/App/App.xcodeproj/project.pbxproj` → `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` | 1.0 (5) |
| Android | `android/app/build.gradle` → `versionName` / `versionCode` | 1.0 (2) |

`versionCode` de Android tiene que subir **siempre**, aunque el `versionName` se quede igual;
Play rechaza un código repetido. En iOS pasa lo mismo con `CURRENT_PROJECT_VERSION` dentro de la
misma versión de marketing.

Ojo con los identificadores, que **no** coinciden y es a propósito (está explicado en
`capacitor.config.ts`): Android es `com.danielenforma.app` y iOS es `app.danielenforma.entreno`.

### iOS

Xcode → Product → Archive → Distribute App. Lo hace Dani a mano; este proyecto no tiene
automatizada la subida.

### Android

Se genera el `.aab` firmado con las credenciales de `android/keystore.properties` (fichero local,
fuera de git — si se pierde, se pierde la capacidad de actualizar la app publicada: **guardarlo
en el gestor de contraseñas**) y se sube a Play Console.

---

## 5 · Qué NO se puede hacer con una build en revisión

**No se le pueden meter cambios a una build que ya está en revisión.** En las dos tiendas hay que
sacarla y volver a empezar:

- **Apple**: hay que quitarla de la revisión ("Remove from review"), subir la nueva y reenviar.
  Vuelves al final de la cola.
- **Play**: una release nueva sustituye a la que está en revisión y reinicia el proceso.

El criterio para decidir si compensa:

- ¿La build en revisión está **arreglando un rechazo**? Entonces **no se toca**. Cambiar un
  bloqueo que ya está resuelto por otro que empieza de cero es un mal negocio, por muy buenas que
  sean las mejoras que quieres meter. Se espera y salen en la siguiente.
- ¿Es una **actualización normal** de una app ya publicada y la mejora es urgente? En Play, donde
  la revisión de una actualización suele ser de horas, puede compensar. En Apple casi nunca.
- ¿Es la **primera publicación**? Nunca se toca: la primera revisión es la lenta de verdad.

---

## 6 · Lo que arreglaría esto de raíz: actualizaciones en caliente

El problema de fondo es que hoy un arreglo de una línea de JavaScript necesita una revisión de
tienda. Con un plugin de *live updates* la app se descarga el paquete JS nuevo y lo ejecuta en
local, sin pasar por la tienda.

- **Está permitido.** Apple lo contempla en la directriz 3.3.2 mientras no cambies el propósito de
  la app; Google también. Es lo que hace media industria (React Native lleva años con CodePush).
- **Candidatos**: `@capgo/capacitor-updater` (de pago, autoalojable) o Ionic Appflow.
- **No sirve `server.url` a secas.** Apuntar la app al Vercel de producción es más fácil, pero
  convierte la app en un envoltorio de una web: te expone a la directriz 4.2 de Apple (funcionalidad
  mínima) y te deja sin funcionamiento sin conexión. No es el camino.
- **Requiere una build para activarse.** El momento natural de meterlo es la siguiente que se suba,
  no una dedicada.

Con esto puesto, todo lo del apartado 7 habría llegado a los atletas en minutos.

---

## 7 · Cola de espera — lo que hay hecho y sin publicar

### Rama `nutricion-registro-diario` (01-09-2026)

Todo verde (typecheck, eslint, 1.202 pruebas) y **sin commitear, sin desplegar, sin QA de Dani**.
Es el arreglo de los tres fallos que Dani reportó:

1. El registro del día ya no se pierde: el plan de cada día vive en su propio documento
   (`DietCompletionLog.meals`) y la fecha es local, no UTC, y se recalcula al volver la app a
   primer plano.
2. Fuera la dieta del coach del lado del atleta; se conserva el cupo de intercambios pautado.
3. Historial de días anteriores, editable.
4. Marcado automático: lo que añades cuenta como comido. Sin deslizar a la derecha, sin tachado.
5. Una receta = una fila, con la suma de intercambios; se abre entera; el `+/−` escala el plato.
6. Al abrir recetas desde una comida, pregunta si cuadrar en esa comida o en el día.
7. Recetas privadas por dueño (cuatro pantallas que no filtraban).
8. 673 entradas que no son platos (agua, aloe, amilopectina, Anxistop, geles de marca…) fuera de
   «Platos salados / principales», a «Alimentos y suplementos».

**Bloqueado por**: el punto 7 lleva un cambio de `firestore.rules` que **no se puede desplegar
hasta que los binarios nuevos estén fuera** (apartado 2).

### Pendiente de decidir

- **Convertir la pantalla de dietas del coach en «cupo de intercambios» a secas.** Hoy sigue
  dejando montar comidas que el atleta ya no ve, porque es donde vive el cupo pautado. Funciona,
  pero confunde.
- **Live updates** (apartado 6).

---

## 8 · Documentos hermanos

- [`notas-para-revision.md`](notas-para-revision.md) — el texto para el revisor y las credenciales
  de la cuenta de demo. **Si se regeneran las credenciales hay que actualizar las dos fichas**, o
  el siguiente envío se rechaza.
- [`ficha-tiendas.md`](ficha-tiendas.md) — los textos de las fichas, con los límites ya contados.
- [`respuesta-apple-1.4.1.md`](respuesta-apple-1.4.1.md) — el rechazo que arregla la build 1.0 (5).
- [`QA-pendiente-dani.md`](QA-pendiente-dani.md) — ojo, tiene partes anticuadas.
