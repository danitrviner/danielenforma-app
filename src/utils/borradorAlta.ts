/* ═══════════════════════════════════════════════════════════════════════════
   Borrador del alta del atleta

   `05-4` de la revisión pre-publicación. `AthleteOnboardingWizard` mantenía sus
   18 campos en `useState` y no escribía nada hasta el último paso: cerrar la
   app en el paso 5 devolvía al atleta al paso 0 en blanco. Es el recorrido que
   decide si el cliente se queda, y el contraste estaba en el propio repo, donde
   `QuestionnaireWizard` sí autoguarda.

   Misma decisión que en [sesionEnCurso.ts]: localStorage y no Firestore. Aquí
   además es obligado — el alta es lo que crea el documento de onboarding, así
   que no hay dónde escribir un parcial sin inventarse un estado «a medias» en
   el modelo de datos, que después el coach vería como una ficha rota.

   La clave lleva el email para no sumar otra clave global a las que `03-5` ya
   documenta, y el borrador caduca a los 30 días: un alta abandonada y retomada
   dos semanas después sigue siendo la misma alta, pero la de hace tres meses
   arrastra un peso y unos objetivos que ya no son los de esa persona.
   ═══════════════════════════════════════════════════════════════════════════ */

const PREFIJO = 'enforma_borrador_alta_v1';

const CADUCIDAD_MS = 30 * 24 * 60 * 60 * 1000;

/** Lo que el módulo añade por su cuenta a lo que le entrega el wizard. */
interface Sello {
  guardadoEn: string;
}

function clave(athleteEmail: string): string {
  return `${PREFIJO}_${athleteEmail}`;
}

export function guardarBorradorAlta<T extends object>(athleteEmail: string, borrador: T): void {
  try {
    const conSello: T & Sello = { ...borrador, guardadoEn: new Date().toISOString() };
    localStorage.setItem(clave(athleteEmail), JSON.stringify(conSello));
  } catch {
    // best-effort: sin localStorage el alta funciona como siempre, solo sin red
    // de seguridad. Nunca debe impedir que alguien se dé de alta.
  }
}

export function cargarBorradorAlta<T extends object>(athleteEmail: string): (T & Sello) | null {
  try {
    const raw = localStorage.getItem(clave(athleteEmail));
    if (!raw) return null;

    const borrador = JSON.parse(raw) as T & Sello;
    const caducado = !borrador.guardadoEn
      || Date.now() - Date.parse(borrador.guardadoEn) > CADUCIDAD_MS;

    if (caducado) {
      borrarBorradorAlta(athleteEmail);
      return null;
    }
    return borrador;
  } catch {
    // JSON corrupto o de una versión anterior del wizard: se trata como si no
    // hubiera borrador. Empezar de cero es molesto; restaurar campos a medias
    // en un formulario con validación por paso deja al atleta atascado sin
    // saber por qué.
    borrarBorradorAlta(athleteEmail);
    return null;
  }
}

export function borrarBorradorAlta(athleteEmail: string): void {
  try {
    localStorage.removeItem(clave(athleteEmail));
  } catch {
    // best-effort
  }
}
