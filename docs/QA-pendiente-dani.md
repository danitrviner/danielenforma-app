# Lo que queda y solo puede hacer Dani

Estado a 8 ago 2026, rama `ds/f3-experiencia`. Todo lo de abajo está fuera del alcance de
Claude: o exige una sesión iniciada, o es configuración de Firebase, o es una decisión.

---

## ~~1. Desplegar las reglas de Firestore~~ — HECHO el 8 ago 2026

Desplegadas y verificadas: los `permission-denied` de `gimnasios`, `maquinas` y `bodyMeasurements`
han desaparecido y el aviso rojo ya no aparece.

Al revisarlas antes de subirlas apareció un agujero que venía del merge de cuestionarios:
`bodyMeasurements` comparaba el email pero **no exigía `email_verified`**, así que bastaba
registrarse con el correo de otra persona para leer y escribir sus mediciones. Corregido antes del
deploy (commit `9d4a337`).

Afecta a tres colecciones y a las dos funciones nuevas enteras:

| Colección | Escrita en | Qué queda roto sin desplegar |
|---|---|---|
| `maquinas` | `fcf08cb` (7 ago) | El catálogo no se lee ni se publica |
| `gimnasios` | `fcf08cb` (7 ago) | El atleta no puede guardar qué máquinas tiene |
| `bodyMeasurements` | `5ed238b` (8 ago) | Las mediciones corporales no se guardan |

Va antes que publicar el catálogo (punto 2): sin las reglas, «Publicar todas» tampoco puede
escribir. Y `storage` también, por la regla de `gymPhotos` para las fotos de máquinas propias.

---

## 1. BLOQUEANTE · Activar el enlace de correo en Firebase

**Sin esto no se puede dar de alta a ningún cliente nuevo.** No es un bug del repo.

Consola de Firebase → `Authentication` → `Método de acceso` → `Correo electrónico/contraseña`
→ `Editar` → activar **«Vínculo del correo electrónico (acceso sin contraseña)»** → Guardar.

Por qué es bloqueante: el auto-registro por email+contraseña se quitó a propósito
(`WelcomeScreen.tsx:110-114`), así que el único camino de alta es la invitación del coach, que
usa `sendSignInLinkToEmail`. Ahora mismo falla con `auth/operation-not-allowed` para cualquier
correo. **Si has invitado a algún cliente real estas semanas, probablemente nunca recibió el
correo.** Merece la pena repasar a quién invitaste y volver a hacerlo.

Detalle completo en `docs/auditoria-visual/hallazgos.md` § P0-2.

---

## ~~2. Publicar el catálogo de máquinas~~ — HECHO el 8 ago 2026

Las 63 están publicadas y verificadas contra Firestore: 63 documentos en `maquinas`, todos con
`publicadoEn` y `visible`, y `getCatalogoMaquinas()` devuelve las 63 repartidas en 13 categorías.
El módulo ya funciona de punta a punta.

Cualquiera se puede renombrar, recategorizar, cambiar de imagen u ocultar desde Perfil → Ajustes →
Entrenadores → **Máquinas**.

---

## 3. QA visual · lo que Claude no puede ver

Todo esto está detrás del login. En móvil, 375 px de ancho.

### Atleta — ya se puede probar, el catálogo está publicado
- [ ] **Punto rojo en la pestaña «Hoy»** cuando el catálogo de máquinas queda a medias. Omitir el
      catálogo en el onboarding y comprobar que aparece, y que desaparece al completarlo.
- [ ] **Perfil → Mi gimnasio**: que la lista salga con las fotos, que quitar una máquina funcione,
      y que «Añadir máquina que falta» suba una foto de verdad (esa escritura va a Storage y es la
      única del módulo sin respaldo local).

### Coach
- [ ] **Hub del atleta → tarjeta «Equipamiento»**, colapsada por defecto, sin robarle atención a
      los KPIs. Abrirla y ver el desglose por grupo muscular y la lista de «Sin máquina».
- [x] ~~**Hub → Análisis** en 375 px (P1-7)~~ — CONFIRMADO el 8 ago: 8 px de separación entre las
      dos barras, ambas legibles. Medido en el DOM de la pantalla real.
- [ ] **Perfil → Ajustes → Máquinas**: renombrar una, cambiarle la imagen, ocultarla, y añadir una
      a mano.
- [ ] **Invitar nuevo atleta** — solo tiene sentido después del punto 1.

---

## 4. RESUELTO · El worktree de cuestionarios ya está integrado

Se integró el 8 ago 2026 (merge `6125521`). Las ~1.000 líneas que estaban sin commitear en
`/Users/dani/en-forma-cuestionarios` viven ya en `ds/f3-experiencia`: motor de programación,
mediciones corporales, correlación de series y extras de informes.

De paso apareció un hueco que ninguna de las dos ramas veía por separado: las preguntas de medición
corporal (`metric`) y de archivo (`media`) no las renderizaba el `QuestionnaireWizard` que sustituyó
al formulario anterior, así que habrían salido **en blanco** para el atleta. Portado.

Los respaldos (`/Users/dani/respaldo-cuestionarios-2026-08-08.*`) se pueden borrar cuando quieras.
El worktree ya no tiene nada suelto; si no vas a seguir trabajando ahí, se quita con
`git worktree remove ../en-forma-cuestionarios`.

