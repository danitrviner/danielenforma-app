# Lo que solo puede hacer Dani para publicar en las tiendas

Estado a **13 ago 2026**, rama `ds/f3-experiencia`. Todo lo de abajo está fuera del alcance de
Claude: o exige una sesión iniciada en una consola, o es una contraseña, o es un dispositivo
físico, o es una decisión tuya. El detalle técnico de cada punto está en
[`informe.md`](./informe.md); aquí solo va lo que hay que hacer, dónde, y qué se rompe si no.

> **Cómo se lee este documento.** Está escrito por capas: la actualización más reciente va arriba y
> **manda sobre todo lo que venga después**. Si una sección de más abajo contradice a una de más
> arriba, la de arriba es la buena. Las secciones viejas se conservan a propósito, para que se vea
> qué se pensó y por qué cambió.

---

## Actualización 3 · 13 ago 2026 — no queda nada de código bloqueando, y el índice ya está puesto

**Ni un solo bloqueante abierto de los que dependían de código.** Lo que queda para publicar son
trámites de tienda, la cuenta de Apple, el JDK y cuatro decisiones tuyas. Detalle abajo.

### Lo que ha caído en esta tanda (25 commits, 12-13 ago)

| Grupo | Qué se ha cerrado |
|---|---|
| **Nativo / acceso** | `getAuth()` se colgaba para siempre dentro del WebView · el WebView colgaba las lecturas de Firestore en silencio · las llamadas a `/api/*` no salían del móvil · el login manual se quedaba cargando · la cabecera se metía debajo de la barra de estado |
| **API en Vercel** | Las tres funciones reventaban al arrancar por un import sin extensión · la URL de las claves públicas de Google daba 404 (y con ella **todo** token) · `firebase-admin/auth` reventaba por un conflicto ESM/CJS |
| **`A-5` Pérdida de datos** | **Cerrado entero.** Series que se perdían al morir la app · el alta perdía los seis pasos · «Terminar sesión» colgado para siempre sin cobertura · el aviso de sin conexión que nunca salía · fotos que mentían · lo registrado en local que no volvía · cerrar sesión que no borraba nada del dispositivo |
| **`A-8` Presentación** | **Cerrado entero.** Barra de estado invisible en modo claro (iOS y Android) · la casilla «Hecha» fuera de pantalla · el botón Atrás de Android cerrando la app en mitad de un entrenamiento · orientación bloqueada a vertical |
| **`A-7` Arranque y coste** | Mínimo viable hecho. `ClientsScreen` de 334 a 65 kB · recharts fuera del arranque de Perfil y Hub · sin refetch al volver al primer plano · fin de la lectura del historial completo de cada atleta · **fuente de iconos empaquetada**, cero peticiones a Google al arrancar |

### 0.5 y el índice: ya no tienes que hacer nada

- [x] ~~`FIREBASE_SERVICE_ACCOUNT` en Vercel~~ — sigue siendo tuyo, ver § 0.5. **Es el único
      bloqueante de configuración que queda.**
- [x] **Índice compuesto `workoutLogs (athleteId ASC, date DESC)`: DESPLEGADO** el 13 ago.
      Comprobado contra producción: 14 índices publicados, el nuevo entre ellos. No hay que hacer
      nada más aquí.

### Hallazgo nuevo, y era un bloqueante de Google Play que nadie había visto

`android/app/src/main/res/values/styles.xml` referenciaba `@color/colorPrimary`, `colorPrimaryDark`
y `colorAccent`, y **no existía ningún `colors.xml` en todo el proyecto Android**. `aapt2` no puede
resolver esas tres referencias: **la compilación de Android fallaba antes de empezar**. No se había
detectado porque en esta máquina no hay JDK y Android no se ha compilado nunca (§ 3.1). Ya está
creado con los tokens reales del design system.

Sigue en pie lo que dice § 3.1: **«Android compila» sigue siendo una suposición**, no un hecho, hasta
que instales el JDK. Lo que ha cambiado es que ahora hay un motivo conocido por el que no compilaba.

### Aviso sobre § 0.2, que ya no aplica

La § 0.2 de más abajo («Activar el enlace de correo en Firebase Auth») **quedó anulada** por la
Actualización 2: el enlace mágico se retiró y el alta ya no depende de ese ajuste. Se conserva el
texto por historial. **No lo hagas.**

### ⚠️ Reglas de Firestore escritas pero SIN DESPLEGAR — léelo antes de desplegar nada

`04-10` está **escrito y compilando, pero no desplegado**, y no debe desplegarse a ciegas.

Doce colecciones de catálogo (`exercises`, `recipes`, `maquinas`, `workouts`, `foodItems`…) se leían
con solo estar autenticado. Crear una cuenta es gratis, así que cualquiera del mundo podía montar un
bucle de lecturas **facturables**. Ahora exigen además tener documento en `user_profiles`, que es lo
que distingue a un usuario real de un UID recién registrado por REST.

- [ ] **Antes de desplegar:** instalar el JDK (§ 3.1) y probar con
      `firebase emulators:start --only firestore`, comprobando **el caso del atleta recién
      invitado**: entre que se autentica y que `getOrCreateUserProfile` le crea el perfil, sus
      lecturas de catálogo caen. En teoría no ocurre porque el arranque de sesión crea el perfil
      primero, pero eso es teoría y no se ha podido comprobar.
- [ ] Después: `firebase deploy --only firestore:rules`.

**Por qué no lo he probado yo:** el emulador de Firestore necesita Java, y en esta máquina no hay
(`java -version` falla). Es el mismo JDK que ya bloquea Android en § 3.1.

**Qué se rompe si lo despliegas sin probar:** si el caso del recién invitado falla, un cliente nuevo
entra en la app y no ve ni ejercicios, ni recetas, ni rutinas. `firebase deploy --only
firestore:rules` con el fichero anterior lo revierte en un minuto, pero mejor no llegar ahí.

### Lo que queda abierto de código, y no bloquea publicar

- ~~`A-2` — consentimiento de IA~~ — **HECHO** el 13 ago. Pendiente tuyo: aceptar el **DPA de
  Anthropic** en la consola de tu cuenta de API, y declararlo en App Privacy (§ 4.2) y Data
  safety (§ 5.2).
- `A-3` — queda desplegar `04-10` (arriba) y pasar la CSP entera a *enforce*. La CSP sigue en
  `Report-Only` **a propósito**: la decisión del 10 de agosto fue mirar antes un par de días de
  tráfico real, porque al completarla ya apareció que `img-src` no incluía `blob:` y pasar a enforce
  a ciegas habría roto la previsualización de fotos. Esa espera sigue teniendo sentido, así que no
  se ha tocado.
