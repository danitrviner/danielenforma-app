# Plan de arreglos — rastreo en iPhone del 2026-08-18

**Para quien lo ejecute (Sonnet).** Este documento es la especificación completa.
Cada tarea trae: el síntoma que reportó Dani, la **causa raíz ya verificada en el
código** (con `fichero:línea`), qué hay que hacer y cómo comprobar que funciona.
No hay que volver a investigar: la investigación ya está hecha y las líneas están
comprobadas contra el árbol actual.

## Estado del repo al escribir esto

- Rama: `feat/nutricion-ux-fixes` (último commit `8d067ab`).
- Hay cambios **sin commitear** en `src/ai/*`, `src/components/AiChatPanel.tsx`,
  `src/db/coachSettings.ts`, `src/dbService.ts` y dos ficheros nuevos sin seguir
  (`src/ai/doctrina.ts`, `src/ai/doctrina.test.ts`) — es la doctrina IA editable.
  **No los descartes ni los commitees a la vez que estos arreglos.**
- Línea base verde y medida: `npx vitest run` → **49 ficheros, 503 tests**;
  `npx tsc --noEmit` → **sin errores**. Cualquier tanda que no mantenga eso está mal.

## Reglas de trabajo

1. **Un commit por tarea**, con el prefijo de la tarea (`fix(perfil): T1 …`).
   Así se puede revertir una sin tocar las demás.
2. Tras cada tarea: `npx tsc --noEmit` y `npx vitest run`. Ambos verdes o no se
   pasa a la siguiente.
3. **Donde ya haya un token del Design System, úsalo** (`var(--safe-top)`,
   `--header-h`, `--z-*`, `text-*`). Nada de píxeles a mano: la mitad de los bugs
   de esta lista son exactamente eso.
4. Los comentarios del repo explican *por qué* está algo así. Si vas a cambiar
   una línea con un comentario largo encima, lee el comentario primero: varias de
   estas líneas son arreglos anteriores y romperlas reabre bugs viejos.
5. **No inventes datos ni pantallas.** Si algo no se puede verificar desde aquí
   (estado real de Firestore, variables de Vercel), déjalo instrumentado para que
   Dani lo vea desde su móvil, no adivinado.
6. Lo que sea trabajo de Dani (activar algo en una consola, pulsar un botón en
   producción) va a `docs/QA-pendiente-dani.md`, no se finge hecho.

---

# TANDA 1 — Marco y layout (arregla varios síntomas de golpe)

Esta tanda primero porque **una sola causa raíz explica la mayoría de los
"descuadres"** que Dani reportó en tres pantallas distintas.

## T1 · El zoom de iOS descuadra el onboarding (y cualquier pantalla con campos)

**Síntoma.** «Las páginas del onboarding siguen descuadrándose y pudiéndose
aumentar, lo que las descuadra y jode la experiencia.» Mismo síntoma en el
onboarding de máquinas. En las capturas (5:35, 5:38) el contenido aparece
desplazado a la izquierda y con el título cortado (`obre ti (II)`,
`mentación`) — no es un fallo de flex: es la página **ampliada y desplazada**.

**Causa raíz (verificada).** Dos cosas, y la segunda es la de verdad:

1. `index.html:5` — el viewport es
   `width=device-width, initial-scale=1.0, viewport-fit=cover`. **No lleva
   `maximum-scale` ni `user-scalable`.**
2. `src/components/AthleteOnboardingWizard.tsx:126` — el `inputCls` que comparten
   todos los campos del wizard usa `text-body-s`, que en
   `src/index.css:118` son **13 px**. WKWebView **amplía la página sola** al
   enfocar un campo con fuente < 16 px, y al desenfocar **no la devuelve**. De
   ahí que se descuadre justo en los pasos con campos de texto, y que Dani lo
   viviera como "se puede aumentar".

Ojo: `zoomEnabled` de Capacitor ya está en `false` por defecto
(`node_modules/@capacitor/cli/dist/declarations.d.ts:71`), así que **no es el
pinch-zoom**: es el auto-zoom por foco. Por eso hay que atacar la fuente, no solo
el meta.

**Qué hacer.**

1. `index.html`: viewport →
   `width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover`.
   (En un WKWebView dentro de una app nativa `user-scalable=no` sí se respeta —
   es Safari móvil el que lo ignora.)
2. Red de seguridad en `src/index.css`, en la capa base, para que esto no vuelva
   a pasar en ninguna pantalla futura:
   ```css
   /* iOS amplía la página al enfocar un control con fuente < 16px y no la
      devuelve. Suelo de 16px en móvil para TODO control de formulario. */
   @media (max-width: 767px) {
     input:not([type='checkbox']):not([type='radio']),
     select,
     textarea {
       font-size: max(16px, 1em);
     }
   }
   ```
3. `AthleteOnboardingWizard.tsx:126`: `text-body-s` → `text-title-s` (16 px, ya
   es el tamaño que usa el `Input` del DS en `ui/Input.tsx:147`). Repasa también
   los `<textarea>` del wizard (líneas ~538, ~572, ~590, ~603, ~616).
4. Añade `zoomEnabled: false` **explícito** en `capacitor.config.ts` — es el
   valor por defecto, pero dejarlo escrito evita que un futuro `npx cap sync` con
   otra versión lo cambie sin que nadie se entere.

**Cómo verificar.** En el iPhone: entrar al alta, tocar cada campo de texto de
los pasos «Sobre ti (II)» y «Alimentación», escribir, y comprobar que la página
**no** cambia de escala y el título sigue completo. En web: DevTools móvil,
`document.documentElement.clientWidth` constante antes y después de enfocar.

**Riesgo.** `user-scalable=no` quita el zoom manual también a quien lo use por
accesibilidad. Es una app nativa con tipografía grande y contraste alto; lo damos
por aceptable, pero queda dicho.

## T2 · Desbordamiento horizontal global: por eso "se descuadra" el Road map, la matriz de series y las dietas

**Síntoma.** Tres reportes distintos que son el mismo bug:
- «Road map también está descuadrado» (captura 5:59: la fila de botones
  «Generar periodización nutricional / Guardar cambios» se sale por la derecha y
  la página está desplazada).
- Captura 6:39: la matriz de series por grupo muscular pinta encima de las
  pestañas y la columna fija queda desplazada.
- Captura 7:04: «Distribución en vivo» atraviesa las pestañas (esto además tiene
  su propia causa, ver T3).

**Causa raíz (verificada).** Tres capas, de más general a más concreta:

1. **`src/App.tsx:806`** — `<main className="flex-1 mt-0 md:mt-[var(--header-h)] … w-full">`.
   Es hijo de un contenedor `flex` (`App.tsx`, el `div` con
   `flex flex-col md:flex-row`) y **no lleva `min-w-0`**. Sin `min-w-0`, un hijo
   `flex` nunca se encoge por debajo del ancho `max-content` de su contenido: así
   que cualquier tabla o fila ancha de cualquier pantalla **infla el ancho del
   documento entero**. Y cuando el documento se desplaza en horizontal, las
   barras `sticky` (que solo fijan en vertical) se van con él: exactamente el
   desplazamiento de las pestañas que se ve en 6:39 y 5:59.
   El propio repo ya documenta este mismo error en vertical
   (`AthleteOnboardingWizard.tsx:444-447`, «el mismo bug que ya se vio en el CRM»).
2. **`src/components/roadmap/PlanPhaseEditor.tsx:198`** —
   `<div className="flex gap-2 flex-shrink-0 flex-wrap">` con tres botones dentro.
   `flex-shrink-0` + `flex-wrap` en el mismo elemento es contradictorio:
   `flex-shrink-0` fija el ancho al `max-content` (los tres botones en fila), así
   que **el wrap interno nunca se dispara** y el contenedor desborda. Es el mismo
   fallo que `PageHeader` ya arregló una vez (ver su comentario de cabecera).
3. **Colisión de capas.** `ClientHub.tsx:504` fija las dos filas de pestañas con
   `z-[var(--z-sticky)]` (= 10, `index.css`), y los paneles que se montan dentro
   usan **el mismo 10** en sus propios `sticky`
   (`MesocycleManager.tsx:437,462,510,526,540` y `NutritionPlansScreen.tsx:546`).
   A igualdad de z-index gana el que va después en el DOM → el contenido pinta
   **encima** de las pestañas.

