# Prompt para la conversación nueva (pantallas 11–14)

Pega esto tal cual (en `~/en-forma-redesign-1a`; modelo: Sonnet para comparar y retocar, Opus solo si toca el motor de progresión o el modelo de técnicas):

```text
Retomamos el rediseño de En Forma. Lee primero ~/en-forma/docs/enforma-redesign/estado-actual.md y sigue sus restricciones (§8). Trabaja solo en el worktree ~/en-forma-redesign-1a, no commitees ni pushees sin que te lo pida, y habla en español, breve y sin jerga.

Tarea: ajustar a las láminas 11, 12, 13 y 14 las pantallas del coach que ya están construidas. Las láminas (PNG y HTML) están en ~/en-forma/docs/enforma-redesign/pantallas-11-14/. Corresponden a:
- 11 · Volumen con IEM e IF  → E-01 (mesociclo/PanelIndicesCdg.tsx) y E-02 (cabeceras cortas)
- 12 · Draft con filtros y ficha del ejercicio → E-03 (filtros), E-04 (ClasificacionSheet.tsx), E-05 (FichaEjercicioSheet.tsx)
- 13 · Planificar progresión por IEM → E-08 (PropuestaIemSheet.tsx, utils/cdg/progresionIem.ts), E-07
- 14 · Técnicas de alta intensidad por serie → E-06 (tecnicaDeSerie.ts, AjustesDeTecnicaEditor.tsx, ExerciseCard.tsx)

Paso 1, antes de tocar nada: abre cada pantalla de la app (banco /dev/… o la app con sesión; si necesitas sesión, dímelo) y compárala con su lámina. Dame una tabla por pantalla con lo que ya coincide, lo que falta y lo que difiere a propósito (las láminas llevan datos de ejemplo; E-06 se hizo sin migración y sin rest-pause por decisión mía). No cambies lo que ya está aprobado.
Paso 2: te digo qué diferencias quiero cerrar y en qué orden. Enséñame el diseño de cada cambio antes de implementarlo.

Reglas: no cambiar fórmulas de IEM/IF; no cambiar cómo se exploran las recetas; en pantalla «el asistente», nunca «IA»; imports con .js en lo que alcanza api/; consultas a Firestore siempre acotadas; tests con `npx vitest run`, tipos con `npx tsc --noEmit`.
```