- `6.4` — quedan dos decisiones tuyas: iPad sí o no, y Live Activity sí o no (§ 6.4).

---

**Orden recomendado:** primero el bloqueante que queda (§ 0.5), luego lo que bloquea a los demás
por plazo (Team ID), después el JDK, y al final los formularios de las fichas, que se rellenan
cuando ya hay build.

---

## Actualización 2 · 10 ago 2026, noche — decisiones tomadas y bloqueantes caídos

Tomaste las cinco decisiones que bloqueaban el trabajo grande. **De los nueve bloqueantes queda
uno**, y no es de código.

| Decisión tuya | Qué se ha hecho con ella |
|---|---|
| CRM: **anonimizar** | El borrado sustituye nombre, correo, DNI, dirección y teléfono por `borrado_<hex>` y conserva importes y fechas |
| Login: **quitar Google, credenciales automáticas por correo** | Hecho. Y con ello caen `B-3`, `B-4`, `B-5` y `B-9` de golpe |
| Dominio: **Vercel de momento** | `en-forma-ivory.vercel.app` en CORS y en las páginas legales |
| Cuenta Apple: **persona física** | Sin D-U-N-S: ya no hay espera de semanas. La política te nombra a ti como responsable |
| Tu acceso: **contraseña, como todos** | Ver § 0.3 aquí abajo: es lo primero que tienes que hacer |

### Bloqueantes cerrados en esta tanda

- `B-1` **Borrado de cuenta.** `api/delete-account.ts` con la cascada completa (~40 colecciones,
  3 carpetas de Storage, anonimización del CRM y borrado del usuario de Auth), más la UI en
  Perfil con doble confirmación y contraseña. La página pública `/eliminar-cuenta` que exige Play
  también está.
- `B-2` **Política de privacidad y términos.** `/privacidad` y `/terminos`, estáticas, fuera del
  rewrite de la SPA. **Te faltan tres datos** — ver § 0.4.
- `B-3` `B-4` **Google Sign-In.** Retirado de iOS, Android y web. Ya no hay problema de 4.8 ni
  popup roto.
- `B-5` **Enlace mágico.** Retirado. Sin él no hacen falta Universal Links ni App Links para
  entrar, así que ya no hay que esperar al Team ID para que alguien pueda acceder.
- `B-9` **Vínculo del correo en Firebase.** **Ya no hace falta activarlo.** El alta ya no depende de
  ese ajuste: el servidor crea la cuenta y Firebase manda el correo de contraseña, que usa el
  proveedor de correo/contraseña que ya tienes activo.

### El único bloqueante que queda

**Configurar `FIREBASE_SERVICE_ACCOUNT` en Vercel** (§ 0.5). Sin esa variable, ni el alta de atletas
ni el borrado de cuenta funcionan — los dos endpoints devuelven un 503 honesto en vez de fingir que
han hecho algo.

---

## 0. Lo primero, en este orden

### 0.3 — Ponerte contraseña a tu propia cuenta

- [ ] Abre la app, escribe tu correo (`danitrviner@gmail.com`) y pulsa **«¿Olvidaste tu
      contraseña?»**. Te llega un correo, eliges contraseña y entras.

**Por qué:** ya no hay botón de Google. Tu cuenta, tu rol de coach y todos tus datos son los mismos
—el rol va por email, no por proveedor—, solo cambia cómo entras. Hazlo **antes** que nada, porque
sin entrar no puedes probar el resto.

### 0.4 — Rellenar tus datos en las páginas legales

- [ ] En `public/privacidad/index.html` y `public/terminos/index.html`, sustituir las tres marcas
      rojas `PENDIENTE`: **nombre y apellidos legales**, **NIF** y **dirección postal**.
- [ ] Borrar el aviso rojo de la parte de arriba de cada una cuando estén rellenas.

**Qué se rompe si no:** salen en rojo y en grande en la página publicada, a propósito, para que no se
te pasen. Sin el responsable del tratamiento identificado, la política incumple el art. 13 del RGPD y
es de lo primero que mira el revisor.

### 0.5 — BLOQUEANTE · `FIREBASE_SERVICE_ACCOUNT` en Vercel

- [ ] Consola de Firebase → `Configuración del proyecto` → `Cuentas de servicio` →
      **Generar nueva clave privada**. Descarga el JSON.
- [ ] Vercel → proyecto → `Settings` → `Environment Variables` → nueva variable
      `FIREBASE_SERVICE_ACCOUNT`, con **todo el JSON en una sola línea** como valor.
- [ ] Volver a desplegar para que la variable entre en vigor.

**Qué se rompe si no:** `api/create-athlete.ts` y `api/delete-account.ts` devuelven 503 y ni puedes
dar de alta a nadie ni nadie puede borrar su cuenta. Es el nuevo camino crítico, y son 5 minutos.

**Cuidado:** ese JSON es la llave maestra del proyecto. No lo guardes en el repo (el `.gitignore` ya
lo bloquea), no lo mandes por WhatsApp y no lo pegues en ningún chat.

### 0.6 — Probar el alta de punta a punta

- [ ] Con la variable puesta, invita a un correo tuyo de prueba desde el panel.
- [ ] Comprueba que llega el correo de «crea tu contraseña», que puedes elegirla y que entras.
- [ ] Personaliza la plantilla del correo: Firebase → `Authentication` → `Templates` →
      `Restablecimiento de contraseña` → poner remitente y texto en español con la marca. El texto
      por defecto de Google es genérico y va a spam con más facilidad.

---

## Actualización 1 · 10 ago 2026, tarde — lo que ya está arreglado en código

Se ha cerrado toda la Fase 1 del plan de remediación y varias Altas. ~~**Nada de esto está desplegado
ni commiteado todavía**: son cambios en el árbol de trabajo de `ds/f3-experiencia`.~~
**Corregido el 13 ago: todo está commiteado en `ds/f3-experiencia`.**