**Qué hacer.**

1. `App.tsx:806`: añadir `min-w-0` y `overflow-x-clip` al `<main>`.
   **`overflow-x-clip`, no `overflow-x-hidden`**: `clip` no crea contenedor de
   scroll, así que los `position: sticky` de dentro siguen funcionando; `hidden`
   los rompería. Tailwind 4 lo soporta (el repo va en `tailwindcss ^4.1.14`).
2. `PlanPhaseEditor.tsx:198`: quitar `flex-shrink-0` (dejar `flex gap-2 flex-wrap`)
   y añadir `min-w-0` al párrafo hermano de la línea 195 si sigue empujando.
3. Nueva capa en `src/index.css`, junto a los `--z-*` existentes:
   ```
   --z-subnav: 20;  /* pestañas de zona/sub-zona de la ficha de cliente */
   ```
   Usarla en `ClientHub.tsx:504` (`z-[var(--z-subnav)]`) y dejar los `sticky` de
   los paneles en `z-[var(--z-sticky)]`. Regla que hay que escribir en el
   comentario: *dentro de la ficha de cliente, ningún panel sube por encima de
   `--z-sticky`.*
4. La matriz de `MesocycleManager.tsx:433` (`overflow-x-auto` con
   `minWidth: 130 + columnas*140`) es legítimamente ancha. Con el punto 1 ya deja
   de romper la página, pero **en móvil sigue siendo inusable**. Añade un modo
   móvil: por debajo de `sm`, en vez de la tabla, una lista de tarjetas por grupo
   muscular (una fila por grupo, con el `-`/número/`+` y el selector de prioridad
   del mesociclo **en edición** solamente, y las columnas históricas como texto
   `Meso #1: 5 · Meso #2: 11 ▲+6`). Los datos son los mismos; solo cambia la
   presentación. La tabla completa se queda para `sm` y arriba.

**Cómo verificar.** En el iPhone, en las tres pantallas (Plan › Entrenamientos,
Plan › Road map, Plan › Dietas): deslizar el dedo lateralmente sobre una zona
vacía y comprobar que **la página no se mueve en horizontal** y que las pestañas
se quedan clavadas al hacer scroll vertical. En consola:
`document.documentElement.scrollWidth === document.documentElement.clientWidth`.

## T3 · «Distribución en vivo» se superpone a los menús

**Síntoma.** «La distribución en vivo de las comidas se sobrepone a los menús y
lo atraviesa.» (Captura 7:04.)

**Causa raíz (verificada).** `src/components/NutritionPlansScreen.tsx:546`:
```
<div className="bg-bg border border-hairline rounded-surface p-4 sticky top-0 z-10">
```
Dos errores en una línea: `top-0` fija la barra al borde del viewport —o sea,
**debajo de la cabecera de la app y por encima de las pestañas** de `ClientHub`—
y `z-10` empata con las pestañas (ver T2 punto 3). Este editor se monta embebido
dentro de `ClientDietsPanel.tsx:95`, y ahí `top-0` no significa "arriba de mi
zona", significa "arriba de la pantalla".

**Qué hacer.**

1. `ClientHub.tsx`: medir la altura real del bloque `sticky` de pestañas con un
   `ref` + `ResizeObserver` y publicarla como variable CSS en el contenedor de
   contenido, en un `style` en línea: `--hub-sticky-top: calc(var(--header-h) + Npx)`,
   donde N es la altura medida.
   Se mide, no se escribe a mano: la segunda fila de sub-pestañas solo existe
   cuando la zona tiene más de una (`ClientHub.tsx:513`), así que la altura
   **cambia según la zona**.
2. `NutritionPlansScreen.tsx:546`: `sticky top-[var(--hub-sticky-top,0px)]
   z-[var(--z-sticky)]`. El fallback `0px` conserva el comportamiento cuando la
   pantalla se usa suelta (no embebida).
3. Asegurar fondo opaco (`bg-bg` ya lo es) y añadir `border-b` para que se lea
   como barra y no como tarjeta flotante.

**Cómo verificar.** Editar una dieta desde la ficha de un cliente en el móvil,
hacer scroll: la barra de intercambios se queda justo **debajo** de las pestañas,
sin taparlas, y nada del formulario se le ve por encima.

## T4 · El onboarding de máquinas se mete bajo la isla dinámica

**Síntoma.** «En el onboarding de las máquinas también se descuadra la página»
(captura 5:53: la cabecera `CUÁDRICEPS 37/63` y el botón de volver están debajo
del reloj del sistema).

**Causa raíz (verificada).** `src/features/gimnasio/CatalogoSwipe.tsx` usa
`min-h-screen … px-5 py-6` en sus cinco fases (líneas 90, 100, 149, 194, 218) y
**no reserva `var(--safe-top)` en ninguna**. Es el mismo bug que ya se corrigió
en el wizard de alta (07-3) y en `PlanEnEsperaScreen`, pero esta pantalla se
quedó fuera. Además `min-h-screen` (100 vh) es el patrón que el wizard cambió a
`h-[100dvh]` a propósito (ver comentario en `AthleteOnboardingWizard.tsx:397-404`).

**Qué hacer.** En las cinco fases de `CatalogoSwipe.tsx`:
- `min-h-screen` → `h-[100dvh] overflow-hidden` con el contenido en un hijo
  `flex-1 min-h-0 overflow-y-auto` (copia literal del patrón del wizard, que ya
  está probado).
- `py-6` → `pt-[calc(1.5rem+var(--safe-top))]` y
  `pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]` (los botones ✓/✗ y
  «Cerrar y continuar más tarde» de la línea 262 también están pegados al borde
  inferior en la captura).

**Cómo verificar.** En el iPhone, Perfil › Mi gimnasio › retomar el repaso: la
cabecera de categoría queda por debajo de la isla dinámica y los dos botones
redondos no tocan el borde inferior.

## T5 · La rueda de ajustes de «Mi Perfil»

**Síntoma.** «En "mi perfil" la ruleta de ajustes debería estar más arriba, a la
altura de "MI PERFIL". Así disminuimos el espacio entre "mi perfil" y el
resumen, progreso…»

**Causa raíz (verificada).** `ui/PageHeader.tsx:57` apila título y acción en
móvil (`flex-col … sm:flex-row`) — decisión correcta y deliberada para acciones
con **texto** (ver su comentario: a 375 px el título se quedaba en 23 px). Pero
la acción de Perfil es **un botón de solo icono** (`ProfileScreen.tsx:361`), que
no necesita renglón propio; y `ProfileScreen.tsx:353-363` ya intenta compensarlo
con un `wrapper` que solo alinea a la derecha. Encima, `space-y-6`
(`ProfileScreen.tsx:350`) mete 24 px entre cabecera y pestañas.

**Qué hacer.**

1. `ui/PageHeader.tsx`: añadir prop `actionInline?: boolean`. Cuando es `true`,
   la acción se renderiza **dentro** de la fila del título (el `div` de la línea
   58), con `ml-auto shrink-0`, en móvil y en escritorio. Sin tocar el
   comportamiento por defecto: las otras cuatro pantallas que usan `PageHeader`
   siguen igual.
2. `ProfileScreen.tsx:353-363`: pasar `actionInline` y **borrar** el `div`
   envoltorio `flex w-full justify-end sm:w-auto` (ya no hace falta) — pero
   conservar el `<span ref={settingsActionRef}>`: es el objetivo del paso 15 del
   tutorial (`features/tutorial/steps.ts`, `profile-settings-action`), y si
   desaparece ese paso del tour se queda sin recorte.
3. Bajar el aire: `space-y-6` → `space-y-4` en `ProfileScreen.tsx:350`, y en la
   cabecera `pb-4` → `pb-3` **solo cuando `actionInline`** (dentro de
   `PageHeader`, no con un override desde fuera).

