# Decisiones Fase 3 — Aprobadas

Dirección visual cerrada: fondo `#050505`, tarjetas `#0B0B0B` / `#0F0F0F`, borde `rgba(255,255,255,.07)`, texto `#F5F5F4`, oro `#FFC72C` solo para acción y selección, verde `#3ECF8E` (positivo), rojo `#FF5A4E` (error/riesgo). Archivo 900 display, Plus Jakarta Sans UI, IBM Plex Mono datos. Easing `cubic-bezier(.2,.9,.2,1)`, stagger 40–50 ms.

> Nota: este archivo se creó en la conversación de Componentes. Las decisiones previas de CRM, Academia, Ajustes y Gráficas no estaban disponibles en el proyecto; si existen, pégalas arriba de esta sección.

## Componentes

**Acciones**
- Botón primario: 56 px, radio 16, oro plano, texto `#050505` 700/15,5. Press `scale(.97)` 220 ms, haptic medium. Un solo primario por pantalla.
- Secundario: 52 px, contorno oro al 42%, relleno oro 9% en hover/press.
- Terciario (fantasma): 52 px sobre `#0F0F0F`. Destructivo: solo texto `#FF5A4E`, sin relleno.
- Botones de icono: 48 px, radio 14. El estado seleccionado usa relleno oro 14% + borde oro 40%.
- Deshabilitado: `#141414` con texto al 26%, sin borde. Cargando: mantiene el color del botón al 22% + spinner 0,7 s lineal; el label cambia a gerundio ("Guardando").
- Éxito momentáneo: el primario pasa a "¡Listo!" 1,4 s y vuelve a reposo solo.

**Tarjetas**
- Radio 20, padding 16–18, borde 1 px al 7%. Dos tonos: `#0B0B0B` por defecto, `#0F0F0F` cuando la tarjeta es interactiva o anida contenido.
- Tarjeta métrica: etiqueta mono en mayúsculas, cifra Archivo 900 38 px con coma decimal, delta en pastilla verde/roja, sparkline de 8 barras; la última barra es oro.
- Barras del sparkline entran con `scaleY` desde abajo, 550 ms, stagger 40 ms.
- Tarjeta de ejercicio: miniatura 74 px a la izquierda (placeholder si no hay vídeo) + chips mono de series/carga/RPE.
- Tarjeta de cliente: avatar con iniciales, insignia de estado, barra de adherencia que se anima de 0 a su valor en 800 ms.
- Tarjeta de lección: anillo de progreso SVG animado con `stroke-dashoffset`, 1 s.

**Entrada de datos**
- Campo: 54 px, radio 15, fondo `#0B0B0B`. Foco = borde oro 1,5 px + etiqueta oro, 180 ms. Error = borde rojo 55% + mensaje con icono debajo.
- Etiquetas siempre encima, mono 10 px, `letter-spacing .16em`, mayúsculas.
- Stepper numérico para carga: dos botones 52 px (menos neutro, más en oro), cifra central IBM Plex Mono 34 px, paso 2,5 kg, haptic light por toque.
- RPE: escala de 10 segmentos táctiles; 1–7 en oro al 45%, 8–10 en oro pleno.
- Selector: misma altura que el campo, chevron al 45%; abre bottom sheet (se cierra en el módulo de modales).

**Filtros y estado**
- Segmentado: 46 px, fondo `#0F0F0F`, pastilla oro que se desliza con `translateX`, 320 ms; texto activo `#050505`.
- Chips multi-selección: radio 11, 9/14 de padding; seleccionado = oro 16% + borde oro 45% + texto oro. Nunca relleno oro pleno en chips.
- Insignias de estado: mono 11 px en mayúsculas sobre fondo del color al 14% — verde ACTIVO, oro EN PAUSA, rojo IMPAGO, gris ARCHIVADO.
- Pestañas: subrayado oro de 2 px que aparece por opacidad, 240 ms; inactivas al 40%.
- Interruptor: 48×29, pista oro cuando está activo, pomo blanco 23 px, 260 ms.