| Hallazgo | Estado |
|---|---|
| `B-6` `02-22` Purpose strings de cámara, fototeca y micrófono | ✅ en `Info.plist`, verificado en el binario compilado |
| `B-7` `02-2` `PrivacyInfo.xcprivacy` (ITMS-91053) | ✅ creado **y cableado al target** — ya no hay paso manual en Xcode |
| `B-8` `02-3` AAB sin firmar | ✅ `signingConfig` puesto; **te toca crear el keystore** (§ 3.2) |
| `02-21` `ITSAppUsesNonExemptEncryption` | ✅ `false` (lee § 4.5: la responsabilidad legal es tuya) |
| `01-11` `CFBundleDevelopmentRegion` | ✅ `es` |
| `02-19` `armv7` | ✅ borrado; Xcode inyecta `arm64` |
| `01-8` `02-13` `allowBackup="true"` | ✅ `false` + reglas de extracción de datos |
| `02-12` `ACCESS_FINE_LOCATION` | ✅ acotado a API ≤ 30 — **falta tu verificación**, § 3.3 |
| `04-3` `questionnaireMedia` sin `email_verified` | ✅ corregido; **falta desplegarlo**, § 1.1 |
| `04-8` `04-7` CSP con dominio roto | ✅ dominio corregido y política completada |
| `04-11` `04-12` `04-13` Endpoint de IA | ✅ `email_verified`, CORS con lista blanca, tope transaccional y *fail-closed* |
| `A-6` `05-8` 2000 kcal fijas | ✅ ahora calcula de verdad — **pendiente tu decisión § 6.5** |
| `05-7` NaN en Firestore | ✅ filtrado en origen |
| `07-7` Códigos de Firebase en pantalla | ✅ mensajes en cristiano |
| `03-9` `07-17` Logo de Google roto | ✅ va inline, sin red |
| `B-4` parcial: Google colgaba la app | ✅ ya no cuelga: 20 s y mensaje con salida |
| `02-6` `04-4` `06-18` Assets de julio | ✅ resincronizados iOS **y Android** |
| `02-5` Plugins de Capacitor sin cablear en Android | ✅ resuelto por el sync |
| `04-24` `02-17` `.env.example` | ✅ limpio y completo |

**Hallazgo nuevo, y no menor.** `02-5` era peor de lo que parecía: el `cap sync` reveló que en Android
no había **ningún** plugin cableado en Gradle — ni la banda BLE, ni la háptica, ni las notificaciones
locales. En otras palabras, en Android la banda de pulso **no podía funcionar**, y no era un bug
sutil: no estaba compilada. Ya está cableado, pero sigue **sin compilar nunca** hasta que instales el
JDK (§ 3.1).

Lo que sigue abierto y por qué está en la lista de abajo: § 0.2 (consola), § 1.1 (desplegar), § 2
entera (cuenta de Apple), § 3 (JDK, keystore, dispositivo), § 4 y § 5 (fichas) y § 6 (decisiones).
~~Los tres trabajos grandes —borrado de cuenta, política de privacidad y enlace mágico— siguen sin
empezar: los tres dependen de decisiones tuyas de § 6.~~

**Corregido el 13 ago:** los tres están resueltos. Borrado de cuenta y política de privacidad,
hechos (Actualización 2); el enlace mágico **se retiró**, así que dejó de ser un trabajo pendiente
para ser código que ya no existe.

---

## 0. Los dos bloqueantes que ya conocías

### 0.1 — Confirmar que las reglas de Firestore publicadas son las del repo

- [ ] Consola de Firebase → proyecto `fleet-operator-z5xj8` → `Firestore Database` → pestaña
      `Reglas` → `Historial de versiones`. Comprobar que la versión publicada lleva fecha del
      **8 ago 2026** y que el bloque `bodyMeasurements` contiene `email_verified == true`.
- [ ] Lo mismo en `Storage` → `Reglas`.

**Esto ya NO es un bloqueante.** El bloque 04 lo comprobó contra el historial de git: desde el deploy
del 8 de agosto solo han cambiado cinco comentarios del bloque `recipes`, ninguna condición. Queda
como confirmación de un minuto porque es lo único que no se puede leer desde el repo.
· `01-15` / `04-2`

### 0.2 — ~~BLOQUEANTE · Activar el enlace de correo en Firebase Auth~~ · **ANULADO**

> **NO HAGAS NADA DE ESTA SECCIÓN.** El enlace mágico se retiró (Actualización 2) y el alta ya no
> depende de este ajuste. Se conserva el texto por historial, tachado abajo.

- [ ] Consola de Firebase → `Authentication` → `Método de acceso` →
      `Correo electrónico/contraseña` → `Editar` → activar
      **«Vínculo del correo electrónico (acceso sin contraseña)»** → Guardar.
- [ ] `Authentication` → `Settings` → `Authorized domains`: añadir el dominio de Vercel y `localhost`.
- [ ] Repasar a quién invitaste desde el 8 de agosto y **volver a invitarlo**: esos correos nunca
      salieron.

**Qué se rompe si no:** `sendSignInLinkToEmail` falla con `auth/operation-not-allowed` para cualquier
correo. Como el auto-registro se quitó a propósito, **no hay ningún otro camino de alta**: ni un
cliente nuevo puede entrar, ni el revisor puede comprobar el flujo, ni se puede hacer QA del primer
día. Es el punto que más bloquea de toda la lista. · `01-16` `04-1` `05-15` `07-19`

---

## 1. Consola de Firebase / Google Cloud

### 1.1 — Desplegar el arreglo de `storage.rules`

**El código ya está corregido** (`questionnaireMedia` usa ahora el helper `isOwnerEmail`, que es el
mismo que usan los otros tres bloques y el que sí exige `email_verified`). Falta solo desplegarlo.

- [ ] Desde `~/en-forma`, con la sesión de Firebase iniciada: `firebase deploy --only storage`.

**Qué se rompe si no:** `storage.rules:61, 63 y 67` comparan el email sin exigir `email_verified`. Un
atacante que registre una cuenta con el correo de un invitado que aún no ha entrado puede **leer,
sobrescribir y borrar los vídeos y fotos corporales de esa persona**. Es el mismo agujero que se tapó
en `bodyMeasurements` el 8 de agosto y quedó en un solo sitio. · `04-3`

### 1.2 — Presupuesto y alerta de facturación

- [ ] Consola de Google Cloud → `Facturación` → `Presupuestos y alertas` → crear presupuesto para el
      proyecto `fleet-operator-z5xj8`, con avisos por correo al 50 %, 90 % y 100 % del gasto mensual
      esperado.

**Qué se rompe si no:** doce colecciones se leen con solo estar autenticado, y crear una cuenta es
gratis. Un bucle de una hora sobre `recipes` son millones de lecturas facturables. El presupuesto no
impide el abuso, pero lo convierte en un aviso en vez de en una factura. · `04-10` `06-20`

### 1.3 — Comprobar si existe la base Firestore `(default)`

- [ ] Consola de Firebase → `Firestore Database` → desplegable de bases de datos.
      Si **no** aparece `(default)`, no hay nada que hacer y el punto se cierra.
      Si aparece: comprobar que está vacía y borrarla.