**Cómo verificar.** Captura en el iPhone: el engranaje a la misma altura que
«MI PERFIL», y la fila «Resumen / Progreso / Road map…» claramente más arriba
que ahora. Comprobar que el tour (T8) sigue recortando ese engranaje.

---

# TANDA 2 — Flujo del atleta y datos del coach

## T6 · Consentimiento de IA: menos protagonista y sin decir algo que no es verdad

**Síntoma.** «Aceptar los términos de IA no se puede hacer de otra manera? Como
por ejemplo cuando te registras en la app accedes a todos los términos y
condiciones… que esté un poco más oculto. Que no diga directamente que se va a
usar la IA para programarles, porque no es verdad.»

**Lo que hay que decirle a Dani antes de tocar nada.** La segunda parte se hace
entera y es una mejora clara: el texto actual
(`AthleteOnboardingWizard.tsx:785-790`) promete algo que la app no hace («usa un
asistente de IA para preparar tus planes más rápido»), mientras la política de
privacidad ya dice lo correcto y más acotado
(`public/privacidad/index.html:191-206`: «revisar tu evolución y preparar tus
ajustes»). Eso se corrige.

La primera parte **no se puede hacer del todo**: lo que se manda a Anthropic
incluye lesiones, alergias, dolor y notas de check-in, o sea **datos de salud
(art. 9 RGPD)**. Para esos datos el consentimiento tiene que ser específico y
separado de la aceptación general de términos; esconderlo dentro de «acepto los
términos» lo invalidaría, y con él la base legal de todo el asistente. Todo esto
está razonado en `src/ai/consentimientoIA.ts` (cabecera) y es la razón de que el
sistema falle cerrado.

**Lo que sí se hace** (mismo efecto práctico —deja de ser una pantalla que
frena el alta— sin romper la base legal):

1. **Reescribir el copy** en los dos sitios, con el texto de la política:
   - `AthleteOnboardingWizard.tsx:783-800` y
   - `SolicitudConsentimientoIA.tsx` (título y cuerpo).
   Texto propuesto, corto y cierto:
   > **Revisión con apoyo de IA** — Tu entrenador puede usar un asistente de IA
   > para **revisar tu evolución** (entrenos, dieta y revisiones) cuando prepara
   > tus ajustes. Los planes los decide y los firma él. Para eso se enviarían
   > esos datos —incluidos lesiones y alergias— a **Anthropic PBC**, sin tu
   > nombre completo y sin usarse para entrenar sus modelos. ¿Nos dejas?
   > [Leer la política](/privacidad) · [No, gracias] [Sí, acepto]
2. **Bajarlo de rango visual, no esconderlo.** En el paso 12 del wizard, la
   tarjeta pasa de bloque destacado a **una fila discreta** con un interruptor
   apagado por defecto y un enlace «¿Qué es esto?» que abre el detalle completo
   en un `Sheet`. Se conserva: dos opciones del mismo peso, nada premarcado, y
   que se pueda entrar en la app **sin contestar** (`Ahora no` ya existe y no
   guarda nada). Nunca lo pongas dentro de una casilla de «acepto los términos».
3. **Que no vuelva a interrumpir.** `debePedirseConsentimiento()`
   (`consentimientoIA.ts`) ya no vuelve a preguntar a quien dijo que no; añade
   que a quien dejó «Ahora no» solo se le pregunte **desde Perfil › Ajustes ›
   Privacidad**, no otra vez a pantalla completa.
4. Enlace permanente en Perfil › Ajustes para cambiar la respuesta en cualquier
   momento (`ProfileScreen.tsx`, el `Sheet` de Ajustes, ~línea 400). Sube
   `VERSION_CONSENTIMIENTO_IA` **solo si cambias la finalidad**; un cambio de
   redacción a algo más acotado no la sube (si no, hay que volver a preguntar a
   todos y no hace falta).

**Cómo verificar.** Alta nueva completa sin tocar el interruptor → se entra en la
app y el asistente, al pedir datos de ese atleta, devuelve el motivo honesto de
`motivoParaElCoach()` en vez de un error. Y `npx vitest run src/ai/consentimientoIA.test.ts`
verde.

## T7 · Sala de espera: bloqueo real, botón de publicar y que el tutorial salte

**Síntoma (tres cosas en una).** «Cuando salta la pantalla de Dani está montando
tu plan, la parte de roadmap sigue funcionando y te permite ir por la app.
Después de que se pase esa pantalla tiene que saltar el tutorial de la app, que
no salta. Y habilita un botón desde coach para mostrarle el plan al atleta por
primera vez, luego que ese botón desaparezca para el cliente; solo aparezca con
los clientes nuevos que nunca han tenido un plan.»

### T7.a — La fuga de la sala de espera

**Causa raíz (verificada).** `PlanEnEsperaScreen.tsx:57-65` monta el
**`ProfileScreen` completo** para la vista «Ver mi anamnesis». Y ese `ProfileScreen`
trae sus cinco pestañas (`ProfileScreen.tsx:44-50`): Resumen, Progreso, Road map,
Preferencias y **Mi gimnasio**, más el `Sheet` de Ajustes. Por ahí se sale a media
app. Las otras dos vistas (`CheckInScreen`, `AthleteRoadmapScreen`) sí son
pantallas cerradas.

**Qué hacer.** Que la sala de espera **no monte `ProfileScreen`**. Extrae de
`ProfileScreen` el bloque «Mi ficha de iniciación» (con su botón *Editar* que
abre `OnboardingForm`) a un componente propio, p. ej.
`src/components/MiFichaCard.tsx`, y úsalo en los dos sitios: en `ProfileScreen`
(donde está hoy, sin cambio visible) y en `PlanEnEsperaScreen` para
`vista === 'perfil'`. Cero pestañas, cero ajustes, cero salida.

### T7.b — El botón «Mostrar el plan al atleta»

**Causa raíz (verificada).** Hoy la puerta se abre sola:
`App.tsx:419` → `hasPlan = tutorialGateAssignments.length > 0`, o sea **en cuanto
existe una sola asignación**. Dani no controla el momento. `HomeCoachScreen.tsx:80`
ya llama a eso «Plan sin publicar», pero es una deducción, no un estado.

**Qué hacer.**

1. `src/types.ts`, en `UserProfile`: `planPublishedAt?: string; // ISO, el día en
   que el coach le mostró su primer plan`.
2. `firestore.rules`: `planPublishedAt` **solo lo escribe el coach** — añádelo a
   la lista de campos bloqueados para el atleta que ya existe en el bloque
   `match /user_profiles/{userId}` (~líneas 95-142; misma lista que
   `planStartDate`/`role`). Si no, un atleta se abre su propio plan desde la
   consola del navegador.
3. `App.tsx`: `const planVisible = !!profile.planPublishedAt;` y
   `bloquearSinPlan = !cargandoPlanGate && !planVisible`. **Mantén `hasPlan`
   (asignaciones > 0) como señal separada**: es lo que decide si el coach puede
   pulsar el botón, y lo que alimenta el tour.
4. Botón en el panel de entrenamientos del cliente
   (`ClientWorkoutsPanel.tsx`, arriba, antes de la lista de asignaciones):
   visible **solo si** `assignments.length > 0 && !athlete.planPublishedAt`.
   Texto: «Mostrar el plan al atleta». Al pulsar: `updateUserProfile(userId,
   { planPublishedAt: new Date().toISOString() })`, `invalidateQueries(['userProfiles'])`,
   toast «Plan publicado. <nombre> ya puede verlo». Después desaparece para
   siempre, y no vuelve a salir aunque le montes el meso #7.
5. **Migración de los clientes actuales.** No hagas backfill automático: son 3
   atletas y un backfill silencioso puede publicar el plan a quien no toca. Deja
   que Dani pulse el botón una vez por cliente existente y **apúntalo en
   `docs/QA-pendiente-dani.md`**. Sin esto, los atletas que hoy ya entrenan
   volverían a la sala de espera al desplegar: es el único riesgo grave de esta
   tarea y hay que decirlo en el commit.

### T7.c — El tutorial no salta

