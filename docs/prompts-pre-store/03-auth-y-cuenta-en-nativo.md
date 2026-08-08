# BLOQUE 03 — Autenticación y ciclo de vida de la cuenta en la app nativa

<!-- Pégale este texto a una sesión nueva apuntando al repo ~/en-forma, rama ds/f3-experiencia. -->

Eres un ingeniero de autenticación. Vas a revisar cómo se entra, se mantiene la sesión y se sale
de **En Forma** **dentro de la app nativa** (Capacitor 8 + Firebase Auth), no en el navegador.
Es el bloque con más riesgo de la revisión: hay indicios fuertes de que **los dos caminos de
acceso están rotos en el iPhone**, lo que dejaría la app inutilizable en el momento en que se
publique.

**Trabaja en solo lectura.** No modifiques código. Puedes compilar y ejecutar en el simulador para
verificar. **Claude nunca escribe contraseñas** —regla dura, sin excepciones—, así que todo lo que
exija una sesión real iniciada se documenta como tarea para Dani con los pasos exactos y el
resultado esperado, no se intenta.

Cada hallazgo: `archivo:línea`, síntoma concreto (entrada → resultado), cambio exacto propuesto,
severidad (Bloqueante / Alta / Media / Baja / Info) y marca `verificado` o `sospecha`.

## Cómo funciona hoy

Tres vías de acceso, todas en `src/components/WelcomeScreen.tsx` y `src/firebase.ts`:

1. **Google** — `signInWithPopup`, con *fallback* a `signInWithRedirect` si el popup se bloquea.
2. **Correo y contraseña** — solo inicio de sesión. **El auto-registro se quitó a propósito**
   (`WelcomeScreen.tsx:119-123`, el comentario lo explica).
3. **Enlace mágico** — `sendSignInLinkToEmail` desde `src/db/invites.ts`, recibido en
   `WelcomeScreen.tsx:45` con `signInWithEmailLink`.

El **rol se decide por correo electrónico**: `danitrviner@gmail.com` es el coach y tiene permisos
totales; cualquier otro es atleta. Está hardcodeado en al menos ocho ficheros de `src/`
(`src/App.tsx:71`, `src/db/profiles.ts:116`, `src/components/CheckInScreen.tsx:15`…) y también en
`firestore.rules`.

---

## 1. Google en WKWebView — `WelcomeScreen.tsx:94`

`signInWithPopup` abre una ventana emergente. **En WKWebView no hay ventanas emergentes.**
Verifica qué ocurre exactamente en el simulador: qué código de error devuelve, si entra en el
*fallback* de `auth/popup-blocked` (línea 100) o si falla por otro camino y el usuario se queda
con un botón que no hace nada.

Después verifica el *fallback*: `signInWithRedirect` **tampoco es fiable en nativo**. Firebase
depende de almacenamiento compartido entre el dominio de auth y el origen de la app, y en Capacitor
el origen es `capacitor://localhost`. Comprueba el estado actual de esa limitación en la
documentación de Firebase (cambió con el particionado de almacenamiento de terceros) y determina
si `getRedirectResult` llega a resolverse.

**Propón el camino correcto** y valóralo con su coste: plugin nativo de Google Sign-In devolviendo
credenciales a `signInWithCredential`, o navegador del sistema con esquema personalizado. Di cuál
recomiendas y por qué.

## 2. El enlace mágico — `src/db/invites.ts:23`

```ts
await sendSignInLinkToEmail(auth, normalized, {
  url: window.location.origin,
  handleCodeInApp: true,
});
```

Dos problemas encadenados:

- **`window.location.origin` en la app nativa es `capacitor://localhost`**, que no es un dominio
  autorizado de Firebase Auth. Verifica qué error da al invitar desde la app.
- **El correo que recibe el atleta abre el navegador, no la app.** Sin Associated Domains y
  Universal Links en iOS (ni App Links en Android), el enlace lleva al usuario a la web y la sesión
  se inicia allí, no en la app que acaba de instalar. Comprueba el estado del entitlement (el
  bloque 02 lo mira desde el lado de la configuración) y qué hace falta: fichero
  `apple-app-site-association` servido desde el dominio, `assetlinks.json` para Android, y el
  manejo del deep link al volver.

**Esto es el único camino de alta de clientes que existe.** Si está roto en nativo, un cliente
nuevo no puede empezar a usar la app desde su móvil. Trátalo como tal.

Nota heredada, no la redescubras: **«Vínculo del correo electrónico» está desactivado en la
consola de Firebase**, así que hoy `sendSignInLinkToEmail` falla con `auth/operation-not-allowed`
para cualquier correo, incluso en la web. Es un bloqueante conocido, acción de Dani
(`docs/QA-pendiente-dani.md` § 1). Tu trabajo es lo *otro*: que aunque se active, en nativo siga
sin funcionar.

## 3. Borrado de cuenta

