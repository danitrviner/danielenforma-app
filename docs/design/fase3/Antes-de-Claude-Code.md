# Antes de pasarlo a Claude Code

Revisión exigente del paquete de Fase 3. Tres partes: lo que se contradice, lo que falta y lo que hay que decidir. Nada de esto es opcional si queremos que Claude Code implemente sin inventar.

---

## 1. Conflictos con el documento actual

**1.1 RIR vs RPE.** El acta y el README cierran Fase 3 con RPE en todos los módulos de fuerza. La decisión nueva es RIR. Afecta a cuatro sitios que hoy dicen lo contrario:
- Componentes → «RPE: 10 segmentos táctiles, 1–7 oro 45%, 8–10 oro pleno». Con RIR el rango es 0–5 y la lógica de color se invierte (RIR bajo = serie dura). El componente hay que rediseñarlo, no renombrarlo.
- Sesión → cabecera de tabla `Nº · REPS · KG · RPE` y «RPE relleno» en la serie hecha.
- Biblioteca → chips de serie/carga/RPE en tarjeta y ficha.
- Cardio → «RPE 4–5» en la prescripción y la escala de 10 del registro sin reloj. Aquí la escala 1–10 se queda pero pasa a llamarse ESFUERZO.

**Los prototipos siguen diciendo RPE.** Solo `Tutorial - Experiencia.dc.html` está actualizado. Si esto va a Claude Code hoy, implementará las dos cosas a la vez.

**1.2 Valores prerrellenados vs campo vacío.** El acta dice: campo vacío con el valor de la última vez en gris debajo. El tutorial enseña la serie con reps, kg y RIR ya puestos y el atleta corrige. Son dos productos distintos: uno pide teclear, el otro pide confirmar. Hay que elegir uno.

**1.3 El editor de serie no estaba en Fase 3.** El tutorial introduce un bloque de tres steppers bajo la tabla. El acta solo tenía «stepper de carga» como componente suelto, sin decir dónde vive ni si edita las tres columnas. Queda documentado, pero conviene validarlo contra la sesión real: en un móvil, tabla + editor + descanso + pie fijo compiten por el alto.

**1.4 «Un solo primario por pantalla».** Durante el tutorial hay dos acciones oro simultáneas: el primario de la hoja de Dani y el elemento enfocado (por ejemplo «Empezar sesión»). Es deliberado, pero rompe la regla escrita. Hay que decir explícitamente que la hoja del tutorial se exceptúa, o atenuar el primario de debajo.

**1.5 Zona FC y RIR conviven en cardio.** La prescripción de cardio muestra ZONA FC y ESFUERZO a la vez. Falta la regla de qué se enseña cuando el atleta no tiene pulsómetro: hoy el panel muestra los dos campos siempre.

---

## 2. Pantallas que faltan por supervisar

Lo que el atleta toca a diario y todavía no tiene módulo de experiencia:

| Pantalla | Estado | Por qué bloquea |
|---|---|---|
| Login y registro | Sin diseñar | Es la primera pantalla de la app |
| Onboarding / anamnesis | Sin diseñar | El tutorial asume que ya ocurrió |
| Pantalla de espera («Dani está montando tu plan») | Sin diseñar | Es el disparador literal del tutorial |
| Home Atleta (Hoy) | Solo aparece de refilón en Navegación y Tutorial | Es la pantalla más vista de la app |
| Rutinas (pestaña completa) | Solo la vista de lista del tutorial | Es una de las cinco pestañas |
| Perfil / progreso / fotos | Solo el paso 15 del tutorial | Recoge peso y fotos: hay flujo de cámara, privacidad y recordatorio |
| Chat coach–atleta | Solo el paso 14 del tutorial | Incluye envío de vídeo para corrección de técnica |
| Reproductor de lección de Academia | Solo el índice | El índice existe, la lección no |
| Perfil › Ayuda | Mencionado, sin diseñar | Es donde vive la repetición del tutorial |
| Notificaciones y permisos | Solo el paso 16 | Hay que definir qué avisos existen y su copy |
| Revisiones / check-ins semanales | Sin diseñar | Es el bucle de ajuste del plan |
| Errores, offline y sesión caducada | Sin diseñar en ningún módulo | Hoy no hay ni un solo estado de fallo de red |
| Toda la vista coach | Sin diseñar en Fase 3 | Home Coach, ClientHub, CRM, Ajustes |

