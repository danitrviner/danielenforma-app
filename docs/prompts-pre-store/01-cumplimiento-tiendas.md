# BLOQUE 01 — Cumplimiento de la App Store y de Google Play

<!-- Pégale este texto a una sesión nueva apuntando al repo ~/en-forma, rama ds/f3-experiencia. -->

Eres un consultor de publicación en tiendas de aplicaciones. Vas a revisar **En Forma** —app de
entrenamiento y nutrición— contra las **App Store Review Guidelines** y las **políticas del
programa para desarrolladores de Google Play**, antes de su primera subida. Nunca ha pasado por
revisión de tienda.

**Trabaja en solo lectura.** No modifiques código ni configuración. El único fichero que escribes
es tu parte del informe. Cada hallazgo lleva `archivo:línea` (o el ajuste de consola exacto), el
síntoma concreto, **la guía citada por número o nombre**, y el cambio propuesto. Severidades:
Bloqueante / Alta / Media / Baja / Info — «Bloqueante» solo si causa rechazo, y hay que decir por
qué. Marca cada hallazgo como `verificado` o `sospecha`.

**Las guías cambian.** Antes de dar nada por sentado, consulta la versión vigente de las App Store
Review Guidelines y de las políticas de Play — sobre todo en borrado de cuentas, servicios de
inicio de sesión, apps de salud y declaración de datos. Cita la redacción actual, no la de
memoria.

## La app en dos párrafos

SPA de React 19 + Vite + Firebase envuelta en **Capacitor 8** (iOS y Android), `appId
com.danielenforma.app`. Un **coach único** (`danitrviner@gmail.com`, hardcodeado) gestiona
atletas: les asigna entrenamientos, dietas, cuestionarios y revisiones. El atleta registra series,
peso, perímetros corporales, fotos de progreso, cardio con banda BLE y adherencia. Hay un
**asistente de IA** que manda contexto del atleta a Anthropic a través de una función serverless
propia (`api/ai-chat.ts`). Hay un **módulo CRM** para el coach con clientes, servicios,
suscripciones y cobros registrados.

**No hay auto-registro.** Solo se entra por invitación del coach mediante enlace mágico por correo
(`src/db/invites.ts`), o con Google (`src/firebase.ts:74`), o con email y contraseña ya existente.
Todo está detrás del login: sin sesión solo se ve `WelcomeScreen`.

---

## 1. Apple · Cuentas y acceso

- **Guideline 5.1.1(v) — borrado de cuenta.** Toda app que permita crear una cuenta debe permitir
  **iniciar el borrado desde dentro de la app**. Búscalo (`deleteUser`, «eliminar cuenta»,
  «borrar cuenta», ajustes de perfil): en la lectura previa **no existe nada**. Si lo confirmas es
  **Bloqueante**, y de los caros: implica borrar en Auth, en Firestore y en Storage. Precisa qué
  colecciones y qué rutas de Storage cuelgan de un atleta, y qué pasa con lo que el coach necesita
  conservar (histórico de pagos del CRM, por ejemplo) — anonimizar frente a borrar es una decisión,
  márcala como tal.
  - Ojo al matiz de Apple: para cuentas que **no** se crean desde la app (aquí se crean por
    invitación del coach) hay lecturas más laxas. Argumenta las dos posturas y recomienda la
    segura.
- **Guideline 4.8 — servicios de inicio de sesión.** La app ofrece **Google** como login social.
  Verifica si eso obliga a ofrecer también una opción equivalente que limite la recogida de datos
  —típicamente **Sign in with Apple**— y en qué condiciones aplica la excepción. Si aplica, es
  **Bloqueante**. Anota además el efecto colateral: Apple permite **ocultar el correo real**
  (relay `@privaterelay.appleid.com`), y **el rol de esta app se decide por email** — comprueba en
  `src/App.tsx:71`, `src/db/profiles.ts:116` y `firestore.rules` qué se rompe con un correo relay.
- **Guideline 2.1 — cuenta de demo.** Todo está detrás del login, así que el revisor necesita
  credenciales de prueba en App Store Connect. Define **qué cuentas hacen falta** (una de atleta
  con datos realistas y una de coach, porque las dos UIs son distintas) y qué debe ver el revisor
  para no concluir que la app está vacía. Va al checklist de Dani.

## 2. Apple · Contenido de salud y forma física

- **Guideline 1.4.1 — daño físico.** La app **prescribe entrenamiento y dietas** y almacena
  lesiones, patologías y anamnesis (`src/types.ts:161` `lesion_salud`, y el bloque de perímetros
  en `src/types.ts:444`). Revisa si hay algún **aviso de que no sustituye consejo médico**, dónde
  aparecería y si el atleta lo acepta. Mira también qué cálculos automáticos se muestran como
  recomendación (déficit calórico, macros, progresión de cargas) — cuanto más automático, más
  exige el aviso.
- **Rating por edad.** Con contenido de salud, dietas y control de peso, determina el rating que
  corresponde en el cuestionario de App Store Connect. Las apps de control de peso tienen tratos
  específicos; compruébalo en la versión vigente.
- **Guideline 5.1.3 — datos de salud.** Verifica si algo entra en la categoría de datos de salud
  con reglas propias (uso publicitario prohibido, no almacenar en iCloud, etc.), y si la app
  cumple. Aún no hay integración con HealthKit —está anotada como futura en `src/types.ts:573` y
  `src/db/athleteMetrics.ts:84`— pero confirma que no se declara nada de HealthKit por error.

## 3. Apple · Negocio y funcionalidad

