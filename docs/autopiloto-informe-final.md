# Autopiloto de En Forma — informe final (29-10-2026)

Rama `ia-autonoma` → PR #27 contra `main`. Diseño aprobado: `docs/diseno-ia-autonoma-2026-10-28.md`. Informes por tanda: `docs/autopiloto-tanda-1.md` … `-9.md`. Nada está desplegado: ni código, ni reglas, ni cron, ni doctrina. Todo eso es el **«de golpe»** de abajo, y lo dispara Dani.

## 1 · Qué hace ya el autopiloto (en la rama)

El asistente lleva a cada atleta con consentimiento de punta a punta, y Dani supervisa:

| Momento | Episodio | Qué hace | Tanda |
|---|---|---|---|
| Alta terminada | `alta_completada` | Monta las 19 piezas del recorrido en orden (mesociclo → sesiones → publicar → nutrición → menú → setup → road map → reto → ficha), parándose a esperar la aprobación del mesociclo («ESPERO») y continuando cuando Dani decide | 5 |
| Lunes | `semana_nueva` | Menú de la semana, reto, progresión programada (o IEM si el bloque es CDG), mensaje «qué cambia esta semana» | 4 |
| Cuestionario recibido | `cuestionario_recibido` | Respuesta rutinaria a la revisión con alertas (molestia, agujetas 5, retención) que escalan | 3 |
| Mitad y fin de bloque | `revision` | Revisión con los motores + cierre del «esperado» del expediente (la métrica de calidad) | 5 |
| Entre semana | `dolor`, `perdidas`, `peso_sin_registrar`, `desvio_peso`, `desvio_adherencia`, `nota_libre`, `bienestar` | Siete emergentes con umbrales del motor; lo clínico y el texto libre nunca son automáticos | 6 |
| Bloque acabado | `fin_de_bloque` | Cierre del bloque, ficha, y bloque nuevo con «qué cambia» obligatorio; si el plan vence en ≤ 14 días, tarea de renovación y para | 7 |
| Plan a 14 días de vencer | `renovacion` | Solo una tarea para Dani: renovar, cobrar y dar de baja son siempre humanos | 7 |

Infraestructura: cola `episodios` (la encola el latido de las 02:00 UTC), consumidor `api/autopiloto.ts` con bucle de agente reanudable, 51 tools en servidor (`src/ai/tools.server.ts`), `AiProposal` v2 con snapshot y deshacer, política por tipo de decisión (`coachSettings/autopiloto`), aplicación en servidor con validadores, presupuesto diario/mensual compartido con el chat, topes por episodio, ids deterministas, auditoría sin correos.

## 2 · Supervisión de Dani

- **Hecho hoy** (Inicio del coach): lo aplicado en 24 h con quién, por qué y **Deshacer**.
- **Propuestas**: pestañas Propuestas | Calidad; filtros pendientes / aplicadas / rechazadas / sombra; deshacer desde ahí.
- **Calidad**: cada semana, 5 decisiones automáticas al azar (fijas durante la semana); «Bien / Mal / No vuelvas»; «No vuelvas» baja el tipo a propuesta y deja instrucción fija.
- **Política** (Perfil › Ajustes › Asistente): modo sombra / rodaje / política; tabla por tipo con la tasa de aprobación medida y el botón de subida; presupuesto; menú; y el bloque **Sombra · coincidencia contigo**.
- **Lo que ha hecho el asistente** (Cliente › Revisión): línea de tiempo por episodio con desenlace y esperado ✓/✗, «Plan inicial vs ahora», y en Setup quién cerró cada paso.
- **Canal del atleta**: el de la rama de acompañamiento (ya en producción): «Lo último de Dani» en Inicio; el autopiloto escribe ahí como `aprobado` solo cuando la política o Dani lo deciden. En sombra, nada.

## 3 · Decisiones de Dani, todas cerradas

