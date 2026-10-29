# Progresión por IEM: cómo funciona (decisiones de Dani, 25-oct-2026)

Respuestas de Dani a 16 preguntas sobre el motor de «Proponer por IEM» (E-08/E-09, lámina 13). Sustituyen lo que diga `05-modelos-y-motores.md` §7 cuando no coincida.

## Reglas
1. **El % es semana a semana**: la subida de una semana se compara con la anterior. Lo **acumulado** se mide desde S1 (o desde la semana pivote si el bloque parte de una). Se enseñan las dos cosas.
2. **No hay semana fija de llegada.** Se sube solo mientras recuperación, contexto y rendimiento lo permitan; se reevalúa cada semana.
3. **El IEM objetivo de Volumen** (p. ej. Pecho 120) es la meta de la zona; el % es lo rápido que te acercas.
4. **El % va por zona.** IEM bajo admite % grande (pocas series); IEM alto, prudencia (se mantiene «base alta ≤ 10 %»).
5. **Al llegar al objetivo**: el motor no propone en esa zona y lo deja al coach.
6. **Modos** (confirma el código): Dinámico = el IEM sube a propósito, con agujetas 1–2 y buena recuperación; no tiene que subir cada semana y puede bajar. Estático = mantener; solo sube con agujetas 1. Ninguno sube con agujetas sin resolver o peor rendimiento.
7. **Referencia de la semana: lo PROGRAMADO** de la semana anterior, aunque no lo completara. *(Hoy el motor usa lo realizado si hay entrenos: cambiar.)*
8. **Propone la semana siguiente en firme + borrador gris** de las siguientes, suponiendo que todo va bien (repite el escalón con los mismos topes). El borrador no se guarda.
9. **Modo por zona**: zonas con objetivo en Volumen → dinámico; resto → estático; el coach puede cambiar cualquiera. *(Hoy es uno por bloque.)*
10. **Rendimiento**: sin % fijo ni por una sesión. Aviso si el tonelaje se estanca o baja de forma mantenida (propuesta: 2 semanas seguidas) mientras se acumula carga, sobre todo con fatiga alta → plantear reducir o descargar. Aviso, no bloqueo.
11. **Palancas sin orden fijo**: depende del tiempo de sesión (minutos del alta), del IEM y de la fatiga. Si la serie extra no cabe en el tiempo → subir intensidad (bajar RIR); si cabe, la de menor fatiga. *(Superseries: mencionadas por Dani, fuera de alcance.)*
12. **Agujetas 5/5** (duele en reposo): nunca sube; propone reducir o pausar esa zona y el coach decide cuánto. *(Hoy propone bajar 20–30 % fijo.)*
13. **Técnicas (drop set, myo-reps)**: para **ahorrar tiempo**, no para subir el IEM. Con moderación (mucha fatiga). Ejemplo de Dani: drop en la **primera** serie, fresco, ~RPE 10; las otras normales. → El motor deja de usarlas como palanca de IEM; como mucho las sugiere cuando no cabe una serie, con aviso de fatiga.
14. **Mismo ejercicio y semana**: puede añadir serie **y** bajar RIR.
15. Borrador: «todo va bien» (ver 8).
16. **Sin agujetas** registradas: mantener + «sin agujetas: decide tú» (como ahora).

## Serie de la técnica por defecto (Dani, 25-oct)
- Se queda en la **última** serie (como E-06). Dani la pondrá en la primera a mano cuando quiera («Elegir» › 1). Se descartó cambiar el valor por defecto (14-f).

## Confirmado
- Regla 10: 2 semanas sin mejorar = vigilar; 3 o más = plantearse bajar o descargar (Dani, 25-oct).

## Qué cambia en el código (HECHO 25-oct, sin commitear)
`utils/cdg/progresionIem.ts`, `utils/cdg/agujetas.ts`, `mesociclo/PropuestaIemSheet.tsx`: referencia programada (7), modo por zona (9), parar en el objetivo (5), aviso de rendimiento (10), palancas con tiempo de sesión (11), freno sin % fijo (12), técnica fuera como palanca de IEM (13), borrador gris (8), acumulado desde S1/pivote (1). Sin tocar fórmulas de IEM/IF.