**Qué se rompe si no:** `firebase.json` solo declara la base
`ai-studio-b38fc63b-000e-4d2c-b774-20351883e870`, así que `firebase deploy` nunca ha tocado la
`(default)`. Si se creó alguna vez en «modo de prueba», arrastra un `allow read, write` abierto al
mundo. · `04-21`

### 1.4 — Copias de seguridad programadas

- [ ] Consola de Firebase → `Firestore` → `Copias de seguridad` → `Crear programación`, base
      `ai-studio-b38fc63b-000e-4d2c-b774-20351883e870`, frecuencia **diaria**, retención **7 días**.
      Por CLI: `gcloud firestore backups schedules create --database='ai-studio-b38fc63b-000e-4d2c-b774-20351883e870' --recurrence=daily --retention=7d`
- [ ] Apuntar en el calendario una **prueba de restauración a los tres meses**. Una copia que nunca se
      ha restaurado no es una copia.

**Qué se rompe si no:** no hay nada en el repo que programe exportaciones. Un borrado accidental desde
el panel del coach, o una regla mal desplegada, no tiene marcha atrás. Con clientes de pago y datos de
salud, la disponibilidad e integridad son parte del art. 32 del RGPD. · `04-22`

### 1.5 — App Check, en este orden exacto

**No te saltes el orden ni actives Enforce antes de tiempo o la app de las tiendas deja de hablar con
Firestore por completo.**

- [ ] Consola de Firebase → `App Check` → registrar la **app web** con reCAPTCHA v3, y añadir
      `VITE_RECAPTCHA_SITE_KEY` a las variables de entorno de Vercel y a `.env.local`.
- [ ] Registrar la **app iOS** con **App Attest** (necesita el Team ID y la clave de App Attest del
      portal de Apple Developer).
- [ ] Registrar la **app Android** con **Play Integrity** (necesita la app ya subida a Play, aunque sea
      en pista interna).
- [ ] Esperar a que Claude instale `@capacitor-firebase/app-check` y elija el proveedor por plataforma
      en `src/firebase.ts`.
- [ ] Dejar App Check en modo **«no aplicado» 2-4 semanas**, mirando `App Check` → `Métricas` hasta que
      las peticiones verificadas ronden el 100 %.
- [ ] **Solo entonces**, Enforce en Firestore y Storage.

**Qué se rompe si no:** hoy App Check no se inicializa en absoluto (`VITE_RECAPTCHA_SITE_KEY` no está
definida en ninguna parte), y aunque se pusiera, **reCAPTCHA v3 no funciona dentro de un WebView de
Capacitor**. · `04-9` `02-18`

---

## 2. Cuenta de Apple Developer

### 2.1 — DECISIÓN URGENTE · Tipo de cuenta

- [ ] Decidir: publicar como **persona física** o como **organización**.
- [ ] Si organización: **solicitar el número D-U-N-S hoy mismo**. El trámite tarda semanas y bloquea
      todo lo demás.
- [ ] Si persona física: la política de privacidad (§ 6.1) debe identificarte a ti como responsable del
      tratamiento, con NIF y dirección.

**Por qué importa:** la app trata datos de salud de clientes de pago de un negocio real. El responsable
del tratamiento que figure en la política tiene que ser el mismo que publica la app. Es el punto con
el plazo más largo de toda la lista. · `01-22`

### 2.2 — Team ID, App ID y capacidades

> **Actualización 3 · 13 ago 2026 — el Team ID ya existe y el archive ya sale.**
> Al compilar para el simulador, Xcode escribió `DEVELOPMENT_TEAM = CTHTC98W9A` en el
> `project.pbxproj`: tu cuenta de Apple Developer ya está conectada a Xcode. Con eso,
> `xcodebuild ... archive` **termina con `** ARCHIVE SUCCEEDED **`** y produce un `.xcarchive` de
> 35 MB que pasa `validate-for-store`.
>
> **Ojo con lo que esto NO significa.** El binario está firmado con
> `Apple Development: danielbriz8@gmail.com`, que es un certificado de **desarrollo**. Para subirlo a
> App Store Connect hace falta el certificado de **distribución** y el perfil de **App Store**, que
> siguen sin crearse (los dos últimos puntos de esta sección). Lo que ha caído es el bloqueo: ya no
> hace falta esperar a nada para compilar y probar.

- [x] ~~`Membership` → copiar el **Team ID**~~ — hecho: **`CTHTC98W9A`**, ya escrito en el proyecto.
- [ ] `Certificates, Identifiers & Profiles` → `Identifiers` → registrar el App ID
      **`com.danielenforma.app`**.
- [ ] En ese App ID, activar la capability **Associated Domains**.
- [ ] Activar **Sign in with Apple** solo si eliges la opción A de § 6.2.
- [ ] **NO marcar HealthKit.** La app no lo usa y marcarlo por error obliga a justificarlo en revisión.
- [ ] Crear el **certificado de distribución** y el **perfil de App Store**.

**Qué se rompe si no:** `xcodebuild archive` falla con «Signing for "App" requires a development team»,
y el enlace mágico de invitación seguirá abriéndose en Safari aunque el código esté puesto.
· `02-8` `02-7` `03-16` `01-20`

### 2.3 — Xcode, a mano

- [ ] Abrir `ios/App/App.xcworkspace` → target `App` → `Signing & Capabilities` → seleccionar el
      equipo. Eso escribe `DEVELOPMENT_TEAM` en las dos configuraciones.
- [ ] Añadir la capability **Associated Domains** con `applinks:<tu-dominio>`.
- [x] ~~Verificar que `PrivacyInfo.xcprivacy` está en el target.~~ Ya no hace falta: se creó y se
      cableó al `project.pbxproj` directamente, y se comprobó que aparece dentro de `App.app` tras un
      `xcodebuild ... build` real. No tienes que tocar nada en Xcode para esto.

· `02-8` `02-2` `03-16`

---

## 3. Máquina local y dispositivo físico

### 3.1 — Instalar el JDK · **sigue siendo el punto que más tapa**

> **Actualización 3.** Al arreglar la barra de estado apareció que `styles.xml` referenciaba tres
> colores de un `colors.xml` **que no existía en el proyecto**. `aapt2` no puede resolverlos: la
> compilación de Android fallaba antes de empezar, y nadie lo sabía porque nunca se ha compilado.
> Ya está creado. Pero eso refuerza lo de abajo: hasta que no haya JDK, cada cosa que se dé por
> buena en Android es una suposición.