**Causa raíz (verificada).** `features/tutorial/TutorialEngine.tsx:60-65`:
```js
if (!hasPlan || profile.tutorial) return;   // arranque automático
```
La condición es «tutorial **nunca tocado**», y el efecto de persistencia de la
línea 84-92 escribe `tutorial: { completado: false, pasoAlcanzado: N }` **en el
primer avance**. Resultado: si el tour se interrumpe una vez —cerrar la app, un
`hasPlan` que parpadeó, cualquier cosa— `profile.tutorial` ya existe, y **no
vuelve a arrancar jamás**. Y no hay puerta manual: `ProfileScreen.tsx:395-398`
dice explícitamente que «Repetir el tour» se dejó fuera. La cuenta de Dani está
justo en ese estado.

Segundo riesgo, latente: los pasos 4 y 10 (`REQUIRED_ACTION_STEPS` en
`tourReducer.ts:12`) **bloquean** el botón primario hasta que el atleta toca una
serie / una ingesta. Si ese objetivo no existe ese día (no hay sesión hoy), el
tour se queda encerrado sin salida en el primer pase.

**Qué hacer.**

1. `TutorialEngine.tsx:60-65` → arrancar/**reanudar** con
   `if (!planVisible || profile.tutorial?.completado) return;` y `stepIndex`
   inicial desde `pasoAlcanzado` (ya lo hace `initialTourState`). Dispara con
   `planVisible` de T7.b, no con `hasPlan`: el tour tiene que salir **justo
   después** de que Dani publique, que es lo que pidió.
2. Antibloqueo: en `TourOverlay`, si el objetivo del paso no aparece en ~2,5 s
   (`getRect` sigue devolviendo `null`), habilitar el primario con el texto
   «Continuar» y dejar avanzar. Un tour que encierra al atleta es peor que un
   tour incompleto.
3. Añadir «Ver el tutorial otra vez» en Perfil › Ajustes, llamando a
   `useTutorialEngine().restart()` (la API ya existe,
   `TutorialEngine.tsx:97-101`; solo falta el botón). Y borra el comentario de
   `ProfileScreen.tsx:395-398` que dice que no hay nada que repetir.
4. Test nuevo en `tourReducer.test.ts` (o uno de motor): «un tutorial con
   `completado:false` y `pasoAlcanzado:5` reanuda en el paso 5», y «un paso con
   acción obligatoria se desbloquea si el objetivo no aparece».

**Cómo verificar.** Con una cuenta de atleta que ya tenga `tutorial` a medias:
publicar el plan desde el coach → el tour arranca en el paso donde se quedó. Y en
la cuenta de Dani, que ya está atascada, comprobar que **arranca**.

## T8 · Perfiles borrados/bajas fuera de «Atletas», e invitaciones que se actualicen

**Síntoma.** «Los perfiles borrados o que se hayan dado de baja que no aparezcan
en atletas, que vayan a archivados o algo así pero que no molesten. Y las
invitaciones pendientes no se actualizan, la de danielbriz8 ya está aceptada hace
rato.» (Captura 5:58: `borrado_c337802d9d34 · Plan sin publicar` en HOME COACH y
«3 deportistas registrados».)

### T8.a — Los borrados

**Causa raíz (verificada).** `api/delete-account.ts:184-195` **anonimiza en vez
de borrar** (a propósito: el cuadro de mandos cuenta altas y bajas sobre esos
documentos) y deja marcados `anonimizado: true` y `estadoCrm: 'baja'`. Pero en
todo `src/` **nadie lee `anonimizado`** — comprobado: el único acierto del grep
está en un comentario de `EliminarCuentaDialog.tsx:24`. Así que el perfil
`borrado_…@anonimo.local` sigue apareciendo en todas las listas de atletas.

**Cuidado con el atajo.** No filtres dentro de `getAllUserProfiles`
(`src/db/profiles.ts:196`): el CRM la usa tal cual
(`features/crm/hooks/useClientes.ts:70-72`) y **necesita las bajas** para el
churn. Si filtras ahí, rompes el cuadro de mandos.

**Qué hacer.**

1. Nuevo `src/utils/atletas.ts` con dos funciones puras y su test:
   ```ts
   export const esAnonimizado = (p: UserProfile) => p.anonimizado === true;
   export const esBaja = (p: UserProfile) => p.estadoCrm === 'baja';
   /** Atletas que el coach entrena HOY. */
   export const atletasActivos = (ps: UserProfile[]) =>
     ps.filter(p => !esAnonimizado(p) && !esBaja(p));
   ```
   Añade `anonimizado?: boolean` y `anonimizadoEn?: string` a `UserProfile` en
   `types.ts` (hoy el campo existe en Firestore pero no en el tipo).
2. Aplicar `atletasActivos()` **en los consumidores de coach**, no en la capa de
   datos. Lista completa y verificada de sitios que hoy leen
   `queryKey: ['userProfiles']`:
   `ClientsScreen.tsx:34`, `ClientHub.tsx:135`, `CommandPalette.tsx:42`,
   `ReviewsScreen.tsx:30`, `MesocycleManager.tsx:630`,
   `NutritionPlansScreen.tsx:110`, `AcademyCoachScreen.tsx:263`,
   `CardioCoachScreen.tsx:46,134,208`. `HomeCoachScreen` recibe `athletes` por
   props desde `ClientsScreen`, así que se arregla solo.
   **No toques** `features/crm/hooks/useClientes.ts`.
3. «Archivados» en `ClientsScreen`: un `<details>` al final de la lista, cerrado,
   con las **bajas no anonimizadas** (nombre + fecha de baja + acceso a su ficha
   en modo lectura). Los anonimizados **no se listan en ningún sitio**: ya no
   tienen ni nombre ni datos, solo son una fila de estadística del CRM.

### T8.b — Las invitaciones pendientes

**Causa raíz (verificada).** Dos capas, y la primera es un bug de reglas:

1. `firestore.rules:494-499`:
   ```
   match /invites/{email} {
     allow read: if isCoach();
     allow update: if isCoach() || isOwnerEmail(email);
   ```
   El atleta **puede escribir** su invitación pero **no puede leerla**. Y
   `markInviteJoined()` (`src/db/invites.ts:121-127`) empieza con un
   `getDoc(...)` para comprobar el estado → `permission-denied` → el `catch` de
   la línea 128 se lo come en silencio (es «best-effort, never blocks») → la
   invitación **se queda `pending` para siempre**. Exactamente lo de danielbriz8.
2. Aunque se arregle, el panel del coach no tiene red: si esa única escritura
   falla por lo que sea, la invitación se queda colgada sin forma de limpiarla.

**Qué hacer.**

1. `firestore.rules:495`: `allow read: if isCoach() || isOwnerEmail(email);`.
   Un atleta leyendo **su propio** documento de invitación no abre nada: la regla
   ya restringe por email. Desplegar con `firebase deploy --only firestore:rules`
   (y añadir el caso al test de reglas del emulador,
   `src/db/reglas.emulador.test.ts`).
2. `src/db/invites.ts`: en `markInviteJoined`, si el `getDoc` falla por permisos,
   **intentar el `updateDoc` a ciegas** en vez de rendirse (la regla de `update`
   ya lo permite y la escritura es idempotente).
3. Red de seguridad en el panel
   (`features/crm/components/InvitacionesPendientesPanel.tsx:18-23`): cruzar las
   invitaciones con `['userProfiles']` y **no pintar** las que ya tengan un perfil
   con ese email; de paso, marcarlas como `joined` de forma perezosa desde la
   sesión del coach (que sí tiene permiso). Así una invitación aceptada
   desaparece de la lista incluso si el atleta nunca consiguió escribirla.
4. Botón «Cancelar invitación» junto a «Reenviar»: hoy una invitación errónea no
   se puede quitar de esa lista de ninguna manera.

**Cómo verificar.** Con las reglas desplegadas: dar de alta un correo de prueba,
entrar con él, y comprobar en el coach que la invitación **desaparece** de
pendientes. Y que `borrado_c337802d9d34` ya no sale ni en HOME COACH ni en el
contador de «deportistas registrados».

## T9 · El asistente de IA no funciona

**Síntoma.** «La IA no funciona.» Captura 6:15: se ejecutan tres tools
(`search_knowledge`, `get_exercise_library`, `propose_mesocycle`) y luego
**«No se pudo conectar con el asistente (¿proxy desplegado y VITE_AI_PROXY_URL
configurada?)»**.

**Lo que ese mensaje significa exactamente.** Sale de un único sitio:
`src/ai/aiClient.ts:38-47`, en el `catch` del `fetch`. O sea: **el `fetch` lanzó**
(fallo de red / CORS / conexión cortada), no fue una respuesta HTTP de error —
esas dan otros mensajes (líneas 63-71). Y lo importante: las tres tools son los
`tool_use` de **un mismo mensaje** del modelo, ejecutadas en local; lo que falló
es el **POST de la ronda siguiente**. La primera ronda sí llegó al proxy, así que
el despliegue existe y CORS funciona (`capacitor://localhost` está en la lista,
`api/_lib/auth.ts:83-94`).

