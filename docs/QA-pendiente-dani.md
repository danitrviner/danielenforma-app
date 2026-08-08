# Lo que queda y solo puede hacer Dani

Estado a 8 ago 2026, rama `ds/f3-experiencia`. Todo lo de abajo está fuera del alcance de
Claude: o exige una sesión iniciada, o es configuración de Firebase, o es una decisión.

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

## 2. Publicar el catálogo de máquinas

Las 63 máquinas están importadas pero **sin publicar**: es deliberado, el scraping no decide qué
entra en la app. Hasta que las publiques, ningún atleta ve el catálogo (el gate del onboarding se
aparta solo, así que no rompe nada).

Perfil → Ajustes → **Máquinas** → botón **«Publicar todas»**.

Antes de pulsarlo, si quieres, repasa la lista: están los nombres traducidos, la marca, la familia
y el grupo muscular de cada una, y cualquiera se puede renombrar o recategorizar desde ahí.

---

## 3. QA visual · lo que Claude no puede ver

Todo esto está detrás del login. En móvil, 375 px de ancho.

### Atleta
- [ ] **Punto rojo en la pestaña «Hoy»** cuando el catálogo de máquinas queda a medias. Omitir el
      catálogo en el onboarding y comprobar que aparece, y que desaparece al completarlo.
- [ ] **Perfil → Mi gimnasio**: que la lista salga con las fotos, que quitar una máquina funcione,
      y que «Añadir máquina que falta» suba una foto de verdad (esa escritura va a Storage y es la
      única del módulo sin respaldo local).

### Coach
- [ ] **Hub del atleta → tarjeta «Equipamiento»**, colapsada por defecto, sin robarle atención a
      los KPIs. Abrirla y ver el desglose por grupo muscular y la lista de «Sin máquina».
- [ ] **Hub → Análisis** en 375 px: que «Nutrición» y «Correlaciones» se lean **enteras**. Es lo
      último que queda por confirmar de P1-7 — la causa que describía el hallazgo ya no está en el
      código, pero no se ha vuelto a medir.
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