**Feedback**
- Barra de progreso: 6 px, radio 4, pista `#1a1a1a`, relleno oro con transición de ancho 450 ms.
- Avisos: banner de 18 px de radio con el color al 7% de fondo y al 22–24% de borde. Oro = informativo, rojo = error con acción "Reintentar" en contorno.
- Esqueletos: gradiente `#111 → #1c1c1c → #111`, barrido 1,4 s lineal, stagger 150 ms entre líneas. Nunca spinner a pantalla completa.
- Toast: anclado abajo a 24 px, `#141414`, radio 16, sombra profunda; entra con `translateY(22px) + scale(.97)` en 340 ms; se va solo a los 3,2 s; acción opcional en oro a la derecha.

**Listas y filas**
- Fila mínima 52 px; separadores de 1 px al 5%, nunca en la última fila.
- Serie completada: casilla oro con check `#050505`, fondo de fila oro al 5%, texto al 45% con tachado. Todo en 240 ms.
- Numeración de series en mono con dos dígitos (`01`).
- Fila navegable: avatar 38 px + título + subtítulo, chevron al 35%; el estado de riesgo sustituye al chevron por una insignia.
- Deslizar para borrar: la fila se desplaza 96 px y revela fondo rojo con icono e etiqueta en negro, 340 ms.
- Fila de "Añadir": borde discontinuo, icono en cuadro oro 14%, texto al 70%.

## Nutrición (aprobado)

**Tracker del día**
- El intercambio es la unidad visual. Cifra grande de "te quedan" en oro + kcal aproximadas en mono a la derecha (siempre "≈", nunca exactas).
- Tres barras (HIDRATOS · PROTEÍNA · GRASA) de 6 px: ancho interpolado 420 ms; pasarse pinta la barra roja en 300 ms y añade "+2" en rojo. Sin sacudidas.
- Lista de 5 ingestas: toque = registrar (haptic light), fila pasa a oro 5,5% + borde oro 20% + título al 50% en 240 ms; la barra se mueve después, no a la vez.
- Chips de intercambios por ingesta (`3 HC · 2 PR · 1 GR`) en mono; al registrar pasan a oro.

**Detalle de ingesta (alimentos y gramos)**
- El coach publica la dieta; el atleta no la monta desde cero: intercambia alimentos y registra.
- Fila de alimento: cuadro de 44 px con el tipo (PROT/HC/GRASA), nombre + gramos en oro mono en la misma línea, y debajo la equivalencia en lenguaje humano ("2 intercambios de proteína · 1 tarrina").
- Toque en la fila = intercambiar alimento; los gramos se recalculan para valer los mismos intercambios. Icono de intercambio en oro al 65%.
- Fila "Añadir alimento del banco" con borde discontinuo. Aviso explicativo bajo la lista, no modal.

**Hoja de ajuste de intercambios**
- Bottom sheet `#0F0F0F`, radio 26, entra en 380 ms con `translateY(26px) + scale(.985)`; arrastrar abajo cierra sin guardar.
- Un stepper por macro: cifra mono 26 px, menos neutro / más en oro, gramos aproximados en gris debajo. Haptic light por toque.
- Píldora de encaje en vivo: verde "CABE · TE QUEDARÍAN X" / rojo "TE PASAS EN X", transición de color 300 ms.

**Recetas**
- Buscador de 48 px sobre 8.850 recetas + chips; "Cabe en mi presupuesto" es el primer chip y va seleccionado por defecto.
- Escala ×0,25–×3 con paso 0,25 (haptic light por muesca): macros y kcal recalculan en vivo; píldora de encaje verde si cabe, oro si se sale.
- Favorito (corazón que se rellena en oro, 220 ms) y "no me gusta" (menos) sobre la foto, arriba a la derecha.