**El defecto de código real, y por eso no se puede diagnosticar más.**
`aiClient.ts:44` es un `catch { }` **sin parámetro**: tira el error original a la
basura. Con eso es imposible distinguir CORS de un timeout, de estar sin
cobertura, o de la función de Vercel cortando la conexión. Lo primero es dejar de
tirar esa información.

**Qué hacer, en este orden.**

1. **Instrumentar `postToProxy`** (`aiClient.ts:38-47`):
   ```ts
   } catch (err) {
     console.error('[aiClient] fetch a', PROXY_URL, 'falló en la ronda', round, err);
     if (typeof navigator !== 'undefined' && navigator.onLine === false) {
       throw new Error('Sin conexión. El asistente necesita internet.');
     }
     throw new Error(
       `No se pudo conectar con el asistente (${(err as Error)?.message ?? 'error de red'}).`
     );
   }
   ```
   Pasa el número de ronda a `postToProxy` para que el mensaje diga en cuál cayó.
2. **Timeout explícito y un reintento.** `AbortController` a 65 s (el proxy
   declara `maxDuration: 60` en `api/ai-chat.ts:15`, así que sin timeout de
   cliente una función colgada deja el chat esperando para siempre), y **un**
   reintento con 1,5 s de espera si el fallo fue de red — no si fue un 4xx.
3. **Que un fallo a mitad de turno no tire el turno.** El bucle de
   `runAgentTurn` ya llama a `cb.onUpdate` en cada paso, así que el historial
   está a salvo; asegura que «Vuelve a intentarlo» **reanuda desde el último
   `messages`** en vez de reenviar el turno entero (verifícalo en
   `AiChatPanel.tsx`).
4. **Diagnóstico que Dani pueda ejecutar desde el móvil.** En el panel del
   asistente, dentro del menú de ajustes, un «Probar conexión» que haga un
   `OPTIONS` y un `POST` mínimo a `PROXY_URL` y muestre en claro: URL usada,
   código HTTP y cuerpo de error. Es la única forma de cerrar esto sin acceso a
   los logs de Vercel.
5. **Verificar en Vercel** (esto es de Dani, a `docs/QA-pendiente-dani.md`):
   `ANTHROPIC_API_KEY` y `FIREBASE_SERVICE_ACCOUNT` presentes en *Production*
   (sin la segunda, el contador de gasto es *fail-closed* y devuelve 503,
   `api/ai-chat.ts:86-89`), y que el contador diario
   `aiUsage/daily_<hoy>` no esté en el tope de 400 (`api/ai-chat.ts:20`).

**Cómo verificar.** Repetir en el iPhone el caso exacto de la captura (pedir un
mesociclo de 5 días con hernia torácica). Si vuelve a fallar, el mensaje nuevo
tiene que decir **qué** falló y en qué ronda. No cierres esta tarea con «parece
que ya va»: adjunta el mensaje real.

---

# TANDA 3 — Programación y nutrición

## T10 · Añadir «aductores» a los grupos musculares

**Síntoma.** «Hay que añadir aductores a los grupos musculares para programar.»

**⚠️ Peligro que hay que resolver ANTES de tocar el enum.** `Mesocycle.groups` es
un `Record<MuscleGroup, MuscleGroupConfig>` y el código lo lee **sin
comprobar**: `MesocycleManager.tsx:102,110,125,150,412,413,467,468,711` hacen
`groups[g].series` directo. Los mesociclos que ya están en Firestore **no
tendrán** la clave `aductores` → `undefined.series` → **TypeError y pantalla en
blanco en la ficha de todos los clientes**. `getMesocycles`
(`src/db/training.ts:836-852`) no normaliza nada.

**Qué hacer, en este orden estricto.**

1. **Primero el normalizador.** En `src/utils/` (o junto a los tipos), una
   función pura con test:
   ```ts
   export function normalizeMuscleGroups(
     groups: Partial<Record<MuscleGroup, MuscleGroupConfig>> | undefined
   ): Record<MuscleGroup, MuscleGroupConfig>  // rellena lo que falte con {series:0, priority:'media'}
   ```
   Aplicarla en `getMesocycles` y en `createMesocycle`/`updateMesocycle`
   (`db/training.ts`) para que **nada** salga de la capa de datos con huecos.
   Test: «un mesociclo antiguo sin la clave nueva se lee sin lanzar».
2. **Consolidar las cuatro listas duplicadas** (hoy hay que tocar el mismo enum
   en cinco sitios, y es justo por eso que esta tarea es cara): mover a
   `src/types.ts`, junto a `MUSCLE_LABELS` (línea 1110), un
   `export const MUSCLE_ORDER: MuscleGroup[]` y un
   `export const MUSCLE_LABELS_SHORT: Record<MuscleGroup, string>`; y borrar las
   copias locales de `MesocycleDashboard.tsx:18-31`, `MesocycleManager.tsx:25-30`,
   `MesocycleTemplateLibrary.tsx:18-35` y
   `ExerciseLibraryScreen.tsx:19-36` (esta última se llama
   `MACRO_MUSCLE_GROUPS`/`MACRO_MUSCLE_LABELS`).
3. **Añadir el grupo**: `types.ts:1104-1108` (enum, después de `gluteo`) y
   `MUSCLE_LABELS` → `aductores: 'Aductores'`; corto: `'Aduct.'`.
4. **Los sitios que enumeran el enum a mano** — todos verificados:
   - `src/ai/tools.ts:228` (lista de «Grupos válidos» en la descripción de la
     tool `propose_mesocycle`) y `tools.ts:209`.
   - `src/ai/systemPrompt.ts:21` (misma lista en el prompt).
   - `src/ai/doctrina.ts:41` (rangos de series por grupo — **pregúntale a Dani
     el rango de aductores**, no lo inventes; si no contesta, déjalo fuera de la
     línea y anótalo).
   - `src/db/training.ts:680-682` (mapa de normalización de texto libre →
     `MuscleGroup`): añade `'aductores'`, `'aductor'`, `'adductores'`.
   - `scripts/machines/categorias.ts:43`: hoy
     `[/glute|hip thrust|rear kick|abductor|adductor/i, 'gluteo']` mete **las dos**
     en glúteo. Separa: una regla `[/adductor|inner thigh/i, 'aductores']`
     **antes** de la de glúteo, y deja `abductor` en glúteo (la abducción es
     glúteo medio, eso está bien). En el catálogo actual solo hay máquinas
     `Abductor` (2, en `src/data/maquinas/technogym.json`), así que el cambio de
     datos es mínimo.
5. **Ejercicios.** La biblioteca semilla no tiene ejercicios de aductores; sí
   hay cuatro propuestos en `scripts/out/ejercicios-propuestos.json`. Sin al
   menos uno, el generador avisará «Sin ejercicios para Aductores»
   (`MesocycleManager.tsx:1470`) y no podrá programarlo. Añade uno o dos
   (aducción en máquina, aducción con polea) al catálogo, o **deja escrito en el
   commit que hay que crearlos desde Biblioteca › Ejercicios**.

**Cómo verificar.** `npx tsc --noEmit` (los `Record<MuscleGroup, …>` obligan a
completar todos los sitios: es la red de seguridad de esta tarea), tests verdes,
abrir un mesociclo **ya existente** de un cliente real y comprobar que no
explota y que «Aductores» aparece con 0 series.

