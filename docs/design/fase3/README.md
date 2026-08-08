# Handoff: En Forma — Fase 3 (experiencia)

## Overview

En Forma es la app de coaching de fuerza de Dani (@danielenforma, marca "De Invisible a Imparable"), con dos vistas: **coach** y **atleta**. La Fase 3 no define arquitectura ni features nuevas: define **cómo se siente la app** — motion, microinteracciones, estados vacíos, estados de carga, transiciones, gestos, haptics, celebraciones y presencia fuera de la app (isla dinámica, widgets, pantalla bloqueada).

Este paquete cubre seis módulos aprobados:

| Módulo | Archivo |
|---|---|
| Componentes (botones, tarjetas, inputs, filtros, feedback, listas) | `Componentes - Experiencia.dc.html` |
| Navegación (barra inferior, cabecera, lista→detalle, búsqueda, avance en sesión, índice de Academia) | `Navegacion - Experiencia.dc.html` |
| Sesión de entrenamiento | `Sesion de entrenamiento - Experiencia.dc.html` |
| Nutrición | `Nutricion - Experiencia.dc.html` |
| Biblioteca de ejercicios | `Biblioteca - Experiencia.dc.html` |
| Cardio (módulo nuevo, no existía en el backlog) | `Cardio - Experiencia.dc.html` |
| Bienvenida guiada / tutorial (módulo nuevo) | `Tutorial - Experiencia.dc.html` |
| Hoy — inicio del atleta (añadido tras el cierre de Fase 3) | `Hoy - Experiencia.dc.html` |
| Rutinas — bloque completo (añadido tras el cierre de Fase 3) | `Rutinas - Experiencia.dc.html` |
| Academia — reproductor de lección | `Academia - Experiencia.dc.html` |
| Perfil — pantalla completa, ajustes, ayuda | `Perfil - Experiencia.dc.html` |
| Login y espera | `Login y Espera - Experiencia.dc.html` |
| CRM (coach) — importado, sin conflicto | `CRM - Experiencia.dc.html` |
| Ajustes (coach) — importado, sin conflicto | `Ajustes (Coach) - Experiencia.dc.html` |
| Gráficas — importado, sin conflicto | `Graficas - Experiencia.dc.html` |
| Revisiones / check-ins — importado, sin conflicto | `Revisiones - Experiencia.dc.html` |
| Transversales (sheets, errores, carga) — importado, sin conflicto | `Transversales - Experiencia.dc.html` |
| Entreno en curso — importado, más detallado que Sesión | `Entreno - Experiencia.dc.html`, `Entreno - Serie en Curso v2.dc.html` |
| Home Coach — requiere acción / al día | `Home Coach - Experiencia.dc.html` |
| Hub del atleta — resumen, plan sin publicar | `Hub del Atleta - Experiencia.dc.html` |

`Decisiones-Fase3-Aprobadas.md` es el acta de decisiones en prosa: **es la fuente de verdad**. Este README la resume y añade las medidas exactas.

**Hecho** (fuera del paquete original de Fase 3): `Hoy - Experiencia.dc.html` — inicio del atleta (3 estados). `Rutinas - Experiencia.dc.html` — lista de días, detalle de día, ver semanas. `Academia - Experiencia.dc.html` — reproductor de lección, completada + siguiente, puntos clave y recursos. Todas con ficha de reglas.

**Pendiente de otras conversaciones** (no está en este paquete): Chat coach–atleta (decisión del usuario: no se construye por ahora).

**Nota de origen (7 ago 2026):** en la carpeta de subidas había un handoff maestro más reciente de una línea de conversación paralela, con navegación distinta (Hoy·Rutinas·Comida·Progreso·Perfil), tutorial de 6 pasos y sin verde en paleta. **Se decidió mantener este proyecto como canónico** (Academia/Nutrición como pestañas, tutorial de 17 pasos). Solo se importaron de ahí los módulos sin conflicto: CRM, Ajustes (coach), Gráficas, Revisiones, Transversales, Entreno en curso. Si aparece una contradicción puntual entre un módulo importado y uno propio, se decide pantalla por pantalla.

> **Cambio global posterior al cierre de Fase 3 — RIR sustituye a RPE.** En todo lo que es fuerza (tabla de series, chips de prescripción, tarjetas de ejercicio, Academia, celebraciones) la escala es **RIR** (repeticiones en reserva, 0–5: RIR 2 = podías haber hecho dos más), no RPE. Donde el documento diga RPE en un contexto de fuerza, léase RIR. El único sitio donde se mantiene una escala de esfuerzo 1–10 es **cardio sin pulsómetro**, y allí el campo se etiqueta **ESFUERZO**, no RPE. Los prototipos de Sesión, Componentes y Biblioteca todavía dicen RPE: el de Tutorial ya está actualizado y manda. Pendiente decidir la escala visual del selector de RIR (ver `Antes-de-Claude-Code.md`).

## About the Design Files

Los `.dc.html` de este bundle son **referencias de diseño escritas en HTML**: prototipos que muestran aspecto y comportamiento previstos, no código de producción para copiar. Cada archivo es un lienzo con varios "paneles": maquetas de iPhone de 390×780 px, numeradas (01, 02, 03…), más una tarjeta final de **Reglas del módulo**.

La tarea es **recrear estos diseños en el entorno del codebase real** (React + Vite + Firebase, según el contexto del proyecto) usando sus patrones y librerías existentes. Nada de portar el HTML tal cual: `support.js` es solo el runtime del prototipo y no debe llegar a producción.