**Vacíos**
- Sin dieta publicada: icono en cuadro discontinuo oro, "Dani está montando tu dieta", estado "EN REVISIÓN DESDE AYER" con punto que late, y salida secundaria "Ver mi anamnesis". Ningún vacío culpa al atleta.
- Búsqueda sin resultados: consulta entre comillas angulares + chips de recuperación, incluido "Quitar presupuesto" en oro.

**Carga**
- Esqueletos con barrido de 1,4 s y stagger de 150 ms; nunca spinner ni cifras falsas.

**Celebración de día cerrado**
- Anillo SVG que se cierra en 1,1 s (`stroke-dashoffset`) + sello de check con `scale(.62)→1.07→1` a los 550 ms; título y copy entran escalonados 100 ms. Haptic success. Sin confeti.
- Tira de la semana con 7 cuadros de 34 px; los cumplidos en oro 14%, el de hoy con borde oro 55%.

**Fuera de la app**
- Isla dinámica solo 30 min antes de una ingesta: icono, "Comida en 20 min", intercambios restantes y microbarras; se cierra sola al registrar.
- Widget de bloqueo: cifra de restantes en oro + tres microbarras. Segundo widget "SIGUIENTE" con la receta y sus chips.

**Haptics**: light (stepper, muesca de escala) · medium (registrar, añadir receta) · success (día cerrado) · warning (superar una categoría).
**Gestos**: toque = registrar; toque largo = hoja de ajuste; izquierda = cambiar receta; derecha = saltar comida.

## Biblioteca de ejercicios (aprobado)

- Catálogo: buscador de 48 px con botón de filtros en cuadro oro 14%; chips de grupo en fila con scroll horizontal. Fila = miniatura 64 px + nombre + chip de grupo (oro 13%) + chip de equipamiento (blanco 5%) + chevron al 30%.
- Sin vídeo la miniatura lleva la marca `SIN VÍDEO` en mono 7 px; la ficha funciona igual, no se bloquea nada.
- Al cambiar de filtro la lista no se vacía: las filas que salen se van en 140 ms y las nuevas entran escalonadas 40 ms. La miniatura reproduce en bucle solo si la fila está a más del 60% en pantalla.
- Ficha: vídeo 16:9 en bucle sin sonido con control 0,5× / 1×; tarjeta "tu mejor serie" con delta verde y sparkline de 8 sesiones (última barra en oro); nota del coach en oro al 6% firmada con su inicial.
- Selección múltiple: el destino se elige antes y se queda fijo arriba, nunca se pregunta al final. Botón inferior deshabilitado hasta el primer ejercicio y siempre con el número ("Añadir 3 al Día 2"). Haptic light por selección, medium al confirmar, toast con "Deshacer" 3,2 s.
- Subida de vídeo en segundo plano: barra oro, "puedes seguir editando", "Cancelar" en rojo; el primario pasa a cargando con spinner y "Guardando".
- Biblioteca vacía: "Cargar los 40 base" (primario) + "Crear uno desde cero" (secundario).
- Hoja de filtros: los 14 grupos y el equipamiento como chips multi-selección, "Limpiar" arriba, recuento en el primario ("Ver 22 ejercicios").
- Copy: nombres de ejercicio tal como los dice Dani, sin abreviar en la lista.

## Cardio (aprobado · módulo nuevo)

