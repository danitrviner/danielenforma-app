# BLOQUE 06 — Rendimiento y fluidez

<!-- Pégale este texto a una sesión nueva apuntando al repo ~/en-forma, rama ds/f3-experiencia. -->

Eres un ingeniero de rendimiento. Vas a medir por qué **En Forma** va —o no va— fluida en un móvil
real, antes de publicarla. La app es una SPA de React 19 + Vite dentro de Capacitor 8: se ejecuta
en WKWebView (iOS) y WebView (Android), donde el margen es mucho más estrecho que en el navegador
de escritorio donde se ha desarrollado.

**Mide, no opines.** Un hallazgo de rendimiento sin número no es un hallazgo. Cada uno lleva la
medición, el dispositivo o simulador donde la tomaste, `archivo:línea` de la causa, el cambio
propuesto y **el efecto esperado**. Severidades: Bloqueante / Alta / Media / Baja / Info —
«Bloqueante» aquí es raro y solo si la app resulta inusable. Marca `verificado` o `sospecha`.

**Solo lectura**: no optimices nada todavía. Este bloque produce la lista priorizada; las
optimizaciones se deciden después, porque varias tocan pantallas grandes y tienen riesgo.

## Punto de partida ya medido

`dist/assets`, build del 8 de agosto de 2026 — **3,2 MB de JavaScript** en total:

| Chunk | Tamaño |
|---|---:|
| `firebase-*.js` | 818 KB |
| `index-*.js` | 383 KB |
| `CartesianChart-*.js` (recharts) | 337 KB |
| `ClientsScreen-*.js` | 326 KB |
| `NutritionHubScreen-*.js` | 114 KB |
| `ImportarClientes-*.js` | 92 KB |
| `questionnairePresets-*.js` | 86 KB |
| `CrmShell-*.js` | 84 KB |

`src/App.tsx` ya trocea 24 rutas con `React.lazy`. En nativo **no hay descarga** —el bundle viaja
dentro del `.ipa`— pero sí coste de análisis y ejecución, que en un iPhone de hace cuatro años no
es despreciable.

Ficheros más grandes del código: `NutritionScreen.tsx` (1.897 líneas), `MesocycleManager.tsx`
(1.695), `ClientReviewsPanel.tsx` (1.600), `OnboardingForm.tsx` (1.332), `TrainingScreen.tsx`
(1.069).

---

## 1. Arranque

- **Tiempo hasta la primera pantalla útil** en el simulador de iOS, y en Android si puedes
  compilar. Mide desde el toque en el icono, no desde que carga el JS.
- **Qué entra en el chunk inicial.** `index-*.js` son 383 KB: averigua qué hay dentro que no haga
  falta para pintar la primera pantalla. En particular, si `firebase` se carga entero antes de
  saber si hay sesión.
- **Splash screen**: cuánto se ve, y si el salto al contenido es limpio o hay un parpadeo.
- **Coste de la primera consulta a Firestore** hasta que la pantalla tiene datos de verdad.

## 2. Bundle

- Genera un análisis de composición del bundle y di **qué se puede quitar**.
- **`firebase` en 818 KB**: comprueba que se importan solo los módulos usados (importaciones
  modulares del SDK v12) y qué arrastra `firebase/app-check`, que solo hace falta si hay clave.
- **`recharts` en 337 KB** para las gráficas. Mira en cuántas pantallas se usa de verdad y si se
  carga perezosamente en todas.
- **`ClientsScreen` en 326 KB** es sospechosamente grande para una pantalla. Averigua qué arrastra.
- **`firebase-admin` está en `dependencies`, no en `devDependencies`** (`package.json`). Solo lo
  usa `api/ai-chat.ts`, que es servidor. Verifica que **no entra en el bundle del cliente** —el
  fichero tiene comentarios que sugieren que ya hubo problemas con esto (líneas 21 y 47)— y si
  procede moverlo.
- **Fuentes**: tres familias de `@fontsource` (Archivo, IBM Plex Mono, Plus Jakarta Sans). Comprueba
  qué pesos y subconjuntos se empaquetan de verdad, y si Mono sigue haciendo falta después de la
  fase F5 del Design System, que la sustituyó por Sans.