No existe: `deleteUser`, «eliminar cuenta» y «borrar cuenta» dan **cero resultados** en `src/`.
Apple lo exige (guideline 5.1.1(v)) y Play también, con una URL web además. El bloque 01 lo trata
como requisito de tienda; **aquí lo diseñas técnicamente**:

- **Inventario de lo que cuelga de un atleta.** Recorre `src/db/` y `firestore.rules` y lista cada
  colección con datos suyos, y cada ruta de Storage (fotos de progreso, fotos de máquinas propias).
- **La cascada.** Firebase Auth no borra Firestore ni Storage. Determina qué hace falta: función de
  servidor con el Admin SDK (ya hay una vía en `api/`, que usa `FIREBASE_SERVICE_ACCOUNT`), o
  borrado desde el cliente con las reglas que lo permitan. Valora los dos.
- **Reautenticación reciente.** `deleteUser` exige credenciales recientes o falla con
  `auth/requires-recent-login`. Diseña el flujo, incluida la vuelta por el enlace mágico si el
  usuario entró por ahí.
- **Qué se conserva.** El CRM guarda pagos y suscripciones que el coach necesita para su
  contabilidad. Anonimizar frente a borrar es una **decisión de producto**: preséntala con las dos
  opciones y su implicación de RGPD, no la resuelvas tú.
- **Qué ve el coach** cuando un atleta se borra: hay referencias cruzadas por email y por uid en
  entrenamientos, dietas, informes y roadmap. Busca qué quedaría colgando.

## 4. Sign in with Apple y el rol por correo

Si el bloque 01 confirma que hace falta Sign in with Apple, aquí se diseña. Lo importante no es el
botón, es el efecto colateral:

**Apple permite ocultar el correo real** y entrega un relay `@privaterelay.appleid.com`. Esta app
decide el rol comparando cadenas de correo, y `firestore.rules` usa `request.auth.token.email`.
Recorre los ocho ficheros con el correo hardcodeado y determina, para cada uno, qué pasa con un
usuario de correo relay. Lo probable es que el modelo de identidad basado en correo tenga que
migrar a **uid con reclamos personalizados** —eso ya se señaló en la auditoría de seguridad de
julio— y esto lo convierte en urgente. Dimensiona el trabajo con honestidad.

Comprueba también el flujo de invitación: si el coach invita a `dani@gmail.com` y el atleta entra
con Apple ocultando el correo, la invitación no casa con nadie.

## 5. Modo local degradado

`forceLocalOnly`, `setLocalBypassMode` (`src/db/core.ts`) y `LocalModeBanner.tsx`: cuando Firestore
falla por permisos, la sesión **queda autenticada y escribiendo en `localStorage`**. Está diseñado
así, pero para la publicación tiene dos caras:

- **Para el revisor de Apple** (guideline 2.1): una app que parece funcionar y no guarda nada.
- **Para un atleta real**: pérdida de datos silenciosa. Verifica **qué ve exactamente** —cuánto se
  entiende del banner— y si lo escrito en local se recupera cuando los permisos vuelven, o se
  pierde. Esto último es lo que decide la severidad.

Ya hay antecedente real: durante la auditoría visual, una cuenta de atleta se quedó en este modo
sin poder guardar el onboarding, y la app siguió pareciendo normal
(`docs/auditoria-visual/hallazgos.md`).

## 6. Sesión, persistencia y salida

- **Persistencia** al cerrar y reabrir la app: qué tipo usa Firebase Auth en WKWebView, y si
  sobrevive a que iOS descarte el proceso. Verifícalo en el simulador.
- **Refresco de token** después de días sin abrir, y qué ve el usuario si caduca a mitad de un
  entrenamiento.
- **Cierre de sesión**: que limpie de verdad —`localStorage`, caché de TanStack Query, el estado
  del modo local— y no deje datos del anterior usuario visibles. Hay antecedente anotado en
  `project_security_audit_2026_07_23` sobre la caché al cerrar sesión.
- **Cambio de cuenta** en el mismo dispositivo (coach y atleta en el mismo iPhone, que es un caso
  real: Dani prueba la app como atleta).

---

## Entregable

Escribe tu parte en `docs/revision-pre-store/informe.md` con ids `03-1`, `03-2`…

Incluye una **tabla de caminos de acceso**: vía · funciona en web · funciona en iOS nativo ·
funciona en Android nativo · veredicto. Con las tres columnas rellenadas de verdad (verificado en
simulador, no deducido), esa tabla es la respuesta a «¿se puede usar la app en un móvil?».

Al final, un apartado de **diseño del borrado de cuenta**: cascada completa, decisión de
anonimizar frente a borrar, y esfuerzo estimado. Es la pieza de trabajo más grande que va a salir
de toda la revisión, así que conviene que salga bien dimensionada.

Lo que exija sesión iniciada o consola de Firebase va a `docs/revision-pre-store/checklist-dani.md`.
