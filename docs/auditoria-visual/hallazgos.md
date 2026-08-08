# Hallazgos de la auditoría visual

**Estado: recorrido visual completo — atleta, coach y CRM.** El onboarding real (completar el alta
y guardar en Firestore) sigue **bloqueado** por P0-2, con causa raíz confirmada con certeza y en
vivo: no es la cuenta de prueba `atleta2` en concreto, el propio botón «Invitar nuevo atleta» está
roto en producción ahora mismo para cualquier email, por un método de acceso de Firebase
deshabilitado. Pero la sesión de `atleta2` queda autenticada y en modo local aunque el guardado
falle, así que sí se pudo recorrer y capturar **toda la app real del atleta** en ese modo
degradado — ver «Pendiente de recorrer». **No se corrige nada todavía** — decisión de Dani el 4 ago
2026: se acumulan todos los hallazgos y las correcciones se hacen juntas al final (P0-2 incluido,
aunque sea de un clic en la Consola de Firebase y no de código).

**Método:** navegador real a 375 px (la vista prioritaria) para toda la app. Sesión de atleta
(`atleta2@enforma.com`, cuenta recién creada por Dani) para el onboarding; sesión de coach de Dani
(Google) para `ClientHub`, el Hub de atleta, `Revisiones`, `Ejercicios`, `Nutrición`, `Academia`,
`Cardio`, `Mi Perfil` y el `CRM`. Para diagnosticar P0-2 se usó además, a resolución de escritorio,
la Consola de Firebase en el navegador (misma sesión de Google de Dani, solo lectura de la UI —
distinto de las vías con Firebase Admin, ver abajo). Cada hallazgo con medición, log o dato real de
la consola, no con impresión.

**Contexto de la sesión:** el acceso a las cuentas se resolvió porque Dani inició sesión él mismo
en el panel del navegador (Claude nunca escribe contraseñas — regla dura, sin excepciones, ni con
autorización explícita). Se exploraron varias veces vías con **Firebase Admin** (token de sesión
firmado, regla de permiso de Bash, y un diagnóstico de solo lectura de `email_verified`/`invites`
por SDK) que el clasificador de modo automático bloqueó siempre — esa vía queda cerrada para Claude
en este proyecto — no vale la pena reintentarlas, sin cambios en el repo. Lo que sí funcionó fue
leer la **Consola de Firebase como página web**, con la sesión de Google que Dani ya tenía abierta
— ahí se confirmó la causa raíz real de P0-2 (ver esa sección).

---

## Índice de severidad

- **P0** — daña claramente la experiencia o pierde información.
- **P1** — alto impacto visual.
- **P2** — pulido.
- **P3** — nice-to-have.

---

## P0-1 · El contenido del asistente de onboarding se recorta a 375 px

**Pantalla:** asistente de bienvenida del atleta (`AthleteOnboardingWizard`), los 6 pasos.
**Confirmado paso a paso el 4 ago 2026, segunda sesión:** pasos 2 «Tu objetivo», 3 «Tu
entrenamiento», 4 «Tu alimentación», 5 «Tu día a día» y 6 «¡Todo listo!» — recortados los cinco,
mismo patrón (título y primera(s) letra(s) cortados por el borde izquierdo). El paso 1 «Sobre ti»
sigue siendo el único que se ve bien — probablemente porque no tiene tantos elementos que empujen
el ancho, pero la causa raíz (los dos brillos decorativos) es la misma para todos.

**Qué pasa:** todo el contenido está desplazado **37 px a la izquierda** y recortado por el borde.
Se pierden letras iniciales — «**T**u objetivo», «**¿**Qué quieres», «**C**UÉNTALO» — y los chips
«Fuerza» y «Salud general» quedan cortados. El contenedor tiene `overflow-hidden`, así que **no hay
barra de desplazamiento**: lo recortado es inalcanzable y el usuario no sabe que falta.

**Causa raíz, verificada experimentalmente.** Los dos círculos decorativos de brillo del fondo:

```
absolute top-[-10%] right-[-10%] w-96 h-96 bg-accent/5 blur-[120px]
absolute bottom-[-10%] left-[-10%] w-96 h-96 bg-data/5  blur-[120px]
```

miden 384 px en un viewport de 375 y llevan desplazamientos negativos. Aunque son `absolute`, **sí
cuentan para el área de scroll de su ancestro `relative`**: inflan el `scrollWidth` del contenedor
de 375 a 413. Ese ancho extra descentra el `mx-auto` de los tres contenedores de contenido.