Prioridad si hay que elegir: **pantalla de espera → Home Atleta → Rutinas → Perfil/progreso → estados de error**. Sin las tres primeras, el tutorial no tiene dónde aterrizar.

---

## 3. Lo que falta que no es una pantalla

**3.1 Contrato de datos.** El paquete es 100 % visual. No hay nombres de campo, ni colecciones, ni forma de los documentos. Claude Code va a inventar el esquema. Hace falta, como mínimo: `serie {reps, kg, rir, hecha, timestamp}`, `ingesta {intercambios{hc,pr,gr}, alimentos[], registrada}`, `sesionCardio {tipo, minutos, esfuerzo, fcMedia, zonas[]}`, `plan {bloque, dias[], semanas}` y el estado del tutorial. Una página basta.

**3.2 Reglas de cálculo.** Está el ratio de intercambios (1 = 100 kcal; HC 25 g, PROT 25 g, GRASA 11 g) pero no la regla de redondeo al intercambiar un alimento, ni qué pasa con los decimales de gramos, ni cómo se recalcula una receta escalada ×0,25. Es la parte que más se puede implementar mal en silencio.

**3.3 Copy real.** Todo el texto de los prototipos es de muestra. Falta el copy definitivo de: estados vacíos, errores, notificaciones, los 17 pasos del tutorial y los nombres de los 40 ejercicios base.

**3.4 Assets.** Sigue pendiente todo: vídeos de ejercicio, fotos de receta, set de iconos y las tres fuentes empaquetadas.

**3.5 Accesibilidad.** No hay una sola decisión escrita sobre tamaño de texto dinámico, contraste del oro sobre negro (`#FFC72C` sobre `#050505` pasa, pero el texto al 26% del botón deshabilitado no), lectores de pantalla ni «reducir movimiento» — que con este nivel de animación es obligatorio.

**3.6 Orden de implementación.** El handoff no dice por dónde empezar. Propuesta: Componentes → Navegación → Sesión → Nutrición → Cardio → Biblioteca → Tutorial. El tutorial va el último por definición: enseña pantallas que tienen que existir.

---

## 4. Decidido (07/08/26)

1. **RIR 0–5 en seis segmentos táctiles**, no un stepper suelto y no los diez de antes reetiquetados. El color se invierte respecto al RPE: RIR 0–1 en oro pleno (serie dura), 2–3 en oro al 45%, 4–5 en oro al 25%. Cada segmento ≥ 44 px. En el editor de la serie el RIR se toca con stepper porque no cabe la escala; al pulsar la cifra se abre la escala completa.
2. **La tabla de series viene prerrellenada** con lo del último día y el atleta corrige. El acta anterior queda anulada en este punto.
3. **El tour no se puede saltar la primera vez.** Solo los pasos que piden algo llevan «Ahora no», que avanza al siguiente paso.
4. **El permiso de notificaciones se pide en el paso 16**, en contexto.
5. **Sin plan publicado el tutorial no arranca**: pantalla de espera.
6. **Contrato de datos escrito** en `Contrato-de-datos.md`, con reglas de cálculo de intercambios incluidas.

## 5. Preguntas que siguen abiertas

1. ¿Los 17 pasos son la versión final, o hay secciones que prefieres sacar del tour y dejar en Academia?
2. Los tres prototipos que siguen en RPE (Componentes, Sesión, Biblioteca), ¿los actualizo a RIR antes de pasar nada, o se corrige en el código?
3. ¿Qué pasa con una serie al fallo: RIR 0 o campo vacío? Cambia la tabla y el chip de prescripción.
