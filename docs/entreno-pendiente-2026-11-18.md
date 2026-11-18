# Entreno · lo que queda por hacer (relevo del 18-11-2026)

Para quien continúe este trabajo, sea quien sea. Rama `entreno-integrado` (este worktree, `~/en-forma-entreno`), en local y **sin subir**. Todo lo anterior está commiteado.

## Cómo trabajar aquí

- Comprobar siempre antes de commitear: `npm run lint` (tipos + iconos), `npx vitest run` (unas 4.980 pruebas, todas en verde) y `npx vite build`.
- Servidor de pruebas: `npm run dev -- --port=3047`. Bancos sin sesión: `/dev/hipotesis-bloque`, `/dev/revision-coach` (pestaña Cierre de bloque; `?pantalla=seguimiento`, `?pantalla=ficha`, `?caso=parcial`, `?caso=deficit`), `/dev/entreno`, `/dev/roadmap?v=objetivo` y `?v=cierre`, `/dev/cierre-atleta`, `/dev/plantilla`.
- Puede haber otra sesión escribiendo en este mismo worktree: `git add` con rutas explícitas, nunca `-A` a ciegas.
- No tocar `firestore.rules` sin decírselo a Dani. No subir ni desplegar sin que lo pida.
- Normas de Dani: todo en español; en pantalla nunca «IA» (se dice «el asistente»); lo visual nuevo, en 2-3 versiones para que elija; en una descarga se quita volumen, nunca intensidad; el grupo prioritario va primero en la sesión; mandan los índices (IEM, IF, estrés articular) y las series se enseñan al lado.
- Cifras acordadas y de dónde sale cada una: `src/utils/hipotesisDeBloque/cifras.ts`, `src/utils/ruidoDeMedida.ts`, `src/utils/rmValido.ts`. Historia completa y decisiones: bóveda, `02-Formacion-Cursos/Entrenamiento/mejoras-app-cierre-y-siguiente-bloque-2026-11-17.md`.

## 1. Hipótesis de a qué responde cada atleta (pedido por Dani, viable)

Idea (de la formación de Heracles): al cerrar un bloque, ver si al atleta le va mejor con más volumen, más frecuencia o más cerca del fallo, para individualizar. Dani: «lo que consideres; igual no hace falta tanto». Tres variables, no más: **volumen** (series por semana), **frecuencia** (sesiones por semana en que se trabaja la zona) y **cercanía al fallo** (RIR medio).

- Foto por zona al cerrar («dosis y respuesta»): series/semana, frecuencia, RIR medio, IEM medio y % de RM de sus ejercicios. Para TODAS las zonas con marca, no solo las de estrella. Se guarda al firmar el cierre en `Mesocycle.cierreDeHipotesis.dosis` (tipo ya en `src/types.ts`).
- Lecturas, de más a menos fiables:
  1. La misma zona en bloques distintos: «Pecho: con 12 series subió un 3 %; con 15, un 6 %». Si cambiaron dos variables a la vez, se dice que no se puede separar.
  2. Zonas distintas en el mismo bloque (orientativo: un curl no mejora como una sentadilla): mediana de las de frecuencia 2 o más contra las de 1; mitad con más series contra mitad con menos; RIR medio bajo contra alto. Mínimo 3 zonas por lado.
- Solo cuenta una diferencia de 3 puntos o más (el ruido). Grados: «indicio» (una comparación) y «se repite» (misma dirección en 2 bloques o más). Nunca una conclusión con un dato. Siempre se enseña con cuántos casos.
- Primer bloque de un cliente (8 semanas): con lo mismo, un «punto de partida» de 3-4 frases — qué zonas subieron más y menos, cuáles se quejan con poco volumen, y por dónde seguir. Sin inventar: si no hay marcas, se dice.
- Dónde se ve: sección «A qué responde» bajo los veredictos del cierre, la misma lista en «Qué le funciona» de la ficha del atleta, y como motivo en la propuesta del bloque siguiente (`proponerHipotesis` → `porQue`). El asistente lo recibe en `get_cierre_bloque` (`src/ai/tools/hipotesis.ts`).
- Motor puro y probado en `src/utils/hipotesisDeBloque/respuestaADosis.ts`.

## 2. Cuestionario de cierre: semana a elegir, mandar ahora y mover fechas

Dani quiere las dos cosas: elegir la semana al montar el bloque y un botón para mandarlo en el momento; y poder mover la fecha de un cuestionario de forma puntual.