| | Decisión | Dónde |
|---|---|---|
| Arranque | Rodaje global con subida por tipo según la tasa medida (8 decididas, ≥ 7/8) | `politica.ts`, `evaluarSubida` |
| Firma | Siempre Dani; en pantalla nunca «IA», se dice «el asistente» | prompts, mensajes, muro |
| Presupuesto | ~50 $/mes, 3 $/día, editables | Política |
| Menú (D3) | **Se publican solos** (`menuAutomatico: 'publicar'` por defecto) | `POLITICA_POR_DEFECTO` |
| Muro legal (D1) | **Una página**; la casilla del asistente dentro de Términos, discreta, opcional y desmarcada (RGPD art. 7.4); el detalle en la Política de privacidad | `MuroLegalUnificado.tsx`, cableado en `App.tsx` |
| Cron (D2) | **Dos veces por semana**. Propuesta: lunes y jueves 03:00 UTC, una hora después del latido | `vercel.json` (al «de golpe») |
| Visual | Variantes elegidas: Política semáforo · Hecho hoy cronología · Línea de tiempo tarjetas · Calidad lista · Muro un documento | las no elegidas, borradas |
| Siempre humano | Clínico, renovación, baja, dinero | `SIEMPRE_HUMANO` |

## 4 · Estado de la rama

- 316 archivos de test / **3.547 tests verdes**; `tsc` y `eslint` limpios.
- `origin/main` fusionado el 29-10 por la noche (PRs #28–#42 de acompañamiento y plan): 10 conflictos resueltos; el canal `mensajesCoach` duplicado se retiró a favor del de main; el diff de reglas frente a main solo **añade** `episodios` y `autopiloto` (lectura coach, escritura solo servidor).
- Fallo destapado por el test de integración y arreglado: en sombra, las tools dejaban en la ficha viva un «propuso X» que nunca se aplicó.

## 5 · El «de golpe» (en este orden, cuando Dani lo diga)

1. **Merge de PR #27** en `main` (ya sin conflictos tras la fusión; comprobar que los checks están en verde).
2. **Reglas de Firestore**: `diff` del `firestore.rules` de main contra la BD con nombre en producción; debe salir solo el bloque `episodios` + `autopiloto`. Desplegar.
3. **Cron**: añadir a `vercel.json` `{ "path": "/api/autopiloto", "schedule": "0 3 * * 1,4" }` (lunes y jueves 03:00 UTC). El latido sigue a las 02:00. `CRON_SECRET` ya existe; `ANTHROPIC_API_KEY` y `AI_DAILY_USD_LIMIT` ya están en Vercel.
4. **Doctrina**: `node scripts/actualizarDoctrinaProteina.mjs --aplicar` (proteína 1,6–2,2 g/kg en `coachSettings/doctrinaNutricion`).
5. **Política en sombra** (ya es el valor por defecto): dejar 2 semanas con los atletas que tengan consentimiento. Cada pasada escribe `aiProposals` `sombra` y `episodios`; el bloque **Sombra** de Política va midiendo. Coste estimado de la sombra: 0,5–2 $/día según atletas.
6. **Revisión a las 2 semanas**: tipo a tipo, los que digan «listo para subir» pasan a aviso con un clic; el resto se queda en propuesta. Entonces **modo rodaje** (todo propuesto salvo lo determinista del latido) y, cuando Dani quiera, **política**.
7. QA real de Dani sobre: Propuestas (filtros y Calidad), Hecho hoy, Lo que ha hecho el asistente, muro legal con una cuenta nueva.

## 6 · Lo que queda fuera y lo que vigilar

- **Vencimiento del plan (`renovacion`)** depende de `planStartDate`/`planDurationMonths` del perfil: 20 perfiles los tienen vacíos (lo anotó la revisión de acompañamiento). Sin ellos no hay episodio de renovación ni de fin de plan.
- **Cron dos veces por semana**: una molestia del martes se atiende el jueves; la del viernes, el lunes. Si pesa, subir a diario es cambiar una línea.
- **Revisión por `tasks.dueDate`** no está (solo mitad/fin de bloque).
- **CDG en el alta**: `propose_mesocycle` aún no acepta los objetivos IEM por zona; el alta CDG queda en reparto propio salvo plantilla marcada `cdg`.
- **`estadoCrm`** (bajas, archivados) no genera episodios; el latido ya los salta.
- Episodios por atleta se leen enteros (`where athleteId ==`); si un día son miles, paginar.
- **Sombra en el servidor** solo compara lo que escribió Dani en la app; lo que haga por WhatsApp sin tocar la app no cuenta (sale como «nada»).
