# BLOQUE 07 — Visual, UX y accesibilidad en dispositivo

<!-- Pégale este texto a una sesión nueva apuntando al repo ~/en-forma, rama ds/f3-experiencia. -->

Eres un diseñador de producto revisando **En Forma** antes de su primera subida a la App Store y a
Google Play. La app se ha desarrollado y auditado **en el navegador**, a 375 px. Este bloque
revisa lo que cambia al meterla dentro de un móvil de verdad: recortes, safe areas, teclado,
gestos, y todo lo que un usuario nuevo se encuentra el primer día.

**Solo lectura**: no corrijas nada. Cada hallazgo lleva la pantalla, la captura, `archivo:línea`
de la causa cuando la localices, el cambio propuesto y severidad (Bloqueante / Alta / Media /
Baja / Info). Marca `verificado` (lo viste) o `sospecha` (lo dedujiste del código).

## Qué está dentro y qué no

Este bloque **no rediseña**. Las fases F12–F15 del Design System y la auditoría visual con Claude
Design siguen abiertas por otra vía (`DESIGN_SYSTEM_STATUS.md`), y duplicar ese trabajo aquí solo
crea conflicto. La línea:

- **Dentro**: lo que rompe, confunde, impide usar la app o incumple una pauta de plataforma.
- **Info, y se remite a Claude Design**: lo puramente estético — que un espaciado quede corto, que
  un color no acabe de convencer, que un componente pudiera ser más bonito.

Contexto previo que **no hay que repetir**: `docs/auditoria-visual/hallazgos.md` recoge 12
hallazgos (P0-1 a P2-1) ya corregidos, todos vistos en navegador a 375 px. Si alguno reaparece en
el móvil, es un hallazgo nuevo y se dice que es una reaparición.

---

## 1. Lo que solo se ve en el dispositivo

Ejecuta la app en el **simulador de iOS** y recorre todo lo accesible sin sesión iniciada; lo de
detrás del login va al checklist de Dani con instrucciones concretas (Claude nunca escribe
contraseñas: regla dura, sin excepciones).

- **Safe areas.** Notch e isla dinámica arriba, indicador de inicio abajo. Comprueba en varios
  tamaños: iPhone SE (el más estrecho, 375 px, el caso de diseño), un iPhone estándar y un Pro Max.
  Busca contenido bajo la barra de estado, barras de navegación pegadas al borde inferior, y
  botones que caen sobre el indicador de inicio.
  - Verifica cómo se resuelve hoy en el código: `env(safe-area-inset-*)`, `viewport-fit=cover` en
    `index.html`, y qué hace `PageHeader.tsx` — que se tocó esta misma semana.
- **Teclado.** El caso que más molesta y el más olvidado: abrir cada formulario largo (onboarding,
  registro de series, cuestionarios, formularios del CRM) y comprobar que **el campo activo no
  queda tapado** y que se puede hacer scroll con el teclado abierto. Mira también el tipo de
  teclado: los campos numéricos (peso, repeticiones, kilos) deberían abrir el teclado numérico.
- **Rebote de scroll** y scroll dentro de scroll: hojas modales, listas dentro de pestañas.
- **Gesto de volver atrás** deslizando desde el borde izquierdo: en una SPA con React Router puede
  no hacer nada, o sacar al usuario de la app. Compruébalo, y compruébalo también con hojas
  modales abiertas.
- **Rotación.** El `Info.plist` declara los tres modos de iPhone y los cuatro de iPad. Gira la
  pantalla en cada sección: si el layout no soporta apaisado, o se bloquea la orientación o se
  arregla — declarar y no soportar es rechazo fácil (dato para el bloque 02).
- **iPad.** `TARGETED_DEVICE_FAMILY = "1,2"` incluye iPad. Ábrela en un iPad del simulador y
  documenta con capturas cómo se ve una app diseñada a 375 px estirada a 1024. Esa evidencia es lo
  que sostiene la decisión del bloque 02.
- **Modo oscuro y claro.** `backgroundColor: '#050505'` en `capacitor.config.ts` sugiere que la app
  es oscura siempre. Comprueba qué pasa con el dispositivo en modo claro, y si la barra de estado
  queda legible.

## 2. Accesibilidad

Apple y Google no rechazan por accesibilidad, pero sí llegan reseñas por ella, y algunas cosas
son fallos funcionales:

- **Targets táctiles de 44 × 44 pt** (Apple) / 48 dp (Android). Mide los sospechosos: iconos de
  cerrar, pestañas, botones de más y menos en las series, casillas de adherencia. Un botón de 24 px
  en una app que se usa **con las manos sudadas en mitad de una serie** es un problema real, no
  teórico.
- **Contraste.** Los tokens del Design System ya pasaron por la migración, pero mídelos en la app
  compilada: texto secundario sobre fondo oscuro, texto sobre el color de acento (`#FFC72C`, un
  amarillo, es el caso peligroso), y los estados deshabilitados. Ratio real, con número.
- **Dynamic Type.** Sube el tamaño de letra del sistema a los últimos pasos y recorre la app.
  Busca texto cortado, botones que se desbordan y layouts que se rompen. Es un ajuste común en
  gente mayor de 45, que es parte del público.
- **VoiceOver** en los recorridos críticos: acceso, registrar una serie, marcar adherencia.
  Etiquetas en los iconos sin texto, orden de foco, y si los estados se anuncian.
- **`prefers-reduced-motion`**: `src/components/ui/internal/useReducedMotion.ts` ya existe.
  Comprueba que se respeta de verdad en las animaciones.
- **Color como único portador de información**: gráficas, estados de adherencia, píldoras de
  estado del CRM. Si quitas el color, ¿se entiende?

## 3. UX del primer día

Lo que decide si un cliente nuevo se queda:

- **Primera apertura**: qué ve alguien que acaba de instalar la app y no tiene invitación. Hoy no
  hay auto-registro, así que la pantalla de bienvenida tiene que explicarlo sin dejarlo atascado.
- **Onboarding del atleta**: seis pasos. Que se entienda por qué se pide cada dato, que se pueda
  volver atrás, y que se vea el progreso.
- **Estados vacíos**: atleta sin entrenamiento asignado, sin dieta, sin fotos, sin histórico. Cada
  hueco tiene que decir qué pasa y qué hacer.
- **Estados de carga**: pantallas en blanco frente a esqueletos.
- **Estados de error**: cuando algo falla, ¿el usuario se entera y sabe qué hacer? Ojo especial al
  **modo local degradado** (`LocalModeBanner`), donde la app sigue pareciendo normal aunque no esté
  guardando: mira si el banner se entiende sin saber de programación.
- **Textos**: revisa los mensajes de error de verdad. Los códigos de Firebase asomando
  (`auth/operation-not-allowed`, `permission-denied`) son fallos de producto.
- **Acciones destructivas**: borrar una foto, un entrenamiento, un cliente. ¿Confirman? ¿Se puede
  deshacer?
- **Consistencia** entre la UI del atleta y la del coach: mismos patrones para las mismas cosas.

## 4. Capturas y ficha de tienda

Cierra con el inventario de lo que hay que preparar. Consulta los requisitos vigentes, que cambian:

- **App Store Connect**: tamaños de captura obligatorios hoy, cuántas por tamaño, y **si hace falta
  juego de iPad** (depende de la decisión del bloque 02). Texto promocional y vídeo, si procede.
- **Google Play**: icono, gráfico destacado, capturas de teléfono y de tablet.
- **Qué pantallas contar.** Elige las que enseñan el valor de la app —entrenamiento en curso,
  progreso, plan de nutrición, seguimiento del coach— y no las de configuración. Propón el orden y
  el titular de cada una.
- **Cómo capturarlas**: se pueden tomar del simulador a la resolución exacta que pide cada tienda.
  Deja el procedimiento escrito, con qué cuenta y qué datos deben verse (nada de datos reales de
  clientes en capturas públicas — importante, son datos de salud).

---

## Entregable

Escribe tu parte en `docs/revision-pre-store/informe.md` con ids `07-1`, `07-2`…

Incluye:
- **Capturas** de cada hallazgo visual, guardadas en `docs/revision-pre-store/capturas/`, con el
  dispositivo y el tamaño anotados. Un hallazgo visual sin captura no se puede evaluar.
- **Tabla de dispositivos recorridos**: dispositivo · tamaño · pantallas vistas · veredicto.
- **Lista de capturas de tienda** a producir, con la pantalla, el titular y el tamaño.

Lo que exija sesión iniciada, dispositivo físico o ajustes del sistema (Dynamic Type, VoiceOver)
va a `docs/revision-pre-store/checklist-dani.md` con los pasos exactos.
