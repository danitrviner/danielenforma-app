import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  POR_ID_EMAIL,
  POR_CAMPO,
  CRM_A_ANONIMIZAR,
  PREFIJOS_STORAGE,
} from '../../api/delete-account';

/* ═══════════════════════════════════════════════════════════════════════════
   Blindaje del borrado de cuenta (B-1).

   El fallo que más miedo da aquí no es que el borrado casque —eso se ve—, sino
   que se OLVIDE una colección. Alguien añade `terapiaLogs` dentro de seis meses,
   nadie se acuerda de tocar `api/delete-account.ts`, y a partir de ese día todos
   los borrados dejan atrás datos de salud de gente que pidió que se fueran. No
   hay error, no hay aviso, y el incumplimiento es del RGPD y de la 5.1.1.v.

   Estas pruebas leen `firestore.rules` —la única lista completa y siempre
   actualizada de lo que existe— y obligan a que cada colección esté clasificada
   a propósito: o se borra, o se anonimiza, o está declarada abajo como que no
   contiene datos personales del atleta. Añadir una colección sin decidir cuál de
   las tres es, rompe la prueba.
   ═══════════════════════════════════════════════════════════════════════════ */

// Colecciones que NO llevan datos personales del atleta, con el motivo. Cada
// línea es una decisión consciente, no una excepción para que pase la prueba.
const SIN_DATOS_DEL_ATLETA: Record<string, string> = {
  // Catálogos y plantillas del coach: iguales para todo el mundo.
  exercises: 'catálogo global de ejercicios, propiedad del coach',
  foodItems: 'catálogo global de alimentos',
  recipes: 'recetario global',
  maquinas: 'catálogo global de máquinas de gimnasio',
  workouts: 'plantillas de entrenamiento del coach',
  questionnaires: 'plantillas de cuestionario del coach',
  mesocycleTemplates: 'plantillas de mesociclo',
  onboardingTemplates: 'plantillas del formulario de alta',
  challengeTemplates: 'plantillas de reto semanal',
  academyCourses: 'contenido formativo, igual para todos',
  academyLessons: 'contenido formativo, igual para todos',
  resources: 'material descargable del coach',
  knowledgeBase: 'base de conocimiento del asistente de IA',
  // Cosas del coach, no del atleta.
  coachSettings: 'ajustes del propio coach',
  aiAuditLog: 'auditoría de uso de la API, sin datos del atleta y con retención propia',
  // La ficha del atleta no se borra: se reemplaza por una versión anónima
  // dentro del propio endpoint (ver el paso 3), porque el cuadro de mandos
  // cuenta altas y bajas sobre ella.
  user_profiles: 'se anonimiza in situ en el paso 3 del endpoint',
  // Ruido del parseo: `match /databases/{database}/documents` es el bloque raíz.
  databases: 'no es una colección, es el nodo raíz de las reglas',
};

function coleccionesDeLasReglas(): string[] {
  const reglas = readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8');
  const encontradas = new Set<string>();
  for (const linea of reglas.split('\n')) {
    const m = linea.match(/^\s*match \/([a-zA-Z_]+)\//);
    if (m) encontradas.add(m[1]);
  }
  return [...encontradas].sort();
}

const CUBIERTAS = new Set<string>([
  ...POR_ID_EMAIL,
  ...POR_CAMPO,
  ...CRM_A_ANONIMIZAR.map(c => c.coleccion),
  'crmContactos', // se anonimiza aparte, tiene datos personales propios
]);

describe('inventario del borrado de cuenta', () => {
  it('toda colección de firestore.rules está borrada, anonimizada o declarada sin datos del atleta', () => {
    const sinClasificar = coleccionesDeLasReglas().filter(
      c => !CUBIERTAS.has(c) && !(c in SIN_DATOS_DEL_ATLETA)
    );
    expect(
      sinClasificar,
      `Colecciones sin clasificar en el borrado de cuenta: ${sinClasificar.join(', ')}.\n` +
        'Añádelas a POR_ID_EMAIL / POR_CAMPO / CRM_A_ANONIMIZAR en api/delete-account.ts, ' +
        'o a SIN_DATOS_DEL_ATLETA en esta prueba explicando por qué no llevan datos del atleta.'
    ).toEqual([]);
  });

  it('no se declara como "sin datos del atleta" algo que sí se borra', () => {
    // Si una colección aparece en las dos listas, una de las dos miente.
    const enAmbas = [...CUBIERTAS].filter(c => c in SIN_DATOS_DEL_ATLETA);
    expect(enAmbas).toEqual([]);
  });

  it('no hay colecciones repetidas entre las dos estrategias de borrado', () => {
    // Estar en las dos no rompe nada, pero significa que alguien no sabía por
    // cuál se indexa, y eso acaba en un borrado incompleto.
    const repetidas = POR_ID_EMAIL.filter(c => POR_CAMPO.includes(c));
    expect(repetidas).toEqual([]);
  });

  it('cubre las tres carpetas de Storage que declara storage.rules', () => {
    const reglas = readFileSync(resolve(__dirname, '../../storage.rules'), 'utf8');
    const conEmail = new Set<string>();
    for (const linea of reglas.split('\n')) {
      // Solo las rutas que llevan {email}: son las que contienen ficheros de un
      // atleta concreto. `maquinas/{fileName}` no lleva, y no debe borrarse.
      const m = linea.match(/^\s*match \/([a-zA-Z_]+)\/\{email\}\//);
      if (m) conEmail.add(m[1]);
    }
    expect([...conEmail].sort()).toEqual([...PREFIJOS_STORAGE].sort());
  });

  it('las colecciones del CRM que se anonimizan son exactamente las que existen', () => {
    const reglas = readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8');
    const crmEnReglas = new Set<string>();
    for (const linea of reglas.split('\n')) {
      const m = linea.match(/^\s*match \/(crm[a-zA-Z]+)\//);
      if (m) crmEnReglas.add(m[1]);
    }
    const tratadas = new Set([...CRM_A_ANONIMIZAR.map(c => c.coleccion), 'crmContactos']);
    expect([...crmEnReglas].sort()).toEqual([...tratadas].sort());
  });
});