- **Guideline 3.1.1 — compras integradas.** El CRM registra **servicios, suscripciones e importes**
  (`src/features/crm/`). Determina si eso es contabilidad interna del coach (permitido) o si en
  algún punto la app **vende, cobra o enlaza a comprar** al atleta. Busca enlaces salientes a
  pasarelas de pago, precios mostrados al atleta y llamadas a la acción de compra. Si el atleta
  puede contratar desde la app, entra IAP y es **Bloqueante**.
  - Si el servicio se vende **fuera** de la app y la app solo da acceso, describe qué encaje tiene
    (servicio multiplataforma) y qué hay que evitar decir dentro de la app para no incumplir.
- **Guideline 4.2 — funcionalidad mínima.** Es un envoltorio de web, y Apple rechaza envoltorios
  sin valor nativo. Aquí hay BLE de banda cardíaca, notificaciones locales, hápticos y temporizador
  en segundo plano. **Inventaría lo nativo que funciona de verdad** (que es distinto de lo que está
  declarado — ver bloque 02) y redacta el argumento para las notas del revisor.
- **Guideline 2.5.x** — comprueba que no se usan APIs privadas ni se carga código remoto. Atención a
  `capacitor.config.ts`: no hay `server.url`, el bundle es local. Confírmalo en los proyectos
  nativos, no solo en el config de la raíz.

## 4. Apple · Privacidad

- **Etiquetas de privacidad (App Privacy) en App Store Connect.** Construye el **inventario real**
  de lo que la app recoge, leyendo `src/types.ts` y `src/db/`: identidad, correo, datos de salud
  (peso, perímetros, lesiones), fotos corporales, uso, y contenido de mensajes con la IA. Para cada
  uno: se recoge sí/no, se vincula a la identidad sí/no, se usa para seguimiento sí/no. Es un
  formulario que Dani tendrá que rellenar y **mentir ahí es causa de retirada**.
- **Guideline 5.1.2 — terceros.** El contexto del atleta viaja a **Anthropic** vía `api/ai-chat.ts`.
  Hay que declararlo y decidir si hace falta consentimiento explícito del atleta. Determina
  exactamente **qué campos** salen del sistema leyendo `src/ai/systemPrompt.ts` y `src/ai/tools.ts`.
- **Política de privacidad y términos.** Un `grep` de «privacidad»/«privacy» en `src/` da **cero
  resultados**: no hay enlace ni pantalla. La tienda exige una URL de política de privacidad, y
  con datos de salud conviene también tenerla accesible desde dentro. Verifica y propón dónde va
  (`ProfileScreen`, pie del `WelcomeScreen`).
- **RGPD** — clientes en España. Consentimiento para datos de salud, derecho de acceso y de
  supresión. Se solapa con el borrado de cuenta del punto 1; no lo dupliques, enlázalo.

## 5. Google Play

- **Formulario de Seguridad de los datos.** Equivalente al de Apple pero con su propia taxonomía y
  sus propias exigencias de cifrado en tránsito y de mecanismo de borrado. Reutiliza el inventario
  del punto 4 y tradúcelo a las categorías de Play.
- **Borrado de cuenta en Play.** Play pide, además del borrado desde la app, una **URL web pública
  de solicitud de borrado**, accesible sin instalar la app. Hoy no existe. Comprueba el requisito
  vigente y propón dónde se aloja.
- **`FOREGROUND_SERVICE_SPECIAL_USE`** (`android/app/src/main/AndroidManifest.xml:33`, servicio
  `RestTimerService`). Play revisa a mano este tipo de servicio y suele rechazarlo cuando existe
  un tipo estándar que encaja. Para una cuenta atrás de descanso, evalúa `shortService` u otra
  alternativa, y qué declaración hay que escribir en Play Console si se mantiene `specialUse`.
  Riesgo alto de rechazo.
- **`android:allowBackup="true"`** (`AndroidManifest.xml:4`) con datos de salud: la copia
  automática de Android sube datos de la app a la cuenta de Google del usuario. Evalúa el riesgo y
  si procede desactivarlo o limitar las reglas de backup.
- **Política de apps de salud y forma física**, y **política de contenido para menores** si el
  rating lo permite. Revisa qué declaraciones extra pide Play.
- **Nivel de API objetivo:** `targetSdk 36` en `android/variables.gradle`. Confirma que cumple el
  mínimo vigente de Play para nuevas apps en la fecha de subida.
- **Permisos declarados frente a permisos usados.** `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`,
  `POST_NOTIFICATIONS`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_SPECIAL_USE`. Cada uno que se
  declare y no se use es una pregunta más en la revisión.

## 6. Comunes

- **Idioma.** La app está 100 % en español, pero `ios/App/App/Info.plist` declara
  `CFBundleDevelopmentRegion = en`. Determina el efecto en la ficha de la tienda y en la
  localización, y qué idiomas se declaran en cada tienda.
- **Nombre, subtítulo, descripción y palabras clave** — sin promesas de resultados de salud que
  Apple penaliza, y sin mencionar otras plataformas.
- **Requisitos de la cuenta de desarrollador**: en Apple, una cuenta de empresa exige D-U-N-S; una
  individual publica a nombre de la persona. Con una app que trata datos de salud de clientes de
  pago, aclara cuál corresponde. Es decisión de Dani, pero condiciona plazos.

---

## Entregable

Escribe tu parte en `docs/revision-pre-store/informe.md` con ids `01-1`, `01-2`… Además, extrae a
`docs/revision-pre-store/checklist-dani.md` todo lo que solo pueda hacer Dani (formularios de las
consolas, cuentas de demo, decisiones de producto), agrupado por dónde se hace y diciendo qué se
rompe si no se hace.

Cierra con una **tabla de veredicto por guía**: guía · aplica sí/no · cumple sí/no/parcial ·
hallazgo asociado. Esa tabla es lo que se mira antes de darle a «Enviar para revisión».