Algunos paneles son interactivos y conviene abrirlos en el navegador para sentir el timing:
- Nutrición 01 (registrar ingestas), 02 (steppers), 02b (intercambiar alimento), 03 (escala de receta)
- Biblioteca 01 (filtros), 03 (selección múltiple), 05 (hoja de filtros)
- Cardio 02 y 03 (cronómetro LISS y ciclo HIIT corriendo de verdad), 04 (duración y RPE)

## Fidelity

**Alta fidelidad.** Colores, tipografía, tamaños, radios, duraciones y easings son finales. Recrear pixel-perfect con las librerías del codebase. Las imágenes son placeholders a propósito (vídeos de ejercicio, fotos de receta): hay que sustituirlas por los assets reales.

## Design Tokens

**Color**
| Token | Valor | Uso |
|---|---|---|
| Fondo | `#050505` | fondo de pantalla |
| Fondo lienzo | `#0a0a0a` | solo el lienzo del prototipo |
| Superficie 1 | `#0B0B0B` | tarjeta por defecto, campos |
| Superficie 2 | `#0F0F0F` | tarjeta interactiva o que anida contenido, bottom sheets, botón terciario |
| Superficie 3 | `#141414` | miniaturas, botón "menos" del stepper, toasts |
| Pista | `#1a1a1a` / `#1c1c1c` | fondo de barras de progreso y segmentos pendientes |
| Borde | `rgba(255,255,255,.07)` | borde estándar 1 px (`.06` en filas de lista, `.09` en sheets) |
| Texto | `#F5F5F4` | primario |
| Texto 2 | `rgba(245,245,244,.6)` → `.45` → `.34` → `.26` | secundario, terciario, etiqueta mono, pie |
| Oro | `#FFC72C` | **solo** acción, selección o el dato destacado |
| Oro 16% / 14% / 13% / 6% | `rgba(255,199,44,.16 / .14 / .13 / .06)` | relleno de chip seleccionado, cuadro de icono, chip de dato, aviso |
| Oro 45% / 42% / 40% | borde de chip / contorno de botón secundario | |
| Verde | `#3ECF8E` (fondo `rgba(62,207,142,.13–.14)`) | positivo, "en zona", delta al alza |
| Rojo | `#FF5A4E` (fondo `rgba(255,90,78,.07)`, borde `.22–.55`) | error, riesgo, destructivo, pasarse de presupuesto |

Máximo un acento además del oro por pantalla. El oro nunca es decorativo.

**Tipografía** (Google Fonts)
- **Archivo 900** — display. Títulos de pantalla 38–46 px, títulos de tarjeta 21–27 px, cifras grandes 26–82 px. `letter-spacing:-.02em` a `-.045em` (más negativo cuanto mayor el tamaño), casi siempre `text-transform:uppercase`.
- **Plus Jakarta Sans 400/500/600/700** — UI. Cuerpo 12,5–13,5 px / 1,6; etiquetas de fila 13–13,5 px 600; botones 15,5 px 700.
- **IBM Plex Mono 500/600** — datos y etiquetas. Etiquetas 9–10,5 px con `letter-spacing:.10–.16em` en mayúsculas; cifras 11–34 px.

Regla: los datos van en mono, la prosa en Jakarta, los titulares en Archivo. Coma decimal (`72,5`), miles con punto (`7.240`), kcal siempre aproximadas (`≈ 1.400`).

**Radios**: 34 (marco de móvil) · 26 (bottom sheet, solo arriba) · 24 (tarjeta grande) · 20 (tarjeta) · 18 (fila de lista, banner) · 16 (botón, campo interior) · 15 (campo, botón de stepper) · 14–13 (cuadro de icono, miniatura) · 11 (chip) · 8–10 (pastilla mono, casilla) · 4 (barra de progreso).

**Espaciado**: padding lateral de pantalla 20 px; padding de tarjeta 15–18 px; gap de lista 7–8 px; gap de chips 6–7 px; separación entre bloques 14–22 px.

**Alturas**: botón primario 56 · secundario/terciario 52 · campo 54 (48 en reposo de búsqueda) · botón de icono 48 · botón de stepper 52 (42 dentro de sheet) · fila de lista mín. 52 · casilla 26 · barra inferior 78 · barra de progreso 6 (5 en tarjeta pequeña, 4 en widget). Todo objetivo táctil ≥ 44 px.

**Motion**: easing único `cubic-bezier(.2,.9,.2,1)`. Entradas 240–550 ms con stagger 40–50 ms; **las salidas siempre más rápidas que las entradas** (~140 ms). Cambios de color/estado 200–300 ms lineales. Anchos de barra 420–450 ms. Anillos SVG 1–1,1 s con `stroke-dashoffset`.

**Sombra**: solo el marco del móvil y elementos flotantes — `0 30px 70px -30px rgba(0,0,0,.9)`. Nada de sombras decorativas en tarjetas.

**Haptics** (mapa transversal)
- `light`: cada toque de stepper, muesca de escala/RPE, marcar serie, registrar ingesta, seleccionar en lista múltiple, segundo de cuenta atrás.
- `medium`: botón primario, añadir receta, confirmar selección.
- `heavy`: cambio de intervalo en HIIT.
- `success`: cerrar día de nutrición en presupuesto, cerrar semana de cardio, terminar sesión.
- `warning`: superar el presupuesto de una categoría, salirse de zona FC más de 30 s (una sola vez, no en bucle).

---

## Módulo 1 — Componentes

Ver `Componentes - Experiencia.dc.html` y la sección "Componentes" del acta. Resumen de lo que hay que construir como primitivas reutilizables:

