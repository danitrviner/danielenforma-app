# 03 · Propuesta UX/UI

> Se mantiene la identidad: fondo hueso/crema, oro como acento, Archivo 900 en titulares, Plus Jakarta Sans en texto, IBM Plex Mono en cifras y etiquetas. Los tokens viven en `src/index.css` (`@theme` + `:root`/`.dark`); se modifican valores, no nombres, para que todo el código los herede. Maqueta de referencia: `mockups/src/base.css`.

## 1. Diagnóstico medido

| Medida | Valor actual | Fuente |
|---|---|---|
| Estilo de texto más usado | `text-caption` 11 px · 2.043 usos | grep en `src/` |
| Subtítulo bajo «Hola, …» | 13 px, `ink-2` (77 %) | `ui/PageHeader.tsx:90` |
| Enunciado de pregunta | 11 px, mayúsculas, `ink-2` | `QuestionnaireWizard.tsx:280` |
| Pestaña inactiva claro | `ink-3` 5,5:1 | `ui/Tabs.tsx:100` |
| Pestaña inactiva oscuro | `ink-2 × 0,4` ≈ **2,4:1** | ídem |
| Tablas del coach (IEM) | 11 px mono, cabeceras con nombre completo de sesión | `PanelIndicesCdg.tsx:199` |
| Textos < 11 px | 27 usos | `BarraDeSemanas`, `NivelSemana`, `NutritionScreen`… |

Conclusión: en claro el contraste **ya pasa AA**; lo que falla es **tamaño, peso y jerarquía** (todo secundario se ve igual de pequeño y gris). En oscuro sí hay fallo de contraste en pestañas.

## 2. Tokens propuestos

### Color (claro) — cambia solo la tinta

| Token | Actual | Propuesto | Contraste sobre `#F4F2ED` |
|---|---|---|---|
| `--p-ink` | #1B1916 | = | 16,1:1 |
| `--p-ink-2` (secundario) | rgba(27,25,22,.77) → 7,8:1 | **#3B3631** | **10,7:1** |
| `--p-ink-3` (auxiliar) | .67 → 5,5:1 | **#57514A** | **7,0:1** |
| `--p-ink-4` (terciario) | .62 → 4,8:1 | **#6E675E** | **5,0:1** |
| `--p-ink-5` (deshabilitado) | .44 | = (no para texto que se lea) | — |
| `--p-accent-ink` | #875C05 → 5,3:1 | **#7A5204** | **6,2:1** |
| `--p-hairline` | .12 | **.13** | — |

Sólidos en vez de alfa: el gris deja de «ensuciarse» sobre superficies `inset`/`raised` (ink-2 sobre `inset` = 9,8:1).

### Color (oscuro)

`--p-ink-2` .70 → **.78** (10,6:1) · `--p-ink-3` .56 → **.66** (7,9:1) · `--p-ink-4` .50 → **.58** (6,3:1). Quitar `dark:opacity-40` de `ui/Tabs.tsx`.

### Tipografía (móvil)

| Rol | Token | Actual | Propuesto | Uso |
|---|---|---|---|---|
| Titular de pantalla | `display` | 32 | 30 · Archivo 900 | «HOLA, DANIEL» |
| Título de sección grande | `title-l` | 24 | 22 · 800 | nombre de sesión, receta |
| Título de sección | `title-m` | 19 | 18 · 700 | «Hoy, miércoles 22» |
| Título de tarjeta | `title-s` | 16 | 16 · 700 | «Comida», «Revisión semanal» |
| Texto | `body` | 15 | **16** · 400 | párrafos, filas de lista |
| Texto secundario | `body-s` | 13 | **14** · 400-600, ink-2 | fecha bajo saludo (600), descripciones |
| Etiqueta mono | `label` | 12 | **13** · Plex 600, MAYÚS, ink-3 | «TU PESO», cabeceras de tabla |
| Pie / dato auxiliar | `caption` | 11 | **12** (suelo) · ink-3 | marcas de tiempo, fuentes |
| Métrica | — | mono | Plex 600 tabular, 20-28 px | kg, kcal, IEM |
| Botón | — | 15 | 16 · 700, alto 52 | primarios |