## 3. Re-renders y trabajo en el hilo principal

- Perfila con React DevTools las pantallas grandes: `NutritionScreen`, `MesocycleManager`,
  `ClientReviewsPanel`, `TrainingScreen`, `ClientHub`.
- Busca el patrón clásico: estado en un componente alto que redibuja el árbol entero en cada
  pulsación de tecla. Con formularios de 1.300 líneas es donde más duele.
- **Listas largas sin virtualizar**: catálogo de máquinas (63), biblioteca de ejercicios, alimentos,
  recetas, lista de clientes, histórico de series. Mira cuántos elementos se pintan de golpe y
  desde qué número se nota.
- Cálculos caros en render: agregaciones de nutrición, correlaciones de cuestionarios, e1RM,
  periodización. ¿Están memoizados, y con las dependencias correctas?
- `useEffect` que se disparan en cadena y provocan varias pasadas de render.

## 4. Fluidez percibida

Esto es lo que Dani llama «que vaya fluida», y es tan importante como los milisegundos:

- **Scroll a 60 fps** en las pantallas con más contenido. Mide el jank, no lo estimes.
- **Transiciones entre pestañas y pantallas**: si hay un parón al entrar, di de cuánto y por qué.
- **Respuesta al toque**: tiempo entre tocar y ver algo cambiar. Por encima de ~100 ms se percibe.
- **Animaciones**: qué se anima y con qué propiedades. Animar `width`, `height`, `top` o `left`
  fuerza layout; `transform` y `opacity` no. Revisa también `useReducedMotion`
  (`src/components/ui/internal/useReducedMotion.ts`), que ya existe: comprueba que se respeta.
- **`useScrollEdgeMask`** (`src/components/ui/internal/useScrollEdgeMask.ts`): mide su coste, que
  los efectos ligados a scroll son sospechosos habituales de jank.
- **Teclado**: cuánto tarda en aparecer y si el layout salta al hacerlo.
- **Imágenes**: fotos de progreso y de máquinas. ¿Se sirven al tamaño que se muestran, o se
  descargan a resolución completa y se escalan? Es la causa más común de scroll a tirones y de
  consumo de memoria.

## 5. Memoria y ciclo de vida

- Consumo de memoria en un recorrido largo, y si crece sin bajar.
- **Suscripciones de Firestore** (`onSnapshot`): que se cancelen al desmontar. Una fuga aquí gasta
  batería, datos y **cuota**.
- Qué pasa tras diez minutos en segundo plano: ¿el sistema descarta la WebView y se recarga entera?
- Batería durante un entrenamiento con temporizador activo.

## 6. Lecturas de Firestore y cuota

Antecedente real: hubo un susto de cuota agotada, y el proyecto está en edición Enterprise
(`docs/` y el histórico del repo lo recogen). Con la app en tiendas, la base de usuarios crece.

- **Cuenta las lecturas** de los recorridos principales. Firebase las cobra por documento.
- **`onSnapshot` frente a `getDocs`**: cada suscripción abierta consume mientras esté viva.
- **Caché de TanStack Query**: `staleTime` y `gcTime` configurados, y si hay consultas que se
  repiten al volver a una pantalla. Es la palanca más barata para bajar lecturas.
- **Consultas sin límite** que traen colecciones enteras. Cruza con `firestore.indexes.json`.
- Estima el coste mensual por usuario activo, con los números que midas. Es el dato que dice si la
  app aguanta crecer.

---

## Entregable

Escribe tu parte en `docs/revision-pre-store/informe.md` con ids `06-1`, `06-2`…

Incluye:
- **Tabla de mediciones**: métrica · valor actual · objetivo razonable · dónde se midió.
- **Lista priorizada de optimizaciones**: esfuerzo frente a ganancia esperada, separando lo que
  conviene hacer **antes** de publicar de lo que puede esperar a la 1.1. Sé honesto: si algo cuesta
  tres días y ahorra 30 ms, dilo.
- **Estimación de lecturas de Firestore** por usuario activo y mes.