- Jerarquía: el cardio está al servicio de la fuerza. Nunca aparece antes del entreno del día y siempre dice cuándo toca ("después de pesas"). "Mover a mañana" está a la vista: saltarlo es legítimo, no un fallo.
- Objetivo semanal en minutos, no diario. Se celebra la semana, no la sesión.
- Tres formatos: LISS por zona, HIIT por intervalos y pasos.
- Prescripción del día: chip de formato + "2 de 3 esta semana", titular Archivo 900, tres datos en mono (duración · zona FC · RPE) y nota del coach. Dos tarjetas pequeñas: pasos con objetivo y minutos de la semana en 7 microbarras.
- LISS en curso: cronómetro Archivo 900 76 px con cifras que cambian sin transición (se leen de reojo); corazón que late a la frecuencia real medida; cinco segmentos de zona (actual oro pleno, cambio 400 ms) e insignia verde EN ZONA; en zona / media / kcal aproximadas.
- HIIT: anillo de 250 px que se vacía linealmente cada intervalo (oro en trabajo, blanco 35% en descanso) y el fondo tiñe la pantalla al 4% según la fase. Cuenta atrás de 3 s antes de cada bloque con haptic light por segundo; cambio de intervalo con haptic heavy. Ocho segmentos de ronda.
- Sin pulsómetro no se pide FC, se pide RPE con la escala de 10 del entreno y una frase que traduce el número. Registrar son dos toques: tipo preseleccionado + guardar, con la duración prerrellenada y el dato en el botón ("Guardar 30 min"). "Importar de Salud / Garmin" visible abajo, nunca obligatorio.
- Resumen: anillo de 150 px con los minutos dentro + sello a los 500 ms, cuatro filas de datos y distribución por zonas en 5 barras. Haptic success solo al cerrar la semana.
- Warning solo si se sale de zona más de 30 s seguidos, y una sola vez, no en bucle.
- Fuera de la app: isla dinámica con ronda, fase (cambia de color), cronómetro y segundos grandes, que vibra en cada cambio; pantalla bloqueada con widget grande (cronómetro, ppm, zona) y dos pequeños (pasos, minutos de semana).

## Navegación

**Barra inferior**
- Cinco pestañas: Hoy · Rutinas · Academia · Nutrición · Perfil. Alto 78 px con fondo `rgba(8,8,8,.92)` + desenfoque y línea superior al 7%.
- Icono 22 px de trazo (1,9), etiqueta 10 px, punto oro de 4 px bajo la activa. Activa en oro; inactiva al 38%.
- Al activarse: icono sube 1 px, el punto escala de .2 a 1 (220 ms) y el contenido hace fundido hacia arriba de 280 ms. Sin deslizamiento lateral entre pestañas.
- Insignia numérica roja arriba a la derecha del icono; nunca más de dos dígitos.

**Cabecera**
- Dos estados. Reposo: título Archivo 900 a 46 px en dos líneas. Desplazado (> 30 px): el título grande se desvanece subiendo 8 px y aparece el título compacto de 15,5 px en la barra, con línea de 1 px. 300 ms en ambos sentidos.
- La barra superior siempre lleva fondo con desenfoque para que el contenido pase por debajo.
- Retroceso a la izquierda (36 px), acción contextual a la derecha en oro. Nunca más de una acción en la cabecera.

**Lista → detalle**
- El detalle entra desde la derecha en 340 ms con sombra propia; la lista retrocede 40 px y baja al 60% de opacidad. Al volver, se invierte.
- Volver siempre con etiqueta del origen ("‹ Clientes"), no solo la flecha.
- El detalle abre con cabecera de identidad + tres métricas en fila + pestañas internas.

**Búsqueda**
- Campo de 48 px que crece a 54 px al enfocar, con borde e icono en oro (200 ms). "Cancelar" aparece a la derecha.
- Sin foco muestra búsquedas frecuentes como chips; con consulta, resultados con etiqueta de tipo (CLI / EJ / LEC) en cuadro mono.
- Resultados entran escalonados 40 ms. Vacío: icono en cuadro discontinuo + consulta entre comillas angulares + sugerencia de qué probar.

