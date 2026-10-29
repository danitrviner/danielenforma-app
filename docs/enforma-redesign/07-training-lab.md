# Training Lab · cómo funciona

**L-01.** Documenta lo que ya existe, leído del código del worktree `redesign-1a` (22-oct-2026). No cambia nada de la app. Lo que falta o es incómodo está en la sección 8.

## 1. Qué es

La academia de vídeo de la app: **cursos**, con **lecciones** que son un vídeo de YouTube o Vimeo. El coach los crea, los publica y decide quién entra. El atleta los ve, los completa y retoma donde lo dejó.

- **Atleta:** botón «+» de la barra → Herramientas → Training Lab (ruta `/academy`, `AcademyScreen`). Si el coach no le ha dado acceso, la fila sale atenuada: «Tu entrenador aún no te ha dado acceso».
- **Coach:** Biblioteca → Training Lab (ruta `/library/academia`, `AcademyCoachScreen`), con tres pestañas: **Cursos**, **Lecciones** y **Acceso**.

## 2. Qué se guarda (Firestore)

| Colección | Qué lleva | Quién escribe |
|---|---|---|
| `academyCourses` | título, descripción, categoría, orden, **publicado**, **regla de desbloqueo**, nº de lecciones, portada | coach |
| `academyLessons` | curso, título, orden, proveedor y id del vídeo; opcionales: descripción, duración, descargables, regla propia | coach |
| `academyAccess/{email}` | si el atleta tiene acceso (`enabled`), y opcionalmente a qué cursos (`grantedCourses`) | coach |
| `academyProgress/{email}` | lecciones completadas con su fecha, % de cada curso, última lección y último curso | el propio atleta (y el coach) |

Reglas (`firestore.rules`): cursos y lecciones los lee cualquier usuario de la app y solo los escribe el coach. Acceso: lo lee el coach o el propio atleta y solo lo escribe el coach. Progreso: lo lee y escribe el propio atleta o el coach.

Tipos en `src/types.ts` (`AcademyCourse`, `AcademyLesson`, `AcademyAccess`, `AcademyProgress`, `UnlockRule`). Acceso a datos en `src/db/academy.ts`.

## 3. Crear y publicar (coach)

1. **Crear el curso** (pestaña Cursos → «Nuevo curso»): título, descripción, categoría (entrenamiento, nutrición, fisiología, biomecánica, mentalidad, recuperación) y **regla de desbloqueo** (sección 5). Nace como **Borrador**.
2. **Portada:** pulsar la miniatura y subir una imagen (se comprime a 1.600 px). Sin foto se usa una portada generada por categoría, que ya es válida.
3. **Crear lecciones** (pestaña Lecciones → «Nueva lección»): curso, título y el **enlace o id del vídeo**. Si pegas la URL de YouTube o Vimeo, la app detecta sola el proveedor y el id. El **orden es el de creación**: la primera lección que creas es la 1. El contador de lecciones del curso se actualiza solo.
4. **Publicar:** en la lista de cursos, pulsar la etiqueta **Borrador / Publicado**. Solo los publicados llegan al atleta.
5. **Dar acceso** (pestaña Acceso): cada atleta activo tiene un botón «Sin acceso / Acceso activo», y se puede seleccionar a varios y pulsar «Conceder a N seleccionados». Al conceder, el atleta recibe la notificación «Training Lab desbloqueado».

**Cuándo ve el atleta un cambio.** Cursos y lecciones se guardan en el dispositivo con un sello de versión (`catalogos/{nombre}`): cada escritura del coach sube la versión y el atleta descarga la colección de nuevo la próxima vez que la consulta. No hace falta ejecutar nada. Puede tardar hasta que el atleta vuelva a abrir Training Lab.

## 4. Qué ve el atleta

1. **Sin acceso** (o sin doc de acceso): pantalla «Training Lab aún no disponible».
2. **Con acceso:** solo cursos **publicados**. Si el coach rellenó `grantedCourses`, solo esos.
3. **Portada de «Sigue donde lo dejaste / Empieza por aquí»:** lleva a la primera lección sin completar del último curso tocado. No ofrece nada si ese curso está terminado.
4. **Rejilla por categoría.** Un curso bloqueado se ve en gris, con candado y el motivo («Se desbloquea en 3 días»); no se puede abrir.
5. **Dentro de un curso:** portada, barra de progreso («4 de 8 lecciones · 50 %») y la lista de lecciones, cada una con su candado si procede.
6. **Reproductor:** vídeo incrustado con velocidad 1× o 2×, descripción y descargables (PDF o enlace). Al terminar, el atleta marca la lección como completada y puede pasar a la siguiente.
7. **Al completar un curso entero** se añade un hito en su Road map: «Completaste el curso "…"».