- [ ] Instalar Android Studio (trae JDK 21 embebido) o Temurin 21, y exportar `JAVA_HOME`.
- [ ] Comprobar: `java -version` debe responder algo.

**Qué se rompe si no:** `./gradlew bundleRelease` aborta sin JVM. Hoy no hay ningún JDK en la máquina
(`/usr/libexec/java_home` falla, `$JAVA_HOME` vacío), lo que significa que **`RestTimerService.kt` y
`RestTimerPlugin.kt` no han pasado nunca por el compilador**. «Android compila» es hoy una suposición,
no un hecho. · `02-4`

### 3.2 — Crear el keystore de subida

El `build.gradle` **ya lee** `android/keystore.properties` y firma el release con él; el fichero está
en `.gitignore` y tienes la plantilla en `android/keystore.properties.example`. Si ese fichero no
existe, el build sigue funcionando pero avisa por consola de que el AAB sale sin firmar, en vez de
descubrirlo al subirlo a Play. Lo único que falta es lo que solo puedes hacer tú:

- [ ] Fuera del repo:
      `keytool -genkey -v -keystore ~/Keys/en-forma-upload.jks -alias enforma-upload -keyalg RSA -keysize 4096 -validity 10000`
      **La contraseña la escribes tú. Claude no escribe contraseñas, sin excepciones.**
- [ ] Crear `android/keystore.properties` (que Claude añadirá al `.gitignore`) con `storeFile`,
      `storePassword`, `keyAlias` y `keyPassword`.
- [ ] Guardar el `.jks` y las contraseñas en tu gestor de contraseñas. Si se pierden y no has activado
      Play App Signing, **no podrás actualizar nunca la app**.

· `02-3`

### 3.3 — Builds de verdad, en serie (hecho para iOS el 10 ago, tras la síntesis; Android sigue bloqueado por § 3.1)

- [x] `cd ~/en-forma && npm run build && npx cap sync ios` — hecho. `android` no se sincronizó porque
      no cambia nada sin JDK para compilarlo después.
- [x] `ios/App/App/public/assets` tiene fecha de hoy (165 ficheros); `android/.../assets/public/assets`
      **sigue del 21-22 de julio** porque no se resincronizó — hazlo tú cuando resuelvas § 3.1, con
      `npx cap sync android`.
- [x] Existe `ios/App/App/public/recetas/00_indice.json` y `ios/App/App/capacitor.config.json` dice
      `backgroundColor #050505`. Confirmado.
- [x] **Corrección al comando de abajo:** el proyecto usa SPM, no CocoaPods — **no existe**
      `ios/App/App.xcworkspace` (`ls` lo confirma). El flag correcto es `-project`, no `-workspace`:
      `xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release -destination 'generic/platform=iOS' -archivePath /tmp/EnForma.xcarchive archive`
      Ejecutado así: falla, pero **solo por firma** —
      `error: Signing for "App" requires a development team` — porque no hay Apple Developer Team ID
      todavía (§ 2.2). Repitiendo con `CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO` en vez de
      `archive`, sale `** BUILD SUCCEEDED **`: **el código compila limpio**. En cuanto tengas el Team
      ID, repite el archive tal cual (sin los flags de firma) para el binario real.
- [ ] `cd android && ./gradlew bundleRelease --warning-mode all 2>&1 | tee /tmp/android-bundle.log` —
      sigue sin poderse ni intentar: no hay JDK ni Android Studio en esta máquina (§ 3.1, confirmado
      con `java -version` y `/usr/libexec/java_home -V`, ambos fallan).
- [x] **iOS: archive real HECHO** (13 ago). `** ARCHIVE SUCCEEDED **`, `.xcarchive` de **35 MB**,
      `validate-for-store` OK, firmado con `Apple Development` y `TeamIdentifier=CTHTC98W9A`. Para
      subirlo a App Store Connect falta el certificado de distribución (§ 2.2).
- [ ] Lo mismo para el `.aab` de Android: sigue sin poder intentarse hasta el JDK (§ 3.1).
- [ ] `./gradlew :app:processReleaseManifest` y leer
      `android/app/build/intermediates/merged_manifests/release/AndroidManifest.xml` para confirmar que
      `ACCESS_FINE_LOCATION` ya no aparece sin `maxSdkVersion`.

· `02-25` `02-6` `04-4` `06-18` `02-12` `06-19`

### 3.4 — QA en dispositivo, con sesión de atleta de prueba

Solo se puede hacer **después** de § 0.5 (§ 0.2 está anulada). Crea un atleta de prueba con datos
**ficticios**: nunca datos reales de un cliente, son datos de salud y las capturas son públicas.

> **Actualización 3.** Seis de los puntos de abajo eran fallos conocidos y **ya están arreglados en
> código**, así que dejan de ser «busca el fallo» y pasan a ser «confirma el arreglo»: coma decimal,
> alta del atleta, kcal del alta, entrenamiento interrumpido, modo avión y sesión. En cada uno,
> «Fallo =» describe lo que pasaba ANTES; si eso sigue pasando en el dispositivo, es una regresión y
> hay que decirlo.
>
> Dos puntos **han dejado de existir**: «Enlace mágico» (se retiró, ya no hay ese camino de acceso)
> y la parte de Google Sign-In (retirado de las tres plataformas). Ignóralos.
>
> Y hay dos comprobaciones **nuevas** que antes no tenían sentido porque el arreglo no existía:
>
> - [ ] **Entreno a medias.** Marca 3 series, mata la app desde el conmutador y reábrela **entrando
>       otra vez en esa misma sesión**. Deben estar las 3 series. Vuelve a la lista con «Volver» y
>       entra otra vez: también deben estar. `05-5`
> - [ ] **Iconos sin red.** Pon el móvil en modo avión y abre la app desde cero. La barra inferior y
>       las cabeceras deben salir con **iconos**, no con las palabras `fitness_center`, `arrow_back`
>       o `close`. `06-1`

**Lo anterior al login ya se recorrió (10 ago, simulador de iPhone 17 Pro, iOS 26.5), sin necesidad
de sesión.** Confirmó en vivo, con capturas: el icono de Google roto (`03-9`/`07-17`) y que tocar
«Google Sign-In» cuelga la app en «Entrando…» sin límite de tiempo ni mensaje de error (detalle en
`informe.md`, `B-4`). No hace falta repetir esa parte — empieza esta sección directamente en lo que
exige sesión.

- [ ] **Cámara.** Progreso → Subir foto → «Hacer foto», y Perfil → Mi gimnasio → Añadir máquina que
      falta. Antes del arreglo la app se cierra en seco; después debe salir el diálogo de permiso.
      · `01-10` `02-1` `05-1`
