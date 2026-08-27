# Publicar En Forma · lo que queda

Repaso del 27-08-2026 contra el estado real (Firebase por API, Vercel, el repo y
un build de verdad), no contra lo que decía el checklist de agosto. Sustituye a
`checklist-dani.md`, que conserva el detalle y el porqué de cada punto pero
arrastra cuatro capas de «Actualización N» y da por pendiente cosas ya hechas.

---

## 1 · Bloqueantes: sin esto no se publica

- [ ] **Keystore de subida de Android.** `android/keystore.properties` no existe, así que el
      AAB sale **sin firmar** y Play lo rechaza. Ver `android/keystore.properties.example`.
      Guarda el `.jks` y las contraseñas en el gestor: si se pierden y no has activado Play
      App Signing, no puedes volver a actualizar la app nunca.
- [ ] **Cuenta de Apple Developer: persona física u organización.** Si eliges organización,
      el D-U-N-S tarda semanas — decidirlo hoy o publicar como persona física.
- [ ] **App ID en el portal de Apple**, certificado de distribución y perfil de App Store.
- [ ] **HealthKit marcado en el App ID.** El proyecto tiene la capacidad activada
      (`ios/App/App/App.entitlements`) y el widget de pasos lee de Salud. *(El checklist viejo
      decía «NO marcar HealthKit, la app no lo usa»: eso ya no es verdad.)*
- [ ] **Xcode**: firmar el target `App`, subir el build number, archivar y subir.
- [ ] **Publicar el plan de Cliente Demo** — Cliente Demo → Plan → Entrenamientos →
      «Mostrar el plan al atleta». Sin esto el revisor se queda en la sala de espera.
- [ ] **Entrar una vez con la cuenta de revisión** (credenciales en
      [notas-para-revision.md](../notas-para-revision.md)) y recorrer el flujo de atleta.
      Nunca se ha usado.

## 2 · Fichas de tienda

- [ ] **Notas del revisor y credenciales**: texto listo para pegar en
      [notas-para-revision.md](../notas-para-revision.md).
- [ ] **Capturas.** iPhone 6,9" (1320×2868), 5 imágenes. Y **de iPad 13" también**, porque el
      proyecto declara `TARGETED_DEVICE_FAMILY = "1,2"`. Si no quieres el trabajo de iPad en la
      v1, ponerlo a `"1"` son cinco minutos y te ahorras capturas y QA de tablet — dilo y lo
      cambio.
- [ ] **App Privacy (Apple) y Data safety (Play)**: datos de salud, cifrado en tránsito,
      borrado de cuenta a petición, y que los datos de salud **se comparten con un tercero**
      (Anthropic) cuando el entrenador usa el análisis con IA.
- [ ] **Clasificación por edad**: «Yes» a Medical/Treatment Information en Apple; «18 y más»
      en Play. Idioma principal es-ES en las dos.
- [ ] **Play · declaración de `foregroundServiceType="specialUse"`.** El `RestTimerService`
      sigue en el manifiesto (`android/app/src/main/AndroidManifest.xml:42`) y Play exige
      justificarlo por escrito.
- [ ] **Play App Signing** al crear la app.
- [ ] **Verificación de identidad del desarrollador** en Play.

## 3 · Recomendado antes de tener clientes reales dentro

- [ ] **Copias de seguridad de Firestore.** No hay ninguna programada y la recuperación a un
      punto en el tiempo está en 1 hora, el mínimo. Consola → Firestore → Copias de seguridad,
      sobre la base `ai-studio-b38fc63b-…`. Un borrado a las 9:00 descubierto a las 11:00 hoy
      es irrecuperable.
- [ ] **Probar el alta de punta a punta**: invitar a un correo tuyo, recibir el enlace, poner
      contraseña y entrar. La configuración está bien (verificada); falta hacerlo una vez.
- [ ] **Personalizar la plantilla del correo** de Firebase → Authentication → Templates.
      Hoy sale el texto por defecto de Google.
- [ ] **Marcos Ibáñez tiene el plan montado y sin publicar.** Si esperabas que viera algo, no
      lo está viendo.

## 4 · Ya resuelto — verificado el 27-08, no lo repitas

| Punto del checklist viejo | Estado real |
|---|---|
| §0.2 Enlace de correo en Auth | Activado. Dominios autorizados incluyen el de Vercel y `localhost` |
| §0.4 Datos en las páginas legales | Rellenas, sin marcadores ni aviso de borrador |
| §0.5 `FIREBASE_SERVICE_ACCOUNT` en Vercel | Puesta (hace 15 días) |
| §0.1 / §1.1 Reglas de Firestore y Storage | Desplegadas e **idénticas al repo** (comprobado por API) |
| §1.3 Base `(default)` fantasma | No existe. Solo hay una base |
| §1.5 App Check | Registrado como reCAPTCHA **Enterprise**, y **apagado a propósito** hasta que el nativo pueda aplicarlo — ver [estado](../../src/firebase.ts) |
| §3.1 JDK | OpenJDK 21 instalado |
| §3.3 Build de Android | **`bundleRelease` compila**: `app-release.aab`, 14 MB (sin firmar, falta el keystore) |
| §4.5 Declaración de cifrado | `ITSAppUsesNonExemptEncryption` ya está en el `Info.plist` |
| §5.6 `ACCESS_FINE_LOCATION` del plugin BLE | Acotado con `maxSdkVersion=30` y `tools:node="replace"` |
| §6.2 Google Sign-In en iOS | Retirado: el acceso es solo email y contraseña |
| §6.3 Rastro comercial al borrar | Implementada la opción B: anonimiza en vez de borrar, y la pantalla lo dice |
| §6.4 Live Activity | La extensión **existe** (target `RestTimerWidget`, embebido) |
| §6.5 Kcal del alta | Se calculan de verdad; ya no hay 2000 fijo |

## 5 · Decisiones que siguen abiertas (ninguna bloquea)

- **iPad sí o no** en la v1 (ver capturas, arriba).
- **Dominio público definitivo.** Hoy todo apunta a `en-forma-ivory.vercel.app`, incluidas las
  páginas legales. Cambiarlo después obliga a tocar las dos fichas de tienda.
- **DPA de Anthropic** aceptado en la consola de tu cuenta de API, para que lo que dice la
  política de privacidad sea cierto.
- **Dynamic Type**: la app no lo soporta; asumirlo o adaptar los `truncate`.
- **Associated Domains / applinks**: sin configurar. El enlace de invitación abre en el
  navegador en vez de en la app. No bloquea, porque el alta se termina igual.