- Hoy: `QuestionnaireAssignment.schedule` (`src/types.ts` ~983-1101). El cierre va con «semana del bloque = última» (`src/data/questionnairePresets.ts` ~585); `semanaPedida` y `fechaSemanaDelBloque` en `src/utils/cicloRevision.ts` ~82-102. Solo admite primera, mitad o última. No existe ninguna función que edite una asignación ya creada. «Una vez» solo aparece el día exacto (`scheduleEngine.ts` ~80).
- Semana a elegir: número de semana del bloque en el cierre, elegible al montar el bloque (campo en la cabecera del mesociclo o en la asignación; el coach ya puede escribir en las dos colecciones) y leído en `semanaPedida`, sin pasarse de las semanas del bloque.
- Mandar ahora: botón en Cliente › Revisiones › Asignadas que deja ese cuestionario pendiente desde hoy durante 7 días.
- Mover una fecha puntual: lista de excepciones en la asignación (`{ ocurrencia, nuevaFecha }`), aplicada en `isOverdue` y `hasAnsweredThisOccurrence` (`src/utils/questionnaireSchedule.ts`) y en `scheduleEngine.ts`, con su control en `AssignedQuestionnairesPanel.tsx`.
- Preguntas nuevas en el cuestionario que Dani ya tiene: no hay mecanismo. Botón en el editor de cuestionarios «Añadir las preguntas nuevas del paquete oficial», que compara por `signalKey` (`meso_end.quitar`, `meso_end.echa_de_menos`), añade las que falten y conserva las respuestas antiguas. **Lo pulsa Dani después de desplegar**: la app en producción no sabe pintar la pregunta nueva.

## 3. Revisión semanal del cliente, pensada para el vídeo

Dani graba un vídeo sobre Cliente › Revisión y se lo manda al atleta: la pantalla es el guion. Propuesta completa en la bóveda (sección «Revisión semanal del cliente»). Sin maquetar. Decisiones ya tomadas:

- Dos caras: **preparar** (solo coach: lo que pide decisión, avisos, estímulo por zona, semáforo de hipótesis, notas) y **presentar** (lo que sale en el vídeo, en este orden: tu semana de un vistazo; lo que me contaste, con el dato al lado; cómo vas; lo que cambio; la semana que viene).
- La lista de comidas día a día **se queda visible**.
- «La semana que viene»: solo datos reales (qué tipo de semana es, cambios ya programados, el siguiente paso de la carga sugerida). Dani: «si nos vamos a inventar datos, prefiero que no salga».
- Fuera el número de «Disposición para entrenar» (no lo usa) y su copia «IRP» en El cuerpo.
- Fuera lo de grupos musculares (el aviso de «no llegan al mínimo efectivo», restos del mapa de calor). Las estadísticas se quedan.
- También propuesto y sin objeción: quitar el % agregado por patrón cuando mezcla ejercicios, la proyección de peso por fórmula cuando hay gasto real medido, los macros del plan contra el objetivo, el «1RM de curl» de El cuerpo y la etiqueta «OVERREACHING» del cardio; comparación fija semana contra semana anterior.
- Siguiente paso: maquetas en 2-3 versiones calcando la pantalla real (`/dev/revision-coach`), y luego construir.

## 4. Elecciones que faltan

- Cuestionario final, «qué ejercicios quitarías»: filas o tarjetas (`EjerciciosDelBloquePaso.tsx`, prop `variante`).
- Saltar sesión: hoja o botones en la tarjeta (`SaltarSesion.tsx`, prop `variante`).
- Capturas enviadas a Dani el 18-11 (`~/Desktop/App enforma/maquetas-hipotesis-bloque/capturas/`). Cuando elija, borrar la descartada.

## 5. Menores, sin hacer

- Serie de comprobación mensual del RIR («la última, a tope»).
- Semanas puente con recorte selectivo de fatiga y vista previa de estímulo y fatiga.
- Registros del atleta en el asistente al aprobar una propuesta, para la norma de ejercicio nuevo (hoy la aplica el editor al abrir el bloque).
- Las sesiones «fuera de mi gimnasio» no se filtran en `rirStats.ts` ni en las series de `revisionCoach.ts` (`sinSesionesFuera` en `utils/sesionFuera.ts`).
- `mdc.ts` y `ruidoDeMedida.ts` tienen dos cifras distintas para el error de los perímetros.
- El botón «Fijar como límite semanal» (estrés articular tras una molestia) nunca se ha pulsado contra la base de datos real.

## 6. Antes de subir

- QA de Dani con sesión real de coach y de atleta: nada de esta rama se ha probado así.
- Guardar veredictos, crear el bloque siguiente y fijar el límite articular solo se han probado con escrituras de mentira.
- Las cifras del cierre de bloque, los récords y el historial de cargas cambian respecto a producción (RM con series de 3 a 15 repeticiones y RIR 2 o menos; mediana de 2 semanas contra 2).
- El texto por defecto de la doctrina del asistente ha cambiado: una copia guardada por Dani saldrá como «atrasada».
- Tras desplegar: pulsar el botón del punto 2 para poner al día su cuestionario de cierre.