- [ ] **Coma decimal.** En el editor de series, teclear `72,5` en el peso con el teclado en español.
      Fallo = el campo se queda vacío o guarda `72` (y al marcar la serie se registra **0 kg**).
      · `05-9` `07-12`
- [ ] **Alta del atleta.** Rellenar hasta el paso 5, matar la app desde el conmutador, reabrir.
      Fallo = vuelve al paso 0 vacío. · `05-4`
- [ ] **Kcal del alta.** Al terminar, mirar qué calorías muestra Nutrición. Fallo = 2000, sea quien sea
      el atleta. · `05-8`
- [ ] **Entrenamiento interrumpido.** Marcar 3 series, salir a otra app, matar En Forma desde el
      conmutador, reabrir. Fallo = las 3 series no vuelven. · `05-5`
- [ ] **Modo avión.** Registrar un entrenamiento sin red y pulsar «Terminar». Fallo = el botón se queda
      en spinner para siempre y no aparece ningún aviso de que no hay conexión. · `05-2` `05-3`
- [ ] **Sesión.** Iniciar sesión, matar la app, reabrir → debe entrar directo. Reiniciar el dispositivo
      y reabrir → igual. Revocar los tokens desde `Authentication` → usuario → ⋮ →
      `Cerrar sesiones` y guardar algo: anotar el mensaje exacto que sale. · `03-13`
- [ ] **Enlace mágico.** Abrir el correo de invitación en el iPhone con la app instalada. Fallo = se
      abre Safari. · `03-2`
- [ ] **Bluetooth.** Conectar la banda de pulso y comprobar que la notificación del descanso aparece con
      la app en segundo plano. Necesita banda real. · `01-21`
- [ ] **Rotación y iPad.** Girar el iPhone en `/home`, `/training`, `/nutrition` y `/profile`, y abrir
      la app en iPad Pro 13" y iPad mini. Capturar. Con esas capturas delante se toman las decisiones
      de § 6.4. · `02-10` `02-11` `07-14` `07-15`
- [ ] **Modo claro.** Poner el iPhone en modo claro y mirar la barra de estado sobre el fondo negro de
      la app. · `07-6`
- [ ] **Safe areas.** Comprobar cabecera, banner rojo y onboarding en un iPhone con isla dinámica y en
      un iPhone SE (donde el inset debe ser 0 y la cabecera medir 70 px exactos). · `07-1` `07-2` `07-3`

### 3.5 — Medir el coste real de Firestore

- [ ] Consola de Firebase → `Firestore` → base `ai-studio-b38fc63b-…` → pestaña **`Uso`**: anotar
      lecturas/día **antes** de los arreglos de rendimiento.
- [ ] Consola de Google Cloud → `Facturación` → `Informes`, filtrando por el SKU de lecturas de
      Firestore, para el coste real (el proyecto está en edición **Enterprise**, cuyo precio por lectura
      no es el de Standard).
- [ ] Repetir **después** de los arreglos, para saber si funcionaron.

**Por qué:** la estimación del informe (~3,3 M lecturas/mes con 31 usuarios) es un cálculo razonado,
no una medición. · `06-20`

---

## 4. App Store Connect

Nada de esto se puede rellenar hasta que exista la build y la política de privacidad esté publicada.

### 4.1 — Cuenta de demo para el revisor

- [ ] `App Review Information` → `Sign-in required`: pegar una cuenta de **ATLETA** con
      **email/contraseña fija** (no enlace mágico, que caduca y depende del correo) con datos
      realistas: onboarding completo, un mesociclo activo con al menos 4 semanas de `workoutLogs`, una
      dieta con intercambios colocados, 3 check-ins con feedback del coach y al menos una foto de
      progreso.
- [ ] Escribir en las notas del revisor: que la app es de **acceso por invitación de un entrenador
      personal**, que el alta la hace el coach, que **el servicio se contrata fuera de la aplicación y
      la app no muestra precios ni permite comprar**, y que el contenido web va empaquetado (la única
      llamada a servidor propio es `/api/ai-chat`, disponible solo para la cuenta del coach).
- [ ] **Decidir el acceso de coach.** Hoy el rol se autoconcede por email hardcodeado
      (`src/db/profiles.ts:116`), así que una segunda cuenta de coach para el revisor **no es posible
      sin tocar código**. O se le da acceso solo a la UI de atleta y se explica en las notas, o se
      generaliza el rol.

**Qué se rompe si no:** un revisor sin credenciales no puede ver **absolutamente nada** de la app.
Rechazo automático por 2.1. · `01-12` `01-18` `01-19`

### 4.2 — App Privacy

- [ ] `App Privacy` → `Privacy Policy URL`: pegar la URL de § 6.1.
- [ ] Declarar, como mínimo:
      · `Contact Info` → **Email Address** (recopilado, vinculado, no seguimiento)
      · `Health & Fitness` → **Health** y **Fitness** (recopilado, vinculado, no seguimiento)
      · `User Content` → **Photos or Videos** y **Other User Content**
      · `Identifiers` → **User ID**
- [ ] Marcar «Data is used for App Functionality».
- [ ] **NO marcar Analytics** mientras `measurementId` siga vacío (`src/firebase.ts:98` solo activa
      Analytics si existe).
- [ ] Declarar que los datos de salud **se comparten con un tercero** (Anthropic), coherente con lo que
      diga la política.

**Qué se rompe si no:** declarar de menos aquí es **causa de retirada de la app**, no solo de rechazo.
El inventario completo de qué dato vive dónde está en `04-19` del informe. · `01-13` `01-7` `04-6`

### 4.3 — Clasificación por edad

- [ ] `Age Rating`: responder **«Yes»** a Medical/Treatment Information (la app da pautas de dieta y
      registra medicación) y **«No»** a todo lo de contenido violento, sexual o de juego. Clasificación
      esperada: **12+**.

· `01-14`

### 4.4 — Idioma y metadatos

- [ ] Declarar **Español (España)** como idioma principal de la ficha.
- [ ] Confirmar los tamaños de captura vigentes **el día de la subida** en `Mi app` →
      `Vista previa de la App Store`: Apple los cambió en 2024-2025 y vuelven a cambiar.

· `01-11` `07-20`

### 4.5 — Declaración de cifrado

- [ ] Cuando Claude añada `ITSAppUsesNonExemptEncryption = false` al `Info.plist`, confirmar que estás
      de acuerdo: la app usa solo HTTPS/TLS y no implementa criptografía propia, lo que encaja con la
      exención de la nota 4 del Category 5 Part 2 del EAR. **La responsabilidad legal de esa
      declaración es tuya, no de Claude.** Si algún día se añade cifrado propio en reposo, el valor
      cambia.