**Avance en sesión**
- Progreso por segmentos táctiles (uno por ejercicio): hechos en oro al 45%, actual en oro pleno, pendientes `#1c1c1c`.
- Cambio de ejercicio: la ficha entra 34 px desde el lado del avance en 340 ms. Retroceder invierte la dirección.
- El registro vive en la misma pantalla del ejercicio, debajo de la prescripción: tabla de series con cabecera mono (Nº · REPS · KG · RPE) y casilla de 26 px a la derecha.
- La serie siguiente se anticipa: número en oro y casilla con borde oro al 55%. Serie hecha: fondo oro al 6%, valores en blanco y RPE relleno.
- Al marcar una serie arranca el descanso (90 s) en una pastilla oro bajo la tabla, con punto que late y opción "Saltar". Al llegar a cero desaparece sola.
- Desmarcar una serie es posible tocándola de nuevo; no hay confirmación.
- Pie fijo con degradado hacia el fondo: retroceso cuadrado de 56 px (al 35% si no hay anterior) + primario oro que cambia a "Terminar sesión" en el último.

**Índice de Academia**
- Acordeón con un solo módulo abierto a la vez. Plegado 300 ms, chevron gira 180°, lecciones entran escalonadas 40 ms.
- Número de módulo en cuadro de 34 px: oro pleno si está abierto, oro al 13% si está empezado, gris si no.
- Estado por lección con punto de 8 px: relleno oro = hecha, contorno oro = en curso, contorno gris = pendiente.
- Barra de progreso global del curso siempre visible bajo el título.

**Reglas transversales**
- El oro nunca es decorativo: solo acción, selección o el dato destacado.
- Máximo un color de acento por pantalla además del oro.
- Todos los objetivos táctiles ≥ 44 px.
- Entradas escalonadas de 40–50 ms con `cubic-bezier(.2,.9,.2,1)`; salidas siempre más rápidas que las entradas.

## Bienvenida guiada / tutorial (aprobado · módulo nuevo)

- Arranca cuando el coach publica el plan y el atleta cierra la pantalla de espera, después del onboarding de preguntas. No recoge datos: explica la app.
- Dani habla en primera persona en los 17 pasos. La app nunca se explica a sí misma.
- Regla de ritmo: al entrar en una sección nueva se enseña la pantalla entera primero (cartel con el nombre + recorrido de scroll de ~1,8 s) y solo después entra el foco. Si el paso siguiente vive en la misma pantalla, el foco se mueve sin repetir el paseo.
- Foco recortado `0 0 0 9999px rgba(0,0,0,.62)` con borde oro al 55%, medido del elemento real en tiempo de ejecución. Gesto fantasma en bucle de 1,1 s sobre el punto que hay que tocar.
- Dos pasos exigen una acción real: marcar una serie y registrar una ingesta. El primario está deshabilitado hasta que se hace y su label dice qué tocar.
- Los pasos que piden algo (fotos, permisos) llevan "Ahora no" y no bloquean.
- Sin datos todavía se enseña un ejemplo marcado `EJEMPLO`; el aviso desaparece con el primer dato real y no vuelve.
- Cierre con anillo + sello, haptic success y checklist de tres primeros pasos que se queda en Hoy. Repetible desde Perfil › Ayuda.

## Cambio global posterior — RIR sustituye a RPE

- En fuerza la escala es **RIR** (repeticiones en reserva, 0–5). Afecta a la tabla de series, los chips de prescripción, las tarjetas de ejercicio, la Academia y el checklist del tutorial.
- En cardio sin pulsómetro se mantiene una escala de esfuerzo 1–10, pero el campo se llama **ESFUERZO**.
- Los prototipos de Componentes, Sesión y Biblioteca todavía dicen RPE y hay que actualizarlos. El de Tutorial ya está en RIR y manda.

## Registro editable en la sesión

- La serie activa tiene un editor con tres steppers —REPS, KG, RIR— bajo la tabla, con la etiqueta "SERIE nn · APUNTA LO QUE HAS HECHO". El de KG lleva borde oro y es el que se enseña en el tutorial. Paso 2,5 kg en carga, 1 en reps y RIR.
- Los valores vienen prerrellenados con los del último día y el atleta corrige. **Esto contradice el acta anterior**, que decía campo vacío con el valor de la última vez en gris debajo: pendiente de decidir cuál gana (ver `Antes-de-Claude-Code.md`).