## T11 · Cambiar ejercicios de un mesociclo, y el «top set / back-off»

**Síntoma.** «Cuando se ponen las vistas previas de las rutinas vamos a poner un
botón para cambiar y poder modificar los ejercicios de los mesociclos, por si hay
que hacer modificaciones a mitad o los ejercicios que propone la app no me
gustan. Además lo de top set y back-off no entiendo cómo está puesto. Solo tiene
que permitir hacer diferentes rangos de repeticiones dentro de un mismo
ejercicio.»

### T11.a — Cambiar el ejercicio

**Lo que ya hay (verificado).** En la vista previa
(`MesocycleManager.tsx:1494-1524`) se puede **quitar** un ejercicio (la `×`) y
**añadir** otro con un `<select>` que lista **la biblioteca entera** sin filtro.
Y en la pestaña «Ejercicios programados» (`MesoExercisesView`,
`MesocycleManager.tsx:332-400`), que es la que sirve para tocar un mesociclo **ya
asignado**, solo se puede editar la configuración: `onUpdateExercise` únicamente
aplica un `patch` — **no hay forma de cambiar, añadir ni quitar un ejercicio**.
Ese es el hueco real que describe Dani.

Dato que ayuda y que conviene saber: al asignar se crea **un `Workout` por día**,
reutilizado en todas las semanas (`MesocycleManager.tsx:906-928`), así que
cambiar un ejercicio ahí se aplica a las semanas restantes de una vez. No hay
duplicados que sincronizar.

**Qué hacer.**

1. Componente nuevo `src/components/ExercisePickerSheet.tsx` sobre el `Sheet` del
   DS: buscador + filtro por grupo muscular, **preseleccionado al grupo del
   ejercicio que se está cambiando**, y aviso «sin material» reutilizando la
   lógica de `equipmentMismatch` que ya calcula el generador.
2. En la vista previa: sustituir el `<select>` de la línea 1512 por un botón
   «+ Añadir ejercicio» que abra ese sheet, y añadir un botón **«Cambiar»** en
   cada tarjeta de ejercicio (junto a la `×` de la línea 1497) que abra el mismo
   sheet y **sustituya `exerciseId`/`muscleGroup` conservando series, reps, RIR,
   descanso, notas y técnica**.
3. En `MesoExercisesView`: los mismos tres botones (Cambiar / Añadir / Quitar).
   Hay que ampliar la API: `onUpdateExercise` se queda y se añaden
   `onReplaceExercise(group, exIdx, nuevoId)`, `onAddExercise(group, id)` y
   `onRemoveExercise(group, exIdx)`, que escriben el `Workout` del día con
   `updateWorkout` (ya importado en `MesocycleManager.tsx:10`) e invalidan
   `['workouts']`.
4. Aviso honesto en la UI: «se aplica a todas las semanas de este mesociclo; las
   sesiones ya completadas no se tocan». Antes de guardar, comprobar si hay
   `WorkoutLog` de ese día y decir cuántas sesiones ya registradas quedan con el
   ejercicio anterior — el histórico no se reescribe.

### T11.b — Los rangos de repeticiones

**Lo que ya hay (verificado).** El modelo `WorkoutSetGroup`
(`types.ts:344-349`) hace **exactamente** lo que Dani pide: bloques de series con
su propio rango de reps y su RIR dentro de un mismo ejercicio, y todo cuenta como
serie efectiva. Lo que está mal es **cómo se presenta**: un enlace de texto con
jerga (`ExerciseConfigEditor.tsx:85`: «Dividir en bloques (top set /
back-off)»), y un campo de texto libre «Etiqueta» con placeholder «Top set,
Back-off…» que obliga a inventarse un nombre. **No hay que cambiar el modelo de
datos, solo la interfaz** — así no hay migración ni riesgo.

**Qué hacer** (`src/components/ExerciseConfigEditor.tsx`):
1. Botón, no enlace: **«+ Añadir otro rango de reps»** (y en el estado con
   bloques, «Volver a un solo rango»). Fuera «top set», «back-off» y «bloques».
2. La etiqueta pasa a **opcional y sugerida**: un `Select` con
   `—` / `Pesado` / `Ligero` / `Al fallo`, con opción de escribir. Al crear el
   primer bloque, `label` va **vacío** (hoy `enableGroups` lo rellena con
   `'Top set'`, `ExerciseConfigEditor.tsx:20`).
3. **Resumen en vivo** encima de los bloques, que es lo que hace que se entienda
   de un vistazo: `4 series · 1×6-8 (RIR 1) + 3×10-12 (RIR 2)`. Se calcula de
   `setGroups` (`syncAggregateFromGroups` ya mantiene el agregado).
4. Que la suma cuadre visiblemente: si los bloques suman distinto que el campo
   «Series», enseñar el número real en vez de dejar dos verdades a la vez.

**Cómo verificar.** `npx vitest run src/utils/setGroups.test.ts src/utils/setPrefill.test.ts`
verde (esos tests fijan el comportamiento del modelo: si pasan, no se ha roto
nada), y en el móvil: crear un ejercicio con 1×6-8 + 3×10-12, asignar, y ver en
la sesión del atleta las filas etiquetadas correctamente.

## T12 · La dieta obedece a la periodización nutricional

**Síntoma.** «Cuando se está haciendo la dieta disponible con los intercambios,
el presupuesto tiene que hacer caso a la periodización de la nutrición, con los
diferentes bloques. A nada más. Toda la información que no sea la planificada en
esa periodización sobra. Habría que meterla en periodización para poder tener
todos los datos, pero una vez está la periodización bajo mi mano, es la que
manda. Por ejemplo lo de "referencia del atleta" no sé a qué hace referencia y
está ahí en medio. Cuando marquemos los objetivos por comida dentro de cada
comida que tenga en cuenta las preferencias sobre hambre del atleta. Y que marque
las discrepancias con lo planificado en la periodización.»

**Lo que ya existe y solo hay que conectar (verificado).**
- El vínculo dieta↔fase ya está: `NutritionPhase.dietId` (`types.ts:785`) y
  `resolvePhaseTargetKcal()` (`utils/nutritionPeriodization.ts:45-52`), que
  resuelve las kcal de una fase **desde el presupuesto de la dieta** o desde un
  `targetKcal` manual. Hoy la flecha apunta al revés de como Dani la quiere.
- **El perfil de hambre ya se usa**: `runAutoDistribute`
  (`NutritionPlansScreen.tsx:351-356`) ya pasa `hungerProfile` y `trainingSlot`
  a `distributeMealTargets`, con tests (`utils/mealDistribution.test.ts`). El
  problema es que **no se ve** que lo esté haciendo: la pista está en otra
  pantalla (`ClientDietsPanel.tsx:383-390`). Díselo a Dani así, no como si
  hubiera que construirlo.
- El aviso de descuadre por comida también existe (`targetMismatches`,
  `NutritionPlansScreen.tsx:571-583`), pero compara las comidas **contra el
  presupuesto de la dieta**, no contra la fase.

**Qué hacer** (todo en `NutritionPlansScreen.tsx`, más un `prop` nuevo):
1. Pasarle la periodización: `NutritionPlansScreen` recibe
   `nutritionProgram` + `activePhase` desde `ClientDietsPanel.tsx:95` (que ya
   tiene el panel de periodización montado justo debajo, línea 364, y puede
   leer el programa con `getNutritionProgram`).
2. **Cabecera de contexto** sustituyendo a «Referencia del atleta»
   (`NutritionPlansScreen.tsx:612-660`): una línea sobria arriba —
   `Fase 2 · Definición · semana 3 de 6 · objetivo 2 300 kcal (≈23 intercambios)`
   — con la fase como **fuente de la verdad**.