**Qué se rompe si no:** cada build queda en «Missing Compliance» y no se puede enviar a revisión ni
repartir por TestFlight hasta contestar el cuestionario a mano. · `02-21`

---

## 5. Google Play Console

### 5.1 — Firma de la app

- [ ] Al crear la app, activar **Play App Signing**. Así el `.jks` de § 3.2 pasa a ser solo la clave de
      subida y Google puede rotarla si se pierde.
- [ ] `Configuración` → `Integridad de la aplicación` → `Firma de apps` → copiar la huella **SHA-256**
      del certificado de firma. Pasársela a Claude: hace falta para el `assetlinks.json` del enlace
      mágico.

· `02-3` `03-16`

### 5.2 — Seguridad de los datos (Data safety)

- [ ] `Contenido de la app` → `Seguridad de los datos`. Declarar:
      · `Personal info` → **Email address**, **Name**
      · `Health and fitness` → **Health info**, **Fitness info**
      · `Photos and videos` → **Photos**
      · `Messages` → **Other in-app messages**
- [ ] Marcar **«Data is encrypted in transit»** (todo va por HTTPS a Firebase y al proxy).
- [ ] Marcar que los datos de salud **se comparten con terceros** (Anthropic).
- [ ] Marcar **«Users can request that some or all data be deleted»** y pegar la URL de
      `/eliminar-cuenta` — **solo cuando esa página exista y funcione**, no antes.

**Qué se rompe si no:** sin el formulario completo, Play **bloquea** la publicación (no advierte,
bloquea). Y declarar de menos es motivo de retirada. · `01-13` `01-2` `04-6`

### 5.3 — Política de privacidad y borrado

- [ ] `Contenido de la app` → `Política de privacidad`: pegar la URL de § 6.1.
- [ ] Comprobar tú mismo, desde el navegador y **sin sesión iniciada**, que
      `https://<dominio>/eliminar-cuenta` y `https://<dominio>/privacidad` responden con la página real
      y no con la pantalla de login. Hoy el rewrite de `vercel.json` sirve la SPA en cualquier ruta que
      no sea `/api/*`, y eso es exactamente lo que Google rechaza.

· `01-2` `01-6` `04-5`

### 5.4 — Clasificación y audiencia

- [ ] `Content ratings`: categoría **Health and Fitness / Referencia**, declarando contenido de control
      de peso.
- [ ] `Contenido de la app` → `Público objetivo y contenido`: declarar **«18 y más»**, para no entrar en
      la política de familias.
- [ ] `Ficha principal`: idioma por defecto **es-ES**.

· `01-14` `01-11`

### 5.5 — Verificación de desarrollador

- [ ] Completar la verificación de identidad del desarrollador y la dirección pública en la ficha:
      obligatorias desde 2023.

· `01-22`

### 5.6 — Permiso de ubicación (solo si no se corrige `02-12`)

- [ ] Si el manifiesto fusionado sigue trayendo `ACCESS_FINE_LOCATION` del plugin BLE, hay que rellenar
      el formulario de declaración de permisos de ubicación **y** declarar recogida de ubicación en Data
      safety, para una app que no usa ubicación para nada. Lo limpio es que Claude lo corrija primero y
      comprobarlo en § 3.3.

· `02-12`

### 5.7 — Foreground service `specialUse`

- [ ] Si se mantiene el `RestTimerService`: `Contenido de la app` → escribir la declaración de
      `FOREGROUND_SERVICE_SPECIAL_USE` explicando por qué ningún tipo estándar sirve, **asumiendo riesgo
      de rechazo** (Play revisa a mano cada `specialUse` y lo rechaza cuando el caso no justifica un
      servicio persistente).
- [ ] Alternativa recomendada: dejar que Claude lo sustituya por una notificación programada con
      `@capacitor/local-notifications` (ya está en el proyecto) y borrar el servicio y los dos permisos
      del manifiesto. No es viable `shortService`: el descanso llega a 600 s y `shortService` se corta a
      ~3 minutos.

· `01-9`

### 5.8 — Capturas y gráficos

- [ ] Producir desde el simulador, con la cuenta de PRUEBA: icono 512×512 PNG 32 bits, gráfico
      destacado **1024×500**, mínimo 4 capturas de teléfono en 9:16, y capturas de tablet **solo** si
      distribuyes a tablet (§ 6.4).
- [ ] Para App Store: juego de iPhone 6,9" (1320×2868), 5 capturas, más el juego de iPad 13"
      (2064×2752) **solo si mantienes iPad**.
- [ ] Orden y titular propuestos, elegidos por valor y no por configuración:
      1. Sesión en curso con la tabla de series y el cronómetro — *«Tu entrenamiento, serie a serie»*
      2. Menú del día en Nutrición — *«Tu plan de comidas, sin adivinar»*
      3. Progreso y peso con la gráfica — *«Ves lo que cambia, semana a semana»*
      4. Check-in con feedback del coach — *«Dani te lee y te corrige»*
      5. Hoja de ruta / niveles — *«Sabes qué toca después»*

**No hay ni una captura producida hoy.** En el repo solo existen `assets/icon.png` y
`assets/splash.png`. · `07-20`

---

## 6. Decisiones de producto (no son tareas, son decisiones)

Ninguna la puede tomar Claude, y varias bloquean trabajo de código.

### 6.1 — Quién es el responsable del tratamiento y qué dice la política

- [ ] Depende de § 2.1 (persona física u organización).
- [ ] Decidir el **dominio público definitivo** de la app. Hoy no está en ninguna variable del repo:
      `capacitor.config.ts` no define `server.url` y `src/db/invites.ts:23` usa
      `window.location.origin`. Sin esa decisión no se pueden escribir ni el
      `apple-app-site-association` ni el `assetlinks.json`, o sea que **bloquea el arreglo del enlace
      mágico**.
- [ ] Aceptar el **DPA de Anthropic** desde la consola de tu cuenta de API, y confirmar que la política
      dirá que Anthropic no entrena con datos de la API.

· `01-22` `03-16` `04-6` `01-6`

### 6.2 — Sign in with Apple, o retirar Google en iOS

Apple exige (guideline 4.8) que si ofreces Google Sign-In ofrezcas **otro servicio de login
equivalente**. Hay dos salidas y las dos cumplen:

