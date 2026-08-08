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

## 4. RIESGO · El worktree de cuestionarios se ha quedado descolgado

En `/Users/dani/en-forma-cuestionarios` (rama `feat/cuestionarios`) hay **34 ficheros con
cambios sin commitear**: unas 1.000 líneas de trabajo real en curso — un motor de programación
(`scheduleEngine.ts`), disparadores `plan_week`/`mesocycle_end`, `isOverdue`, mediciones
corporales, correlación de series. No es basura vieja.

El problema: esa rama va **286 commits por detrás** de `ds/f3-experiencia`, y sus propios commits
ya están integrados aquí (0 commits por delante). De los 34 ficheros sueltos, **18 los ha tocado
también `ds/f3-experiencia`** en esos 286 commits:

```
firestore.rules · storage.rules · src/types.ts · src/dbService.ts · src/db/media.ts
src/ai/tools.ts · CheckInScreen · PendingTasksPanel · ProfileScreen · ClientAnalysisPanel
ClientReviewsPanel · CorrelationPanel · QuestionnaireChartsPanel · QuestionnaireEditor
QuestionnaireManagerScreen · ReportView · ReportsPanel · ScheduleFields
```

Cuanto más se tarde, peor la integración. Y mientras siga sin commitear, un `checkout` o un `reset`
en ese directorio se lo lleva todo.

**Respaldo ya hecho** (no se ha tocado nada del worktree):
- `/Users/dani/respaldo-cuestionarios-2026-08-08.patch` — los 23 ficheros con seguimiento
- `/Users/dani/respaldo-cuestionarios-2026-08-08-nuevos.tgz` — los 11 ficheros nuevos

**Orden de operaciones recomendado**, y conviene que lo haga la sesión que escribió ese código,
porque los 18 conflictos exigen saber qué se pretendía en cada uno:

1. En ese worktree, **commitear** el trabajo tal cual (deja de estar en peligro).
2. Traer `ds/f3-experiencia` encima y resolver los 18.
3. Integrar.

Los 11 ficheros nuevos son aditivos y no dan conflicto.

---

## 5. Decisiones tuyas, no tareas

- **Pushear la rama.** Va 277 commits por delante de `origin/main` y sigue en local. Pediste no
  pushear hasta revisarlo.
- **Relación máquina→ejercicio.** Diseñada y documentada (`docs/catalogo-maquinas.md`), sin
  implementar. Es lo que haría que el generador de entrenamientos use el equipamiento real del
  atleta — o sea, lo que le da valor de verdad al catálogo.
- **Dos «tareas futuras»** que salieron de la auditoría y siguen sin decidir: replantear las
  preguntas del paso «Tu objetivo», y el historial de cardio en diario (como el de fuerza).

---

## Estado del repo

`tsc` limpio · 363 pruebas · `build` correcto · `ds:inventario` sin regresiones · árbol limpio.

Los 12 hallazgos con severidad de la auditoría visual (P0-1 a P2-1) están corregidos, salvo la
mitad de configuración de P0-2 (punto 1 de este documento) y la confirmación en DOM de P1-7.