Escritorio (coach): body 15, tablas 14, cabeceras de tabla 12 mono, métricas 24-28.

### Espaciado y forma

Escala 4-8-12-16-20-24 (Tailwind por defecto, ya en uso) y documentarla: gutter móvil **16**, separación entre tarjetas **12**, padding de tarjeta **16**, alto mínimo táctil **44** (botones 52). Radios actuales se mantienen (chip 11 · control 14 · field 16 · surface 20 · sheet 26).

## 3. Componentes

- **Pestañas** (`ui/Tabs.tsx`): nueva variante `segmentada` (carril `inset`, activa en `surface` con sombra e1 y 800) para Nutrición y pestañas de 2-4 opciones; variante `pildora` para Perfil (activa en tinta llena). Subrayado actual se queda para pestañas del coach (con 3 px y 800).
- **Cabecera**: wordmark «EN **FORMA**» con «Forma» en `accent-ink`; logo claro/oscuro como hoy. Variante «sobre velo» (texto `on-veil` blanco) solo cuando la cabecera va sobre `veil` (sesión en vivo, portadas). Regla: el color lo decide la superficie, no el modo.
- **Barra inferior**: Hoy · Rutinas · **[+]** · Nutrición · Perfil. Etiquetas 12 px 700 (hoy 11 mayúsculas).
- **Botón central — 3 alternativas** (lámina 02): A «+» negro con oro (**recomendada**: comunica «empezar algo», no compite con la pestaña activa), B mancuerna oro (se confunde con Rutinas), C logotipo (marca, pero no dice qué hace).
- **Hoja de herramientas**: `ui/Sheet.tsx` existente; 3 filas grandes (icono 48 + título + descripción); el «+» rota a «×».
- **Fecha y estado del día** (Nutrición): «Hoy, miércoles 22» en `title-m`; estado («Día de entreno · 2.400 kcal», «3 de 5 hechas») en body-s 600.
- **Filas de comida**: nombre 15 px, estado (seco/crudo) en ink-3, cantidad en mono 14.

## 4. Pantallas (láminas en `mockups/propuesta/`)

| # | Lámina | Actual incluido |
|---|---|---|
| 01 | Inicio modo claro | No (requiere sesión) |
| 02 | Navegación y botón central | — |
| 03 | Registro rápido de peso | Sí (`peso-revision.png`) |
| 04 | Nutrición: intercambios + receta sencilla | Sí (recetario) |
| 05 | Diario tipo MyFitnessPal + búsqueda | No existe |
| 06 | Escáner de código de barras | No existe |
| 07 | Coach: panel de recetas y acceso (todos/grupo/atleta) | No (requiere sesión) |
| 08 | Flujo de check-ins | Sí (wizard actual) |
| 09 | Perfil › Revisión y retirada del calendario | Sí (ambos) |
| 10 | Cardio libre y pautado | Sí (sesión en vivo) |
| 11 | Coach: volumen con IEM e IF | No (requiere sesión) |
| 12 | Coach: Draft con filtros + ficha de ejercicio | No |
| 13 | Coach: planificar progresión por IEM | Sí (`/dev/progresion`) |
| 14 | Técnicas de alta intensidad por serie | Sí (descrito desde el código) |

Las cifras de las maquetas son **de ejemplo**; las de nutrición cuadran entre sí (p. ej. receta 604 kcal = 3 HC + 2 P + 1 G).

## 5. Criterios de aceptación visual

- Jerarquía identificable en 2 s: un titular, un dato principal por tarjeta, secundario visiblemente menor y más claro.
- Nada por debajo de 12 px en móvil; textos de lectura ≥ 14 px.
- Estado activo de pestañas y barra distinguible por forma/peso, no solo color.
- ≥ 4,5:1 en todo texto legible, en claro y oscuro (comprobado con script, ver `registro-pruebas.md`).
- Sin desbordes a 360 px ni a 1280 px (coach).