- [ ] **Opción A — añadir Sign in with Apple.** Coste real: entitlements, proveedor nuevo, QA de un
      flujo de login más, **y sobre todo la migración de identidad de email a UID** (3-5 días), sin la
      cual un atleta que oculte su correo con el relay de Apple **queda encerrado con
      `permission-denied` y no puede ni crear su perfil**. Total: 5-8 días.
- [ ] **Opción B — ocultar el botón de Google en iOS.** La app de iPhone pasa a usar solo el sistema
      propio (invitación + correo/contraseña) y cae dentro de la primera excepción de 4.8. Coste: horas.
      Refuerza esta vía que **el popup de Google ya está roto en iOS nativo**: hoy ese botón es una
      puerta muerta.

**Recomendación para la 1.0: opción B**, y dejar la decisión escrita. La A es la que hay que tomar el
día que quieras auto-registro real. · `01-3` `03-1` `01-4` `03-7`

### 6.3 — Borrar o anonimizar el rastro comercial del atleta

Bloquea el diseño del borrado de cuenta, que es la pieza más grande de toda la revisión (4-6 días).

- [ ] **Opción A — borrado total, incluido el CRM.** Más limpio ante el RGPD; rompe el cuadro de mandos
      y contradice `firestore.rules:626`, que ya establece que un pago en estado `pagado` no se borra
      nunca porque «representa dinero real ya cobrado».
- [ ] **Opción B — anonimizar** (recomendada por dos bloques). La función de borrado sustituye en
      `crmPagos`, `crmSuscripciones`, `crmContactos` y los campos CRM de `user_profiles` el email,
      nombre, DNI, dirección y teléfono por un identificador opaco `borrado_<hash>`, **conserva importes
      y fechas**, y borra íntegro todo lo demás. Es defendible por obligación fiscal de conservación,
      **pero hay que declararlo explícitamente en la política de privacidad y en el App Privacy**.

**Confírmalo por escrito antes de que se implemente el borrado.** · `03-17` `01-1` `03-4`

### 6.4 — iPad, orientación y Live Activity

Se deciden con las capturas de § 3.4 delante.

- [ ] **iPad.** Camino corto: `TARGETED_DEVICE_FAMILY = "1"` (solo iPhone) — 5 minutos, y te ahorras el
      juego de capturas de iPad y que el revisor pruebe la app en una pantalla para la que nadie ha
      diseñado nada (todo el layout se hizo a 375 px). Camino largo: mantener `"1,2"` y hacer trabajo de
      diseño real. **Recomendación para la primera subida: `"1"`.**
- [ ] **Orientación.** Hoy se declara apaisado sin soportarlo: a partir de 768 px el layout salta a la
      maqueta de escritorio, y un iPhone 15 Pro Max en horizontal mide 932×430, así que intenta meter
      una barra lateral de altura completa en 430 px de alto. O se bloquea a vertical, o se arregla el
      criterio del breakpoint. **Declarar apaisado y no soportarlo es riesgo de rechazo por 2.1.**
- [ ] **Live Activity.** `NSSupportsLiveActivities = true` está en el `Info.plist` pero **ni la extensión
      ni el plugin están en ningún target** (`grep -c RestTimerWidget project.pbxproj` → 0; el único
      `.swift` del proyecto es `AppDelegate.swift`). Camino corto: quitar la clave y quedarse con la
      degradación a notificación local, que ya funciona. Camino largo: crear el target de widget, con
      Xcode a mano y un dispositivo físico para probarlo.

· `02-11` `07-15` `02-10` `07-14` `02-9` `01-21`

### 6.5 — Calorías del alta

- [ ] Decidir: que el asistente de alta **calcule** las kcal con `estimateMaintenanceKcal` (la función ya
      existe y la usa el formulario del coach), o que **no escriba nada** y las pantallas muestren
      «pendiente de tu coach».

Lo que no puede quedarse es lo de hoy: **2000 kcal fijas para todo el mundo**, unas 700 por encima del
mantenimiento de una mujer de 55 kg y 52 años sedentaria, y ese número es el que ve ella, el que ves tú
en el hub y el que consume el asistente de IA. · `05-8`

### 6.6 — Dynamic Type

- [ ] Decidir: **asumir** que la app no soporta Dynamic Type (y entonces hay que quitar los `truncate`
      de títulos y sustituir los altos fijos por `min-h`, porque el WebView de Android **sí** aplica el
      factor de escala del sistema y ahí desbordan), o **soportarlo** pasando los tokens `--text-*` de
      px a rem.

Hoy un usuario que suba el tamaño de letra en Ajustes no ve cambiar absolutamente nada. Parte de tus
clientes pasan de 45. · `07-13`

---

## Resumen del camino crítico · actualizado 13 ago 2026

**Ya no queda trabajo de código bloqueando la publicación.** Esta tabla sustituye a la de las
versiones anteriores del documento.

| Bloquea | Quién | Plazo |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` en Vercel | **Dani, § 0.5** | **5 min — es el único bloqueante vivo** |
| D-U-N-S, solo si publicas como organización | Dani, § 2.1 | decidido: **persona física**, sin espera |
| Tus tres datos en las páginas legales | Dani, § 0.4 | 10 min |
| Certificado de **distribución** + perfil de App Store | Dani, § 2.2 | 30 min — el Team ID ya está |
| JDK, para que Android compile por primera vez | Dani, § 3.1 | 1 h |
| Keystore de subida | Dani, § 3.2 | 30 min |
| Decisión iPad y Live Activity | Dani, § 6.4 | decisión |
| QA en dispositivo con sesión de atleta | Dani, § 3.4 | medio día |
| Cuenta de demo y formularios de las fichas | Dani, § 4 y 5 | 1-2 días |
| Capturas y gráficos | Dani, § 5.8 | medio día |

### Lo que ya NO está en esta tabla, y por qué

| Estaba | Qué pasó |
|---|---|
| Vínculo de correo en Firebase Auth | **Anulado**: el enlace mágico se retiró (§ 0.2) |
| Decisión CRM (borrar vs anonimizar) | **Decidida**: anonimizar, e implementada |
| Decisión Sign in with Apple | **Decidida**: se retiró Google, así que la 4.8 ya no aplica |
| Política de privacidad publicada | **Hecha**: `/privacidad` y `/terminos`, a falta de tus tres datos (§ 0.4) |
| Borrado de cuenta completo | **Hecho**: `api/delete-account.ts` con la cascada entera |
| Enlace mágico end-to-end | **Ya no existe**: se retiró el camino entero |
| Índice de `workoutLogs` | **Desplegado** el 13 ago y verificado contra producción |

Todo lo demás está priorizado en el plan de remediación de [`informe.md`](./informe.md).