## 5. Desbloqueo (`utils/academyUnlock.ts`)

Cada curso tiene **una** regla; una lección puede tener la suya y **sustituye** a la del curso.

| Regla | Se desbloquea cuando… | Qué dice si no |
|---|---|---|
| **Inmediato** | siempre | — |
| **Días desde el alta** (N) | han pasado N días desde `createdAt` de su perfil; sin fecha de alta, no bloquea | «Se desbloquea en N días» |
| **Nivel mínimo** (N) | `profile.level` ≥ N. El nivel son los peldaños de la escalera del Road map que lleva alcanzados (ya no es XP por ver vídeos) | «Te faltan N niveles de tu escalera» |
| **Requiere otro curso** | ese curso está al 100 % | «Completa antes "…"» |

Se evalúa **en el dispositivo**, contra el perfil y el progreso del propio atleta. No se protege en servidor porque el contenido (ids de vídeo) no es sensible.

## 6. Cómo se completa y se mide el progreso

- Al marcar una lección, `markLessonComplete` guarda la fecha, recalcula el % del curso (completadas ÷ lecciones del curso) y apunta la última lección y el último curso.
- El % se **guarda** al completar cada lección y se calcula con las lecciones que existen en ese momento. Si se añade una lección a un curso ya terminado, el % guardado no cambia hasta que el atleta complete otra; mientras, el «N de M lecciones» sí cuenta la nueva y el prerrequisito sigue viendo el 100 %.

## 7. Contenido planificado

El currículo de formación del cliente está escrito en la bóveda (`01-Mi-Negocio/Producto-EnForma-App/training-lab-plan-formacion-cliente.md` y `training-lab-guiones-curso-1…6.md`): **6 cursos, 32 lecciones, unos 89 minutos**, con desbloqueo gradual (inmediato, 3, 5, 10 y 21 días, y un prerrequisito). El curso 1 es autónomo: puede publicarse solo. El curso 5 (cardio) se publica con 4 lecciones, porque el pulsómetro en vivo solo existe en la app nativa. **Nada grabado todavía.**

### Pasos para publicar el curso 1
1. Grabar y subir los vídeos como **no listados** (YouTube) o privados (Vimeo).
2. Biblioteca → Training Lab → Cursos → «Nuevo curso» (regla Inmediato) y subir la portada.
3. Pestaña Lecciones: crear las lecciones **en el orden en que deben verse**, pegando la URL de cada vídeo.
4. Mirarlo como atleta (cuenta de pruebas) antes de publicar.
5. Pulsar **Borrador → Publicado**.
6. Pestaña Acceso: conceder a los atletas (se puede en bloque).

## 8. Huecos y cosas incómodas hoy (sin arreglar)

1. **Editar:** un curso o una lección **no se pueden editar** una vez creados (ni título, ni regla, ni orden). Solo se puede cambiar la portada y publicar/despublicar. Para corregir hay que borrar y crear de nuevo.
2. **Orden de las lecciones:** no se puede reordenar; es el de creación.
3. **Campos que existen pero no tienen pantalla:** descripción de la lección, duración, descargables (PDF/enlace) y regla de desbloqueo por lección. Hoy solo se rellenan escribiendo en Firestore.
4. **Prerrequisito:** hay que escribir a mano el **id** del otro curso, que no se ve en ninguna pantalla.
5. **Borrar un curso no borra sus lecciones:** quedan huérfanas en `academyLessons`.
6. **Acceso por curso (`grantedCourses`):** el atleta lo respeta, pero el coach no tiene dónde ponerlo; solo hay acceso a todo o a nada.
7. **La lista de lecciones del coach es plana**, sin agrupar por curso.
8. **El desbloqueo no se comprueba en servidor** (decisión consciente, ver sección 5).
9. **Si se añade una lección a un curso ya terminado**, el % guardado y el contador «N de M» dejan de coincidir hasta que se complete otra (sección 6).

## 9. Decisiones de Dani (23-oct)