3. **El presupuesto obedece a la fase.** Junto al presupuesto
   (`NutritionPlansScreen.tsx:660-700`) el botón deja de ser «Prefijar desde
   macros» y pasa a **«Ajustar al objetivo de la fase»**, que reparte el
   `targetKcal` de la fase en HC/PROT/GRASA con el reparto de macros del atleta.
   Y si el presupuesto actual **no cuadra** con la fase, un aviso permanente:
   `Esta dieta suma 2 700 kcal y la fase pide 2 300 (+400)` con el botón para
   cuadrarlo. Se **avisa**, no se sobreescribe solo: es Dani quien decide.
4. **La «Referencia del atleta» se mueve, no se borra.** Ese bloque son el tipo
   de dieta, las kcal y macros del onboarding, los alimentos que no le gustan y
   **las alergias** — las alergias no pueden desaparecer de la vista de quien
   monta la comida. Mover alergias/no-le-gusta a una tira compacta **junto al
   selector de alimentos**, que es donde se necesitan, y el resto (kcal y macros
   del onboarding) al panel de periodización, que es donde se planifica. Deja
   dicho en el commit que las alergias siguen visibles y dónde.
5. **Hambre visible**: junto al botón «Repartir objetivos», el texto
   `Reparto según su hambre: por la noche · entreno cerca de la comida` leído de
   `nutConfig`, y si no hay perfil, `Sin perfil de hambre — reparto uniforme` con
   enlace a pedirlo. Cero cambios en el motor.
6. **Discrepancias contra la fase**: ampliar `targetMismatches` para que además
   compare el total de la dieta con `targetKcal` de la fase, y las kcal de cada
   comida con el reparto esperado. Etiqueta clara: `planificado` vs `puesto`.

**Cómo verificar.** Un atleta con periodización de 3 fases: abrir la dieta de la
fase 2 → la cabecera dice la fase correcta; poner un presupuesto que no cuadre →
sale el aviso con la diferencia exacta; pulsar «Ajustar al objetivo de la fase» →
el presupuesto cuadra y el aviso desaparece.

## T13 · Añadir alimento: pantalla completa y feedback

**Síntoma.** «Cuando se añaden alimentos tiene que dar feedback la app, como que
se ha añadido, que ponga un tick o algo — no da ninguno. Además que esa pantalla
ocupe TODO, que no se quede abajo porque no se aprovecha toda la pantalla, que es
muy incómodo.»

**Causa raíz (verificada).**
- `ui/Sheet.tsx:137` — el panel está limitado a `max-h-[85vh]`. Con la barra de
  filtros + modos + buscador en el `toolbar`, a la lista le queda un tercio de
  pantalla.
- `NutritionPlansScreen.tsx:390-403` — `handleSelectFood` añade el alimento y
  **cierra el sheet** (`setPickerMealId(null)`) sin toast ni marca. Y como cierra,
  añadir tres alimentos son tres viajes de ida y vuelta.

**Qué hacer.**
1. `ui/Sheet.tsx`: nuevo valor de tamaño, p. ej. `alto?: 'auto' | 'completo'`
   (por defecto `auto`, el de ahora). Con `completo`: `h-[100dvh] max-h-none`,
   sin `rounded-t-sheet` ni `sm:mb-6`, y relleno inferior
   `pb-[env(safe-area-inset-bottom)]`. El `pt-[var(--safe-top)]` del contenedor
   (línea 122) ya está bien.
2. Usarlo en los dos selectores de alimento: `NutritionPlansScreen.tsx:944`
   (coach) y `NutritionScreen.tsx:1931` (atleta).
3. `handleSelectFood`: **no cerrar**. En su lugar: `haptics` (el servicio ya
   existe, `src/services/haptics.ts`), toast corto «Añadido: <alimento>» con
   acción **Deshacer**, y en la fila de la lista una marca ✓ durante ~1,2 s con
   un contador `×2` si se añade repetido. Cerrar con el botón «Hecho» del footer
   del `Sheet`, que además diga cuántos se han añadido.
4. Mientras el sheet está abierto, enseñar en la cabecera del sheet el **estado
   del presupuesto de esa comida** (`2,5 / 4 HC`), que es lo que el coach está
   intentando cuadrar y ahora mismo queda tapado por el propio sheet.
5. De paso, alinear el selector del coach con el del atleta, que está más
   avanzado: `NutritionScreen.tsx:1931-1990` ya busca en **todas** las categorías
   y tiene `EmptyState`; el del coach (`NutritionPlansScreen.tsx:405-409`) filtra
   solo dentro de la categoría activa y enseña un `div` con texto en cursiva.

**Cómo verificar.** En el iPhone, añadir tres alimentos seguidos a una comida sin
que el panel se cierre, con tick y toast en cada uno, y que el panel ocupe la
pantalla entera.

## T14 · Alimentos duplicados

**Síntoma.** «Hay alimentos que se repiten, elimínalos.» Capturas 7:10 y 7:14:
`200ml gazpacho` dos veces en GRASA·OMNÍVORO y `200ml bebida de avena…` dos veces
en HC·OMNÍVORO.

**Causa raíz (verificada).** La semilla **no** tiene duplicados: lo comprobé
parseando `src/nutricion_seed_en_forma.ts` — 310 entradas, 310 combinaciones
`mode|category|label` únicas, cero repetidas. Los pares que se repiten por
`label` son `OMNIVORO` + `VEGANO` a propósito (un alimento vegano también vale
para un omnívoro) y el selector filtra por modo
(`NutritionPlansScreen.tsx:405-408`), así que **no son la causa**.

La causa está en `src/db/nutrition.ts:99-133`:
```js
const snap = await getDocs(collection(db, 'foodItems'));
if (snap.empty) {
  for (const item of seeded) { await addDoc(collection(db, 'foodItems'), …); }
}
```
`addDoc` (ID automático) + una guarda que solo mira «¿está vacía?» y **sin
transacción**: dos llamadas concurrentes (dos pantallas, o un recargar a mitad de
las 310 escrituras) leen ambas «vacía» y **siembran las dos** → 620 documentos y
todo duplicado. Los datos de producción ya están así; el código, tal cual, lo
volverá a hacer.
**El mismo patrón está en `seedExercisesIfEmpty`** (`src/db/training.ts:171-173`),
que además se llama en cada montaje de `ClientHub` (`ClientHub.tsx:202`): mismo
riesgo con los ejercicios.

**Qué es seguro y qué no.** Borrar documentos duplicados de `foodItems` **es
seguro**: las dietas guardan el alimento por texto, no por id — `DietItem` es
`{ category, foodLabel, quantity, grams }` (`handleSelectFood`,
`NutritionPlansScreen.tsx:392-397`). Ninguna dieta apunta a un `foodItems/{id}`.

**Qué hacer.**
1. **Que no se repita nunca más**: ID determinista en vez de `addDoc`.
   `setDoc(doc(db,'foodItems', idDe(f)), …)` con
   `idDe = f => `sys_${f.mode}_${f.category}_${slug(f.label)}`` (slug estable:
   minúsculas, sin acentos, no alfanumérico → `_`). Sembrar pasa a ser
   **idempotente**: correrlo dos veces sobreescribe, no duplica. Mismo cambio en
   `seedExercisesIfEmpty`.
2. **Limpiar lo que ya hay en producción, con Dani al mando.** En
   `FoodLibraryScreen` (coach), un bloque «Mantenimiento» que:
   - cuente y **liste** los duplicados agrupando por `mode|category|label`
     normalizado (recortar espacios, minúsculas, sin acentos);
   - enseñe cuántos se borrarían y **cuál se conserva** (el de ID determinista
     si existe; si no, el más antiguo);
   - borre solo al confirmar, y avise si no hay ninguno.
   Un `<button>` con confirmación, no un borrado automático al abrir la pantalla:
   es un borrado en producción y lo tiene que pulsar él.
3. **Test** del deduplicador como función pura
   (`src/utils/dedupeFoodItems.ts` + test): «dos docs con el mismo
   `mode|category|label` normalizado dejan uno», «etiquetas con acentos o espacios
   sobrantes se consideran la misma», «no toca dos alimentos que solo comparten
   `label` pero difieren en `mode`» (este último caso es el que **no** hay que
   borrar: `gazpacho` OMNÍVORO y `gazpacho` VEGANO son entradas legítimas).

