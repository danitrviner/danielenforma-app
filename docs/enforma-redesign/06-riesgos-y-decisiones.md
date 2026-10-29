# 06 · Riesgos, supuestos y decisiones pendientes

## Decisiones que necesita Dani (por orden de urgencia)

| # | Decisión | Opciones | Recomendación | Bloquea |
|---|---|---|---|---|
| D1 | ¿Qué hacemos con los registros históricos de drop sets (D1/D2 guardados como series)? | a) dejar como están · b) recalcular volumen al leer · c) migrar | **b**: no tocar datos, marcar y excluir al calcular | T-01 |
| D2 | Botón central | A «+» · B mancuerna · C logo | **A** | V-05 |
| D3 | ¿El coach puede ocultar el Diario a un atleta? (hoy: el atleta usa los dos) | siempre visible · interruptor por atleta | siempre visible | N-02 |
| D3b | ¿«Periodización» sigue como pestaña de Nutrición del atleta? | pestaña · acceso desde el objetivo del día | acceso desde el objetivo | V-02 |
| D4 | ¿Mi gimnasio y Ajustes salen de las pestañas del Perfil al engranaje? | sí · no | sí (4 pestañas caben) | V-02 |
| D5 | «Mover a mañana» de cardio: ¿siempre, o solo si el coach lo permite? | siempre · por atleta | siempre, con aviso al coach | C-02 |
| D6 | Sensibilidad de agujetas: 2 niveles (rama IH) o 3 (Excel: estático/medio/dinámico) | 2 · 3 | **3**, como el Excel | E-09 |
| D7 | Carga crónica entre bloques | 6 semanas del bloque (hoy) · EWMA 28-42 días cruzando bloques | EWMA cruzando bloques | E-10 |
| D8 | RIR 5 cuenta 0 en el motor CDG | mantener · tratar como RPE 5 | decidir con la formación | E-01 |
| D9 | IEA «acumulado» (premia RIR alto) | retirar · corregir | retirar en favor del IEM CDG | E-11 |
| D10 | Valores por 100 g de los 311 alimentos | BEDCA (pedir autorización) · etiquetas · propio | pedir autorización a BEDCA; mientras, etiquetas/propio | N-04 |
| D11 | Factores crudo→cocido | entradas separadas · factor por alimento | entradas separadas (sin estimar) | N-04 |
| D12 | Tolerancia del motor de recetas | 5 % · 10 % / 5 g | 10 % o 5 g por macro | N-06 |
| D13 | Dependencias nuevas para el escáner (ZXing WASM, plugin ML Kit) | aprobar · posponer | aprobar al llegar a D-04 | D-04 |
| D14 | Open Food Facts (ODbL) en colección separada con atribución | sí · no | sí | D-01 |
| D15 | Umbrales de contexto de la progresión dinámica (estrés ≥7, sueño <6 h, motivación ≤4, fatiga ≥8) | validar · cambiar | validar con la formación (PDF «Programación 1/2/3») | E-08 |
| D16 | ¿Fusionar `main` en `~/en-forma` antes de empezar? | sí · no | **sí**: la carpeta está 12 commits atrás | todo |

## Riesgos

**Técnicos y de datos**
- **Ramas y worktrees divergentes**: 9 worktrees (`git worktree list`); `~/en-forma` en `reparto-propio` por detrás de `main`. Riesgo de trabajar sobre código viejo. → Cada bloque en worktree nuevo desde `origin/main`.
- **Binarios nativos con bundle empotrado**: cambios de modelo (p. ej. `series[]` por serie, id de peso determinista) deben ser **retrocompatibles**: lectores viejos no pueden romperse. → Campos añadidos, nunca renombrados; reglas Firestore que acepten ambos formatos durante la transición.
- **Reglas Firestore**: la BD es nombrada y un despliegue atrasado ya borró reglas (17-10). → Diff contra producción antes de cada despliegue (skill `enforma-firestore`).
- **Migraciones globales** (catálogo de alimentos, clasificación de ejercicios, nombres de servicio CRM): siempre script en seco → CSV para revisión → aplicar → verificar; nunca barrer colecciones enteras sin filtro (coste de lecturas).
- **Motor de menús en el dispositivo del coach** (`menuSemanalAutomatico.ts`): si N-01 cambia el objetivo, el menú automático debe usar `objetivoDelDia` o seguirá con el budget viejo.
- **Licencias**: ODbL obliga a compartir la base derivada si se mezcla con datos propios; BEDCA no permite uso comercial sin autorización.

**Experiencia de usuario**
- Cambio de barra inferior: los atletas pierden Training Lab de la barra → aviso en Novedades.
- Subir tamaños puede desbordar tablas del coach (CRM, BarraDeSemanas, panel CDG) → probar a 1280 px.
- Una pregunta por pantalla alarga cuestionarios largos → agrupar métricas sencillas.

## Supuestos (no verificados)

- Que `isDraft` llegue al atleta en la práctica (depende de que el coach active/programe un borrador).
- Que los bancos `/dev/*` reflejen fielmente las pantallas con datos reales.
- Que los PDF del curso no contradigan las reglas de la rama IH.
- Cobertura real de `cdgNombre` y `equipment` en Firestore en vivo (se usó un volcado del 18-09).

## Restricciones a respetar en todos los bloques

- No cambiar fórmulas de IEM/IF sin decisión explícita.
- No cambiar qué cuestionarios tocan ni cuándo vencen.
- En pantalla, «el asistente», nunca «IA».
- `stripUndefined` en todas las escrituras; claves de atleta por email.
- En `~/en-forma` nunca `git add -A`.