**Botones**. Primario 56 px, radio 16, oro plano, texto `#050505` 700/15,5; press `scale(.97)` 220 ms + haptic medium; **un solo primario por pantalla**. Secundario 52 px con contorno oro 42% y relleno oro 9% en press. Terciario fantasma 52 px sobre `#0F0F0F`. Destructivo: solo texto `#FF5A4E`. Icono 48 px radio 14; seleccionado = oro 14% + borde oro 40%. Deshabilitado `#141414` + texto 26%, sin borde. Cargando: color del botón al 22%, spinner 0,7 s lineal y label en gerundio ("Guardando"). Éxito momentáneo: pasa a "¡Listo!" 1,4 s y vuelve solo.

**Tarjetas**. Radio 20, padding 16–18, borde 1 px al 7%. `#0B0B0B` por defecto, `#0F0F0F` si es interactiva o anida contenido. Métrica: etiqueta mono en mayúsculas + cifra Archivo 900 38 px + delta en pastilla verde/roja + sparkline de 8 barras con la última en oro (entrada `scaleY` 550 ms, stagger 40 ms). Ejercicio: miniatura 74 px + chips mono series/carga/RPE. Cliente: avatar de iniciales, insignia de estado, barra de adherencia animada 0→valor en 800 ms. Lección: anillo SVG con `stroke-dashoffset` 1 s.

**Entradas**. Campo 54 px radio 15 sobre `#0B0B0B`; foco = borde oro 1,5 px + etiqueta oro (180 ms); error = borde rojo 55% + mensaje con icono. Etiquetas siempre encima, mono 10 px `.16em` mayúsculas. Stepper de carga: dos botones 52 px (menos neutro, más oro), cifra mono 34 px, paso 2,5 kg, haptic light. RPE: 10 segmentos táctiles, 1–7 oro 45%, 8–10 oro pleno. Selector con chevron al 45% que abre bottom sheet.

**Filtros y estado**. Segmentado 46 px sobre `#0F0F0F` con pastilla oro que se desliza (`translateX` 320 ms) y texto activo `#050505`. Chips radio 11, padding 9/14; seleccionado = oro 16% + borde oro 45% + texto oro (**nunca oro pleno en chips**). Insignias mono 11 px sobre color al 14%: verde ACTIVO, oro EN PAUSA, rojo IMPAGO, gris ARCHIVADO. Pestañas con subrayado oro 2 px por opacidad 240 ms, inactivas al 40%. Interruptor 48×29, pista oro activa, pomo blanco 23 px, 260 ms.

**Feedback**. Barra 6 px radio 4 sobre `#1a1a1a`, relleno oro, ancho 450 ms. Banner radio 18 con color al 7% de fondo y 22–24% de borde (oro informativo, rojo con "Reintentar" en contorno). Esqueletos `#111 → #1c1c1c → #111`, barrido 1,4 s lineal, stagger 150 ms; **nunca spinner a pantalla completa**. Toast abajo a 24 px, `#141414`, radio 16, entra `translateY(22px) + scale(.97)` 340 ms, se va a los 3,2 s, acción opcional en oro.

**Listas**. Fila mín. 52 px, separadores 1 px al 5% (nunca en la última). Serie completada: casilla oro con check `#050505`, fondo de fila oro al 5%, texto al 45% tachado, todo en 240 ms. Numeración mono de dos dígitos (`01`). Fila navegable: avatar 38 px + título + subtítulo + chevron al 35%; el estado de riesgo sustituye al chevron por insignia. Deslizar para borrar: 96 px de recorrido, fondo rojo con icono y etiqueta en negro, 340 ms. Fila "Añadir": borde discontinuo + icono en cuadro oro 14% + texto al 70%.

## Módulo 2 — Navegación

Ver `Navegacion - Experiencia.dc.html`.

**Barra inferior**: 5 pestañas (Hoy · Rutinas · Academia · Nutrición · Perfil), alto 78 px, fondo `rgba(8,8,8,.92)` + blur, línea superior al 7%. Icono 22 px trazo 1,9, etiqueta 10 px, punto oro 4 px bajo la activa. Al activarse: icono sube 1 px, punto escala .2→1 en 220 ms, contenido hace fundido hacia arriba 280 ms. **Sin deslizamiento lateral entre pestañas.** Insignia numérica roja arriba a la derecha, máximo dos dígitos.

**Cabecera**: dos estados. Reposo con título Archivo 900 46 px a dos líneas; desplazado (>30 px) el título grande se va subiendo 8 px y aparece el compacto de 15,5 px con línea de 1 px — 300 ms en ambos sentidos. Barra superior siempre con blur. Retroceso 36 px a la izquierda, una única acción contextual en oro a la derecha.

**Lista → detalle**: el detalle entra desde la derecha 340 ms con sombra propia, la lista retrocede 40 px y baja al 60% de opacidad; al volver se invierte. El "volver" siempre lleva la etiqueta del origen ("‹ Clientes").

**Búsqueda**: campo 48 → 54 px al enfocar, borde e icono en oro (200 ms), "Cancelar" a la derecha. Sin foco: chips de búsquedas frecuentes. Con consulta: resultados con etiqueta de tipo (CLI / EJ / LEC) en cuadro mono, entrada escalonada 40 ms. Vacío: icono en cuadro discontinuo + consulta entre comillas angulares + sugerencia.

**Avance en sesión** y **índice de Academia**: ver el acta (segmentos táctiles por ejercicio; acordeón con un solo módulo abierto, chevron 180°, lecciones escalonadas 40 ms, número de módulo en cuadro de 34 px).

## Módulo 3 — Sesión de entrenamiento

Ver `Sesion de entrenamiento - Experiencia.dc.html`. Es la pantalla que se mira una hora seguida.

