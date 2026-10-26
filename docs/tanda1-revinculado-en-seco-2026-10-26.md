# Tanda 1 · revinculado en seco (26-10-2026)

Rama `tanda1-emparejado` en `/Users/dani/en-forma-calorias`. Nada commiteado, nada aplicado, nada en Firestore.

## Qué cambia en el código

- `src/utils/recetaVinculada.ts`
  - `emparejar`: el estado se lee también del nombre del alimento («Pistachos crudos»); alimento con palabras de más que el ingrediente → `baja` (antes `media`: por ahí entraron Calabaza→Pipas, Tomate seco→Lechuga y tomate, Avena→Bebida de avena); cereal/legumbre sin estado escrito solo con entrada cocida → `baja`; empate seco/cocido sin estado («Lentejas», «Garbanzo») → `baja`; a igual puntuación gana la versión sin cocer («Patata» → cruda).
  - `SINONIMOS_REVISADOS` (175 pares revisados a mano) + `emparejarRevisado`: el sinónimo manda y cuenta como `alta`.
  - `vinculoAutomatico` solo acepta `alta` o sinónimo revisado (antes también `media`).
  - No cuentan: levadura (salvo nutricional / de cerveza), infusión, semillas de cilantro, clavo.
- `src/utils/recetaDesglosada.ts`: el desglose en la app usa el mismo criterio (alta o sinónimo); lo demás se reparte por perfil.
- `scripts/generarIndiceRecetas.mjs`: aborta (exit 1, no escribe) si un alimentoId trae dos `porCien` distintos. Hoy aborta: 34 alimentos (los de las Rápidas, con valores viejos de intercambios).
- `scripts/vincularTodas.ts --revincular`: recalcula las vinculadas que no son Rápidas; las que ya no pasan pierden el vínculo y recuperan su `antes`. Deja `scripts/out/revincular-recetas.csv` y `revincular-pares.csv`.
- `scripts/_lib/cargarCatalogoAlimentos.ts`: `--catalogo-json`.
- Tests: 31 nuevos/ajustados en `recetaVinculada.test.ts`; nuevo `recetarioVinculos.integridad.test.ts` (un porCien por alimento en todo el recetario) **en rojo hasta aplicar y regenerar**. Resto: 3.078 en verde, `tsc` y `lint` limpios.

## Resultado del seco (catálogo local de 468 alimentos)

| | recetas |
|---|---|
| Siguen igual | 6.793 |
| Cambian de alimento | 709 (mediana −20 kcal) |
| Se desvinculan (vuelven a sus macros de antes) | 539 (mediana +37 kcal; una de −1.584) |
| Se vinculan nuevas | 44 |
| Rápidas (no se tocan aquí) | 79 |
| Sin vincular al final | 1.304 (antes 809) |

Pares principales (`revincular-pares.csv`):

- Patata: cocida → cruda (455 recetas, −24 kcal de mediana).
- Levadura: ya no cuenta (159).
- Tomate seco: lechuga y tomate → tomate seco (47). Espelta/couscous/judía pinta/remolacha «cocida» → su entrada cocida (80).
- Mermelada de frambuesa/fresa/albaricoque → mermelada (34; antes frambuesas, light o albaricoque).
- Pasan a duda (se desvinculan): Calabaza 144, Garbanzo 80, Arroz basmati 77, Arroz integral 57, Pan rallado 47, Lentejas 44, Arándano rojo 36, Coco 16, Harina de garbanzo 9, Cerveza 8, Avena 8 (todos iban a un alimento equivocado o ambiguo).

Rápidas (`vincularRecetas.ts recalcular`, en seco): cambian 78 de 79, solo por `porCien` (los valores viejos de intercambios pasan a los del catálogo; +20/+40 kcal por receta). Esto es lo que unifica el índice.

## Para quitar las dudas grandes hacen falta alimentos en el catálogo

Calabaza, arroz basmati y arroz integral en seco, garbanzo y lenteja en seco como entrada por defecto (o decidir que «Garbanzo» a secas es cocido), pan rallado, arándano rojo deshidratado, coco rallado, harina de garbanzo. Con eso vuelven ~450 recetas.

## Cómo aplicar cuando lo revises

```bash
npx tsx scripts/vincularTodas.ts --catalogo-json <catalogo.json> --revincular --aplicar
npx tsx scripts/vincularRecetas.ts recalcular --catalogo-json <catalogo.json> --aplicar
node scripts/generarIndiceRecetas.mjs
npx vitest run src/utils/recetarioVinculos.integridad.test.ts
```

Después, `--firestore` (solo con tu OK) para que la ficha de la receta vea lo mismo.