Queda registrada, en `docs/DS-migracion.md`, la deuda de diseño heredada de esa rama: 53 hex
literales en 6 ficheros del coach. No se migró en el merge porque `#fbcb1a` es el oro anterior y el
token `accent` vale `#FFC72C` — sustituirlos cambia el color, y eso es una decisión de diseño con
revisión visual, no trabajo de integración.

---

## 5. Decisiones tuyas, no tareas

- **Fusionar a `main`.** `ds/f3-experiencia` ya está en origin. Cuando la des por buena, queda
  abrir el PR: https://github.com/danitrviner/danielenforma-app/pull/new/ds/f3-experiencia
- **Relación máquina→ejercicio.** Diseñada y documentada (`docs/catalogo-maquinas.md`), sin
  implementar. Es lo que haría que el generador de entrenamientos use el equipamiento real del
  atleta — o sea, lo que le da valor de verdad al catálogo.
- **Dos «tareas futuras»** que salieron de la auditoría y siguen sin decidir: replantear las
  preguntas del paso «Tu objetivo», y el historial de cardio en diario (como el de fuerza).

---

## Estado del repo

`tsc` limpio · 384 pruebas · `build` correcto · `ds:inventario` sin regresiones · árbol limpio ·
`ds/f3-experiencia` pusheada a origin.

Los 12 hallazgos con severidad de la auditoría visual (P0-1 a P2-1) están corregidos, salvo la
mitad de configuración de P0-2 (punto 1 de este documento) y la confirmación en DOM de P1-7.

---

## 6. Plan de arreglos 18-08-2026 (`docs/plan-arreglos-2026-08-18.md`, rama `feat/nutricion-ux-fixes`)

Se va actualizando a medida que se ejecuta el plan. Nada de esto lo puede hacer Claude por ti.

- [ ] **Desplegar las reglas de Firestore** (T7, T8):
  `firebase deploy --only firestore:rules`. Sin esto:
  - las invitaciones pendientes de tus clientes actuales seguirán sin actualizarse (T8.b) —
    incluida la de `danielbriz8`;
  - `planPublishedAt` no está protegido todavía (T7.b) — un atleta podría escribírselo él mismo
    desde la consola del navegador hasta que despliegues.
  Verificado en el emulador (17 pruebas verdes, `npm run test:reglas`), no en producción.

- [ ] **Pulsar "Mostrar el plan al atleta" en tus 3 clientes actuales** (T7.b), uno por uno, desde
  la ficha de cada uno → pestaña Entrenamientos. **Hazlo el mismo día que despliegues esta rama, no
  antes ni mucho después**: en cuanto se despliegue, la puerta de la sala de espera pasa de "¿hay
  asignaciones?" a "¿el coach pulsó el botón?", y los 3 atletas que ya entrenan hoy volverían a la
  sala de espera hasta que lo hagas. No hay backfill automático a propósito — un backfill silencioso
  podría publicar el plan a quien no toca.

- [x] ~~**Verificar en Vercel**~~ — CONFIRMADO el 18 ago vía `vercel env ls production`:
  `ANTHROPIC_API_KEY` (38 días) y `FIREBASE_SERVICE_ACCOUNT` (6 días) están las dos en *Production*.
  Descarta el 503 fail-closed por falta de service account.
  - [ ] Queda por mirar tú: el contador diario `aiUsage/daily_<hoy>` en tu Firestore real (colección
    `aiUsage`) no esté en el tope de 400 llamadas — este entorno no tiene acceso a tu proyecto real
    de Firestore, solo a Vercel, así que esto no lo pude comprobar yo.
  Con las reglas desplegadas, usa el botón nuevo "Probar conexión" (icono 🌐 en la cabecera del
  panel del asistente) desde el móvil si el asistente vuelve a fallar — te enseña la URL, el código
  HTTP y el cuerpo de error reales, no un mensaje genérico.

- [ ] **Limpiar los alimentos duplicados en producción** (T14): Biblioteca › Alimentos → el icono
  📋 junto al buscador (con el número de duplicados en rojo si hay alguno) → revisa la lista →
  "Eliminar N duplicados". Es un borrado real en Firestore; solo tú puedes confirmarlo.

- [ ] **Dar el rango de series de aductores** (T10): `src/ai/doctrina.ts` tiene el rango de series
  semanales de los otros 14 grupos musculares pero no el de aductores — se dejó fuera a propósito
  en vez de inventarlo. Dime el número (algo tipo "8-12") y lo añado a la línea de doctrina.

- [ ] **Crear 1-2 ejercicios de aductores** (T10): la biblioteca semilla no tiene ninguno. Sin esto
  el generador de mesociclos avisará "Sin ejercicios para Aductores" al programar ese grupo.
  Biblioteca › Ejercicios → Añadir (ej. "Aducción en máquina", "Aducción con polea").

- [ ] **Compilar y probar en tu iPhone** — la mayoría de los arreglos de la Tanda 1 (zoom de iOS,
  safe area, `dvh`) son de comportamiento de WKWebView que no se reproduce en el navegador de
  escritorio. `npx cap sync ios` y compilar desde Xcode.