- Cabecera compacta: cerrar (34 px), nombre del bloque + "EJERCICIO n/5", cronómetro de sesión con punto verde.
- Segmentos de avance, uno por ejercicio: hechos oro 45%, actual oro pleno, pendientes `#1c1c1c`.
- Tira de vídeo plegada por defecto (`▶ Ver técnica`), se despliega en la misma tarjeta; chevron gira. El vídeo no es obligatorio para nada.
- Nombre del ejercicio en Archivo 900 25 px + chips de prescripción; **el chip con candado indica parámetro impuesto por el coach**.
- Nota del coach en oro al 6% firmada con inicial.
- Tabla de series: cabecera mono `Nº · REPS · KG · RPE` + casilla 26 px. **El valor de la última vez aparece en gris debajo del campo vacío.** Serie siguiente anticipada: número en oro y casilla con borde oro al 55%. Serie hecha: fondo oro al 6%, valores en blanco, RPE relleno. Desmarcar tocando otra vez, sin confirmación.
- Al marcar serie arranca el descanso (90 s) en pastilla oro con punto que late y "Saltar"; al llegar a cero desaparece sola.
- Cambio de ejercicio arrastrando: la ficha entra 34 px desde el lado del avance en 340 ms; retroceder invierte la dirección.
- Una animación propia por tipo de serie: **dropset** (bajadas encadenadas), **myoreps** (miniseries que aparecen con rebote `scale(.6)→1.08→1`), **AMRAP** (pulso lento 1,04), **fallo** (borde rojo que respira con halo `0 0 0 6px rgba(255,90,78,.07)`).
- Pie fijo con degradado al fondo: retroceso cuadrado 56 px (al 35% si no hay anterior) + primario que cambia a "Terminar sesión" en el último ejercicio.

## Módulo 4 — Nutrición

Ver `Nutricion - Experiencia.dc.html` (8 paneles). **El intercambio es la unidad visual: los gramos nunca van en primer plano.** 1 intercambio = 100 kcal; gramos por intercambio HC 25 g · PROT 25 g · GRASA 11 g.

**01 · Tracker del día.** Cifra "TE QUEDAN" en Archivo 900 38 px oro + kcal aproximadas en mono a la derecha. Tres barras de 6 px (HIDRATOS · PROTEÍNA · GRASA) con ancho interpolado 420 ms; pasarse pinta la barra roja en 300 ms y añade `+2` en rojo, **sin sacudidas**. Lista de 5 ingestas con chips mono (`3 HC · 2 PR · 1 GR`) y casilla de 26 px: toque = registrar con haptic light, la fila pasa a oro 5,5% + borde oro 20% + título al 50% en 240 ms, y **la barra se mueve después, no a la vez**.

**02b · Detalle de ingesta (alimentos y gramos).** Aquí es donde viven los gramos. El coach publica la dieta; el atleta no la monta desde cero: **intercambia alimentos y registra**. Fila: cuadro 44 px con el tipo (PROT/HC/GRASA), nombre + gramos en oro mono en la misma línea, y debajo la equivalencia en lenguaje humano ("2 intercambios de proteína · 1 tarrina"). Toque en la fila = intercambiar alimento, y **los gramos se recalculan para valer los mismos intercambios**. Fila "Añadir alimento del banco" con borde discontinuo. Aviso explicativo bajo la lista, no modal.

**02 · Hoja de ajuste.** Bottom sheet `#0F0F0F` radio 26 que entra en 380 ms con `translateY(26px) + scale(.985)`; arrastrar abajo cierra sin guardar. Un stepper por macro (cifra mono 26 px, menos neutro / más oro, gramos aproximados en gris debajo). Píldora de encaje en vivo: verde `CABE · TE QUEDARÍAN X` / rojo `TE PASAS EN X`, color en 300 ms.

**03 · Recetas.** Buscador 48 px sobre 8.850 recetas; `Cabe en mi presupuesto` es el primer chip y va seleccionado por defecto. Escala ×0,25–×3 paso 0,25 (haptic light por muesca) que recalcula macros y kcal en vivo, con píldora verde si cabe y oro si se sale. Favorito (corazón que se rellena en oro, 220 ms) y "no me gusta" sobre la foto, arriba a la derecha.

**04 · Vacíos.** Sin dieta publicada: cuadro discontinuo oro, "Dani está montando tu dieta", estado `EN REVISIÓN DESDE AYER` con punto que late, salida secundaria "Ver mi anamnesis". Búsqueda sin resultados: consulta entre comillas angulares + chips de recuperación, incluido "Quitar presupuesto" en oro. **Ningún vacío culpa al atleta: dice qué falta y quién lo tiene que hacer.**

**05 · Carga.** Esqueletos con barrido 1,4 s y stagger 150 ms. Nunca spinner ni cifras falsas.

**06 · Día cerrado.** Anillo que se cierra en 1,1 s + sello de check `scale(.62)→1.07→1` a los 550 ms; título y copy escalonados 100 ms; tira semanal de 7 cuadros de 34 px (cumplidos oro 14%, hoy con borde oro 55%). Haptic success. **Sin confeti.**

**07 · Fuera de la app.** Isla dinámica solo 30 min antes de una ingesta (icono, "Comida en 20 min", intercambios restantes, microbarras) que se cierra sola al registrar. Widget de bloqueo con restantes en oro + tres microbarras; segundo widget "SIGUIENTE" con la receta y sus chips.

**Gestos**: toque = registrar · toque largo = hoja de ajuste · izquierda = cambiar receta · derecha = saltar comida.

