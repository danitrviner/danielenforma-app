# Preparar el despliegue (NO desplegado) · 23-oct-2026

Todo vive en el worktree `~/en-forma-redesign-1a` (rama `redesign-1a`, sin commitear). Aquí está lo que entraría y en qué orden. **No se ha desplegado ni leído nada de producción.**

## 1. Qué cambia fuera del código de la app
| Archivo | Cambio | Por qué |
|---|---|---|
| `firestore.rules` | +66 líneas, 5 reglas nuevas (abajo) | colecciones nuevas |
| `vercel.json` | `camera=(self)` (antes bloqueaba la cámara) y caché + CORS de `/off/*` | escáner de códigos y Open Food Facts local |
| `api/delete-account.ts` | `cardioAplazos` y `revisionProgreso` en `POR_CAMPO` | borrado de cuenta debe llevárselas |
| `public/off/` (50 MB) | generado por `scripts/generarOpenFoodFacts.mjs` | **decisión pendiente:** versionar en git o regenerar al desplegar |
| `firestore.indexes.json` | sin cambios | la lectura de aplazos del coach va por rango de id, sin índice |

## 2. Reglas nuevas (diff contra `origin/main`, NO contra producción)
| Colección | Quién lee | Quién escribe | Si falta la regla |
|---|---|---|---|
| `exerciseChanges` | coach | coach (solo crear) | el cambio de clasificación se guarda pero el registro falla (la app avisa) |
| `catalogoAlimentos` | cualquier usuario de la app | coach | el Diario no ve el catálogo por 100 g |
| `recipeAccess` | cualquier sesión | coach | guardar la lista global de recetas falla por permisos |
| `revisionProgreso` | coach o el propio atleta | el propio atleta / coach | el progreso de la revisión solo queda en el móvil |
| `cardioAplazos` | coach o el propio atleta | el propio atleta | aplazar solo queda en local y el coach no ve los aplazos |

## 2b. Diff contra producción — HECHO (23-oct, solo lectura, permiso de Dani)
Reglas desplegadas leídas de la BD con nombre (release `cloud.firestore/ai-studio-b38fc63b-…`, última actualización 17-oct 13:01 UTC) y comparadas con `firestore.rules` del worktree: **66 líneas añadidas, 0 quitadas**, en 4 bloques que son exactamente las 5 reglas de la tabla (`exerciseChanges`; `catalogoAlimentos` + `recipeAccess`; `revisionProgreso`; `cardioAplazos`). Producción no tiene ninguna regla que falte en el worktree: desplegar el archivo no borra nada. Copias temporales borradas. Nada desplegado.

## 3. Antes de desplegar reglas (necesita tu permiso para leer producción)
La BD es **con nombre** (`ai-studio-b38fc63b-000e-4d2c-b774-20351883e870`, proyecto `fleet-operator-z5xj8`); un despliegue atrasado ya borró reglas el 17-10. Pasos, cada uno con tu OK en el momento:
1. ~~Bajar las reglas desplegadas y comparar~~ hecho (ver 2b): el diff es limpio. **Si pasa tiempo o alguien despliega reglas antes, repetirlo justo antes de desplegar.**
2. Si el diff es limpio: `firebase deploy --only firestore:rules` (con tu clave).
3. Probar con sesión real: guardar una clasificación, aplazar un cardio, abrir una revisión, abrir el Diario en «Calorías y macros».

## 4. Orden recomendado
1. Reglas (paso 3) — antes que la web, para que nada falle por permisos.
2. Web en Vercel (incluye `vercel.json` y `api/delete-account.ts`).
3. Datos: cargar el catálogo de alimentos (N-04) con su script; revisar y aplicar R-02 (`--aplicar`).
4. Binario nativo: `NSCameraUsageDescription` (iOS) y `CAMERA` (Android) solo llegan con una versión nueva en las tiendas.

## 5. Riesgos conocidos
- E-03 ya está aplicado en producción y el arreglo de `seleccionEjercicios.ts` va en la web: hasta desplegarla, quien tenga solo «gimnasio completo» ve «Sin material compatible» en el Draft.
- `public/off` pesa 50 MB: si se versiona en git, el repositorio crece; si se regenera, el despliegue necesita el volcado de Open Food Facts.
- Nada de esto se ha visto con sesión real (ver `estado-actual.md` §4).