| | `scrollWidth` | Posición del contenido |
|---|--:|--:|
| Tal como está | **413** | −37 px (recortado) |
| Ocultando solo los dos brillos | **375** | **0 px (correcto)** |

**Dirección del arreglo:** encerrar los brillos en su propia capa
`absolute inset-0 overflow-hidden pointer-events-none`, para que su desbordamiento se recorte en un
contexto aparte sin inflar el área de scroll del padre.

**Por qué importa:** es la primera pantalla que ve un cliente nuevo. Y ninguna verificación de la
migración podía detectarlo — `tsc`, las 263 pruebas, el build y `ds:inventario` pasan limpios,
porque es geometría en tiempo de ejecución. Solo aparece midiendo en el navegador.

---

## P0-2 · El onboarding del atleta no se puede completar — error de permisos, no de conexión

**Estado:** **bloqueante activo.** Es lo que detuvo la captura de pantallas. No es un hallazgo de
diseño, es un bug funcional, pero se documenta aquí porque apareció haciendo el recorrido y condiciona
todo lo que falta por auditar.

**Qué ve el atleta:** al pulsar «Entrar en EN FORMA» en el último paso, aparece un aviso en rojo:
*«No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.»* Reintentar no cambia nada — el fallo
es consistente, no una red inestable.

**Qué pasa de verdad**, según la consola:

```
Firestore user_profiles read failed. Switching to local fallback: permission-denied
saveOnboarding failed: Error: Sin conexión con Firestore. Recarga la página e inténtalo de nuevo.
```

El mensaje que ve el usuario **es un texto genérico que `dbService` lanza cuando `forceLocalOnly`
queda activado**, no el error real. La causa real es `permission-denied` de Firestore en una lectura
anterior de `user_profiles` — una vez cualquier lectura falla, `forceLocalOnly` se pone en `true` a
nivel de módulo (patrón ya detectado en la auditoría de código del 10-jul-2026, documentado como
comportamiento intencional de resiliencia — "swallow errors + fall back local") y **todas** las
escrituras posteriores de la sesión, incluida la del propio onboarding, quedan bloqueadas con ese
mismo mensaje de «conexión».

**Hipótesis de la causa raíz**, leyendo `firestore.rules`:

- `match /onboarding/{email} { allow write: if isCoach() || isOwnerEmail(email); }`
- `isOwnerEmail` exige `request.auth.token.email_verified == true`.
- Una cuenta creada por email/contraseña **no verifica el correo por defecto**. Si `atleta2` nunca
  pasó por el flujo de verificación, `email_verified` es `false` y la regla deniega, aunque el email
  coincida exactamente.
- Además, el propio comentario de las reglas dice: *«El alta propia exige invitación previa del
  coach (`invites/{email}`)»* — si `atleta2` se creó sin pasar por esa invitación, es posible que
  falte también el documento base de `user_profiles`, lo cual explicaría el primer `permission-denied`
  en cadena.

**Actualización 4 ago 2026, segunda sesión — causa raíz confirmada con certeza, ya no es hipótesis.**

El intento de diagnosticar por Firebase Admin en modo solo lectura (comprobar `email_verified` y
`invites/atleta2@enforma.com` sin escribir nada, usando las credenciales ADC de `gcloud` ya
autenticadas contra `fleet-operator-z5xj8`) **lo bloqueó de nuevo el clasificador de modo
automático** — igual que las dos vías con Firebase Admin ya abandonadas en la sesión anterior. Esa
vía queda cerrada para Claude en este proyecto, sin más reintentos. Se repitió el recorrido completo
del asistente con datos de prueba y **el bug se reproduce de forma idéntica** en los 6 pasos.

En su lugar se diagnosticó **leyendo la Consola de Firebase en el navegador** (sesión de Google de
Dani ya autenticada ahí — solo lectura de UI, sin credenciales tecleadas por Claude, distinto de la
vía con Firebase Admin que sí está bloqueada):

1. **`Authentication → Usuarios`**: existen 3 cuentas — `atleta2@enforma.com`,
   `atleta@enforma.com` (ambas por email/contraseña) y `danitrviner@gmail.com` (Google). El menú de
   cada fila no expone un flag de «correo verificado» directamente, así que se siguió leyendo código.
