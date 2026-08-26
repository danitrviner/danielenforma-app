// ─── Sello de versión de los catálogos, desde el servidor ────────────────────
//
// `src/db/catalogoVersionado.ts` sirve la copia local del dispositivo (0
// lecturas de Firestore) mientras el documento `catalogos/{nombre}` siga
// diciendo la misma versión. Todo el ahorro depende de una única condición:
// que NADIE escriba en una de esas colecciones sin tocar su sello.
//
// El cliente lo cumple porque las escrituras pasan todas por `src/db/*.ts`.
// Estos endpoints no: usan el Admin SDK, que ni pasa por las reglas ni por
// aquel fichero. Sin este helper, una escritura del servidor sería invisible
// para la app hasta que el sello cambiara por cualquier otro motivo — y en el
// caso de `delete-account` eso significa el navegador del coach sirviendo de
// su caché los datos personales de alguien que pidió que lo borraran.
//
// No lanza: el trabajo real (borrar la cuenta, dar de alta al atleta) ya está
// hecho cuando se llama a esto, y no puede deshacerse porque falle un sello.

/** Mínimo que se necesita de `Firestore` del Admin SDK, sin importar el tipo. */
interface DbConDoc {
  collection(path: string): {
    doc(id: string): { set(data: unknown, options: { merge: boolean }): Promise<unknown> };
  };
}

/**
 * Invalida la copia local de los catálogos indicados en TODOS los dispositivos
 * (en su siguiente lectura). Llamar DESPUÉS de que la escritura de verdad haya
 * confirmado.
 */
export async function marcarCatalogosCambiados(
  db: DbConDoc,
  nombres: readonly string[],
): Promise<void> {
  const version = new Date().toISOString();
  await Promise.all(
    nombres.map(async nombre => {
      try {
        await db.collection('catalogos').doc(nombre).set({ version }, { merge: true });
      } catch (err) {
        console.warn(`marcarCatalogosCambiados(${nombre}) falló (no bloqueante):`, err);
      }
    }),
  );
}
