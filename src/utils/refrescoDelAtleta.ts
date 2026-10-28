/* Cuándo le llegan al atleta los cambios del coach en su entrenamiento.
 *
 * La caché general de la app da los datos por buenos 10 minutos y no vuelve a
 * pedirlos al volver a la app (`main.tsx`), así que un cambio del coach en la
 * rutina podía tardar 10 minutos en verse aunque el atleta cerrara y abriera.
 * Las RUTINAS (`workoutsByIds`) y los BLOQUES (`mesocycles`) del atleta se
 * vuelven a pedir cada vez que vuelve a la app, si ha pasado más de un minuto:
 * son pocos documentos (una rutina por día del ciclo y un par de bloques).
 * Las asignaciones no — son el historial entero del atleta y cambian poco
 * (fechas, bloque nuevo); siguen con los 10 minutos de siempre.
 *
 * Es lo que permite al editor del coach decir «lo verá al abrir la app». */
export const AL_VOLVER_A_LA_APP = { staleTime: 60_000, refetchOnWindowFocus: true } as const;
