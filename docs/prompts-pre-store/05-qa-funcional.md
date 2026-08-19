# BLOQUE 05 — QA funcional

<!-- Pégale este texto a una sesión nueva apuntando al repo ~/en-forma, rama ds/f3-experiencia. -->

Eres el responsable de QA. Vas a recorrer **En Forma** de punta a punta buscando lo que se rompe,
se pierde o deja al usuario atascado, antes de la primera subida a las tiendas. No buscas
opiniones de diseño (eso es el bloque 07): buscas **fallos**.

**Trabaja en solo lectura sobre el código.** Ejecutar la app sí; modificarla no. Cada hallazgo
lleva los pasos exactos para reproducirlo, lo que pasa, lo que debería pasar, `archivo:línea` de
la causa si la localizas, y severidad (Bloqueante / Alta / Media / Baja / Info). Marca cada uno
como `verificado` (lo ejecutaste) o `sospecha` (lo dedujiste del código).

---

## Antes de nada: el reparto del trabajo

Esta es la parte que hace el bloque ejecutable, y hay que respetarla.

**Puedes hacer tú:**
- Compilar y lanzar la app en el **simulador de iOS**, capturar pantalla, tocar y escribir.
- Recorrer la **app web** con el navegador (`npm run dev`, configuración `en-forma-dev` de
  `.claude/launch.json`, puerto 3000) — la misma base de código.
- Todo lo **anterior al login**: pantalla de bienvenida, estados de error de acceso, arranque en
  frío, primera apertura.
- Leer el código para deducir comportamiento, y ejecutar la suite (`npm test`, 384 pruebas).

**No puedes hacer tú, y no lo intentes:**
- **Nada detrás de una sesión iniciada.** Claude nunca escribe contraseñas: regla dura, sin
  excepciones, ni con autorización explícita. Si necesitas una sesión, la abre Dani.
- **Nada de BLE.** El simulador no tiene Bluetooth; hace falta banda cardíaca real y iPhone
  físico.
- Notificaciones y temporizador en segundo plano de forma realista: el simulador miente sobre
  suspensión de procesos.

Lo que no puedas hacer **no se omite**: se convierte en un punto del checklist de Dani con los
pasos exactos, qué mirar y qué sería un fallo. Un recorrido que él pueda ejecutar en veinte
minutos vale más que una lista de deseos.

**Arrastra, no dupliques:** `docs/QA-pendiente-dani.md` § 3 ya tiene puntos de QA visual abiertos
(punto rojo del catálogo de máquinas, «Mi gimnasio», tarjeta de Equipamiento, ajustes de Máquinas,
invitar atleta). Reférencialos, no los reescribas.

---

## 1. Recorridos completos

Para cada uno: llegar hasta el final y comprobar que **el dato se guarda y se vuelve a leer**.

**Atleta**
- Primera apertura → invitación → alta → **asistente de onboarding** de 6 pasos → primera pantalla
  útil. Es el recorrido que decide si un cliente nuevo se queda.
- Entrenamiento entero: elegir sesión, registrar series con peso y repeticiones, temporizador de
  descanso, terminar, y **volver a abrirlo** para ver el histórico.
- Nutrición: menú del día, marcar adherencia, recetas, preferencias de alimentos, verduras.
- Cuestionarios: los tipos de pregunta, en especial **`metric`** (medición corporal) y **`media`**
  (archivo), que estuvieron rotos hasta el merge del 8 de agosto y son de los más frescos.
- Fotos de progreso: subir, comparar, borrar.
- Cardio: pantalla, zonas, histórico (lo que se pueda sin banda).
- Roadmap, retos, check-in semanal, academia.
- Asistente de IA desde el lado del atleta, si lo tiene.

**Coach**
- Hub del cliente y sus pestañas, análisis, revisiones.
- Crear y asignar entrenamientos, mesociclos, plantillas.
- Dietas, periodización nutricional, informes.
- CRM: alta de cliente, servicio, suscripción, cobro, importación desde fichero.
- Asistente de IA con herramientas: que lo que ejecuta se refleje de verdad en Firestore.
- Catálogo de máquinas y ajustes.

## 2. Los estados que siempre se olvidan

Aquí es donde salen los fallos de verdad, y casi todos se pueden probar en el simulador **sin
sesión** o con la sesión que abra Dani:

- **Sin red / modo avión.** Qué se ve, qué se puede seguir haciendo, y qué pasa con lo escrito sin
  conexión cuando vuelve. Presta atención al **modo local degradado** (`forceLocalOnly`,
  `LocalModeBanner`): la app sigue pareciendo normal escribiendo solo en `localStorage`. Si eso
  pierde datos, es Bloqueante.
- **Red lenta.** Estados de carga: ¿aparecen, o hay pantallas en blanco?
- **Permisos denegados**: Bluetooth, notificaciones, cámara. Denegar cada uno y comprobar que la
  app lo explica en vez de romperse. Ojo con la cámara: hay `<input type="file" capture>` en cuatro
  pantallas y faltan las claves de uso en `Info.plist` (bloque 02) — en iOS eso **mata el proceso**.
- **App matada y reabierta a mitad de entrenamiento.** ¿Se pierden las series registradas?
- **Segundo plano largo**: temporizador de descanso corriendo, app al fondo diez minutos, volver.
- **Llamada entrante o alarma** durante el temporizador.
- **Sesión caducada** a mitad de uso.
- **Datos vacíos**: atleta recién creado sin nada asignado. Todas las pantallas deberían tener un
  estado vacío que explique qué hacer, no un hueco.
- **Datos grandes**: atleta con un año de histórico, coach con muchos clientes. Busca dónde se
  degrada.

## 3. Fallos de datos

- **Escrituras que fallan en silencio.** `src/dbService.ts` y `src/db/` tragan errores y caen a
  local por diseño. Localiza dónde **una escritura fallida se muestra como éxito** al usuario: eso
  es pérdida de datos percibida como guardado. Es el patrón que más daño hace en una app de
  seguimiento.
  - Antecedente: se corrigió en agosto para el catálogo (`project_p0_2_errores_honestos`), pero
    comprueba si el patrón queda en otros módulos.
- **Números y unidades**: kilos con decimales, coma frente a punto, campos negativos, cero.
- **Fechas y zona horaria**: cambios de día, semanas que empiezan en lunes, DST.
- **Concurrencia**: coach y atleta editando lo mismo a la vez.
- **Textos largos** en campos libres, y caracteres especiales o emoji en nombres.

## 4. La suite de pruebas

- Ejecuta `npm test` (384 pruebas) y `npx tsc --noEmit`. Reporta el resultado real.
- **Qué cubre y qué no.** 37 ficheros de prueba para 352 de código. Identifica los caminos críticos
  **sin cobertura**: guardado del onboarding, registro de series, borrado, y las reglas de
  Firestore (que se pueden probar con el emulador). No es un hallazgo de tienda, pero sí de riesgo
  antes de publicar.

---

## Entregable

Escribe tu parte en `docs/revision-pre-store/informe.md` con ids `05-1`, `05-2`…

Incluye una **tabla de cobertura del recorrido**: recorrido · lo probó Claude / lo prueba Dani / no
se probó · resultado. La tercera columna es tan importante como las otras dos: **un informe que no
diga qué se quedó sin probar se lee como si lo hubiera probado todo**.

El recorrido de Dani va a `docs/revision-pre-store/checklist-dani.md` en casillas marcables, con
los pasos exactos y qué contaría como fallo en cada uno. Ordénalo para que se pueda hacer del
tirón, sin saltar entre cuentas más de lo necesario.