**Cómo verificar.** Tras la limpieza, buscar «gazpacho» en el selector con modo
Omnívoro y ver **una** entrada; cambiar a Vegano y ver **una**. Y volver a
ejecutar la siembra a mano: el número de documentos no cambia.

## T15 · Las dietas nuevas se pierden enteras si se sale sin guardar

**Síntoma.** Pedido de Dani (18-08, fuera de las capturas): «que las dietas que
se creen se guarden como borrador, que no salgas y se elimine todo». Al montar
una dieta desde cero —añadir comidas, alimentos, presupuesto— si se sale de la
pantalla antes de pulsar «Guardar», todo el trabajo desaparece sin aviso.

**Causa raíz (verificada).** `NutritionPlansScreen.tsx` guarda la dieta que se
está editando **solo en estado local de React** (`form`, inicializado por
`blankForm()` en la línea 79 o por `openEdit()`/el `useEffect` de la línea
158-172 en modo embebido). **Nada toca Firestore hasta `handleSave`**
(línea 240): ni `createDiet` ni `updateDiet` se llaman antes de esa pulsación
explícita. Y `handleBack` (línea 275-278) descarta `form` sin preguntar ni
persistir nada — ni un `window.confirm`, ni un borrador. Si el coach cierra la
ficha del cliente, cambia de cliente, la app pasa a segundo plano y Capacitor
recicla el `WebView`, o simplemente pulsa «Volver» por error, se pierde todo sin
ninguna red.

Hay un dato que hace este arreglo barato: el tipo `Diet` **ya tiene**
`isDraft?: boolean` (`types.ts:758`), y ya se **respeta** en dos sitios sin que
nadie lo escriba nunca a `true` todavía: `utils/nutritionSummary.ts:12` excluye
los borradores del total «activo», y `ClientDietsPanel.tsx:158` ya pinta una
insignia de borrador si `dt.isDraft === true`. Es una pieza construida y sin
usar — exactamente la que hace falta aquí.

**Qué hacer** (todo en `NutritionPlansScreen.tsx`).

1. **Autoguardado con debounce.** Un `useEffect` que observe `form` (nombre,
   presupuesto, comidas) y, tras ~1,5 s de inactividad, persista:
   - Si `editingId` es `null` **y** hay algo que guardar (nombre no vacío, o al
     menos una comida con algún alimento, o presupuesto ≠ 0): `createDiet({
     ...data, isDraft: true })` **una sola vez**, y en cuanto responde, guardar
     el id devuelto en `editingId` — a partir de ahí todo autoguardado siguiente
     es un `updateDiet`, nunca un segundo `createDiet`. Usa un `ref` de
     "creando…" para que un segundo disparo del debounce mientras la primera
     escritura sigue en vuelo no cree un duplicado (mismo patrón de carrera que
     T14).
   - Si `editingId` ya existe: `updateDiet(editingId, { ...data, isDraft: true })`.
   - Nunca bloquea la interfaz ni muestra un `saving` global — es silencioso,
     como el autoguardado del borrador de alta
     (`utils/borradorAlta.ts`, que ya usa este mismo patrón en el wizard).
2. **`handleSave` deja de ser el único que escribe** — pasa a ser
   «confirmar»: hace el mismo `createDiet`/`updateDiet` de siempre pero con
   `isDraft: false`, y si el autoguardado ya creó el documento (`editingId` no
   es `null` aunque el coach nunca pulsó nada), usa `updateDiet` igualmente en
   vez de crear un segundo documento.
3. **`handleBack` ya no pierde nada, pero limpia lo vacío.** Si el borrador
   autoguardado no tiene nombre **ni** ningún alimento en ninguna comida, se
   borra con `deleteDiet(editingId)` antes de salir — así no se acumulan
   borradores fantasma de cada vez que alguien entra y sale sin querer editar
   nada. Si tiene contenido, se deja tal cual (`isDraft: true`) y no hace falta
   ningún diálogo de confirmación: ya está a salvo.
4. **Que se pueda retomar.** La lista de dietas (`ClientDietsPanel`, la vista
   `list` de este mismo componente) ya distingue visualmente los borradores
   (`ClientDietsPanel.tsx:158`); comprueba que `openEdit()` los abre igual que a
   cualquier dieta — no debería hacer falta tocar nada ahí, pero verifícalo.
5. **`WeeklyMenuEditor`** (el generador de menús semanales, otro editor grande
   de `ClientDietsPanel.tsx`) tiene la misma forma de bug por la misma razón
   —estado local sin persistir hasta guardar—, pero es un flujo distinto (genera
   recetas, no dietas por intercambios) y Dani no lo mencionó. Queda **fuera de
   esta tarea**; anótalo en el commit como candidato a la misma cura si hace
   falta más adelante.

**Cómo verificar.** Abrir «Nueva dieta», escribir el nombre y añadir dos
alimentos a una comida, esperar 2 s, y **sin pulsar Guardar** salir de la ficha
del cliente. Volver a entrar: la dieta está ahí, marcada como borrador, con el
nombre y los dos alimentos. Repetir sin escribir nada y salir enseguida:
no debe quedar ningún documento nuevo en `diets` (compruébalo en el emulador o
con `getDietsForAthlete` en consola). `npx vitest run
src/utils/nutritionSummary.test.ts` sigue en verde (ya fija que un borrador no
cuenta como dieta activa).

---

# Mejoras que propongo de propina (opcionales, di lo que cuestan antes de hacerlas)

1. **`overflow-x` como red permanente.** Un test de humo con Playwright (ya se
   usa en este proyecto para el lado atleta) que recorra las pantallas
   principales a 390 px y falle si
   `document.documentElement.scrollWidth > clientWidth`. Es el bug que ha vuelto
   tres veces; merece un guardia.
2. **`--z-*` obligatorio.** Un test que haga grep de `z-[0-9]` literal en `src/`
   y falle: la colisión de T2/T3 nació de dos `z-10` escritos a mano. El repo ya
   tiene los tokens; falta que nadie pueda saltárselos.
3. **`estadoCrm: 'pausado'`** en la lista de «Archivados» de T8 con una etiqueta
   distinta a «baja» — un cliente pausado no es una baja y ahora mismo los dos
   ensucian la lista igual.
4. **El contador «N deportistas registrados»** (`AthletesBar.tsx:44`) debería
   decir explícitamente «activos» una vez T8 filtre, para que no parezca que se
   han perdido clientes.
5. **Aviso de sesión sin plan visible**: si Dani asigna un mesociclo y no pulsa
   «Mostrar el plan al atleta» (T7.b), ese cliente se queda en la sala de espera
   sin que nadie lo note. En HOME COACH, la fila «Plan sin publicar»
   (`HomeCoachScreen.tsx:80`) ya está: cámbiale el texto a «Plan montado, sin
   mostrar al atleta» cuando `assignments.length > 0 && !planPublishedAt`. Es
   distinto de «no hay plan» y ahora se dirían igual.

# Orden de ejecución recomendado

```
Tanda 1 (marco):        T1 → T2 → T3 → T4 → T5
Tanda 2 (atleta/coach): T8 → T7 → T6 → T9
Tanda 3 (programación): T10 → T14 → T13 → T15 → T11 → T12
```

`T2` antes que `T3` (la causa general antes que la concreta). `T8` antes que `T7`
(ver la lista de atletas limpia hace mucho más fácil probar la publicación del
plan). `T10` antes que `T11`/`T12` (el enum toca ficheros que esas dos tareas
también tocan, y el normalizador de grupos es un prerequisito). `T14` antes que
`T13` (limpiar los duplicados antes de rehacer el selector que los enseña).

# Cierre de cada tanda

- `npx tsc --noEmit` y `npx vitest run` verdes (referencia: 503 tests).
- Comprobación en el **iPhone real**, no solo en el navegador: casi todos estos
  bugs son de safe area, `dvh` o zoom de WKWebView, y no se reproducen en
  escritorio.
- Lo que quede en manos de Dani (desplegar reglas, variables de Vercel, pulsar
  «Mostrar el plan» en los 3 clientes actuales, limpiar duplicados en
  producción) va a `docs/QA-pendiente-dani.md` con su comando exacto.