## Módulo 5 — Biblioteca de ejercicios

Ver `Biblioteca - Experiencia.dc.html` (6 paneles). 40 ejercicios base, 14 grupos musculares, equipamiento.

**01 · Catálogo.** Buscador 48 px con botón de filtros en cuadro oro 14%; chips de grupo en fila con scroll horizontal. Fila de 64 px de miniatura + nombre + chip de grupo (oro 13%) + chip de equipamiento (blanco 5%) + chevron al 30%. Sin vídeo, la miniatura lleva la marca `SIN VÍDEO` en mono 7 px. Al cambiar de filtro **la lista no se vacía**: las filas que salen se van en 140 ms y las nuevas entran escalonadas 40 ms. La miniatura reproduce en bucle solo si la fila está a más del 60% en pantalla.

**02 · Ficha.** Vídeo 16:9 en bucle sin sonido, con control 0,5× / 1× abajo a la derecha para revisar técnica. Título Archivo 900 27 px, chips de grupo/equipo/patrón. Tarjeta "TU MEJOR SERIE" con cifra 32 px + delta verde y sparkline de 8 sesiones (`scaleY` 550 ms, stagger 40 ms, última barra en oro). Nota del coach en oro al 6% firmada. Pie: botón de intercambio 56 px + primario "Añadir a la rutina".

**03 · Selección múltiple.** **El destino se elige antes de seleccionar y se queda fijo arriba** — nunca se pregunta al final. Cabecera Cancelar / título / Todos. Filas con casilla de 26 px. El botón inferior está deshabilitado (`#141414`, texto al 26%) hasta el primer ejercicio y siempre lleva el número: "Añadir 3 al Día 2". Haptic light por selección, medium al confirmar, toast con "Deshacer" 3,2 s.

**04 · Vídeo y vacíos.** Subida en segundo plano: barra oro con progreso, "Puedes seguir editando mientras sube", "Cancelar" en rojo; el primario pasa a estado cargando (oro al 22% + spinner + "Guardando"). Biblioteca vacía: "Cargar los 40 base" (primario) + "Crear uno desde cero" (secundario).

**05 · Hoja de filtros.** Los 14 grupos y el equipamiento como chips multi-selección; "Limpiar" arriba a la derecha; el primario lleva el recuento: "Ver 22 ejercicios".

**Copy**: nombres de ejercicio tal como los dice Dani, sin abreviar en la lista.

## Módulo 6 — Cardio (módulo nuevo)

Ver `Cardio - Experiencia.dc.html` (7 paneles). No existía en el backlog; se define aquí. Tres formatos: **LISS por zona**, **HIIT por intervalos** y **pasos**.

**Jerarquía (regla dura)**: el cardio está al servicio de la fuerza. Nunca aparece antes del entreno del día y siempre dice cuándo toca ("después de pesas"). "Mover a mañana" está a la vista: saltarlo es legítimo, no un fallo. El objetivo es **semanal en minutos**, no diario, y lo que se celebra es la semana.

**01 · Cardio de hoy.** Chip `LISS · ZONA 2` + "2 de 3 esta semana"; prescripción en Archivo 900 26 px; tres datos en mono (DURACIÓN 30:00 · ZONA FC 124–138 · RPE 4–5); nota del coach en oro al 6%. Dos tarjetas pequeñas: pasos con barra y objetivo, y minutos de la semana con 7 microbarras. Pie: primario "Empezar cardio" + "Ya lo hice" (oro 80%) y "Mover a mañana" (blanco 40%).

**02 · LISS en curso.** Cronómetro Archivo 900 76 px — **las cifras cambian sin transición para leerse de reojo** — con "QUEDAN mm:ss" en oro debajo. Corazón que **late a la frecuencia real medida**, no a un ritmo fijo, junto a las ppm en mono 26 px. Cinco segmentos de zona (actual oro pleno, anteriores oro 26%, resto `#1a1a1a`, cambio 400 ms) e insignia verde `EN ZONA`. Tres datos: en zona (verde), media, kcal aproximadas. Pie: pausa cuadrada 56 px + primario "Terminar".

**03 · HIIT por intervalos.** Anillo de 250 px que se vacía linealmente cada 30 s; oro en trabajo, blanco 35% en descanso; **el fondo de pantalla tiñe al 4% según la fase** (500 ms). Etiqueta TRABAJO/DESCANSO en mono `.2em` + segundos en Archivo 900 68 px. Píldora "SIGUIENTE · …". Ocho segmentos de ronda. Cuenta atrás de 3 s antes de cada bloque (cifra `scale(1.2)→1`, haptic light por segundo); cambio de intervalo con haptic heavy. Pie: pausa + "Saltar intervalo" en contorno oro.

**04 · Sin reloj: registro en dos toques.** Sin pulsómetro **no se pide FC, se pide RPE** con la misma escala de 10 del entreno (1–7 oro 45%, 8–10 oro pleno) y una frase que traduce el número ("Cómodo, hablo sin problema"). Tipo preseleccionado con el de la prescripción; duración prerrellenada con stepper de paso 5 min; el primario lleva el dato: "Guardar 30 min". "Importar de Salud / Garmin" siempre visible abajo, nunca obligatorio.

**05 · Resumen y semana cerrada.** Anillo de 150 px (1,1 s) con los minutos dentro y sello a los 500 ms; titular "Semana de cardio completa" + una línea de contexto. Tarjeta con 4 filas de datos (tipo, en zona en verde, FC media/máx, semana en oro) y distribución por zonas en 5 barras. **Haptic success solo al cerrar la semana, no cada sesión.**

