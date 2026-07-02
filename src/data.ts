import { Exercise } from './types';

export const SYSTEM_EXERCISES: Omit<Exercise, 'id'>[] = [
  // PIERNAS
  { ownerId: 'system', name: 'Sentadilla con barra',      primaryFocus: 'piernas',        type: 'fuerza',   isCustom: false },
  { ownerId: 'system', name: 'Sentadilla goblet',          primaryFocus: 'piernas',        type: 'fuerza', isCustom: false },
  { ownerId: 'system', name: 'Prensa de piernas',          primaryFocus: 'piernas',        type: 'fuerza', isCustom: false },
  { ownerId: 'system', name: 'Zancadas con mancuernas',    primaryFocus: 'piernas',        type: 'fuerza', isCustom: false },
  { ownerId: 'system', name: 'Extensión de cuádriceps',    primaryFocus: 'piernas',        type: 'fuerza', isCustom: false },
  { ownerId: 'system', name: 'Curl de femoral tumbado',    primaryFocus: 'piernas',        type: 'fuerza', isCustom: false },
  { ownerId: 'system', name: 'Elevación de talones de pie',primaryFocus: 'piernas',        type: 'fuerza', isCustom: false },
  { ownerId: 'system', name: 'Sentadilla búlgara',         primaryFocus: 'piernas',        type: 'fuerza',     isCustom: false },
  // PECHO
  { ownerId: 'system', name: 'Press de banca con barra',   primaryFocus: 'pecho',          type: 'fuerza',   isCustom: false },
  { ownerId: 'system', name: 'Press de banca inclinado',   primaryFocus: 'pecho',          type: 'fuerza',   isCustom: false },
  { ownerId: 'system', name: 'Aperturas con mancuernas',   primaryFocus: 'pecho',          type: 'fuerza',   isCustom: false },
  { ownerId: 'system', name: 'Flexiones',                  primaryFocus: 'pecho',          type: 'fuerza', isCustom: false },
  { ownerId: 'system', name: 'Fondos en paralelas',        primaryFocus: 'pecho',          type: 'fuerza',   isCustom: false },
  // ESPALDA
  { ownerId: 'system', name: 'Peso muerto convencional',   primaryFocus: 'espalda',        type: 'fuerza',     isCustom: false },
  { ownerId: 'system', name: 'Dominadas',                  primaryFocus: 'espalda',        type: 'fuerza',     isCustom: false },
  { ownerId: 'system', name: 'Remo con barra',             primaryFocus: 'espalda',        type: 'fuerza',   isCustom: false },
  { ownerId: 'system', name: 'Remo con mancuerna',         primaryFocus: 'espalda',        type: 'fuerza', isCustom: false },
  { ownerId: 'system', name: 'Jalón al pecho en polea',    primaryFocus: 'espalda',        type: 'fuerza', isCustom: false },
  { ownerId: 'system', name: 'Remo en máquina',            primaryFocus: 'espalda',        type: 'fuerza', isCustom: false },
  // HOMBROS
  { ownerId: 'system', name: 'Press militar con barra',    primaryFocus: 'hombros',        type: 'fuerza',   isCustom: false },
  { ownerId: 'system', name: 'Press de hombros con mancuernas', primaryFocus: 'hombros',  type: 'fuerza', isCustom: false },
  { ownerId: 'system', name: 'Elevaciones laterales',      primaryFocus: 'hombros',        type: 'fuerza', isCustom: false },
  { ownerId: 'system', name: 'Pájaro con mancuernas',      primaryFocus: 'hombros',        type: 'fuerza', isCustom: false },
  // BÍCEPS
  { ownerId: 'system', name: 'Curl de bíceps con barra',   primaryFocus: 'bíceps',         type: 'fuerza', isCustom: false },
  { ownerId: 'system', name: 'Curl de bíceps con mancuernas', primaryFocus: 'bíceps',      type: 'fuerza', isCustom: false },
  { ownerId: 'system', name: 'Curl martillo',              primaryFocus: 'bíceps',         type: 'fuerza', isCustom: false },
  // TRÍCEPS
  { ownerId: 'system', name: 'Extensión de tríceps en polea', primaryFocus: 'tríceps',    type: 'fuerza', isCustom: false },
  { ownerId: 'system', name: 'Press francés (rompecráneos)',  primaryFocus: 'tríceps',    type: 'fuerza',   isCustom: false },
  { ownerId: 'system', name: 'Fondos de tríceps en banco', primaryFocus: 'tríceps',        type: 'fuerza', isCustom: false },
  // CORE
  { ownerId: 'system', name: 'Plancha frontal',            primaryFocus: 'core',           type: 'fuerza', isCustom: false },
  { ownerId: 'system', name: 'Crunch abdominal',           primaryFocus: 'core',           type: 'fuerza', isCustom: false },
  { ownerId: 'system', name: 'Elevación de piernas tumbado', primaryFocus: 'core',         type: 'fuerza',   isCustom: false },
  { ownerId: 'system', name: 'Russian twist',              primaryFocus: 'core',           type: 'fuerza',   isCustom: false },
  { ownerId: 'system', name: 'Rueda abdominal',            primaryFocus: 'core',           type: 'fuerza',     isCustom: false },
  // GLÚTEOS
  { ownerId: 'system', name: 'Hip thrust con barra',       primaryFocus: 'glúteos',        type: 'fuerza',   isCustom: false },
  { ownerId: 'system', name: 'Patada de glúteo en cable',  primaryFocus: 'glúteos',        type: 'fuerza', isCustom: false },
  { ownerId: 'system', name: 'Peso muerto rumano',         primaryFocus: 'glúteos',        type: 'fuerza',   isCustom: false },
  // CARDIO / PLIOMETRÍA / CUERPO COMPLETO
  { ownerId: 'system', name: 'Burpees',                    primaryFocus: 'cuerpo completo',type: 'pliometría',   isCustom: false },
  { ownerId: 'system', name: 'Saltos al cajón (Box jump)', primaryFocus: 'piernas',        type: 'pliometría',   isCustom: false },
  { ownerId: 'system', name: 'Cuerda de saltar',           primaryFocus: 'cardio',         type: 'cardio', isCustom: false },
];

