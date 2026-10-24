/**
 * Atributos de un ejercicio que se deducen de su NOMBRE (E-03).
 *
 * El catálogo (1.037 ejercicios, todos enlazados a CDG) nombra el material y la
 * variante en el propio nombre: «… en multipower», «… + goma», «… unilateral».
 * Esto los saca con reglas explícitas. No inventa: si no reconoce ningún
 * material devuelve `equipment: []` y el script lo lista para revisarlo a mano.
 *
 *  - equipment: material necesario, del conjunto cerrado MATERIALES.
 *  - lateralidad: 'uni' si se trabaja un lado cada vez, si no 'bi'.
 *  - goma: lleva banda elástica.
 *  - guiado: trayectoria fija (máquina, prensa, multipower). La polea NO: su
 *    recorrido lo marca el atleta.
 */

export const MATERIALES = [
  'peso corporal', 'mancuernas', 'barra', 'máquina', 'multipower', 'polea', 'kettlebell', 'banco', 'gomas',
]

const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const tiene = (t, re) => re.test(t)

// Implementos que, nombrados, descartan el «material por defecto» de un
// levantamiento (un press banca con mancuernas no es de barra).
const OTRO_IMPLEMENTO = /mancuerna|multipower|smith|maquina|polea|kettlebell|pesa rusa|goblet|landmine/

const LEVANTAMIENTO_DE_BARRA = /press banca|peso muerto|hip thrust|sentadilla|press militar|press inclinado|remo (?:con barra|pendlay|en t)|buenos dias|good morning|rack pull|spoto|larsen|push press|snatch|clean|jerk|low bar|high bar|zancada con barra/

export function atributosDeEjercicio (nombre) {
  const t = norm(nombre ?? '')
  const eq = new Set()

  if (tiene(t, /multipower|smith/)) eq.add('multipower')
  if (tiene(t, /mancuerna|dumbbell|farmer walk/)) eq.add('mancuernas')
  if (tiene(t, /kettlebell|pesa rusa|goblet/)) eq.add('kettlebell')
  if (tiene(t, /\bgoma|miniband|banda elastica/)) eq.add('gomas')
  if (tiene(t, /polea|face ?pull|jalon|cable|remo gironda|pull ?over|pull through/)) eq.add('polea')
  if (tiene(t, /maquina|prensa|peck deck|pec deck|hack|convergente|pendular|belt squat/)) eq.add('máquina')
  if (tiene(t, /\bbarra\b(?! v\b)|barra z|hexagonal|landmine|low bar|high bar|thruster|board press|pin press|sot press|remo al menton|remo meadows|remo dante|remo en punta|press vikingo|pin squat/)) eq.add('barra')
  else if (tiene(t, LEVANTAMIENTO_DE_BARRA) && !tiene(t, OTRO_IMPLEMENTO)) eq.add('barra')
  if (tiene(t, /\bbanco\b|press banca|hip thrust|spoto|larsen|press inclinado/)) eq.add('banco')
  if (tiene(t, /dominada|\bflexiones\b|^flexion\b|fondos|plancha|crunch|puente|burpee|bird dog|pike|hiperextension|elevacion de talones|l sit|front lever|clamshell|sissy|australiano|extensiones lumbares|mochila|dead bug|v abs|toes to bar|rack chins|dragon flag|muscle up|handstand|planche|hindu|curl nordico|rope climb|rueda abdominal|elevaciones de piernas|anillas|trx|calistenia|curl pelicano|curl copenhage/)
    || (!eq.size && tiene(t, /zancada|step up|sentadilla|bulgara|pistol/))) eq.add('peso corporal')

  const equipment = MATERIALES.filter(m => eq.has(m))
  const lateralidad = tiene(t, /unilateral|alterno|bulgara|b stance|zancada|step up|pistol|a una (?:mano|pierna)|un brazo|una pierna|single/) ? 'uni' : 'bi'
  const goma = eq.has('gomas')
  const guiado = eq.has('multipower') || eq.has('máquina')
  return { equipment, lateralidad, goma, guiado }
}