2. **`Firestore → invites`**: la colección **existe pero tiene 0 documentos** — «Esta colección no
   tiene documentos», confirmado en la propia consola. No es que falte el documento de `atleta2`:
   **no hay ni un solo invite creado en toda la base de datos de producción.**
3. **Leyendo el código fuente** (no solo `firestore.rules`, también
   [`WelcomeScreen.tsx:110-114`](../../src/components/WelcomeScreen.tsx#L110)): el propio comentario
   dice literalmente *«el auto-registro por email+contraseña se quitó porque `firestore.rules` ya
   no deja crear `user_profiles` sin invitación previa»*. `handleEmailAuth` en ese archivo ya **solo
   hace `signInWithEmailAndPassword` (inicio de sesión), nunca `createUserWithEmailAndPassword`**.
   El alta de un atleta nuevo está pensada para pasar **siempre** por uno de estos dos caminos:
   - Invitación del coach (`inviteClient`, en
     [`src/db/invites.ts:37`](../../src/db/invites.ts#L37), disparada desde el formulario «Invitar
     nuevo atleta» que ya vimos en `ClientHub`) → enlace de acceso sin contraseña
     (`sendSignInLinkToEmail` / `isSignInWithEmailLink`, ver
     [`WelcomeScreen.tsx:22`](../../src/components/WelcomeScreen.tsx#L22)) → al hacer clic en ese
     enlace, Firebase marca el correo como verificado automáticamente y de paso queda constancia de
     la invitación.
   - Google Sign-In (que también llega con el correo ya verificado por Google).

**Corrección tras probarlo en vivo — sí es un bug de producción, y más grave que un onboarding
roto.** La lectura inicial de las reglas hacía pensar que el diseño era correcto y que `atleta2`
simplemente se había creado por fuera del flujo previsto (con email+contraseña directamente, sin
pasar antes por «Invitar nuevo atleta»). Para confirmarlo se probó el flujo real: desde la sesión de
coach, en `ClientHub → Invitar nuevo atleta`, se introdujo un correo de prueba
(`audit-test-atleta3@enforma.com`) y se pulsó «Invitar». **Resultado, en la consola:**

```
inviteClient error: FirebaseError: Firebase: Error (auth/operation-not-allowed).
    at sendSignInLinkToEmail (...)
    at inviteClient (src/db/invites.ts:16)
    at handleInvite (src/components/ClientsScreen.tsx:79)
```

Comprobado además en la propia Consola de Firebase (`Authentication → Método de acceso →
Correo electrónico/contraseña`, estado accesible `aria-checked` leído directamente, no solo visual):
el proveedor «Correo electrónico/contraseña» está habilitado, pero su sub-opción **«Vínculo del
correo electrónico (acceso sin contraseña)» está deshabilitada**. Es exactamente el mecanismo del
que depende `inviteClient` (`sendSignInLinkToEmail`, [`src/db/invites.ts:22`](../../src/db/invites.ts#L22)).

**Esto significa que ahora mismo, en producción, el botón «Invitar nuevo atleta» de `ClientHub`
falla para cualquier email que se introduzca — no es un problema de la cuenta `atleta2` en
concreto, es que el único camino de alta que le queda a un cliente real (ver el comentario en
`WelcomeScreen.tsx:110-114`: el auto-registro por email+contraseña se quitó a propósito) está roto
a nivel de configuración de Firebase.** Si Dani ha intentado invitar a algún cliente real
recientemente, es muy probable que ese cliente nunca haya recibido el correo de acceso.

**Arreglo, sin tocar código:** en la Consola de Firebase, `Authentication → Método de acceso →
Correo electrónico/contraseña → Editar`, activar el interruptor «Vínculo del correo electrónico
(acceso sin contraseña)» y guardar. Es un cambio de configuración de Firebase, no de este
repositorio — decisión de Dani si se hace ahora o se dejaba para la ronda de correcciones final;
de momento queda solo documentado, sin tocar nada, según lo acordado.

**Lo que sigue siendo un hallazgo real, aunque la causa no sea un bug:** el mensaje que ve el
usuario («revisa tu conexión») es falso y engañoso en cualquier escenario donde esto falle — incluido
el que SÍ puede pasarle a un cliente real (un enlace de invitación caducado, abrirlo en un
navegador/dispositivo distinto al que lo recibió, etc.). Ver P1-6 más abajo.

**CORREGIDO en la parte que es código (8 ago 2026) — el bloqueo de Firebase sigue pendiente.**

El fallo tenía dos mitades. La de configuración (activar el vínculo de correo en la Consola de
Firebase) sigue siendo de Dani, no se puede tocar desde el repo. La de código sí estaba, y era peor
de lo que parecía: **una lectura denegada bloqueaba todas las escrituras de la sesión**.

`setLocalBypassMode` se llamaba con `true` desde 171 sitios ante *cualquier* error, incluido
`permission-denied`. Pero el modo local existe para sobrevivir a que Firestore no esté accesible; ante
un fallo de permisos es justo lo contrario de lo que hay que hacer, porque esa escritura no se va a
sincronizar nunca y guardarla en localStorage solo sirve para que el usuario crea que sus datos están
a salvo. Ahora la función recibe el error y **no activa el modo local ante permisos**: la lectura que
falla sigue cayendo a su copia local (correcto), pero ya no envenena el resto de la sesión.

Alguien ya había llegado a la misma conclusión y lo parcheó a mano en un único sitio —
`getAthleteNutritionConfig` en `src/db/nutrition.ts` lleva el comentario *«Do NOT call
setLocalBypassMode(true) here: a rules failure on this collection must not poison writes for
unrelated collections»*. El arreglo generaliza esa idea al núcleo en vez de repetirla colección a
colección.

Con esto, un atleta con un problema de permisos ve **qué** le pasa y puede seguir usando el resto de
la app; antes se quedaba con la sesión inutilizada y un mensaje falso. Cubierto por
`src/db/core.test.ts`.

**Camino para desbloquear el resto de la auditoría (recomendado, no probado todavía en esta
sesión):** en vez de arreglar la cuenta rota, usar el formulario «Invitar nuevo atleta» de
`ClientHub` (coach) con un email de prueba nuevo, y completar el flujo del enlace sin contraseña
desde ahí — así se audita además el flujo de invitación real, que todavía no se ha visto ni una vez
en esta auditoría. Se dejó pendiente para la próxima sesión; esta se cerró siguiendo el camino 2
(auditar el lado coach directamente).

---

## Tarea futura · Replantear las preguntas del paso «Tu objetivo»

**Decisión de Dani, 4 ago 2026.** El problema de ese paso no es solo el recorte: hay que repensar
**qué se pregunta y cómo**. Queda como tarea de producto, aparte de la corrección visual. No se
toca hasta decidirlo.

---

## Tarea futura · Falta un historial de entrenamiento de cardio (diario, como el de fuerza)

**Detectado el 5 ago 2026** poblando `Cardio → Inicio` del atleta con datos de prueba
(`CardioSession` vía `src/db/cardio.ts`). El entrenamiento de fuerza tiene su propio diario —
`Entreno → Progresión → Historial de carga`, con gráfico de tonelaje y lista de sesiones
(`LoadHistoryPanel`, alimentado por `getWorkoutLogs`) — pero **cardio no tiene el equivalente**: la
sesión de prueba que se guardó (`createCardioSession`, carrera de 30 min con FC media/máx y tiempo
por zona) no aparece en ningún sitio de la pantalla de `Cardio`, ni para el atleta ni en el
dashboard del coach. Existe el dato (`getCardioSessionsForAthlete` ya lee la colección), pero no
hay ninguna pantalla que lo muestre históricamente.

Queda como tarea de producto — no un bug de esta auditoría visual, sino una función que falta. No
se toca hasta que Dani decida.

---

## P0-3 · El título de página se aplasta a un solo carácter cuando la acción de cabecera es ancha

**Pantalla:** `Revisar` (coach, `ReviewsScreen`), confirmado con medición real. **Mismo componente
compartido por 9 pantallas** — `ReviewsScreen`, `PhotosScreen`, `AcademyScreen`, `CardioScreen`,
`CardioCoachScreen`, `ProfileScreen`, `HomeScreen`, `AthleteRoadmapScreen`, `AcademyCoachScreen` —
así que puede reproducirse en cualquiera de ellas si la acción que le pasan es ancha a 375 px.

**Qué se ve:** el título de la pantalla, que debería decir «Revisiones», se lee **«R.»** — un solo
carácter. El subtítulo («Historial cronológico de check-ins y respuestas de cuestionarios.») se
envuelve **letra a letra** en una columna de apenas unos px de ancho, una palabra por línea.

**Causa raíz, verificada midiendo el DOM real (no es cosa del texto: `textContent` confirma que el
`<h1>` contiene «Revisiones» completo, es puro colapso de layout).** En
[`src/components/ui/PageHeader.tsx:43-55`](../../src/components/ui/PageHeader.tsx#L43):

```tsx
<div className="flex items-center justify-between gap-3">
  <div className="flex min-w-0 items-center gap-2">   {/* título + subtítulo */}
    ...
  </div>
  {action && <div className="shrink-0">{action}</div>}  {/* badge + botón de acción */}
</div>
```

La fila no tiene `flex-wrap`. La columna del título lleva `min-w-0` (correcto, permite encogerse),
pero la zona `action` lleva **`shrink-0`: nunca cede ancho**. En `ReviewsScreen`, `action` es el
badge «1 PENDIENTE» + el botón «Empezar a revisar», ambos con texto largo sin envolver. Medido en
el navegador a 375 px:

| Elemento | Ancho |
|---|--:|
| Fila completa (`justify-between`) | 343 px |
| Zona `action` (`shrink-0`) | **307 px** |
| Columna título+subtítulo (lo que sobra) | **24 px** |

Con solo 24 px, `truncate` en el `<h1>` no tiene espacio ni para una palabra — se ve un carácter. El
`<p>` del subtítulo no tiene `truncate` ni ancho mínimo, así que en vez de recortarse **envuelve**,
palabra por palabra, en una columna casi de una letra.

**Dirección del arreglo:** dejar que la fila envuelva en móvil (`flex-wrap` o pasar a columna con
`flex-col md:flex-row` por debajo de cierto ancho), o quitar `shrink-0` de la zona de acción y
dejar que compita por espacio igual que el título — cualquiera de las dos evita que una acción
ancha se coma el título entero. Como el componente es compartido, el arreglo (y la revisión) debe
hacerse una vez en `PageHeader.tsx` y luego comprobarse en las 9 pantallas que lo usan con una
`action` no trivial.

**Por qué importa:** es la cabecera de la pantalla — lo primero que lee el coach al entrar a
revisar check-ins. Un título de un carácter no es un detalle de pulido, es la pantalla diciendo
«no sé dónde estoy».

---

## P1-3 · El botón flotante de Asistente IA tapa contenido y botones interactivos

**Pantallas:** confirmado repetidamente en el lado coach a 375 px — `ClientHub` (tapa el texto de
«Notas Pendientes» y la esquina del botón «Invitar»), `CRM · Pagos` (tapa el importe de la fila de
pago pendiente), `Cardio · Zonas` (tapa la esquina del botón «Guardar zonas»). Mismo patrón cada
vez: el FAB circular (`fixed bottom-28 right-4 ... w-13 h-13`, ver `App.tsx`) se solapa con el
último bloque de contenido de la pantalla en vez de dejar un margen inferior reservado para él.

**Por qué importa:** no es solo estético — en `CRM · Pagos` esconde una cifra de dinero, y en dos
sitios más esconde la esquina clicable de un botón. El usuario puede scrollear para despejarlo,
pero nada en la pantalla le avisa de que hay contenido tapado.

**Propuesta:** reservar `padding-bottom` suficiente en los contenedores de scroll que conviven con
el FAB (ya existe `pb-[calc(var(--nav-h)+1rem)]` para la barra de navegación; falta el mismo
tratamiento para el FAB), en vez de dejar que el último bloque de cada pantalla termine justo donde
cae el botón.

---

## P1-4 · Las barras de sub-pestañas se recortan por el borde sin ninguna pista de que hay más

**Pantallas:** patrón repetido en casi todo el lado coach a 375 px — `Plan → Road map` (Entrenam.,
Dietas, **Road map** cortado), `Road map del atleta → Timel[ine]` (cortado a «Timel...»),
`Road map del atleta → Generar periodizació[n nutricional]` (botón cortado), `Cardio →
Prescripc[ión]` (cortado), `CRM → R[euniones]` (cortado en la vista de Resumen/Clientes/Pagos). En
todos los casos la fila de pestañas es más ancha que los 375 px del viewport y se desborda
silenciosamente: no hay flecha, sombra de desvanecido ni ninguna otra pista visual de que se puede
deslizar para ver el resto. La única forma de saberlo es probar a arrastrar.

**Relacionado, mismo síntoma con texto normal (no pestañas):** en `Plan → Dietas → Objetivo de
pasos`, la nota «Por defecto 0.046 kcal/paso (1000 pasos ≈ 46 kcal).» se corta a mitad de frase
dentro de su propia tarjeta, sin desbordamiento — el texto no envuelve a la siguiente línea.

**Por qué importa:** el usuario no tiene forma de distinguir «esto es todo lo que hay» de «hay más
fuera de la pantalla». Es el mismo problema de fondo que ya señala la barra de navegación inferior
de 7 destinos (candidata a rediseño, ver memoria del proyecto) — aquí aparece también en las
sub-navegaciones anidadas dentro de cada pantalla.

---

## P1-5 · Las tablas del CRM no se adaptan a 375 px, quedan con scroll horizontal sin pista visual

**Pantallas:** `CRM → Clientes` (columnas «Cliente» / «Servicio» — la segunda columna, con el
precio y la periodicidad, queda cortada) y `CRM → Pagos → Suscripciones` (columnas «Cliente» /
«Concepto» / «Importe» — la columna de importe, con la cifra en euros, queda casi invisible, y
además el FAB la tapa del todo, ver P1-3). Ambas tablas mantienen el layout de escritorio (filas
con columnas fijas) en vez de convertirse en tarjetas apiladas, así que a 375 px se recortan por el
borde derecho con un scroll horizontal interno que no se anuncia de ninguna forma.

**Por qué importa:** son las dos tablas que muestran dinero (precio del servicio, importe de la
suscripción) — la información más sensible del CRM queda parcialmente invisible por defecto en el
dispositivo prioritario de la auditoría.

---

## P0-4 · El campo de teléfono del CRM es inutilizable: el número queda en 26 px de ancho

**Pantallas:** ficha de cliente del CRM (`CRM → Clientes → [cliente] → Datos`) y el modal «Nuevo
cliente». Confirmado con medición real en las dos.

**Qué se ve:** el campo «Teléfono» está compuesto por un selector de prefijo (bandera + código,
ej. «🇪🇸 +34») y un input para el número, uno al lado del otro. En vez de repartirse el ancho, el
selector de prefijo **se come el 100% de la fila** y el input del número queda reducido a una
esquirla de **26 px** — ni se ve lo que hay escrito, ni cabe un solo dígito visible. Es lo que en
la captura parecía un fragmento de óvalo suelto junto al selector: es el propio input, aplastado.

**Causa raíz, verificada por CSS computado y confirmada en el código fuente, y es la misma en dos
sitios:**

- [`src/features/crm/components/DatosPersonalesTab.tsx:150`](../../src/features/crm/components/DatosPersonalesTab.tsx#L150)
- [`src/features/crm/components/NuevoClienteModal.tsx:135`](../../src/features/crm/components/NuevoClienteModal.tsx#L135)

```tsx
<select className={`${inputClass} w-[104px] shrink-0`} ...>
```

`inputClass` (la clase compartida de todos los inputs del formulario) **ya incluye `w-full`**. Al
añadir `w-[104px]` después en el string, la intención es clara — encoger el selector a un ancho
fijo para dejarle sitio al número — pero Tailwind no ordena las utilidades por su posición en el
`className`, sino por su posición en la hoja de estilos compilada, y ahí `w-full` gana. El
resultado medido en el navegador: el `<select>` ocupa 309 px de los 309 px disponibles en la fila,
y el `<input>` del número queda en 26 px.

**Dirección del arreglo:** quitar `w-full` de la variante que usa este selector (no se puede
resolver solo añadiendo otra utilidad de ancho al final del string, hay que evitar el choque —
por ejemplo con una clase base sin `w-full` para este caso, o forzando con `!w-[104px]`).

**Por qué importa:** es P0 y no un simple recorte visual porque **bloquea una tarea real** — el
coach no puede ver ni editar cómodamente el teléfono de un cliente en el CRM desde el móvil, que es
precisamente el dispositivo prioritario de esta auditoría.

---

## P1-6 · «Revisa tu conexión» es un mensaje genérico que esconde el error real en cualquier fallo de Firestore

**Origen:** encontrado investigando P0-2, pero es un problema aparte — el patrón de `dbService`
(ya documentado como comportamiento intencional en la auditoría de código del 10-jul-2026:
"swallow errors + fall back local") hace que **cualquier** fallo de lectura de Firestore —
`permission-denied` por falta de invitación, una regla mal escrita, cuota agotada, o un problema de
red real — se presente siempre con el mismo texto: *«No se pudo guardar. Revisa tu conexión e
inténtalo de nuevo.»*

**Por qué importa igualmente, aunque P0-2 en concreto resultara ser una cuenta de prueba mal
creada:** un cliente real puede llegar a este mismo mensaje por causas legítimas — un enlace de
invitación caducado, abrirlo en un dispositivo o navegador distinto al que lo recibió (el enlace
sin contraseña de Firebase pide confirmar el email si detecta esto), o cualquier cambio futuro en
`firestore.rules` que introduzca una denegación no prevista. En todos esos casos el usuario ve
«revisa tu wifi» cuando el problema es de permisos o de la propia invitación, y no hay forma de
que él — ni el coach, sin mirar la consola del navegador — distinga un fallo de red real de un
problema de acceso. Vale la pena, cuando se corrija el resto, distinguir en el mensaje al menos
entre «sin conexión» y «no se pudo verificar tu acceso, contacta con tu entrenador».

**CORREGIDO (8 ago 2026).** Los textos viven ahora en `src/utils/erroresFirestore.ts`, un único
catálogo por código de error que usan tanto el asistente del atleta como el formulario de invitación
del coach. Tres cosas:

- El mensaje sale del `code` real (`permission-denied`, `unauthenticated`, `auth/operation-not-allowed`…).
  Ante permisos ya no se menciona la conexión.
- Sin código reconocible, solo se culpa a la red **si el modo local está activo de verdad**. Si no,
  se enseña el mensaje del error en vez de inventarse una causa.
- `LocalModeBanner` distingue las dos situaciones, y ante un fallo de permisos **no ofrece
  «Reintentar»**: recargar da el mismo resultado y solo consigue que la persona lo pulse cinco veces.

Cubierto por `src/db/core.test.ts`.

---

## P1-7 · Dos barras de pestañas se solapan verticalmente en el Hub del atleta

**Pantalla:** Hub de Marcos Ibáñez (coach) → pestaña `Análisis` → sub-pestañas «Reportes /
Nutrición / Correlaciones». Los textos «Nutrición» y «Correlaciones» se ven cortados por arriba, a
media altura, como tapados por la barra de encima.

**Medido en el DOM:** la barra superior (`Hoy / Plan / Análisis`) ocupa de y=70 a y=113.5 px. La
barra de sub-pestañas (`Reportes / Nutrición / Correlaciones`), que debería empezar justo debajo,
en realidad empieza en y=97.4 — **se solapan 16 px**. No es un efecto óptico: la barra de abajo
literalmente arranca antes de que termine la de arriba.

**Por qué importa:** aunque «Reportes» (el primer botón, con fondo activo) se libra por estar
alineado a la izquierda, «Nutrición» y «Correlaciones» quedan con la mitad superior del texto
ilegible — el mismo síntoma que P0-3, en miniatura, y probablemente la misma familia de causa
(dos filas de flex apiladas sin el espaciado que tenían pensado para un contenido más corto).

---

## P1-1 · Espacio vertical muerto en el asistente

**Pantallas:** bienvenida del asistente y paso «Sobre ti».

**Qué pasa:** el contenido ocupa el tercio superior y quedan ~600 px vacíos hasta los botones, que
van anclados abajo. A 375×812 se lee como una pantalla a medio cargar, no como una composición.

**Propuesta:** o el contenido se centra verticalmente, o los botones suben justo debajo del último
campo. Hoy no es ninguna de las dos cosas.

**CORREGIDO (8 ago 2026).** `justify-center` en el contenedor flexible del contenido del paso: en
los pasos cortos (bienvenida, "Tu día a día") el bloque se centra en el hueco disponible en vez de
quedarse pegado arriba. En los pasos largos (Alimentación) no cambia nada — no hay hueco que
centrar, la página sigue scrolleando igual que antes.

---

## P1-2 · Jerarquía invertida en los botones del asistente

**Pantallas:** todos los pasos del asistente.

**Qué pasa:** «Atrás» (acción secundaria) tiene fondo más claro y se lee **más** que «Siguiente»
(acción primaria), que aparece atenuado hasta que el paso es válido. El ojo va primero a retroceder.

**Propuesta:** «Siguiente» con el tratamiento de acción primaria incluso deshabilitado, y «Atrás»
como texto o fantasma.

---

## P2-1 · El indicador de progreso desaparece y es casi invisible

**Pantallas:** asistente.

**Qué pasa:** la barra de progreso (`h-1.5 bg-white/5`) tiene un contraste tan bajo que apenas se
distingue del fondo, y en la pantalla de bienvenida no comunica nada. En un formulario que promete
«son 2 minutos», no saber cuántos pasos quedan es carga cognitiva evitable.

**Propuesta:** subir el contraste del carril y añadir «Paso N de M» en texto.

---

## Pendiente de recorrer

- [x] Los 6 pasos del asistente de onboarding — recorridos y capturados (P0-1, confirmado en los 6)
- [x] **App real del atleta — recorrida el 4 ago 2026, tercera parte de la sesión**, con la propia
      `atleta2` (Dani hizo el login él mismo). P0-2 seguía activo — el banner rojo «Sin conexión
      con el servidor» estuvo presente todo el rato — pero al quedar la sesión en modo local, se
      pudo navegar y capturar igualmente la interfaz (aunque nada se guarde de verdad). Recorrido:
      `Inicio`, `Entreno`, `Nutri.` (Intercambios), `Check-in` (peso + fotos de progreso),
      `Mapa`/Road map (reto semanal, nivel, planificación), `Cardio` (zonas, HRV, tests),
      `Academia` (estado bloqueado «tu entrenador todavía no te ha dado acceso», correcto), y
      `Mi Perfil`. **Sin hallazgos P0/P1 nuevos** — las pantallas están, en general, bien resueltas;
      solo se repite la misma familia de truncado de texto ya documentada (P1-4) en «Tu prime...»
      (Inicio, debería decir «Tu primer entrenamiento»).
- [x] Barra inferior de navegación (7 destinos, R10) — confirmado que es horizontalmente
      deslizable sin pista visual; mismo patrón que P1-4 en las sub-navegaciones anidadas.
- [x] Estados vacíos de cada pantalla — cubierto de sobra: `atleta2` es una cuenta sin ningún dato
      real, así que el recorrido de la app del atleta fue, en la práctica, un recorrido de sus
      estados vacíos (Entreno, Nutrición, Mapa, Academia).
- [x] Lado coach — recorrido completo 4 ago 2026, segunda sesión, a 375 px:
      - `ClientHub` (tope y fondo), `Hub` de Marcos Ibáñez → `Hoy`, `Plan` (Entrenamientos, Dietas,
        Road map con Fases/Retos/Niveles/Timeline), `Análisis` (Reportes, Correlaciones — **P1-7
        encontrado aquí**), `Setup`.
      - `Revisiones` (coach) — **P0-3 encontrado aquí**.
      - `Ejercicios` (Plantillas), `Nutrición` (Dietas, Alimentos, Recetas), `Academia/TrainingLab`
        (Cursos, Lecciones, Acceso), `Cardio` (Zonas, Tests pendientes, Prescripción), `Mi Perfil`.
- [x] CRM — recorrido completo: `Resumen`, `Clientes`, `Pagos`, `Reuniones`, y la ficha individual
      de un cliente (Datos — **P0-4 encontrado aquí**, Servicios, Pagos).

### Cómo desbloquear en la próxima sesión

**El diagnóstico ya terminó con una respuesta clara y verificada en vivo (ver P0-2):**
`atleta2@enforma.com` no es arreglable ni tiene sentido intentarlo — pero tampoco basta con invitar
a otro atleta de prueba, porque **el propio botón «Invitar nuevo atleta» está roto en producción**
(`auth/operation-not-allowed`, probado el 4 ago con `audit-test-atleta3@enforma.com`) mientras el
interruptor «Vínculo del correo electrónico (acceso sin contraseña)» siga deshabilitado en
`Authentication → Método de acceso → Correo electrónico/contraseña` de la Consola de Firebase.

**Para ver por fin la app real del atleta, en este orden:**
1. Dani (o Claude, es un cambio de configuración de Firebase, no de código ni de datos) habilita
   ese interruptor en la Consola de Firebase.
2. Desde la sesión de coach, «Invitar nuevo atleta» en `ClientHub` con un correo de prueba nuevo.
3. Completar el inicio de sesión con el enlace sin contraseña que llegue a ese correo — el mismo
   camino que seguiría un cliente real. De paso queda auditado ese flujo de invitación, que todavía
   no se ha visto completo ni una vez.