- **Día de la revisión:** de **viernes a lunes** (caduca el martes), como ya funciona la app. La lección 1.6 del guion (que dice «domingo») hay que corregirla en la bóveda: ese archivo no se ha tocado.
- **Desbloqueo gradual:** **a mano**, ni por días ni por nivel. El coach decide qué cursos abre a cada atleta. Esto hace necesario el hueco 6 de §8 (poner `grantedCourses` desde una pantalla del coach). Las reglas por días/nivel/prerrequisito siguen en el código, sin usarse.
- **Curso 1:** **solo recomendado**, no se exige para habilitar el plan del atleta. No hay que construir ningún bloqueo.
- **Curso 5:** se **renombra a «Cardio y pasos»** mientras no haya binario nativo con pulsómetro en vivo.
- **Huecos de §8 (decisiones del 23-oct):** (6) dar acceso **desde cada curso** (pestaña Acceso: lista de atletas con casilla por curso); (1,2) **editar y reordenar** cursos y lecciones; (3) pantalla para **descripción, duración y descargables** de la lección; (5) al borrar un curso se **borran también sus lecciones, con aviso y confirmación**. **Atleta nuevo:** al darle acceso ve **solo el curso 1** (el curso marcado como «inicial»); los que ya tienen acceso sin cursos marcados **siguen viendo todo lo publicado** (no se tocan). Sin decidir aún: (4) selector de prerrequisito (con desbloqueo a mano casi no se usa), (7) lista de lecciones agrupada por curso, (9) % guardado.

### Hecho el 23-oct (en el worktree, sin commitear)
- **Acceso por curso** (`components/academy/AccesoCoach.tsx`): elige un curso y cada atleta tiene su casilla «Ve este curso» además del acceso general. `AcademyCourse.inicial` (casilla «Curso inicial» al editar): al dar acceso por primera vez se abren solo esos; si no hay ninguno marcado, el atleta nuevo ve todo lo publicado. Los accesos de antes (sin `grantedCourses`) siguen viendo todo hasta que se toque un curso suyo. **Cambio de regla:** una lista `grantedCourses` vacía ahora significa «ninguno» (antes «todos»); ausente = todos. Lógica y tests en `utils/academyAdmin.ts`. (Corrección: el botón de acceso general NO borraba los cursos marcados, porque `setDoc` con `merge` ignora los `undefined`.)
- **Editar y reordenar** cursos y lecciones (botón lápiz y flechas); el formulario de curso y el de lección sirven para crear y editar. Prerrequisito = desplegable de cursos (ya no el id a mano). Etiqueta «Sin condición» para el desbloqueo inmediato.
- **Campos de la lección:** descripción, duración en minutos y descargables (PDF/enlace) en `academy/LeccionesCoach.tsx`; el reproductor del atleta ya los mostraba.
- **Borrar un curso borra sus lecciones** (con aviso «Este curso tiene N lecciones…»), `deleteCourseWithLessons` en `db/academy.ts`. Las lecciones sueltas de borrados anteriores salen en «Sin curso» para limpiarlas.
- **Lecciones agrupadas por curso.** **% del curso recalculado** al abrir (`progresoRecalculado`): añadir una lección a un curso terminado ya se nota.
- Sin tocar: reglas de desbloqueo por días/nivel/prerrequisito (siguen en el código), prerrequisito ya no necesita id. **Sin probar con sesión real:** guardar en Firestore (las reglas de `academy*` ya dejaban escribir al coach).
- **Pendiente de contenido (no es código):** corregir la lección 1.6 del guion en la bóveda («de viernes a lunes») y crear el curso 5 como «Cardio y pasos».

## 10. Dónde está el código

| Qué | Dónde |
|---|---|
| Pantalla del atleta | `src/components/AcademyScreen.tsx` |
| Reproductor | `src/components/academy/LessonPlayer.tsx` |
| Tarjeta y portada de curso | `src/components/academy/TarjetaCurso.tsx`, `PortadaCurso.tsx` |
| Panel del coach | `src/components/AcademyCoachScreen.tsx` |
| Reglas de desbloqueo | `src/utils/academyUnlock.ts` |
| «Sigue donde lo dejaste» | `src/utils/academyContinuar.ts` |
| Reconocer URLs de vídeo y velocidad | `src/utils/embedPlayerControl.ts` |
| Acceso a datos | `src/db/academy.ts` (+ `src/db/catalogoVersionado.ts` para la caché) |
| Entrada del atleta | `src/components/HojaHerramientas.tsx` |