**06 · Fuera de la app.** Isla dinámica con ronda, fase (cambia de color con la fase), cronómetro y segundos grandes; **vibra en cada cambio para no mirar el móvil**. Pantalla bloqueada con widget grande (cronómetro 44 px, ppm, "EN ZONA 2", barras de zona) y dos widgets pequeños (pasos, minutos de semana).

## Módulo 7 — Bienvenida guiada (módulo nuevo)

Ver `Tutorial - Experiencia.dc.html`. **17 pasos.** No es un onboarding de datos: la anamnesis ya ocurrió antes. Esto explica la app.

**Cuándo arranca.** Justo después de que el coach publique el plan y el atleta cierre la pantalla de espera. Nunca antes: el tour enseña datos reales.

**Voz.** Dani en primera persona, siempre ("Aquí te dejo tu entreno"). La app nunca se explica a sí misma en tercera persona.

**Anatomía de un paso.** Hoja de Dani anclada abajo (`#0F0F0F`, radio 26, entra 380 ms con `translateY(26px)+scale(.985)`) con avatar de 34 px, chip de sección, barra de progreso, contador `04 / 17`, titular Archivo 900 24 px, cuerpo Jakarta 13,5/1,6, primario 56 px, retroceso cuadrado de 52 px y "Saltar el tour" al 34%. Cuando el objetivo está en la mitad inferior de la pantalla (barra de pestañas), la hoja se ancla **arriba**.

**Ritmo — regla dura.** Al entrar en una sección nueva el atleta ve **la pantalla entera antes que el detalle**: cartel con el nombre de la pantalla (pastilla mono oro, 10/18 px de padding, radio 14), recorrido con scroll suave de arriba abajo (~1,8 s) y solo entonces entra el foco. Si el paso siguiente vive en la misma pantalla, no se repite el paseo y el foco se mueve directamente. **Nunca se hace zoom sobre un elemento sin haber enseñado dónde está.**

**Foco recortado.** `box-shadow: 0 0 0 9999px rgba(0,0,0,.62)` + borde oro al 55%, radio el del elemento, entrada 320 ms, desplazamiento entre objetivos 300 ms. **Se mide del elemento real en tiempo de ejecución**, no con coordenadas fijas: en el prototipo cada objetivo lleva `data-spot` y el foco lee su rect. En producción, un ref por objetivo.

**Gesto fantasma.** Anillo de 48 px oro al 90% que escala .72→1→1.5 y se desvanece, en bucle de 1,1 s, sobre el punto exacto que hay que tocar (derecha del objetivo si el objetivo es una fila con casilla, izquierda si es una miniatura, centro si es un botón).

**Los 17 pasos.** 01 bienvenida · 02 mapa de las cinco pestañas · 03 Hoy · **04 marcar una serie (acción obligatoria)** · 05 corregir reps/kg/RIR · 06 cardio · 07 rutinas · 08 biblioteca · 09 intercambios · **10 registrar una ingesta (acción obligatoria)** · 11 intercambiar un alimento · 12 recetas · 13 academia · 14 chat · 15 fotos de progreso (saltable) · 16 isla dinámica y widgets (saltable) · 17 cierre.

**Dos pasos exigen tocar de verdad** — marcar una serie y registrar una ingesta — porque son las dos dudas que más se repiten. Hasta que el atleta lo hace, el primario está deshabilitado (`#141414`, texto al 26%) y su label dice qué hacer ("Toca la serie 02"); al hacerlo pasa a oro y cambia a "Perfecto, sigue". El resto de pasos solo avanzan.

**Pasos saltables.** Los que piden algo real al atleta (fotos de progreso, permiso de notificaciones) llevan "Ahora no" y nunca bloquean.

**Sin datos todavía.** Adherencia, historial y fotos no existen el primer día: la pantalla enseña un ejemplo marcado `EJEMPLO` en mono oro. Ese aviso desaparece con el primer dato real y **no vuelve nunca**.

**Cierre.** Anillo que se cierra en 1,1 s + sello `scale(.62)→1.07→1` a los 550 ms, haptic success, checklist de tres primeros pasos (primera sesión, cinco ingestas, lección del RIR) y salida directa al entreno de hoy. El checklist se queda en Hoy hasta completarse.

**No se puede saltar la primera vez.** El tour va entero: no hay «Saltar el tour». Solo los pasos que piden algo real (fotos, permisos) llevan «Ahora no», que avanza al siguiente paso. **Repetible** desde Perfil › Ayuda, desde el paso 01.

**El permiso de notificaciones se pide en el paso 16**, en contexto y con el ejemplo de la isla dinámica a la vista, no al abrir la app.

**Sin plan publicado el tutorial no arranca**: el atleta se queda en la pantalla de espera. El tour necesita datos reales del coach para tener sentido.

**Estado a persistir**: `tutorialCompletado`, `pasoAlcanzado` (para reanudar si se cierra la app), `ejemplosVistos` (para no volver a marcar EJEMPLO) y `checklistInicial` con sus tres ítems.

## Módulo 8 — Hoy (inicio del atleta)

Ver `Hoy - Experiencia.dc.html` (3 estados + reglas). Una tarea manda: el entreno del día es siempre la primera tarjeta con el único botón primario. El cardio nunca aparece por encima del entreno de fuerza — en día de descanso sube a ser la tarjeta principal. La nutrición se resume en una fila de progreso (nunca repite el detalle del módulo de Nutrición). El checklist de los tres primeros pasos solo se muestra hasta completarse. Entreno hecho se confirma en verde, no en oro. Sin datos todavía, la tarjeta se omite, nunca se inventa la cifra.

## Módulo 9 — Rutinas

