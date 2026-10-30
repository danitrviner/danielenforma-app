# Registro de pruebas

| Fecha | Qué | Cómo | Resultado |
|---|---|---|---|
| 22-10 | Contraste tinta actual (claro, sobre #F4F2ED) | script de luminancia WCAG | ink-2 7,8 · ink-3 5,5 · ink-4 4,8 · accent-ink 5,3 → pasa AA salvo ink-4 en texto pequeño |
| 22-10 | Contraste tinta propuesta (claro) | ídem | ink-2 10,7 · ink-3 7,0 · ink-4 5,0 · accent-ink 6,2 · ink-2 sobre inset 9,8 · tinta sobre oro 6,1 |
| 22-10 | Pestaña inactiva actual (oscuro) | ink-2 × opacidad .4 sobre #121212 | **2,4:1 — no pasa AA** |
| 22-10 | Tinta propuesta (oscuro) | alfas .78/.66/.58 | 10,6 · 7,9 · 6,3 |
| 22-10 | Capturas actuales | Chrome headless, 390×844 @2x, bancos `/dev/revision`, `/dev/calendario-atleta`, `/dev/recetario`, `/dev/cardio-live`, `/dev/progresion`, `/dev/revision-coach` | OK, en `mockups/actual/` |
| 22-10 | Verificación del bug del drop set | lectura de código (`ExerciseCard.tsx:76, :438`) | Confirmado en código; **no reproducido en ejecución** |