Ver `Rutinas - Experiencia.dc.html` (lista de días, detalle de día, ver semanas, reglas). El día de hoy se distingue en oro; un día hecho pasa a verde y baja de contraste sin desaparecer de la lista. Selector de semana como segmentado de 4-6 pastillas máximo. La ficha de día reutiliza los chips de Componentes (series · carga · RIR). «Empezar entreno» es el único primario y lleva a Sesión. La vista de semanas es de solo lectura.

## Módulo 10 — Academia (reproductor de lección)

Ver `Academia - Experiencia.dc.html` (reproductor, completada + siguiente, puntos clave y recursos, reglas). El vídeo ocupa el ancho completo en 16:9. Control 0,5×/1× sobre el vídeo, mismo patrón que la ficha de ejercicio. «En este módulo» siempre visible debajo del vídeo. Al terminar se marca vista sola, sin botón de confirmar. «Siguiente lección» es la salida por defecto.

## Módulo 11 — Perfil

Ver `Perfil - Experiencia.dc.html` (perfil y progreso, ajustes, ayuda, reglas). Reutiliza las tarjetas de métrica y fotos de progreso ya definidas en el tutorial. Ajustes vive detrás de un icono en la cabecera de Perfil, nunca en la barra inferior. «Repetir el tour» siempre empieza desde el paso 01 completo. «Cerrar sesión» en texto rojo sobre fondo neutro, la única acción destructiva de la pantalla.

## Módulo 12 — Login y espera

Ver `Login y Espera - Experiencia.dc.html` (login, sala de espera, reglas). Sin autorregistro: el acceso lo crea Dani. Un solo botón primario oro. La sala de espera reutiliza el lenguaje de vacío de Nutrición (cuadro discontinuo oro, insignia con punto que late, salida secundaria a la anamnesis). El logo es el real de la marca (Atlas sosteniendo un disco, recortado del asset de referencia y recoloreado a oro).

## Módulos 13–17 — Lado coach y transversales importados

Estos módulos vienen de una línea de conversación paralela (handoff "Experiencia transversales", 7 ago 2026) y se importaron **sin conflicto** con las decisiones de este proyecto — ver la nota de origen al principio de este documento.

- **CRM** (`CRM - Experiencia.dc.html`, 7 estados): cabecera con ingresos + histograma de 7 meses; lista partida en «Requiere acción» (punto oro pulsante) y «Al día»; swipe de fila, skeleton, estado vacío con CTA «Invitar atleta», tutorial de 4 pasos.
- **Ajustes (coach)** (`Ajustes (Coach) - Experiencia.dc.html`, 6 estados): filas planas de 54 px agrupadas por etiqueta mono (CUENTA, APLICACIÓN), sin iconos de color. Notificaciones sin botón guardar (toggle + "GUARDADO" en mono oro). Acción irreversible con mantener pulsado 1,5 s, nunca escribir "ELIMINAR".
- **Gráficas** (`Graficas - Experiencia.dc.html`, 6 estados): número grande + gráfica + frase que interpreta. Serie temporal con scrub 1:1; volumen con objetivo en línea punteada; adherencia con anillo + rejilla 8×4; zonas de FC con colores propios (Z1-Z5) como única excepción al sistema de color.
- **Revisiones / check-ins** (`Revisiones - Experiencia.dc.html`, 7 estados): hilo con el coach, no historial de formularios — respuesta nueva arriba con punto oro. Cuestionario dinámico (una pregunta por pantalla, tipos de campo definidos por plantilla del coach). Comparativa de fotos con cortina arrastrable 1:1.
- **Transversales** (`Transversales - Experiencia.dc.html`, 7 estados): patrones compartidos de sheets, banners de error/offline, estados de carga y capas — referencia para cualquier pantalla nueva.
- **Entreno en curso** (`Entreno - Experiencia.dc.html` + `Entreno - Serie en Curso v2.dc.html`): versión más detallada que nuestro módulo de Sesión, incluidas las fricciones de gimnasio (máquina ocupada, "me duele", solo tengo 25 min, cerrar la app a mitad de serie).
- **Home Coach** (`Home Coach - Experiencia.dc.html`, construido en este proyecto): pantalla de inicio de Dani — «Requiere acción» (revisiones, pagos, planes sin publicar) separada de «Al día», reutilizando el punto pulsante y las filas de CRM.
- **Hub del atleta** (`Hub del Atleta - Experiencia.dc.html`, construido en este proyecto): ficha del atleta desde el coach — resumen (KPIs, próxima revisión con acceso directo al hilo de Revisiones), y estado del plan con checklist y «Publicar plan».

**Pendiente**: Chat coach–atleta — descartado por decisión explícita del usuario, no se construye por ahora.

## Mapa de pantallas — qué está diseñado

Los seis módulos son **44 paneles** más los 17 pasos del tutorial. Esto es el inventario completo de lo que existe hoy.

| Módulo | Paneles |
|---|---|
| Componentes | 01 Acciones · 02 Tarjetas · 03 Entrada de datos · 04 Filtros y estado · 05 Feedback · 06 Listas y filas |
| Navegación | 01 Barra inferior · 02 Cabecera al desplazar · 03 Lista → detalle · 04 Búsqueda · 05 Avance en sesión · 06 Índice de Academia |
| Sesión | 01 Registro serie normal · 02 Dropset · 03 Myoreps · 04 AMRAP y fallo · 05 Grabación pedida por el coach · 06 Cierre de ejercicio |
| Nutrición | 01 Tracker del día · 02 Ajustar intercambios · 02b Alimentos y gramos · 03 Receta y escala · 04 Vacíos · 05 Carga · 06 Día cerrado · 07 Isla, bloqueo y widget · 08 Reglas |
| Biblioteca | 01 Catálogo y filtros · 02 Ficha · 03 Selección múltiple · 04 Subida de vídeo y vacía · 05 Hoja de filtros · 06 Reglas |
| Cardio | 01 Cardio de hoy · 02 LISS en curso · 03 HIIT por intervalos · 04 Sin reloj · 05 Resumen y semana cerrada · 06 Isla y bloqueo · 07 Reglas |
| Tutorial | 17 pasos sobre 12 pantallas de la app, jugables de principio a fin |

**Cobertura por pestaña de la app**

| Pestaña | Diseñado | Falta |
|---|---|---|
| Hoy | Pantalla de inicio del día (3 estados), cabecera, avance en sesión, sesión completa con 5 tipos de serie, cierre | — |
| Rutinas | Bloque completo, detalle de día, ver semanas | — |
| Academia | Índice con acordeón · reproductor de lección | — |
| Nutrición | Los 8 paneles: completo | — |
| Perfil | Pantalla completa, ajustes, Ayuda | — |
| Login y espera | Login por invitación, sala de espera | — |
| Lado coach | Home Coach, CRM, Ajustes, Hub del atleta, Gráficas, Revisiones | — |
| Transversal | Componentes, navegación, búsqueda, cardio, biblioteca, tutorial, isla y widgets, sheets/errores/carga, entreno en curso | Chat (descartado por ahora) |

## Interactions & Behavior — reglas transversales

1. Easing único `cubic-bezier(.2,.9,.2,1)`; entradas escalonadas 40–50 ms; salidas más rápidas que entradas.
2. Nada de spinners a pantalla completa: esqueletos con barrido 1,4 s / stagger 150 ms.
3. Los números que el usuario lee mientras se mueve (cronómetros, reps) no se animan.
4. Toda acción destructiva o irreversible se deshace con toast de 3,2 s, no con diálogo de confirmación.
5. Un solo botón primario por pantalla y una sola acción en la cabecera.
6. Los estados vacíos siempre ofrecen la salida siguiente y no culpan al usuario.
7. Los objetivos táctiles ≥ 44 px, incluidos los segmentos de RPE y zona.
8. Toda cifra derivada se marca como aproximada (`≈`), nunca se finge precisión.
9. Antes de enfocar algo dentro de una pantalla nueva, se enseña la pantalla entera (regla del tutorial, aplicable a cualquier coach mark futuro).
10. En fuerza la escala es RIR, no RPE.

## State Management

Estado por pantalla que hay que sostener (los prototipos lo simulan en local):

- **Sesión**: ejercicio actual, series con `{reps, kg, rpe, hecha}`, valores de la última vez, temporizador de descanso, tipo de serie especial, vídeo desplegado.
- **Nutrición**: presupuesto por categoría (día activo según periodización D3a), ingestas con sus intercambios y estado registrado, alimento elegido por hueco, escala de receta, favoritos/vetados.
- **Biblioteca**: consulta, filtros (grupos + equipamiento), destino de la selección, ids seleccionados, progreso de subida de vídeo.
- **Cardio**: sesión activa (tipo, tiempo transcurrido, fase e índice de ronda en HIIT), FC en vivo y tiempo en zona, acumulado semanal, registro manual (tipo, minutos, RPE).

Datos vía Firebase/dbService del codebase. El cardio en curso y el HIIT necesitan seguir contando con la app en segundo plano (Live Activity / background timer).

## Assets

Todas las imágenes son placeholders y hay que sustituirlas: vídeos de demostración de ejercicio (16:9, bucle, sin sonido), fotos de receta (4:3, vienen del set del recetario importado), avatares de cliente (se resuelven con iniciales cuando faltan). Los iconos son SVG de trazo 1,9–2,2 dibujados a mano en los prototipos: sustituir por el set de iconos del codebase manteniendo el grosor.

Fuentes: Archivo (700, 900), Plus Jakarta Sans (400–700), IBM Plex Mono (400–600) — Google Fonts.

## Files

- `Decisiones-Fase3-Aprobadas.md` — acta de decisiones, fuente de verdad
- `Componentes - Experiencia.dc.html`
- `Navegacion - Experiencia.dc.html`
- `Sesion de entrenamiento - Experiencia.dc.html`
- `Nutricion - Experiencia.dc.html`
- `Biblioteca - Experiencia.dc.html`
- `Cardio - Experiencia.dc.html`
- `Tutorial - Experiencia.dc.html`
- `Hoy - Experiencia.dc.html`
- `Rutinas - Experiencia.dc.html`
- `Academia - Experiencia.dc.html`
- `Perfil - Experiencia.dc.html`
- `Login y Espera - Experiencia.dc.html`
- `CRM - Experiencia.dc.html`
- `Ajustes (Coach) - Experiencia.dc.html`
- `Graficas - Experiencia.dc.html`
- `Revisiones - Experiencia.dc.html`
- `Transversales - Experiencia.dc.html`
- `Entreno - Experiencia.dc.html`
- `Entreno - Serie en Curso v2.dc.html`
- `Home Coach - Experiencia.dc.html`
- `Hub del Atleta - Experiencia.dc.html`
- `Antes-de-Claude-Code.md` — huecos, conflictos abiertos y preguntas antes de implementar
- `Contrato-de-datos.md` — colecciones, campos y reglas de cálculo
- `support.js` — runtime de los prototipos, **no es código de producción**

Para verlos, abrir cualquier `.dc.html` en el navegador con `support.js` en la misma carpeta.
